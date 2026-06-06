import { state, resetInteraction, getThemeColors } from './state.js';
import {
  drawQuadraticCurve,
  drawBezierCurve,
  pointInPolygon,
} from './algorithms.js';

function setupStroke(ctx, color, width = 1, tip = 'round') {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = tip === 'square' ? 'square' : tip === 'diagonal' ? 'butt' : 'round';
  ctx.lineJoin = tip === 'square' ? 'miter' : 'round';
  ctx.setLineDash([]);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

function drawDiagonalStamp(ctx, x, y, color, size) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  const half = size / 2;
  ctx.beginPath();
  ctx.moveTo(x - half, y + half);
  ctx.lineTo(x + half, y - half);
  ctx.stroke();
  ctx.restore();
}

function applyShape(ctx, x0, y0, x1, y1, mode, drawFn) {
  const color = state.fgColor;
  setupStroke(ctx, color, 1);

  if (mode === 'fill' || mode === 'both') {
    ctx.fillStyle = color;
    drawFn(ctx, x0, y0, x1, y1, true);
  }
  if (mode === 'outline' || mode === 'both') {
    ctx.strokeStyle = color;
    drawFn(ctx, x0, y0, x1, y1, false);
  }
}

export function createToolHandlers(engine, history, ui) {
  let previewSnapshot = null;
  let curveLine = null;
  let antsAnim = null;

  function saveUndo() {
    history.push(engine.snapshot());
  }

  function restorePreview() {
    if (previewSnapshot) {
      engine.ctx.putImageData(previewSnapshot, 0, 0);
    }
  }

  function startPreview() {
    previewSnapshot = engine.snapshot();
  }

  function commitPreview() {
    previewSnapshot = null;
  }

  function drawLinePreview(x0, y0, x1, y1) {
    restorePreview();
    setupStroke(engine.ctx, state.fgColor, 1);
    engine.ctx.beginPath();
    engine.ctx.moveTo(x0, y0);
    engine.ctx.lineTo(x1, y1);
    engine.ctx.stroke();
  }

  function drawRectPreview(x0, y0, x1, y1) {
    restorePreview();
    applyShape(engine.ctx, x0, y0, x1, y1, state.shapeMode, (ctx, a, b, c, d, fill) => {
      const x = Math.min(c, a);
      const y = Math.min(d, b);
      const w = Math.abs(c - a);
      const h = Math.abs(d - b);
      if (fill) ctx.fillRect(x, y, w, h);
      else ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    });
  }

  function drawEllipsePreview(x0, y0, x1, y1) {
    restorePreview();
    applyShape(engine.ctx, x0, y0, x1, y1, state.shapeMode, (ctx, a, b, c, d, fill) => {
      const cx = (a + c) / 2;
      const cy = (b + d) / 2;
      const rx = Math.abs(c - a) / 2;
      const ry = Math.abs(d - b) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      if (fill) ctx.fill();
      else ctx.stroke();
    });
  }

  function drawRRectPreview(x0, y0, x1, y1) {
    restorePreview();
    applyShape(engine.ctx, x0, y0, x1, y1, state.shapeMode, (ctx, a, b, c, d, fill) => {
      const x = Math.min(c, a);
      const y = Math.min(d, b);
      const w = Math.abs(c - a);
      const h = Math.abs(d - b);
      const r = Math.min(12, w / 4, h / 4);
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      if (fill) ctx.fill();
      else ctx.stroke();
    });
  }

  function drawPencil(x, y, lx, ly) {
    setupStroke(engine.ctx, state.fgColor, 1, 'square');
    engine.ctx.beginPath();
    engine.ctx.moveTo(lx, ly);
    engine.ctx.lineTo(x, y);
    engine.ctx.stroke();
  }

  function drawBrush(x, y, lx, ly) {
    const { brushTip, brushSize, fgColor } = state;
    if (brushTip === 'diagonal') {
      const steps = Math.max(1, Math.hypot(x - lx, y - ly));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        drawDiagonalStamp(engine.ctx, lx + (x - lx) * t, ly + (y - ly) * t, fgColor, brushSize);
      }
      return;
    }
    setupStroke(engine.ctx, fgColor, brushSize, brushTip);
    engine.ctx.beginPath();
    engine.ctx.moveTo(lx, ly);
    engine.ctx.lineTo(x, y);
    engine.ctx.stroke();
  }

  function drawAirbrush(x, y) {
    const density = 12;
    const radius = state.brushSize * 2;
    setupStroke(engine.ctx, state.fgColor, 1);
    engine.ctx.globalAlpha = 0.25;
    for (let i = 0; i < density; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * radius;
      const px = x + Math.cos(angle) * dist;
      const py = y + Math.sin(angle) * dist;
      engine.ctx.fillRect(Math.floor(px), Math.floor(py), 1, 1);
    }
    engine.ctx.globalAlpha = 1;
  }

  function drawEraser(x, y, lx, ly) {
    engine.ctx.save();
    engine.ctx.strokeStyle = getThemeColors().eraserColor;
    engine.ctx.lineWidth = state.brushSize * 2;
    engine.ctx.lineCap = 'round';
    engine.ctx.lineJoin = 'round';
    engine.ctx.beginPath();
    engine.ctx.moveTo(lx, ly);
    engine.ctx.lineTo(x, y);
    engine.ctx.stroke();
    engine.ctx.restore();
  }

  function drawFreeformOverlay(points) {
    const ctx = engine.overlayCtx;
    ctx.clearRect(0, 0, engine.width, engine.height);
    if (points.length < 2) return;
    ctx.strokeStyle = getThemeColors().selectionStroke;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawRectSelectOverlay(x0, y0, x1, y1) {
    const ctx = engine.overlayCtx;
    ctx.clearRect(0, 0, engine.width, engine.height);
    const x = Math.min(x0, x1);
    const y = Math.min(y0, y1);
    const w = Math.abs(x1 - x0);
    const h = Math.abs(y1 - y0);
    ctx.strokeStyle = getThemeColors().selectionStroke;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    ctx.setLineDash([]);
  }

  function extractSelection(bounds, freeformPoints = null) {
    const { x, y, w, h } = bounds;
    const img = engine.ctx.getImageData(x, y, w, h);

    if (freeformPoints) {
      const local = freeformPoints.map((p) => ({ x: p.x - x, y: p.y - y }));
      const data = img.data;
      for (let py = 0; py < h; py++) {
        for (let px = 0; px < w; px++) {
          if (!pointInPolygon(px + x, py + y, freeformPoints)) {
            const i = (py * w + px) * 4;
            data[i + 3] = 0;
          }
        }
      }
    }

    engine.ctx.clearRect(x, y, w, h);
    return { imageData: img, bounds, freeformPoints };
  }

  function startAnts() {
    stopAnts();
    antsAnim = setInterval(() => {
      state.antsOffset = (state.antsOffset + 1) % 8;
      if (state.selection) {
        engine.drawMarchingAnts(state.selection, state.antsOffset);
      }
    }, 100);
  }

  function stopAnts() {
    if (antsAnim) {
      clearInterval(antsAnim);
      antsAnim = null;
    }
  }

  function finalizeRectSelection(x0, y0, x1, y1) {
    const x = Math.min(x0, x1);
    const y = Math.min(y0, y1);
    const w = Math.max(1, Math.abs(x1 - x0));
    const h = Math.max(1, Math.abs(y1 - y0));
    saveUndo();
    state.selection = extractSelection({ x, y, w, h });
    engine.clearOverlay();
    startAnts();
  }

  function finalizeFreeformSelection(points) {
    if (points.length < 3) return;
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const x = Math.floor(Math.min(...xs));
    const y = Math.floor(Math.min(...ys));
    const w = Math.ceil(Math.max(...xs)) - x + 1;
    const h = Math.ceil(Math.max(...ys)) - y + 1;
    saveUndo();
    state.selection = extractSelection({ x, y, w, h }, points);
    engine.clearOverlay();
    startAnts();
  }

  function drawPolygonOverlay(points, cursor) {
    const ctx = engine.overlayCtx;
    ctx.clearRect(0, 0, engine.width, engine.height);
    if (!points.length) return;
    ctx.strokeStyle = state.fgColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    if (cursor) ctx.lineTo(cursor.x, cursor.y);
    ctx.stroke();
    points.forEach((p) => {
      ctx.fillRect(p.x - 1, p.y - 1, 3, 3);
    });
  }

  function closePolygon() {
    const pts = state.polygonPoints;
    if (pts.length < 3) return;
    saveUndo();
    const ctx = engine.ctx;
    setupStroke(ctx, state.fgColor, 1);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    if (state.shapeMode === 'fill' || state.shapeMode === 'both') ctx.fill();
    if (state.shapeMode === 'outline' || state.shapeMode === 'both') ctx.stroke();
    state.polygonPoints = [];
    engine.clearOverlay();
  }

  function drawCurveOnCanvas(line, c1, c2) {
    setupStroke(engine.ctx, state.fgColor, 1);
    if (c2) {
      drawBezierCurve(engine.ctx, line.x0, line.y0, c1.x, c1.y, c2.x, c2.y, line.x1, line.y1);
    } else if (c1) {
      drawQuadraticCurve(engine.ctx, line.x0, line.y0, c1.x, c1.y, line.x1, line.y1);
    } else {
      engine.ctx.beginPath();
      engine.ctx.moveTo(line.x0, line.y0);
      engine.ctx.lineTo(line.x1, line.y1);
      engine.ctx.stroke();
    }
  }

  function previewCurve(line, c1, c2) {
    restorePreview();
    drawCurveOnCanvas(line, c1, c2);
  }

  const handlers = {
    onPointerDown(e, pos) {
      state.isDrawing = true;
      state.startX = pos.x;
      state.startY = pos.y;
      state.lastX = pos.x;
      state.lastY = pos.y;

      switch (state.tool) {
        case 'fill':
          saveUndo();
          engine.doFill(pos.x, pos.y, state.fgColor);
          state.isDrawing = false;
          break;

        case 'picker':
          state.fgColor = engine.pickColor(pos.x, pos.y);
          ui.updateColorSelection();
          ui.updateStatus();
          state.isDrawing = false;
          break;

        case 'zoom':
          engine.setZoom(state.zoomLevel);
          state.displayZoom = state.zoomLevel;
          engine.redrawGrid();
          ui.updateStatus();
          state.isDrawing = false;
          break;

        case 'text':
          ui.openTextInput(pos.x, pos.y);
          state.isDrawing = false;
          break;

        case 'polygon':
          if (state.polygonPoints.length >= 3) {
            const first = state.polygonPoints[0];
            if (Math.hypot(pos.x - first.x, pos.y - first.y) < 8) {
              closePolygon();
              state.isDrawing = false;
              break;
            }
          }
          state.polygonPoints.push({ x: pos.x, y: pos.y });
          drawPolygonOverlay(state.polygonPoints);
          state.isDrawing = false;
          break;

        case 'curve':
          if (state.curvePhase === 1 || state.curvePhase === 2) {
            state.curveDrag = { x: pos.x, y: pos.y };
          }
          break;

        case 'freeform-select':
          state.freeformPoints = [{ x: pos.x, y: pos.y }];
          break;

        case 'pencil':
        case 'brush':
        case 'airbrush':
        case 'eraser':
          saveUndo();
          break;

        case 'line':
        case 'rect':
        case 'ellipse':
        case 'rrect':
        case 'rect-select':
          startPreview();
          break;
      }
    },

    onPointerMove(e, pos) {
      ui.updateCoords(pos.x, pos.y);

      if (!state.isDrawing) {
        if (state.tool === 'polygon' && state.polygonPoints.length) {
          drawPolygonOverlay(state.polygonPoints, pos);
        }
        return;
      }

      switch (state.tool) {
        case 'pencil':
          drawPencil(pos.x, pos.y, state.lastX, state.lastY);
          state.lastX = pos.x;
          state.lastY = pos.y;
          break;

        case 'brush':
          drawBrush(pos.x, pos.y, state.lastX, state.lastY);
          state.lastX = pos.x;
          state.lastY = pos.y;
          break;

        case 'airbrush':
          drawAirbrush(pos.x, pos.y);
          break;

        case 'eraser':
          drawEraser(pos.x, pos.y, state.lastX, state.lastY);
          state.lastX = pos.x;
          state.lastY = pos.y;
          break;

        case 'freeform-select':
          state.freeformPoints.push({ x: pos.x, y: pos.y });
          drawFreeformOverlay(state.freeformPoints);
          break;

        case 'rect-select':
          drawRectSelectOverlay(state.startX, state.startY, pos.x, pos.y);
          break;

        case 'line':
          drawLinePreview(state.startX, state.startY, pos.x, pos.y);
          break;

        case 'rect':
          drawRectPreview(state.startX, state.startY, pos.x, pos.y);
          break;

        case 'ellipse':
          drawEllipsePreview(state.startX, state.startY, pos.x, pos.y);
          break;

        case 'rrect':
          drawRRectPreview(state.startX, state.startY, pos.x, pos.y);
          break;

        case 'curve':
          if ((state.curvePhase === 1 || state.curvePhase === 2) && state.curveDrag) {
            const c1 = state.curvePhase === 1 ? { x: pos.x, y: pos.y } : state.curvePoints[0];
            const c2 = state.curvePhase === 2 ? { x: pos.x, y: pos.y } : null;
            previewCurve(curveLine, c1, c2);
          }
          break;
      }
    },

    onPointerUp(e, pos) {
      if (!state.isDrawing) return;

      switch (state.tool) {
        case 'freeform-select':
          finalizeFreeformSelection(state.freeformPoints || []);
          state.freeformPoints = [];
          break;

        case 'rect-select':
          finalizeRectSelection(state.startX, state.startY, pos.x, pos.y);
          break;

        case 'line':
          restorePreview();
          saveUndo();
          setupStroke(engine.ctx, state.fgColor, 1);
          engine.ctx.beginPath();
          engine.ctx.moveTo(state.startX, state.startY);
          engine.ctx.lineTo(pos.x, pos.y);
          engine.ctx.stroke();
          commitPreview();
          break;

        case 'rect':
          restorePreview();
          saveUndo();
          drawRectPreview(state.startX, state.startY, pos.x, pos.y);
          commitPreview();
          break;

        case 'ellipse':
          restorePreview();
          saveUndo();
          drawEllipsePreview(state.startX, state.startY, pos.x, pos.y);
          commitPreview();
          break;

        case 'rrect':
          restorePreview();
          saveUndo();
          drawRRectPreview(state.startX, state.startY, pos.x, pos.y);
          commitPreview();
          break;

        case 'curve':
          if (state.curvePhase === 0) {
            saveUndo();
            startPreview();
            curveLine = { x0: state.startX, y0: state.startY, x1: pos.x, y1: pos.y };
            drawLinePreview(state.startX, state.startY, pos.x, pos.y);
            commitPreview();
            state.curvePhase = 1;
            state.curvePoints = [];
            ui.showCurveHint(1);
          } else if (state.curvePhase === 1 && state.curveDrag) {
            state.curvePoints[0] = { x: pos.x, y: pos.y };
            state.curvePhase = 2;
            state.curveDrag = null;
            ui.showCurveHint(2);
          } else if (state.curvePhase === 2 && state.curveDrag) {
            state.curvePoints[1] = { x: pos.x, y: pos.y };
            drawCurveOnCanvas(curveLine, state.curvePoints[0], state.curvePoints[1]);
            previewSnapshot = null;
            curveLine = null;
            resetInteraction();
          }
          break;
      }

      state.isDrawing = false;
    },

    onDblClick(e, pos) {
      if (state.tool === 'polygon') closePolygon();
    },

    cut() {
      if (!state.selection) return;
      handlers.copy();
      saveUndo();
      const { x, y, w, h } = state.selection.bounds;
      engine.ctx.clearRect(x, y, w, h);
      state.selection = null;
      stopAnts();
      engine.clearOverlay();
    },

    copy() {
      if (!state.selection) return;
      state.clipboard = {
        imageData: new ImageData(
          new Uint8ClampedArray(state.selection.imageData.data),
          state.selection.imageData.width,
          state.selection.imageData.height
        ),
        bounds: { ...state.selection.bounds },
      };
    },

    paste() {
      if (!state.clipboard) return;
      saveUndo();
      const { imageData, bounds } = state.clipboard;
      const x = Math.floor((engine.width - bounds.w) / 2);
      const y = Math.floor((engine.height - bounds.h) / 2);
      engine.ctx.putImageData(imageData, x, y);
      state.selection = {
        imageData: new ImageData(
          new Uint8ClampedArray(imageData.data),
          imageData.width,
          imageData.height
        ),
        bounds: { x, y, w: bounds.w, h: bounds.h },
      };
      startAnts();
    },

    clearSelection() {
      state.selection = null;
      stopAnts();
      engine.clearOverlay();
    },

    stopAnts,
  };

  return handlers;
}
