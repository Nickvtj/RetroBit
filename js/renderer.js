import { state, TOOL_DEFS, getActiveLayer } from './state.js';
import { densify, wob } from './wiggle.js';
import { mirrorFlips, mapX, mapY } from './mirror.js';
import { shapeOutline } from './shapes.js';
import { maskCanvas } from './fill.js';
import { referenceImage } from './reference.js';

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

/**
 * Loop de render — tremor ~12fps; traço ativo repintado em fast-path (~60fps).
 * Camadas cacheadas por fase do ciclo → não redesenha tudo a cada frame.
 */
export class Renderer {
  constructor(engine) {
    this.engine = engine;
    this.jitterInterval = 85;
    this.lastJitter = 0;
    this.jitterFrame = 0;
    this.running = false;
    this.needsDraw = true;
    this._layerCaches = new Map(); // layer.id → [{ canvas, ok }] por fase
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

  invalidate() {
    this.needsDraw = true;
    this._layerCaches.clear();
    this._liveStaticOk = [];
  }

  beginLiveStroke() {
    this._liveStaticOk = [];
  }

  endLiveStroke() {
    this._liveStaticOk = [];
    this._liveLayerId = null;
    const layer = getActiveLayer();
    if (layer) this._layerCaches.delete(layer.id);
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

  /** Camada na fase atual — só desenha se essa fase ainda não estiver em cache. */
  _cachedLayer(layer) {
    let slots = this._layerCaches.get(layer.id);
    if (!slots) {
      slots = [];
      this._layerCaches.set(layer.id, slots);
    }
    const slot = slots[this.phase];
    if (!slot?.ok) {
      const canvas = this._paintLayer(sizedCanvas(slot?.canvas), layer);
      slots[this.phase] = { canvas, ok: true };
    }
    return slots[this.phase].canvas;
  }

  /**
   * Canvas atualizado da camada — usado nas miniaturas. Durante o traço devolve
   * a composição ao vivo; fora dele redesenha sempre (o cache pode estar velho,
   * ex.: logo após desfazer, antes de o renderer ser invalidado).
   */
  layerCanvas(layer) {
    if (state.isDrawing && this._liveLayerId === layer.id) return this._activeLive;
    const slot = this._layerCaches.get(layer.id)?.[this.phase];
    if (slot) slot.ok = false;
    return this._cachedLayer(layer);
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
    const live = state.isDrawing && state.currentPath && !state.isShapeDrawing;
    const liveId = live ? getActiveLayer()?.id : null;

    this.engine.fillBackground(this.transparentBg);
    this._drawReference(ctx, false);
    for (const layer of state.layers) {
      if (!layer.visible) continue;
      ctx.save();
      ctx.globalAlpha = layer.opacity;
      ctx.drawImage(layer.id === liveId ? this._liveLayer(layer) : this._cachedLayer(layer), 0, 0);
      ctx.restore();
    }
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
      for (let i = 1; i < jp.length; i++) {
        const a = jp[i - 1];
        const b = jp[i];
        const pr = (a.p + b.p) / 2;
        ctx.lineWidth = Math.max(1, path.size * (0.3 + pr * 1.4));
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
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
