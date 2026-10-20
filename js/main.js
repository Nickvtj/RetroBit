import { state, snapshotPaths, TOOL_DEFS, RESOLUTIONS, initLayers, layersFromProject, ensureLayers, getActiveLayer, BRUSH_SIZES } from './state.js';
import { CanvasEngine } from './engine.js';
import { Renderer } from './renderer.js';
import { History } from './history.js';
import { createToolHandlers } from './tools.js';
import { createUI } from './ui.js';
import { createLayersPanel } from './layers.js';
import { initTheme } from './theme.js';
import { playBoom } from './audio.js';
import { encodeGIF } from './gif.js';
import { getProject, saveProject, makeProjectId, nextProjectName } from './projects.js';
import { mirrorFlips, mapX, mapY } from './mirror.js';

const engine = new CanvasEngine({
  mainCanvas: document.getElementById('main-canvas'),
  overlayCanvas: document.getElementById('overlay-canvas'),
});

const renderer = new Renderer(engine);
let dirty = false; // há alterações desde o último "Salvar"?
const history = new History(80, () => { dirty = true; });
let tools = null;
let ui = null;
let layersPanel = null;

const frameEl = document.getElementById('canvas-frame');
const cursorEl = document.getElementById('canvas-cursor');
let cursorPending = null;
let cursorRaf = 0;
let lastThumbAt = 0; // throttle da miniatura ao vivo da camada

const THUMB_INTERVAL = 100; // ms entre atualizações da miniatura durante o traço

/** Dimensiona a moldura para caber na zona, preservando a proporção da resolução. */
function fitFrame() {
  const stack = frameEl.parentElement;
  const zone = stack?.parentElement;
  if (!zone || zone.clientWidth === 0) return;
  const mirrorBar = stack.querySelector('.mirror-bar');
  const mirrorExtra = mirrorBar ? mirrorBar.offsetHeight + 8 : 0;
  const cs = getComputedStyle(zone);
  const ss = getComputedStyle(stack);
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)
    + parseFloat(ss.paddingLeft) + parseFloat(ss.paddingRight);
  const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
    + parseFloat(ss.paddingTop) + parseFloat(ss.paddingBottom) + mirrorExtra;
  const availW = zone.clientWidth - padX;
  const availH = zone.clientHeight - padY;
  const ar = state.canvasWidth / state.canvasHeight;
  // Tamanho de exibição máximo → a tela não fica gigante e sobra espaço para
  // as ferramentas deslizarem sem cortar.
  const MAX_W = 760;
  const MAX_H = 560;
  let w = Math.min(availW, MAX_W);
  let h = w / ar;
  if (h > Math.min(availH, MAX_H)) { h = Math.min(availH, MAX_H); w = h * ar; }
  frameEl.style.width = `${Math.floor(w)}px`;
  frameEl.style.height = `${Math.floor(h)}px`;
}

/** (Re)inicializa o canvas com a resolução atual e ajusta a moldura. */
function initCanvas() {
  ensureLayers();
  engine.init(state.canvasWidth, state.canvasHeight);
  fitFrame();
  renderer.invalidate();
}

function applyHistoryEntry(entry) {
  if (!entry) return;
  if (entry.layers) {
    state.layers = entry.layers;
    state.activeLayerId = entry.activeLayerId;
    ensureLayers();
    layersPanel?.render();
  } else if (entry.paths) {
    // Entrada antiga (só paths) → uma camada.
    initLayers(entry.paths);
    layersPanel?.render();
  }
  if (entry.w !== state.canvasWidth || entry.h !== state.canvasHeight) {
    state.canvasWidth = entry.w;
    state.canvasHeight = entry.h;
    engine.init(entry.w, entry.h);
    fitFrame();
  }
}

/** Escala todos os traços de todas as camadas. */
function scaleAllPaths(sx, sy) {
  for (const layer of state.layers) {
    for (const p of layer.paths) {
      if (p.shape) {
        p.x0 *= sx; p.y0 *= sy; p.x1 *= sx; p.y1 *= sy;
      }
      for (const pt of p.points) { pt.x *= sx; pt.y *= sy; }
      if (p.particles) for (const q of p.particles) { q.x *= sx; q.y *= sy; }
    }
  }
}

/**
 * Converte um traço espelhado em cópias "reais" (sem espelho) — necessário antes
 * de recortar, porque o espelho é sempre calculado a partir do centro da tela.
 */
