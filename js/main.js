import { state, snapshotPaths, TOOL_DEFS, RESOLUTIONS, initLayers, layersFromProject, ensureLayers, getActiveLayer, BRUSH_SIZES } from './state.js';
import { CanvasEngine } from './engine.js';
import { Renderer, JITTER_CYCLE } from './renderer.js';
import { History } from './history.js';
import { createToolHandlers, cellBrush } from './tools.js';
import { createUI } from './ui.js';
import { createLayersPanel } from './layers.js';
import { initTheme } from './theme.js';
import { playBoom, playFill, playSwitch, playUndo, playRedo, playExport } from './audio.js';
import { igniteDynamite, setBusy } from './fx.js';
import { t, translatePage } from './i18n.js';
import { VERSION } from './version.js';
import { startTour, tourSeen } from './tour.js';
import { encodeGIF } from './gif.js';
import {
  loadProjects, getProject, saveProject, makeProjectId, nextProjectName,
  getDraft, saveDraft, clearDraft,
} from './projects.js';
import { mirrorFlips, mapX, mapY } from './mirror.js';
import { createViewport } from './viewport.js';
import { fillRegion, subtractMask, remapMask } from './fill.js';
import { hitTest } from './hit.js';
import { createSelectTool } from './select.js';
import { createReference } from './reference.js';

const engine = new CanvasEngine({
  mainCanvas: document.getElementById('main-canvas'),
  overlayCanvas: document.getElementById('overlay-canvas'),
});

const renderer = new Renderer(engine);
let dirty = false; // há alterações desde o último "Salvar"?
let draftTimer = 0;
const DRAFT_DELAY = 1200; // ms de calma antes de gravar o rascunho
const history = new History(80, markDirty);
let tools = null;
let ui = null;
let layersPanel = null;
let viewport = null;
let select = null;
let reference = null;

const frameEl = document.getElementById('canvas-frame');
const cursorEl = document.getElementById('canvas-cursor');
let cursorPending = null;
let cursorRaf = 0;
let lastThumbAt = 0; // throttle da miniatura ao vivo da camada

const THUMB_INTERVAL = 100; // ms entre atualizações da miniatura durante o traço

/** Dimensiona a moldura para caber na zona, preservando a proporção da resolução. */
function fitFrame() {
  const stack = frameEl.parentElement;
  const zone = stack?.parentElement;
  if (!zone || zone.clientWidth === 0) return;
  const mirrorBar = stack.querySelector('.mirror-bar');
  const cs = getComputedStyle(zone);
  const ss = getComputedStyle(stack);
  const mirrorExtra = mirrorBar ? mirrorBar.offsetHeight + (parseFloat(ss.rowGap) || 0) : 0;
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)
    + parseFloat(ss.paddingLeft) + parseFloat(ss.paddingRight);
  const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
    + parseFloat(ss.paddingTop) + parseFloat(ss.paddingBottom) + mirrorExtra;
  const availW = zone.clientWidth - padX;
  const availH = zone.clientHeight - padY;
  const ar = state.canvasWidth / state.canvasHeight;
  // Tamanho de exibição máximo → a tela não fica gigante e sobra espaço para
  // as ferramentas deslizarem sem cortar.
  const MAX_W = 760;
  const MAX_H = 560;
  let w = Math.min(availW, MAX_W);
  let h = w / ar;
  if (h > Math.min(availH, MAX_H)) { h = Math.min(availH, MAX_H); w = h * ar; }
  frameEl.style.width = `${Math.floor(w)}px`;
  frameEl.style.height = `${Math.floor(h)}px`;
  viewport?.refit();
  select?.refresh();
  reference?.refresh();
  updateGridOverlay();
}

/** Grade de pixel art por cima da tela, em px de ecrã (linhas finas a qualquer zoom). */
function updateGridOverlay() {
  const el = document.getElementById('grid-overlay');
  const g = state.grid;
  el.hidden = !g;
  if (!g) return;
  const r = engine.mainCanvas.getBoundingClientRect();
  const z = el.parentElement.getBoundingClientRect();
  if (!r.width) return;
  const s = (g * r.width) / state.canvasWidth;
  Object.assign(el.style, {
    left: `${r.left - z.left}px`,
    top: `${r.top - z.top}px`,
    width: `${r.width}px`,
    height: `${r.height}px`,
    backgroundSize: `${s}px ${s}px, ${s}px ${s}px, ${s * 4}px ${s * 4}px, ${s * 4}px ${s * 4}px`,
  });
}

