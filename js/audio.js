/**
 * Áudio 8-bit procedural — tudo sintetizado via Web Audio (zero ficheiros).
 *
 *  - beginStroke/updateStroke/endStroke → som CONTÍNUO de riscar, próprio de
 *    cada ferramenta e modulado pela velocidade do traço (mais rápido = mais alto).
 *  - playCell → com a grade ligada, cada quadradinho novo toca uma nota.
 *  - play… → efeitos curtos da interface (abrir, salvar, desfazer, explodir…).
 *
 * Tudo passa por um compressor no fim: os sons ficam fortes e com volume
 * parecido entre si, sem estourar quando vários tocam juntos.
 *
 * Autoplay: os browsers só deixam tocar após um gesto do utilizador — chama
 * resumeAudio() no primeiro clique (feito no botão "Vamos desenhar!").
 */

const VOLUME = 0.75;

let ctx = null;
let master = null;
let noiseBuf = null;
let muted = false;
let active = null; // voz do traço em curso

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.15;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : VOLUME;
    master.connect(comp);
    comp.connect(ctx.destination);
    // 2s de ruído branco, reutilizado por todas as vozes
    const len = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  return ctx;
}

export function resumeAudio() {
  const c = ac();
  if (c.state === 'suspended') c.resume();
}

export function setMuted(v) {
  muted = v;
  if (master) master.gain.value = v ? 0 : VOLUME;
}
export function isMuted() { return muted; }

/* ── Peças básicas ──────────────────────────────────────── */

function envelope(param, t, peak, attack, dur) {
  param.setValueAtTime(0.0001, t);
  param.exponentialRampToValueAtTime(peak, t + attack);
  param.exponentialRampToValueAtTime(0.0001, t + dur);
}

/** Nota curta (onda quadrada/triangular/…), opcionalmente a deslizar até `to`. */
function blip({ type = 'square', freq, to = 0, dur = 0.08, gain = 0.1, at = 0, attack = 0.005 }) {
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ctx.createGain();
  envelope(g.gain, t, gain, attack, dur);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** Rajada de ruído filtrado (o filtro pode deslizar até `to`). */
function hiss({ filter = 'bandpass', freq = 2000, to = 0, q = 1, dur = 0.1, gain = 0.1, at = 0, attack = 0.005 }) {
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.frequency.setValueAtTime(freq, t);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  envelope(g.gain, t, gain, attack, dur);
  src.connect(f);
  f.connect(g);
  g.connect(master);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.02);
}

/** Só toca com som ligado (e acorda o áudio se preciso). */
function sfx(fn) {
  if (muted) return;
  ac();
  resumeAudio();
  fn();
}

/* ── Riscar (som contínuo do traço) ─────────────────────── */

/**
 * Perfil sonoro de cada ferramenta (por KEY).
 *  tick   → "tic" do bico a cada `every` px percorridos
 *  grain  → frequência a tremer (grafite)
 *  lfo    → volume a pulsar (pincel ondulante, spray "psss")
 *  squeak → chiado afinado que sobe com a velocidade (marcador)
 *  rub    → zumbido grave de borracha a esfregar
 */
const STILL_AFTER = 0.09; // s sem movimento até o som do traço se apagar

const SND = {
  pen:       { filter: 'highpass', freq: 2600, q: 0.9, gain: 0.08, tick: { every: 16, freq: 2300, gain: 0.03 } },
  fineliner: { filter: 'highpass', freq: 3800, q: 1.2, gain: 0.06, tick: { every: 11, freq: 3400, gain: 0.022 } },
  pencil:    { filter: 'bandpass', freq: 1700, q: 0.8, gain: 0.12, grain: true },
  brush:     { filter: 'lowpass',  freq: 900,  q: 0.6, gain: 0.1, lfo: { rate: 3.2, depth: 0.5 } },
  marker:    { filter: 'bandpass', freq: 1300, q: 2.4, gain: 0.08, squeak: { freq: 820, gain: 0.025 } },
  spray:     { filter: 'highpass', freq: 4200, q: 0.4, gain: 0.14, lfo: { rate: 15, depth: 0.7 } },
  eraser:    { filter: 'lowpass',  freq: 620,  q: 1.3, gain: 0.12, rub: { freq: 68, gain: 0.06 } },
};

