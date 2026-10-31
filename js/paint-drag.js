/**
 * Arrastar tinta (estilo programas profissionais): a partir do balde — ou de
 * uma cor do menu rápido dele — uma gota segue o ponteiro; ao soltar sobre a
 * tela, a região por baixo é pintada.
 *
 * Um toque/clique sem arrastar continua a ser um clique normal.
 */
import { icon } from './icons.js';

const THRESHOLD = 10; // px antes de virar arrasto

let ghost = null;

function showGhost(color, x, y) {
  if (!ghost) {
    ghost = document.createElement('div');
    ghost.className = 'paint-drag';
    ghost.innerHTML = icon('drop');
    document.body.appendChild(ghost);
  }
  ghost.style.color = color;
  ghost.hidden = false;
  moveGhost(x, y);
}

function moveGhost(x, y) {
  ghost.style.transform = `translate(${Math.round(x - 18)}px, ${Math.round(y - 40)}px)`;
}

/**
 * Liga o arrasto a `el`.
 * @param getPaint (pointerdownEvent) → { color, opacity } ou null (não arrasta)
 * @param onDrop   (clientX, clientY, paint) → chamado ao soltar
 * @param onStart  opcional: o arrasto começou (ex.: cancelar um "segurar")
 */
export function enablePaintDrag(el, getPaint, onDrop, onStart) {
  let start = null; // { x, y, id, paint }
  let dragging = false;
  let swallowClick = false;

  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const paint = getPaint(e);
    if (!paint) return;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId, paint };
    dragging = false;
  });
  el.addEventListener('pointermove', (e) => {
    if (!start || e.pointerId !== start.id) return;
    if (!dragging) {
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < THRESHOLD) return;
      dragging = true;
      el.setPointerCapture(e.pointerId);
      showGhost(start.paint.color, e.clientX, e.clientY);
      onStart?.();
    }
    moveGhost(e.clientX, e.clientY);
  });
  const end = (e) => {
    if (!start || e.pointerId !== start.id) return;
    const { paint } = start;
    const was = dragging;
    start = null;
    dragging = false;
    if (!was) return;
    ghost.hidden = true;
    swallowClick = true;
    setTimeout(() => { swallowClick = false; }, 350); // o "click" do toque pode chegar um pouco depois
    if (e.type === 'pointerup') onDrop(e.clientX, e.clientY, paint);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  // O "click" que segue um arrasto não deve selecionar a ferramenta nem a cor.
  el.addEventListener('click', (e) => {
    if (!swallowClick) return;
    swallowClick = false;
    e.stopImmediatePropagation();
    e.preventDefault();
  }, true);
}