/** (Re)inicializa o canvas com a resolução atual e ajusta a moldura. */
function initCanvas() {
  ensureLayers();
  engine.init(state.canvasWidth, state.canvasHeight);
  fitFrame();
  renderer.invalidate();
}

function applyHistoryEntry(entry) {
  if (!entry) return;
  if (entry.bg) state.bgColor = entry.bg;
  if ('ref' in entry) {
    state.reference = entry.ref;
    reference?.refresh();
  }
  if (entry.layers) {
    state.layers = entry.layers;
    state.activeLayerId = entry.activeLayerId;
    ensureLayers();
    layersPanel?.render();
  } else if (entry.paths) {
    // Entrada antiga (só paths) → uma camada.
    initLayers(entry.paths);
    layersPanel?.render();
  }
  if (entry.w !== state.canvasWidth || entry.h !== state.canvasHeight) {
    state.canvasWidth = entry.w;
    state.canvasHeight = entry.h;
    engine.init(entry.w, entry.h);
    fitFrame();
  }
}

/**
 * Cópia de um traço com as coordenadas transformadas. Nunca altera o original:
 * os traços são partilhados com os snapshots do histórico.
 */
function transformPath(p, fx, fy, extra = {}) {
  const out = { ...p, ...extra };
  if (p.mask) {
    out.mask = transformMask(p.mask, fx, fy);
    return out.mask ? out : null;
  }
  if (p.cells) {
    // Pixel art: leva o centro de cada célula e volta a encaixar na grade.
    const g = p.grid;
    const cells = new Map();
    for (const [cx, cy] of p.cells) {
      const c = [Math.floor(fx((cx + 0.5) * g) / g), Math.floor(fy((cy + 0.5) * g) / g)];
      cells.set(c.join(), c);
    }
    out.cells = [...cells.values()];
    return out;
  }
  if (p.shape) {
    out.x0 = fx(p.x0); out.y0 = fy(p.y0); out.x1 = fx(p.x1); out.y1 = fy(p.y1);
  }
  out.points = (p.points || []).map((pt) => ({ ...pt, x: fx(pt.x), y: fy(pt.y) }));
  out.particles = p.particles ? p.particles.map((q) => ({ x: fx(q.x), y: fy(q.y) })) : null;
  return out;
}

/**
 * Máscara do balde sob uma transformação separável (escala/deslocamento):
 * deslocamento inteiro só muda a posição; o resto é reamostrado.
 */
function transformMask(m, fx, fy) {
  const ax = (fx(m.x + m.w) - fx(m.x)) / m.w;
  const ay = (fy(m.y + m.h) - fy(m.y)) / m.h;
  const nx = fx(m.x);
  const ny = fy(m.y);
  if (ax === 1 && ay === 1 && Number.isInteger(nx) && Number.isInteger(ny)) return { ...m, x: nx, y: ny };
  const box = { x: Math.min(nx, nx + m.w * ax), y: Math.min(ny, ny + m.h * ay), w: Math.abs(m.w * ax), h: Math.abs(m.h * ay) };
  return remapMask(m, (x, y) => [m.x + (x - nx) / ax, m.y + (y - ny) / ay], box);
}

/** Escala todos os traços de todas as camadas. */
function scaleAllPaths(sx, sy) {
  const ref = state.reference;
  if (ref) state.reference = { ...ref, x: ref.x * sx, y: ref.y * sy, w: ref.w * sx, h: ref.h * sy };
  for (const layer of state.layers) {
    layer.paths = layer.paths.map((p) => transformPath(p, (x) => x * sx, (y) => y * sy)).filter(Boolean);
  }
}

/**
 * Converte um traço espelhado em cópias "reais" (sem espelho) — necessário antes
 * de recortar, porque o espelho é sempre calculado a partir do centro da tela.
 */
function expandMirror(p, W, H) {
  if (!p.mirrorH && !p.mirrorV) return [p];
  return mirrorFlips(p.mirrorH, p.mirrorV).map(({ flipX, flipY }) => transformPath(
    p, (x) => mapX(x, W, flipX), (y) => mapY(y, H, flipY), { mirrorH: false, mirrorV: false },
  ));
}

