import { TOOLS, TOOL_SVGS, DRAW_PALETTE, state } from './state.js';

const TOOL_LABELS = Object.fromEntries(TOOLS.map((t) => [t.id, t.label]));

export function createUI(callbacks) {
  const els = {
    toolGrid: document.getElementById('tool-grid'),
    colorPalette: document.getElementById('color-palette'),
    statusCoords: document.getElementById('status-coords'),
    statusCanvas: document.getElementById('status-canvas'),
    statusTool: document.getElementById('status-tool'),
    statusColor: document.getElementById('status-color'),
    statusSwatch: document.getElementById('status-swatch'),
    statusZoom: document.getElementById('status-zoom'),
    dockSize: document.getElementById('dock-size'),
    dockTip: document.getElementById('dock-tip'),
    dockShape: document.getElementById('dock-shape'),
    modalBackdrop: document.getElementById('modal-backdrop'),
    formNew: document.getElementById('form-new'),
    fileInput: document.getElementById('file-input'),
    canvasStage: document.getElementById('canvas-stage'),
  };

  function buildToolGrid() {
    els.toolGrid.innerHTML = TOOLS.map((t) => {
      const svg = TOOL_SVGS[t.icon] || '';
      const active = t.id === state.tool ? ' active' : '';
      return `<button class="tool-btn${active}" type="button" data-tool="${t.id}" title="${t.label}" aria-label="${t.label}">
        <svg viewBox="0 0 16 16" aria-hidden="true">${svg}</svg>
      </button>`;
    }).join('');

    els.toolGrid.querySelectorAll('.tool-btn').forEach((btn) => {
      btn.addEventListener('click', () => selectTool(btn.dataset.tool));
    });
  }

  function buildPalette() {
    els.colorPalette.innerHTML = DRAW_PALETTE.map(
      (c) => `<button class="color-swatch${c === state.fgColor ? ' active' : ''}" type="button" data-color="${c}" style="--swatch:${c}" title="${c}" aria-label="Cor ${c}"></button>`
    ).join('');

    els.colorPalette.querySelectorAll('.color-swatch').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.fgColor = btn.dataset.color;
        updateColorSelection();
        updateStatus();
      });
    });
  }

  function selectTool(toolId) {
    state.tool = toolId;
    els.toolGrid.querySelectorAll('.tool-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.tool === toolId);
    });
    updateDock();
    updateStatus();
    callbacks.onToolChange?.(toolId);
  }

  function updateDock() {
    const t = state.tool;
    els.dockSize.hidden = !['brush', 'airbrush', 'eraser'].includes(t);
    els.dockTip.hidden = t !== 'brush';
    els.dockShape.hidden = !['line', 'rect', 'ellipse'].includes(t);
  }

  function updateColorSelection() {
    els.colorPalette.querySelectorAll('.color-swatch').forEach((b) => {
      b.classList.toggle('active', b.dataset.color === state.fgColor);
    });
    if (els.statusSwatch) {
      els.statusSwatch.style.setProperty('--swatch-preview', state.fgColor);
    }
  }

  function updateCoords(x, y) {
    els.statusCoords.textContent = `x: ${Math.round(x)} · y: ${Math.round(y)}`;
  }

  function updateStatus(engine) {
    els.statusTool.textContent = TOOL_LABELS[state.tool] || state.tool;
    els.statusColor.textContent = state.fgColor;
    updateColorSelection();
    if (engine) {
      els.statusCanvas.textContent = `${engine.width}×${engine.height}`;
      els.statusZoom.textContent = `zoom: ${engine.displayZoom}×`;
    }
  }

  function bindDock() {
    document.querySelectorAll('[data-brush-size]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.brushSize = parseInt(btn.dataset.brushSize, 10);
        document.querySelectorAll('[data-brush-size]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    document.querySelectorAll('[data-brush-tip]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.brushTip = btn.dataset.brushTip;
        document.querySelectorAll('[data-brush-tip]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    document.querySelectorAll('[data-shape-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.shapeMode = btn.dataset.shapeMode;
        document.querySelectorAll('[data-shape-mode]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  }

  function closeAllMenus() {
    document.querySelectorAll('.menu-wrap.is-open').forEach((wrap) => {
      wrap.classList.remove('is-open');
      wrap.querySelector('.menu-drop').hidden = true;
    });
  }

  function bindMenus() {
    document.querySelectorAll('.menu-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const wrap = btn.closest('.menu-wrap');
        const drop = wrap.querySelector('.menu-drop');
        const wasOpen = wrap.classList.contains('is-open');
        closeAllMenus();
        if (!wasOpen) {
          wrap.classList.add('is-open');
          drop.hidden = false;
        }
      });
    });

    document.querySelectorAll('.menu-drop [data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        callbacks.onMenuAction?.(btn.dataset.action);
        closeAllMenus();
      });
    });

    document.addEventListener('click', closeAllMenus);
  }

  function showNewDialog() {
    els.modalBackdrop.hidden = false;
  }

  function hideModal() {
    els.modalBackdrop.hidden = true;
  }

  function bindModal(modalCallbacks) {
    els.formNew.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(els.formNew);
      modalCallbacks.onNewCanvas?.(
        parseInt(fd.get('width'), 10),
        parseInt(fd.get('height'), 10)
      );
      hideModal();
    });
    document.querySelectorAll('[data-modal-cancel]').forEach((btn) => {
      btn.addEventListener('click', hideModal);
    });
  }

  function openFilePicker() {
    els.fileInput.click();
  }

  function bindFileInput(onFile) {
    els.fileInput.addEventListener('change', () => {
      const file = els.fileInput.files[0];
      if (file) onFile(file);
      els.fileInput.value = '';
    });
  }

  function openTextInput(x, y, engine, onCommit) {
    const existing = els.canvasStage.querySelector('.text-input-overlay');
    if (existing) existing.remove();

    const ta = document.createElement('textarea');
    ta.className = 'text-input-overlay';
    ta.style.left = `${x * engine.displayZoom}px`;
    ta.style.top = `${y * engine.displayZoom}px`;
    ta.style.color = state.fgColor;
    ta.style.fontSize = `${12 * engine.displayZoom}px`;
    ta.rows = 1;
    els.canvasStage.appendChild(ta);
    ta.focus();

    const commit = () => {
      const text = ta.value.trim();
      if (text) onCommit(x, y, text);
      ta.remove();
    };

    ta.addEventListener('blur', commit);
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ta.blur(); }
      if (e.key === 'Escape') ta.remove();
    });
  }

  function showCurveHint(phase = 1) {
    els.statusTool.textContent = phase === 2 ? 'curva · 2º ponto' : 'curva · 1º ponto';
  }

  function onThemeChanged() {
    buildPalette();
    updateColorSelection();
    updateStatus();
  }

  function init() {
    buildToolGrid();
    buildPalette();
    bindDock();
    bindMenus();
    updateDock();
  }

  return {
    init,
    selectTool,
    updateColorSelection,
    updateCoords,
    updateStatus,
    showNewDialog,
    hideModal,
    bindModal,
    openFilePicker,
    bindFileInput,
    openTextInput,
    showCurveHint,
    onThemeChanged,
  };
}
