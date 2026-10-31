/**
 * Balde de tinta: preenchimento por região sobre a imagem "parada" (o desenho
 * sem tremor), e as máscaras que guardam o resultado.
 *
 * Uma máscara é { x, y, w, h, runs }: caixa envolvente + faixas por linha
 * (runs = [linha, início, comprimento, …], relativas à caixa) — compacta para
 * salvar e fácil de redesenhar.
 *
 * Para as linhas poderem tremer sem abrir frestas brancas, a região cresce
 * RING px para DENTRO das linhas que a fecham, e o preenchimento é desenhado
 * POR BAIXO do que já está na camada (destination-over, ver renderer.js).
 */

const TOLERANCE = 40; // diferença máx. por canal para "mesma cor" (absorve o antisserrilhado)
const RING = 3;       // px que o preenchimento entra por baixo das linhas

function sameColor(data, o, r, g, b) {
  return Math.abs(data[o] - r) <= TOLERANCE
    && Math.abs(data[o + 1] - g) <= TOLERANCE
    && Math.abs(data[o + 2] - b) <= TOLERANCE;
}

/**
 * Região a pintar a partir de `seeds` (pixels inteiros) na imagem `img`.
 * Cada semente usa a cor que tem por baixo (com espelho, os lados podem diferir).
 * Devolve { mask, core, dist, maxDist, box } ou null se não houver nada a pintar.
 *   core → pixels da região (sem a borda por baixo das linhas)
 *   dist → passos desde a semente (para a animação de "tinta a espalhar")
 */
export function fillRegion(img, seeds) {
  const { data, width: w, height: h } = img;
  const n = w * h;
  const core = new Uint8Array(n);
  const dist = new Int32Array(n);
  const queue = new Int32Array(n);
  let maxDist = 0;
  let count = 0;

  for (const s of seeds) {
    if (s.x < 0 || s.y < 0 || s.x >= w || s.y >= h) continue;
    const start = s.y * w + s.x;
    if (core[start]) continue;
    const o = start * 4;
    const r = data[o]; const g = data[o + 1]; const b = data[o + 2];
    let head = 0;
    let tail = 0;
    core[start] = 1;
    dist[start] = 0;
    queue[tail++] = start;
    while (head < tail) {
      const i = queue[head++];
      const x = i % w;
      const d = dist[i] + 1;
      const visit = (j) => {
        if (core[j] || !sameColor(data, j * 4, r, g, b)) return;
        core[j] = 1;
        dist[j] = d;
        if (d > maxDist) maxDist = d;
        queue[tail++] = j;
      };
      if (x > 0) visit(i - 1);
      if (x < w - 1) visit(i + 1);
      if (i >= w) visit(i - w);
      if (i < n - w) visit(i + w);
    }
    count += tail;
  }
  if (!count) return null;

  // Borda: cresce RING px (8 vizinhos) para dentro do que NÃO é região — as linhas.
  const mask = core.slice();
  let frontier = [];
  for (let i = 0; i < n; i++) if (core[i]) frontier.push(i);
  for (let step = 0; step < RING; step++) {
    const next = [];
    for (const i of frontier) {
      const x = i % w;
      const y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const j = yy * w + xx;
          if (!mask[j]) { mask[j] = 1; next.push(j); }
        }
      }
    }
    frontier = next;
  }

  const encoded = encodeMask(mask, w, h);
  return { mask: encoded, core, dist, maxDist, box: encoded };
}

/** Bitmap global (w×h) → máscara compacta. */
export function encodeMask(bits, w, h) {
  let x0 = w; let y0 = h; let x1 = -1; let y1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (!bits[row + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      y1 = y;
    }
  }
  if (x1 < 0) return null;
  const runs = [];
  for (let y = y0; y <= y1; y++) {
    const row = y * w;
    for (let x = x0; x <= x1;) {
      if (!bits[row + x]) { x++; continue; }
      const start = x;
      while (x <= x1 && bits[row + x]) x++;
      runs.push(y - y0, start - x0, x - start);
    }
  }
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, runs };
}

/** Máscara → bitmap local (mask.w × mask.h). */
export function decodeMask(mask) {
  const bits = new Uint8Array(mask.w * mask.h);
  const { runs } = mask;
  for (let k = 0; k < runs.length; k += 3) {
    const row = runs[k] * mask.w + runs[k + 1];
    bits.fill(1, row, row + runs[k + 2]);
  }
  return bits;
}

export function maskContains(mask, x, y) {
  const ly = Math.floor(y) - mask.y;
  const lx = Math.floor(x) - mask.x;
  if (lx < 0 || ly < 0 || lx >= mask.w || ly >= mask.h) return false;
  const { runs } = mask;
  for (let k = 0; k < runs.length; k += 3) {
    if (runs[k] === ly && lx >= runs[k + 1] && lx < runs[k + 1] + runs[k + 2]) return true;
  }
  return false;
}

/** `a` sem os pixels de `b`. Devolve `a` se não se tocam, ou null se não sobrar nada. */
export function subtractMask(a, b) {
  if (b.x >= a.x + a.w || b.x + b.w <= a.x || b.y >= a.y + a.h || b.y + b.h <= a.y) return a;
  const bits = decodeMask(a);
  let changed = false;
  const { runs } = b;
  for (let k = 0; k < runs.length; k += 3) {
    const y = b.y + runs[k] - a.y;
    if (y < 0 || y >= a.h) continue;
    const from = Math.max(0, b.x + runs[k + 1] - a.x);
    const to = Math.min(a.w, b.x + runs[k + 1] + runs[k + 2] - a.x);
    for (let x = from; x < to; x++) {
      if (bits[y * a.w + x]) { bits[y * a.w + x] = 0; changed = true; }
    }
  }
  if (!changed) return a;
  const m = encodeMask(bits, a.w, a.h);
  return m && { ...m, x: m.x + a.x, y: m.y + a.y };
}

/**
 * Máscara transformada: `inv(x, y)` leva um pixel do destino ao pixel de
 * origem (amostragem pelo vizinho mais próximo — fica pixelado, de propósito).
 * `box` é a caixa do destino em coordenadas da tela.
 */
export function remapMask(mask, inv, box) {
  const src = decodeMask(mask);
  const x0 = Math.floor(box.x); const y0 = Math.floor(box.y);
  const w = Math.max(1, Math.ceil(box.x + box.w) - x0);
  const h = Math.max(1, Math.ceil(box.y + box.h) - y0);
  const bits = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [sx, sy] = inv(x0 + x + 0.5, y0 + y + 0.5);
      const lx = Math.floor(sx) - mask.x;
      const ly = Math.floor(sy) - mask.y;
      if (lx >= 0 && ly >= 0 && lx < mask.w && ly < mask.h && src[ly * mask.w + lx]) bits[y * w + x] = 1;
    }
  }
  const m = encodeMask(bits, w, h);
  return m && { ...m, x: m.x + x0, y: m.y + y0 };
}

const canvasCache = new WeakMap(); // máscara → canvas pintado (as máscaras são imutáveis)

/** Canvas do tamanho da máscara, pintado com `color` (opaco; a opacidade vem do globalAlpha). */
export function maskCanvas(mask, color) {
  let entry = canvasCache.get(mask);
  if (entry?.color === color) return entry.canvas;
  const c = document.createElement('canvas');
  c.width = mask.w;
  c.height = mask.h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  const { runs } = mask;
  for (let k = 0; k < runs.length; k += 3) ctx.fillRect(runs[k + 1], runs[k], runs[k + 2], 1);
  entry = { color, canvas: c };
  canvasCache.set(mask, entry);
  return c;
}
