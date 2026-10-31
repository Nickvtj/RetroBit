/**
 * Zoom e deslocamento da tela + gestos de toque.
 *
 * A vista é só uma transformação CSS na moldura (translate + scale): o
 * desenho não muda e getBoundingClientRect() já devolve o retângulo
 * ampliado, por isso as coordenadas do ponteiro continuam certas.
 *
 *  Toque:   pinça = zoom · arrastar com 2 dedos = mover
 *           toque rápido com 2 dedos = desfazer · com 3 dedos = refazer
 *           com caneta (stylus) detetada, 1 dedo move a tela (rejeição da palma)
 *  Rato:    Ctrl/⌘ + roda (ou pinça do trackpad) = zoom · roda = mover
 *           espaço + arrastar ou botão do meio = mover
 *  Teclado: + / − / 0
 */

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const TAP_MS = 260;   // toque mais curto que isto (e quase parado) = gesto de atalho
const TAP_SLOP = 14;  // px de tolerância para continuar a ser "toque"

/**
 * @param {{ zone: HTMLElement, frame: HTMLElement, onChange?: (zoom:number)=>void,
 *           onGestureStart?: ()=>void, onTwoFingerTap?: ()=>void, onThreeFingerTap?: ()=>void }} opts
 */
export function createViewport(opts) {
  const { zone, frame } = opts;
  let zoom = 1;
  let panX = 0;
  let panY = 0;

  function clampPan() {
    if (zoom <= MIN_ZOOM + 1e-3) { panX = 0; panY = 0; return; }
    // Deixa sempre pelo menos ~80px da tela à vista.
    const maxX = (frame.offsetWidth * zoom + zone.clientWidth) / 2 - 80;
    const maxY = (frame.offsetHeight * zoom + zone.clientHeight) / 2 - 80;
    panX = Math.max(-maxX, Math.min(maxX, panX));
    panY = Math.max(-maxY, Math.min(maxY, panY));
  }

  function apply() {
    clampPan();
    frame.style.transform = zoom === 1 && !panX && !panY
      ? ''
      : `translate(${panX}px, ${panY}px) scale(${zoom})`;
    opts.onChange?.(zoom);
  }

  /** Zoom com o ponto (clientX, clientY) fixo no ecrã. */
  function zoomAt(clientX, clientY, factor) {
    const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor));
    if (next === zoom) return;
    const r = frame.getBoundingClientRect();
    // Centro da moldura sem o deslocamento (o scale é feito à volta do centro).
    const cx = r.left + r.width / 2 - panX;
    const cy = r.top + r.height / 2 - panY;
    const k = next / zoom;
    panX = (clientX - cx) - k * (clientX - cx - panX);
    panY = (clientY - cy) - k * (clientY - cy - panY);
    zoom = next;
    apply();
  }

  function zoomCenter(factor) {
    const r = zone.getBoundingClientRect();
    zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor);
  }

  function panBy(dx, dy) {
    if (zoom <= MIN_ZOOM + 1e-3) return;
    panX += dx;
    panY += dy;
    apply();
  }

  function reset() {
    zoom = 1;
    panX = 0;
    panY = 0;
    apply();
  }

  /* ── Gestos ─────────────────────────────────────────────── */
  const touches = new Map(); // pointerId → { x, y }
  let penSeen = false;
  let gesture = null;  // { startAt, maxTouches, moved, last: { cx, cy, dist } }
  let pan = null;      // arrastar com rato / caneta-palma: { id, x, y }
  let spaceDown = false;

  const centroid = () => {
    let x = 0; let y = 0;
    touches.forEach((t) => { x += t.x; y += t.y; });
    return { cx: x / touches.size, cy: y / touches.size };
  };
  const spread = () => {
    const [a, b] = [...touches.values()];
    return b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };

  function startGesture() {
    opts.onGestureStart?.();
    gesture = { startAt: performance.now(), maxTouches: touches.size, moved: 0, last: { ...centroid(), dist: spread() } };
  }

  function onDown(e) {
    if (e.pointerType === 'pen') penSeen = true;

    // Mover com rato: botão do meio, ou espaço + botão principal.
    if (e.pointerType === 'mouse' && (e.button === 1 || (e.button === 0 && spaceDown))) {
      pan = { id: e.pointerId, x: e.clientX, y: e.clientY };
      zone.setPointerCapture(e.pointerId);
      zone.classList.add('is-panning');
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.pointerType !== 'touch') return;

    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size >= 2) {
      // 2º dedo: deixa de ser desenho, passa a ser gesto.
      if (!gesture) startGesture();
      gesture.maxTouches = Math.max(gesture.maxTouches, touches.size);
      gesture.last = { ...centroid(), dist: spread() };
      e.stopPropagation();
    } else if (penSeen) {
      // Com caneta, o dedo nunca desenha: arrasta a tela.
      startGesture();
      e.stopPropagation();
    }
  }

  function onMove(e) {
    if (pan && e.pointerId === pan.id) {
      panBy(e.clientX - pan.x, e.clientY - pan.y);
      pan.x = e.clientX;
      pan.y = e.clientY;
      e.stopPropagation();
      return;
    }
    if (!touches.has(e.pointerId)) return;
    const t = touches.get(e.pointerId);
    t.x = e.clientX;
    t.y = e.clientY;
    if (!gesture) return;
    e.stopPropagation();
    const now = { ...centroid(), dist: spread() };
    const { last } = gesture;
    gesture.moved += Math.hypot(now.cx - last.cx, now.cy - last.cy) + Math.abs(now.dist - last.dist);
    if (touches.size >= 2 && last.dist > 0 && now.dist > 0) zoomAt(now.cx, now.cy, now.dist / last.dist);
    panBy(now.cx - last.cx, now.cy - last.cy);
    gesture.last = now;
  }

  function onUp(e) {
    if (pan && e.pointerId === pan.id) {
      pan = null;
      zone.classList.remove('is-panning');
      e.stopPropagation();
      return;
    }
    if (!touches.delete(e.pointerId)) return;
    if (!gesture) return;
    e.stopPropagation();
    if (touches.size) {
      gesture.last = { ...centroid(), dist: spread() };
      return;
    }
    const quick = performance.now() - gesture.startAt < TAP_MS && gesture.moved < TAP_SLOP;
    if (quick && e.type === 'pointerup') {
      if (gesture.maxTouches === 2) opts.onTwoFingerTap?.();
      else if (gesture.maxTouches >= 3) opts.onThreeFingerTap?.();
    }
    gesture = null;
  }

  // Fase de captura: o gesto decide antes da tela começar um traço.
  zone.addEventListener('pointerdown', onDown, true);
  zone.addEventListener('pointermove', onMove, true);
  zone.addEventListener('pointerup', onUp, true);
  zone.addEventListener('pointercancel', onUp, true);
  zone.addEventListener('auxclick', (e) => e.preventDefault());

  zone.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.003));
    else panBy(-e.deltaX, -e.deltaY);
  }, { passive: false });

  // Safari (iOS/macOS): impede o zoom da página inteira com pinça.
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  function isTyping(e) {
    return e.target.closest?.('input, textarea');
  }
  // Botão focado pelo teclado: o espaço "clica" nele (não rouba para mover a tela).
  function isKeyboardButton(e) {
    return e.target.matches?.('button:focus-visible');
  }
  document.addEventListener('keydown', (e) => {
    if (zone.offsetParent === null || isTyping(e)) return;
    if (e.code === 'Space' && !e.repeat && !isKeyboardButton(e)) {
      spaceDown = true;
      zone.classList.add('is-pan-ready');
      e.preventDefault();
    } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key === '+' || e.key === '=') zoomCenter(1.25);
      else if (e.key === '-' || e.key === '_') zoomCenter(0.8);
      else if (e.key === '0') reset();
    }
  });
  document.addEventListener('keyup', (e) => {
    if (e.code !== 'Space' || !spaceDown) return;
    e.preventDefault(); // não "clica" no botão que ficou focado pelo rato
    spaceDown = false;
    zone.classList.remove('is-pan-ready');
  });

  return {
    get zoom() { return zoom; },
    reset,
    refit: apply, // a moldura mudou de tamanho → volta a limitar o deslocamento
  };
}
