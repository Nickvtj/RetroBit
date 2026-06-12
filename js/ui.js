import { TOOLS, BRUSH_SIZES, state } from './state.js';
import { getTintedToolUrl } from './tool-art.js';

export function createUI(callbacks) {
  const els = {
    splash: document.getElementById('splash'),
    app: document.getElementById('app'),
    btnStart: document.getElementById('btn-start'),
    toolList: document.getElementById('tool-list'),
    colorInput: document.getElementById('color-input'),
    btnExport: document.getElementById('btn-export'),
    btnCrop: document.getElementById('btn-crop'),
    btnUndo: document.getElementById('btn-undo'),
    btnRedo: document.getElementById('btn-redo'),
    btnClear: document.getElementById('btn-clear'),
    btnSizeUp: document.getElementById('btn-size-up'),
    btnSizeDown: document.getElementById('btn-size-down'),
    sizePreview: document.getElementById('size-preview'),
    cropModal: document.getElementById('crop-modal'),
    cropPreview: document.getElementById('crop-preview'),
    btnCropCancel: document.getElementById('btn-crop-cancel'),
    btnCropApply: document.getElementById('btn-crop-apply'),
    btnThemeToggle: document.getElementById('menu-theme-toggle'),
    menuView: document.getElementById('menu-view'),
  };

  async function applyToolColors() {
    const buttons = els.toolList.querySelectorAll('.wp-tool');
    await Promise.all([...buttons].map(async (btn) => {
      const t = TOOLS.find((x) => x.key === btn.dataset.key);
      if (!t) return;
      const img = btn.querySelector('img');
      img.src = await getTintedToolUrl(t, state.color, state.theme);
    }));
  }

  function buildToolList() {
    els.toolList.innerHTML = TOOLS.map((t) => {
      const active = t.key === state.activeKey ? ' is-active' : '';
      const solo = t.key === 'eraser' ? ' wp-tool--eraser' : '';
      return `<button class="wp-tool${active}${solo}" type="button" data-key="${t.key}" title="${t.label}">
        <img src="${t.img}" alt="${t.label}" draggable="false">
      </button>`;
    }).join('');

    els.toolList.querySelectorAll('.wp-tool').forEach((btn) => {
      btn.addEventListener('click', () => selectTool(btn.dataset.key));
    });
    applyToolColors();
  }

  function selectTool(key) {
    const t = TOOLS.find((x) => x.key === key);
    if (!t) return;
    state.activeKey = key;
    state.tool = t.tool;
    callbacks.onToolChange?.(t.tool);
    els.toolList.querySelectorAll('.wp-tool').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.key === key);
    });
  }

  function updateColorUI() {
    const colorTip = document.getElementById('color-tip');
    if (colorTip) colorTip.style.background = state.color;
    els.sizePreview.style.background = state.color;
    applyToolColors();
  }

  function updateSizePreview() {
    const px = Math.max(4, Math.min(22, state.brushSize + 2));
    els.sizePreview.style.width = `${px}px`;
    els.sizePreview.style.height = `${px}px`;
  }

  function changeSize(delta) {
    const next = state.brushSizeIndex + delta;
    if (next < 0 || next >= BRUSH_SIZES.length) return;
    state.brushSizeIndex = next;
    state.brushSize = BRUSH_SIZES[next];
    updateSizePreview();
  }

  function showCropModal(previewCanvas) {
    els.cropPreview.width = previewCanvas.width;
    els.cropPreview.height = previewCanvas.height;
    els.cropPreview.getContext('2d').drawImage(previewCanvas, 0, 0);
    els.cropModal.hidden = false;
  }

  function hideCropModal() {
    els.cropModal.hidden = true;
  }

  function startApp() {
    els.splash.hidden = true;
    els.app.hidden = false;
  }

  function bindMenu() {
    document.querySelectorAll('[data-menu-trigger]').forEach((trigger) => {
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = trigger.dataset.menuTrigger;
        const menu = document.getElementById(`menu-${id}`);
        if (!menu) return;
        document.querySelectorAll('.menubar__drop').forEach((m) => {
          if (m !== menu) m.hidden = true;
        });
        menu.hidden = !menu.hidden;
      });
    });

    els.btnThemeToggle?.addEventListener('click', () => {
      callbacks.onToggleTheme?.();
      els.menuView.hidden = true;
    });

    document.addEventListener('click', () => {
      document.querySelectorAll('.menubar__drop').forEach((m) => { m.hidden = true; });
    });
  }

  function bindEvents() {
    els.btnStart.addEventListener('click', startApp);
    els.colorInput.addEventListener('input', () => {
      state.color = els.colorInput.value;
      updateColorUI();
    });
    els.btnExport.addEventListener('click', () => callbacks.onExport?.());
    els.btnCrop.addEventListener('click', () => callbacks.onCropStart?.());
    els.btnUndo.addEventListener('click', () => callbacks.onUndo?.());
    els.btnRedo.addEventListener('click', () => callbacks.onRedo?.());
    els.btnClear.addEventListener('click', () => callbacks.onClear?.());
    els.btnSizeUp.addEventListener('click', () => changeSize(1));
    els.btnSizeDown.addEventListener('click', () => changeSize(-1));
    els.btnCropCancel.addEventListener('click', () => {
      hideCropModal();
      callbacks.onCropCancel?.();
    });
    els.btnCropApply.addEventListener('click', () => {
      hideCropModal();
      callbacks.onCropApply?.();
    });
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        callbacks.onUndo?.();
      }
      if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
        e.preventDefault();
        callbacks.onRedo?.();
      }
    });
    bindMenu();
  }

  function init() {
    buildToolList();
    els.colorInput.value = state.color;
    updateColorUI();
    updateSizePreview();
    bindEvents();
  }

  return { init, selectTool, showCropModal, hideCropModal, updateSizePreview, updateColorUI };
}
