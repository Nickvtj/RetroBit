/**
 * Transformações afins de traços (mover, esticar, girar, espelhar).
 *
 * Matriz [a, b, c, d, e, f]:  x' = a·x + c·y + e   ·   y' = b·x + d·y + f
 * Nunca altera o traço original: devolve uma cópia (os traços são partilhados
 * com o histórico).
 */
import { shapeOutline } from './shapes.js';
import { remapMask } from './fill.js';
import { mirrorFlips } from './mirror.js';

export const translate = (dx, dy) => [1, 0, 0, 1, dx, dy];

export function scaleAround(sx, sy, cx, cy) {
  return [sx, 0, 0, sy, cx - sx * cx, cy - sy * cy];
}

export function rotateAround(angle, cx, cy) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy];
}

export function invert([a, b, c, d, e, f]) {
  const det = a * d - b * c;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

export function applyM(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

const hasRotation = (m) => Math.abs(m[1]) > 1e-9 || Math.abs(m[2]) > 1e-9;

function transformMask(mask, m) {
  // Só deslocamento → muda a posição (arredondada ao pixel), sem reamostrar.
  if (!hasRotation(m) && m[0] === 1 && m[3] === 1) {
    return { ...mask, x: mask.x + Math.round(m[4]), y: mask.y + Math.round(m[5]) };
  }
  const corners = [[mask.x, mask.y], [mask.x + mask.w, mask.y], [mask.x, mask.y + mask.h], [mask.x + mask.w, mask.y + mask.h]]
    .map(([x, y]) => applyM(m, x, y));
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const box = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  const inv = invert(m);
  return remapMask(mask, (x, y) => applyM(inv, x, y), box) || mask;
}

/** Cópia de `p` transformada por `m`. */
export function transformPathM(p, m, extra = {}) {
  const out = { ...p, ...extra };
  const pt = (q) => {
    const [x, y] = applyM(m, q.x, q.y);
    return { ...q, x, y };
  };
  if (p.mask) {
    out.mask = transformMask(p.mask, m);
    return out;
  }
  if (p.cells) {
    // Pixel-art: leva o centro de cada célula e volta a encaixar na grade.
    const g = p.grid;
    const cells = new Map();
    for (const [cx, cy] of p.cells) {
      const [x, y] = applyM(m, (cx + 0.5) * g, (cy + 0.5) * g);
      const cell = [Math.floor(x / g), Math.floor(y / g)];
      cells.set(cell.join(), cell);
    }
    out.cells = [...cells.values()];
    return out;
  }
  if (p.shape) {
    if (p.shape === 'line' || (p.shape !== 'poly' && !hasRotation(m))) {
      [out.x0, out.y0] = applyM(m, p.x0, p.y0);
      [out.x1, out.y1] = applyM(m, p.x1, p.y1);
    } else {
      // Retângulo/elipse girados deixam de ser "caixas": passam a polígono.
      out.shape = 'poly';
      out.points = (p.shape === 'poly' ? p.points : shapeOutline(p)).map(pt);
    }
  }
  if (out.shape !== 'poly') out.points = (p.points || []).map(pt);
  out.particles = p.particles ? p.particles.map(pt) : null;
  const det = Math.abs(m[0] * m[3] - m[1] * m[2]);
  if (p.size && Math.abs(det - 1) > 1e-6) out.size = Math.max(1, p.size * Math.sqrt(det));
  return out;
}

/** Traço espelhado → cópias reais, uma por lado (sem espelho). */
export function mirrorCopies(p, W, H) {
  if (!p.mirrorH && !p.mirrorV) return [p];
  return mirrorFlips(p.mirrorH, p.mirrorV).map(({ flipX, flipY }) => transformPathM(
    p,
    [flipX ? -1 : 1, 0, 0, flipY ? -1 : 1, flipX ? W : 0, flipY ? H : 0],
    { mirrorH: false, mirrorV: false },
  ));
}