function expandMirror(p, W, H) {
  if (!p.mirrorH && !p.mirrorV) return [p];
  return mirrorFlips(p.mirrorH, p.mirrorV).map(({ flipX, flipY }) => {
    const mx = (x) => mapX(x, W, flipX);
    const my = (y) => mapY(y, H, flipY);
    const copy = { ...p, mirrorH: false, mirrorV: false };
    if (p.shape) {
      copy.x0 = mx(p.x0); copy.y0 = my(p.y0); copy.x1 = mx(p.x1); copy.y1 = my(p.y1);
    }
    copy.points = (p.points || []).map((pt) => ({ ...pt, x: mx(pt.x), y: my(pt.y) }));
    copy.particles = p.particles ? p.particles.map((q) => ({ x: mx(q.x), y: my(q.y) })) : null;
    return copy;
  });
}

/** Recorta a tela para `rect`: desloca os traços e muda a resolução. */
function applyCrop(rect) {
  history.record(snapshotPaths());
  const W = state.canvasWidth;
  const H = state.canvasHeight;
  for (const layer of state.layers) {
    layer.paths = layer.paths.flatMap((p) => expandMirror(p, W, H));
    for (const p of layer.paths) {
      if (p.shape) { p.x0 -= rect.x; p.y0 -= rect.y; p.x1 -= rect.x; p.y1 -= rect.y; }
      for (const pt of p.points) { pt.x -= rect.x; pt.y -= rect.y; }
      if (p.particles) for (const q of p.particles) { q.x -= rect.x; q.y -= rect.y; }
    }
  }
  state.canvasWidth = rect.w;
  state.canvasHeight = rect.h;
  tools.cancelCropMode();
  ui.setCropHint(false);
  engine.init(rect.w, rect.h);
  fitFrame();
  layersPanel?.render();
  renderer.invalidate();
}

/** Cópia das camadas com coordenadas arredondadas (0.1px) → ocupa menos no localStorage. */
function compactLayers(layers) {
  const r = (v) => Math.round(v * 10) / 10;
  return layers.map((l) => ({
    ...l,
    paths: l.paths.map((p) => {
      const out = { ...p };
      if (p.shape) { out.x0 = r(p.x0); out.y0 = r(p.y0); out.x1 = r(p.x1); out.y1 = r(p.y1); }
      out.points = (p.points || []).map((pt) => ({ x: r(pt.x), y: r(pt.y), p: r(pt.p ?? 0.5) }));
      if (p.particles) out.particles = p.particles.map((q) => ({ x: r(q.x), y: r(q.y) }));
      return out;
    }),
  }));
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
  if (state.activeShapeKey) {
    return Math.max(2.5, BRUSH_SIZES[state.shapeSizes[state.activeShapeKey] ?? 1] / 2);
  }
  const def = TOOL_DEFS[state.tool] || {};
  if (def.spray) return state.brushSize * 2.2;
  return Math.max(2.5, (state.brushSize * (def.widthScale ?? 1)) / 2);
}

function applyCursor() {
  cursorRaf = 0;
  const e = cursorPending;
  if (!e) return;
  if (!cursorEl || state.isCropping) return;
  const canvas = engine.mainCanvas;
  const rect = canvas.getBoundingClientRect();
  if (
    e.clientX < rect.left || e.clientX > rect.right
    || e.clientY < rect.top || e.clientY > rect.bottom
  ) {
    cursorEl.hidden = true;
    return;
  }
  const scale = rect.width / state.canvasWidth;
  const r = cursorRadius() * scale;
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  cursorEl.hidden = false;
  cursorEl.style.width = `${r * 2}px`;
  cursorEl.style.height = `${r * 2}px`;
  cursorEl.style.transform = `translate3d(${x - r}px, ${y - r}px, 0)`;
}

function scheduleCursor(e) {
  cursorPending = e;
  if (!cursorRaf) cursorRaf = requestAnimationFrame(applyCursor);
}

function hideCursor() {
  if (cursorEl) cursorEl.hidden = true;
}

