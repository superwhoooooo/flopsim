// Tab-held radial weapon menu. Mouse movement (while held) picks a wedge; releasing Tab equips it.
import { WEAPONS } from './weapons.js';
import { sfx } from '../audio.js';

export class WeaponWheel {
  constructor() {
    this.el = document.getElementById('wheel');
    this.open = false;
    this.vx = 0; this.vy = 0;
    this.choice = null;
    this.items = {};
    this.ids = [];
    this.setItems(['fists', 'axe', 'sword', 'gun']);
  }

  /** (Re)build the wedges for the weapons the player owns: one ring, or an outer + inner ring once there are many. */
  setItems(ids) {
    this.ids = ids.slice();
    this.items = {};
    this.el.innerHTML = '<div class="wheel-ring"></div><div class="wheel-dot"></div>';
    const n = this.ids.length;
    const outerN = n <= 8 ? n : Math.ceil(n * 0.62), innerN = n - outerN;
    const place = (id, a, R, size) => {
      const x = Math.sin(a) * R, y = -Math.cos(a) * R;
      const d = document.createElement('div');
      d.className = 'wheel-item';
      d.style.left = `calc(50% + ${x}px)`;
      d.style.top = `calc(50% + ${y}px)`;
      d.style.width = d.style.height = `${size}px`;
      d.style.margin = `${-size / 2}px 0 0 ${-size / 2}px`;
      d.style.setProperty('--c', WEAPONS[id].color);
      d.innerHTML = `<div class="wi-icon" style="font-size:${Math.round(size * 0.32)}px">${WEAPONS[id].icon}</div><div class="wi-name" style="font-size:${size < 80 ? 10 : 12}px">${WEAPONS[id].name}</div>`;
      this.el.appendChild(d);
      this.items[id] = { el: d, x, y };
    };
    this.ids.forEach((id, i) => {
      if (i < outerN) place(id, (i / outerN) * Math.PI * 2, n <= 8 ? 150 : 205, n <= 8 ? 92 : 78);
      else place(id, ((i - outerN + 0.5) / innerN) * Math.PI * 2, 100, 72);
    });
    this.dot = this.el.querySelector('.wheel-dot');
  }

  show(current) {
    this.open = true;
    this.vx = 0; this.vy = 0;
    this.choice = current;
    this.el.classList.add('open');
    this._mark();
    this.dot.style.transform = 'translate(-50%, -50%)';
  }

  /** Close and return the chosen weapon id */
  hide() {
    this.open = false;
    this.el.classList.remove('open');
    return this.choice;
  }

  move(dx, dy) {
    if (!this.open) return;
    this.vx += dx; this.vy += dy;
    const m = Math.hypot(this.vx, this.vy);
    const max = 215;
    if (m > max) { this.vx *= max / m; this.vy *= max / m; }
    this.dot.style.transform = `translate(calc(-50% + ${this.vx}px), calc(-50% + ${this.vy}px))`;
    if (m > 28) {
      let best = null, bd = 1e9;
      for (const id of this.ids) {
        const it = this.items[id];
        const d = Math.hypot(this.vx - it.x, this.vy - it.y);
        if (d < bd) { bd = d; best = id; }
      }
      if (best !== this.choice) { this.choice = best; sfx.wheel(); this._mark(); }
    }
  }

  _mark() {
    for (const id of this.ids) this.items[id].el.classList.toggle('sel', id === this.choice);
  }
}