/** Recorta a tela para `rect`: desloca os traços e muda a resolução. */
function applyCrop(rect) {
  history.record(snapshotPaths());
  const W = state.canvasWidth;
  const H = state.canvasHeight;
  const ref = state.reference;
  if (ref) state.reference = { ...ref, x: ref.x - rect.x, y: ref.y - rect.y };
  for (const layer of state.layers) {
    layer.paths = layer.paths
      .flatMap((p) => expandMirror(p, W, H))
      .map((p) => transformPath(p, (x) => x - rect.x, (y) => y - rect.y))
      .filter(Boolean);
  }
  state.canvasWidth = rect.w;
  state.canvasHeight = rect.h;
  viewport.reset();
  tools.cancelCropMode();
  ui.setCropHint(false);
  engine.init(rect.w, rect.h);
  fitFrame();
  layersPanel?.render();
  renderer.invalidate();
}

/** Cópia das camadas com coordenadas arredondadas (0.1px) → ocupa menos no localStorage. */
function compactLayers(layers) {
  const r = (v) => Math.round(v * 10) / 10;
  return layers.map((l) => ({
    ...l,
    paths: l.paths.map((p) => {
      const out = { ...p };
      if (p.shape) { out.x0 = r(p.x0); out.y0 = r(p.y0); out.x1 = r(p.x1); out.y1 = r(p.y1); }
      out.points = (p.points || []).map((pt) => ({ x: r(pt.x), y: r(pt.y), p: r(pt.p ?? 0.5) }));
      if (p.particles) out.particles = p.particles.map((q) => ({ x: r(q.x), y: r(q.y) }));
      return out;
    }),
  }));
}

/** O desenho aberto, no formato em que é guardado (projeto ou rascunho). */
function documentFields() {
  return {
    w: state.canvasWidth,
    h: state.canvasHeight,
    bgColor: state.bgColor,
    grid: state.grid,
    reference: state.reference,
    layers: compactLayers(state.layers),
    activeLayerId: state.activeLayerId,
  };
}

/** Abre um desenho guardado (projeto ou rascunho) com o histórico limpo. */
function loadDocument(doc) {
  layersFromProject(doc);
  state.bgColor = doc.bgColor || '#ffffff';
  state.reference = doc.reference || null;
  state.grid = doc.grid || 0;
  state.canvasWidth = doc.w || RESOLUTIONS[0].w;
  state.canvasHeight = doc.h || RESOLUTIONS[0].h;
  history.clear();
  layersPanel?.render();
}

/** Toda a alteração ao documento passa por aqui: marca "não salvo" e agenda o rascunho. */
function markDirty() {
  dirty = true;
  clearTimeout(draftTimer);
  draftTimer = setTimeout(writeDraft, DRAFT_DELAY);
}

function writeDraft() {
  clearTimeout(draftTimer);
  draftTimer = 0;
  if (!dirty) return;
  saveDraft({ ...documentFields(), projectId: state.currentProjectId });
}

/** Alterações salvas ou descartadas → o rascunho deixa de ser preciso. */
function forgetDraft() {
  clearTimeout(draftTimer);
  draftTimer = 0;
  dirty = false;
  clearDraft();
}

/**
 * Corre `fn` com a tela redesenhada como sai na exportação: sem a imagem de
 * referência e, se pedido, sem o fundo (PNG transparente).
 */
function withExportView(fn, { transparent = false } = {}) {
  renderer.hideReference = true;
  renderer.transparentBg = transparent;
  renderer.drawNow();
  try {
    return fn();
  } finally {
    renderer.hideReference = false;
    renderer.transparentBg = false;
    renderer.drawNow();
  }
}

