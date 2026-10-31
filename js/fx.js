/**
 * "Charme" da interface: partículas pixel-art que saem das ferramentas,
 * animações delas (pular, chacoalhar, espremer, inclinar), o pavio da
 * dinamite, e os sons de abrir/fechar janelas e de clique nos botões.
 *
 * As partículas são quadradinhos num canvas por cima de tudo (sem eventos).
 * Respeita "reduzir movimento" do sistema: sem partículas nem animações.
 */
import { playOpen, playClose, playClick, playHover, playFuse } from './audio.js';

const PX = 3; // tamanho de um "pixel" das partículas (a escala dos sprites)
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let canvas = null;
let ctx = null;
let parts = [];
let running = false;

function ensureCanvas() {
  if (canvas) return;
  canvas = document.createElement('canvas');
  canvas.className = 'fx-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  ctx = canvas.getContext('2d');
  const size = () => {
    canvas.width = innerWidth;
    canvas.height = innerHeight;
  };
  size();
  window.addEventListener('resize', size);
}

function loop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  parts = parts.filter((p) => p.life > 0);
  for (const p of parts) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += p.g;
    p.vx *= p.drag;
    p.vy *= p.drag;
    p.life -= 1;
    ctx.globalAlpha = p.fade ? Math.min(1, p.life / 12) : 1;
    ctx.fillStyle = p.c;
    // Encaixa na grelha de 3px: as partículas mexem-se aos saltos, como pixel-art.
    ctx.fillRect(Math.round(p.x / PX) * PX, Math.round(p.y / PX) * PX, p.s, p.s);
  }
  ctx.globalAlpha = 1;
  if (parts.length) requestAnimationFrame(loop);
  else running = false;
}

/** Junta partículas: { x, y, vx, vy, g (gravidade), life (frames), c (cor), s, drag, fade }. */
export function emit(list) {
  if (reduced()) return;
  ensureCanvas();
  parts.push(...list.map((p) => ({ g: 0.25, drag: 0.98, s: PX, fade: true, life: 30, ...p })));
  if (!running) {
    running = true;
    requestAnimationFrame(loop);
  }
}

const rand = (a, b) => a + Math.random() * (b - a);

/* ── Ferramentas ────────────────────────────────────────── */

/**
 * Ponto do sprite (u ao longo, v através, de 0 a 1) em px de ecrã. Na barra
 * lateral a ponta fica à esquerda; na bandeja (retrato) as ferramentas estão
 * de pé e a ponta fica em cima. Devolve também a direção "para fora da ponta".
 */
export function spritePoint(el, u, v) {
  const r = el.getBoundingClientRect();
  if (r.height > r.width) {
    return { x: r.left + (1 - v) * r.width, y: r.top + u * r.height, dx: 0, dy: -1 };
  }
  return { x: r.left + u * r.width, y: r.top + v * r.height, dx: -1, dy: 0 };
}

/** Classe de animação CSS que se remove sozinha no fim. */
function animate(el, cls) {
  if (reduced()) return;
  el.classList.remove(cls);
  void el.offsetWidth; // reinicia a animação se já estava a correr
  el.classList.add(cls);
  el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
}

/** Partículas a sair da ponta `tip`, em leque à volta da direção "para fora". */
function burst(tip, n, { colors, speed = [1, 3], spread = 0.9, g = 0.25, life = [18, 32], s = PX, drag = 0.97 }) {
  const base = Math.atan2(tip.dy, tip.dx);
  emit(Array.from({ length: n }, () => {
    const a = base + rand(-spread, spread);
    const sp = rand(...speed);
    return {
      x: tip.x, y: tip.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g,
      life: Math.round(rand(...life)), c: colors[Math.floor(Math.random() * colors.length)], s, drag,
    };
  }));
}

/** Cada ferramenta tem a sua "reação" ao ser escolhida. */
const TOOL_FX = {
  pen: (el, c) => { animate(el, 'fx-bounce'); burst(spritePoint(el, 0.02, 0.5), 4, { colors: [c], speed: [0.5, 1.2], spread: 0.4, g: 0.35, life: [24, 34] }); },
  fineliner: (el) => { animate(el, 'fx-bounce'); burst(spritePoint(el, 0.03, 0.5), 8, { colors: ['#fff', '#0bd3d3', '#ffd23f'], speed: [1.5, 3], spread: Math.PI, g: 0, life: [10, 16], drag: 0.88 }); },
  pencil: (el) => { animate(el, 'fx-wiggle'); burst(spritePoint(el, 0.05, 0.5), 7, { colors: ['#ecba7c', '#be8448', '#16161a'], speed: [0.8, 2], spread: 1.2, g: 0.3, life: [22, 34] }); },
  brush: (el, c) => { animate(el, 'fx-bounce'); burst(spritePoint(el, 0.03, 0.5), 12, { colors: [c], speed: [1.5, 3.5], spread: 1, g: 0.3, life: [18, 30] }); },
  marker: (el, c) => { animate(el, 'fx-squish'); burst(spritePoint(el, 0.03, 0.5), 8, { colors: [c], speed: [0.6, 1.6], spread: Math.PI, g: 0, life: [12, 20], drag: 0.85 }); },
  spray: (el, c) => { animate(el, 'fx-shake'); burst(spritePoint(el, 0.04, 0.5), 18, { colors: [c], speed: [1, 3.2], spread: 0.6, g: -0.02, life: [16, 30], drag: 0.93 }); },
  bucket: (el, c) => { animate(el, 'fx-tilt'); burst(spritePoint(el, 0.04, 0.75), 4, { colors: [c], speed: [0.2, 0.6], spread: 0.3, g: 0.4, life: [26, 36] }); },
  eraser: (el) => { animate(el, 'fx-squish'); burst(spritePoint(el, 0.12, 0.85), 7, { colors: ['#ee8096', '#3a6ece', '#fab2c0'], speed: [0.5, 1.6], spread: 1.4, g: 0.35, life: [20, 30] }); },
};

