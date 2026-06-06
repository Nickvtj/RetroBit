import { floodFill, hexToRgba, getPixel, rgbaToHex } from './algorithms.js';
import { getThemeColors } from './state.js';

export class CanvasEngine {
  constructor(elements) {
    this.stage = elements.stage;
    this.viewport = elements.viewport;
    this.gridCanvas = elements.gridCanvas;
    this.mainCanvas = elements.mainCanvas;
    this.overlayCanvas = elements.overlayCanvas;
    this.gridCtx = this.gridCanvas.getContext('2d');
    this.ctx = this.mainCanvas.getContext('2d');
    this.overlayCtx = this.overlayCanvas.getContext('2d');
    this.width = 800;
    this.height = 600;
    this.displayZoom = 1;
    this.showGrid = true;
    this.onStatusUpdate = null;
  }

  getCanvasBg() {
    return getThemeColors().canvasBg;
  }

  setSize(w, h) {
    const prev = this.ctx.getImageData(0, 0, this.width, this.height);
    this.width = w;
    this.height = h;

    [this.gridCanvas, this.mainCanvas, this.overlayCanvas].forEach((c) => {
      c.width = w;
      c.height = h;
    });

    this.stage.style.width = `${w * this.displayZoom}px`;
    this.stage.style.height = `${h * this.displayZoom}px`;

    this.fillBackground();

    const copyW = Math.min(prev.width, w);
    const copyH = Math.min(prev.height, h);
    if (copyW > 0 && copyH > 0) {
      this.ctx.putImageData(prev, 0, 0, 0, 0, copyW, copyH);
    }

    this.redrawGrid();
    this.clearOverlay();
    this.applyZoom();
    this.notifyStatus();
  }

  fillBackground() {
    this.ctx.fillStyle = this.getCanvasBg();
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  applyZoom() {
    const scale = this.displayZoom;
    [this.gridCanvas, this.mainCanvas, this.overlayCanvas].forEach((c) => {
      c.style.width = `${this.width * scale}px`;
      c.style.height = `${this.height * scale}px`;
    });
    this.stage.style.width = `${this.width * scale}px`;
    this.stage.style.height = `${this.height * scale}px`;
    this.stage.classList.toggle('zoomed', scale > 1);
    this.notifyStatus();
  }

  setZoom(level) {
    this.displayZoom = level;
    this.applyZoom();
    this.redrawGrid();
  }

  redrawGrid() {
    const { gridCtx, width, height, showGrid, displayZoom } = this;
    gridCtx.clearRect(0, 0, width, height);
    if (!showGrid) return;

    const theme = getThemeColors();
    const step = displayZoom >= 4 ? 1 : displayZoom >= 2 ? 4 : 20;
    gridCtx.strokeStyle = displayZoom >= 2 ? theme.gridColorZoom : theme.gridColor;
    gridCtx.lineWidth = 1;

    for (let x = 0; x <= width; x += step) {
      gridCtx.beginPath();
      gridCtx.moveTo(x + 0.5, 0);
      gridCtx.lineTo(x + 0.5, height);
      gridCtx.stroke();
    }
    for (let y = 0; y <= height; y += step) {
      gridCtx.beginPath();
      gridCtx.moveTo(0, y + 0.5);
      gridCtx.lineTo(width, y + 0.5);
      gridCtx.stroke();
    }
  }

  toggleGrid() {
    this.showGrid = !this.showGrid;
    this.redrawGrid();
  }

  clear() {
    this.fillBackground();
    this.clearOverlay();
  }

  clearOverlay() {
    this.overlayCtx.clearRect(0, 0, this.width, this.height);
  }

  applyTheme() {
    this.redrawGrid();
    this.notifyStatus();
  }

  getCanvasPos(e) {
    const rect = this.mainCanvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / this.displayZoom;
    const y = (e.clientY - rect.top) / this.displayZoom;
    return {
      x: Math.max(0, Math.min(this.width - 1, x)),
      y: Math.max(0, Math.min(this.height - 1, y)),
    };
  }

  snapshot() {
    return this.ctx.getImageData(0, 0, this.width, this.height);
  }

  restore(imageData) {
    this.ctx.putImageData(imageData, 0, 0);
  }

  pickColor(x, y) {
    const px = Math.floor(x);
    const py = Math.floor(y);
    const [r, g, b] = getPixel(this.snapshot(), px, py);
    return rgbaToHex(r, g, b);
  }

  doFill(x, y, color) {
    const img = this.snapshot();
    floodFill(img, x, y, hexToRgba(color));
    this.ctx.putImageData(img, 0, 0);
  }

  loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          this.setSize(img.width, img.height);
          this.ctx.drawImage(img, 0, 0);
          resolve();
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  exportPNG(stamp = true) {
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = this.width;
    exportCanvas.height = this.height;
    const ectx = exportCanvas.getContext('2d');
    const theme = getThemeColors();

    ectx.fillStyle = theme.canvasBg;
    ectx.fillRect(0, 0, this.width, this.height);
    ectx.drawImage(this.mainCanvas, 0, 0);

    if (stamp) {
      const now = new Date();
      const label = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
      ].join('-');
      ectx.font = "9px 'Space Mono', monospace";
      ectx.fillStyle = theme.exportStamp;
      ectx.textAlign = 'right';
      ectx.textBaseline = 'bottom';
      ectx.fillText(`gerado: ${label}`, this.width - 8, this.height - 8);
    }

    const link = document.createElement('a');
    link.download = `votan_paint_${Date.now()}.png`;
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
  }

  drawMarchingAnts(selection, offset) {
    if (!selection) return;
    const { x, y, w, h } = selection.bounds;
    const ctx = this.overlayCtx;
    const theme = getThemeColors();
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.strokeStyle = theme.selectionStroke;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.lineDashOffset = -offset;
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    ctx.setLineDash([]);
  }

  notifyStatus() {
    if (this.onStatusUpdate) this.onStatusUpdate();
  }

  init(w, h) {
    this.setSize(w, h);
  }
}