/** Nome do ficheiro a partir do nome do projeto ("Meu Gato!" → "meu-gato"). */
function fileBase() {
  const name = getProject(state.currentProjectId)?.name || t('desenho');
  const slug = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'retrobit';
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.download = filename;
  a.href = url;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ── Ficheiro do projeto (.retrobit): backup e partilha entre aparelhos ── */
const FILE_FORMAT = 'retrobit';

function exportProjectFile() {
  const file = {
    format: FILE_FORMAT,
    version: 1,
    app: VERSION,
    project: {
      name: getProject(state.currentProjectId)?.name || t('desenho'),
      ...documentFields(),
      thumb: withExportView(makeThumb),
    },
  };
  download(new Blob([JSON.stringify(file)], { type: 'application/json' }), `${fileBase()}.retrobit`);
}

/** Texto de um .retrobit → projeto novo na galeria. Resolve false se o ficheiro não servir. */
async function importProjectFile(text) {
  let data;
  try { data = JSON.parse(text); } catch { return false; }
  const p = data?.format === FILE_FORMAT ? data.project : null;
  const valid = p && Number.isFinite(p.w) && Number.isFinite(p.h) && p.w > 0 && p.h > 0
    && Array.isArray(p.layers) && p.layers.every((l) => Array.isArray(l?.paths));
  if (!valid) return false;
  const saved = await saveProject({
    id: makeProjectId(),
    name: String(p.name || nextProjectName()).slice(0, 40),
    w: p.w,
    h: p.h,
    bgColor: typeof p.bgColor === 'string' ? p.bgColor : '#ffffff',
    grid: [0, 8, 16, 32].includes(p.grid) ? p.grid : 0,
    reference: p.reference || null,
    layers: p.layers,
    activeLayerId: p.activeLayerId,
    thumb: typeof p.thumb === 'string' && p.thumb.startsWith('data:image/') ? p.thumb : null,
  });
  return Boolean(saved);
}

/** Miniatura (dataURL) do estado atual do canvas, para a galeria. */
function makeThumb() {
  const tw = 240;
  const th = Math.max(1, Math.round(tw * state.canvasHeight / state.canvasWidth));
  const c = document.createElement('canvas');
  c.width = tw; c.height = th;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = true;
  x.drawImage(engine.mainCanvas, 0, 0, tw, th);
  return c.toDataURL('image/png');
}

function cursorRadius() {
  if (state.activeShapeKey) {
    return Math.max(2.5, BRUSH_SIZES[state.shapeSizes[state.activeShapeKey] ?? 1] / 2);
  }
  const def = TOOL_DEFS[state.tool] || {};
  if (def.spray) return state.brushSize * 2.2;
  return Math.max(2.5, (state.brushSize * (def.widthScale ?? 1)) / 2);
}

function applyCursor() {
  cursorRaf = 0;
  const e = cursorPending;
  if (!e) return;
  if (!cursorEl || state.isCropping) return;
  const canvas = engine.mainCanvas;
  const rect = canvas.getBoundingClientRect();
  // O cursor vive dentro da moldura (já ampliada pelo zoom) → coordenadas locais.
  const w = canvas.offsetWidth;
  const h = canvas.offsetHeight;
  const k = w / rect.width;
  const r = cursorRadius() * (w / state.canvasWidth);
  const x = (e.clientX - rect.left) * k;
  const y = (e.clientY - rect.top) * k;
  // Só some quando o círculo sai por inteiro; a parte de fora é recortada na borda da tela.
  if (x < -r || y < -r || x > w + r || y > h + r) {
    cursorEl.hidden = true;
    return;
  }
  cursorEl.hidden = false;
  const g = state.grid;
  cursorEl.classList.toggle('is-cell', Boolean(g && !state.activeShapeKey));
  if (g && !state.activeShapeKey) {
    // Pixel art: o cursor é o bloco de células que vai ser pintado.
    const u = w / state.canvasWidth; // px de ecrã (local) por unidade da tela
    const n = cellBrush();
    const o = Math.floor((n - 1) / 2);
    const side = n * g * u;
    cursorEl.style.width = `${side}px`;
    cursorEl.style.height = `${side}px`;
    cursorEl.style.transform = `translate3d(${(Math.floor(x / u / g) - o) * g * u}px, ${(Math.floor(y / u / g) - o) * g * u}px, 0)`;
    return;
  }
  cursorEl.style.width = `${r * 2}px`;
  cursorEl.style.height = `${r * 2}px`;
  drawRing(r);
  cursorEl.style.transform = `translate3d(${x - r}px, ${y - r}px, 0)`;
}

/**
 * Círculo do pincel em pixel-art (algoritmo do ponto médio): anel preto com
 * contorno branco, desenhado num canvas pequeno só quando o raio muda.
 */
let ringCanvas = null;
let ringRadius = -1;
function drawRing(r) {
  if (!ringCanvas) {
    ringCanvas = document.createElement('canvas');
    cursorEl.appendChild(ringCanvas);
  }
  const R = Math.round(r);
  if (R === ringRadius) return;
  ringRadius = R;
  const d = R * 2 + 4;
  ringCanvas.width = d;
  ringCanvas.height = d;
  const c = ringCanvas.getContext('2d');
  const mid = d / 2;
  const plot = (rad, color) => {
    c.fillStyle = color;
    let x = rad;
    let y = 0;
    let err = 1 - rad;
    while (x >= y) {
      for (const [px, py] of [[x, y], [y, x], [-y, x], [-x, y], [-x, -y], [-y, -x], [y, -x], [x, -y]]) {
        c.fillRect(Math.floor(mid + px - 0.5), Math.floor(mid + py - 0.5), 1, 1);
      }
      y++;
      if (err < 0) err += 2 * y + 1;
      else { x--; err += 2 * (y - x) + 1; }
    }
  };
  plot(R + 1, '#fff');
  if (R > 2) plot(R - 1, '#fff');
  plot(R, '#000');
}

/** Camada ativa bloqueada → a tela mostra o cadeado em vez do pincel. */
function syncLockCursor() {
  const layer = getActiveLayer();
  engine.mainCanvas.classList.toggle('is-locked', Boolean(layer?.locked));
}

function scheduleCursor(e) {
  cursorPending = e;
  if (!cursorRaf) cursorRaf = requestAnimationFrame(applyCursor);
}

function hideCursor() {
  if (cursorEl) cursorEl.hidden = true;
}

/** Conta-gotas: aplica à ferramenta ativa a cor que está na tela em `pos`. */
function pickColorAt(pos) {
  const x = Math.floor(pos.x);
  const y = Math.floor(pos.y);
  if (x < 0 || y < 0 || x >= state.canvasWidth || y >= state.canvasHeight) return;
  const [r, g, b] = engine.ctx.getImageData(x, y, 1, 1).data;
  ui.setActiveColor(`#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`);
}

/**
 * Exporta um GIF animado com o desenho a "tremer" (um ciclo completo do tremor).
 * Normal: até 460 px de largura (leve para conversas). Grande: tamanho da tela.
 */
function exportGif({ big = false } = {}) {
  const n = JITTER_CYCLE;
  const maxW = big ? Infinity : 460;
  const scale = Math.min(1, maxW / state.canvasWidth);
  const gw = Math.max(1, Math.round(state.canvasWidth * scale));
  const gh = Math.max(1, Math.round(state.canvasHeight * scale));
  const tmp = document.createElement('canvas');
  tmp.width = gw; tmp.height = gh;
  const tctx = tmp.getContext('2d');
  tctx.imageSmoothingEnabled = true;
  const frames = [];
  renderer.hideReference = true;
  for (let k = 0; k < n; k++) {
    renderer.stepFrame();
    tctx.drawImage(engine.mainCanvas, 0, 0, gw, gh);
    frames.push(tctx.getImageData(0, 0, gw, gh).data);
  }
  renderer.hideReference = false;
  renderer.drawNow();
  const bytes = encodeGIF(frames, gw, gh, 8);
  download(new Blob([bytes], { type: 'image/gif' }), `${fileBase()}.gif`);
}

/* ── Balde de tinta ─────────────────────────────────────── */
let fillBusy = false;
let igniting = false; // a dinamite está a arder

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** "Tinta a espalhar": revela a região aos saltos, a partir de onde se clicou. */
function animateFill(region, color, opacity) {
  const { core, dist, maxDist, mask } = region;
  const W = state.canvasWidth;
  const ctx = engine.overlayCtx;
  const img = ctx.createImageData(mask.w, mask.h);
  const [r, g, b] = hexToRgb(color);
  const a = Math.round(255 * opacity);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const steps = reduced || maxDist < 12 ? 1 : 6;
  return new Promise((resolve) => {
    let k = 0;
    const tick = () => {
      k++;
      const limit = (maxDist * k) / steps;
      const d = img.data;
      for (let y = 0; y < mask.h; y++) {
        const row = (mask.y + y) * W + mask.x;
        for (let x = 0; x < mask.w; x++) {
          const i = row + x;
          if (!core[i] || dist[i] > limit) continue;
          const o = (y * mask.w + x) * 4;
          d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = a;
        }
      }
      ctx.putImageData(img, mask.x, mask.y);
      if (k < steps) setTimeout(tick, 40);
      else {
        resolve();
        requestAnimationFrame(() => engine.clearOverlay());
      }
    };
    tick();
  });
}

/**
 * Balde na camada ativa: clicar num traço troca a cor dele; clicar numa área
 * pinta a região (vista em todas as camadas visíveis) até às "paredes".
 */
async function fillAt(pos, color, opacity) {
  const layer = getActiveLayer();
  const W = state.canvasWidth;
  const H = state.canvasHeight;
  if (!layer || fillBusy) return;
  if (pos.x < 0 || pos.y < 0 || pos.x >= W || pos.y >= H) return;
  if (layer.locked) { layersPanel?.flashLocked(); return; }

  const hit = hitTest(layer, pos, { fills: false });
  if (hit) {
    const p = layer.paths[hit.index];
    if (p.color === color) return;
    history.record(snapshotPaths());
    layer.paths[hit.index] = { ...p, color };
    renderer.invalidate();
    layersPanel?.render();
    playSwitch();
    return;
  }

  // Com espelho, pinta também as regiões espelhadas.
  const seeds = mirrorFlips(state.mirrorH, state.mirrorV).map(({ flipX, flipY }) => ({
    x: Math.min(W - 1, Math.floor(mapX(pos.x, W, flipX))),
    y: Math.min(H - 1, Math.floor(mapY(pos.y, H, flipY))),
  }));
  const region = fillRegion(renderer.renderStill(), seeds);
  if (!region) return;
  fillBusy = true;
  playFill();
  await animateFill(region, color, opacity);
  fillBusy = false;
  if (!state.layers.includes(layer)) return; // desfez/trocou de projeto durante a animação

  history.record(snapshotPaths());
  layer.visible = true;
  // Troca rápida de cor: os preenchimentos antigos saem da região nova.
  layer.paths = layer.paths.map((p) => {
    if (!p.mask) return p;
    const m = subtractMask(p.mask, region.mask);
    return m === p.mask ? p : m && { ...p, mask: m };
  }).filter(Boolean);
  layer.paths.push({ tool: 'fill', color, opacity, mask: region.mask, points: [], mirrorH: false, mirrorV: false });
  renderer.invalidate();
  layersPanel?.render();
}

/** Liga o ponteiro à tela. Devolve o que o gestor de gestos precisa. */
function bindCanvas() {
  const canvas = engine.mainCanvas;
  let activePointer = null; // só um ponteiro desenha de cada vez (evita 2 dedos)
  let strokeStartAt = 0;
  let holdTimer = 0;        // dedo parado no início do traço = conta-gotas
  let holdOrigin = null;
  let pendingFill = null;   // balde: pinta ao levantar (um 2º dedo pode virar gesto)
  const HOLD_MS = 500;
  const ABORT_MS = 250;     // um traço mais novo que isto é desfeito se virar gesto

  // Só o recorte fica preso aos limites; traços e formas podem sair da tela.
  const posOf = (e) => engine.getCanvasPos(e, state.isCropping);
  const cancelHold = () => { clearTimeout(holdTimer); holdTimer = 0; };
  const release = (id) => { if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id); };

  /** Larga o traço em curso sem o terminar (gesto ou conta-gotas). */
  const dropStroke = (discard) => {
    cancelHold();
    pendingFill = null;
    if (activePointer === null) return;
    if (state.selectMode) {
      select.cancel();
      release(activePointer);
      activePointer = null;
      return;
    }
    if (discard) tools.abort();
    else tools.onPointerCancel();
    release(activePointer);
    activePointer = null;
    hideCursor();
    renderer.invalidate();
    layersPanel?.render();
  };

  const finish = (e, cancelled) => {
    if (e.pointerId !== activePointer) return;
    cancelHold();
    activePointer = null;
    if (state.selectMode) {
      select.onPointerUp(e, posOf(e));
      layersPanel?.render();
      release(e.pointerId);
      return;
    }
    if (pendingFill) {
      const at = pendingFill;
      pendingFill = null;
      release(e.pointerId);
      if (!cancelled) fillAt(at, state.color, state.opacity);
      return;
    }
    if (cancelled) tools.onPointerCancel();
    else tools.onPointerUp(e, posOf(e));
    layersPanel?.render();
    renderer.invalidate();
    release(e.pointerId);
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || activePointer !== null) return; // só botão principal / caneta / dedo
    if (state.refAdjust) return; // a mexer na referência: a tela não desenha
    ui.closeFloating();
    const pos = posOf(e);
    if (state.isPicking || (e.altKey && !state.isCropping)) {
      pickColorAt(pos);
      return;
    }
    activePointer = e.pointerId;
    strokeStartAt = performance.now();
    canvas.setPointerCapture(e.pointerId);
    scheduleCursor(e);
    if (state.selectMode) {
      select.onPointerDown(e, pos);
      return;
    }
    if (state.tool === 'fill' && !state.activeShapeKey && !state.isCropping) pendingFill = pos;
    else tools.onPointerDown(e, pos);
    if (e.pointerType === 'touch' && !state.isCropping) {
      holdOrigin = { x: e.clientX, y: e.clientY };
      holdTimer = setTimeout(() => {
        holdTimer = 0;
        dropStroke(true);
        renderer.drawNow(); // tira a marca do traço antes de ler a cor
        pickColorAt(pos);
      }, HOLD_MS);
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') scheduleCursor(e); // o rato é seguido no documento (abaixo)
    if (activePointer !== null && e.pointerId !== activePointer) return;
    if (state.selectMode) {
      if (activePointer !== null) select.onPointerMove(e, posOf(e));
      return;
    }
    if (holdTimer && Math.hypot(e.clientX - holdOrigin.x, e.clientY - holdOrigin.y) > 8) cancelHold();
    tools.onPointerMove(e, posOf(e));
    if (state.isDrawing && e.timeStamp - lastThumbAt > THUMB_INTERVAL) {
      lastThumbAt = e.timeStamp;
      layersPanel?.refreshThumb(state.activeLayerId);
    }
  });
  canvas.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'mouse') hideCursor(); });

  // Rato: segue-o no documento todo, para o círculo continuar visível enquanto
  // ainda toca a tela (ex.: borracha grande a passar pela borda).
  const appEl = document.getElementById('app');
  document.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || appEl.hidden) return;
    if (e.target.closest?.('.modal-backdrop, .quick')) { hideCursor(); return; }
    scheduleCursor(e);
  });
  document.documentElement.addEventListener('pointerleave', hideCursor); // saiu da janela
  canvas.addEventListener('pointerup', (e) => finish(e, false));
  canvas.addEventListener('pointercancel', (e) => finish(e, true));
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    /** 2º dedo pousou: um traço recém-começado era o início do gesto → desfaz; senão fica. */
    onGestureStart: () => dropStroke(performance.now() - strokeStartAt < ABORT_MS),
  };
}

