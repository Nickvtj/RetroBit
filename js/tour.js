/**
 * Tutorial da primeira vez: escurece a tela e destaca cada parte com um balão
 * pixel-art (canetas → camadas → quadro → ações → dinamite → gestos no toque).
 * Fica guardado que já foi visto; o botão "Ajuda" mostra-o de novo.
 */
import { t } from './i18n.js';
import { playClick, playOpen } from './audio.js';

const KEY = 'retrobit-tour-done';
const isVisible = (sel) => {
  const el = document.querySelector(sel);
  return el && el.offsetParent !== null && el.getBoundingClientRect().width > 0;
};

const STEPS = [
  { target: '#tool-list', title: 'Canetas', text: 'Toque numa caneta para desenhar. Toque de novo na mesma caneta para trocar a cor, o tamanho e a opacidade.' },
  { target: () => (isVisible('#btn-layers') ? '#btn-layers' : '#layers-panel'), title: 'Camadas', text: 'Separe o desenho em camadas: crie, esconda, arraste para reordenar e use o ⋮ para mais opções.' },
  { target: '.mirror-bar', title: 'Quadro', text: 'Zoom, espelho, a luva (pegar e mover traços), a grade de pixel art e as formas.' },
  { target: '#dock', title: 'Ações', text: 'Salve no navegador, exporte um GIF tremendo, mude o fundo, use uma imagem de referência e desfaça o que quiser.' },
  { target: '#btn-clear', title: 'KABOOM!', text: 'A dinamite explode a camada inteira. Sem medo: dá para desfazer.' },
  { target: '#main-canvas', title: 'Gestos', text: 'Pinça para zoom, arraste com dois dedos para mover, toque com dois dedos para desfazer e com três para refazer.', touch: true },
];

export function tourSeen() {
  try { return Boolean(localStorage.getItem(KEY)); } catch { return true; }
}

let root = null;

export function startTour() {
  if (root) return;
  const steps = STEPS.filter((s) => !s.touch || matchMedia('(pointer: coarse)').matches);
  let i = 0;
  root = document.createElement('div');
  root.className = 'tour';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.innerHTML = `
    <div class="tour__hole"></div>
    <div class="tour__bubble win">
      <div class="win__bar"><span class="tour__title"></span></div>
      <div class="tour__body">
        <p class="tour__text"></p>
        <div class="tour__foot">
          <span class="tour__count"></span>
          <button type="button" class="ui-btn tour__skip">${t('Pular')}</button>
          <button type="button" class="ui-btn ui-btn--go tour__next"></button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(root);
  const hole = root.querySelector('.tour__hole');
  const bubble = root.querySelector('.tour__bubble');

  const end = () => {
    try { localStorage.setItem(KEY, '1'); } catch { /* sem storage */ }
    window.removeEventListener('resize', place);
    document.removeEventListener('keydown', onKey, true);
    root.remove();
    root = null;
  };

  function place() {
    const step = steps[i];
    const sel = typeof step.target === 'function' ? step.target() : step.target;
    const el = document.querySelector(sel);
    const r = el ? el.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0, right: innerWidth / 2, bottom: innerHeight / 2 };
    const pad = 8;
    Object.assign(hole.style, {
      left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px`,
    });
    // Balão: por baixo, por cima, à esquerda ou à direita — onde couber.
    const bw = bubble.offsetWidth;
    const bh = bubble.offsetHeight;
    const m = 14;
    let x;
    let y;
    if (r.bottom + pad + m + bh < innerHeight) { x = r.left + r.width / 2 - bw / 2; y = r.bottom + pad + m; }
    else if (r.top - pad - m - bh > 0) { x = r.left + r.width / 2 - bw / 2; y = r.top - pad - m - bh; }
    else if (r.left - pad - m - bw > 0) { x = r.left - pad - m - bw; y = r.top + r.height / 2 - bh / 2; }
    else { x = r.right + pad + m; y = r.top + r.height / 2 - bh / 2; }
    bubble.style.left = `${Math.max(8, Math.min(innerWidth - bw - 8, x))}px`;
    bubble.style.top = `${Math.max(8, Math.min(innerHeight - bh - 8, y))}px`;
  }

  function show() {
    const step = steps[i];
    root.querySelector('.tour__title').textContent = t(step.title);
    root.querySelector('.tour__text').textContent = t(step.text);
    root.querySelector('.tour__count').textContent = t('{i} de {n}', { i: i + 1, n: steps.length });
    root.querySelector('.tour__next').textContent = i === steps.length - 1 ? t('Vamos lá!') : t('Próximo');
    bubble.classList.remove('is-in');
    void bubble.offsetWidth;
    bubble.classList.add('is-in');
    place();
  }

  const next = () => {
    playClick();
    if (i < steps.length - 1) { i++; show(); } else end();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); end(); }
    else if (e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); next(); }
  };
  root.querySelector('.tour__next').addEventListener('click', next);
  root.querySelector('.tour__skip').addEventListener('click', end);
  window.addEventListener('resize', place);
  document.addEventListener('keydown', onKey, true);
  playOpen();
  show();
  root.querySelector('.tour__next').focus({ preventScroll: true });
}
