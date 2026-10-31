/**
 * Imagem de referência: uma foto/desenho por baixo (ou por cima) da tela para
 * copiar. Não é exportada (PNG/GIF/miniatura), o balde ignora-a, mas o
 * conta-gotas pode tirar cores dela.
 *
 * state.reference = { src, x, y, w, h, opacity, visible, above, gray } | null
 * É imutável (cada mudança cria um objeto novo) → entra no desfazer.
 */
import { state, snapshotPaths } from './state.js';
import { playSwitch } from './audio.js';
import { t } from './i18n.js';

const MAX_SIDE = 2048;              // px: imagens maiores são reduzidas antes de guardar
const OPACITIES = [0.15, 0.3, 0.5, 0.75, 1];

/* ── Imagens carregadas (e a versão a preto e branco) ─────── */
const images = new Map(); // src → { img, ready, gray }

/** Imagem pronta para desenhar, ou null enquanto carrega (`onReady` avisa). */
export function referenceImage(ref, onReady) {
  let entry = images.get(ref.src);
  if (!entry) {
    entry = { img: new Image(), ready: false, gray: null };
    entry.img.onload = () => { entry.ready = true; onReady?.(); };
    entry.img.src = ref.src;
    images.set(ref.src, entry);
  }
  if (!entry.ready) return null;
  if (!ref.gray) return entry.img;
  if (!entry.gray) {
    const c = document.createElement('canvas');
    c.width = entry.img.naturalWidth;
    c.height = entry.img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(entry.img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    const px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      const v = Math.round(px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114);
      px[i] = px[i + 1] = px[i + 2] = v;
    }
    ctx.putImageData(d, 0, 0);
    entry.gray = c;
  }
  return entry.gray;
}

/** Caixa que faz a imagem caber inteira na tela, centrada. */
function fitBox(iw, ih) {
  const s = Math.min(state.canvasWidth / iw, state.canvasHeight / ih);
  const w = iw * s;
  const h = ih * s;
  return { x: (state.canvasWidth - w) / 2, y: (state.canvasHeight - h) / 2, w, h };
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/** Ficheiro de imagem → referência nova (reduzida, já como dataURL para guardar no projeto). */
async function referenceFromFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const s = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * s));
    c.height = Math.max(1, Math.round(img.naturalHeight * s));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    // JPEG fica pequeno; o resto vai em WebP (mantém transparência; o Safari cai para PNG).
    const src = file.type === 'image/jpeg' ? c.toDataURL('image/jpeg', 0.88) : c.toDataURL('image/webp', 0.9);
    return { src, ...fitBox(c.width, c.height), opacity: 0.5, visible: true, above: false, gray: false };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Janela "imagem de referência", importação (ficheiro, arrastar, colar) e o
 * modo mover/esticar sobre a tela.
 */
