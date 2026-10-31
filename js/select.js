/**
 * Luva: selecionar traços da camada ativa e mover, esticar (cantos), girar
 * (alça de cima), duplicar, espelhar e explodir.
 *
 *  • toque num traço → seleciona (Shift → junta à seleção)
 *  • arrastar no vazio → seleção por retângulo
 *  • modo bomba → um toque num traço fá-lo explodir em pixels
 *  • teclado: Delete explode · setas movem (Shift = 10px) · Ctrl+D duplica ·
 *    Ctrl+A seleciona tudo · Esc larga a seleção
 *
 * As borrachas não são selecionáveis (apagam o que estiver por baixo delas).
 * A interface (caixa, cantos, ações) vive num HUD em px de ecrã por cima da
 * tela, para não crescer com o zoom.
 */
import { state, snapshotPaths, getActiveLayer, TOOL_DEFS } from './state.js';
import { hitTest, pathBounds } from './hit.js';
import { mirrorFlips, mapX, mapY } from './mirror.js';
import { transformPathM, mirrorCopies, translate, scaleAround, rotateAround } from './transform.js';
import { decodeMask } from './fill.js';
import { densify } from './wiggle.js';
import { shapeOutline } from './shapes.js';
import { icon } from './icons.js';
import { playBoom, playSwitch, playGrab, playDrop } from './audio.js';
import { t } from './i18n.js';

const MOVE_SLOP = 3;      // px de ecrã antes de um toque virar arrasto
const HIT_SLOP_PX = 8;    // folga do toque num traço, em px de ecrã
const BITS_PER_PATH = 160;

const isEraser = (p) => TOOL_DEFS[p.tool]?.eraser;

