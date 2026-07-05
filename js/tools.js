import { state, resetDrawing, snapshotPaths, TOOL_DEFS } from './state.js';
import { beginStroke, updateStroke, endStroke } from './audio.js';

/** Largura base do traço para uma ferramenta. */
function baseWidth(tool) {
  const scale = TOOL_DEFS[tool]?.widthScale ?? 1;
  return Math.max(1, state.brushSize * scale);
}

/** Pressão normalizada: rato reporta 0 sem botão / 0.5 com botão → fallback 0.5. */
function readPressure(e) {
  return e.pressure > 0 ? e.pressure : 0.5;
}

/** Espalha partículas do spray à volta de (x, y) e guarda-as no path. */
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

export function createToolHandlers(engine, history) {
  function startStroke(pos, e) {
    const def = TOOL_DEFS[state.tool];

    // Regista o estado ANTES de acrescentar o traço → undo remove-o inteiro.
    history.record(snapshotPaths());

    const path = {
      tool: state.tool,
      color: state.color,
      size: baseWidth(state.tool),
      opacity: state.opacity,
      points: [{ x: pos.x, y: pos.y, p: readPressure(e) }],
      particles: def.spray ? [] : null,
    };
    if (def.spray) addSprayParticles(path, pos.x, pos.y);

    state.paths.push(path);
    state.currentPath = path;
    state.isDrawing = true;
    state.lastX = pos.x;
    state.lastY = pos.y;

    beginStroke(state.activeKey); // som contínuo próprio da caneta
  }

  function extendStroke(pos, e) {
    const path = state.currentPath;
    if (!path) return;
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
      startStroke(pos, e);
    },

    onPointerMove(e, pos) {
      if (state.isCropping && state.isDrawing && state.cropStart) {
        engine.drawCropSelection(state.cropStart.x, state.cropStart.y, pos.x, pos.y);
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
      endStroke();
      resetDrawing();
    },

    startCropMode() {
      state.isCropping = true;
      state.cropRect = null;
      engine.clearOverlay();
      engine.mainCanvas.classList.add('is-crop'); // repõe a mira durante o recorte
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
