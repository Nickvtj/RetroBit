/**
 * Traço tremido (wiggly) — base para todas as ferramentas.
 */

export function wiggleOffset(x, y, t, amplitude) {
  const a = amplitude ?? 3;
  return {
    x: x + Math.sin(t * 17.3 + y * 0.21) * a + Math.cos(t * 11.7 + x * 0.09) * a * 0.6,
    y: y + Math.cos(t * 13.9 + x * 0.16) * a + Math.sin(t * 9.1 + y * 0.11) * a * 0.6,
  };
}

export function interpolateWigglyLine(ctx, x0, y0, x1, y1, opts = {}) {
  const {
    color = '#000',
    width = 2,
    amplitude = 2,
    alpha = 1,
    seed = 0,
    cap = 'round',
    composite = 'source-over',
  } = opts;

  const dist = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(2, Math.ceil(dist / 2));

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = cap;
  ctx.lineJoin = 'round';
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = composite;
  ctx.beginPath();

  for (let i = 0; i <= steps; i++) {
    const t = seed + i * 0.4;
    const u = i / steps;
    const bx = x0 + (x1 - x0) * u;
    const by = y0 + (y1 - y0) * u;
    const w = wiggleOffset(bx, by, t, amplitude);
    if (i === 0) ctx.moveTo(w.x, w.y);
    else ctx.lineTo(w.x, w.y);
  }

  ctx.stroke();
  ctx.restore();
}

export function wigglySpray(ctx, x, y, opts = {}) {
  const {
    color = '#000',
    radius = 8,
    density = 14,
    amplitude = 3,
    alpha = 0.35,
    seed = 0,
  } = opts;

  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;

  for (let i = 0; i < density; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * radius;
    const bx = x + Math.cos(angle) * dist;
    const by = y + Math.sin(angle) * dist;
    const w = wiggleOffset(bx, by, seed + i * 0.7, amplitude * 0.4);
    ctx.fillRect(Math.floor(w.x), Math.floor(w.y), 1, 1);
  }

  ctx.restore();
}

export function wigglyDot(ctx, x, y, opts = {}) {
  const { color = '#000', size = 3, amplitude = 1.5, seed = 0 } = opts;
  const w = wiggleOffset(x, y, seed, amplitude);
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(w.x, w.y, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
