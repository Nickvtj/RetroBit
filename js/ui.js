import { TOOLS, BRUSH_SIZES, OPACITIES, RESOLUTIONS, state } from './state.js';
import { getTintedToolUrl } from './tool-art.js';
import { playSwitch, playStart, resumeAudio, setMuted, isMuted } from './audio.js';
import { listProjects, deleteProject } from './projects.js';

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
    btnUndo: $('btn-undo'), btnRedo: $('btn-redo'), btnMute: $('btn-mute'),
    dockSizeDown: $('dock-size-down'), dockSizeUp: $('dock-size-up'), dockSizeDot: $('dock-size-dot'),
    colorModal: $('color-modal'), colorGrid: $('color-grid'), colorTitle: $('color-win-title'),
    colorCurrent: $('color-current'), colorHex: $('color-hex'), colorClose: $('color-close'),
    mOpDown: $('modal-op-down'), mOpUp: $('modal-op-up'), mOpVal: $('modal-op-val'),
    bgModal: $('bg-modal'), bgGrid: $('bg-grid'), bgCurrent: $('bg-current'),
    bgHex: $('bg-hex'), bgClose: $('bg-close'),
    resModal: $('res-modal'), resList: $('res-list'), resClose: $('res-close'),
  };
  let colorTargetKey = null;

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
            <button type="button" class="tile__menu" data-del="${p.id}" title="apagar">×</button>
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
        if (e.target.closest('[data-del]')) return;
        resumeAudio();
        const id = tile.dataset.open;
        iris(() => { callbacks.onOpenProject?.(id); showOnly(els.app); callbacks.onAppReady?.(); });
        playStart();
      });
    });
    els.galleryGrid.querySelectorAll('[data-del]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('Apagar este projeto?')) { deleteProject(btn.dataset.del); renderGallery(); }
      });
    });
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
    const k = state.activeKey;
    state.color = state.toolColors[k];
    state.brushSizeIndex = state.toolSizes[k];
    state.brushSize = BRUSH_SIZES[state.brushSizeIndex];
    state.opacity = state.toolOpacity[k];
  }

  function selectTool(key) {
    const t = TOOLS.find((x) => x.key === key);
    if (!t) return;
    resumeAudio();
    if (key === state.activeKey && t.key !== 'eraser') { openToolModal(t); return; }
    state.activeKey = key;
    state.tool = t.tool;
    syncActiveSettings();
    updateDockSizeDot();
    els.toolList.querySelectorAll('.wp-tool').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.key === key);
    });
    playSwitch();
    callbacks.onToolChange?.(t.tool);
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
    colorTargetKey = tool.key;
    els.colorTitle.textContent = `${tool.label} — cor · opacidade`;
    els.colorCurrent.style.background = state.toolColors[tool.key];
    els.colorHex.value = state.toolColors[tool.key];
    els.mOpVal.textContent = `${Math.round(state.toolOpacity[tool.key] * 100)}%`;
    els.colorModal.hidden = false;
  }
  function setToolColor(hex) {
    if (!colorTargetKey) return;
    state.toolColors[colorTargetKey] = hex;
    syncActiveSettings();
    updateDockSizeDot();
    els.colorCurrent.style.background = hex;
    els.colorHex.value = hex;
    applyToolColors();
    callbacks.onColorChange?.();
  }
  function changeOpacity(delta) {
    if (!colorTargetKey) return;
    let i = OPACITIES.indexOf(state.toolOpacity[colorTargetKey]);
    if (i < 0) i = OPACITIES.length - 1;
    const next = i + delta;
    if (next < 0 || next >= OPACITIES.length) return;
    state.toolOpacity[colorTargetKey] = OPACITIES[next];
    syncActiveSettings();
    els.mOpVal.textContent = `${Math.round(OPACITIES[next] * 100)}%`;
  }

  /* ── Tamanho do traço (na barra inferior) ───────────────── */
  function updateDockSizeDot() {
    const px = Math.max(4, Math.min(28, BRUSH_SIZES[state.toolSizes[state.activeKey]] + 4));
    els.dockSizeDot.style.width = `${px}px`;
    els.dockSizeDot.style.height = `${px}px`;
    els.dockSizeDot.style.background = state.color;
  }
  function changeSize(delta) {
    const k = state.activeKey;
    const next = state.toolSizes[k] + delta;
    if (next < 0 || next >= BRUSH_SIZES.length) return;
    state.toolSizes[k] = next;
    syncActiveSettings();
    updateDockSizeDot();
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

  /* ── Mute ───────────────────────────────────────────────── */
  function refreshMute() {
    els.btnMute.textContent = '♪';
    els.btnMute.title = isMuted() ? 'som desligado' : 'som ligado';
    els.btnMute.classList.toggle('is-off', isMuted());
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
    els.btnMute.addEventListener('click', () => {
      setMuted(!isMuted());
      refreshMute();
      els.btnMute.classList.remove('rb-pop');
      void els.btnMute.offsetWidth;
      els.btnMute.classList.add('rb-pop');
    });
    els.btnSave.addEventListener('click', () => { callbacks.onSave?.(); flash(els.btnSave, 'Guardado!'); });
    els.btnExportGif.addEventListener('click', () => callbacks.onExportGif?.());
    els.btnBackground.addEventListener('click', openBgModal);
    els.btnCrop.addEventListener('click', () => { els.resModal.hidden = false; });
    els.dockSizeDown.addEventListener('click', () => changeSize(-1));
    els.dockSizeUp.addEventListener('click', () => changeSize(1));

    // Modais
    els.colorClose.addEventListener('click', () => { els.colorModal.hidden = true; });
    els.colorModal.addEventListener('click', (e) => { if (e.target === els.colorModal) els.colorModal.hidden = true; });
    els.mOpDown.addEventListener('click', () => changeOpacity(-1));
    els.mOpUp.addEventListener('click', () => changeOpacity(1));
    els.colorHex.addEventListener('change', () => {
      const v = els.colorHex.value.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(v)) setToolColor(v.toLowerCase());
      else els.colorHex.value = state.toolColors[colorTargetKey];
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

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { els.colorModal.hidden = true; els.bgModal.hidden = true; els.resModal.hidden = true; }
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
    updateDockSizeDot();
    refreshMute();
    bindEvents();
  }

  return { init, selectTool, applyToolColors, updateDockSizeDot };
}
