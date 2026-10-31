/**
 * "O que está debaixo deste ponto?" — teste geométrico sobre os traços (sem
 * tremor). Usado pelo balde (trocar a cor de um traço) e pela luva (selecionar).
 */
import { state, TOOL_DEFS } from './state.js';
import { mirrorFlips, mapX, mapY } from './mirror.js';
import { shapeOutline } from './shapes.js';
import { maskContains } from './fill.js';

function distToSegment(px, py, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / len2)) : 0;
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

function nearPolyline(pts, x, y, radius) {
  if (pts.length === 1) return Math.hypot(x - pts[0].x, y - pts[0].y) <= radius;
  for (let i = 1; i < pts.length; i++) {
    if (distToSegment(x, y, pts[i - 1], pts[i]) <= radius) return true;
  }
  return false;
}

/** O ponto (x, y) — já sem espelho — cai em cima do traço `p`? */
function touches(p, def, x, y, slop) {
  if (p.mask) return maskContains(p.mask, x, y);
  if (p.cells) {
    const g = p.grid;
    return p.cells.some(([cx, cy]) => x >= cx * g && x < (cx + 1) * g && y >= cy * g && y < (cy + 1) * g);
  }
  if (def.spray) {
    const r = Math.max(1.5, slop);
    return (p.particles || []).some((q) => Math.abs(q.x - x) <= r && Math.abs(q.y - y) <= r);
  }
  if (p.shape) return nearPolyline(shapeOutline(p), x, y, p.size / 2 + slop);
  if (!p.points?.length) return false;
  // Traços com pressão: a largura varia ponto a ponto.
  const half = def.pressure ? p.size * (0.3 + 1.4 * Math.max(...p.points.map((q) => q.p ?? 0.5))) / 2 : p.size / 2;
  return nearPolyline(p.points, x, y, half + slop);
}

/**
 * Traço de cima que está em `pos` na camada. Devolve { index, flip } ou null.
 * Uma borracha por cima do ponto "esconde" o que está por baixo → null.
 */
export function hitTest(layer, pos, { slop = 0, fills = true } = {}) {
  const W = state.canvasWidth;
  const H = state.canvasHeight;
  for (let i = layer.paths.length - 1; i >= 0; i--) {
    const p = layer.paths[i];
    const def = TOOL_DEFS[p.tool] || TOOL_DEFS.pen;
    if (p.mask && !fills) continue;
    for (const flip of mirrorFlips(p.mirrorH, p.mirrorV)) {
      // O espelho é uma involução: espelhar o ponto = testar a cópia espelhada.
      const x = mapX(pos.x, W, flip.flipX);
      const y = mapY(pos.y, H, flip.flipY);
      if (!touches(p, def, x, y, def.eraser ? 0 : slop)) continue;
      return def.eraser ? null : { index: i, flip };
    }
  }
  return null;
}

/** Caixa envolvente de um traço (sem espelho), em coordenadas da tela. */
export function pathBounds(p) {
  if (p.mask) return { x: p.mask.x, y: p.mask.y, w: p.mask.w, h: p.mask.h };
  if (p.cells) {
    const xs = p.cells.map((c) => c[0]);
    const ys = p.cells.map((c) => c[1]);
    const g = p.grid;
    const x0 = Math.min(...xs) * g;
    const y0 = Math.min(...ys) * g;
    return { x: x0, y: y0, w: (Math.max(...xs) + 1) * g - x0, h: (Math.max(...ys) + 1) * g - y0 };
  }
  const pts = p.shape ? shapeOutline(p) : (p.particles?.length ? p.particles : p.points) || [];
  if (!pts.length) return null;
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const q of pts) {
    if (q.x < x0) x0 = q.x;
    if (q.y < y0) y0 = q.y;
    if (q.x > x1) x1 = q.x;
    if (q.y > y1) y1 = q.y;
  }
  const pad = (p.size || 1) / 2;
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
}
