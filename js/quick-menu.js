/**
 * Menu rápido da ferramenta: abre ao lado da caneta (ou acima da bandeja, em
 * retrato) com 6 cores favoritas, tamanho, opacidade e a paleta completa.
 * Fecha sozinho ao clicar fora (ex.: começar a desenhar) ou com Esc.
 *
 * As favoritas são partilhadas por todas as ferramentas e ficam guardadas
 * no navegador. Segurar (ou clique direito) num quadradinho guarda nele a
 * cor atual da ferramenta.
 */
import { state, BRUSH_SIZES, OPACITIES } from './state.js';
import { buildColorGrid, markCurrentSwatch, HEX_RE } from './palette.js';
import { playSwitch, playColor } from './audio.js';
import { enablePaintDrag } from './paint-drag.js';
import { t } from './i18n.js';

const FAV_KEY = 'retrobit-favs';
const DEFAULT_FAVS = ['#000000', '#ffffff', '#1f6feb', '#e400e4', '#16a34a', '#f97316'];
const HOLD_MS = 450;
const SHEET_MQ = '(orientation: portrait) and (max-width: 1100px)';

function loadFavs() {
  try {
    const arr = JSON.parse(localStorage.getItem(FAV_KEY));
    if (Array.isArray(arr) && arr.length === 6 && arr.every((h) => HEX_RE.test(h))) return arr;
  } catch { /* sem storage */ }
  return DEFAULT_FAVS.slice();
}

/**
 * @param {{ onChange: () => void, onStartPick: () => void, onDropPaint: Function }} callbacks
 *   onChange    → cor/tamanho/opacidade do alvo mudou (sincronizar e redesenhar)
 *   onStartPick → o utilizador quer o conta-gotas
 *   onDropPaint → (balde) uma favorita foi arrastada e solta em (x, y)
 */
