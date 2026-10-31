import { state, TOOL_DEFS, getActiveLayer } from './state.js';
import { densify, wob } from './wiggle.js';
import { mirrorFlips, mapX, mapY } from './mirror.js';
import { shapeOutline } from './shapes.js';
import { maskCanvas } from './fill.js';
import { referenceImage } from './reference.js';
import { pathBounds } from './hit.js';

/**
 * Quantos quadros distintos o tremor tem. O ciclo repete-se, como as linhas
 * "a ferver" da animação clássica — e cada quadro de cada camada só é
 * desenhado uma vez: com a tela parada, o loop só copia imagens prontas.
 */
export const JITTER_CYCLE = 3;

/** Canvas do tamanho da tela (cria ou redimensiona). */
function sizedCanvas(canvas) {
  const c = canvas || document.createElement('canvas');
  if (c.width !== state.canvasWidth || c.height !== state.canvasHeight) {
    c.width = state.canvasWidth;
    c.height = state.canvasHeight;
  }
  return c;
}

/** Mesmos traços, pela mesma ordem? (Comparação por referência: os traços nunca mudam depois de prontos.) */
function samePaths(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** A cache de um grupo continua válida se as camadas, a opacidade e os traços forem os mesmos. */
function sameGroup(sig, layers) {
  if (!sig || sig.length !== layers.length) return false;
  for (let i = 0; i < layers.length; i++) {
    const s = sig[i];
    const l = layers[i];
    if (s.id !== l.id || s.opacity !== l.opacity || !samePaths(s.paths, l.paths)) return false;
  }
  return true;
}

const groupSig = (layers) => layers.map((l) => ({ id: l.id, opacity: l.opacity, paths: l.paths.slice() }));

// Teto de memória das imagens por camada (em píxeis; ~4 bytes cada): acima disto,
// as menos usadas são esquecidas e refeitas quando voltarem a ser precisas.
const LAYER_CACHE_BUDGET = 24e6;

/**
 * Loop de render — tremor ~12fps; traço ativo repintado em fast-path (~60fps).
 *
 * Duas caches, por fase do tremor, que se validam sozinhas comparando os
 * traços por referência (os traços nunca mudam depois de prontos):
 *  - por CAMADA, recortada à área onde há desenho (pouca memória para
 *    camadas pequenas) — só a camada mexida é redesenhada;
 *  - por GRUPO: as camadas abaixo da ativa e as acima, já juntas. Trocar de
 *    camada só volta a juntar imagens prontas; com a tela parada, cada
 *    quadro são 3 cópias de imagem.
 */
export class Renderer {
  constructor(engine) {
    this.engine = engine;
    this.jitterInterval = 85;
    this.lastJitter = 0;
    this.jitterFrame = 0;
    this.running = false;
    this.needsDraw = true;
    this._groups = { below: [], above: [] }; // fase → { canvas, sig }
    this._layerImgs = new Map();   // layer.id → [fase] { canvas, x, y, paths, cw, ch, used }
    this._thumbs = new Map();      // layer.id → { canvas, paths, cw, ch }
    this._liveStatic = [];         // fase → camada ativa sem o traço em curso
    this._liveStaticOk = [];
    this._activeLive = null;
    this._liveLayerId = null; // camada cujo conteúdo está em _activeLive neste traço
    this._still = false;      // true → desenha sem tremor (imagem "parada" para o balde)
    this.hideReference = false; // true durante exportações e miniaturas
    this.transparentBg = false; // true ao exportar PNG sem fundo
  }

  /** Fase atual do ciclo de tremor (0..JITTER_CYCLE-1). */
  get phase() {
    return this.jitterFrame % JITTER_CYCLE;
  }

  start() {
    if (this.running) return;
    this.running = true;
    requestAnimationFrame((t) => this._loop(t));
  }

  stop() {
    this.running = false;
  }

  /** Pede um redesenho. As caches verificam sozinhas se ainda servem. */
  invalidate() {
    this.needsDraw = true;
    this._liveStaticOk = [];
  }

  beginLiveStroke() {
    this._liveStaticOk = [];
  }

  endLiveStroke() {
    this._liveStaticOk = [];
    this._liveLayerId = null;
  }

  _paintLayer(canvas, layer, excludePath = null) {
    const cc = canvas.getContext('2d');
    cc.clearRect(0, 0, canvas.width, canvas.height);
    for (const path of layer.paths) {
      if (path === excludePath) continue;
      this._drawPath(cc, path);
    }
    return canvas;
  }

  /** Área (em unidades da tela) onde a camada tem desenho, com folga para o tremor e a espessura. */
  _layerBounds(layer) {
    const W = state.canvasWidth;
    const H = state.canvasHeight;
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    for (const p of layer.paths) {
      const b = pathBounds(p);
      if (!b) continue;
      const pad = (p.size || 2) * 1.5 + (TOOL_DEFS[p.tool]?.amp || 0) * 2 + 4;
      for (const { flipX, flipY } of mirrorFlips(p.mirrorH, p.mirrorV)) {
        const xs = [mapX(b.x, W, flipX), mapX(b.x + b.w, W, flipX)];
        const ys = [mapY(b.y, H, flipY), mapY(b.y + b.h, H, flipY)];
        x0 = Math.min(x0, xs[0] - pad, xs[1] - pad); x1 = Math.max(x1, xs[0] + pad, xs[1] + pad);
        y0 = Math.min(y0, ys[0] - pad, ys[1] - pad); y1 = Math.max(y1, ys[0] + pad, ys[1] + pad);
      }
    }
    x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
    x1 = Math.min(W, Math.ceil(x1)); y1 = Math.min(H, Math.ceil(y1));
    return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  }

  /**
   * Imagem da camada na fase atual, recortada ao desenho ({ canvas, x, y }), ou null se vazia.
   * Uma camada com o traço em curso nunca fica em cache: esse traço ainda cresce
   * (é o mesmo objeto), e a cache ficaria com ele pela metade.
   */
  _layerImg(layer) {
    const ph = this.phase;
    const W = state.canvasWidth;
    const H = state.canvasHeight;
    const inProgress = state.isDrawing && state.currentPath && layer.paths.includes(state.currentPath);
    let slots = this._layerImgs.get(layer.id);
    if (!slots) this._layerImgs.set(layer.id, (slots = []));
    if (inProgress) slots = this._scratchSlots || (this._scratchSlots = []);
    const slot = inProgress ? null : slots[ph];
    if (slot && slot.cw === W && slot.ch === H && samePaths(slot.paths, layer.paths)) {
      slot.used = performance.now();
      return slot.canvas ? slot : null;
    }
    const b = layer.paths.length ? this._layerBounds(layer) : null;
    let canvas = null;
    if (b) {
      canvas = slot?.canvas || document.createElement('canvas');
      canvas.width = b.w;
      canvas.height = b.h;
      const cc = canvas.getContext('2d');
      cc.setTransform(1, 0, 0, 1, -b.x, -b.y);
      for (const path of layer.paths) this._drawPath(cc, path);
      cc.setTransform(1, 0, 0, 1, 0, 0);
    }
    slots[ph] = { canvas, x: b?.x || 0, y: b?.y || 0, paths: layer.paths.slice(), cw: W, ch: H, used: performance.now() };
    if (!inProgress) this._trimLayerImgs();
    return canvas ? slots[ph] : null;
  }

  /** Respeita o teto de memória: esquece as imagens de camada usadas há mais tempo. */
  _trimLayerImgs() {
    const all = [];
    let total = 0;
    const alive = new Set(state.layers.map((l) => l.id));
    for (const [id, slots] of this._layerImgs) {
      if (!alive.has(id)) { this._layerImgs.delete(id); continue; }
      slots.forEach((sl, ph) => {
        if (!sl?.canvas) return;
        total += sl.canvas.width * sl.canvas.height;
        all.push({ slots, ph, sl });
      });
    }
    if (total <= LAYER_CACHE_BUDGET) return;
    all.sort((a, b) => a.sl.used - b.sl.used);
    for (const { slots, ph, sl } of all) {
      if (total <= LAYER_CACHE_BUDGET * 0.8) break;
      total -= sl.canvas.width * sl.canvas.height;
      slots[ph] = null;
    }
  }

  /** Várias camadas juntas (cada uma com a sua opacidade), na fase atual — refeito só se mudaram. */
  _group(name, layers) {
    const ph = this.phase;
    const slot = this._groups[name][ph];
    if (slot && slot.canvas.width === state.canvasWidth && slot.canvas.height === state.canvasHeight
      && sameGroup(slot.sig, layers)) {
      return slot.canvas;
    }
    const canvas = sizedCanvas(slot?.canvas);
    const cc = canvas.getContext('2d');
    cc.clearRect(0, 0, canvas.width, canvas.height);
    for (const l of layers) {
      const img = this._layerImg(l);
      if (!img) continue;
      cc.globalAlpha = l.opacity;
      cc.drawImage(img.canvas, img.x, img.y);
    }
    cc.globalAlpha = 1;
    this._groups[name][ph] = { canvas, sig: groupSig(layers) };
    return canvas;
  }

  /**
   * Miniatura da camada (w×h) para o painel — refeita só quando a camada muda.
   * Durante o traço devolve a composição ao vivo (o painel reduz).
   */
  layerThumb(layer, w, h) {
    if (state.isDrawing && this._liveLayerId === layer.id && this._activeLive) return this._activeLive;
    // Traço a começar (antes do primeiro quadro ao vivo): sem miniatura por agora.
    if (state.isDrawing && state.currentPath && layer.paths.includes(state.currentPath)) return null;
    const W = state.canvasWidth;
    const H = state.canvasHeight;
    const e = this._thumbs.get(layer.id);
    if (e && e.canvas.width === w && e.canvas.height === h && e.cw === W && e.ch === H && samePaths(e.paths, layer.paths)) {
      return e.canvas;
    }
    const c = e?.canvas || document.createElement('canvas');
    c.width = w;
    c.height = h;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = true;
    const img = this._layerImg(layer); // reaproveita a imagem da camada (com tremor, não se nota a este tamanho)
    if (img) x.drawImage(img.canvas, (img.x * w) / W, (img.y * h) / H, (img.canvas.width * w) / W, (img.canvas.height * h) / H);
    this._thumbs.set(layer.id, { canvas: c, paths: layer.paths.slice(), cw: W, ch: H });
    if (this._thumbs.size > state.layers.length + 8) {
      const alive = new Set(state.layers.map((l) => l.id));
      for (const id of this._thumbs.keys()) if (!alive.has(id)) this._thumbs.delete(id);
    }
    return c;
  }

  /**
   * Camada ativa durante o traço: o resto da camada (em cache por fase) + o
   * traço vivo, compostos à parte — a borracha (destination-out) e o marcador
   * (multiply) só afetam a própria camada, igual ao resultado final.
   */
  _liveLayer(layer) {
    const ph = this.phase;
    if (!this._liveStaticOk[ph]) {
      this._liveStatic[ph] = this._paintLayer(sizedCanvas(this._liveStatic[ph]), layer, state.currentPath);
      this._liveStaticOk[ph] = true;
    }
    const live = this._activeLive = sizedCanvas(this._activeLive);
    const lc = live.getContext('2d');
    lc.clearRect(0, 0, live.width, live.height);
    lc.drawImage(this._liveStatic[ph], 0, 0);
    this._drawPath(lc, state.currentPath);
    this._liveLayerId = layer.id;
    return live;
  }

  _loop(t) {
    if (!this.running) return;
    requestAnimationFrame((x) => this._loop(x));

    if (t - this.lastJitter >= this.jitterInterval) {
      this.jitterFrame++;
      this.lastJitter = t;
      this.needsDraw = true;
    }

    if (state.isDrawing || this.needsDraw) {
      this._draw();
      this.needsDraw = false;
    }
  }

  _draw() {
    const ctx = this.engine.ctx;
    const { layers } = state;
    const active = getActiveLayer();
    const ai = active ? layers.indexOf(active) : layers.length;
    const live = state.isDrawing && state.currentPath && !state.isShapeDrawing;
    const below = layers.slice(0, ai).filter((l) => l.visible);
    const above = layers.slice(ai + 1).filter((l) => l.visible);

    this.engine.fillBackground(this.transparentBg);
    this._drawReference(ctx, false);
    if (below.length) ctx.drawImage(this._group('below', below), 0, 0);
    if (active?.visible) {
      ctx.save();
      ctx.globalAlpha = active.opacity;
      if (live) {
        ctx.drawImage(this._liveLayer(active), 0, 0);
      } else {
        const img = this._layerImg(active);
        if (img) ctx.drawImage(img.canvas, img.x, img.y);
      }
      ctx.restore();
    }
    if (above.length) ctx.drawImage(this._group('above', above), 0, 0);
    this._drawReference(ctx, true);
  }

  /** Imagem de referência por baixo (above=false) ou por cima (above=true) das camadas. */
  _drawReference(ctx, above) {
    const ref = state.reference;
    if (!ref || !ref.visible || Boolean(ref.above) !== above || this.hideReference) return;
    const img = referenceImage(ref, () => { this.needsDraw = true; });
    if (!img) return;
    ctx.save();
    ctx.globalAlpha = ref.opacity;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, ref.x, ref.y, ref.w, ref.h);
    ctx.restore();
  }

  /** Redesenha já, sem esperar o próximo frame (ex.: antes de ler um pixel da tela). */
  drawNow() {
    this._draw();
    this.needsDraw = false;
  }

  /**
   * O desenho visível SEM tremor (fundo + camadas), como ImageData — é sobre
   * esta imagem que o balde procura a região, para não depender da fase.
   */
  renderStill() {
    const W = state.canvasWidth;
    const H = state.canvasHeight;
    const out = document.createElement('canvas');
    out.width = W;
    out.height = H;
    const ctx = out.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = state.bgColor;
    ctx.fillRect(0, 0, W, H);
    const tmp = document.createElement('canvas');
    tmp.width = W;
    tmp.height = H;
    this._still = true;
    try {
      for (const layer of state.layers) {
        if (!layer.visible) continue;
        this._paintLayer(tmp, layer);
        ctx.globalAlpha = layer.opacity;
        ctx.drawImage(tmp, 0, 0);
      }
    } finally {
      this._still = false;
    }
    ctx.globalAlpha = 1;
    return ctx.getImageData(0, 0, W, H);
  }

  /** Amplitude do tremor de um motor (0 na imagem parada). */
  _amp(def) {
    return this._still ? 0 : def.amp;
  }

  /** Avança uma fase e desenha já (usado para capturar os quadros do GIF). */
  stepFrame() {
    this.jitterFrame++;
    this._draw();
  }

  _drawPath(ctx, path) {
    const def = TOOL_DEFS[path.tool] || TOOL_DEFS.pen;
    // A borracha apaga (destination-out) dentro da camada — a cor é irrelevante.
    const color = def.eraser ? '#000000' : path.color;
    const f = this.phase;
    const W = state.canvasWidth;
    const H = state.canvasHeight;

    if (path.mask) {
      this._drawFill(ctx, path);
      return;
    }
    for (const { flipX, flipY } of mirrorFlips(path.mirrorH, path.mirrorV)) {
      if (path.cells) {
        this._drawCells(ctx, path, color, def, f, W, H, flipX, flipY);
      } else if (def.shape || path.shape) {
        this._drawShape(ctx, path, color, def, f, W, H, flipX, flipY);
      } else if (def.spray) {
        this._drawSpray(ctx, path, color, def, f, W, H, flipX, flipY);
      } else {
        this._drawStroke(ctx, path, color, def, f, W, H, flipX, flipY);
      }
    }
  }

  _drawShape(ctx, path, color, def, f, W, H, flipX, flipY) {
    const outline = shapeOutline(path);
    if (outline.length < 2) return;
    const amp = this._amp(def);
    const dense = densify(outline, 3);
    const jp = dense.map((pt) => ({
      x: mapX(pt.x + wob(pt.x, pt.y, f) * amp, W, flipX),
      y: mapY(pt.y + wob(pt.y, pt.x, f + 19.3) * amp, H, flipY),
    }));

    ctx.save();
    const layerAlpha = ctx.globalAlpha;
    ctx.globalAlpha = layerAlpha * def.alpha * (path.opacity ?? 1);
    ctx.globalCompositeOperation = def.composite;
    ctx.strokeStyle = color;
    ctx.lineCap = def.cap;
    ctx.lineJoin = 'round';
    ctx.lineWidth = path.size;
    ctx.beginPath();
    jp.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)));
    ctx.stroke();
    ctx.restore();
  }

  _drawStroke(ctx, path, color, def, f, W, H, flipX, flipY) {
    if (!path.points.length) return;

    const dense = densify(path.points, 3);
    const amp = this._amp(def);
    const jp = dense.map((pt) => ({
      x: mapX(pt.x + wob(pt.x, pt.y, f) * amp, W, flipX),
      y: mapY(pt.y + wob(pt.y, pt.x, f + 19.3) * amp, H, flipY),
      p: pt.p,
    }));

    let composite = def.composite;
    if (def.eraser) composite = 'destination-out';
    else if (def.marker && state.theme === 'dark') composite = 'screen';

    ctx.save();
    const layerAlpha = ctx.globalAlpha;
    ctx.globalAlpha = layerAlpha * def.alpha * (path.opacity ?? 1);
    ctx.globalCompositeOperation = composite;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineCap = def.cap;
    ctx.lineJoin = 'round';

    if (def.pressure) {
      // Espessura por segmento, mas os segmentos seguidos com quase a mesma
      // espessura (≤ 0,5 px) vão num só traçado: com o rato (pressão fixa)
      // o traço inteiro é uma chamada só, em vez de centenas.
      let width = -1;
      for (let i = 1; i < jp.length; i++) {
        const a = jp[i - 1];
        const b = jp[i];
        const w = Math.max(1, path.size * (0.3 + ((a.p + b.p) / 2) * 1.4));
        if (Math.abs(w - width) > 0.5) {
          if (width > 0) ctx.stroke();
          width = w;
          ctx.lineWidth = w;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
        }
        ctx.lineTo(b.x, b.y);
      }
      if (width > 0) ctx.stroke();
    } else {
      ctx.lineWidth = path.size;
      ctx.beginPath();
      jp.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)));
      ctx.stroke();
    }

    if (jp.length === 1) {
      ctx.beginPath();
      ctx.arc(jp[0].x, jp[0].y, Math.max(1, path.size / 2), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawSpray(ctx, path, color, def, f, W, H, flipX, flipY) {
    if (!path.particles || !path.particles.length) return;
    ctx.save();
    const layerAlpha = ctx.globalAlpha;
    ctx.globalAlpha = layerAlpha * def.alpha * (path.opacity ?? 1);
    ctx.fillStyle = color;
    const amp = this._amp(def);
    for (const q of path.particles) {
      const x = mapX((q.x + wob(q.x, q.y, f) * amp) | 0, W, flipX);
      const y = mapY((q.y + wob(q.y, q.x, f + 7.1) * amp) | 0, H, flipY);
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.restore();
  }

  /**
   * Pixel art: cada célula é um quadrilátero com os cantos a tremer. O tremor
   * depende só da posição do canto, por isso células vizinhas partilham os
   * cantos e nunca abrem frestas — a pixel art treme inteira, como um bloco.
   */
  _drawCells(ctx, path, color, def, f, W, H, flipX, flipY) {
    if (!path.cells.length) return;
    const g = path.grid;
    const amp = this._amp(def) * 0.7;
    const corner = (x, y) => [
      mapX(x + wob(x, y, f) * amp, W, flipX),
      mapY(y + wob(y, x, f + 19.3) * amp, H, flipY),
    ];
    ctx.save();
    ctx.globalAlpha *= def.alpha * (path.opacity ?? 1);
    ctx.globalCompositeOperation = def.eraser ? 'destination-out' : def.composite;
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const [cx, cy] of path.cells) {
      const x0 = cx * g;
      const y0 = cy * g;
      const a = corner(x0, y0);
      const b = corner(x0 + g, y0);
      const c = corner(x0 + g, y0 + g);
      const d = corner(x0, y0 + g);
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.lineTo(c[0], c[1]);
      ctx.lineTo(d[0], d[1]);
      ctx.closePath();
    }
    ctx.fill();
    ctx.restore();
  }

  /** Preenchimento do balde: por baixo do que já está na camada, para as linhas tremerem por cima. */
  _drawFill(ctx, path) {
    const m = path.mask;
    ctx.save();
    ctx.globalAlpha *= path.opacity ?? 1;
    ctx.globalCompositeOperation = 'destination-over';
    ctx.drawImage(maskCanvas(m, path.color), m.x, m.y);
    ctx.restore();
  }
}
