/**
 * Encoder de GIF89a animado em vanilla JS (sem libs).
 *
 *  - Paleta global adaptada ao desenho: até 256 cores, escolhidas pelas mais
 *    usadas em todos os quadros (contadas em 5 bits por canal) — as cores das
 *    canetas saem fiéis, sem faixas.
 *  - Compressão LZW de verdade (dicionário até 4096 códigos, como o formato
 *    prevê) → ficheiros muitas vezes menores, bons para mandar em conversas.
 */

const MAX_COLORS = 256;

/** Cor RGB → chave de 15 bits (5 por canal). */
const key15 = (r, g, b) => ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);

/** As cores mais usadas em todos os quadros (média dos pixels de cada "caixinha" de 5 bits). */
function buildPalette(frames) {
  const count = new Uint32Array(32768);
  const sum = new Float64Array(32768 * 3);
  for (const rgba of frames) {
    for (let p = 0; p < rgba.length; p += 4) {
      const k = key15(rgba[p], rgba[p + 1], rgba[p + 2]);
      count[k]++;
      sum[k * 3] += rgba[p];
      sum[k * 3 + 1] += rgba[p + 1];
      sum[k * 3 + 2] += rgba[p + 2];
    }
  }
  const used = [];
  for (let k = 0; k < 32768; k++) if (count[k]) used.push(k);
  used.sort((a, b) => count[b] - count[a]);
  return used.slice(0, MAX_COLORS).map((k) => [
    Math.round(sum[k * 3] / count[k]), Math.round(sum[k * 3 + 1] / count[k]), Math.round(sum[k * 3 + 2] / count[k]),
  ]);
}

/** Índice da cor da paleta mais próxima (com memória por chave de 15 bits). */
function makeMapper(palette) {
  const memo = new Int16Array(32768).fill(-1);
  return (r, g, b) => {
    const k = key15(r, g, b);
    if (memo[k] >= 0) return memo[k];
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const [pr, pg, pb] = palette[i];
      const d = (pr - r) ** 2 * 2 + (pg - g) ** 2 * 4 + (pb - b) ** 2 * 3; // pesos aproximados da visão
      if (d < bestD) { bestD = d; best = i; }
    }
    memo[k] = best;
    return best;
  };
}

/** Compressão LZW de tamanho de código variável (GIF), escrita em bits LSB-first. */
function lzw(minCode, idx) {
  const clear = 1 << minCode;
  const eoi = clear + 1;
  const out = [];
  let acc = 0;
  let nb = 0;
  let codeSize = minCode + 1;
  let maxcode = (1 << codeSize) - 1;
  let next = eoi + 1;
  let clearFlag = false;
  const dict = new Map();

  const output = (code) => {
    acc |= code << nb;
    nb += codeSize;
    while (nb >= 8) { out.push(acc & 255); acc >>>= 8; nb -= 8; }
    if (clearFlag) {
      codeSize = minCode + 1;
      maxcode = (1 << codeSize) - 1;
      clearFlag = false;
    } else if (next > maxcode && codeSize < 12) {
      codeSize++;
      maxcode = codeSize === 12 ? 4096 : (1 << codeSize) - 1;
    }
  };

  output(clear);
  let prefix = idx[0];
  for (let i = 1; i < idx.length; i++) {
    const k = idx[i];
    const key = (prefix << 8) | k;
    const code = dict.get(key);
    if (code !== undefined) { prefix = code; continue; }
    output(prefix);
    if (next < 4096) {
      dict.set(key, next++);
    } else {
      // Dicionário cheio: recomeça (código Clear).
      dict.clear();
      next = eoi + 1;
      clearFlag = true;
      output(clear);
    }
    prefix = k;
  }
  output(prefix);
  output(eoi);
  if (nb > 0) out.push(acc & 255);
  return out;
}

/**
 * @param {Uint8ClampedArray[]} frames  cada frame = RGBA (w*h*4)
 * @param {number} w, h
 * @param {number} delayCs  atraso por frame em centésimos de segundo
 * @returns {Uint8Array}
 */
export function encodeGIF(frames, w, h, delayCs) {
  const bytes = [];
  const b = (v) => bytes.push(v & 255);
  const w16 = (v) => { bytes.push(v & 255); bytes.push((v >> 8) & 255); };
  const str = (s) => { for (let i = 0; i < s.length; i++) b(s.charCodeAt(i)); };

  const palette = buildPalette(frames);
  const toIndex = makeMapper(palette);

  str('GIF89a');
  w16(w); w16(h);
  b(0xF7); // tabela global, 256 cores
  b(0);    // índice de fundo
  b(0);    // aspect ratio
  for (let i = 0; i < 256; i++) {
    const c = palette[i] || [0, 0, 0];
    b(c[0]); b(c[1]); b(c[2]);
  }

  // loop infinito (NETSCAPE2.0)
  b(0x21); b(0xFF); b(0x0B); str('NETSCAPE2.0'); b(0x03); b(0x01); w16(0); b(0x00);

  for (const rgba of frames) {
    b(0x21); b(0xF9); b(0x04); b(0x00); w16(delayCs); b(0x00); b(0x00); // GCE
    b(0x2C); w16(0); w16(0); w16(w); w16(h); b(0x00);                  // image descriptor

    const n = w * h;
    const idx = new Uint8Array(n);
    for (let i = 0, p = 0; i < n; i++, p += 4) idx[i] = toIndex(rgba[p], rgba[p + 1], rgba[p + 2]);

    b(8); // min code size
    const data = lzw(8, idx);
    for (let i = 0; i < data.length;) {
      const len = Math.min(255, data.length - i);
      b(len);
      for (let j = 0; j < len; j++) b(data[i + j]);
      i += len;
    }
    b(0x00);
  }

  b(0x3B); // trailer
  return new Uint8Array(bytes);
}