function bindCanvas() {
  const canvas = engine.mainCanvas;
  let activePointer = null; // só um ponteiro desenha de cada vez (evita 2 dedos)
  const finish = (e, cancelled) => {
    if (e.pointerId !== activePointer) return;
    activePointer = null;
    if (cancelled) tools.onPointerCancel();
    else tools.onPointerUp(e, engine.getCanvasPos(e));
    layersPanel?.render();
    renderer.invalidate();
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || activePointer !== null) return; // só botão principal / caneta / dedo
    activePointer = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    scheduleCursor(e);
    const pos = engine.getCanvasPos(e);
    tools.onPointerDown(e, pos);
  });
  canvas.addEventListener('pointermove', (e) => {
    scheduleCursor(e);
    if (activePointer !== null && e.pointerId !== activePointer) return;
    const pos = engine.getCanvasPos(e);
    tools.onPointerMove(e, pos);
    if (state.isDrawing && e.timeStamp - lastThumbAt > THUMB_INTERVAL) {
      lastThumbAt = e.timeStamp;
      layersPanel?.refreshThumb(state.activeLayerId);
    }
  });
  canvas.addEventListener('pointerleave', hideCursor);
  canvas.addEventListener('pointerup', (e) => finish(e, false));
  canvas.addEventListener('pointercancel', (e) => finish(e, true));
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

function boot() {
  ui = createUI({
    onNewProject: () => {
      initLayers();
      state.currentProjectId = null;
      state.bgColor = '#ffffff';
      state.canvasWidth = RESOLUTIONS[0].w;
      state.canvasHeight = RESOLUTIONS[0].h;
      history.clear();
      dirty = false;
      layersPanel?.render();
    },

    onOpenProject: (id) => {
      const p = getProject(id);
      if (!p) return;
      layersFromProject(p);
      state.bgColor = p.bgColor || '#ffffff';
      state.canvasWidth = p.w || RESOLUTIONS[0].w;
      state.canvasHeight = p.h || RESOLUTIONS[0].h;
      state.currentProjectId = id;
      history.clear();
      dirty = false;
      layersPanel?.render();
    },

    onAppReady: () => {
      tools.cancelCropMode();
      ui.setCropHint(false);
      initCanvas();
      layersPanel?.render();
    },

    /** Devolve true se salvou (false = localStorage cheio/indisponível). */
    onSave: () => {
      const id = state.currentProjectId || makeProjectId();
      const existing = getProject(id);
      const saved = saveProject({
        id,
        name: existing ? existing.name : nextProjectName(),
        w: state.canvasWidth,
        h: state.canvasHeight,
        bgColor: state.bgColor,
        layers: compactLayers(state.layers),
        activeLayerId: state.activeLayerId,
        thumb: makeThumb(),
      });
      if (!saved) return false;
      state.currentProjectId = id;
      dirty = false;
      return true;
    },

    isDirty: () => dirty,

    onBgChange: () => {
      dirty = true;
      renderer.invalidate();
      layersPanel?.render();
    },

    onStartCrop: () => tools.startCropMode(),
    onCancelCrop: () => tools.cancelCropMode(),

    onExportPng: () => engine.exportPNG(),

    onSetResolution: (res) => {
      history.record(snapshotPaths());
      scaleAllPaths(res.w / state.canvasWidth, res.h / state.canvasHeight);
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

    onUndo: () => {
      applyHistoryEntry(history.undo(snapshotPaths()));
      renderer.invalidate();
    },
    onRedo: () => {
      applyHistoryEntry(history.redo(snapshotPaths()));
      renderer.invalidate();
    },

    onClear: () => {
      const layer = getActiveLayer();
      if (!layer) return;
      if (layer.locked) { layersPanel?.flashLocked(); return; }
      history.record(snapshotPaths());
      const app = document.getElementById('app');
      app.classList.add('rb-shake');
      setTimeout(() => app.classList.remove('rb-shake'), 520);
      playBoom();
      engine.runExplosion(state.canvasWidth / 2, state.canvasHeight / 2);
      layer.paths = [];
      layersPanel?.render();
      renderer.invalidate();
    },

    onColorChange: () => renderer.invalidate(),
    onShapeChange: () => renderer.invalidate(),
  });

  tools = createToolHandlers(engine, history, renderer, {
    onLocked: () => layersPanel?.flashLocked(),
    onCrop: applyCrop,
  });

  layersPanel = createLayersPanel({
    onChange: () => renderer.invalidate(),
    onHistory: () => history.record(snapshotPaths()),
    getLayerCanvas: (layer) => renderer.layerCanvas(layer),
  });

  initTheme();
  ui.init();
  initLayers();
  layersPanel.init();

  engine.init(state.canvasWidth, state.canvasHeight);
  fitFrame();
  bindCanvas();
  renderer.start();

  window.addEventListener('resize', fitFrame);
}

boot();
