// Tab-held radial weapon menu. Mouse movement (while held) picks a wedge; releasing Tab equips it.
import { WEAPONS, WEAPON_ORDER } from './weapons.js';
import { sfx } from '../audio.js';

export class WeaponWheel {
  constructor() {
    this.el = document.getElementById('wheel');
    this.open = false;
    this.vx = 0; this.vy = 0;
    this.choice = null;
    this.items = {};
    // angles (degrees, 0 = up, clockwise)
    const angles = { axe: 0, sword: 120, gun: 240 };
    const R = 110;
    this.el.innerHTML = '<div class="wheel-ring"></div><div class="wheel-dot"></div>';
    for (const id of WEAPON_ORDER) {
      const a = (angles[id] * Math.PI) / 180;
      const d = document.createElement('div');
      d.className = 'wheel-item';
      d.style.left = `calc(50% + ${Math.sin(a) * R}px)`;
      d.style.top = `calc(50% - ${Math.cos(a) * R}px)`;
      d.innerHTML = `<div class="wi-icon">${{ axe: '\u{1FA93}', sword: '\u{1F5E1}️', gun: '\u{1F52B}' }[id]}</div><div class="wi-name">${WEAPONS[id].name}</div>`;
      d.style.setProperty('--c', WEAPONS[id].color);
      this.el.appendChild(d);
      this.items[id] = { el: d, angle: a };
    }
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
      for (const id of WEAPON_ORDER) {
        let d = Math.abs(ang - this.items[id].angle);
        d = Math.min(d, Math.PI * 2 - d);
        if (d < bd) { bd = d; best = id; }
      }
      if (best !== this.choice) { this.choice = best; sfx.wheel(); this._mark(); }
    }
  }

  _mark() {
    for (const id of WEAPON_ORDER) this.items[id].el.classList.toggle('sel', id === this.choice);
  }
}
