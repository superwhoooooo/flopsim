// Grapple Hook (weapon, unlocked by web swinging 1000 m). A snap-hook style traversal tool:
//  - click: fire a hook exactly where the crosshair points
//  - hits a wall / the ground / something heavy (a car): the cable pulls you toward that point with a force that
//    keeps growing. Your momentum carries on: going the other way, it slows you, stops you, then hauls you back;
//    from a standstill it just pulls you there, speeding up. It lets go when you arrive.
//    Click again or press Space to let go early (you keep your momentum, Space adds a hop).
//  - hits a person or a light prop (crate, barrel, melon...): they're reeled in to you and, as they arrive, flung up
//    over your head and out behind you. Click to let go early.
import * as THREE from 'three';
import { sfx } from './audio.js';

const RANGE = 70;             // m
const HOOK_SPEED = 120;       // m/s the hook flies out
const PULL_SPEED = 30;        // m/s top speed toward the hook (the pull only adds speed up to this)
const PULL_ACCEL_START = 28;  // m/s² pull the moment the hook bites...
const PULL_ACCEL_GROW = 70;   // ...growing by this much per second...
const PULL_ACCEL_MAX = 75;    // ...up to this
const GRAVITY_HELP = 9;       // m/s² of gravity the cable takes off you while pulling (so pulls up a wall work)
const SIDE_DRAG = 1.3;        // how fast sideways drift fades, so you curve in rather than orbit the hook forever
const LAUNCH_DIST = 3;        // m: this close, the hook lets go and flings them...
const LAUNCH_SPEED = 16;      // ...behind you this fast (m/s)...
const LAUNCH_UP = 7;          // ...with this much upward kick, so they arc over your head
const ARRIVE_DIST = 2.2;      // m: let go this close to the hook
const MAX_PULL_TIME = 3.5;    // s: give up pulling yourself after this long (stuck on something)
const REEL_SPEED = 20;        // m/s people / props get reeled in
const LIGHT_PROP = 150;       // kg: lighter props get reeled in, heavier ones pull you to them

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion();

