import { state } from './state.js';
import { getCanvasBg, getThemeColors } from './theme.js';
import { drawShapePreview } from './shapes.js';

export class CanvasEngine {
  constructor(elements) {
    this.mainCanvas = elements.mainCanvas;
    this.overlayCanvas = elements.overlayCanvas;
    this.ctx = this.mainCanvas.getContext('2d');
    this.overlayCtx = this.overlayCanvas.getContext('2d');
    this.width = state.canvasWidth;
    this.height = state.canvasHeight;
  }

  init(w, h) {
    this.width = w;
    this.height = h;
    this.mainCanvas.width = w;
    this.mainCanvas.height = h;
    this.overlayCanvas.width = w;
    this.overlayCanvas.height = h;
    this.fillBackground();
    this.clearOverlay();
  }

  fillBackground() {
    this.ctx.fillStyle = getCanvasBg();
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  getStrokeColor() {
    return getThemeColors().uiFg;
  }

  clearOverlay() {
    this.overlayCtx.clearRect(0, 0, this.width, this.height);
  }

  drawShapePreview(draft) {
    if (!draft) return;
    drawShapePreview(this.overlayCtx, draft, this.getStrokeColor());
  }

  /** Anel do cursor (dois traços preto+branco para ser visível em qualquer fundo). */
  drawCursorRing(x, y, r) {
    this.drawCursorRings([{ x, y }], r);
  }

  drawCursorRings(positions, r) {
    const ctx = this.overlayCtx;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.save();
    ctx.lineWidth = 1;
    for (const { x, y } of positions) {
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(x, y, r + 1, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.9)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  getCanvasPos(e) {
    const rect = this.mainCanvas.getBoundingClientRect();
    const scaleX = this.width / rect.width;
    const scaleY = this.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    return {
      x: Math.max(0, Math.min(this.width - 1, x)),
      y: Math.max(0, Math.min(this.height - 1, y)),
    };
  }

  drawCropSelection(x0, y0, x1, y1) {
    const ctx = this.overlayCtx;
    ctx.clearRect(0, 0, this.width, this.height);
    const x = Math.min(x0, x1);
    const y = Math.min(y0, y1);
    const w = Math.abs(x1 - x0);
    const h = Math.abs(y1 - y0);

    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.clearRect(x, y, w, h);

    ctx.strokeStyle = this.getStrokeColor();
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    ctx.setLineDash([]);
  }

  getCropRect(x0, y0, x1, y1) {
    const x = Math.floor(Math.min(x0, x1));
    const y = Math.floor(Math.min(y0, y1));
    const w = Math.max(1, Math.ceil(Math.abs(x1 - x0)));
    const h = Math.max(1, Math.ceil(Math.abs(y1 - y0)));
    return { x, y, w, h };
  }

  /** Pré-visualização do crop: lê os pixels do frame atual do canvas. */
  buildCropPreview(rect) {
    const preview = document.createElement('canvas');
    preview.width = rect.w;
    preview.height = rect.h;
    const pctx = preview.getContext('2d');
    pctx.drawImage(this.mainCanvas, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
    return preview;
  }

  exportPNG() {
    const link = document.createElement('a');
    link.download = `retrobit_${Date.now()}.png`;
    link.href = this.mainCanvas.toDataURL('image/png');
    link.click();
  }

  /**
   * Explosão pixelada da bomba, desenhada no overlay (independente do loop
   * de 12fps para ser bem fluida). Auto-limpa ao fim de ~0.5s.
   */
  runExplosion(cx, cy) {
    const ctx = this.overlayCtx;
    const W = this.width;
    const H = this.height;
    const fg = getThemeColors().uiFg;
    const N = 110;
    const parts = [];
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 8;
      parts.push({
        x: cx,
        y: cy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        sz: 2 + ((Math.random() * 3) | 0),
        c: Math.random() < 0.4 ? '#3ff0ff' : fg,
      });
    }

    const start = performance.now();
    const duration = 500;
    const step = (now) => {
      const t = (now - start) / duration;
      ctx.clearRect(0, 0, W, H);
      if (t >= 1) return; // frame final já limpo
      ctx.globalAlpha = 1 - t;
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.35; // gravidade
        p.vx *= 0.98;
        ctx.fillStyle = p.c;
        ctx.fillRect(p.x | 0, p.y | 0, p.sz, p.sz);
      }
      ctx.globalAlpha = 1;
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}
