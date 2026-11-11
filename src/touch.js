// Touch controls for phones / tablets: a floating move stick on the left, drag anywhere else to look,
// and on-screen buttons that feed the same actions as the keyboard (via game.pressKey / game.releaseKey).
import { WEAPONS } from './weapons/weapons.js';
import { sfx } from './audio.js';

// ?touch=1 / ?touch=0 in the URL forces the choice (touch laptops, tablets with keyboards, testing)
const FORCE = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('touch') : null;
export const IS_TOUCH = FORCE === '1' || (FORCE !== '0' && typeof window !== 'undefined'
  && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window)
  && window.matchMedia('(pointer: coarse)').matches);

const STICK_R = 56;          // px the knob can travel from the stick centre
const LOOK_SENS = 2.4;       // touch pixels -> "mouse pixels" for CameraRig.look
const DEAD = 0.18;           // stick dead zone

// [id, label, code or action, size class, shown when: 'foot' | 'drive' | 'both']
const BUTTONS = [
  ['attack', '👊', 'attack', 'xl', 'foot'],
  ['jump', '⤒', 'Space', 'lg', 'foot'],
  ['use', 'USE', 'KeyE', 'md', 'both'],
  ['ability', '✨', 'KeyQ', 'md', 'foot'],
  ['spin', '🌀', 'KeyR', 'sm', 'foot'],
  ['weapon', '🗡', 'weapon', 'sm', 'foot'],
  ['talk', '💬', 'talk', 'sm', 'foot'],
  ['flop', '🫠', 'KeyX', 'md', 'foot'],
  ['grab', '✋', 'KeyF', 'md', 'foot'],
  ['gear', '🎒', 'KeyC', 'sm', 'foot'],
  ['brake', 'BRAKE', 'Space', 'lg', 'drive'],
  ['boost', '🔥', 'ShiftLeft', 'md', 'drive'],
  ['horn', '📯', 'KeyF', 'sm', 'drive'],
  ['boom', '💥', 'KeyZ', 'sm', 'drive'],
];
const MENU = [
  ['pause', '⏸', 'pause'],
  ['map', '🗺', 'KeyM'],
  ['journal', '📖', 'KeyJ'],
  ['skin', '🐾', 'KeyB'],
  ['hat', '🎩', 'KeyH'],
  ['cam', '🎥', 'cam'],
  ['net', '👥', 'net'],
  ['quality', '⚙️', 'KeyG'],
  ['look', '🎨', 'KeyV'],
  ['slow', '⏱', 'KeyT'],
  ['photo', '📷', 'KeyP'],
  ['replay', '🎬', 'KeyO'],
];

