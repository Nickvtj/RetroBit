/**
 * Base geométrica do traço tremido (wiggly).
 *
 * Chave para a fluidez: o "tremor" é DETERMINÍSTICO — dado (x, y, frame)
 * devolve sempre o mesmo offset. Assim o renderer pode repintar a 60fps
 * (input fluido) enquanto o `frame` só muda a ~12fps (tremor lento e retro).
 * Nada de Math.random por frame, que faria o traço "ferver".
 */

/** Pseudo-aleatório determinístico em [-1, 1] a partir de (x, y, frame). */
export function wob(x, y, frame) {
  const s = Math.sin(x * 12.9898 + y * 78.233 + frame * 0.7) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

/**
 * Densifica um path: insere pontos intermédios de forma a que nunca haja
 * mais do que `step` px entre amostras. Sem isto, traços rápidos ficariam
 * com segmentos retos longos e o wiggle não teria "ondulação".
 */
export function densify(points, step = 3) {
  if (points.length < 2) return points.slice();
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.round(dist / step));
    for (let s = 0; s < n; s++) {
      const u = s / n;
      out.push({
        x: a.x + (b.x - a.x) * u,
        y: a.y + (b.y - a.y) * u,
        p: (a.p ?? 0.5) + ((b.p ?? 0.5) - (a.p ?? 0.5)) * u,
      });
    }
  }
  out.push(points[points.length - 1]);
  return out;
}
