import { state } from './state.js';
import { getCanvasBg, getThemeColors } from './theme.js';

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

  snapshot() {
    return this.ctx.getImageData(0, 0, this.width, this.height);
  }

  restore(imageData) {
    this.ctx.putImageData(imageData, 0, 0);
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

  clearCanvas() {
    this.fillBackground();
    this.clearOverlay();
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

  buildCropPreview(rect) {
    const preview = document.createElement('canvas');
    preview.width = rect.w;
    preview.height = rect.h;
    const pctx = preview.getContext('2d');
    pctx.drawImage(this.mainCanvas, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
    return preview;
  }

  applyCrop(rect) {
    const img = this.ctx.getImageData(rect.x, rect.y, rect.w, rect.h);
    this.init(rect.w, rect.h);
    this.ctx.putImageData(img, 0, 0);
    this.clearOverlay();
  }

  exportPNG() {
    const link = document.createElement('a');
    link.download = `retrobit_${Date.now()}.png`;
    link.href = this.mainCanvas.toDataURL('image/png');
    link.click();
  }
}