export function createReference({ engine, history, zone, onChange, toast }) {
  const $ = (id) => document.getElementById(id);
  const els = {
    modal: $('ref-modal'), close: $('ref-close'), file: $('ref-file'),
    empty: $('ref-empty'), set: $('ref-set'), thumb: $('ref-thumb'), pick: $('ref-pick'),
    opDown: $('ref-op-down'), opUp: $('ref-op-up'), opVal: $('ref-op-val'),
    visible: $('ref-visible'), above: $('ref-above'), gray: $('ref-gray'),
    adjust: $('ref-adjust'), fit: $('ref-fit'), change: $('ref-change'), remove: $('ref-remove'),
    hud: $('ref-hud'),
  };
  els.hud.innerHTML = `
    <div class="sel-box ref-box">
      <button type="button" class="sel-handle" data-h="nw" aria-label="${t('esticar')}"></button>
      <button type="button" class="sel-handle" data-h="ne" aria-label="${t('esticar')}"></button>
      <button type="button" class="sel-handle" data-h="sw" aria-label="${t('esticar')}"></button>
      <button type="button" class="sel-handle" data-h="se" aria-label="${t('esticar')}"></button>
    </div>
    <button type="button" class="ui-btn ui-btn--go ref-done">${t('Pronto')}</button>`;
  const box = els.hud.querySelector('.ref-box');
  const done = els.hud.querySelector('.ref-done');
  let drag = null; // { h, start, orig, recorded }

  /** Troca a referência (com desfazer) e avisa o resto da app. */
  function update(next, record = true) {
    if (record) history.record(snapshotPaths());
    state.reference = next;
    onChange();
    render();
  }
  const patch = (fields) => state.reference && update({ ...state.reference, ...fields });

  function render() {
    const ref = state.reference;
    els.empty.hidden = Boolean(ref);
    els.set.hidden = !ref;
    if (ref) {
      els.thumb.src = ref.src;
      els.opVal.textContent = `${Math.round(ref.opacity * 100)}%`;
      els.visible.setAttribute('aria-pressed', String(ref.visible));
      els.above.setAttribute('aria-pressed', String(ref.above));
      els.gray.setAttribute('aria-pressed', String(ref.gray));
    }
    renderHud();
  }

  /* ── Importar ───────────────────────────────────────────── */
  async function importFile(file) {
    if (!file?.type?.startsWith('image/')) return;
    try {
      update(await referenceFromFile(file));
      playSwitch();
      toast?.(t('imagem de referência colocada'));
    } catch {
      toast?.(t('não deu para abrir essa imagem'));
    }
  }

  /* ── Mover / esticar sobre a tela ───────────────────────── */
  const canvasRect = () => engine.mainCanvas.getBoundingClientRect();
  function renderHud() {
    const ref = state.reference;
    const on = Boolean(state.refAdjust && ref);
    els.hud.hidden = !on;
    if (!on) return;
    const r = canvasRect();
    const z = zone.getBoundingClientRect();
    const k = r.width / state.canvasWidth;
    Object.assign(box.style, {
      left: `${r.left - z.left + ref.x * k}px`, top: `${r.top - z.top + ref.y * k}px`,
      width: `${ref.w * k}px`, height: `${ref.h * k}px`,
    });
    done.style.left = `${r.left - z.left + (r.width - done.offsetWidth) / 2}px`;
    done.style.top = `${Math.max(8, r.top - z.top + 8)}px`;
  }
  function setAdjust(on) {
    state.refAdjust = on && Boolean(state.reference);
    renderHud();
  }

  function startDrag(e, h) {
    if (e.button !== 0 || !state.reference) return;
    e.stopPropagation();
    e.target.setPointerCapture(e.pointerId);
    drag = { h, start: engine.getCanvasPos(e, false), orig: state.reference, recorded: false };
  }
  function moveDrag(e) {
    if (!drag) return;
    const pos = engine.getCanvasPos(e, false);
    const o = drag.orig;
    let next;
    if (!drag.h) {
      next = { ...o, x: o.x + pos.x - drag.start.x, y: o.y + pos.y - drag.start.y };
    } else {
      // Canto: estica mantendo a proporção, com o canto oposto parado.
      const ax = drag.h.includes('w') ? o.x + o.w : o.x;
      const ay = drag.h.includes('n') ? o.y + o.h : o.y;
      const s = Math.max(0.05, Math.max(Math.abs(pos.x - ax) / o.w, Math.abs(pos.y - ay) / o.h));
      const w = o.w * s;
      const h = o.h * s;
      next = { ...o, w, h, x: drag.h.includes('w') ? ax - w : ax, y: drag.h.includes('n') ? ay - h : ay };
    }
    update(next, !drag.recorded);
    drag.recorded = true;
  }
  const endDrag = () => { drag = null; };

  box.addEventListener('pointerdown', (e) => { if (e.target === box) startDrag(e, null); });
  box.addEventListener('pointermove', moveDrag);
  box.addEventListener('pointerup', endDrag);
  box.addEventListener('pointercancel', endDrag);
  box.querySelectorAll('.sel-handle').forEach((h) => {
    h.addEventListener('pointerdown', (e) => startDrag(e, h.dataset.h));
    h.addEventListener('pointermove', moveDrag);
    h.addEventListener('pointerup', endDrag);
    h.addEventListener('pointercancel', endDrag);
  });
  done.addEventListener('click', () => { setAdjust(false); playSwitch(); });

  /* ── Janela ─────────────────────────────────────────────── */
  function open() {
    render();
    els.modal.hidden = false;
  }
  const closeModal = () => { els.modal.hidden = true; };
  els.close.addEventListener('click', closeModal);
  els.modal.addEventListener('click', (e) => { if (e.target === els.modal) closeModal(); });
  els.pick.addEventListener('click', () => els.file.click());
  els.change.addEventListener('click', () => els.file.click());
  els.file.addEventListener('change', () => {
    importFile(els.file.files[0]);
    els.file.value = '';
  });
  const stepOpacity = (d) => {
    const ref = state.reference;
    if (!ref) return;
    let i = OPACITIES.findIndex((v) => v >= ref.opacity - 1e-3);
    if (i < 0) i = OPACITIES.length - 1;
    const next = OPACITIES[Math.max(0, Math.min(OPACITIES.length - 1, i + d))];
    if (next !== ref.opacity) patch({ opacity: next });
  };
  els.opDown.addEventListener('click', () => stepOpacity(-1));
  els.opUp.addEventListener('click', () => stepOpacity(1));
  els.visible.addEventListener('click', () => patch({ visible: !state.reference.visible }));
  els.above.addEventListener('click', () => patch({ above: !state.reference.above }));
  els.gray.addEventListener('click', () => patch({ gray: !state.reference.gray }));
  els.fit.addEventListener('click', () => {
    const ref = state.reference;
    const img = ref && referenceImage(ref);
    if (img) patch(fitBox(img.naturalWidth || img.width, img.naturalHeight || img.height));
  });
  els.adjust.addEventListener('click', () => {
    closeModal();
    if (!state.reference.visible) patch({ visible: true });
    setAdjust(true);
  });
  els.remove.addEventListener('click', () => {
    update(null);
    setAdjust(false);
    playSwitch();
  });

  // Arrastar um ficheiro de imagem para a janela, ou colar (Ctrl+V), quando a tela está aberta.
  const appOpen = () => zone.offsetParent !== null;
  window.addEventListener('dragover', (e) => {
    if (appOpen() && [...(e.dataTransfer?.items || [])].some((i) => i.kind === 'file')) e.preventDefault();
  });
  window.addEventListener('drop', (e) => {
    if (!appOpen()) return;
    const file = [...(e.dataTransfer?.files || [])].find((f) => f.type.startsWith('image/'));
    if (!file) return;
    e.preventDefault();
    importFile(file);
  });
  document.addEventListener('paste', (e) => {
    if (!appOpen() || e.target.closest?.('input, textarea')) return;
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
    if (!item) return;
    e.preventDefault();
    importFile(item.getAsFile());
  });

  return { open, refresh: render, setAdjust };
}
