import { state, resetDrawing } from './state.js';
import { getCanvasBg } from './theme.js';
import { interpolateWigglyLine, wigglySpray, wigglyDot } from './wiggle.js';

const TOOL_CONFIG = {
  pen: { widthScale: 0.7, amplitude: 2.5, alpha: 1 },
  penFine: { widthScale: 0.4, amplitude: 1.8, alpha: 1 },
  brush: { widthScale: 1.2, amplitude: 3.5, alpha: 0.9 },
  marker: { widthScale: 2.4, amplitude: 3, alpha: 0.95 },
  spray: { widthScale: 1, amplitude: 4, alpha: 0.45 },
  eraser: { widthScale: 2.8, amplitude: 3, alpha: 1 },
};

function getWidth(tool) {
  const scale = TOOL_CONFIG[tool]?.widthScale ?? 1;
  return Math.max(1, state.brushSize * scale);
}

export function createToolHandlers(engine, history) {
  function saveUndo() {
    history.push(engine.snapshot());
  }

  function drawStroke(x, y, lx, ly) {
    const tool = state.tool;
    const cfg = TOOL_CONFIG[tool];
    const seed = state.wiggleSeed;
    state.wiggleSeed += 1;

    if (tool === 'spray') {
      wigglySpray(engine.ctx, x, y, {
        color: state.color,
        radius: state.brushSize * 2.5,
        density: 10 + state.brushSize,
        amplitude: cfg.amplitude,
        alpha: cfg.alpha,
        seed,
      });
      return;
    }

    const color = tool === 'eraser' ? getCanvasBg() : state.color;
    const width = getWidth(tool);

    if (Math.hypot(x - lx, y - ly) < 0.5) {
      wigglyDot(engine.ctx, x, y, {
        color,
        size: width,
        amplitude: cfg.amplitude,
        seed,
      });
      return;
    }

    interpolateWigglyLine(engine.ctx, lx, ly, x, y, {
      color,
      width,
      amplitude: cfg.amplitude,
      alpha: cfg.alpha,
      seed,
      cap: tool === 'marker' ? 'square' : 'round',
    });
  }

  return {
    onPointerDown(e, pos) {
      if (state.isCropping) {
        state.isDrawing = true;
        state.cropStart = { x: pos.x, y: pos.y };
        return;
      }

      state.isDrawing = true;
      state.lastX = pos.x;
      state.lastY = pos.y;
      state.wiggleSeed = Math.random() * 100;

      saveUndo();
      drawStroke(pos.x, pos.y, pos.x, pos.y);
    },

    onPointerMove(e, pos) {
      if (state.isCropping && state.isDrawing && state.cropStart) {
        engine.drawCropSelection(
          state.cropStart.x,
          state.cropStart.y,
          pos.x,
          pos.y
        );
        return;
      }

      if (!state.isDrawing) return;

      drawStroke(pos.x, pos.y, state.lastX, state.lastY);
      state.lastX = pos.x;
      state.lastY = pos.y;
      state.wiggleSeed += 0.3;
    },

    onPointerUp(e, pos) {
      if (state.isCropping && state.isDrawing && state.cropStart) {
        state.cropRect = engine.getCropRect(
          state.cropStart.x,
          state.cropStart.y,
          pos.x,
          pos.y
        );
        state.isDrawing = false;
        state.cropStart = null;
        return;
      }

      resetDrawing();
    },

    startCropMode() {
      state.isCropping = true;
      state.cropRect = null;
      engine.clearOverlay();
    },

    cancelCropMode() {
      state.isCropping = false;
      state.cropRect = null;
      state.cropStart = null;
      engine.clearOverlay();
    },

    getCropRect() {
      return state.cropRect;
    },
  };
}
