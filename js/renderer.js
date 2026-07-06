import { state, TOOL_DEFS, getActiveLayer } from './state.js';
import { getCanvasBg } from './theme.js';
import { densify, wob } from './wiggle.js';
import { mirrorFlips, mapX, mapY } from './mirror.js';
import { shapeOutline } from './shapes.js';

const MIN_POINT_STEP = 2;

/**
 * Loop de render — tremor ~12fps; traço ativo repintado em fast-path (~60fps).
 * Camadas cacheadas por jitter → não redesenha tudo a cada frame.
 */
export class Renderer {
  constructor(engine) {
    this.engine = engine;
    this.jitterInterval = 85;
    this.lastJitter = 0;
    this.jitterFrame = 0;
    this.running = false;
    this.needsDraw = true;
    this._layerCaches = new Map();
    this._activeStatic = null;
    this._activeStaticJitter = -1;
    this._activeStaticReady = false;
  }

  start() {
    if (this.running) return;
    this.running = true;
    requestAnimationFrame((t) => this._loop(t));
  }

  stop() {
    this.running = false;
  }

  invalidate() {
    this.needsDraw = true;
    this._layerCaches.clear();
    this._activeStaticReady = false;
  }

  beginLiveStroke() {
    const layer = getActiveLayer();
    if (!layer || state.isShapeDrawing) return;
    const W = state.canvasWidth;
    const H = state.canvasHeight;
    if (!this._activeStatic) this._activeStatic = document.createElement('canvas');
    this._activeStatic.width = W;
    this._activeStatic.height = H;
    const cc = this._activeStatic.getContext('2d');
    cc.clearRect(0, 0, W, H);
    for (const path of layer.paths) {
      if (path === state.currentPath) continue;
      this._drawPath(cc, path);
    }
    this._activeStaticJitter = this.jitterFrame;
    this._activeStaticReady = true;
  }

  endLiveStroke() {
    this._activeStaticReady = false;
    const layer = getActiveLayer();
    if (layer) this._layerCaches.delete(layer.id);
  }

  _bakeLayer(layer, excludePath = null) {
    const W = state.canvasWidth;
    const H = state.canvasHeight;
    let entry = this._layerCaches.get(layer.id);
    if (!entry) {
      entry = { canvas: document.createElement('canvas'), jitter: -1 };
      this._layerCaches.set(layer.id, entry);
    }
    if (entry.canvas.width !== W || entry.canvas.height !== H) {
      entry.canvas.width = W;
      entry.canvas.height = H;
    }
    const cc = entry.canvas.getContext('2d');
    cc.clearRect(0, 0, W, H);
    for (const path of layer.paths) {
      if (path === excludePath) continue;
      this._drawPath(cc, path);
    }
    entry.jitter = this.jitterFrame;
    return entry.canvas;
  }

  _loop(t) {
    if (!this.running) return;
    requestAnimationFrame((x) => this._loop(x));

    let jitterChanged = false;
    if (t - this.lastJitter >= this.jitterInterval) {
      this.jitterFrame++;
      this.lastJitter = t;
      jitterChanged = true;
      this._layerCaches.clear();
      this._activeStaticReady = false;
    }

    if (state.isDrawing || jitterChanged || this.needsDraw) {
      this._draw();
      this.needsDraw = false;
    }
  }

  _draw() {
    const ctx = this.engine.ctx;
    const active = getActiveLayer();
    const canFast = state.isDrawing && state.currentPath && !state.isShapeDrawing
      && this._activeStaticReady && this._activeStaticJitter === this.jitterFrame;

    if (canFast) {
      this.engine.fillBackground();
      for (const layer of state.layers) {
        if (!layer.visible) continue;
        ctx.save();
        ctx.globalAlpha = layer.opacity;
        if (layer.id === active?.id) {
          ctx.drawImage(this._activeStatic, 0, 0);
          this._drawPath(ctx, state.currentPath);
        } else {
          const cached = this._layerCaches.get(layer.id);
          if (cached?.jitter === this.jitterFrame) {
            ctx.drawImage(cached.canvas, 0, 0);
          } else {
            ctx.drawImage(this._bakeLayer(layer), 0, 0);
          }
        }
        ctx.restore();
      }
      return;
    }

    this.engine.fillBackground();
    if (!state.layers.length) return;

    for (const layer of state.layers) {
      if (!layer.visible) continue;
      ctx.save();
      ctx.globalAlpha = layer.opacity;
      const cached = this._layerCaches.get(layer.id);
      if (cached?.jitter === this.jitterFrame && !state.isDrawing) {
        ctx.drawImage(cached.canvas, 0, 0);
      } else {
        ctx.drawImage(this._bakeLayer(layer), 0, 0);
      }
      ctx.restore();
    }

    if (state.isDrawing && state.currentPath && !state.isShapeDrawing) {
      this.beginLiveStroke();
    }
  }

