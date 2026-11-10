// WebAudio synthesized sounds. No asset files.
let ctx = null;
let master = null;
let muted = false;

function ensure() {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  } catch (e) { ctx = null; }
  return ctx;
}

export function resumeAudio() {
  const c = ensure();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}
export function setMuted(m) { muted = m; }

let noiseBuf = null;
function noise() {
  if (noiseBuf) return noiseBuf;
  const len = ctx.sampleRate * 1;
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

function tone(type, f0, f1, dur, vol = 0.3, delay = 0) {
  const c = ensure(); if (!c || muted) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator(); const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}

function burst(dur, vol, filterType, f0, f1, delay = 0) {
  const c = ensure(); if (!c || muted) return;
  const t = c.currentTime + delay;
  const src = c.createBufferSource(); src.buffer = noise();
  const flt = c.createBiquadFilter(); flt.type = filterType;
  flt.frequency.setValueAtTime(f0, t);
  flt.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(flt); flt.connect(g); g.connect(master);
  src.start(t); src.stop(t + dur + 0.05);
}

export const sfx = {
  swing(heavy = false) { burst(heavy ? 0.35 : 0.2, heavy ? 0.5 : 0.35, 'bandpass', heavy ? 500 : 1200, heavy ? 200 : 500); },
  bonk(power = 1) {
    tone('sine', 130 + 40 * Math.random(), 48, 0.16, 0.55 * Math.min(1.5, power));
    burst(0.09, 0.4, 'lowpass', 1100, 150); burst(0.05, 0.2, 'bandpass', 2500, 900);
  },
  boing() { tone('sine', 90, 38, 0.3, 0.55); burst(0.16, 0.35, 'lowpass', 900, 120); burst(0.1, 0.18, 'bandpass', 2200, 700, 0.04); },
  gun() { burst(0.18, 0.7, 'lowpass', 4000, 200); tone('square', 160, 40, 0.15, 0.3); },
  empty() { tone('square', 800, 700, 0.03, 0.1); },
  whoosh() { burst(0.25, 0.2, 'highpass', 400, 3000); },
  jump() { tone('sine', 250, 500, 0.12, 0.15); },
  pop() { tone('sine', 500, 900, 0.07, 0.2); },
  blip(pitch = 250) {
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) tone('square', pitch * (0.8 + Math.random() * 0.6), pitch * (0.8 + Math.random() * 0.6), 0.06, 0.07, i * 0.07);
  },
  accept() { tone('triangle', 440, 440, 0.12, 0.25); tone('triangle', 660, 660, 0.18, 0.25, 0.1); },
  unlock() { [523, 659, 784, 1046].forEach((f, i) => tone('triangle', f, f, 0.22, 0.25, i * 0.11)); },
  wheel() { tone('sine', 700, 700, 0.03, 0.08); },
  equip() { tone('triangle', 600, 900, 0.08, 0.2); },
  error() { tone('sawtooth', 200, 120, 0.15, 0.15); },
  bark() { tone('sawtooth', 380, 170, 0.12, 0.28); tone('square', 330, 150, 0.12, 0.12, 0.0); tone('sawtooth', 400, 180, 0.12, 0.26, 0.17); },
  meow() { tone('triangle', 520, 900, 0.18, 0.22); tone('triangle', 900, 520, 0.28, 0.2, 0.17); },
  cluck() { for (let i = 0; i < 3; i++) tone('square', 700 + i * 90, 420, 0.07, 0.12, i * 0.09); },
  thump() { tone('sine', 90, 30, 0.35, 0.8); burst(0.25, 0.5, 'lowpass', 600, 80); },
  quack(v = 1) { tone('sawtooth', 640, 430, 0.12, 0.13 * v); tone('square', 320, 230, 0.11, 0.05 * v, 0.01); },
  fanfare() { [392, 523, 659, 784].forEach((f, i) => tone('triangle', f, f, 0.2, 0.2, i * 0.08)); tone('triangle', 1046, 1046, 0.45, 0.22, 0.34); },
  hat() { tone('sine', 880, 1320, 0.2, 0.25); tone('sine', 1320, 1760, 0.2, 0.2, 0.12); },
};

// ---- continuous engine hum for driving ----
let eng = null;
export const engine = {
  start() {
    const c = ensure(); if (!c || muted || eng) return;
    const o = c.createOscillator(), o2 = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.frequency.value = 500;
    g.gain.value = 0.0001;
    o.connect(f); o2.connect(f); f.connect(g); g.connect(master);
    o.start(); o2.start();
    g.gain.linearRampToValueAtTime(0.09, c.currentTime + 0.3);
    eng = { o, o2, f, g };
  },
  set(speedNorm, throttle) {
    if (!eng || !ctx) return;
    const t = ctx.currentTime, hz = 38 + speedNorm * 120 + throttle * 14;
    eng.o.frequency.setTargetAtTime(hz, t, 0.08);
    eng.o2.frequency.setTargetAtTime(hz * 0.5, t, 0.08);
    eng.f.frequency.setTargetAtTime(350 + speedNorm * 900 + throttle * 300, t, 0.1);
  },
  stop() {
    if (!eng || !ctx) return;
    const e = eng; eng = null;
    e.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.08);
    setTimeout(() => { try { e.o.stop(); e.o2.stop(); } catch (err) { /* ignore */ } }, 400);
  },
  horn() { tone('square', 330, 330, 0.35, 0.18); tone('square', 415, 415, 0.35, 0.18); },
};
