import { state, TOOL_DEFS } from './state.js';
import { getCanvasBg } from './theme.js';
import { densify, wob } from './wiggle.js';

/**
 * Loop de render que dá "vida" ao RetroBit.
 *
 * Duas cadências independentes:
 *  - REPAINT: a cada frame de rAF (~60fps) → o traço que estás a desenhar
 *    aparece instantaneamente (sem lag).
 *  - TREMOR: o `jitterFrame` só avança a cada ~85ms (~12fps) → o desenho
 *    treme ao ritmo lento e charmoso do WigglyPaint.
 *
 * Quando não estás a desenhar, só repintamos quando o tremor muda — poupa CPU.
 */
export class Renderer {
  constructor(engine) {
    this.engine = engine;
    this.jitterInterval = 85; // ms entre "tremidas" → ~12fps
    this.lastJitter = 0;
    this.jitterFrame = 0;
    this.running = false;
    this.needsDraw = true;
  }

  start() {
    if (this.running) return;
    this.running = true;
    requestAnimationFrame((t) => this._loop(t));
  }

  stop() {
    this.running = false;
  }

  /** Força um repaint no próximo frame (ex.: após undo, mudar de cor…). */
  invalidate() {
    this.needsDraw = true;
  }

  _loop(t) {
    if (!this.running) return;
    requestAnimationFrame((x) => this._loop(x));

    let jitterChanged = false;
    if (t - this.lastJitter >= this.jitterInterval) {
      this.jitterFrame++;
      this.lastJitter = t;
      jitterChanged = true;
    }

    // Enquanto se desenha → repinta sempre (fluido). Parado → só quando treme.
    if (state.isDrawing || jitterChanged || this.needsDraw) {
      this._draw();
      this.needsDraw = false;
    }
  }

  _draw() {
    const ctx = this.engine.ctx;
    this.engine.fillBackground();
    for (const path of state.paths) this._drawPath(ctx, path);
  }

  /** Avança um passo de tremor e redesenha — usado para capturar frames do GIF. */
  stepFrame() {
    this.jitterFrame++;
    this._draw();
  }

  _drawPath(ctx, path) {
    const def = TOOL_DEFS[path.tool] || TOOL_DEFS.pen;
    const color = def.eraser ? getCanvasBg() : path.color;
    const f = this.jitterFrame;

    if (def.spray) {
      this._drawSpray(ctx, path, color, def, f);
      return;
    }

    if (!path.points.length) return;

    const dense = densify(path.points, 3);
    const amp = def.amp;
    // Offset determinístico → estável dentro do mesmo jitterFrame, sem buracos.
    const jp = dense.map((pt) => ({
      x: pt.x + wob(pt.x, pt.y, f) * amp,
      y: pt.y + wob(pt.y, pt.x, f + 19.3) * amp,
      p: pt.p,
    }));

    let composite = def.composite;
    if (def.marker && state.theme === 'dark') composite = 'screen';

    ctx.save();
    ctx.globalAlpha = def.alpha * (path.opacity ?? 1);
    ctx.globalCompositeOperation = composite;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineCap = def.cap;
    ctx.lineJoin = 'round';

    if (def.pressure) {
      for (let i = 1; i < jp.length; i++) {
        const a = jp[i - 1];
        const b = jp[i];
        const pr = (a.p + b.p) / 2;
        ctx.lineWidth = Math.max(1, path.size * (0.3 + pr * 1.4));
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    } else {
      ctx.lineWidth = path.size;
      ctx.beginPath();
      jp.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)));
      ctx.stroke();
    }

    // Ponto único (clique sem arrastar).
    if (jp.length === 1) {
      ctx.beginPath();
      ctx.arc(jp[0].x, jp[0].y, Math.max(1, path.size / 2), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawSpray(ctx, path, color, def, f) {
    if (!path.particles || !path.particles.length) return;
    ctx.save();
    ctx.globalAlpha = def.alpha * (path.opacity ?? 1);
    ctx.fillStyle = color;
    for (const q of path.particles) {
      const x = (q.x + wob(q.x, q.y, f) * def.amp) | 0;
      const y = (q.y + wob(q.y, q.x, f + 7.1) * def.amp) | 0;
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.restore();
  }
}