export function createQuickMenu(callbacks) {
  const $ = (id) => document.getElementById(id);
  const els = {
    root: $('quick-menu'), title: $('quick-title'), close: $('quick-close'),
    favs: $('quick-favs'), picker: $('quick-picker'), more: $('quick-more'),
    sizes: $('quick-sizes'), ops: $('quick-ops'),
    panel: $('quick-panel'), grid: $('quick-grid'), current: $('quick-current'), hex: $('quick-hex'),
  };
  const favs = loadFavs();
  let target = null; // { kind: 'tool' | 'shape', key, label, anchor, eraser, noSize, paint }
  let holdTimer = 0;
  let held = false;

  /** Mapas de definições do alvo (ferramentas e formas guardam à parte). */
  function store() {
    return target.kind === 'shape'
      ? { colors: state.shapeColors, sizes: state.shapeSizes, opacity: state.shapeOpacity }
      : { colors: state.toolColors, sizes: state.toolSizes, opacity: state.toolOpacity };
  }

  function render() {
    const s = store();
    const color = s.colors[target.key];
    els.title.textContent = target.label;
    els.root.classList.toggle('is-eraser', Boolean(target.eraser));
    els.root.classList.toggle('is-nosize', Boolean(target.noSize));

    els.favs.innerHTML = favs.map((hex, i) => `<button type="button" class="quick__fav${hex === color ? ' is-current' : ''}"
      data-i="${i}" style="background:${hex}" title="${t('{hex} · segure para guardar a cor atual aqui', { hex })}"></button>`).join('');

    const dotColor = target.eraser ? 'var(--fg)' : color;
    els.sizes.innerHTML = BRUSH_SIZES.map((size, i) => {
      const px = Math.max(3, Math.min(24, size + 2));
      const cur = s.sizes[target.key] === i;
      return `<button type="button" class="quick__size${cur ? ' is-current' : ''}" data-size="${i}"
        role="radio" aria-checked="${cur}" title="${t('tamanho {n}', { n: size })}">
        <span class="quick__dot" style="width:${px}px;height:${px}px;color:${dotColor}"></span></button>`;
    }).join('');

    els.ops.innerHTML = OPACITIES.map((op) => {
      const cur = s.opacity[target.key] === op;
      return `<button type="button" class="quick__op${cur ? ' is-current' : ''}" data-op="${op}"
        role="radio" aria-checked="${cur}">${Math.round(op * 100)}%</button>`;
    }).join('');

    els.current.style.background = color;
    if (document.activeElement !== els.hex) els.hex.value = color;
    markCurrentSwatch(els.grid, color);
  }

  function position() {
    const el = els.root;
    const sheet = matchMedia(SHEET_MQ).matches;
    const r = target.anchor.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const m = 8;
    let x;
    let y;
    if (sheet) {
      // Retrato: centrado, logo acima da bandeja de canetas.
      const tray = document.querySelector('.tool-rail')?.getBoundingClientRect();
      x = (innerWidth - w) / 2;
      y = (tray ? tray.top : innerHeight) - h - 14;
    } else if (target.kind === 'shape') {
      x = r.right - w;
      y = r.bottom + 14;
    } else {
      // À esquerda da caneta, centrado na altura dela.
      x = r.left - w - 14;
      y = r.top + r.height / 2 - h / 2;
    }
    el.style.left = `${Math.round(Math.max(m, Math.min(innerWidth - w - m, x)))}px`;
    el.style.top = `${Math.round(Math.max(m, Math.min(innerHeight - h - m, y)))}px`;
  }

  function open(t) {
    target = t;
    els.panel.hidden = true;
    els.more.setAttribute('aria-expanded', 'false');
    render();
    els.root.hidden = false;
    position();
  }

  function close() {
    els.root.hidden = true;
    target = null;
    clearTimeout(holdTimer);
  }

  function isOpenFor(kind, key) {
    return !els.root.hidden && target?.kind === kind && target.key === key;
  }

  function changed() {
    callbacks.onChange?.();
    render();
  }

  function setColor(hex) {
    if (!target || target.eraser) return;
    store().colors[target.key] = hex;
    playColor(hex);
    changed();
  }

  function saveFav(i) {
    if (!target || target.eraser) return;
    favs[i] = store().colors[target.key];
    try { localStorage.setItem(FAV_KEY, JSON.stringify(favs)); } catch { /* sem storage */ }
    render();
    els.favs.querySelector(`[data-i="${i}"]`)?.classList.add('is-saved');
    playSwitch();
  }

  function bindEvents() {
    els.close.addEventListener('click', close);

    // Favoritas: toque = usar; segurar / clique direito = guardar a cor atual.
    els.favs.addEventListener('pointerdown', (e) => {
      const fav = e.target.closest('.quick__fav');
      if (!fav) return;
      held = false;
      clearTimeout(holdTimer);
      holdTimer = setTimeout(() => { held = true; saveFav(+fav.dataset.i); }, HOLD_MS);
    });
    const cancelHold = () => clearTimeout(holdTimer);
    // No menu do balde, uma favorita também pode ser arrastada até a tela.
    enablePaintDrag(
      els.favs,
      (e) => {
        const fav = e.target.closest('.quick__fav');
        if (!fav || !target?.paint) return null;
        return { color: favs[+fav.dataset.i], opacity: store().opacity[target.key] };
      },
      (x, y, paint) => { close(); callbacks.onDropPaint?.(x, y, paint); },
      () => { cancelHold(); held = true; },
    );
    els.favs.addEventListener('pointerup', cancelHold);
    els.favs.addEventListener('pointerleave', cancelHold);
    els.favs.addEventListener('pointercancel', cancelHold);
    els.favs.addEventListener('click', (e) => {
      const fav = e.target.closest('.quick__fav');
      if (!fav || held) return;
      setColor(favs[+fav.dataset.i]);
    });
    els.favs.addEventListener('contextmenu', (e) => {
      const fav = e.target.closest('.quick__fav');
      if (!fav) return;
      e.preventDefault();
      clearTimeout(holdTimer);
      held = true;
      saveFav(+fav.dataset.i);
    });

    els.sizes.addEventListener('click', (e) => {
      const b = e.target.closest('[data-size]');
      if (!b || !target) return;
      store().sizes[target.key] = +b.dataset.size;
      changed();
    });
    els.ops.addEventListener('click', (e) => {
      const b = e.target.closest('[data-op]');
      if (!b || !target) return;
      store().opacity[target.key] = +b.dataset.op;
      changed();
    });

    els.more.addEventListener('click', () => {
      els.panel.hidden = !els.panel.hidden;
      els.more.setAttribute('aria-expanded', String(!els.panel.hidden));
      position();
    });
    els.picker.addEventListener('click', () => {
      close();
      callbacks.onStartPick?.();
    });
    buildColorGrid(els.grid, setColor);
    els.hex.addEventListener('change', () => {
      const v = els.hex.value.trim();
      if (HEX_RE.test(v)) setColor(v.toLowerCase());
      else if (target) els.hex.value = store().colors[target.key];
    });

    // Clicar fora fecha (a própria ferramenta trata do clique nela: abre/fecha).
    document.addEventListener('pointerdown', (e) => {
      if (els.root.hidden || !target) return;
      if (els.root.contains(e.target) || target.anchor.contains(e.target)) return;
      close();
    }, true);
    // Reposiciona (não fecha): no telemóvel o teclado do campo de cor também redimensiona.
    window.addEventListener('resize', () => { if (!els.root.hidden && target) position(); });
  }

  bindEvents();
  return { open, close, isOpenFor, refresh: () => target && render() };
}