function undo() {
  const entry = history.undo(snapshotPaths());
  if (entry) playUndo();
  applyHistoryEntry(entry);
  renderer.invalidate();
  select?.refresh();
  syncLockCursor();
}
function redo() {
  const entry = history.redo(snapshotPaths());
  if (entry) playRedo();
  applyHistoryEntry(entry);
  renderer.invalidate();
  select?.refresh();
}

async function boot() {
  translatePage();
  await loadProjects();

  ui = createUI({
    onNewProject: () => {
      initLayers();
      state.currentProjectId = null;
      state.bgColor = '#ffffff';
      state.reference = null;
      state.grid = 0;
      state.canvasWidth = RESOLUTIONS[0].w;
      state.canvasHeight = RESOLUTIONS[0].h;
      history.clear();
      dirty = false;
      layersPanel?.render();
    },

    onOpenProject: (id) => {
      const p = getProject(id);
      if (!p) return;
      loadDocument(p);
      state.currentProjectId = id;
      dirty = false;
    },

    /** Reabre o rascunho automático (a aba fechou sem salvar). Continua "não salvo". */
    onRecoverDraft: () => {
      const d = getDraft();
      if (!d) return;
      loadDocument(d);
      state.currentProjectId = d.projectId && getProject(d.projectId) ? d.projectId : null;
      dirty = true;
    },

    onDiscardChanges: forgetDraft,

    onAppReady: () => {
      select.clear();
      syncLockCursor();
      reference.setAdjust(false);
      // Cada desenho começa com o espelho desligado (não herda o do anterior).
      state.mirrorH = false;
      state.mirrorV = false;
      ui.syncMirrors();
      ui.syncGrid();
      tools.cancelCropMode();
      ui.setCropHint(false);
      viewport.reset();
      initCanvas();
      layersPanel?.render();
      // Primeira vez na tela de desenho: tutorial (depois da transição íris).
      if (!tourSeen()) setTimeout(startTour, 450);
    },

    /** Resolve true se salvou (false = disco cheio/indisponível). */
    onSave: async () => {
      const id = state.currentProjectId || makeProjectId();
      const existing = getProject(id);
      const saved = await saveProject({
        id,
        name: existing ? existing.name : nextProjectName(),
        ...documentFields(),
        thumb: withExportView(makeThumb),
      });
      if (!saved) return false;
      state.currentProjectId = id;
      forgetDraft();
      return true;
    },

    isDirty: () => dirty,

    onBgChange: (hex) => {
      history.record(snapshotPaths());
      state.bgColor = hex;
      renderer.invalidate();
      layersPanel?.render();
    },

    onStartCrop: () => tools.startCropMode(),
    onCancelCrop: () => tools.cancelCropMode(),

    onExportPng: ({ transparent = false } = {}) => {
      playExport();
      withExportView(() => engine.exportPNG(`${fileBase()}.png`), { transparent });
    },
    onExportProject: () => {
      playExport();
      exportProjectFile();
    },
    onImportProject: importProjectFile,
    onOpenReference: () => reference.open(),

    onSetResolution: (res) => {
      history.record(snapshotPaths());
      scaleAllPaths(res.w / state.canvasWidth, res.h / state.canvasHeight);
      state.canvasWidth = res.w;
      state.canvasHeight = res.h;
      viewport.reset();
      engine.init(res.w, res.h);
      fitFrame();
      renderer.invalidate();
    },

    // Exporta um GIF animado com o desenho a "tremer" (um ciclo completo do tremor).
    // Corre no frame seguinte, para o cursor de espera aparecer antes do trabalho pesado.
    onExportGif: (opts) => {
      setBusy(true);
      setTimeout(() => {
        try { exportGif(opts); } finally { setBusy(false); }
        playExport();
      }, 40);
    },

    onUndo: undo,
    onRedo: redo,

    /** Tinta arrastada (balde) solta em (x, y) do ecrã: pinta se caiu na tela. */
    onDropFill: (clientX, clientY, color, opacity) => {
      const r = engine.mainCanvas.getBoundingClientRect();
      if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return;
      fillAt(engine.getCanvasPos({ clientX, clientY }, false), color, opacity);
    },

    // A dinamite: o pavio arde até ao fim e só então a camada explode.
    onClear: async () => {
      const layer = getActiveLayer();
      if (!layer || igniting) return;
      if (layer.locked) { layersPanel?.flashLocked(); return; }
      igniting = true;
      await igniteDynamite(document.getElementById('btn-clear'));
      igniting = false;
      if (!state.layers.includes(layer)) return;
      history.record(snapshotPaths());
      const app = document.getElementById('app');
      app.classList.add('rb-shake');
      setTimeout(() => app.classList.remove('rb-shake'), 520);
      playBoom();
      engine.runExplosion(state.canvasWidth / 2, state.canvasHeight / 2);
      layer.paths = [];
      layersPanel?.render();
      renderer.invalidate();
    },

    onColorChange: () => renderer.invalidate(),
    onGridChange: () => {
      updateGridOverlay();
      markDirty();
    },
    onSelectMode: (on) => {
      select.setActive(on);
      hideCursor();
    },
    onShapeChange: () => renderer.invalidate(),
  });

  tools = createToolHandlers(engine, history, renderer, {
    onLocked: () => layersPanel?.flashLocked(),
    onCrop: applyCrop,
  });

  select = createSelectTool({
    engine,
    history,
    renderer,
    zone: document.getElementById('canvas-zone'),
    onEdit: () => layersPanel?.render(),
    onLocked: () => layersPanel?.flashLocked(),
  });

  reference = createReference({
    engine,
    history,
    zone: document.getElementById('canvas-zone'),
    onChange: () => renderer.invalidate(),
    toast: (t) => ui.toast(t),
  });

  layersPanel = createLayersPanel({
    onChange: () => { renderer.invalidate(); select.refresh(); syncLockCursor(); },
    onHistory: () => history.record(snapshotPaths()),
    getLayerCanvas: (layer) => renderer.layerCanvas(layer),
  });

  initTheme();
  ui.init();
  initLayers();
  layersPanel.init();

  const canvasInput = bindCanvas();
  const zoomVal = document.getElementById('zoom-val');
  viewport = createViewport({
    zone: document.getElementById('canvas-zone'),
    frame: frameEl,
    onChange: (zoom) => {
      zoomVal.textContent = `${Math.round(zoom * 100)}%`;
      select.refresh();
      reference.refresh();
      updateGridOverlay();
    },
    onGestureStart: canvasInput.onGestureStart,
    onTwoFingerTap: undo,
    onThreeFingerTap: redo,
  });
  document.getElementById('btn-zoom').addEventListener('click', () => viewport.reset());

  engine.init(state.canvasWidth, state.canvasHeight);
  fitFrame();
  renderer.start();

  window.addEventListener('resize', fitFrame);

  // Aba a esconder/fechar (no telemóvel o sistema pode matá-la) → grava já o rascunho.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && draftTimer) writeDraft();
  });
  // Fechar/recarregar com alterações por salvar → o navegador pergunta antes.
  window.addEventListener('beforeunload', (e) => {
    if (!dirty) return;
    if (draftTimer) writeDraft();
    e.preventDefault();
    e.returnValue = '';
  });

  // Instalação (PWA) e funcionamento offline.
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('RetroBit: service worker', err));
  }
}

boot();
