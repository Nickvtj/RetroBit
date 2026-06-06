import { state } from './state.js';
import { CanvasEngine } from './engine.js';
import { History } from './history.js';
import { createToolHandlers } from './tools.js';
import { createUI } from './ui.js';
import { initTheme, toggleTheme } from './theme.js';

const engine = new CanvasEngine({
  stage: document.getElementById('canvas-stage'),
  viewport: document.getElementById('viewport'),
  gridCanvas: document.getElementById('grid-canvas'),
  mainCanvas: document.getElementById('main-canvas'),
  overlayCanvas: document.getElementById('overlay-canvas'),
});

const history = new History();

const ui = createUI({ onMenuAction: handleMenuAction });

const tools = createToolHandlers(engine, history, {
  updateColorSelection: () => ui.updateColorSelection(),
  updateStatus: () => ui.updateStatus(engine),
  updateCoords: (x, y) => ui.updateCoords(x, y),
  openTextInput: (x, y) => {
    ui.openTextInput(x, y, engine, (tx, ty, text) => {
      history.push(engine.snapshot());
      const ctx = engine.ctx;
      ctx.font = "12px 'Space Mono', monospace";
      ctx.fillStyle = state.fgColor;
      ctx.textBaseline = 'top';
      text.split('\n').forEach((line, i) => ctx.fillText(line, tx, ty + i * 14));
    });
  },
  showCurveHint: (phase) => ui.showCurveHint(phase),
});

function handleMenuAction(action) {
  switch (action) {
    case 'new':
      ui.showNewDialog();
      break;
    case 'open':
      ui.openFilePicker();
      break;
    case 'save':
      engine.exportPNG();
      break;
    case 'undo':
      if (history.undo(engine.ctx)) tools.clearSelection();
      break;
    case 'redo':
      if (history.redo(engine.ctx)) tools.clearSelection();
      break;
    case 'cut':
      tools.cut();
      break;
    case 'copy':
      tools.copy();
      break;
    case 'paste':
      tools.paste();
      break;
    case 'zoom-1':
      engine.setZoom(1);
      ui.updateStatus(engine);
      break;
    case 'zoom-2':
      engine.setZoom(2);
      ui.updateStatus(engine);
      break;
    case 'zoom-4':
      engine.setZoom(4);
      ui.updateStatus(engine);
      break;
    case 'zoom-8':
      engine.setZoom(8);
      ui.updateStatus(engine);
      break;
    case 'toggle-grid':
      engine.toggleGrid();
      break;
    case 'toggle-theme':
      toggleTheme(onThemeChange);
      break;
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
    tools.onPointerUp(e, engine.getCanvasPos(e));
    canvas.releasePointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointerleave', (e) => {
    if (state.isDrawing) tools.onPointerUp(e, engine.getCanvasPos(e));
  });

  canvas.addEventListener('dblclick', (e) => {
    tools.onDblClick(e, engine.getCanvasPos(e));
  });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

function onThemeChange() {
  engine.applyTheme();
  ui.onThemeChanged();
  ui.updateStatus(engine);
}

function boot() {
  ui.init();
  ui.bindModal({
    onNewCanvas: (w, h) => {
      history.clear();
      tools.stopAnts();
      state.selection = null;
      engine.init(w, h);
      state.canvasWidth = w;
      state.canvasHeight = h;
      ui.updateStatus(engine);
    },
  });

  ui.bindFileInput(async (file) => {
    history.clear();
    tools.stopAnts();
    state.selection = null;
    await engine.loadImageFromFile(file);
    state.canvasWidth = engine.width;
    state.canvasHeight = engine.height;
    ui.updateStatus(engine);
  });

  initTheme(onThemeChange);

  engine.onStatusUpdate = () => ui.updateStatus(engine);
  engine.init(state.canvasWidth, state.canvasHeight);
  bindCanvas();
  ui.updateStatus(engine);
  ui.selectTool('pencil');
}

boot();
