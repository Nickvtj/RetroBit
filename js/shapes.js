/** Pontos do perímetro de uma forma (coordenadas lógicas). */
export function shapeOutline(path) {
  const { x0, y0, x1, y1, shape } = path;
  if (shape === 'line') {
    return [{ x: x0, y: y0 }, { x: x1, y: y1 }];
  }
  const left = Math.min(x0, x1);
  const right = Math.max(x0, x1);
  const top = Math.min(y0, y1);
  const bottom = Math.max(y0, y1);
  if (shape === 'ellipse') {
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;
    const rx = Math.max(0.5, (right - left) / 2);
    const ry = Math.max(0.5, (bottom - top) / 2);
    const pts = [];
    const n = 36;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
    }
    return pts;
  }
  return [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
    { x: left, y: top },
  ];
}

export function shapeTooSmall(path) {
  const { x0, y0, x1, y1, shape } = path;
  if (shape === 'line') return Math.hypot(x1 - x0, y1 - y0) < 4;
  return Math.abs(x1 - x0) < 4 && Math.abs(y1 - y0) < 4;
}

export function drawShapePreview(ctx, draft, strokeColor) {
  const { x0, y0, x1, y1, shape } = draft;
  const left = Math.min(x0, x1);
  const right = Math.max(x0, x1);
  const top = Math.min(y0, y1);
  const bottom = Math.max(y0, y1);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.save();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 4]);
  if (shape === 'rect') {
    ctx.strokeRect(left + 0.5, top + 0.5, right - left, bottom - top);
  } else if (shape === 'ellipse') {
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;
    const rx = Math.max(0.5, (right - left) / 2);
    const ry = Math.max(0.5, (bottom - top) / 2);
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
}
