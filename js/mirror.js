/** Posições espelhadas no canvas (eixo vertical = H, eixo horizontal = V). */
export function mirrorPositions(x, y, w, h, mirrorH, mirrorV) {
  const pts = [{ x, y }];
  if (mirrorH) pts.push({ x: w - x, y });
  if (mirrorV) pts.push({ x, y: h - y });
  if (mirrorH && mirrorV) pts.push({ x: w - x, y: h - y });
  const seen = new Set();
  return pts.filter((p) => {
    const k = `${Math.round(p.x * 10)},${Math.round(p.y * 10)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Combinações de espelho para redesenhar um traço. */
export function mirrorFlips(mirrorH, mirrorV) {
  const out = [{ flipX: false, flipY: false }];
  if (mirrorH) out.push({ flipX: true, flipY: false });
  if (mirrorV) out.push({ flipX: false, flipY: true });
  if (mirrorH && mirrorV) out.push({ flipX: true, flipY: true });
  return out;
}

export function mapX(x, w, flipX) {
  return flipX ? w - x : x;
}

export function mapY(y, h, flipY) {
  return flipY ? h - y : y;
}
