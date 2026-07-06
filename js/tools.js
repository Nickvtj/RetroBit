import { state, resetDrawing, snapshotPaths, TOOL_DEFS, SHAPES, BRUSH_SIZES, getActiveLayer, ensureLayers } from './state.js';
import { beginStroke, updateStroke, endStroke } from './audio.js';
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

export function createToolHandlers(engine, history, renderer) {
  function startStroke(pos, e) {
    const layer = getActiveLayer();
    if (!layer || layer.locked) return;
    if (!layer.visible) layer.visible = true;

    const def = TOOL_DEFS[state.tool];

    history.record(snapshotPaths());

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
    beginStroke(state.activeKey);
  }

  function startShape(pos) {
    const layer = getActiveLayer();
    if (!layer || layer.locked) return;
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
      x0: pos.x,
      y0: pos.y,
      x1: pos.x,
      y1: pos.y,
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
        state.isDrawing = true;
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
      if (state.isCropping && state.isDrawing && state.cropStart) {
        engine.drawCropSelection(state.cropStart.x, state.cropStart.y, pos.x, pos.y);
        return;
      }
      if (state.isShapeDrawing && state.shapeDraft) {
        state.shapeDraft.x1 = pos.x;
        state.shapeDraft.y1 = pos.y;
        engine.drawShapePreview(state.shapeDraft);
        return;
      }
      if (!state.isDrawing) return;
      extendStroke(pos, e);
    },

    onPointerUp(e, pos) {
      if (state.isCropping && state.isDrawing && state.cropStart) {
        state.cropRect = engine.getCropRect(state.cropStart.x, state.cropStart.y, pos.x, pos.y);
        state.isDrawing = false;
        state.cropStart = null;
        return;
      }
      if (state.isShapeDrawing) {
        if (state.shapeDraft) {
          state.shapeDraft.x1 = pos.x;
          state.shapeDraft.y1 = pos.y;
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

    startCropMode() {
      state.isCropping = true;
      state.cropRect = null;
      engine.clearOverlay();
      engine.mainCanvas.classList.add('is-crop');
    },

    cancelCropMode() {
      state.isCropping = false;
      state.cropRect = null;
      state.cropStart = null;
      engine.clearOverlay();
      engine.mainCanvas.classList.remove('is-crop');
    },

    getCropRect() {
      return state.cropRect;
    },
  };
}