export function beginStroke(key) {
  if (muted) return;
  const c = ac();
  resumeAudio();
  endStroke(); // garante que não há duas vozes

  const cfg = SND[key] || SND.pen;
  const t = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const filt = c.createBiquadFilter();
  filt.type = cfg.filter;
  filt.frequency.value = cfg.freq;
  filt.Q.value = cfg.q;
  const g = c.createGain();      // segue a velocidade do traço
  g.gain.value = 0.0001;
  const trem = c.createGain();   // pulsação (LFO)
  src.connect(filt);
  filt.connect(g);
  g.connect(trem);
  trem.connect(master);
  src.start(t, Math.random() * 1.5);

  const extra = [];
  if (cfg.lfo) {
    trem.gain.value = 1 - cfg.lfo.depth / 2;
    const lfo = c.createOscillator();
    lfo.frequency.value = cfg.lfo.rate;
    const depth = c.createGain();
    depth.gain.value = cfg.lfo.depth / 2;
    lfo.connect(depth);
    depth.connect(trem.gain);
    lfo.start(t);
    extra.push(lfo);
  }
  let tone = null;
  const toneCfg = cfg.squeak || cfg.rub;
  if (toneCfg) {
    const o = c.createOscillator();
    o.type = cfg.squeak ? 'sine' : 'triangle';
    o.frequency.value = toneCfg.freq;
    const tg = c.createGain();
    tg.gain.value = 0.0001;
    o.connect(tg);
    tg.connect(master);
    o.start(t);
    extra.push(o);
    tone = { o, g: tg, cfg: toneCfg };
  }
  active = { cfg, src, filt, g, tone, extra, travelled: 0 };
}

export function updateStroke(speed) {
  if (!active || muted) return;
  const c = ctx;
  const t = c.currentTime;
  // velocidade → intensidade (com teto), para o som "seguir" o traço; e se a
  // mão parar (sem mais movimentos), o som apaga-se sozinho logo a seguir.
  const s = Math.min(1, speed / 40);
  const g = active.g.gain;
  g.cancelScheduledValues(t);
  g.setTargetAtTime(active.cfg.gain * (0.35 + s * 0.9), t, 0.03);
  g.setTargetAtTime(0.0001, t + STILL_AFTER, 0.05);
  if (active.cfg.grain) {
    active.filt.frequency.setTargetAtTime(active.cfg.freq * (0.85 + Math.random() * 0.4), t, 0.02);
  }
  if (active.tone) {
    const { o, g: tg, cfg } = active.tone;
    tg.gain.cancelScheduledValues(t);
    tg.gain.setTargetAtTime(cfg.gain * (0.2 + s), t, 0.04);
    tg.gain.setTargetAtTime(0.0001, t + STILL_AFTER, 0.05);
    if (active.cfg.squeak) o.frequency.setTargetAtTime(cfg.freq * (0.9 + s * 0.6), t, 0.05);
  }
  const tick = active.cfg.tick;
  if (tick) {
    active.travelled += speed;
    if (active.travelled >= tick.every) {
      active.travelled = 0;
      blip({ type: 'square', freq: tick.freq * (0.9 + Math.random() * 0.2), dur: 0.014, gain: tick.gain, attack: 0.001 });
    }
  }
}

export function endStroke() {
  if (!active) return;
  const t = ctx.currentTime;
  const { g, src, extra, tone } = active;
  g.gain.setTargetAtTime(0.0001, t, 0.04);
  if (tone) tone.g.gain.setTargetAtTime(0.0001, t, 0.04);
  src.stop(t + 0.2);
  extra.forEach((o) => o.stop(t + 0.2));
  active = null;
}

/* ── Pixel art: uma nota por quadradinho ────────────────── */
const PENTA = [0, 2, 4, 7, 9];
let lastCellAt = 0;

/** Quadradinho novo na linha `row` de `rows` → nota da escala pentatónica (em cima = agudo). */
export function playCell(row, rows) {
  if (muted || !ctx) return;
  const now = performance.now();
  if (now - lastCellAt < 35) return; // um gesto rápido não vira metralhadora
  lastCellAt = now;
  const step = Math.max(0, rows - 1 - row);
  const semis = Math.floor(step / PENTA.length) * 12 + PENTA[step % PENTA.length];
  blip({ type: 'square', freq: 196 * 2 ** (Math.min(semis, 36) / 12), dur: 0.07, gain: 0.05 });
}

/* ── Efeitos da interface ───────────────────────────────── */

/** Toque subtil de troca de ferramenta: um "tick" 8-bit curto e suave. */
export function playSwitch() {
  sfx(() => blip({ type: 'triangle', freq: 660, to: 990, dur: 0.08, gain: 0.07, attack: 0.008 }));
}

/** Clique genérico de botão (bem curto, para não cansar). */
export function playClick() {
  sfx(() => blip({ type: 'square', freq: 1200, to: 900, dur: 0.025, gain: 0.03, attack: 0.002 }));
}

/** Passar o rato por uma ferramenta: quase inaudível. */
export function playHover() {
  sfx(() => blip({ type: 'triangle', freq: 1500, dur: 0.02, gain: 0.015, attack: 0.002 }));
}

/** Abrir janela/menu: arpejo a subir. */
export function playOpen() {
  sfx(() => [523, 784, 1047].forEach((f, i) => blip({ type: 'square', freq: f, dur: 0.05, gain: 0.04, at: i * 0.035 })));
}

/** Fechar janela/menu: arpejo a descer. */
export function playClose() {
  sfx(() => [1047, 784, 523].forEach((f, i) => blip({ type: 'square', freq: f, dur: 0.045, gain: 0.03, at: i * 0.03 })));
}

