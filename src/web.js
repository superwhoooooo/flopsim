// Web shooter (Spider Suit skin): hold Q or right mouse to shoot a web exactly where the crosshair points.
// It flies out, sticks where it lands (walls, ground, cars, crates, people) and you swing / get pulled on it.
// Release to let go (with a little fling). W pumps the swing, hold Space to pull yourself in, hold Shift to lower
// yourself down (the web lets out at 10 m/s). Otherwise the web stays exactly its length - it never stretches.
// Sticking to something that moves (a car, a crate, a person) keeps the web attached to it, and yanks people over.
import * as THREE from 'three';
import { groups, G } from './physics.js';
import { sfx } from './audio.js';

const RANGE = 110;            // m: how far the web reaches
const WEB_SPEED = 140;        // m/s the web shot flies out
const PUMP = 9;               // m/s² along the camera direction while holding W
const REEL = 26;              // m/s rope shortening while holding Space (the pull)
const REEL_MAX_PULL = 90;     // m/s² how hard the rope can haul you while you hold Space (normal swinging: MAX_PULL)
const LET_OUT = 10;           // m/s the web lengthens while holding Shift (lower yourself down)
const REEL_TUG = 7;           // m/s yank toward the anchor when you press Space...
const REEL_LIFT = 6;          // ...plus this hop if you're standing on the ground
const MAX_SPEED = 42;
const ROPE_K = 18;            // how hard an over-stretched rope pulls back
const MAX_PULL = 38;          // m/s² cap on that pull (a quick zip, not a teleport)

