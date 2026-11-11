// Gear: a BACK slot (jetpack, balloons, leaf blower, magnet: hold C to use) and a FEET slot (spring shoes, roller
// skates: always on). Found in glowing chests around town (one is hidden in a secret room) or earned from feats.
// Y cycles back gear, U cycles feet gear; the journal's Gear tab lets you click to equip.
import * as THREE from 'three';
import { getMat } from '../ragdoll.js';
import { LIGHTHOUSE_POS } from '../world/world.js';
import { sfx } from '../audio.js';

export const GEAR = {
  jetpack: { slot: 'back', name: 'Jetpack', icon: '🚀', blurb: 'Hold C to blast off. Fuel refills while you stand on something.' },
  balloons: { slot: 'back', name: 'Balloon Bunch', icon: '🎈', blurb: 'You fall gently while wearing it. Hold C to float upward.' },
  blower: { slot: 'back', name: 'Leaf Blower', icon: '🍃', blurb: 'Hold C to blast people and props away from you.' },
  magnet: { slot: 'back', name: 'Big Magnet', icon: '🧲', blurb: 'Hold C to pull props and people toward you.' },
  springs: { slot: 'feet', name: 'Spring Shoes', icon: '🦘', blurb: 'Jump much higher, and bounce when you land hard.' },
  skates: { slot: 'feet', name: 'Roller Skates', icon: '🛼', blurb: 'Zoom around 50% faster.' },
};
export const GEAR_IDS = Object.keys(GEAR);
const JET_FUEL = 2.6;

const _a = new THREE.Vector3(), _b = new THREE.Vector3();

function iconSprite(icon) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.font = '96px serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(icon, 64, 70);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  s.scale.setScalar(0.8);
  return s;
}

export class Gear {
  constructor(game, fun) {
    this.game = game; this.fun = fun;
    this.owned = new Set();
    this.back = null; this.feet = null;
    this.fuel = JET_FUEL;
    this.tick = 0;
    this.visual = { back: null, feetL: null, feetR: null, flames: [] };
    this.chests = [];
  }

  get speedMul() { return this.feet === 'skates' ? 1.5 : 1; }
  get jumpMul() { return this.feet === 'springs' ? 1.45 : 1; }

