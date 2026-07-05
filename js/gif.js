/**
 * Encoder de GIF89a animado em vanilla JS (sem libs).
 *
 * Paleta global fixa "web-safe" de 216 cores (6×6×6). Usa a variante de LZW
 * "não comprimida" (emite um Clear code periódico antes do dicionário crescer),
 * o que mantém o code size constante e evita os bugs clássicos de LZW — os
 * ficheiros ficam um pouco maiores, o que é irrelevante para um GIF curto.
 */

const LEVELS = [0, 51, 102, 153, 204, 255];

function quantIndex(r, g, b) {
  const ri = Math.round(r / 51);
  const gi = Math.round(g / 51);
  const bi = Math.round(b / 51);
  return ri * 36 + gi * 6 + bi; // 0..215
}

function lzwUncompressed(minCode, idx) {
  const clear = 1 << minCode;
  const eoi = clear + 1;
  const codeSize = minCode + 1;
  const out = [];
  let acc = 0;
  let nb = 0;
  const emit = (code) => {
    acc |= code << nb;
    nb += codeSize;
    while (nb >= 8) { out.push(acc & 255); acc >>>= 8; nb -= 8; }
  };
  const maxRun = clear - 2;
  emit(clear);
  let count = 0;
  for (let i = 0; i < idx.length; i++) {
    if (count === maxRun) { emit(clear); count = 0; }
    emit(idx[i]);
    count++;
  }
  emit(eoi);
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

  str('GIF89a');
  w16(w); w16(h);
  b(0xF7); // tabela global, 256 cores
  b(0);    // índice de fundo
  b(0);    // aspect ratio

  for (let ri = 0; ri < 6; ri++) for (let gi = 0; gi < 6; gi++) for (let bi = 0; bi < 6; bi++) {
    b(LEVELS[ri]); b(LEVELS[gi]); b(LEVELS[bi]);
  }
  for (let i = 216; i < 256; i++) { b(0); b(0); b(0); } // padding

  // loop infinito (NETSCAPE2.0)
  b(0x21); b(0xFF); b(0x0B); str('NETSCAPE2.0'); b(0x03); b(0x01); w16(0); b(0x00);

  for (const rgba of frames) {
    b(0x21); b(0xF9); b(0x04); b(0x00); w16(delayCs); b(0x00); b(0x00); // GCE
    b(0x2C); w16(0); w16(0); w16(w); w16(h); b(0x00);                  // image descriptor

    const n = w * h;
    const idx = new Uint8Array(n);
    for (let i = 0, p = 0; i < n; i++, p += 4) idx[i] = quantIndex(rgba[p], rgba[p + 1], rgba[p + 2]);

    b(8); // min code size
    const data = lzwUncompressed(8, idx);
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
