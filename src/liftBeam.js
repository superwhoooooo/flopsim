// Lift Beam (weapon, unlocked by knocking out 250 people). A purple beam from your hand:
//  - click someone (a townsperson, a friend in multiplayer) or a light prop: the beam grabs them and they hover,
//    limp, in front of you, following where you look
//  - click and HOLD: the beam charges (brighter the longer you hold, full after CHARGE_TIME)
//  - release: they're thrown forward where you're looking; longer hold = faster throw
// In multiplayer a friend's own game moves them (we send where to hover / how to fly), and as a joined player the
// host moves the townspeople (we send it the same way). Props just use the normal prop syncing.
import * as THREE from 'three';
import { sfx } from './audio.js';

const RANGE = 45;              // m the beam reaches
const HOLD_DIST = 3.4;         // m in front of you they hover...
const HOLD_UP = 0.9;           // ...this far above your middle
const HOVER_GRIP = 10;         // how snappily they follow the hover point
const HOVER_MAX = 22;          // m/s max speed while following
const LIGHT_PROP = 300;        // kg: props heavier than this can't be lifted
const CHARGE_TIME = 2;         // s of holding for a full-power throw
const THROW_MIN = 10, THROW_MAX = 50;   // m/s: a tap throws at THROW_MIN, a full charge at THROW_MAX
const NET_HZ = 20;             // hover updates per second sent to a friend / the host

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,240,255,1)'); g.addColorStop(0.3, 'rgba(200,120,255,0.8)'); g.addColorStop(1, 'rgba(120,40,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class LiftBeam {
  constructor(game) {
    this.game = game;
    this.held = null;        // { kind: 'npc' | 'friend' | 'prop', ... }
    this.charging = false;
    this.charge = 0;
    this.prevMouse = false;
    this.netT = 0;
    this.lifted = null;      // multiplayer: a friend is lifting US { hold: Vector3, t }
    // beam: a glowing outer tube + a bright core, additive so it glows
    const tube = (r, color, opacity) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 8, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      m.frustumCulled = false; m.visible = false; game.scene.add(m); return m;
    };
    this.outer = tube(0.09, 0x8a3dff, 0.45);
    this.core = tube(0.025, 0xf0d8ff, 0.95);
    const tex = glowTexture();
    const sprite = (s) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xc78cff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); sp.scale.setScalar(s); sp.visible = false; game.scene.add(sp); return sp; };
    this.handGlow = sprite(0.6);
    this.targetGlow = sprite(1.6);
  }

  get active() { return !!this.held; }

  // ---------- grabbing ----------
  _grab() {
    const g = this.game, p = g.player, r = p.ragdoll;
    if (g.driving.active || r.mode === 'limp') return;
    const cam = g.camera.position, look = g.cam.forward(new THREE.Vector3());
    const origin = cam.clone().addScaledVector(look, g.cam.curDist || 0);
    const h = g.physics.castRay(origin.x, origin.y, origin.z, look.x, look.y, look.z, RANGE, undefined, (c) => !p.colliderHandles.has(c.handle));
    const owner = h && g.physics.ownerOf(h.collider);
    if (!owner) { sfx.empty(); this._flash(origin.clone().addScaledVector(look, h ? h.toi : RANGE)); return; }
    if (owner.type === 'part' && owner.ragdoll !== r) {
      const rd = owner.ragdoll;
      if (rd.owner?.isRemote) this.held = { kind: 'friend', ragdoll: rd, remote: rd.owner };
      else this.held = { kind: 'npc', ragdoll: rd, npc: rd.owner };
      // knock them limp (forwarded to a friend / the host as needed)
      g.hitRagdoll(rd, owner.part, look.clone().negate().setY(0.3).normalize(), 3, 1.5, p, 'lift');
    } else if (owner.type === 'prop' && owner.prop.body.mass() < LIGHT_PROP) {
      this.held = { kind: 'prop', prop: owner.prop };
    } else { sfx.empty(); return; }
    sfx.equip(); sfx.web?.();
    this.charging = false; this.charge = 0;
  }

  /** Let go without throwing. */
  drop() {
    const h = this.held;
    this.held = null; this.charging = false; this.charge = 0;
    if (h?.kind === 'friend') this.game.net?.liftFriend(h.remote, null);
    if (h?.kind === 'npc' && this.game.net?.isClient) this.game.net.liftNpc(h.npc, null);
  }

  _throw() {
    const g = this.game, h = this.held;
    if (!h) return;
    const look = g.cam.forward(new THREE.Vector3());
    const speed = THROW_MIN + (THROW_MAX - THROW_MIN) * Math.min(1, this.charge / CHARGE_TIME);
    const vel = { x: look.x * speed, y: look.y * speed + 2, z: look.z * speed };
    if (h.kind === 'friend') g.net?.flingFriend(h.remote, vel);
    else if (h.kind === 'npc' && g.net?.isClient) g.net.flingNpc(h.npc, vel);
    else {
      for (const b of this._bodies(h)) b.setLinvel(vel, true);
      // it's a projectile now: it hurts whoever it smashes into (a joined player's props are flown by the host)
      if (h.kind === 'prop' && h.prop.proxy) g.net?.thrownProp(h.prop);
      else g.thrown?.add(h.kind === 'prop' ? { prop: h.prop, by: g.player } : { ragdoll: h.ragdoll, by: g.player });
    }
    if (h.kind === 'npc' && h.npc && !g.net?.isClient) { h.ragdoll.limpTimer = Math.max(h.ragdoll.limpTimer, 3); h.npc.lastHitByPlayer = g.time; }
    sfx.whoosh(); sfx.swing(true);
    g.cam.shake = Math.max(g.cam.shake, 0.15 + 0.4 * Math.min(1, this.charge / CHARGE_TIME));
    this.held = null; this.charging = false; this.charge = 0;
  }

  _bodies(h) {
    if (h.kind === 'prop') return [h.prop.body];
    const rd = h.ragdoll;
    return Object.keys(rd.parts).filter((n) => !rd.isSevered(n)).map((n) => rd.parts[n].body);
  }
  _targetPos(h, out) {
    if (h.kind === 'prop') { const t = h.prop.body.translation(); return out.set(t.x, t.y, t.z); }
    return h.ragdoll.getPartPos('torso', out);
  }
  _holdPoint(out) {
    const g = this.game, me = g.player.ragdoll.getPos(_c), look = g.cam.forward(_b);
    return out.copy(me).addScaledVector(look, HOLD_DIST).setY(Math.max(0.8, me.y + HOLD_UP + look.y * HOLD_DIST * 0.5));
  }

  /** Move bodies toward a point (they hover there). */
  static hover(bodies, from, to, dt) {
    _a.subVectors(to, from);
    const dist = _a.length(), speed = Math.min(HOVER_MAX, dist * HOVER_GRIP);
    _a.divideScalar(dist || 1);
    const k = 1 - Math.exp(-12 * dt);
    for (const b of bodies) {
      const v = b.linvel();
      b.setLinvel({ x: v.x + (_a.x * speed - v.x) * k, y: v.y + (_a.y * speed + 0.2 - v.y) * k, z: v.z + (_a.z * speed - v.z) * k }, true);   // (+0.2 ~ holds them up against gravity)
    }
  }

  /** Fixed step, before physics.step. */
  step(dt) {
    const g = this.game, p = g.player, input = g.input;
    // multiplayer: a friend is lifting us
    if (this.lifted) {
      const r = p.ragdoll;
      if (g.time - this.lifted.t > 0.5) this.lifted = null;   // they stopped sending: we drop
      else {
        r.limpTimer = Math.max(r.limpTimer, 1);
        LiftBeam.hover(Object.keys(r.parts).map((n) => r.parts[n].body), r.getPos(_b), this.lifted.hold, dt);
      }
    }
    // multiplayer host: joined players lifting townspeople
    if (!g.net?.isClient) for (const n of g.npcs) if (n.liftHold) {
      if (g.time - n.liftHold.t > 0.5) { n.liftHold = null; continue; }
      const rd = n.ragdoll; rd.limpTimer = Math.max(rd.limpTimer, 1);
      LiftBeam.hover(Object.keys(rd.parts).filter((k) => !rd.isSevered(k)).map((k) => rd.parts[k].body), rd.getPartPos('torso', _b), n.liftHold.p, dt);
    }

    const mouse = input.mouseHeld && !g.wheel.open;
    const pressed = mouse && !this.prevMouse, released = !mouse && this.prevMouse;
    this.prevMouse = mouse;
    if (p.weaponId !== 'lift' || g.driving.active || p.ragdoll.mode === 'limp' || g.paused) { if (this.held) this.drop(); return; }
    if (pressed) { if (this.held) this.charging = true; else this._grab(); }
    if (!this.held) return;
    if (this.charging) {
      this.charge += dt;
      if (released) { this._throw(); return; }
    }
    // keep them hovering in front of us
    const h = this.held, hold = this._holdPoint(new THREE.Vector3());
    if (h.kind !== 'prop' && (h.ragdoll.owner?.gone)) { this.drop(); return; }
    const pos = this._targetPos(h, new THREE.Vector3());
    if (pos.distanceTo(g.player.ragdoll.getPos(_c)) > RANGE * 1.4) { this.drop(); return; }
    this.netT -= dt;
    const sendNow = this.netT <= 0;
    if (sendNow) this.netT = 1 / NET_HZ;
    if (h.kind === 'friend') { if (sendNow) g.net?.liftFriend(h.remote, hold); }
    else if (h.kind === 'npc' && g.net?.isClient) { if (sendNow) g.net.liftNpc(h.npc, hold); }
    else {
      if (h.kind === 'npc') h.ragdoll.limpTimer = Math.max(h.ragdoll.limpTimer, 1);
      LiftBeam.hover(this._bodies(h), pos, hold, dt);
    }
  }

  /** Before the player animates: hold the beam arm out toward them. */
  pose() {
    if (this.held && this.game.player.weaponId === 'lift') this.game.player.ragdoll.pose.armR = { swing: -1.55, elbow: -0.05, side: 0.05, gain: 3 };
  }

  /** A short purple flash for a miss. */
  _flash(at) { this._miss = { at: at.clone(), t: 0.15 }; }

  /** Render frame: draw the beam. */
  sync(dt = 0.016) {
    const p = this.game.player;
    const m = p.weaponMeshes.lift;
    const hand = (m && m.visible) ? (m.updateWorldMatrix(true, false), m.localToWorld(_a.copy(m.userData.muzzle))) : p.ragdoll.getPartPos('lArmR', _a);
    let tip = null;
    if (this.held) tip = this._targetPos(this.held, _b);
    else if (this._miss && (this._miss.t -= dt) > 0) tip = _b.copy(this._miss.at);
    const on = !!tip;
    this.outer.visible = this.core.visible = this.targetGlow.visible = on;
    this.handGlow.visible = on || (p.weaponId === 'lift' && !!m?.visible);
    this.handGlow.position.copy(hand);
    if (!on) { this.handGlow.scale.setScalar(0.35); return; }
    const t = performance.now() / 1000, c = Math.min(1, this.charge / CHARGE_TIME);
    const len = hand.distanceTo(tip);
    for (const beam of [this.outer, this.core]) { beam.position.copy(hand); beam.lookAt(tip); beam.scale.set(1, 1, Math.max(0.01, len)); }
    const pulse = 1 + Math.sin(t * 18) * 0.15;
    const thick = (1 + c * 1.6) * pulse;   // fatter and brighter while charging
    this.outer.scale.x = this.outer.scale.y = thick;
    this.core.scale.x = this.core.scale.y = 1 + c;
    this.outer.material.opacity = 0.35 + 0.35 * c;
    this.handGlow.scale.setScalar((0.6 + c * 0.9) * pulse);
    this.targetGlow.position.copy(tip);
    this.targetGlow.scale.setScalar((1.6 + c * 1.2) * pulse);
    this.targetGlow.material.rotation = t * 2;
  }
}