// Wendell Webb, the Spider Suit's secret identity, never stops talking.
const QUIPS = {
  suitUp: [
    'My name is Wendell Webb. I got bitten by a radioactive spider. Then I bit it back.',
    'Hi! Wendell Webb. Freelance photographer. Definitely NOT the guy in the spider suit.',
    'Suit on. Snacks packed. Let us swing!',
    'Eight eyes and I STILL cannot find my keys.',
  ],
  fire: [
    'Thwip!', 'THWIP THWIP!', 'Wheeee!', 'Web ya later!', 'I should really get a car.',
    'Is this sanitary? Do not answer that.', 'My mum thinks I am at band practice!',
    'Look, no hands! ...Wait, I need the hands.', 'Spider sense says: DUCK. Golden duck?',
    'I am not scared of heights. I am scared of LANDING.', 'Do I get frequent flyer miles for this?',
  ],
  miss: ['Uh... where is a building when you need one?', 'Nothing to stick to! Flat cities are my weakness.', 'Thwip...? Thwip? THWIP?!'],
  fall: ['That was on purpose!', 'I meant to do that.', 'Ow. My spider sense was on lunch break.', 'Still cool. Still very cool.'],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const NPC_GASPS = ['Is that Wendell Webb?!', 'A giant spider person!', 'Nice pajamas!', 'He is swinging on SNOT?!', 'Can I get an autograph?!', 'Somebody call pest control!'];

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _f = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class WebShooter {
  constructor(game) {
    this.game = game;
    this.anchor = null;       // THREE.Vector3 while attached
    this.stuckTo = null;      // { body, local, ragdoll } when stuck to something that moves
    this.shot = null;         // the web flying out: { dir, dist, travelled, hit }
    this.len = 0;
    this.wasHeld = false;
    this.cooldown = 0;
    this.quipAt = 0;          // game time when Wendell may talk again
    const mat = new THREE.MeshBasicMaterial({ color: 0xf4f4f0, transparent: true, opacity: 0.9 });
    this.line = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1, 5).translate(0, 0.5, 0).rotateX(Math.PI / 2), mat);
    this.line.visible = false;
    this.line.frustumCulled = false;
    game.scene.add(this.line);
    this.blob = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), mat);
    this.blob.visible = false;
    game.scene.add(this.blob);
  }

  get active() { return !!this.anchor; }

  /** Exactly where the crosshair points: a ray from the camera (skipping ahead of it in third person, like the guns). */
  _aim() {
    const g = this.game, cam = g.camera.position, look = g.cam.forward(new THREE.Vector3());
    const origin = cam.clone().addScaledVector(look, g.cam.curDist || 0);
    const own = g.player.colliderHandles;
    const h = g.physics.castRay(origin.x, origin.y, origin.z, look.x, look.y, look.z, RANGE, undefined, (c) => !own.has(c.handle));
    return { origin, look, hit: h ? { point: new THREE.Vector3(h.x, h.y, h.z), collider: h.collider } : null };
  }

  fire() {
    const g = this.game, r = g.player.ragdoll;
    if (g.driving.active || r.mode === 'limp' || this.cooldown > 0) return;
    this.cooldown = 0.25;
    const { origin, look, hit } = this._aim();
    const hand = r.getPartPos('lArmR', new THREE.Vector3());
    const target = hit ? hit.point : origin.clone().addScaledVector(look, RANGE * 0.6);   // a miss falls short
    this.shot = { dir: target.clone().sub(hand).normalize(), target, dist: hand.distanceTo(target), travelled: 0, hit };
    r.pose.armR = { swing: -2.4, elbow: -0.05, side: 0.1, gain: 3 };
    sfx.web();
  }

  /** The web shot arrived: stick to whatever it hit. */
  _stick(hit) {
    const g = this.game, r = g.player.ragdoll;
    const p = r.getPos(_a);
    const at = hit.point;
    this.anchor = at.clone();
    this.stuckTo = null;
    // something that moves? stay attached to it
    const body = hit.collider.parent();
    if (body && !body.isFixed()) {
      const t = body.translation(), q = body.rotation();
      const inv = new THREE.Quaternion(q.x, q.y, q.z, q.w).invert();
      const owner = g.physics.ownerOf(hit.collider);
      this.stuckTo = { body, local: at.clone().sub(_b.set(t.x, t.y, t.z)).applyQuaternion(inv), ragdoll: owner?.type === 'part' ? owner.ragdoll : null };
      if (this.stuckTo.ragdoll && this.stuckTo.ragdoll !== r) {   // GET OVER HERE: yank them off their feet
        _d.subVectors(p, at).setY(0).normalize(); _d.y = 0.4;
        g.hitRagdoll(this.stuckTo.ragdoll, owner.part, _d.clone().normalize(), 6, 1.2, g.player, 'web');
      }
    }
    // the rope is exactly as long as the distance when it sticks: it holds you there (and you swing when you
    // run or fall) rather than pulling you in. Space reels you in when you want.
    this.len = Math.max(2.5, p.distanceTo(at));
    this.quip('fire', 0.35);
    if (Math.random() < 0.3) this._npcGasp();
  }

  /** Wendell says something (with chance `p`), but not more often than every few seconds. */
  quip(kind, p = 1) {
    const g = this.game;
    if (g.time < this.quipAt || Math.random() > p) return;
    this.quipAt = g.time + 4;
    g.speech.say(g.player.ragdoll.anchor, pick(QUIPS[kind]), kind === 'suitUp' ? 4 : 2.4, 'player');
  }

  /** A nearby townsperson notices the spider in the sky. */
  _npcGasp() {
    const g = this.game, p = g.player.ragdoll.getPos(_b);
    const n = g.npcs.find((n) => !n.dormant && !n.knockedOut() && n.pos.distanceTo(p) < 18);
    if (!n) return;
    g.timers.push({ t: 0.8, fn: () => { n.say(pick(NPC_GASPS), 2.5); if (Math.random() < 0.5) n.react('flee'); } });
  }

  release(fling = true) {
    this.shot = null;
    if (!this.anchor) { this.line.visible = false; return; }
    this.anchor = null;
    this.stuckTo = null;
    this.line.visible = false;
    this.blob.visible = false;
    const r = this.game.player.ragdoll;
    if (fling && r.mode !== 'limp') {
      for (const k of Object.keys(r.parts)) {
        const b = r.parts[k].body, v = b.linvel();
        b.setLinvel({ x: v.x * 1.08, y: Math.max(v.y, 0) + 4.5, z: v.z * 1.08 }, true);
      }
      sfx.whoosh();
    }
  }

  /** Fixed step, after player.brain and before physics.step. */
  step(dt) {
    const g = this.game, p = g.player, r = p.ragdoll, input = g.input;
    this.cooldown = Math.max(0, this.cooldown - dt);
    const isSpider = p.formId === 'spider';
    const held = isSpider && !g.paused && (input.down('KeyQ') || input.rightHeld);
    if (held && !this.wasHeld) this.fire();
    if (!held && this.wasHeld) this.release();
    this.wasHeld = held;
    if (this.shot) {   // web flying out
      const s = this.shot;
      s.travelled += WEB_SPEED * dt;
      r.pose.armR = { swing: -2.4, elbow: -0.05, side: 0.1, gain: 3 };
      if (s.travelled >= s.dist) {
        this.shot = null;
        if (s.hit) this._stick(s.hit);
        else { sfx.empty(); this.quip('miss', 1); this.line.visible = false; }
      }
      return;
    }
    if (!this.anchor) return;
    if (this.stuckTo) {   // follow whatever we're stuck to (if it was removed from the world, let go)
      try {
        const b = this.stuckTo.body, t = b.translation(), q = b.rotation();
        this.anchor.copy(this.stuckTo.local).applyQuaternion(_q.set(q.x, q.y, q.z, q.w)).add(_b.set(t.x, t.y, t.z));
      } catch (e) { this.release(false); return; }
    }
    if (!isSpider || g.driving.active || r.mode === 'limp') { if (r.mode === 'limp' && isSpider) { this.quipAt = 0; this.quip('fall', 0.7); } this.release(false); return; }

    const pos = r.getPos(_a);
    _d.subVectors(pos, this.anchor);
    const dist = _d.length();
    if (dist > RANGE * 1.3) { this.release(false); return; }
    _d.divideScalar(dist || 1);   // unit vector anchor -> you
    // hold Space to pull yourself in: a yank toward the anchor when you press it, then the rope reels in
    const reel = input.down('Space');
    if (reel && !this.reeling) {
      const lift = r.grounded ? REEL_LIFT : 0;
      for (const k of Object.keys(r.parts)) {
        const b = r.parts[k].body, v = b.linvel();
        b.setLinvel({ x: v.x - _d.x * REEL_TUG, y: v.y - _d.y * REEL_TUG + lift, z: v.z - _d.z * REEL_TUG }, true);
      }
      r.grounded = false; r.groundDist = 99;
    }
    this.reeling = reel;
    if (reel) this.len = Math.max(2.5, this.len - REEL * dt);
    else if ((input.down('ShiftLeft') || input.down('ShiftRight')) && !g.touch?.stickSprint) this.len = Math.min(RANGE * 1.2, this.len + LET_OUT * dt);   // hold Shift: let the web out (not the phone stick's sprint-push)
    if (r.grounded && dist < this.len) this.len = Math.max(this.len, dist);   // walking around under it: stay slack

    // pump along the camera direction while holding W
    const pump = input.down('KeyW') ? g.cam.flatForward(_f).multiplyScalar(PUMP * dt) : _f.set(0, 0, 0);
    const stretch = dist - this.len;
    // a taut web tugs whatever it's stuck to toward you too (people get dragged; cars barely budge)
    if (this.stuckTo && stretch > 0) {
      const b = this.stuckTo.body, m = b.mass();
      const k = Math.min(stretch * ROPE_K, MAX_PULL) * dt * Math.min(m, 40);
      b.applyImpulse({ x: _d.x * k, y: _d.y * k, z: _d.z * k }, true);
    }
    for (const k of Object.keys(r.parts)) {
      const b = r.parts[k].body, v = b.linvel();
      let vx = v.x + pump.x, vy = v.y, vz = v.z + pump.z;
      if (stretch > 0) {
        const out = vx * _d.x + vy * _d.y + vz * _d.z;          // speed away from the anchor
        if (out > 0) { vx -= _d.x * out; vy -= _d.y * out; vz -= _d.z * out; }
        const pull = Math.min(stretch * ROPE_K * dt, (reel ? REEL_MAX_PULL : MAX_PULL) * dt);
        vx -= _d.x * pull; vy -= _d.y * pull; vz -= _d.z * pull;
      }
      const sp = Math.hypot(vx, vy, vz);
      if (sp > MAX_SPEED) { const s = MAX_SPEED / sp; vx *= s; vy *= s; vz *= s; }
      b.setLinvel({ x: vx, y: vy, z: vz }, true);
    }
    // keep the ragdoll's air steering from braking the swing: "desired" = where we're already going
    const pv = r.parts.pelvis.body.linvel();
    r.desired.x = pv.x; r.desired.z = pv.z;
    if (Math.hypot(pv.x, pv.z) > 1) r.targetYaw = Math.atan2(pv.x, pv.z);
    // web arm reaches up the line
    r.pose.armR = { swing: -2.9, elbow: -0.1, side: 0.2, gain: 3 };
  }

  /** Right after the physics step: the web never stretches. If we ended up even slightly past its length, put us
   *  back on it and drop any speed outward. (It only gets shorter when you hold Space.) */
  postStep() {
    if (!this.anchor) return;
    const r = this.game.player.ragdoll;
    if (r.mode === 'limp') return;
    const pos = r.getPos(_a);
    _d.subVectors(pos, this.anchor);
    const dist = _d.length();
    const over = dist - this.len;
    if (over <= 0) return;
    _d.divideScalar(dist || 1);
    for (const k of Object.keys(r.parts)) {
      const b = r.parts[k].body, t = b.translation(), v = b.linvel();
      b.setTranslation({ x: t.x - _d.x * over, y: t.y - _d.y * over, z: t.z - _d.z * over }, true);
      const out = v.x * _d.x + v.y * _d.y + v.z * _d.z;
      if (out > 0) b.setLinvel({ x: v.x - _d.x * out, y: v.y - _d.y * out, z: v.z - _d.z * out }, true);
    }
  }

  /** Render frame: stretch the web from the hand to the anchor. */
  sync() {
    const hand = this.game.player.ragdoll.getPartPos('lArmR', _b);
    if (this.shot) {   // the web shot flying out toward the target
      const s = this.shot, tip = _d.copy(hand).addScaledVector(s.dir, Math.min(s.travelled, s.dist));
      this.line.position.copy(hand); this.line.lookAt(tip);
      this.line.scale.set(1, 1, Math.max(0.01, hand.distanceTo(tip)));
      this.line.visible = true;
      this.blob.position.copy(tip); this.blob.visible = true;
      return;
    }
    if (!this.anchor) return;
    const len = hand.distanceTo(this.anchor);
    this.line.position.copy(hand);
    this.line.lookAt(this.anchor);
    this.line.scale.set(1, 1, len);
    this.line.visible = true;
    this.blob.position.copy(this.anchor);
    this.blob.visible = true;
  }
}