  // ---------------------------------------------------------------- chests in the world
  /** Called once the world-dependent spots (parks, secret room) are known. */
  placeChests(spots) {
    for (const [id, x, y, z, where] of spots) {
      const grp = new THREE.Group();
      const wood = getMat(0x8a5a2b, { roughness: 0.8 }), gold = getMat(0xffcc33, { metalness: 0.8, roughness: 0.3, emissive: 0x553300 });
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.45, 0.55), wood); base.position.y = 0.225; grp.add(base);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.275, 0.275, 0.8, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), wood); lid.position.y = 0.45; grp.add(lid);
      for (const sx of [-0.3, 0.3]) { const band = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.74, 0.58), gold); band.position.set(sx, 0.36, 0); grp.add(band); }
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.04, 6, 32).rotateX(Math.PI / 2), getMat(0xfff2a8, { emissive: 0xffd040, emissiveIntensity: 1.5 }));
      ring.position.y = 0.05; grp.add(ring);
      const icon = iconSprite(GEAR[id].icon); icon.position.y = 1.2; grp.add(icon);
      grp.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      grp.position.set(x, y, z);
      this.game.scene.add(grp);
      this.chests.push({ id, x, y, z, where, grp, icon, ring });
    }
    this._hideOwnedChests();
  }

  _hideOwnedChests() { for (const c of this.chests) c.grp.visible = !this.owned.has(c.id); }

  unlock(id, announce = true) {
    if (!GEAR[id] || this.owned.has(id)) return;
    this.owned.add(id);
    this._hideOwnedChests();
    if (announce) {
      const it = GEAR[id];
      this.game.discovery.banner('NEW GEAR', `${it.icon} ${it.name}`, 'feat');
      this.game.hud.toast(`${it.icon} ${it.name}: ${it.blurb} ${it.slot === 'back' ? '(Y to swap back gear)' : '(U to swap shoes)'}`, 'unlock');
      sfx.fanfare();
      this.equip(id);
    }
    if (GEAR_IDS.every((g) => this.owned.has(g))) this.game.discovery.award('gear_all');
    this.fun.changed();
  }

  equip(id) {
    if (id && !this.owned.has(id)) return;
    const slot = id ? GEAR[id].slot : null;
    if (slot === 'back' || id === null) this.back = id;
    if (slot === 'feet') this.feet = id;
    this.applyVisual();
    this.fun.changed();
    this.game.journal?.render();
  }

  unequip(slot) { if (slot === 'back') this.back = null; else this.feet = null; this.applyVisual(); this.fun.changed(); this.game.journal?.render(); }

  cycle(slot) {
    const list = [null, ...GEAR_IDS.filter((g) => GEAR[g].slot === slot && this.owned.has(g))];
    if (list.length < 2) { this.game.hud.toast(slot === 'back' ? 'No back gear yet. Look for glowing chests around town!' : 'No special shoes yet. Look for glowing chests around town!', ''); sfx.error(); return; }
    const cur = slot === 'back' ? this.back : this.feet;
    const next = list[(list.indexOf(cur) + 1) % list.length];
    if (slot === 'back') this.back = next; else this.feet = next;
    this.applyVisual();
    const it = next && GEAR[next];
    this.game.hud.toast(it ? `${it.icon} ${it.name}${it.slot === 'back' ? ' (hold C to use)' : ''}` : (slot === 'back' ? 'No back gear' : 'Normal shoes'), '');
    sfx.equip();
    this.fun.changed();
  }

  // ---------------------------------------------------------------- looks
  applyVisual() {
    const r = this.game.player.ragdoll, V = this.visual;
    for (const m of [V.back, V.feetL, V.feetR]) m?.parent?.remove(m);
    V.back = V.feetL = V.feetR = null; V.flames = [];
    if (this.back) { V.back = this._backMesh(this.back); r.parts.torso.mesh.add(V.back); }
    if (this.feet) {
      for (const side of ['L', 'R']) {
        const m = this._feetMesh(this.feet);
        r.parts['lLeg' + side].mesh.add(m);
        V['feet' + side] = m;
      }
    }
  }

  _backMesh(id) {
    const g = new THREE.Group();
    const add = (geo, color, x, y, z, opts = {}) => { const m = new THREE.Mesh(geo, getMat(color, opts)); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
    if (id === 'jetpack') {
      for (const s of [-1, 1]) {
        add(new THREE.CylinderGeometry(0.075, 0.075, 0.36, 12), 0xc0c4cc, s * 0.09, 0, -0.24, { metalness: 0.8, roughness: 0.3 });
        add(new THREE.ConeGeometry(0.075, 0.08, 12), 0xd7263d, s * 0.09, 0.22, -0.24);
        add(new THREE.CylinderGeometry(0.05, 0.07, 0.07, 10), 0x333333, s * 0.09, -0.21, -0.24);
        const flame = add(new THREE.ConeGeometry(0.06, 0.32, 10).rotateX(Math.PI), 0xffa020, s * 0.09, -0.4, -0.24, { emissive: 0xff6a00, emissiveIntensity: 3 });
        flame.visible = false; this.visual.flames.push(flame);
      }
      add(new THREE.BoxGeometry(0.1, 0.24, 0.06), 0x555555, 0, 0, -0.2);
    } else if (id === 'balloons') {
      const cols = [0xff4d6d, 0x4dabff, 0xffd84d, 0x7cff6b, 0xc77dff];
      cols.forEach((c, i) => {
        const a = (i / cols.length) * Math.PI * 2;
        const x = Math.cos(a) * 0.22, z = -0.25 + Math.sin(a) * 0.18, y = 1.15 + (i % 2) * 0.18;
        add(new THREE.SphereGeometry(0.17, 14, 10).scale(1, 1.18, 1), c, x, y, z, { roughness: 0.25 });
        add(new THREE.CylinderGeometry(0.004, 0.004, y - 0.1, 4), 0xffffff, x, (y + 0.1) / 2 - 0.1, z);   // string
      });
    } else if (id === 'blower') {
      add(new THREE.BoxGeometry(0.24, 0.28, 0.16), 0xe8b21c, 0, 0, -0.26);
      add(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 14).rotateX(Math.PI / 2), 0x333333, 0, 0, -0.35);
      const tube = add(new THREE.CylinderGeometry(0.045, 0.06, 0.7, 10), 0x2e7d32, -0.18, 0.18, -0.05);
      tube.rotation.set(-1.0, 0, 0.5);
    } else if (id === 'magnet') {
      add(new THREE.TorusGeometry(0.17, 0.065, 8, 20, Math.PI), 0xd7263d, 0, 0.05, -0.27, {});
      for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.065, 0.065, 0.12, 12), 0xd8dde3, s * 0.17, -0.03, -0.27, { metalness: 0.9, roughness: 0.25 });
    }
    return g;
  }

  _feetMesh(id) {
    const g = new THREE.Group();
    if (id === 'springs') {
      for (let k = 0; k < 4; k++) {
        const coil = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 14).rotateX(Math.PI / 2), getMat(0xc0c4cc, { metalness: 0.9, roughness: 0.25 }));
        coil.position.y = -0.24 - k * 0.035; g.add(coil);
      }
    } else if (id === 'skates') {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.24), getMat(0xff5aa5)); plate.position.set(0, -0.24, 0.03); g.add(plate);
      for (const z of [-0.07, 0.11]) for (const x of [-0.04, 0.04]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.025, 10).rotateZ(Math.PI / 2), getMat(0xfff27a, { roughness: 0.4 }));
        w.position.set(x, -0.275, z); g.add(w);
      }
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  // ---------------------------------------------------------------- per fixed step (after player.brain, before physics)
  step(dt) {
    const g = this.game, p = g.player, r = p.ragdoll;
    // chests
    if (++this.tick % 6 === 0 && !g.driving.active) {
      const pos = r.getPos(_a);
      for (const c of this.chests) if (!this.owned.has(c.id) && Math.hypot(c.x - pos.x, c.y + 0.6 - pos.y, c.z - pos.z) < 1.4 && !(c.locked && c.locked())) { this.unlock(c.id); this.fun.offerTip(); }
    }
    if (g.driving.active || g.paused) { this._flames(false); return; }
    const use = g.input.down('KeyC') && r.mode !== 'limp';
    if (r.grounded) this.fuel = Math.min(JET_FUEL, this.fuel + dt * 1.2);
    const parts = Object.keys(r.parts).filter((n) => !r.isSevered(n)).map((n) => r.parts[n].body);
    switch (this.back) {
      case 'jetpack': {
        const on = use && this.fuel > 0;
        this._flames(on);
        if (!on) break;
        this.fuel -= dt;
        const f = g.cam.flatForward(_b);
        for (const b of parts) { const v = b.linvel(); b.setLinvel({ x: v.x + f.x * 7 * dt, y: Math.min(9, v.y + 27 * dt), z: v.z + f.z * 7 * dt }, true); }
        r.grounded = false; r.groundDist = 99;
        if (this.tick % 5 === 0) { const pp = r.getPartPos('torso', _a); g.effects.bonk(pp.x, pp.y - 0.5, pp.z, 0.25, false); }
        if (this.tick % 12 === 0) sfx.whoosh();
        break;
      }
      case 'balloons': {
        if (r.mode === 'active') r.glide(use ? 99 : 2.6);
        if (use) for (const b of parts) { const v = b.linvel(); if (v.y < 3.5) b.setLinvel({ x: v.x, y: Math.min(3.5, v.y + 18 * dt), z: v.z }, true); }
        break;
      }
      case 'blower': if (use && this.tick % 6 === 0) this._blow(); break;
      case 'magnet': if (use && this.tick % 3 === 0) this._pull(dt * 3); break;
      default: break;
    }
  }

  _flames(on) { for (const f of this.visual.flames) { f.visible = on; if (on) f.scale.y = 0.8 + Math.random() * 0.6; } }

  _blow() {
    const g = this.game, p = g.player, r = p.ragdoll;
    const look = g.cam.forward(new THREE.Vector3());
    const me = r.getPartPos('torso', new THREE.Vector3());
    const c = me.clone().addScaledVector(look, 3.5);
    const seen = new Set();
    g.effects.bonk(me.x + look.x * 1.2, me.y + look.y * 1.2, me.z + look.z * 1.2, 0.35, false);
    if (this.tick % 18 === 0) sfx.whoosh();
    g.physics.overlapSphere(c.x, c.y, c.z, 3.8, (col) => {
      if (p.colliderHandles.has(col.handle)) return;
      const o = g.physics.ownerOf(col);
      if (!o) return;
      if (o.type === 'part') {
        if (seen.has(o.ragdoll)) return; seen.add(o.ragdoll);
        const d = o.ragdoll.getPos(_a).distanceTo(me);
        const dir = look.clone().setY(Math.max(0.35, look.y)).normalize();
        g.hitRagdoll(o.ragdoll, 'torso', dir, 4.5 * (1.2 - d / 8), d < 4 ? 0.35 : 0.15, p, 'blower');
      } else if (o.type === 'prop' && !seen.has(o.prop)) {
        seen.add(o.prop);
        const m = o.prop.body.mass(), k = Math.min(m, 120) * 2.2;
        o.prop.body.applyImpulse({ x: look.x * k, y: Math.max(0.3, look.y + 0.3) * k, z: look.z * k }, true);
        o.prop.taintT = g.time;
      }
    });
  }

  _pull(dt) {
    const g = this.game, p = g.player, r = p.ragdoll;
    const me = r.getPartPos('torso', new THREE.Vector3());
    const seen = new Set();
    if (this.tick % 24 === 0) { sfx.blip(140); }
    g.physics.overlapSphere(me.x, me.y, me.z, 14, (col) => {
      if (p.colliderHandles.has(col.handle)) return;
      const o = g.physics.ownerOf(col);
      if (!o) return;
      if (o.type === 'part') {
        const rd = o.ragdoll;
        if (seen.has(rd) || rd.owner?.isRemote) return; seen.add(rd);
        const at = rd.getPos(_a), d = at.distanceTo(me);
        if (d < 1.8) return;
        if (rd.mode !== 'limp') { rd.knockout(1.5); const npc = g.npcByRagdoll.get(rd); if (npc) { npc.lastHitByPlayer = g.time; npc.lastHitWeapon = 'magnet'; } }
        rd.limpTimer = Math.max(rd.limpTimer, 1);
        _b.subVectors(me, at).normalize();
        for (const n of Object.keys(rd.parts)) { const b = rd.parts[n].body, v = b.linvel(); b.setLinvel({ x: v.x + (_b.x * 9 - v.x) * 0.25, y: v.y + (_b.y * 9 + 2 - v.y) * 0.25, z: v.z + (_b.z * 9 - v.z) * 0.25 }, true); }
      } else if (o.type === 'prop' && !seen.has(o.prop)) {
        seen.add(o.prop);
        const b = o.prop.body; if (b.mass() > 200) return;
        const t = b.translation(); _a.set(t.x, t.y, t.z);
        const d = _a.distanceTo(me); if (d < 1.6) return;
        _b.subVectors(me, _a).normalize();
        const v = b.linvel();
        b.setLinvel({ x: v.x + (_b.x * 11 - v.x) * 0.3, y: v.y + (_b.y * 11 + 2 - v.y) * 0.3, z: v.z + (_b.z * 11 - v.z) * 0.3 }, true);
        o.prop.taintT = g.time;
      }
    });
  }

  /** Render frame: bob the chest icons. */
  update(t) {
    for (const c of this.chests) {
      if (!c.grp.visible) continue;
      c.icon.position.y = 1.2 + Math.sin(t * 2.4 + c.x) * 0.12;
      c.ring.rotation.y = t;
    }
  }

  serialize() { return { owned: [...this.owned], back: this.back, feet: this.feet }; }
  load(d) {
    if (!d) return;
    if (Array.isArray(d.owned)) d.owned.forEach((id) => GEAR[id] && this.owned.add(id));
    if (GEAR[d.back] && this.owned.has(d.back)) this.back = d.back;
    if (GEAR[d.feet] && this.owned.has(d.feet)) this.feet = d.feet;
    this._hideOwnedChests();
    this.applyVisual();
  }

  /** Where each chest lives (plus the lighthouse pier spot), worked out from the world. */
  static defaultSpots(world, secretRoom) {
    return [
      ['jetpack', LIGHTHOUSE_POS.x - 5, 0.05, LIGHTHOUSE_POS.z + 6, 'Out by the lighthouse'],
      ['balloons', 64, 0.05, 64, 'In Sunny Gardens'],
      ['blower', 34, 0.05, -64, 'In Pigeon Park'],
      ['springs', -64, 0.05, 36, 'In Lost Hat Park'],
      ...(secretRoom ? [['magnet', secretRoom.x, 0.05, secretRoom.z, 'Inside a room nobody talks about']] : []),
    ];
  }
}
