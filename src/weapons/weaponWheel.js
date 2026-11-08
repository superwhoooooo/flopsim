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
    this.setItems(['axe', 'sword', 'gun']);
  }

  /** (Re)build the wedges for the weapons the player owns, evenly around the ring. */
  setItems(ids) {
    this.ids = ids.slice();
    this.items = {};
    this.el.innerHTML = '<div class="wheel-ring"></div><div class="wheel-dot"></div>';
    const R = this.ids.length > 6 ? 185 : 130;
    this.ids.forEach((id, i) => {
      const a = (i / this.ids.length) * Math.PI * 2;
      const d = document.createElement('div');
      d.className = 'wheel-item';
      d.style.left = `calc(50% + ${Math.sin(a) * R}px)`;
      d.style.top = `calc(50% - ${Math.cos(a) * R}px)`;
      d.innerHTML = `<div class="wi-icon">${WEAPONS[id].icon}</div><div class="wi-name">${WEAPONS[id].name}</div>`;
      d.style.setProperty('--c', WEAPONS[id].color);
      this.el.appendChild(d);
      this.items[id] = { el: d, angle: a };
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
    const max = 90;
    if (m > max) { this.vx *= max / m; this.vy *= max / m; }
    this.dot.style.transform = `translate(calc(-50% + ${this.vx}px), calc(-50% + ${this.vy}px))`;
    if (m > 28) {
      const ang = Math.atan2(this.vx, -this.vy); // 0 = up, clockwise
      let best = null, bd = 9;
      for (const id of this.ids) {
        let d = Math.abs(ang - this.items[id].angle);
        d = Math.min(d, Math.PI * 2 - d);
        if (d < bd) { bd = d; best = id; }
      }
      if (best !== this.choice) { this.choice = best; sfx.wheel(); this._mark(); }
    }
  }

  _mark() {
    for (const id of this.ids) this.items[id].el.classList.toggle('sel', id === this.choice);
  }
}