export class Grapple {
  constructor(game) {
    this.game = game;
    this.state = null;   // null | { kind: 'flying' | 'self' | 'person' | 'prop', ... }
    const rope = new THREE.MeshStandardMaterial({ color: 0x3a3530, roughness: 0.9 });
    this.line = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1, 5).translate(0, 0.5, 0).rotateX(Math.PI / 2), rope);
    this.line.visible = false; this.line.frustumCulled = false;
    game.scene.add(this.line);
    // the hook: a short shank with three curved prongs
    const metal = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, metalness: 0.85, roughness: 0.3 });
    this.hook = new THREE.Group();
    this.hook.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 8).rotateX(Math.PI / 2), metal));
    for (let k = 0; k < 3; k++) {
      const prong = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.016, 5, 10, Math.PI * 0.9), metal);
      prong.rotation.set(0, (k / 3) * Math.PI * 2, Math.PI / 2);
      prong.position.z = 0.09;
      this.hook.add(prong);
    }
    this.hook.visible = false;
    game.scene.add(this.hook);
  }

  get active() { return !!this.state; }

  /** Click: fire, or let go if already hooked. */
  fire() {
    const g = this.game, r = g.player.ragdoll;
    if (this.state && this.state.kind !== 'flying') { this.release(true); return; }
    if (this.state || g.driving.active || r.mode === 'limp') return;
    const cam = g.camera.position, look = g.cam.forward(new THREE.Vector3());
    const origin = cam.clone().addScaledVector(look, g.cam.curDist || 0);
    const own = g.player.colliderHandles;
    const h = g.physics.castRay(origin.x, origin.y, origin.z, look.x, look.y, look.z, RANGE, undefined, (c) => !own.has(c.handle));
    const from = this._muzzle(new THREE.Vector3());
    const target = h ? new THREE.Vector3(h.x, h.y, h.z) : origin.clone().addScaledVector(look, RANGE * 0.7);
    this.state = { kind: 'flying', from, target, dir: target.clone().sub(from).normalize(), dist: from.distanceTo(target), travelled: 0, hit: h ? h.collider : null, t: 0 };
    sfx.gun(); sfx.web();
    g.cam.shake = Math.max(g.cam.shake, 0.15);
  }

  /** Let go. `hop`: a little boost (letting go by choice), keeping your momentum. */
  release(hop = false) {
    const s = this.state;
    this.state = null;
    this.line.visible = false; this.hook.visible = false;
    if (!s || !hop || s.kind !== 'self') return;
    const r = this.game.player.ragdoll;
    for (const k of Object.keys(r.parts)) {
      const b = r.parts[k].body, v = b.linvel();
      b.setLinvel({ x: v.x, y: Math.max(v.y, 0) + 5, z: v.z }, true);
    }
    sfx.whoosh();
  }

  _muzzle(out) {
    const p = this.game.player, m = p.weaponMeshes.grapple;
    if (!m || !m.visible) return p.ragdoll.getPartPos('lArmR', out);
    m.updateWorldMatrix(true, false);
    return m.localToWorld(out.copy(m.userData.muzzle));
  }

  /** The hook arrived: decide what it does based on what it hit. */
  _latch(s) {
    const g = this.game, r = g.player.ragdoll;
    if (!s.hit) { sfx.empty(); this.release(); return; }
    const owner = g.physics.ownerOf(s.hit);
    const body = s.hit.parent();
    sfx.bonk(0.5);
    if (owner?.type === 'part' && owner.ragdoll !== r) {   // a person: knock them over and reel them in
      const p = r.getPos(_a), tp = owner.ragdoll.getPartPos(owner.part, _b);
      _d.subVectors(p, tp).setY(0).normalize(); _d.y = 0.5;
      g.hitRagdoll(owner.ragdoll, owner.part, _d.clone().normalize(), 5, 1.5, g.player, 'grapple');
      this.state = { kind: 'person', ragdoll: owner.ragdoll, part: owner.part, t: 0 };
      return;
    }
    if (owner?.type === 'prop' && body.mass() < LIGHT_PROP) {   // light prop: reel it in
      this.state = { kind: 'prop', body, local: this._local(body, s.target), t: 0 };
      return;
    }
    // wall / ground / heavy thing: yank yourself to it (following it if it moves)
    this.state = { kind: 'self', anchor: s.target.clone(), body: body && !body.isFixed() ? body : null, local: body && !body.isFixed() ? this._local(body, s.target) : null, t: 0 };
    r.grounded = false; r.groundDist = 99;
  }

  _local(body, worldPoint) {
    const t = body.translation(), q = body.rotation();
    return worldPoint.clone().sub(_b.set(t.x, t.y, t.z)).applyQuaternion(_q.set(q.x, q.y, q.z, q.w).invert());
  }
  _world(body, local, out) {
    const t = body.translation(), q = body.rotation();
    return out.copy(local).applyQuaternion(_q.set(q.x, q.y, q.z, q.w)).add(_b.set(t.x, t.y, t.z));
  }

  /** Fixed step, after player.brain and before physics.step. */
  step(dt) {
    const g = this.game;
    const s = this.state;
    if (!s) return;
    const p = g.player, r = p.ragdoll;
    if (g.driving.active || r.mode === 'limp' || p.weaponId !== 'grapple') { this.release(); return; }
    s.t += dt;
    if (s.kind === 'flying') {
      s.travelled += HOOK_SPEED * dt;
      if (s.travelled >= s.dist) this._latch(s);
      return;
    }
    if (s.kind === 'self' && s.t > MAX_PULL_TIME) { this.release(); return; }
    const me = r.getPos(_a);
    try {
      if (s.kind === 'self') {
        if (s.body) this._world(s.body, s.local, s.anchor);
        _d.subVectors(s.anchor, me);
        const dist = _d.length();
        if (dist < ARRIVE_DIST) { this.release(true); return; }
        if (g.input.down('Space')) { this.release(true); return; }   // jump off mid-pull
        _d.divideScalar(dist);
        // a force toward the hook that keeps growing: it adds speed toward the hook (up to a cap) on top of
        // whatever you were already doing, so momentum away from it gets braked first, then reversed
        const accel = Math.min(PULL_ACCEL_MAX, PULL_ACCEL_START + PULL_ACCEL_GROW * s.t);
        const capToward = Math.min(PULL_SPEED, Math.max(6, dist * 5));   // ease off as you arrive
        const side = 1 - Math.exp(-SIDE_DRAG * dt);
        for (const n of Object.keys(r.parts)) {
          const b = r.parts[n].body, v = b.linvel();
          let vx = v.x, vy = v.y + GRAVITY_HELP * dt, vz = v.z;
          const toward = vx * _d.x + vy * _d.y + vz * _d.z;
          const add = Math.max(0, Math.min(accel * dt, capToward - toward));
          vx += _d.x * add; vy += _d.y * add; vz += _d.z * add;
          const along = vx * _d.x + vy * _d.y + vz * _d.z;          // trim sideways drift a little
          vx -= (vx - _d.x * along) * side; vy -= (vy - _d.y * along) * side; vz -= (vz - _d.z * along) * side;
          b.setLinvel({ x: vx, y: vy, z: vz }, true);
        }
        const pv = r.parts.pelvis.body.linvel();
        r.desired.x = pv.x; r.desired.z = pv.z;   // don't let air steering brake the pull
        r.grounded = false;
        r.pose.armR = { swing: -1.6, elbow: -0.05, side: 0.05, gain: 3 };
        return;
      }
      // reeling something in: a person's ragdoll, or a light prop. Lets go when it reaches you.
      const bodies = s.kind === 'person' ? Object.keys(s.ragdoll.parts).filter((n) => !s.ragdoll.isSevered(n)).map((n) => s.ragdoll.parts[n].body) : [s.body];
      if (s.kind === 'person') s.ragdoll.limpTimer = Math.max(s.ragdoll.limpTimer, 1.2);   // stay floppy while dragged
      const target = s.kind === 'person' ? s.ragdoll.getPartPos('pelvis', _b) : _b.copy(s.body.translation());
      _d.subVectors(me, target);
      const dist = _d.length();
      if (dist < LAUNCH_DIST) {   // arrived: fling them up over you and out behind
        const f = g.cam.flatForward(new THREE.Vector3());
        for (const b of bodies) b.setLinvel({ x: -f.x * LAUNCH_SPEED, y: LAUNCH_UP, z: -f.z * LAUNCH_SPEED }, true);
        if (s.kind === 'prop' && s.body && g.net?.isClient) { const pr = g.world.props.find((q) => q.body === s.body); if (pr?.proxy) g.net.thrownProp(pr); }
        else g.thrown?.add(s.kind === 'person' ? { ragdoll: s.ragdoll, by: p } : { prop: g.world.props.find((q) => q.body === s.body), by: p });   // it hurts what it hits
        if (s.kind === 'person') s.ragdoll.limpTimer = Math.max(s.ragdoll.limpTimer, 2.5);
        sfx.whoosh();
        this.release();
        return;
      }
      _d.divideScalar(dist);
      const k = 1 - Math.exp(-8 * dt);
      const speed = Math.min(REEL_SPEED, dist * 5);
      for (const b of bodies) {
        const v = b.linvel();
        b.setLinvel({ x: v.x + (_d.x * speed - v.x) * k, y: v.y + (_d.y * speed + 1.5 - v.y) * k, z: v.z + (_d.z * speed - v.z) * k }, true);
      }
      r.pose.armR = { swing: -1.4, elbow: -0.4, side: 0.05, gain: 3 };
    } catch (e) { this.release(); }   // whatever we hooked was removed from the world
  }

  /** Render frame: draw the cable from the launcher to the hook. */
  sync() {
    const s = this.state;
    if (!s) return;
    const from = this._muzzle(_a);
    let tip;
    if (s.kind === 'flying') tip = _b.copy(s.from).addScaledVector(s.dir, Math.min(s.travelled, s.dist));
    else if (s.kind === 'self') tip = _b.copy(s.anchor);
    else if (s.kind === 'person') tip = s.ragdoll.getPartPos(s.part, _b);
    else tip = this._world(s.body, s.local, _b);
    const len = from.distanceTo(tip);
    this.line.position.copy(from); this.line.lookAt(tip); this.line.scale.set(1, 1, Math.max(0.01, len));
    this.line.visible = true;
    const ahead = _d.subVectors(tip, from).normalize().add(tip);   // point the hook along the cable
    this.hook.position.copy(tip); this.hook.lookAt(ahead);
    this.hook.visible = true;
  }
}
