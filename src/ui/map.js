// City map (M): streets, buildings, parks, landmarks (found ones named, the rest "?"), quest givers, found ducks, you.
import * as THREE from 'three';
import { ROADS, ROAD_W, PARKS } from '../world/world.js';

const EXTENT = 118;   // world units from centre to the map edge

export class MapView {
  constructor(game) {
    this.game = game;
    this.open = false;
    this.el = document.getElementById('map');
    this.el.innerHTML = `
      <div class="mp-box">
        <div class="mp-head"><h2>Map</h2><span class="mp-stats"></span><button class="mp-close">Close (M)</button></div>
        <canvas></canvas>
        <div class="mp-legend"><span><b class="lg-you">▲</b> you</span><span><b class="lg-q">!</b> quest</span><span><b class="lg-r">?</b> turn in</span>
          <span><b class="lg-l">?</b> undiscovered place</span><span><b class="lg-d">●</b> duck found</span><span><b class="lg-s">●</b> falling vegetable!</span></div>
      </div>`;
    this.canvas = this.el.querySelector('canvas');
    this.stats = this.el.querySelector('.mp-stats');
    this.el.querySelector('.mp-close').addEventListener('click', () => game.toggleMap(false));
  }

  show(v) {
    this.open = v;
    this.el.classList.toggle('open', v);
    if (v) this.render();
  }

  render() {
    const g = this.game, D = g.discovery, w = g.world;
    const size = Math.floor(Math.min(window.innerHeight * 0.74, window.innerWidth * 0.9, 760));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const c = this.canvas;
    c.width = size * dpr; c.height = size * dpr; c.style.width = c.style.height = size + 'px';
    const x = c.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    const s = size / (EXTENT * 2);
    const X = (wx) => (wx + EXTENT) * s, Z = (wz) => (wz + EXTENT) * s;   // north (-z) is up

    x.fillStyle = '#2b5f7a'; x.fillRect(0, 0, size, size);                // harbour
    x.fillStyle = '#d8d0c0'; x.fillRect(X(-105), Z(-105), 210 * s, 210 * s);
    x.strokeStyle = '#8f8a80'; x.lineWidth = 2 * s; x.strokeRect(X(-105), Z(-105), 210 * s, 210 * s);
    for (const key of PARKS) {
      const [px, pz] = key.split(',').map(Number);
      x.fillStyle = '#9cc77e'; x.fillRect(X(px - 11), Z(pz - 11), 22 * s, 22 * s);
    }
    x.fillStyle = '#6d6f75';
    for (const r of ROADS) {
      x.fillRect(X(r - ROAD_W / 2), Z(-105), ROAD_W * s, 210 * s);
      x.fillRect(X(-105), Z(r - ROAD_W / 2), 210 * s, ROAD_W * s);
    }
    for (const h of w.houses) {
      const k = Math.min(1, h.h / 60);
      const v = Math.round(170 - k * 90);
      x.fillStyle = `rgb(${v},${v - 6},${v - 14})`;
      x.fillRect(X(h.x - h.w / 2), Z(h.z - h.d / 2), h.w * s, h.d * s);
    }

    const label = (txt, lx, ly, color = '#fff', font = 12) => {
      x.font = `800 ${font}px "Trebuchet MS", system-ui, sans-serif`;
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineWidth = 3; x.strokeStyle = 'rgba(0,0,0,.75)'; x.strokeText(txt, lx, ly);
      x.fillStyle = color; x.fillText(txt, lx, ly);
    };
    const dot = (dx, dy, r, fill, stroke = '#000') => { x.beginPath(); x.arc(dx, dy, r, 0, Math.PI * 2); x.fillStyle = fill; x.fill(); x.lineWidth = 1.5; x.strokeStyle = stroke; x.stroke(); };

    // landmarks
    for (const l of D.landmarkList) {
      if (D.landmarks.has(l.id)) { dot(X(l.x), Z(l.z), 4, '#ffe14a'); label(l.name, X(l.x), Z(l.z) - 12, '#fff6c0', 12); }
      else { dot(X(l.x), Z(l.z), 9, 'rgba(30,40,70,.85)', '#9fd8ff'); label('?', X(l.x), Z(l.z) + 1, '#9fd8ff', 13); }
    }
    // found ducks
    for (const d of D.ducks) if (D.ducksFound.has(d.i)) dot(X(d.x), Z(d.z), 3.2, '#ffc31a', '#6a4200');
    // falling vegetable
    if (g.spud.cur) { const t = g.spud.cur.body.translation(); dot(X(t.x), Z(t.z), 7, 'rgba(255,60,60,.8)', '#fff'); }
    // quest givers
    for (const n of g.npcs) {
      if (!n.isGiver) continue;
      const q = g.quests.forGiver(n.id), st = g.quests.state[q.id].status;
      const mark = st === 'available' && !g.quests.isLocked(q) ? '!' : st === 'ready' ? '?' : null;
      if (!mark) { dot(X(n.pos.x), Z(n.pos.z), 2.5, '#fff'); continue; }
      label(mark, X(n.pos.x), Z(n.pos.z), mark === '!' ? '#ffe14a' : '#8cff8c', 18);
    }
    // you
    const p = g.player.ragdoll.getPos(new THREE.Vector3());
    const f = g.cam.flatForward(new THREE.Vector3());
    const a = Math.atan2(f.z, f.x);
    x.save(); x.translate(X(p.x), Z(p.z)); x.rotate(a);
    x.beginPath(); x.moveTo(10, 0); x.lineTo(-7, 6.5); x.lineTo(-3.5, 0); x.lineTo(-7, -6.5); x.closePath();
    x.fillStyle = '#ff3b5c'; x.fill(); x.lineWidth = 2; x.strokeStyle = '#fff'; x.stroke();
    x.restore();
    // compass
    label('N', size - 18, 18, '#fff', 16);

    this.stats.textContent = `🦆 ${D.ducksFound.size}/${D.duckTotal} ducks  ·  🗺 ${D.landmarks.size}/${D.landmarkList.length} places`;
  }
}