export class TouchControls {
  constructor(game, { onPause }) {
    this.game = game;
    this.onPause = onPause;
    this.stickId = null; this.lookId = null;
    this.held = new Map();     // pointerId -> code held by a button
    document.body.classList.add('touch');

    const root = document.createElement('div');
    root.id = 'touch';
    root.innerHTML = `
      <div id="tLook"></div>
      <div id="tStick"><div class="t-knob"></div></div>
      <div id="tMenu">${MENU.map(([id, label]) => `<button class="t-btn" data-id="${id}">${label}</button>`).join('')}</div>
      <div id="tPad">${BUTTONS.map(([id, label, , size, when]) => `<button class="t-btn t-${size} t-${when}" data-id="${id}">${label}</button>`).join('')}</div>`;
    document.body.appendChild(root);
    this.root = root;
    this.stickEl = root.querySelector('#tStick');
    this.knob = root.querySelector('.t-knob');
    this.btn = {};
    root.querySelectorAll('.t-btn').forEach((b) => { this.btn[b.dataset.id] = b; });

    this._bindLookAndStick(root.querySelector('#tLook'));
    for (const [id, , action] of BUTTONS) this._bindButton(id, action);
    for (const [id, , action] of MENU) this._bindButton(id, action);
    this._bindHotbar();
    this._bindWheel();
    // iOS: stop pinch-zoom and double-tap zoom from hijacking the game
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault());
  }

  // ---------------------------------------------------------------- move stick + look
  _bindLookAndStick(el) {
    el.addEventListener('pointerdown', (e) => {
      if (this.game.paused) return;
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      if (this.stickId === null && e.clientX < window.innerWidth * 0.42) {
        this.stickId = e.pointerId;
        this.sx = e.clientX; this.sy = e.clientY;
        this.stickEl.style.left = `${e.clientX}px`; this.stickEl.style.top = `${e.clientY}px`;
        this.stickEl.classList.add('on');
        this._setStick(0, 0);
      } else if (this.lookId === null) {
        this.lookId = e.pointerId; this.lx = e.clientX; this.ly = e.clientY;
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.stickId) {
        let dx = e.clientX - this.sx, dy = e.clientY - this.sy;
        const m = Math.hypot(dx, dy);
        if (m > STICK_R) {
          // drag the base along so the stick never "runs out"
          const over = m - STICK_R;
          this.sx += (dx / m) * over; this.sy += (dy / m) * over;
          this.stickEl.style.left = `${this.sx}px`; this.stickEl.style.top = `${this.sy}px`;
          dx = e.clientX - this.sx; dy = e.clientY - this.sy;
        }
        this._setStick(dx / STICK_R, -dy / STICK_R);
      } else if (e.pointerId === this.lookId) {
        this._look(e.clientX - this.lx, e.clientY - this.ly);
        this.lx = e.clientX; this.ly = e.clientY;
      }
    });
    const end = (e) => {
      if (e.pointerId === this.stickId) { this.stickId = null; this.stickEl.classList.remove('on'); this._setStick(0, 0); }
      if (e.pointerId === this.lookId) this.lookId = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  _look(dx, dy) {
    const g = this.game;
    if (g.paused || g.wheel.open) return;
    g.cam.look(dx * LOOK_SENS, dy * LOOK_SENS);
  }

  /** x: right, y: forward, both -1..1. Drives the analog stick plus the WASD keys (cars, web swing). */
  _setStick(x, y) {
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    this.knob.style.transform = `translate(${x * STICK_R}px, ${-y * STICK_R}px)`;
    const inp = this.game.input;
    const live = m > DEAD;
    inp.stick.x = live ? x : 0; inp.stick.y = live ? y : 0;
    const set = (code, on) => { if (on) inp.keys.add(code); else inp.keys.delete(code); };
    set('KeyW', live && y > 0.38); set('KeyS', live && y < -0.38);
    set('KeyD', live && x > 0.38); set('KeyA', live && x < -0.38);
    // push the stick all the way to run (on foot only: the car has its own boost button)
    this.stickSprint = live && m > 0.92 && !this.game.driving.active;
    if (![...this.held.values()].includes('ShiftLeft')) set('ShiftLeft', this.stickSprint);
  }

  // ---------------------------------------------------------------- buttons
  _bindButton(id, action) {
    const b = this.btn[id];
    const g = this.game;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      try { b.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      b.classList.add('down');
      if (action === 'pause') { this.onPause(); return; }
      if (action === 'KeyM' || action === 'KeyJ') { g.pressKey(action); return; }   // menus work while paused
      if (action === 'net') { g.net?.toggle(); return; }                              // multiplayer panel
      if (g.paused) return;
      if (action === 'attack') {
        g.input.mouseHeld = true; g.attackPress();
        this.lookId = e.pointerId; this.lx = e.clientX; this.ly = e.clientY;   // slide the attack thumb to aim
      } else if (action === 'weapon') this.openWheel();
      else if (action === 'talk') document.body.classList.toggle('talk-open');
      else if (action === 'cam') g.pressKey(g.cam.mode === 'first' ? 'KeyK' : 'KeyL');
      else { g.pressKey(action); this.held.set(e.pointerId, action); }
    });
    b.addEventListener('pointermove', (e) => {
      if (action === 'attack' && e.pointerId === this.lookId) {
        this._look(e.clientX - this.lx, e.clientY - this.ly);
        this.lx = e.clientX; this.ly = e.clientY;
      }
    });
    const up = (e) => {
      b.classList.remove('down');
      if (action === 'attack') { g.input.mouseHeld = false; if (this.lookId === e.pointerId) this.lookId = null; }
      const code = this.held.get(e.pointerId);
      if (code) { this.held.delete(e.pointerId); g.releaseKey(code); if (code === 'ShiftLeft' && this.stickSprint) g.input.keys.add('ShiftLeft'); }
    };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _bindHotbar() {
    const g = this.game;
    g.hud.slotEls.forEach((el, i) => {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (!g.paused) g.sayLine(i);
      });
    });
  }

  // ---------------------------------------------------------------- weapon wheel: tap to pick
  openWheel() {
    const g = this.game;
    if (g.driving.active || g.wheel.open) return;
    g.wheel.show(g.player.weaponId);
    const s = Math.min(1, (window.innerHeight * 0.94) / 520, (window.innerWidth * 0.94) / 520);
    g.wheel.el.style.transform = `scale(${s})`;
    sfx.wheel();
  }

  _bindWheel() {
    const g = this.game, el = g.wheel.el;
    el.addEventListener('pointerdown', (e) => {
      if (!g.wheel.open) return;
      e.preventDefault(); e.stopPropagation();
      const item = e.target.closest('.wheel-item');
      if (item) {
        const id = Object.keys(g.wheel.items).find((k) => g.wheel.items[k].el === item);
        if (id && WEAPONS[id]) g.wheel.choice = id;
      }
      const c = g.wheel.hide();
      if (item && c) g.player.equip(c);
    });
  }

  // ---------------------------------------------------------------- per-frame-ish refresh
  update() {
    const g = this.game, p = g.player, drive = g.driving.active;
    const f = p.form, w = WEAPONS[p.weaponId]?.icon || '🗡';
    const fun = g.fun, gearOn = !!fun?.gear.back, grabbing = !!fun?.moves.grab;
    const st = `${drive}|${f.icon}|${!!f.ability}|${p.abilityCd > 0}|${!!g.hud._prompt}|${w}|${gearOn}|${grabbing}|${fun?.gear.back}`;
    if (st === this._st) return;   // only touch the DOM when something changed
    this._st = st;
    document.body.classList.toggle('driving', drive);
    const ab = this.btn.ability;
    ab.style.display = f.ability ? '' : 'none';
    ab.textContent = f.icon;
    ab.classList.toggle('cool', p.abilityCd > 0);
    this.btn.use.classList.toggle('hot', !!g.hud._prompt);
    this.btn.use.textContent = drive ? 'EXIT' : 'USE';
    this.btn.weapon.textContent = w;
    this.btn.gear.style.display = gearOn ? '' : 'none';
    if (gearOn) this.btn.gear.textContent = { jetpack: '🚀', balloons: '🎈', blower: '🍃', magnet: '🧲' }[fun.gear.back] || '🎒';
    this.btn.grab.classList.toggle('hot', grabbing);
  }

  /** Drop every held touch (pause, blur, menus). */
  reset() {
    this.stickId = null; this.lookId = null;
    this.stickEl.classList.remove('on');
    this.held.clear();
    this._setStick(0, 0);
    this.game.input.mouseHeld = false;
    this.root.querySelectorAll('.t-btn.down').forEach((b) => b.classList.remove('down'));
    if (this.game.wheel.open) this.game.wheel.hide();
  }
}

/** Best effort: full screen + landscape on Android. iOS Safari ignores it (Add to Home Screen does it there). */
export function goFullscreen() {
  const de = document.documentElement;
  if (document.fullscreenElement || !de.requestFullscreen) return;
  de.requestFullscreen({ navigationUI: 'hide' })
    .then(() => screen.orientation?.lock?.('landscape'))
    .catch(() => { /* not allowed: fine */ });
}
