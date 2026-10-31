import { state, resetDrawing, snapshotPaths, TOOL_DEFS, SHAPES, BRUSH_SIZES, getActiveLayer, ensureLayers } from './state.js';
import { beginStroke, updateStroke, endStroke, playCell } from './audio.js';
import { shapeTooSmall } from './shapes.js';

const MIN_POINT_STEP = 2;

function baseWidth(tool) {
  const scale = TOOL_DEFS[tool]?.widthScale ?? 1;
  return Math.max(1, state.brushSize * scale);
}

function shapeSize() {
  return Math.max(1, BRUSH_SIZES[state.shapeSizes[state.activeShapeKey] ?? 1]);
}

function readPressure(e) {
  return e.pressure > 0 ? e.pressure : 0.5;
}

/* ── Grade de pixel art ─────────────────────────────────── */
const cellKeys = new WeakMap(); // traço em curso → células já pintadas ("x,y")

/** Lado do pincel em células: tamanhos 1-2 → 1, 3-4 → 2, 5-6 → 3. */
export function cellBrush() {
  return 1 + Math.floor(state.brushSizeIndex / 2);
}

/** Encaixa uma coordenada na linha da grade mais próxima (formas com a grade ligada). */
function snap(v) {
  const g = state.grid;
  return g ? Math.round(v / g) * g : v;
}

/** Pinta as células sob (x, y): um bloco N×N, ou células soltas à volta (spray). */
function addCells(path, x, y) {
  const g = path.grid;
  const keys = cellKeys.get(path);
  const put = (cx, cy) => {
    const k = `${cx},${cy}`;
    if (keys.has(k)) return;
    keys.add(k);
    path.cells.push([cx, cy]);
    playCell(cy, Math.ceil(state.canvasHeight / g));
  };
  const n = cellBrush();
  const cx = Math.floor(x / g);
  const cy = Math.floor(y / g);
  if (TOOL_DEFS[path.tool]?.spray) {
    const r = n * 2;
    for (let i = 0; i < 2; i++) {
      const dx = Math.round((Math.random() * 2 - 1) * r);
      const dy = Math.round((Math.random() * 2 - 1) * r);
      if (dx * dx + dy * dy <= r * r) put(cx + dx, cy + dy);
    }
    return;
  }
  const o = Math.floor((n - 1) / 2);
  for (let dx = 0; dx < n; dx++) for (let dy = 0; dy < n; dy++) put(cx - o + dx, cy - o + dy);
}

function addSprayParticles(path, x, y) {
  const radius = path.size * 2.2;
  const density = 6 + Math.round(path.size);
  for (let i = 0; i < density; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * radius;
    path.particles.push({
      x: x + Math.cos(angle) * dist,
      y: y + Math.sin(angle) * dist,
    });
  }
}

