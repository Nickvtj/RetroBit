import { TOOLS, SHAPES, BRUSH_SIZES, OPACITIES, RESOLUTIONS, state } from './state.js';
import { getTintedToolUrl } from './tool-art.js';
import { playSwitch, playStart, resumeAudio } from './audio.js';
import { listProjects, deleteProject, renameProject, getProject } from './projects.js';

/* ── Paleta partilhada (cor da ferramenta e cor do fundo) ── */
function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const c = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
function buildPalette() {
  const hues = [0, 20, 40, 65, 90, 140, 175, 200, 225, 260, 290, 320];
  const lights = [80, 64, 50, 36];
  const s = [];
  for (const l of lights) for (const h of hues) s.push(hslToHex(h, 72, l));
  for (let i = 0; i < hues.length; i++) {
    const v = Math.round((i / (hues.length - 1)) * 255).toString(16).padStart(2, '0');
    s.push(`#${v}${v}${v}`);
  }
  return s;
}

export function createUI(callbacks) {
  const $ = (id) => document.getElementById(id);
  const els = {
    splash: $('splash'), gallery: $('gallery'), app: $('app'), wipe: $('wipe'),
    btnStart: $('btn-start'), galleryGrid: $('gallery-grid'), btnBack: $('btn-back'),
    toolList: $('tool-list'),
    btnClear: $('btn-clear'),
    btnSave: $('btn-save'), btnExportGif: $('btn-export-gif'),
    btnBackground: $('btn-background'), btnCrop: $('btn-crop'),
    btnUndo: $('btn-undo'), btnRedo: $('btn-redo'),
    btnMirrorH: $('btn-mirror-h'), btnMirrorV: $('btn-mirror-v'),
    btnShapeRect: $('btn-shape-rect'), btnShapeEllipse: $('btn-shape-ellipse'), btnShapeLine: $('btn-shape-line'),
    colorModal: $('color-modal'), colorGrid: $('color-grid'), colorTitle: $('color-win-title'),
    colorCurrent: $('color-current'), colorHex: $('color-hex'), colorClose: $('color-close'),
    mOpDown: $('modal-op-down'), mOpUp: $('modal-op-up'), mOpVal: $('modal-op-val'),
    mSizeDown: $('modal-size-down'), mSizeUp: $('modal-size-up'), mSizeDot: $('modal-size-dot'),
    bgModal: $('bg-modal'), bgGrid: $('bg-grid'), bgCurrent: $('bg-current'),
    bgHex: $('bg-hex'), bgClose: $('bg-close'),
    resModal: $('res-modal'), resList: $('res-list'), resClose: $('res-close'),
    projModal: $('proj-modal'), projTitle: $('proj-win-title'), projClose: $('proj-close'),
    projRename: $('proj-rename'), projDelete: $('proj-delete'),
    renameModal: $('rename-modal'), renameInput: $('rename-input'), renameClose: $('rename-close'),
    renameCancel: $('rename-cancel'), renameConfirm: $('rename-confirm'),
    delModal: $('del-modal'), delName: $('del-name'), delClose: $('del-close'),
    delCancel: $('del-cancel'), delConfirm: $('del-confirm'),
  };
  let colorTargetKey = null;
  let colorTargetShapeKey = null;
  let menuTargetId = null;

  /* ── Transição íris pixelada ────────────────────────────────
     Desenha um círculo numa grelha de baixa resolução (~84px) que o CSS amplia
     com image-rendering:pixelated → círculo chunky, a crescer aos saltos. */
  function iris(swap) {
    const c = els.wipe;
    c.hidden = false;
    const W = 84;
    const H = Math.max(2, Math.round(W * window.innerHeight / window.innerWidth));
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const maxR = Math.hypot(W, H) / 2 + 1;
    const steps = 7;
    const dt = 45;
    let step = 0;
    const draw = (r) => {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2);
      ctx.fill();
    };
    const cover = () => {
      step++;
      draw(maxR * step / steps);
      if (step < steps) setTimeout(cover, dt);
      else { swap(); setTimeout(reveal, dt); }
    };
    const reveal = () => {
      step--;
      if (step <= 0) { ctx.clearRect(0, 0, W, H); c.hidden = true; return; }
      draw(maxR * step / steps);
      setTimeout(reveal, dt);
    };
    cover();
  }

  function showOnly(el) {
    [els.splash, els.gallery, els.app].forEach((s) => { s.hidden = s !== el; });
  }

  /* ── Galeria ────────────────────────────────────────────── */
  function renderGallery() {
    const projects = listProjects();
    const tiles = [`
      <button type="button" class="tile tile--new" data-new="1">
        <span class="tile__plus">+</span>
        <span class="tile__name">Novo projeto</span>
      </button>`];
    for (const p of projects) {
      const thumb = p.thumb
        ? `<img src="${p.thumb}" alt="" draggable="false">`
        : '<span class="tile__empty"></span>';
      tiles.push(`
        <div class="tile" data-open="${p.id}">
          <div class="tile__thumb">${thumb}
            <button type="button" class="tile__menu" data-menu="${p.id}" title="renomear ou excluir">✎</button>
          </div>
          <span class="tile__name">${p.name}</span>
        </div>`);
    }
    els.galleryGrid.innerHTML = tiles.join('');

    els.galleryGrid.querySelector('[data-new]')?.addEventListener('click', () => {
      resumeAudio();
      iris(() => { callbacks.onNewProject?.(); showOnly(els.app); callbacks.onAppReady?.(); });
      playStart();
    });
    els.galleryGrid.querySelectorAll('[data-open]').forEach((tile) => {
      tile.addEventListener('click', (e) => {
        if (e.target.closest('[data-menu]')) return;
        resumeAudio();
        const id = tile.dataset.open;
        iris(() => { callbacks.onOpenProject?.(id); showOnly(els.app); callbacks.onAppReady?.(); });
        playStart();
      });
    });
    els.galleryGrid.querySelectorAll('[data-menu]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openProjMenu(btn.dataset.menu);
      });
    });
  }

  /* ── Menu / renomear / apagar projeto ───────────────────── */
  function openProjMenu(id) {
    const p = getProject(id);
    if (!p) return;
    menuTargetId = id;
    els.projTitle.textContent = p.name;
    els.projModal.hidden = false;
  }
  function openRename() {
    const p = getProject(menuTargetId);
    if (!p) return;
    els.projModal.hidden = true;
    els.renameInput.value = p.name;
    els.renameModal.hidden = false;
    els.renameInput.focus();
    els.renameInput.select();
  }
  function confirmRename() {
    const v = els.renameInput.value.trim();
    if (v) renameProject(menuTargetId, v);
    els.renameModal.hidden = true;
    renderGallery();
  }
  function openDelete() {
    const p = getProject(menuTargetId);
    if (!p) return;
    els.projModal.hidden = true;
    els.delName.textContent = p.name;
    els.delModal.hidden = false;
  }
  function confirmDelete() {
    deleteProject(menuTargetId);
    els.delModal.hidden = true;
    renderGallery();
  }

  /* ── Rail de ferramentas ────────────────────────────────── */
  async function applyToolColors() {
    await Promise.all([...els.toolList.querySelectorAll('.wp-tool')].map(async (btn) => {
      const t = TOOLS.find((x) => x.key === btn.dataset.key);
      if (!t) return;
      btn.querySelector('img').src = await getTintedToolUrl(t, state.toolColors[t.key], state.theme);
    }));
  }
  function buildToolList() {
    els.toolList.innerHTML = TOOLS.map((t) => {
      const active = t.key === state.activeKey ? ' is-active' : '';
      const solo = t.key === 'eraser' ? ' wp-tool--eraser' : '';
      return `<button class="wp-tool${active}${solo}" type="button" data-key="${t.key}" title="${t.label}">
        <img src="${t.img}" alt="${t.label}" draggable="false"></button>`;
    }).join('');
    els.toolList.querySelectorAll('.wp-tool').forEach((btn) => {
      btn.addEventListener('click', () => selectTool(btn.dataset.key));
    });
    applyToolColors();
  }

  function syncActiveSettings() {
    if (state.activeShapeKey) {
      syncShapeSettings();
      return;
    }
    const k = state.activeKey;
    state.color = state.toolColors[k];
    state.brushSizeIndex = state.toolSizes[k];
    state.brushSize = BRUSH_SIZES[state.brushSizeIndex];
    state.opacity = state.toolOpacity[k];
  }

  function syncShapeSettings() {
    const k = state.activeShapeKey;
    if (!k) return;
    state.color = state.shapeColors[k];
    state.brushSizeIndex = state.shapeSizes[k];
    state.brushSize = BRUSH_SIZES[state.brushSizeIndex];
    state.opacity = state.shapeOpacity[k];
    const shape = SHAPES.find((s) => s.key === k);
    if (shape) state.tool = shape.tool;
  }

  function clearShapeSelection() {
    state.activeShapeKey = null;
    [els.btnShapeRect, els.btnShapeEllipse, els.btnShapeLine].forEach((b) => {
      if (!b) return;
      b.classList.remove('is-active');
      b.setAttribute('aria-pressed', 'false');
    });
  }

  function updateShapeButtons() {
    [els.btnShapeRect, els.btnShapeEllipse, els.btnShapeLine].forEach((b) => {
      if (!b) return;
      const on = b.dataset.shape === state.activeShapeKey;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  function selectTool(key) {
    const t = TOOLS.find((x) => x.key === key);
    if (!t) return;
    resumeAudio();
    if (key === state.activeKey && !state.activeShapeKey) { openToolModal(t); return; }
    clearShapeSelection();
    state.activeKey = key;
    state.tool = t.tool;
    syncActiveSettings();
    els.toolList.querySelectorAll('.wp-tool').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.key === key);
    });
    playSwitch();
    callbacks.onToolChange?.(t.tool);
  }

  function selectShape(key) {
    const s = SHAPES.find((x) => x.key === key);
    if (!s) return;
    resumeAudio();
    if (key === state.activeShapeKey) { openShapeModal(s); return; }
    state.activeShapeKey = key;
    state.tool = s.tool;
    syncShapeSettings();
    els.toolList.querySelectorAll('.wp-tool').forEach((b) => b.classList.remove('is-active'));
    updateShapeButtons();
    playSwitch();
    callbacks.onShapeChange?.();
  }

  /* ── Modal cor + opacidade da ferramenta ────────────────── */
  function buildColorGrid(gridEl, onPick) {
    gridEl.innerHTML = buildPalette()
      .map((hex) => `<button type="button" class="color-swatch" data-hex="${hex}" style="background:${hex}" title="${hex}"></button>`)
      .join('');
    gridEl.querySelectorAll('.color-swatch').forEach((sw) => {
      sw.addEventListener('click', () => onPick(sw.dataset.hex));
    });
  }
  function openToolModal(tool) {
    colorTargetShapeKey = null;
    colorTargetKey = tool.key;
    const isEraser = tool.key === 'eraser' || tool.tool === 'eraser';
    els.colorModal.classList.toggle('is-eraser', isEraser);
    if (isEraser) {
      els.colorTitle.textContent = `${tool.label} — tamanho`;
    } else {
      els.colorTitle.textContent = `${tool.label} — cor · opacidade · tamanho`;
      els.colorCurrent.style.background = state.toolColors[tool.key];
      els.colorHex.value = state.toolColors[tool.key];
      els.mOpVal.textContent = `${Math.round(state.toolOpacity[tool.key] * 100)}%`;
    }
    updateModalSizeDot();
    els.colorModal.hidden = false;
  }

  function openShapeModal(shape) {
    colorTargetKey = null;
    colorTargetShapeKey = shape.key;
    els.colorModal.classList.remove('is-eraser');
    els.colorTitle.textContent = `${shape.label} — cor · opacidade · tamanho`;
    els.colorCurrent.style.background = state.shapeColors[shape.key];
    els.colorHex.value = state.shapeColors[shape.key];
    els.mOpVal.textContent = `${Math.round(state.shapeOpacity[shape.key] * 100)}%`;
    updateModalSizeDot();
    els.colorModal.hidden = false;
  }

  function modalSizeKey() {
    return colorTargetShapeKey || colorTargetKey || state.activeShapeKey || state.activeKey;
  }
  function setToolColor(hex) {
    const k = colorTargetShapeKey || colorTargetKey;
    if (!k) return;
    if (colorTargetShapeKey) {
      state.shapeColors[k] = hex;
      if (k === state.activeShapeKey) syncShapeSettings();
    } else {
      state.toolColors[k] = hex;
      if (k === state.activeKey) syncActiveSettings();
      applyToolColors();
    }
    updateModalSizeDot();
    els.colorCurrent.style.background = hex;
    els.colorHex.value = hex;
    callbacks.onColorChange?.();
  }
  function changeOpacity(delta) {
    const shapeKey = colorTargetShapeKey;
    const toolKey = colorTargetKey;
    if (shapeKey) {
      let i = OPACITIES.indexOf(state.shapeOpacity[shapeKey]);
      if (i < 0) i = OPACITIES.length - 1;
      const next = i + delta;
      if (next < 0 || next >= OPACITIES.length) return;
      state.shapeOpacity[shapeKey] = OPACITIES[next];
      if (shapeKey === state.activeShapeKey) syncShapeSettings();
      els.mOpVal.textContent = `${Math.round(OPACITIES[next] * 100)}%`;
      return;
    }
    if (!toolKey) return;
    let i = OPACITIES.indexOf(state.toolOpacity[toolKey]);
    if (i < 0) i = OPACITIES.length - 1;
    const next = i + delta;
    if (next < 0 || next >= OPACITIES.length) return;
    state.toolOpacity[toolKey] = OPACITIES[next];
    if (toolKey === state.activeKey) syncActiveSettings();
    els.mOpVal.textContent = `${Math.round(OPACITIES[next] * 100)}%`;
  }

  /* ── Tamanho do traço (dentro do modal da ferramenta) ────── */
  function updateModalSizeDot() {
    const k = modalSizeKey();
    const shapeMode = Boolean(colorTargetShapeKey || (!colorTargetKey && state.activeShapeKey));
    const sizes = shapeMode ? state.shapeSizes : state.toolSizes;
    const colors = shapeMode ? state.shapeColors : state.toolColors;
    const px = Math.max(4, Math.min(30, BRUSH_SIZES[sizes[k]] + 4));
    const isEraser = k === 'eraser' && !shapeMode;
    els.mSizeDot.style.width = `${px}px`;
    els.mSizeDot.style.height = `${px}px`;
    els.mSizeDot.style.background = isEraser ? 'var(--fg)' : colors[k];
  }
  function changeSize(delta) {
    if (colorTargetShapeKey) {
      const next = state.shapeSizes[colorTargetShapeKey] + delta;
      if (next < 0 || next >= BRUSH_SIZES.length) return;
      state.shapeSizes[colorTargetShapeKey] = next;
      if (colorTargetShapeKey === state.activeShapeKey) syncShapeSettings();
      updateModalSizeDot();
      return;
    }
    const k = colorTargetKey || state.activeKey;
    const next = state.toolSizes[k] + delta;
    if (next < 0 || next >= BRUSH_SIZES.length) return;
    state.toolSizes[k] = next;
    if (k === state.activeKey && !state.activeShapeKey) syncActiveSettings();
    updateModalSizeDot();
  }

  /* ── Modal cor do fundo ─────────────────────────────────── */
  function openBgModal() {
    els.bgCurrent.style.background = state.bgColor;
    els.bgHex.value = state.bgColor;
    els.bgModal.hidden = false;
  }
  function setBg(hex) {
    state.bgColor = hex;
    els.bgCurrent.style.background = hex;
    els.bgHex.value = hex;
    callbacks.onBgChange?.();
  }

  /* ── Modal tamanho da tela (resolução) ──────────────────── */
  function buildResList() {
    els.resList.innerHTML = RESOLUTIONS.map((r, i) =>
      `<button type="button" class="res-opt" data-res="${i}">
        <span class="res-opt__name">${r.label}</span>
        <span class="res-opt__dim">${r.w} × ${r.h}</span>
      </button>`).join('');
    els.resList.querySelectorAll('.res-opt').forEach((b) => {
      b.addEventListener('click', () => {
        callbacks.onSetResolution?.(RESOLUTIONS[+b.dataset.res]);
        els.resModal.hidden = true;
      });
    });
  }

  function bindEvents() {
    els.btnStart.addEventListener('click', () => {
      resumeAudio();
      iris(() => { renderGallery(); showOnly(els.gallery); });
    });

    els.btnBack.addEventListener('click', () => {
      iris(() => { renderGallery(); showOnly(els.gallery); });
    });

    const undo = () => callbacks.onUndo?.();
    const redo = () => callbacks.onRedo?.();
    els.btnUndo.addEventListener('click', undo);
    els.btnRedo.addEventListener('click', redo);
    els.btnClear.addEventListener('click', () => callbacks.onClear?.());
    els.btnSave.addEventListener('click', () => { callbacks.onSave?.(); flash(els.btnSave, 'Guardado!'); });
    els.btnExportGif.addEventListener('click', () => callbacks.onExportGif?.());
    els.btnBackground.addEventListener('click', openBgModal);
    els.btnCrop.addEventListener('click', () => { els.resModal.hidden = false; });

    els.btnMirrorH.addEventListener('click', () => {
      state.mirrorH = !state.mirrorH;
      els.btnMirrorH.classList.toggle('is-active', state.mirrorH);
      els.btnMirrorH.setAttribute('aria-pressed', String(state.mirrorH));
    });
    els.btnMirrorV.addEventListener('click', () => {
      state.mirrorV = !state.mirrorV;
      els.btnMirrorV.classList.toggle('is-active', state.mirrorV);
      els.btnMirrorV.setAttribute('aria-pressed', String(state.mirrorV));
    });

    els.btnShapeRect?.addEventListener('click', () => selectShape('rect'));
    els.btnShapeEllipse?.addEventListener('click', () => selectShape('ellipse'));
    els.btnShapeLine?.addEventListener('click', () => selectShape('line'));

    // Modais
    els.colorClose.addEventListener('click', () => { els.colorModal.hidden = true; });
    els.colorModal.addEventListener('click', (e) => { if (e.target === els.colorModal) els.colorModal.hidden = true; });
    els.mOpDown.addEventListener('click', () => changeOpacity(-1));
    els.mOpUp.addEventListener('click', () => changeOpacity(1));
    els.mSizeDown.addEventListener('click', () => changeSize(-1));
    els.mSizeUp.addEventListener('click', () => changeSize(1));
    els.colorHex.addEventListener('change', () => {
      const v = els.colorHex.value.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(v)) setToolColor(v.toLowerCase());
      else {
        const k = colorTargetShapeKey || colorTargetKey;
        els.colorHex.value = colorTargetShapeKey ? state.shapeColors[k] : state.toolColors[k];
      }
    });

    els.bgClose.addEventListener('click', () => { els.bgModal.hidden = true; });
    els.bgModal.addEventListener('click', (e) => { if (e.target === els.bgModal) els.bgModal.hidden = true; });
    els.bgHex.addEventListener('change', () => {
      const v = els.bgHex.value.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(v)) setBg(v.toLowerCase());
      else els.bgHex.value = state.bgColor;
    });

    els.resClose.addEventListener('click', () => { els.resModal.hidden = true; });
    els.resModal.addEventListener('click', (e) => { if (e.target === els.resModal) els.resModal.hidden = true; });

    // Menu / renomear / apagar projeto
    els.projClose.addEventListener('click', () => { els.projModal.hidden = true; });
    els.projModal.addEventListener('click', (e) => { if (e.target === els.projModal) els.projModal.hidden = true; });
    els.projRename.addEventListener('click', openRename);
    els.projDelete.addEventListener('click', openDelete);

    els.renameClose.addEventListener('click', () => { els.renameModal.hidden = true; });
    els.renameCancel.addEventListener('click', () => { els.renameModal.hidden = true; });
    els.renameConfirm.addEventListener('click', confirmRename);
    els.renameModal.addEventListener('click', (e) => { if (e.target === els.renameModal) els.renameModal.hidden = true; });
    els.renameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); confirmRename(); }
    });

    els.delClose.addEventListener('click', () => { els.delModal.hidden = true; });
    els.delCancel.addEventListener('click', () => { els.delModal.hidden = true; });
    els.delConfirm.addEventListener('click', confirmDelete);
    els.delModal.addEventListener('click', (e) => { if (e.target === els.delModal) els.delModal.hidden = true; });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        els.colorModal.hidden = true; els.bgModal.hidden = true; els.resModal.hidden = true;
        els.projModal.hidden = true; els.renameModal.hidden = true; els.delModal.hidden = true;
      }
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) { e.preventDefault(); redo(); }
    });
  }

  /** Feedback rápido no botão (ex.: "Guardado!"). */
  function flash(btn, text) {
    const orig = btn.textContent;
    btn.textContent = text;
    btn.classList.add('is-flash');
    setTimeout(() => { btn.textContent = orig; btn.classList.remove('is-flash'); }, 900);
  }

  function init() {
    buildToolList();
    buildColorGrid(els.colorGrid, setToolColor);
    buildColorGrid(els.bgGrid, setBg);
    buildResList();
    els.btnClear.innerHTML = '<img class="obliterate__img" src="assets/dynamite.png" alt="obliterar" draggable="false">';
    syncActiveSettings();
    bindEvents();
  }

  return { init, selectTool, selectShape, applyToolColors };
}
