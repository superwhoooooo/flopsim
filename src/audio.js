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
  hat() { tone('sine', 880, 1320, 0.2, 0.25); tone('sine', 1320, 1760, 0.2, 0.2, 0.12); },
};