export function createToolHandlers(engine, history, renderer, hooks = {}) {
  function startStroke(pos, e) {
    const layer = getActiveLayer();
    if (!layer) return;
    if (layer.locked) { hooks.onLocked?.(); return; }
    if (!layer.visible) layer.visible = true;

    const def = TOOL_DEFS[state.tool];
    // Borracha numa camada sem tinta: apaga nada → fica em silêncio.
    const silent = def.eraser && !layer.paths.some((p) => !TOOL_DEFS[p.tool]?.eraser);

    history.record(snapshotPaths());

    if (state.grid) {
      // Pixel art: o traço é uma lista de células da grade.
      const cellPath = {
        tool: state.tool,
        color: state.color,
        opacity: state.opacity,
        mirrorH: state.mirrorH,
        mirrorV: state.mirrorV,
        grid: state.grid,
        cells: [],
        points: [],
      };
      cellKeys.set(cellPath, new Set());
      addCells(cellPath, pos.x, pos.y);
      layer.paths.push(cellPath);
      state.currentPath = cellPath;
      state.isDrawing = true;
      state.lastX = pos.x;
      state.lastY = pos.y;
      renderer?.beginLiveStroke();
      if (!silent) beginStroke(state.activeKey);
      return;
    }

    const path = {
      tool: state.tool,
      color: state.color,
      size: baseWidth(state.tool),
      opacity: state.opacity,
      mirrorH: state.mirrorH,
      mirrorV: state.mirrorV,
      points: [{ x: pos.x, y: pos.y, p: readPressure(e) }],
      particles: def.spray ? [] : null,
    };
    if (def.spray) addSprayParticles(path, pos.x, pos.y);

    layer.paths.push(path);
    state.currentPath = path;
    state.isDrawing = true;
    state.lastX = pos.x;
    state.lastY = pos.y;

    renderer?.beginLiveStroke();
    if (!silent) beginStroke(state.activeKey);
  }

  function startShape(pos) {
    const layer = getActiveLayer();
    if (!layer) return;
    if (layer.locked) { hooks.onLocked?.(); return; }
    if (!layer.visible) layer.visible = true;

    const shape = SHAPES.find((s) => s.key === state.activeShapeKey);
    if (!shape) return;

    history.record(snapshotPaths());

    state.shapeDraft = {
      tool: shape.tool,
      shape: TOOL_DEFS[shape.tool].shape,
      color: state.color,
      size: shapeSize(),
      opacity: state.opacity,
      mirrorH: state.mirrorH,
      mirrorV: state.mirrorV,
      x0: snap(pos.x),
      y0: snap(pos.y),
      x1: snap(pos.x),
      y1: snap(pos.y),
    };
    state.isShapeDrawing = true;
    engine.drawShapePreview(state.shapeDraft);
  }

  function pruneNoopEraser() {
    const path = state.currentPath;
    if (!path || !TOOL_DEFS[path.tool]?.eraser) return;
    const layer = getActiveLayer();
    if (!layer) return;
    const hadInk = layer.paths.slice(0, -1).some((p) => !TOOL_DEFS[p.tool]?.eraser);
    if (!hadInk) {
      layer.paths.pop();
      history.discardLast();
    }
  }

  function finalizeShape() {
    const draft = state.shapeDraft;
    const layer = getActiveLayer();
    if (!draft || !layer) return;

    engine.clearOverlay();

    if (shapeTooSmall(draft)) {
      history.discardLast();
      return;
    }

    layer.paths.push({
      tool: draft.tool,
      shape: draft.shape,
      color: draft.color,
      size: draft.size,
      opacity: draft.opacity,
      mirrorH: draft.mirrorH,
      mirrorV: draft.mirrorV,
      x0: draft.x0,
      y0: draft.y0,
      x1: draft.x1,
      y1: draft.y1,
      points: [],
    });
    renderer?.invalidate();
  }

  function extendStroke(pos, e) {
    const path = state.currentPath;
    if (!path) return;
    if (Math.hypot(pos.x - state.lastX, pos.y - state.lastY) < MIN_POINT_STEP) return;

    const def = TOOL_DEFS[path.tool];
    if (path.cells) {
      // Percorre o segmento em passos de meia célula: um gesto rápido não deixa buracos.
      const steps = Math.max(1, Math.ceil(Math.hypot(pos.x - state.lastX, pos.y - state.lastY) / (path.grid / 2)));
      for (let i = 1; i <= steps; i++) {
        addCells(path, state.lastX + ((pos.x - state.lastX) * i) / steps, state.lastY + ((pos.y - state.lastY) * i) / steps);
      }
      updateStroke(Math.hypot(pos.x - state.lastX, pos.y - state.lastY));
      state.lastX = pos.x;
      state.lastY = pos.y;
      return;
    }
    path.points.push({ x: pos.x, y: pos.y, p: readPressure(e) });
    if (def.spray) addSprayParticles(path, pos.x, pos.y);
    const speed = Math.hypot(pos.x - state.lastX, pos.y - state.lastY);
    updateStroke(speed);
    state.lastX = pos.x;
    state.lastY = pos.y;
  }

  return {
    onPointerDown(e, pos) {
      if (state.isCropping) {
        state.cropStart = { x: pos.x, y: pos.y };
        return;
      }
      ensureLayers();
      if (state.activeShapeKey) {
        startShape(pos);
        return;
      }
      startStroke(pos, e);
    },

    onPointerMove(e, pos) {
      if (state.isCropping) {
        if (state.cropStart) engine.drawCropSelection(state.cropStart.x, state.cropStart.y, pos.x, pos.y);
        return;
      }
      if (state.isShapeDrawing && state.shapeDraft) {
        state.shapeDraft.x1 = snap(pos.x);
        state.shapeDraft.y1 = snap(pos.y);
        engine.drawShapePreview(state.shapeDraft);
        return;
      }
      if (!state.isDrawing) return;
      extendStroke(pos, e);
    },

    onPointerUp(e, pos) {
      if (state.isCropping) {
        if (!state.cropStart) return;
        const rect = engine.getCropRect(state.cropStart.x, state.cropStart.y, pos.x, pos.y);
        state.cropStart = null;
        engine.clearOverlay();
        if (rect.w < 40 || rect.h < 40) return; // seleção pequena demais → continua no modo recorte
        hooks.onCrop?.(rect);
        return;
      }
      if (state.isShapeDrawing) {
        if (state.shapeDraft) {
          state.shapeDraft.x1 = snap(pos.x);
          state.shapeDraft.y1 = snap(pos.y);
          finalizeShape();
        }
        resetDrawing();
        return;
      }
      endStroke();
      pruneNoopEraser();
      renderer?.endLiveStroke();
      resetDrawing();
    },

    /** Interação interrompida (ex.: toque cancelado pelo sistema) — fecha o que estiver em curso. */
    onPointerCancel() {
      if (state.isCropping) {
        state.cropStart = null;
        engine.clearOverlay();
        return;
      }
      if (state.isShapeDrawing) {
        engine.clearOverlay();
        history.discardLast();
        resetDrawing();
        return;
      }
      if (!state.isDrawing) return;
      endStroke();
      pruneNoopEraser();
      renderer?.endLiveStroke();
      resetDrawing();
    },

    /** Desiste do que estiver em curso sem deixar rasto (ex.: virou gesto de 2 dedos). */
    abort() {
      if (state.isCropping) {
        state.cropStart = null;
        engine.clearOverlay();
        return;
      }
      if (state.isShapeDrawing) {
        engine.clearOverlay();
        history.discardLast();
        resetDrawing();
        return;
      }
      if (!state.isDrawing) return;
      endStroke();
      const layer = getActiveLayer();
      if (layer && layer.paths[layer.paths.length - 1] === state.currentPath) {
        layer.paths.pop();
        history.discardLast();
      }
      renderer?.endLiveStroke();
      resetDrawing();
    },

    startCropMode() {
      state.isCropping = true;
      state.cropStart = null;
      engine.clearOverlay();
      engine.mainCanvas.classList.add('is-crop');
    },

    cancelCropMode() {
      state.isCropping = false;
      state.cropStart = null;
      engine.clearOverlay();
      engine.mainCanvas.classList.remove('is-crop');
    },
  };
}