export function createSelectTool({ engine, history, renderer, zone, onEdit, onLocked }) {
  const hud = document.getElementById('sel-hud');
  hud.innerHTML = `
    <div class="sel-modes" role="toolbar" aria-label="${t('modo da luva')}">
      <button type="button" class="sel-mode is-active" data-mode="hand" title="${t('luva: mover, esticar e girar')}" aria-pressed="true">${icon('glove')}</button>
      <button type="button" class="sel-mode" data-mode="bomb" title="${t('bomba: toque num traço para explodir')}" aria-pressed="false">${icon('bomb')}</button>
    </div>
    <div class="sel-marquee" hidden></div>
    <div class="sel-box" hidden>
      <span class="sel-rot-line"></span>
      <button type="button" class="sel-handle sel-handle--rot" data-h="rot" aria-label="${t('girar')}"></button>
      <button type="button" class="sel-handle" data-h="nw" aria-label="${t('esticar')}"></button>
      <button type="button" class="sel-handle" data-h="ne" aria-label="${t('esticar')}"></button>
      <button type="button" class="sel-handle" data-h="sw" aria-label="${t('esticar')}"></button>
      <button type="button" class="sel-handle" data-h="se" aria-label="${t('esticar')}"></button>
      <div class="sel-actions">
        <button type="button" data-act="bomb" title="${t('explodir (Delete)')}">${icon('bomb')}</button>
        <button type="button" data-act="copy" title="${t('duplicar (Ctrl+D)')}">${icon('copy')}</button>
        <button type="button" data-act="flip" title="${t('espelhar')}">${icon('mirrorH')}</button>
      </div>
    </div>`;
  const els = {
    modes: hud.querySelector('.sel-modes'),
    marquee: hud.querySelector('.sel-marquee'),
    box: hud.querySelector('.sel-box'),
    actions: hud.querySelector('.sel-actions'),
  };

  let selected = new Set();
  let mode = 'hand';
  let drag = null; // { kind, start, sx, sy, moved, origs, layer, box, h }

  /* ── Geometria ──────────────────────────────────────────── */
  const W = () => state.canvasWidth;
  const H = () => state.canvasHeight;
  const canvasRect = () => engine.mainCanvas.getBoundingClientRect();
  /** Unidades da tela por px de ecrã (inclui o zoom). */
  const unitsPerPx = () => W() / canvasRect().width;

  /** Só o que ainda existe na camada ativa conta (desfazer, trocar de camada…). */
  function live() {
    const layer = getActiveLayer();
    if (!layer) return [];
    const inLayer = new Set(layer.paths);
    selected = new Set([...selected].filter((p) => inLayer.has(p)));
    return [...selected];
  }

  /** Caixa envolvente (em unidades da tela), incluindo as cópias espelhadas. */
  function bounds(paths) {
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    for (const p of paths) {
      const b = pathBounds(p);
      if (!b) continue;
      for (const { flipX, flipY } of mirrorFlips(p.mirrorH, p.mirrorV)) {
        const xs = [mapX(b.x, W(), flipX), mapX(b.x + b.w, W(), flipX)];
        const ys = [mapY(b.y, H(), flipY), mapY(b.y + b.h, H(), flipY)];
        x0 = Math.min(x0, ...xs); x1 = Math.max(x1, ...xs);
        y0 = Math.min(y0, ...ys); y1 = Math.max(y1, ...ys);
      }
    }
    return x1 < x0 ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  function toZone(x, y) {
    const r = canvasRect();
    const z = zone.getBoundingClientRect();
    return [r.left - z.left + (x * r.width) / W(), r.top - z.top + (y * r.height) / H()];
  }

  /* ── HUD ────────────────────────────────────────────────── */
  function render() {
    hud.hidden = !state.selectMode;
    if (!state.selectMode) return;
    const r = canvasRect();
    const z = zone.getBoundingClientRect();
    els.modes.style.left = `${Math.max(4, r.left - z.left + 8)}px`;
    els.modes.style.top = `${Math.max(4, r.top - z.top + 8)}px`;

    const b = mode === 'hand' ? bounds(live()) : null;
    els.box.hidden = !b;
    if (!b) return;
    const pad = 8; // folga entre o traço e a caixa: os cantos não tapam traços finos
    const [x0, y0] = toZone(b.x, b.y);
    const [x1, y1] = toZone(b.x + b.w, b.y + b.h);
    Object.assign(els.box.style, {
      left: `${x0 - pad}px`, top: `${y0 - pad}px`, width: `${x1 - x0 + pad * 2}px`, height: `${y1 - y0 + pad * 2}px`,
    });
    // As ações vão para cima se não couberem por baixo.
    els.actions.classList.toggle('is-above', y1 + 64 > zone.clientHeight);
  }

  function setMode(m, silent = false) {
    mode = m;
    hud.querySelectorAll('.sel-mode').forEach((b) => {
      const on = b.dataset.mode === m;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    engine.mainCanvas.classList.toggle('is-bomb', state.selectMode && m === 'bomb');
    if (!silent) playSwitch();
    render();
  }

  /* ── Edição ─────────────────────────────────────────────── */
  /** Primeiro movimento de uma transformação: histórico + cópias dos originais. */
  function begin() {
    const layer = getActiveLayer();
    if (!layer || !live().length) return false;
    if (layer.locked) { onLocked?.(); return false; }
    history.record(snapshotPaths());
    playGrab();
    // Traços espelhados viram cópias reais: o grupo passa a mover-se junto.
    if ([...selected].some((p) => p.mirrorH || p.mirrorV)) {
      const next = new Set();
      layer.paths = layer.paths.flatMap((p) => {
        if (!selected.has(p)) return [p];
        const copies = mirrorCopies(p, W(), H());
        copies.forEach((c) => next.add(c));
        return copies;
      });
      selected = next;
    }
    drag.layer = layer;
    drag.origs = [];
    layer.paths.forEach((p, i) => { if (selected.has(p)) drag.origs.push([i, p]); });
    return true;
  }

  function apply(m) {
    const next = new Set();
    for (const [i, p] of drag.origs) {
      const q = transformPathM(p, m);
      drag.layer.paths[i] = q;
      next.add(q);
    }
    selected = next;
    renderer.invalidate();
    render();
  }

  /** Transformação de uma vez só (teclado, botões). */
  function once(makeMatrix) {
    drag = { kind: 'once' };
    if (begin()) {
      apply(makeMatrix(bounds([...selected])));
      onEdit?.();
    }
    drag = null;
  }

  /** Pontos de onde saem os pixels da explosão (com a cor de cada traço). */
  function explosionBits(p) {
    let pts;
    if (p.mask) {
      const bits = decodeMask(p.mask);
      pts = [];
      for (let k = 0; k < BITS_PER_PATH; k++) {
        const i = Math.floor(Math.random() * bits.length);
        if (bits[i]) pts.push({ x: p.mask.x + (i % p.mask.w), y: p.mask.y + Math.floor(i / p.mask.w) });
      }
    } else if (p.cells) {
      pts = p.cells.map(([cx, cy]) => ({ x: (cx + 0.5) * p.grid, y: (cy + 0.5) * p.grid }));
    } else if (p.particles?.length) {
      pts = p.particles;
    } else {
      pts = densify(p.shape ? shapeOutline(p) : p.points || [], 4);
    }
    if (pts.length > BITS_PER_PATH) pts = pts.filter((_, i) => i % Math.ceil(pts.length / BITS_PER_PATH) === 0);
    const out = [];
    for (const { flipX, flipY } of mirrorFlips(p.mirrorH, p.mirrorV)) {
      for (const q of pts) out.push({ x: mapX(q.x, W(), flipX), y: mapY(q.y, H(), flipY), c: p.color });
    }
    return out;
  }

  function explode(paths) {
    const layer = getActiveLayer();
    if (!layer || !paths.length) return;
    if (layer.locked) { onLocked?.(); return; }
    history.record(snapshotPaths());
    const gone = new Set(paths);
    engine.explodeBits(paths.flatMap(explosionBits));
    layer.paths = layer.paths.filter((p) => !gone.has(p));
    selected = new Set([...selected].filter((p) => !gone.has(p)));
    playBoom();
    renderer.invalidate();
    render();
    onEdit?.();
  }

  function duplicate() {
    const layer = getActiveLayer();
    const src = live();
    if (!layer || !src.length) return;
    if (layer.locked) { onLocked?.(); return; }
    history.record(snapshotPaths());
    const offset = 12;
    const copies = src.map((p) => transformPathM(p, translate(offset, offset)));
    layer.paths.push(...copies);
    selected = new Set(copies);
    playSwitch();
    renderer.invalidate();
    render();
    onEdit?.();
  }

  /* ── Ponteiro na tela ───────────────────────────────────── */
  function onPointerDown(e, pos) {
    const layer = getActiveLayer();
    if (!layer) return;
    const hit = hitTest(layer, pos, { slop: HIT_SLOP_PX * unitsPerPx() });
    const p = hit && layer.paths[hit.index];

    if (mode === 'bomb') {
      if (p) explode([p]);
      return;
    }
    const b = selected.size ? bounds(live()) : null;
    const inBox = b && pos.x >= b.x && pos.x <= b.x + b.w && pos.y >= b.y && pos.y <= b.y + b.h;
    if (p && !selected.has(p)) {
      if (!e.shiftKey) selected = new Set();
      selected.add(p);
      playSwitch();
    }
    if (p || inBox) {
      drag = { kind: 'move', start: pos, sx: e.clientX, sy: e.clientY, moved: false };
    } else {
      if (!e.shiftKey) selected = new Set();
      drag = { kind: 'marquee', start: pos, sx: e.clientX, sy: e.clientY, moved: false };
    }
    render();
  }

  function onPointerMove(e, pos) {
    if (!drag) return;
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < MOVE_SLOP) return;
      drag.moved = true;
      if (drag.kind !== 'marquee' && !begin()) { drag = null; return; }
      zone.classList.add('is-grabbing');
    }
    if (drag.kind === 'marquee') {
      const [x0, y0] = toZone(Math.min(drag.start.x, pos.x), Math.min(drag.start.y, pos.y));
      const [x1, y1] = toZone(Math.max(drag.start.x, pos.x), Math.max(drag.start.y, pos.y));
      els.marquee.hidden = false;
      Object.assign(els.marquee.style, { left: `${x0}px`, top: `${y0}px`, width: `${x1 - x0}px`, height: `${y1 - y0}px` });
      return;
    }
    if (drag.kind === 'move') {
      apply(translate(pos.x - drag.start.x, pos.y - drag.start.y));
      return;
    }
    const { box } = drag;
    if (drag.kind === 'rotate') {
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      let a = Math.atan2(pos.y - cy, pos.x - cx) - Math.atan2(drag.start.y - cy, drag.start.x - cx);
      if (e.shiftKey) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12); // de 15 em 15°
      apply(rotateAround(a, cx, cy));
      return;
    }
    // Esticar pelo canto: o canto oposto fica parado.
    const ax = drag.h.includes('w') ? box.x + box.w : box.x;
    const ay = drag.h.includes('n') ? box.y + box.h : box.y;
    const ox = drag.h.includes('w') ? box.x : box.x + box.w;
    const oy = drag.h.includes('n') ? box.y : box.y + box.h;
    const lim = (s) => (Math.abs(s) < 0.05 ? Math.sign(s || 1) * 0.05 : s);
    let sx = lim((pos.x - ax) / (ox - ax || 1));
    let sy = lim((pos.y - ay) / (oy - ay || 1));
    if (e.shiftKey) { const s = Math.max(Math.abs(sx), Math.abs(sy)); sx = Math.sign(sx) * s; sy = Math.sign(sy) * s; }
    apply(scaleAround(sx, sy, ax, ay));
  }

  function onPointerUp(e, pos) {
    if (!drag) return;
    const d = drag;
    drag = null;
    zone.classList.remove('is-grabbing');
    els.marquee.hidden = true;
    if (d.kind === 'marquee' && d.moved) {
      const x0 = Math.min(d.start.x, pos.x); const x1 = Math.max(d.start.x, pos.x);
      const y0 = Math.min(d.start.y, pos.y); const y1 = Math.max(d.start.y, pos.y);
      for (const p of getActiveLayer()?.paths || []) {
        if (isEraser(p)) continue;
        const b = bounds([p]);
        if (b && b.x < x1 && b.x + b.w > x0 && b.y < y1 && b.y + b.h > y0) selected.add(p);
      }
      if (selected.size) playSwitch();
    }
    if (d.moved && d.kind !== 'marquee') {
      playDrop();
      onEdit?.();
    }
    render();
  }

  /** Um 2º dedo pousou: o que estava a meio fica como está. */
  function cancel() {
    if (drag?.moved && drag.kind !== 'marquee') onEdit?.();
    drag = null;
    zone.classList.remove('is-grabbing');
    els.marquee.hidden = true;
    render();
  }

  function clear() {
    selected = new Set();
    render();
  }

  /* ── HUD: cantos, alça, ações e modos ───────────────────── */
  hud.querySelectorAll('.sel-handle').forEach((h) => {
    h.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      h.setPointerCapture(e.pointerId);
      const box = bounds(live());
      if (!box) return;
      drag = {
        kind: h.dataset.h === 'rot' ? 'rotate' : 'scale', h: h.dataset.h, box,
        start: engine.getCanvasPos(e, false), sx: e.clientX, sy: e.clientY, moved: false,
      };
    });
    h.addEventListener('pointermove', (e) => { if (drag) onPointerMove(e, engine.getCanvasPos(e, false)); });
    h.addEventListener('pointerup', (e) => onPointerUp(e, engine.getCanvasPos(e, false)));
    h.addEventListener('pointercancel', cancel);
  });
  els.actions.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'bomb') explode(live());
    else if (act === 'copy') duplicate();
    else if (act === 'flip') once((b) => scaleAround(-1, 1, b.x + b.w / 2, b.y + b.h / 2));
  });
  els.modes.addEventListener('click', (e) => {
    const m = e.target.closest('[data-mode]')?.dataset.mode;
    if (m && m !== mode) setMode(m);
  });

  document.addEventListener('keydown', (e) => {
    if (!state.selectMode || zone.offsetParent === null || e.target.closest?.('input, textarea')) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (e.key === 'Escape') { clear(); return; }
    if (mod && k === 'a') {
      e.preventDefault();
      selected = new Set((getActiveLayer()?.paths || []).filter((p) => !isEraser(p)));
      render();
    } else if (mod && k === 'd') {
      e.preventDefault();
      duplicate();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected.size) {
      e.preventDefault();
      explode(live());
    } else if (e.key.startsWith('Arrow') && selected.size) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const dx = { ArrowLeft: -step, ArrowRight: step }[e.key] || 0;
      const dy = { ArrowUp: -step, ArrowDown: step }[e.key] || 0;
      once(() => translate(dx, dy));
    }
  });

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    cancel,
    clear,
    refresh: render,
    /** Liga/desliga a luva (ao sair, larga a seleção e volta ao modo mão). */
    setActive(on) {
      if (!on) { selected = new Set(); drag = null; setMode('hand', true); }
      engine.mainCanvas.classList.toggle('is-bomb', on && mode === 'bomb');
      render();
    },
    get selection() { return live(); },
  };
}