/** Salvo: "jingle" de três notas + brilho. */
export function playSave() {
  sfx(() => {
    [[659, 0], [880, 0.07], [1319, 0.14]].forEach(([f, at]) => blip({ type: 'square', freq: f, dur: 0.09, gain: 0.07, at }));
    blip({ type: 'triangle', freq: 2637, dur: 0.18, gain: 0.04, at: 0.21 });
  });
}

/** Desfazer: fita a rebobinar (desce). */
export function playUndo() {
  sfx(() => {
    blip({ type: 'sawtooth', freq: 900, to: 300, dur: 0.1, gain: 0.04 });
    hiss({ filter: 'bandpass', freq: 3000, to: 900, q: 2, dur: 0.1, gain: 0.04 });
  });
}

/** Refazer: fita para a frente (sobe). */
export function playRedo() {
  sfx(() => {
    blip({ type: 'sawtooth', freq: 300, to: 900, dur: 0.1, gain: 0.04 });
    hiss({ filter: 'bandpass', freq: 900, to: 3000, q: 2, dur: 0.1, gain: 0.04 });
  });
}

/** Algo novo aparece (camada, cópia): "pop". */
export function playPop() {
  sfx(() => blip({ type: 'sine', freq: 300, to: 1200, dur: 0.09, gain: 0.12 }));
}

/** Algo é apagado (camada): "crunch". */
export function playCrunch() {
  sfx(() => {
    hiss({ filter: 'lowpass', freq: 2500, to: 300, q: 1, dur: 0.16, gain: 0.14 });
    blip({ type: 'square', freq: 160, to: 70, dur: 0.12, gain: 0.06 });
  });
}

/** Não dá (camada bloqueada, sem espaço): zumbido duplo grave. */
export function playError() {
  sfx(() => [0, 0.11].forEach((at) => blip({ type: 'square', freq: 110, dur: 0.08, gain: 0.08, at })));
}

/** Cor escolhida: cada cor toca uma nota (o matiz escolhe a altura). */
export function playColor(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  const r = (n >> 16) & 255; const g = (n >> 8) & 255; const b = n & 255;
  const max = Math.max(r, g, b); const min = Math.min(r, g, b);
  let h = 0;
  if (max !== min) {
    const d = max - min;
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  }
  const step = Math.round(((h * 60 + 360) % 360) / 30); // 12 matizes → 12 notas
  sfx(() => blip({ type: 'triangle', freq: 392 * 2 ** (step / 12), dur: 0.11, gain: 0.09 }));
}

/** Exportar: pequena fanfarra. */
export function playExport() {
  sfx(() => [[523, 0], [659, 0.08], [784, 0.16], [1047, 0.24], [784, 0.32], [1047, 0.4]]
    .forEach(([f, at]) => blip({ type: 'square', freq: f, dur: 0.09, gain: 0.06, at })));
}

/** Luva: pegar ("tuk") e soltar ("tok"). */
export function playGrab() {
  sfx(() => blip({ type: 'square', freq: 520, to: 380, dur: 0.05, gain: 0.06 }));
}
export function playDrop() {
  sfx(() => blip({ type: 'square', freq: 300, to: 220, dur: 0.06, gain: 0.07 }));
}

/** Pavio a arder durante `dur` segundos (chiado com estalidos). */
export function playFuse(dur = 0.45) {
  sfx(() => {
    hiss({ filter: 'highpass', freq: 3500, q: 0.6, dur, gain: 0.08, attack: 0.02 });
    for (let at = 0; at < dur; at += 0.06 + Math.random() * 0.05) {
      hiss({ filter: 'bandpass', freq: 5000, q: 3, dur: 0.012, gain: 0.08, at, attack: 0.001 });
    }
  });
}

/** Fanfarra 8-bit de arranque (splash → tela de desenho). */
export function playStart() {
  sfx(() => [[523, 0], [659, 0.09], [784, 0.18], [1047, 0.27]]
    .forEach(([f, at]) => blip({ type: 'square', freq: f, dur: 0.16, gain: 0.13, at, attack: 0.01 })));
}

/** Balde: "glub-glub" de tinta a cair (três bolhas a descer de tom). */
export function playFill() {
  sfx(() => [[0, 560], [0.1, 420], [0.19, 320]]
    .forEach(([at, f]) => blip({ type: 'sine', freq: f, to: f * 0.45, dur: 0.1, gain: 0.22, at, attack: 0.01 })));
}

/** Explosão da bomba: ruído descendente + tom grave (para o OBLITERAR). */
export function playBoom() {
  sfx(() => {
    hiss({ filter: 'lowpass', freq: 3200, to: 120, q: 1, dur: 0.55, gain: 0.5, attack: 0.002 });
    blip({ type: 'square', freq: 140, to: 40, dur: 0.5, gain: 0.25, attack: 0.002 });
  });
}