  stepFrame() {
    this.jitterFrame++;
    this._layerCaches.clear();
    this._activeStaticReady = false;
    this._draw();
  }

  _drawPath(ctx, path) {
    const def = TOOL_DEFS[path.tool] || TOOL_DEFS.pen;
    const color = def.eraser ? getCanvasBg() : path.color;
    const f = this.jitterFrame;
    const W = state.canvasWidth;
    const H = state.canvasHeight;

    for (const { flipX, flipY } of mirrorFlips(path.mirrorH, path.mirrorV)) {
      if (def.shape || path.shape) {
        this._drawShape(ctx, path, color, def, f, W, H, flipX, flipY);
      } else if (def.spray) {
        this._drawSpray(ctx, path, color, def, f, W, H, flipX, flipY);
      } else {
        this._drawStroke(ctx, path, color, def, f, W, H, flipX, flipY);
      }
    }
  }

  _drawShape(ctx, path, color, def, f, W, H, flipX, flipY) {
    const outline = shapeOutline(path);
    if (outline.length < 2) return;
    const amp = def.amp;
    const dense = densify(outline, 3);
    const jp = dense.map((pt) => ({
      x: mapX(pt.x + wob(pt.x, pt.y, f) * amp, W, flipX),
      y: mapY(pt.y + wob(pt.y, pt.x, f + 19.3) * amp, H, flipY),
    }));

    ctx.save();
    const layerAlpha = ctx.globalAlpha;
    ctx.globalAlpha = layerAlpha * def.alpha * (path.opacity ?? 1);
    ctx.globalCompositeOperation = def.composite;
    ctx.strokeStyle = color;
    ctx.lineCap = def.cap;
    ctx.lineJoin = 'round';
    ctx.lineWidth = path.size;
    ctx.beginPath();
    jp.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)));
    ctx.stroke();
    ctx.restore();
  }

  _drawStroke(ctx, path, color, def, f, W, H, flipX, flipY) {
    if (!path.points.length) return;

    const dense = densify(path.points, 3);
    const amp = def.amp;
    const jp = dense.map((pt) => ({
      x: mapX(pt.x + wob(pt.x, pt.y, f) * amp, W, flipX),
      y: mapY(pt.y + wob(pt.y, pt.x, f + 19.3) * amp, H, flipY),
      p: pt.p,
    }));

    let composite = def.composite;
    if (def.marker && state.theme === 'dark') composite = 'screen';

    ctx.save();
    const layerAlpha = ctx.globalAlpha;
    ctx.globalAlpha = layerAlpha * def.alpha * (path.opacity ?? 1);
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

    if (jp.length === 1) {
      ctx.beginPath();
      ctx.arc(jp[0].x, jp[0].y, Math.max(1, path.size / 2), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawSpray(ctx, path, color, def, f, W, H, flipX, flipY) {
    if (!path.particles || !path.particles.length) return;
    ctx.save();
    const layerAlpha = ctx.globalAlpha;
    ctx.globalAlpha = layerAlpha * def.alpha * (path.opacity ?? 1);
    ctx.fillStyle = color;
    for (const q of path.particles) {
      const x = mapX((q.x + wob(q.x, q.y, f) * def.amp) | 0, W, flipX);
      const y = mapY((q.y + wob(q.y, q.x, f + 7.1) * def.amp) | 0, H, flipY);
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.restore();
  }
}
