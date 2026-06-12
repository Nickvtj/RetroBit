import { state, calcCanvasSize } from './state.js';
import { CanvasEngine } from './engine.js';
import { History } from './history.js';
import { createToolHandlers } from './tools.js';
import { createUI } from './ui.js';
import { initTheme, toggleTheme } from './theme.js';

const engine = new CanvasEngine({
  mainCanvas: document.getElementById('main-canvas'),
  overlayCanvas: document.getElementById('overlay-canvas'),
});

const history = new History();
let tools = null;
let ui = null;
let pendingCropRect = null;

function resizeCanvas() {
  const { w, h } = calcCanvasSize();
  if (w === state.canvasWidth && h === state.canvasHeight) return;
  const snap = engine.snapshot();
  state.canvasWidth = w;
  state.canvasHeight = h;
  engine.init(w, h);
  if (snap) {
    const tmp = document.createElement('canvas');
    tmp.width = snap.width;
    tmp.height = snap.height;
    tmp.getContext('2d').putImageData(snap, 0, 0);
    engine.ctx.drawImage(tmp, 0, 0, w, h);
  }
}

function bindCanvas() {
  const canvas = engine.mainCanvas;

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    tools.onPointerDown(e, engine.getCanvasPos(e));
  });

  canvas.addEventListener('pointermove', (e) => {
    tools.onPointerMove(e, engine.getCanvasPos(e));
  });

  canvas.addEventListener('pointerup', (e) => {
    const pos = engine.getCanvasPos(e);
    tools.onPointerUp(e, pos);
    canvas.releasePointerCapture(e.pointerId);

    if (state.isCropping) {
      const rect = tools.getCropRect();
      if (rect && rect.w >= 10 && rect.h >= 10) {
        pendingCropRect = rect;
        ui.showCropModal(engine.buildCropPreview(rect));
      }
      tools.cancelCropMode();
    }
  });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

function boot() {
  ui = createUI({
    onExport: () => engine.exportPNG(),

    onCropStart: () => {
      tools.startCropMode();
    },

    onCropCancel: () => {
      pendingCropRect = null;
      engine.clearOverlay();
    },

    onCropApply: () => {
      if (!pendingCropRect) return;
      history.push(engine.snapshot());
      engine.applyCrop(pendingCropRect);
      pendingCropRect = null;
    },

    onUndo: () => history.undo(engine.ctx),

    onRedo: () => history.redo(engine.ctx),

    onClear: () => {
      if (!confirm('OBLITERAR! — limpar tudo?')) return;
      history.push(engine.snapshot());
      engine.clearCanvas();
    },

    onToolChange: () => {
      if (state.isCropping) tools.cancelCropMode();
    },

    onToggleTheme: () => {
      toggleTheme();
      ui.updateColorUI();
    },
  });

  tools = createToolHandlers(engine, history);

  initTheme();
  ui.init();

  const { w, h } = calcCanvasSize();
  state.canvasWidth = w;
  state.canvasHeight = h;
  engine.init(w, h);
  bindCanvas();

  window.addEventListener('resize', resizeCanvas);
}

boot();
