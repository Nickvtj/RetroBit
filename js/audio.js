/**
 * Áudio 8-bit procedural — tudo sintetizado via Web Audio (zero ficheiros).
 *
 *  - beginStroke/updateStroke/endStroke → som CONTÍNUO de riscar, próprio de
 *    cada ferramenta e modulado pela velocidade do traço (mais rápido = mais alto).
 *  - playSwitch → "blip" agradável de troca de ferramenta (estilo consola antiga).
 *
 * Autoplay: os browsers só deixam tocar após um gesto do utilizador — chama
 * resumeAudio() no primeiro clique (feito no botão "Vamos desenhar!").
 */

let ctx = null;
let master = null;
let noiseBuf = null;
let muted = false;
let active = null; // voz do traço em curso

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
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
  if (master) master.gain.value = v ? 0 : 0.5;
}
export function isMuted() { return muted; }

/**
 * Perfil sonoro de cada ferramenta (por KEY). Ganhos padronizados e subtis —
 * o riscar deve acompanhar o traço sem incomodar.
 */
const SND = {
  pen:       { filter: 'highpass', freq: 2400, q: 0.8, gain: 0.035 },
  fineliner: { filter: 'highpass', freq: 3400, q: 0.9, gain: 0.030 },
  pencil:    { filter: 'bandpass', freq: 1600, q: 0.6, gain: 0.050, grain: true },
  brush:     { filter: 'lowpass',  freq: 800,  q: 0.5, gain: 0.040 },
  marker:    { filter: 'lowpass',  freq: 1400, q: 0.7, gain: 0.045 },
  spray:     { filter: 'highpass', freq: 5000, q: 0.3, gain: 0.060 },
  eraser:    { filter: 'lowpass',  freq: 520,  q: 0.6, gain: 0.050 },
};

export function beginStroke(key) {
  if (muted) return;
  const c = ac();
  resumeAudio();
  endStroke(); // garante que não há duas vozes

  const cfg = SND[key] || SND.pen;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;

  const filt = c.createBiquadFilter();
  filt.type = cfg.filter;
  filt.frequency.value = cfg.freq;
  filt.Q.value = cfg.q;

  const g = c.createGain();
  g.gain.value = 0.0001;

  src.connect(filt);
  filt.connect(g);
  g.connect(master);
  src.start();

  let tone = null;
  if (cfg.tone) {
    tone = c.createOscillator();
    tone.type = cfg.tone.type;
    tone.frequency.value = cfg.tone.freq;
    const tg = c.createGain();
    tg.gain.value = cfg.tone.gain;
    tone.connect(tg);
    tg.connect(master);
    tone.start();
  }

  active = { cfg, src, filt, g, tone };
}

export function updateStroke(speed) {
  if (!active || muted) return;
  const c = ctx;
  // velocidade → intensidade (com teto), para o som "seguir" o traço
  const s = Math.min(1, speed / 40);
  const target = active.cfg.gain * (0.35 + s * 0.9);
  active.g.gain.setTargetAtTime(target, c.currentTime, 0.03);
  // lápis: um leve tremido de frequência para dar textura granulada
  if (active.cfg.grain) {
    active.filt.frequency.setTargetAtTime(active.cfg.freq * (0.85 + Math.random() * 0.4), c.currentTime, 0.02);
  }
}

export function endStroke() {
  if (!active) return;
  const c = ctx;
  const { g, src, tone } = active;
  const t = c.currentTime;
  g.gain.setTargetAtTime(0.0001, t, 0.04);
  src.stop(t + 0.2);
  if (tone) tone.stop(t + 0.2);
  active = null;
}

/** Toque subtil de troca de ferramenta: um "tick" 8-bit curto e suave. */
export function playSwitch() {
  if (muted) return;
  const c = ac();
  resumeAudio();
  const now = c.currentTime;
  const o = c.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(660, now);
  o.frequency.exponentialRampToValueAtTime(990, now + 0.05);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.05, now + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
  o.connect(g);
  g.connect(master);
  o.start(now);
  o.stop(now + 0.1);
}

/** Fanfarra 8-bit de arranque (splash → tela de desenho). */
export function playStart() {
  if (muted) return;
  const c = ac();
  resumeAudio();
  const now = c.currentTime;
  [[523, 0], [659, 0.09], [784, 0.18], [1047, 0.27]].forEach(([f, dt]) => {
    const o = c.createOscillator();
    o.type = 'square';
    o.frequency.value = f;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now + dt);
    g.gain.exponentialRampToValueAtTime(0.13, now + dt + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dt + 0.16);
    o.connect(g);
    g.connect(master);
    o.start(now + dt);
    o.stop(now + dt + 0.18);
  });
}

/** Explosão da bomba: ruído descendente + tom grave (para o OBLITERAR). */
export function playBoom() {
  if (muted) return;
  const c = ac();
  resumeAudio();
  const now = c.currentTime;

  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const filt = c.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.setValueAtTime(3200, now);
  filt.frequency.exponentialRampToValueAtTime(120, now + 0.5);
  const g = c.createGain();
  g.gain.setValueAtTime(0.5, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
  src.connect(filt); filt.connect(g); g.connect(master);
  src.start(now); src.stop(now + 0.6);

  const o = c.createOscillator();
  o.type = 'square';
  o.frequency.setValueAtTime(140, now);
  o.frequency.exponentialRampToValueAtTime(40, now + 0.45);
  const og = c.createGain();
  og.gain.setValueAtTime(0.25, now);
  og.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
  o.connect(og); og.connect(master);
  o.start(now); o.stop(now + 0.5);
}
