import { TOOLS, SHAPES, BRUSH_SIZES, RESOLUTIONS, state } from './state.js';
import { getTintedToolUrl } from './tool-art.js';
import { playSwitch, playStart, playSave, playError, playColor, resumeAudio, setMuted, isMuted } from './audio.js';
import { listProjects, deleteProject, renameProject, getProject, getDraft } from './projects.js';
import { escapeHtml } from './util.js';
import { icon, hydrateIcons, cursorCss, CURSOR_NAMES } from './icons.js';
import { initFx, toolFx, bindDynamite } from './fx.js';
import { buildColorGrid, markCurrentSwatch, HEX_RE } from './palette.js';
import { createQuickMenu } from './quick-menu.js';
import { enablePaintDrag } from './paint-drag.js';
import { t, lang, setLang } from './i18n.js';

const tr = t; // em ciclos onde `t` é uma ferramenta
import { VERSION } from './version.js';
import { startTour } from './tour.js';

const MUTE_KEY = 'retrobit-muted';

export function createUI(callbacks) {
  const $ = (id) => document.getElementById(id);
  const els = {
    splash: $('splash'), gallery: $('gallery'), app: $('app'), wipe: $('wipe'),
    btnStart: $('btn-start'), galleryGrid: $('gallery-grid'), btnBack: $('btn-back'), parade: $('splash-parade'),
    toolList: $('tool-list'), mainCanvas: $('main-canvas'),
    btnClear: $('btn-clear'),
    dock: $('dock'), dockMore: $('dock-more'), btnMore: $('btn-more'), btnLayers: $('btn-layers'),
    btnSave: $('btn-save'), btnExportGif: $('btn-export-gif'),
    btnBackground: $('btn-background'), btnCrop: $('btn-crop'), btnRef: $('btn-ref'),
    btnUndo: $('btn-undo'), btnRedo: $('btn-redo'), btnSound: $('btn-sound'),
    cropHint: $('crop-hint'), pickHint: $('pick-hint'), toast: $('toast'),
    exportModal: $('export-modal'), exportClose: $('export-close'),
    exportGif: $('export-gif'), exportPng: $('export-png'),
    exportGifBig: $('export-gif-big'), exportPngClear: $('export-png-clear'), exportProject: $('export-project'),
    projectFile: $('project-file'), btnLang: $('btn-lang'), btnHelp: $('btn-help'), version: $('app-version'),
    leaveModal: $('leave-modal'), leaveClose: $('leave-close'), leaveCancel: $('leave-cancel'),
    leaveDiscard: $('leave-discard'), leaveSave: $('leave-save'),
    btnMirrorH: $('btn-mirror-h'), btnMirrorV: $('btn-mirror-v'), btnSelect: $('btn-select'),
    btnGrid: $('btn-grid'), gridVal: $('grid-val'),
    btnShapeRect: $('btn-shape-rect'), btnShapeEllipse: $('btn-shape-ellipse'), btnShapeLine: $('btn-shape-line'),
    bgModal: $('bg-modal'), bgGrid: $('bg-grid'), bgCurrent: $('bg-current'),
    bgHex: $('bg-hex'), bgClose: $('bg-close'),
    resModal: $('res-modal'), resList: $('res-list'), resClose: $('res-close'),
    projModal: $('proj-modal'), projTitle: $('proj-win-title'), projClose: $('proj-close'),
    projRename: $('proj-rename'), projDelete: $('proj-delete'),
    renameModal: $('rename-modal'), renameInput: $('rename-input'), renameClose: $('rename-close'),
    renameCancel: $('rename-cancel'), renameConfirm: $('rename-confirm'),
    delModal: $('del-modal'), delName: $('del-name'), delClose: $('del-close'),
    delCancel: $('del-cancel'), delConfirm: $('del-confirm'),
    recoverModal: $('recover-modal'), recoverMsg: $('recover-msg'), recoverClose: $('recover-close'),
    recoverDiscard: $('recover-discard'), recoverOpen: $('recover-open'),
  };
  const shapeButtons = [els.btnShapeRect, els.btnShapeEllipse, els.btnShapeLine];
  let menuTargetId = null;
  let irisBusy = false;
  let toastTimer = 0;

  const quick = createQuickMenu({
    onChange: onSettingsChange,
    onStartPick: () => setPickMode(true),
    onDropPaint: (x, y, paint) => callbacks.onDropFill?.(x, y, paint.color, paint.opacity),
  });

  /* ── Transição íris pixelada ────────────────────────────────
     Desenha um círculo numa grelha de baixa resolução (~84px) que o CSS amplia
     com image-rendering:pixelated → círculo chunky, a crescer aos saltos. */
  function iris(swap) {
    if (irisBusy) return; // evita que um duplo clique troque de tela duas vezes
    irisBusy = true;
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
      if (step <= 0) { ctx.clearRect(0, 0, W, H); c.hidden = true; irisBusy = false; return; }
      draw(maxR * step / steps);
      setTimeout(reveal, dt);
    };
    cover();
  }

  function showOnly(el) {
    [els.splash, els.gallery, els.app].forEach((s) => { s.hidden = s !== el; });
  }

  /** Aviso curto no fundo da tela (ex.: "Salvo!"). */
  function toast(text) {
    els.toast.textContent = text;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { els.toast.hidden = true; }, 1600);
  }

  /* ── Galeria ────────────────────────────────────────────── */
  function renderGallery() {
    const projects = listProjects();
    const tiles = [`
      <button type="button" class="tile tile--new" data-new="1" style="--i:0">
        <span class="tile__plus">${icon('plus')}</span>
        <span class="tile__name">${t('Novo projeto')}</span>
      </button>`, `
      <button type="button" class="tile tile--new tile--open" data-import="1" style="--i:1" title="${t('abrir um projeto .retrobit')}">
        <span class="tile__plus">${icon('folder')}</span>
        <span class="tile__name">${t('Abrir arquivo')}</span>
      </button>`];
    projects.forEach((p, i) => {
      const thumb = p.thumb
        ? `<img src="${p.thumb}" alt="" draggable="false">`
        : '<span class="tile__empty"></span>';
      tiles.push(`
        <div class="tile" data-open="${p.id}" style="--i:${Math.min(i + 2, 12)}">
          <div class="tile__thumb">${thumb}
            <button type="button" class="tile__menu" data-menu="${p.id}" title="${t('renomear ou excluir')}">${icon('edit')}</button>
          </div>
          <span class="tile__name">${escapeHtml(p.name)}</span>
        </div>`);
    });
    els.galleryGrid.innerHTML = tiles.join('');

    els.galleryGrid.querySelector('[data-new]')?.addEventListener('click', () => {
      if (irisBusy) return;
      resumeAudio();
      iris(() => { callbacks.onNewProject?.(); showOnly(els.app); callbacks.onAppReady?.(); });
      playStart();
    });
    els.galleryGrid.querySelector('[data-import]')?.addEventListener('click', () => els.projectFile.click());
    els.galleryGrid.querySelectorAll('[data-open]').forEach((tile) => {
      tile.addEventListener('click', (e) => {
        if (e.target.closest('[data-menu]') || irisBusy) return;
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

  /** Ficheiro .retrobit → novo projeto na galeria. */
  async function importProjectFile(file) {
    if (!file) return;
    const ok = await callbacks.onImportProject?.(await file.text());
    toast(ok ? t('projeto importado') : t('esse arquivo não é um projeto do RetroBit'));
    if (ok) renderGallery();
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
      return `<button class="wp-tool${active}${solo}" type="button" data-key="${t.key}" title="${tr(t.label)}" aria-label="${tr(t.label)}">
        <img src="${t.img}" alt="" draggable="false"></button>`;
    }).join('');
    els.toolList.querySelectorAll('.wp-tool').forEach((btn) => {
      btn.addEventListener('click', () => selectTool(btn.dataset.key));
    });
    // Balde: arrastar a lata até a tela pinta onde soltar.
    const bucket = els.toolList.querySelector('[data-key="bucket"]');
    if (bucket) {
      enablePaintDrag(
        bucket,
        () => ({ color: state.toolColors.bucket, opacity: state.toolOpacity.bucket }),
        (x, y, paint) => callbacks.onDropFill?.(x, y, paint.color, paint.opacity),
        () => quick.close(),
      );
    }
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

  /** O menu rápido mudou cor/tamanho/opacidade de uma ferramenta ou forma. */
  function onSettingsChange() {
    syncActiveSettings();
    applyToolColors();
    callbacks.onColorChange?.();
  }

  /** A tela muda de cursor conforme o modo (balde → mira, luva → mão). */
  function updateCanvasMode() {
    els.mainCanvas.classList.toggle('is-fill', state.tool === 'fill' && !state.activeShapeKey && !state.selectMode);
    els.mainCanvas.classList.toggle('is-select', state.selectMode);
  }

  /** Botões do espelho seguem o estado (ex.: ao abrir outro projeto). */
  function syncMirrors() {
    [[els.btnMirrorH, state.mirrorH], [els.btnMirrorV, state.mirrorV]].forEach(([b, on]) => {
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  /* ── Grade de pixel art: desligada → 8 → 16 → 32 → desligada ── */
  const GRID_STEPS = [0, 8, 16, 32];
  function syncGrid() {
    const on = state.grid > 0;
    els.btnGrid.classList.toggle('is-active', on);
    els.btnGrid.setAttribute('aria-pressed', String(on));
    els.gridVal.hidden = !on;
    els.gridVal.textContent = state.grid;
  }
  function cycleGrid() {
    const i = GRID_STEPS.indexOf(state.grid);
    state.grid = GRID_STEPS[(i + 1) % GRID_STEPS.length];
    syncGrid();
    playSwitch();
    toast(state.grid ? t('grade de {n} px', { n: state.grid }) : t('grade desligada'));
    callbacks.onGridChange?.();
  }

  /** Luva ligada: as canetas e formas deixam de estar ativas até se escolher uma. */
  function setSelectMode(on) {
    if (state.selectMode === on) return;
    state.selectMode = on;
    quick.close();
    setPickMode(false);
    els.btnSelect.classList.toggle('is-active', on);
    els.btnSelect.setAttribute('aria-pressed', String(on));
    els.toolList.querySelectorAll('.wp-tool').forEach((b) => {
      b.classList.toggle('is-active', !on && !state.activeShapeKey && b.dataset.key === state.activeKey);
    });
    if (on) clearShapeSelection();
    updateCanvasMode();
    callbacks.onSelectMode?.(on);
  }

  function clearShapeSelection() {
    state.activeShapeKey = null;
    updateShapeButtons();
  }

  function updateShapeButtons() {
    shapeButtons.forEach((b) => {
      const on = b.dataset.shape === state.activeShapeKey;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  function selectTool(key) {
    const t = TOOLS.find((x) => x.key === key);
    if (!t) return;
    resumeAudio();
    setPickMode(false);
    const fromSelect = state.selectMode;
    setSelectMode(false);
    // Segundo clique na ferramenta ativa → abre/fecha o menu rápido dela.
    if (key === state.activeKey && !state.activeShapeKey && !fromSelect) {
      if (quick.isOpenFor('tool', key)) quick.close();
      else {
        const anchor = els.toolList.querySelector(`[data-key="${key}"]`);
        quick.open({ kind: 'tool', key, label: tr(t.label), anchor, eraser: t.tool === 'eraser', noSize: t.noSize, paint: t.tool === 'fill' });
      }
      return;
    }
    quick.close();
    clearShapeSelection();
    state.activeKey = key;
    state.tool = t.tool;
    syncActiveSettings();
    els.toolList.querySelectorAll('.wp-tool').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.key === key);
    });
    updateCanvasMode();
    playSwitch();
    toolFx(els.toolList.querySelector(`[data-key="${key}"]`), key, state.toolColors[key]);
    callbacks.onToolChange?.(t.tool);
  }

  function selectShape(key) {
    const s = SHAPES.find((x) => x.key === key);
    if (!s) return;
    resumeAudio();
    setPickMode(false);
    setSelectMode(false);
    if (key === state.activeShapeKey) {
      if (quick.isOpenFor('shape', key)) quick.close();
      else quick.open({ kind: 'shape', key, label: t(s.label), anchor: shapeButtons.find((b) => b.dataset.shape === key) });
      return;
    }
    quick.close();
    state.activeShapeKey = key;
    state.tool = s.tool;
    syncShapeSettings();
    els.toolList.querySelectorAll('.wp-tool').forEach((b) => b.classList.remove('is-active'));
    updateShapeButtons();
    updateCanvasMode();
    playSwitch();
    callbacks.onShapeChange?.();
  }

  /* ── Conta-gotas ────────────────────────────────────────── */
  function setPickMode(on) {
    state.isPicking = on;
    els.mainCanvas.classList.toggle('is-picking', on);
    els.pickHint.hidden = !on;
  }

  /** Aplica uma cor tirada da tela à ferramenta (ou forma) ativa. */
  function setActiveColor(hex) {
    setPickMode(false);
    if (state.activeShapeKey) state.shapeColors[state.activeShapeKey] = hex;
    else if (state.tool !== 'eraser') state.toolColors[state.activeKey] = hex;
    else return;
    onSettingsChange();
    playColor(hex);
    toast(t('cor {hex}', { hex }));
  }

  /* ── Modal cor do fundo ─────────────────────────────────── */
  function openBgModal() {
    els.bgCurrent.style.background = state.bgColor;
    els.bgHex.value = state.bgColor;
    markCurrentSwatch(els.bgGrid, state.bgColor);
    els.bgModal.hidden = false;
  }
  function setBg(hex) {
    if (hex !== state.bgColor) callbacks.onBgChange?.(hex);
    els.bgCurrent.style.background = hex;
    els.bgHex.value = hex;
    markCurrentSwatch(els.bgGrid, hex);
  }

  /* ── Modal tamanho da tela (resolução) ──────────────────── */
  function buildResList() {
    els.resList.innerHTML = RESOLUTIONS.map((r, i) =>
      `<button type="button" class="res-opt" data-res="${i}">
        <span class="res-opt__name">${t(r.label)}</span>
        <span class="res-opt__dim">${r.w} × ${r.h}</span>
      </button>`).join('') + `
      <button type="button" class="res-opt res-opt--crop" data-crop="1">
        <span class="res-opt__name">${t('recortar área')}</span>
        <span class="res-opt__dim">${t('arrastar')} ${icon('crop')}</span>
      </button>`;
    els.resList.querySelectorAll('[data-res]').forEach((b) => {
      b.addEventListener('click', () => {
        callbacks.onSetResolution?.(RESOLUTIONS[+b.dataset.res]);
        els.resModal.hidden = true;
      });
    });
    els.resList.querySelector('[data-crop]').addEventListener('click', () => {
      els.resModal.hidden = true;
      callbacks.onStartCrop?.();
      setCropHint(true);
    });
  }

  /** Aviso sobre a tela enquanto o modo recorte está ativo. */
  function setCropHint(on) {
    if (els.cropHint) els.cropHint.hidden = !on;
  }
  function cancelCrop() {
    callbacks.onCancelCrop?.();
    setCropHint(false);
  }

  /* ── Som ligado/desligado (lembrado entre sessões) ──────── */
  function applySound(muted) {
    setMuted(muted);
    els.btnSound.classList.toggle('is-off', muted);
    els.btnSound.title = muted ? t('ligar som') : t('desligar som');
    els.btnSound.setAttribute('aria-pressed', String(muted));
  }
  function toggleSound() {
    const muted = !isMuted();
    applySound(muted);
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* sem storage */ }
  }

  /* ── Gaveta de camadas e menu "⋯" (telas compactas) ─────── */
  function setLayersOpen(open) {
    els.app.classList.toggle('is-layers-open', open);
    els.btnLayers.setAttribute('aria-expanded', String(open));
  }
  function setMoreOpen(open) {
    els.dock.classList.toggle('is-more-open', open);
    els.btnMore.setAttribute('aria-expanded', String(open));
  }
  /** Fecha os painéis flutuantes (ex.: ao começar a desenhar). */
  function closeFloating() {
    setLayersOpen(false);
    setMoreOpen(false);
    quick.close();
  }

  /* ── Sair da tela de desenho (avisa se houver alterações) ── */
  function goToGallery() {
    cancelCrop();
    closeFloating();
    setPickMode(false);
    iris(() => { renderGallery(); showOnly(els.gallery); });
  }
  function requestLeave() {
    if (callbacks.isDirty?.()) els.leaveModal.hidden = false;
    else goToGallery();
  }

  async function save() {
    const ok = (await callbacks.onSave?.()) !== false;
    (ok ? playSave : playError)();
    flash(els.btnSave);
    toast(ok ? t('Salvo!') : t('Sem espaço para salvar!'));
    return ok;
  }

  function closeAllModals() {
    [els.bgModal, els.resModal, els.projModal, els.renameModal, els.delModal,
      els.exportModal, els.leaveModal, els.recoverModal, $('ref-modal')].forEach((m) => { m.hidden = true; });
  }

  /* ── Recuperar desenho não salvo (rascunho automático) ──── */
  function offerRecovery() {
    const d = getDraft();
    if (!d) return;
    const p = d.projectId && getProject(d.projectId);
    els.recoverMsg.textContent = p
      ? t('Achamos alterações não salvas em “{name}”.', { name: p.name })
      : t('Achamos um desenho que não foi salvo.');
    els.recoverModal.hidden = false;
  }
  function recoverDraft() {
    els.recoverModal.hidden = true;
    resumeAudio();
    iris(() => { callbacks.onRecoverDraft?.(); showOnly(els.app); callbacks.onAppReady?.(); });
    playStart();
  }
  function discardDraft() {
    els.recoverModal.hidden = true;
    callbacks.onDiscardChanges?.();
  }

  function bindEvents() {
    els.btnStart.addEventListener('click', () => {
      resumeAudio();
      iris(() => { renderGallery(); showOnly(els.gallery); offerRecovery(); });
    });

    els.btnBack.addEventListener('click', requestLeave);

    els.leaveClose.addEventListener('click', () => { els.leaveModal.hidden = true; });
    els.leaveCancel.addEventListener('click', () => { els.leaveModal.hidden = true; });
    els.leaveModal.addEventListener('click', (e) => { if (e.target === els.leaveModal) els.leaveModal.hidden = true; });
    els.leaveDiscard.addEventListener('click', () => {
      els.leaveModal.hidden = true;
      callbacks.onDiscardChanges?.();
      goToGallery();
    });
    els.leaveSave.addEventListener('click', async () => {
      els.leaveModal.hidden = true;
      if (await save()) goToGallery();
    });

    // "×", Esc ou clicar fora = decidir depois (o rascunho continua guardado).
    els.recoverClose.addEventListener('click', () => { els.recoverModal.hidden = true; });
    els.recoverModal.addEventListener('click', (e) => { if (e.target === els.recoverModal) els.recoverModal.hidden = true; });
    els.recoverDiscard.addEventListener('click', discardDraft);
    els.recoverOpen.addEventListener('click', recoverDraft);

    els.btnSound.addEventListener('click', toggleSound);

    const undo = () => callbacks.onUndo?.();
    const redo = () => callbacks.onRedo?.();
    els.btnUndo.addEventListener('click', undo);
    els.btnRedo.addEventListener('click', redo);
    els.btnClear.addEventListener('click', () => callbacks.onClear?.());
    els.btnSave.addEventListener('click', save);
    els.btnExportGif.addEventListener('click', () => { els.exportModal.hidden = false; });
    els.exportClose.addEventListener('click', () => { els.exportModal.hidden = true; });
    els.exportModal.addEventListener('click', (e) => { if (e.target === els.exportModal) els.exportModal.hidden = true; });
    els.exportGif.addEventListener('click', () => { els.exportModal.hidden = true; callbacks.onExportGif?.(); });
    els.exportGifBig.addEventListener('click', () => { els.exportModal.hidden = true; callbacks.onExportGif?.({ big: true }); });
    els.exportPng.addEventListener('click', () => { els.exportModal.hidden = true; callbacks.onExportPng?.(); });
    els.exportPngClear.addEventListener('click', () => { els.exportModal.hidden = true; callbacks.onExportPng?.({ transparent: true }); });
    els.exportProject.addEventListener('click', () => { els.exportModal.hidden = true; callbacks.onExportProject?.(); });
    els.btnHelp.addEventListener('click', () => startTour());
    els.btnLang.addEventListener('click', () => setLang(lang === 'pt' ? 'en' : 'pt'));
    els.projectFile.addEventListener('change', () => {
      importProjectFile(els.projectFile.files[0]);
      els.projectFile.value = '';
    });
    // Arrastar um .retrobit para a galeria também importa.
    els.gallery.addEventListener('dragover', (e) => e.preventDefault());
    els.gallery.addEventListener('drop', (e) => {
      const file = [...(e.dataTransfer?.files || [])].find((f) => f.name.endsWith('.retrobit') || f.type === 'application/json');
      if (!file) return;
      e.preventDefault();
      importProjectFile(file);
    });
    els.btnBackground.addEventListener('click', openBgModal);
    els.btnRef.addEventListener('click', () => callbacks.onOpenReference?.());
    els.btnCrop.addEventListener('click', () => { cancelCrop(); els.resModal.hidden = false; });

    els.btnLayers.addEventListener('click', () => {
      setMoreOpen(false);
      setLayersOpen(!els.app.classList.contains('is-layers-open'));
    });
    els.btnMore.addEventListener('click', () => {
      setLayersOpen(false);
      setMoreOpen(!els.dock.classList.contains('is-more-open'));
    });
    els.dockMore.addEventListener('click', (e) => { if (e.target.closest('button')) setMoreOpen(false); });
    // Toque fora do menu "⋯" fecha-o.
    document.addEventListener('pointerdown', (e) => {
      if (els.dock.classList.contains('is-more-open') && !els.dock.contains(e.target)) setMoreOpen(false);
    }, true);

    els.btnMirrorH.addEventListener('click', () => { state.mirrorH = !state.mirrorH; syncMirrors(); });
    els.btnMirrorV.addEventListener('click', () => { state.mirrorV = !state.mirrorV; syncMirrors(); });

    shapeButtons.forEach((b) => b.addEventListener('click', () => selectShape(b.dataset.shape)));
    els.btnGrid.addEventListener('click', () => { resumeAudio(); cycleGrid(); });
    els.btnSelect.addEventListener('click', () => {
      resumeAudio();
      playSwitch();
      setSelectMode(!state.selectMode);
    });

    // Modais
    els.bgClose.addEventListener('click', () => { els.bgModal.hidden = true; });
    els.bgModal.addEventListener('click', (e) => { if (e.target === els.bgModal) els.bgModal.hidden = true; });
    els.bgHex.addEventListener('change', () => {
      const v = els.bgHex.value.trim();
      if (HEX_RE.test(v)) setBg(v.toLowerCase());
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

    // Código secreto: ↑ ↑ ↓ ↓ ← → ← → B A
    const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
    let konami = 0;
    document.addEventListener('keydown', (e) => {
      konami = e.key.toLowerCase() === KONAMI[konami].toLowerCase() ? konami + 1 : (e.key === KONAMI[0] ? 1 : 0);
      if (konami < KONAMI.length) return;
      konami = 0;
      toast(t('código secreto!'));
      playStart();
      [...els.toolList.querySelectorAll('.wp-tool')].forEach((btn, i) => setTimeout(() => {
        toolFx(btn, btn.dataset.key, state.toolColors[btn.dataset.key] || '#e400e4');
      }, i * 90));
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeAllModals();
        closeFloating();
        cancelCrop();
        setPickMode(false);
        return;
      }
      // Atalhos só na tela de desenho e fora de campos de texto (lá o Ctrl+Z é do input).
      if (els.app.hidden || e.target.closest?.('input, textarea')) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
      else if (mod && k === 's') { e.preventDefault(); save(); }
    });
  }

  /** Feedback rápido no botão (ex.: ao salvar). */
  function flash(btn) {
    btn.classList.add('is-flash');
    setTimeout(() => btn.classList.remove('is-flash'), 900);
  }

  /** Desfile das ferramentas na splash (com as cores de fábrica), a balançar em sequência. */
  async function buildParade() {
    const urls = await Promise.all(TOOLS.map((t) => getTintedToolUrl(t, state.toolColors[t.key], state.theme)));
    els.parade.innerHTML = urls.map((u, i) => `<img src="${u}" alt="" draggable="false" style="--i:${i}">`).join('');
  }

  function init() {
    hydrateIcons(document);
    // Cursores pixel-art → variáveis CSS (--cur-arrow, --cur-point, …), com o cursor do sistema como recurso.
    const FALLBACK = {
      arrow: 'default', point: 'pointer', press: 'pointer', text: 'text', cross: 'crosshair', bucket: 'crosshair',
      picker: 'crosshair', lock: 'not-allowed', wait: 'wait', glove: 'grab', fist: 'grabbing', bomb: 'crosshair',
    };
    const root = document.documentElement.style;
    CURSOR_NAMES.forEach((n) => root.setProperty(`--cur-${n}`, cursorCss(n, FALLBACK[n] || 'auto')));
    initFx();
    bindDynamite(els.btnClear);
    buildParade();
    els.version.textContent = `v${VERSION}`;
    els.btnLang.textContent = lang === 'pt' ? 'English' : 'Português';
    els.btnLang.title = lang === 'pt' ? 'Switch to English' : 'Mudar para português';
    buildToolList();
    buildColorGrid(els.bgGrid, setBg);
    buildResList();
    els.btnClear.innerHTML = '<img class="obliterate__img" src="assets/tools/dynamite.png" alt="obliterar" draggable="false">';
    syncActiveSettings();
    let muted = false;
    try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* sem storage */ }
    applySound(muted);
    bindEvents();
  }

  return { init, selectTool, selectShape, applyToolColors, setCropHint, setActiveColor, closeFloating, toast, setSelectMode, syncGrid, syncMirrors };
}
