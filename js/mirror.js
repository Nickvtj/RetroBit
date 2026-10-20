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
