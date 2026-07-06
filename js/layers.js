/**
 * Painel de camadas (estilo 8-bit) — à esquerda do quadro de desenho.
 */
import { state, OPACITIES, createLayer, getLayerById, TOOL_DEFS } from './state.js';
import { getCanvasBg } from './theme.js';

export function createLayersPanel(callbacks) {
  const $ = (id) => document.getElementById(id);
  const els = {
    list: $('layers-list'),
    add: $('layers-add'),
    menuModal: $('layer-menu-modal'),
    menuTitle: $('layer-menu-title'),
    menuClose: $('layer-menu-close'),
    menuOpacity: $('layer-menu-opacity'),
    menuOpDown: $('layer-op-down'),
    menuOpUp: $('layer-op-up'),
    menuOpVal: $('layer-op-val'),
    menuRename: $('layer-menu-rename'),
    menuDup: $('layer-menu-dup'),
    menuLock: $('layer-menu-lock'),
    menuDel: $('layer-menu-del'),
    renameModal: $('layer-rename-modal'),
    renameInput: $('layer-rename-input'),
    renameClose: $('layer-rename-close'),
    renameCancel: $('layer-rename-cancel'),
    renameConfirm: $('layer-rename-confirm'),
  };

  let menuLayerId = null;
  let dragId = null;

  function nextLayerName() {
    const names = new Set(state.layers.map((l) => l.name));
    let n = state.layers.length + 1;
    while (names.has(`Camada ${n}`)) n++;
    return `Camada ${n}`;
  }

  function recordHistory() {
    callbacks.onHistory?.();
  }

  function selectLayer(id) {
    if (state.activeLayerId === id) return;
    state.activeLayerId = id;
    render();
    callbacks.onChange?.();
  }

  function addLayer() {
    recordHistory();
    const layer = createLayer(nextLayerName());
    const idx = state.layers.findIndex((l) => l.id === state.activeLayerId);
    const insertAt = idx >= 0 ? idx : 0;
    state.layers.splice(insertAt, 0, layer);
    state.activeLayerId = layer.id;
    render();
    callbacks.onChange?.();
  }

  function deleteLayer(id) {
    if (state.layers.length <= 1) return;
    recordHistory();
    const idx = state.layers.findIndex((l) => l.id === id);
    if (idx < 0) return;
    state.layers.splice(idx, 1);
    if (state.activeLayerId === id) {
      state.activeLayerId = state.layers[Math.max(0, idx - 1)].id;
    }
    els.menuModal.hidden = true;
    render();
    callbacks.onChange?.();
  }

  function duplicateLayer(id) {
    const src = getLayerById(id);
    if (!src) return;
    recordHistory();
    const copy = createLayer(`${src.name} cópia`, src.paths.map(clonePath));
    copy.visible = src.visible;
    copy.opacity = src.opacity;
    copy.locked = src.locked;
    const idx = state.layers.findIndex((l) => l.id === id);
    state.layers.splice(idx + 1, 0, copy);
    state.activeLayerId = copy.id;
    els.menuModal.hidden = true;
    render();
    callbacks.onChange?.();
  }

  function clonePath(p) {
    return {
      ...p,
      points: (p.points || []).map((pt) => ({ ...pt })),
      particles: p.particles ? p.particles.map((q) => ({ ...q })) : null,
    };
  }

  function moveLayer(fromId, toId) {
    if (fromId === toId) return;
    const fromIdx = state.layers.findIndex((l) => l.id === fromId);
    const toIdx = state.layers.findIndex((l) => l.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    recordHistory();
    const [item] = state.layers.splice(fromIdx, 1);
    state.layers.splice(toIdx, 0, item);
    render();
    callbacks.onChange?.();
  }

  function toggleVisible(id) {
    const layer = getLayerById(id);
    if (!layer) return;
    recordHistory();
    layer.visible = !layer.visible;
    render();
    callbacks.onChange?.();
  }

  function toggleLock(id) {
    const layer = getLayerById(id);
    if (!layer) return;
    recordHistory();
    layer.locked = !layer.locked;
    updateMenuLockLabel();
    render();
  }

  function setLayerOpacity(id, value) {
    const layer = getLayerById(id);
    if (!layer) return;
    layer.opacity = value;
    els.menuOpVal.textContent = `${Math.round(value * 100)}%`;
    render();
    callbacks.onChange?.();
  }

  function opacityIndex(val) {
    const i = OPACITIES.indexOf(val);
    if (i >= 0) return i;
    let best = 0;
    for (let j = 1; j < OPACITIES.length; j++) {
      if (Math.abs(OPACITIES[j] - val) < Math.abs(OPACITIES[best] - val)) best = j;
    }
    return best;
  }

  function changeMenuOpacity(delta) {
    if (!menuLayerId) return;
    const layer = getLayerById(menuLayerId);
    if (!layer) return;
    const i = opacityIndex(layer.opacity);
    const next = i + delta;
    if (next < 0 || next >= OPACITIES.length) return;
    recordHistory();
    setLayerOpacity(menuLayerId, OPACITIES[next]);
  }

  function openMenu(id) {
    const layer = getLayerById(id);
    if (!layer) return;
    menuLayerId = id;
    els.menuTitle.textContent = layer.name;
    els.menuOpVal.textContent = `${Math.round(layer.opacity * 100)}%`;
    updateMenuLockLabel();
    els.menuDel.disabled = state.layers.length <= 1;
    els.menuModal.hidden = false;
  }

  function updateMenuLockLabel() {
    const layer = getLayerById(menuLayerId);
    if (!layer) return;
    els.menuLock.textContent = layer.locked ? 'Desbloquear' : 'Bloquear';
  }

  function openRename() {
    const layer = getLayerById(menuLayerId);
    if (!layer) return;
    els.menuModal.hidden = true;
    els.renameInput.value = layer.name;
    els.renameModal.hidden = false;
    els.renameInput.focus();
    els.renameInput.select();
  }

  function confirmRename() {
    const layer = getLayerById(menuLayerId);
    const v = els.renameInput.value.trim().slice(0, 24);
    if (layer && v) {
      recordHistory();
      layer.name = v;
    }
    els.renameModal.hidden = true;
    render();
  }

  /** Miniatura 8-bit da camada (paths simplificados). */
  function drawThumb(canvas, layer) {
    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = getCanvasBg();
    ctx.fillRect(0, 0, w, h);
    const inkPaths = layer.paths.filter((p) => !TOOL_DEFS[p.tool]?.eraser);
    if (!inkPaths.length) return;
    const sx = w / state.canvasWidth;
    const sy = h / state.canvasHeight;
    ctx.save();
    ctx.globalAlpha = layer.opacity;
    for (const path of inkPaths) {
      const color = path.color || '#000';
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = Math.max(1, path.size * sx);
      if (path.shape) {
        const x0 = path.x0 * sx;
        const y0 = path.y0 * sy;
        const x1 = path.x1 * sx;
        const y1 = path.y1 * sy;
        const left = Math.min(x0, x1);
        const right = Math.max(x0, x1);
        const top = Math.min(y0, y1);
        const bottom = Math.max(y0, y1);
        if (path.shape === 'rect') {
          ctx.strokeRect(left, top, right - left, bottom - top);
        } else if (path.shape === 'ellipse') {
          ctx.beginPath();
          ctx.ellipse((left + right) / 2, (top + bottom) / 2,
            Math.max(0.5, (right - left) / 2), Math.max(0.5, (bottom - top) / 2), 0, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.stroke();
        }
        continue;
      }
      if (!path.points?.length) continue;
      ctx.beginPath();
      path.points.forEach((pt, i) => {
        const x = pt.x * sx;
        const y = pt.y * sy;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.stroke();
    }
    ctx.restore();
  }

  function render() {
    // Lista de cima para baixo = camada de cima primeiro (ordem visual clássica).
    const ordered = [...state.layers].reverse();
    els.list.innerHTML = ordered.map((layer) => {
      const active = layer.id === state.activeLayerId ? ' is-active' : '';
      const hidden = layer.visible ? '' : ' is-hidden';
      const locked = layer.locked ? ' is-locked' : '';
      const eye = layer.visible ? '◉' : '○';
      return `
        <div class="layer-row${active}${hidden}${locked}" data-id="${layer.id}" draggable="true">
          <button type="button" class="layer-row__eye" data-eye="${layer.id}" title="visível">${eye}</button>
          <canvas class="layer-row__thumb" width="48" height="38" data-thumb="${layer.id}" aria-hidden="true"></canvas>
          <span class="layer-row__name">${layer.name}</span>
          <button type="button" class="layer-row__menu" data-menu="${layer.id}" title="opções">⋮</button>
        </div>`;
    }).join('');

    els.list.querySelectorAll('[data-thumb]').forEach((c) => {
      const layer = getLayerById(c.dataset.thumb);
      if (layer) drawThumb(c, layer);
    });

    els.list.querySelectorAll('.layer-row').forEach((row) => {
      const id = row.dataset.id;
      row.addEventListener('click', (e) => {
        if (e.target.closest('[data-menu]') || e.target.closest('[data-eye]')) return;
        selectLayer(id);
      });
      row.addEventListener('dragstart', (e) => {
        dragId = id;
        row.classList.add('is-dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      row.addEventListener('dragend', () => {
        dragId = null;
        row.classList.remove('is-dragging');
        els.list.querySelectorAll('.layer-row').forEach((r) => r.classList.remove('is-drop-target'));
      });
      row.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (dragId && dragId !== id) row.classList.add('is-drop-target');
      });
      row.addEventListener('dragleave', () => row.classList.remove('is-drop-target'));
      row.addEventListener('drop', (e) => {
        e.preventDefault();
        row.classList.remove('is-drop-target');
        if (dragId && dragId !== id) moveLayer(dragId, id);
      });
    });

    els.list.querySelectorAll('[data-eye]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleVisible(btn.dataset.eye);
      });
    });
    els.list.querySelectorAll('[data-menu]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openMenu(btn.dataset.menu);
      });
    });
  }

  function bindEvents() {
    els.add.addEventListener('click', addLayer);

    els.menuClose.addEventListener('click', () => { els.menuModal.hidden = true; });
    els.menuModal.addEventListener('click', (e) => { if (e.target === els.menuModal) els.menuModal.hidden = true; });
    els.menuOpDown.addEventListener('click', () => changeMenuOpacity(-1));
    els.menuOpUp.addEventListener('click', () => changeMenuOpacity(1));
    els.menuRename.addEventListener('click', openRename);
    els.menuDup.addEventListener('click', () => duplicateLayer(menuLayerId));
    els.menuLock.addEventListener('click', () => toggleLock(menuLayerId));
    els.menuDel.addEventListener('click', () => deleteLayer(menuLayerId));

    els.renameClose.addEventListener('click', () => { els.renameModal.hidden = true; });
    els.renameCancel.addEventListener('click', () => { els.renameModal.hidden = true; });
    els.renameConfirm.addEventListener('click', confirmRename);
    els.renameModal.addEventListener('click', (e) => { if (e.target === els.renameModal) els.renameModal.hidden = true; });
    els.renameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); confirmRename(); }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        els.menuModal.hidden = true;
        els.renameModal.hidden = true;
      }
    });
  }

  function init() {
    bindEvents();
    render();
  }

  return { init, render, addLayer };
}