/** A ferramenta `key` (botão `el`) foi escolhida. */
export function toolFx(el, key, color) {
  TOOL_FX[key]?.(el, color);
}

/* ── Dinamite ───────────────────────────────────────────── */

// Rastilho no sprite 72×26 (da faísca para a dinamite), em pixels do sprite.
const FUSE = [[3, 4], [5, 5], [6, 5], [7, 6], [8, 7], [9, 8], [10, 9], [11, 10], [11, 11], [10, 12], [9, 12],
  [8, 13], [8, 14], [9, 15], [10, 16], [11, 16], [12, 15], [13, 14], [14, 14]];
const SPARK = ['#fff096', '#ffc428', '#ff7a1e'];
const fusePoint = (el, [x, y]) => spritePoint(el, x / 72, y / 26);

function sparkAt(p, n = 3) {
  emit(Array.from({ length: n }, () => ({
    x: p.x, y: p.y, vx: rand(-1.6, 1.6), vy: rand(-2.2, 0.4), g: 0.12, life: Math.round(rand(6, 12)),
    c: SPARK[Math.floor(Math.random() * SPARK.length)], drag: 0.9,
  })));
}

let hoverTimer = 0;
/** Faíscas a saltar da ponta do rastilho enquanto o rato está por cima. */
export function bindDynamite(el) {
  el.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse' || reduced()) return;
    clearInterval(hoverTimer);
    hoverTimer = setInterval(() => sparkAt(fusePoint(el, FUSE[0]), 2), 70);
  });
  el.addEventListener('pointerleave', () => clearInterval(hoverTimer));
}

/** A faísca percorre o rastilho até à dinamite. Resolve quando chega (e aí explode). */
export function igniteDynamite(el) {
  clearInterval(hoverTimer);
  const DURATION = 480;
  playFuse(DURATION / 1000);
  animate(el, 'fx-rattle');
  if (reduced()) return new Promise((r) => setTimeout(r, 150));
  return new Promise((resolve) => {
    const start = performance.now();
    const step = (now) => {
      // O tempo do quadro pode ser um pouco anterior a `start`: t nunca fica negativo.
      const t = Math.max(0, Math.min(1, (now - start) / DURATION));
      sparkAt(fusePoint(el, FUSE[Math.min(FUSE.length - 1, Math.floor(t * FUSE.length))]), 4);
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

/* ── Sons de janelas e botões ───────────────────────────── */

// Botões com som próprio (ferramentas, formas, luva, grade…) ficam de fora do "clique" genérico.
const CLICKABLE = '.paper-btn, .ui-btn, .proj-action, .res-opt, .icon-btn, .stepper__btn, .back-btn, '
  + '.mirror-btn:not([data-shape]):not(#btn-select):not(#btn-grid), .layers-panel__add, .layer-row__eye, '
  + '.layer-row__menu, .tile__menu, .sel-mode, .sel-actions button, .quick__size, .quick__op, .quick__tool, .win__close';

export function initFx() {
  // Abrir/fechar janelas e o menu rápido: observa o atributo `hidden`.
  const watched = document.querySelectorAll('.modal-backdrop, .quick');
  const obs = new MutationObserver((records) => {
    for (const r of records) {
      const shown = !r.target.hidden;
      if (shown === (r.oldValue === null)) continue; // nada mudou de facto
      (shown ? playOpen : playClose)();
      break;
    }
  });
  watched.forEach((el) => obs.observe(el, { attributes: true, attributeFilter: ['hidden'], attributeOldValue: true }));

  // Clique genérico: no "carregar", como nos botões das consolas.
  document.addEventListener('pointerdown', (e) => {
    if (e.button === 0 && e.target.closest?.(CLICKABLE)) playClick();
  }, true);

  // Passar o rato pelas ferramentas.
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const tool = e.target.closest?.('.wp-tool');
    if (tool && !tool.contains(e.relatedTarget)) playHover();
  });
}

/** O estado do app pode pedir o cursor de espera (ex.: a gerar o GIF). */
export function setBusy(on) {
  document.body.classList.toggle('is-busy', on);
}
