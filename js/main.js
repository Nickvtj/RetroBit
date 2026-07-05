import { state, snapshotPaths, TOOL_DEFS, RESOLUTIONS } from './state.js';
import { CanvasEngine } from './engine.js';
import { Renderer } from './renderer.js';
import { History } from './history.js';
import { createToolHandlers } from './tools.js';
import { createUI } from './ui.js';
import { initTheme } from './theme.js';
import { playBoom } from './audio.js';
import { encodeGIF } from './gif.js';
import { getProject, saveProject, makeProjectId, nextProjectName } from './projects.js';

const engine = new CanvasEngine({
  mainCanvas: document.getElementById('main-canvas'),
  overlayCanvas: document.getElementById('overlay-canvas'),
});

const renderer = new Renderer(engine);
const history = new History();
let tools = null;
let ui = null;

const frameEl = document.getElementById('canvas-frame');

/** Dimensiona a moldura para caber na zona, preservando a proporção da resolução. */
function fitFrame() {
  const zone = frameEl.parentElement;
  if (!zone || zone.clientWidth === 0) return;
  const cs = getComputedStyle(zone);
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  const availW = zone.clientWidth - padX;
  const availH = zone.clientHeight - padY;
  const ar = state.canvasWidth / state.canvasHeight;
  let w = availW;
  let h = w / ar;
  if (h > availH) { h = availH; w = h * ar; }
  frameEl.style.width = `${Math.floor(w)}px`;
  frameEl.style.height = `${Math.floor(h)}px`;
}

/** (Re)inicializa o canvas com a resolução atual e ajusta a moldura. */
function initCanvas() {
  engine.init(state.canvasWidth, state.canvasHeight);
  fitFrame();
  renderer.invalidate();
}

function applyHistoryEntry(entry) {
  if (!entry) return;
  state.paths = entry.paths.slice();
  if (entry.w !== state.canvasWidth || entry.h !== state.canvasHeight) {
    state.canvasWidth = entry.w;
    state.canvasHeight = entry.h;
    engine.init(entry.w, entry.h);
    fitFrame();
  }
}

/** Escala todos os traços de uma resolução para outra. */
function scalePaths(sx, sy) {
  for (const p of state.paths) {
    for (const pt of p.points) { pt.x *= sx; pt.y *= sy; }
    if (p.particles) for (const q of p.particles) { q.x *= sx; q.y *= sy; }
  }
}

/** Miniatura (dataURL) do estado atual do canvas, para a galeria. */
function makeThumb() {
  const tw = 240;
  const th = Math.max(1, Math.round(tw * state.canvasHeight / state.canvasWidth));
  const c = document.createElement('canvas');
  c.width = tw; c.height = th;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = true;
  x.drawImage(engine.mainCanvas, 0, 0, tw, th);
  return c.toDataURL('image/png');
}

function cursorRadius() {
  const def = TOOL_DEFS[state.tool] || {};
  if (def.spray) return state.brushSize * 2.2;
  return Math.max(2.5, (state.brushSize * (def.widthScale ?? 1)) / 2);
}

function bindCanvas() {
  const canvas = engine.mainCanvas;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    const pos = engine.getCanvasPos(e);
    tools.onPointerDown(e, pos);
    engine.drawCursorRing(pos.x, pos.y, cursorRadius());
  });
  canvas.addEventListener('pointermove', (e) => {
    const pos = engine.getCanvasPos(e);
    tools.onPointerMove(e, pos);
    engine.drawCursorRing(pos.x, pos.y, cursorRadius());
  });
  canvas.addEventListener('pointerleave', () => engine.clearOverlay());
  canvas.addEventListener('pointerup', (e) => {
    tools.onPointerUp(e, engine.getCanvasPos(e));
    canvas.releasePointerCapture(e.pointerId);
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

function boot() {
  ui = createUI({
    onNewProject: () => {
      state.paths = [];
      state.currentProjectId = null;
      state.bgColor = '#ffffff';
      state.canvasWidth = RESOLUTIONS[0].w;
      state.canvasHeight = RESOLUTIONS[0].h;
      history.clear();
    },

    onOpenProject: (id) => {
      const p = getProject(id);
      if (!p) return;
      state.paths = Array.isArray(p.paths) ? p.paths : [];
      state.bgColor = p.bgColor || '#ffffff';
      state.canvasWidth = p.w || RESOLUTIONS[0].w;
      state.canvasHeight = p.h || RESOLUTIONS[0].h;
      state.currentProjectId = id;
      history.clear();
    },

    onAppReady: () => initCanvas(),

    onSave: () => {
      const id = state.currentProjectId || makeProjectId();
      const existing = getProject(id);
      saveProject({
        id,
        name: existing ? existing.name : nextProjectName(),
        w: state.canvasWidth,
        h: state.canvasHeight,
        bgColor: state.bgColor,
        paths: state.paths,
        thumb: makeThumb(),
      });
      state.currentProjectId = id;
    },

    onBgChange: () => renderer.invalidate(),

    onSetResolution: (res) => {
      history.record(snapshotPaths());
      scalePaths(res.w / state.canvasWidth, res.h / state.canvasHeight);
      state.canvasWidth = res.w;
      state.canvasHeight = res.h;
      engine.init(res.w, res.h);
      fitFrame();
      renderer.invalidate();
    },

    // Exporta um GIF animado com o desenho a "tremer".
    onExportGif: () => {
      const n = 12;
      const maxW = 460;
      const scale = Math.min(1, maxW / state.canvasWidth);
      const gw = Math.max(1, Math.round(state.canvasWidth * scale));
      const gh = Math.max(1, Math.round(state.canvasHeight * scale));
      const tmp = document.createElement('canvas');
      tmp.width = gw; tmp.height = gh;
      const tctx = tmp.getContext('2d');
      tctx.imageSmoothingEnabled = true;
      const frames = [];
      for (let k = 0; k < n; k++) {
        renderer.stepFrame();
        tctx.drawImage(engine.mainCanvas, 0, 0, gw, gh);
        frames.push(tctx.getImageData(0, 0, gw, gh).data);
      }
      const bytes = encodeGIF(frames, gw, gh, 8);
      const blob = new Blob([bytes], { type: 'image/gif' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.download = `retrobit_${Date.now()}.gif`;
      a.href = url;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },

    onUndo: () => { applyHistoryEntry(history.undo(snapshotPaths())); renderer.invalidate(); },
    onRedo: () => { applyHistoryEntry(history.redo(snapshotPaths())); renderer.invalidate(); },

    onClear: () => {
      history.record(snapshotPaths());
      const app = document.getElementById('app');
      app.classList.add('rb-shake');
      setTimeout(() => app.classList.remove('rb-shake'), 520);
      playBoom();
      engine.runExplosion(state.canvasWidth / 2, state.canvasHeight / 2);
      state.paths = [];
      renderer.invalidate();
    },

    onColorChange: () => renderer.invalidate(),
  });

  tools = createToolHandlers(engine, history);

  initTheme();
  ui.init();

  engine.init(state.canvasWidth, state.canvasHeight);
  fitFrame();
  bindCanvas();
  renderer.start();

  window.addEventListener('resize', fitFrame);
}

boot();
