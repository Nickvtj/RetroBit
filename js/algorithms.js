export function colorsMatch(a, b, tolerance = 8) {
  return (
    Math.abs(a[0] - b[0]) <= tolerance &&
    Math.abs(a[1] - b[1]) <= tolerance &&
    Math.abs(a[2] - b[2]) <= tolerance &&
    Math.abs(a[3] - b[3]) <= tolerance
  );
}

export function hexToRgba(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

export function rgbaToHex(r, g, b) {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

export function getPixel(imageData, x, y) {
  const i = (y * imageData.width + x) * 4;
  const d = imageData.data;
  return [d[i], d[i + 1], d[i + 2], d[i + 3]];
}

export function setPixel(imageData, x, y, rgba) {
  const i = (y * imageData.width + x) * 4;
  const d = imageData.data;
  d[i] = rgba[0];
  d[i + 1] = rgba[1];
  d[i + 2] = rgba[2];
  d[i + 3] = rgba[3];
}

export function floodFill(imageData, startX, startY, fillRgba, tolerance = 12) {
  const { width, height, data } = imageData;
  const sx = Math.floor(startX);
  const sy = Math.floor(startY);
  if (sx < 0 || sy < 0 || sx >= width || sy >= height) return;

  const target = getPixel(imageData, sx, sy);
  if (colorsMatch(target, fillRgba)) return;

  const stack = [[sx, sy]];
  const visited = new Uint8Array(width * height);

  while (stack.length) {
    const [x, y] = stack.pop();
    const key = y * width + x;
    if (visited[key]) continue;
    visited[key] = 1;

    const current = getPixel(imageData, x, y);
    if (!colorsMatch(current, target, tolerance)) continue;

    setPixel(imageData, x, y, fillRgba);

    if (x > 0) stack.push([x - 1, y]);
    if (x < width - 1) stack.push([x + 1, y]);
    if (y > 0) stack.push([x, y - 1]);
    if (y < height - 1) stack.push([x, y + 1]);
  }
}

export function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x, yi = points[i].y;
    const xj = points[j].x, yj = points[j].y;
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function drawQuadraticCurve(ctx, x0, y0, cx, cy, x1, y1) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(cx - x0), Math.abs(cy - y0)) * 2;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    const x = u * u * x0 + 2 * u * t * cx + t * t * x1;
    const y = u * u * y0 + 2 * u * t * cy + t * t * y1;
    ctx.lineTo(x, y);
  }
  ctx.stroke();
}

export function drawBezierCurve(ctx, x0, y0, c1x, c1y, c2x, c2y, x1, y1) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.bezierCurveTo(c1x, c1y, c2x, c2y, x1, y1);
  ctx.stroke();
}
