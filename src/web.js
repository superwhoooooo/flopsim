// Web shooter (Spider Suit skin): hold Q or right mouse to fire a web line at a building and swing on it.
// Release to let go (with a little fling). W pumps the swing, Space reels you in.
import * as THREE from 'three';
import { groups, G } from './physics.js';
import { sfx } from './audio.js';

const RANGE = 85;             // m: how far the web reaches
const MIN_ANCHOR_RISE = 2;    // anchor must be at least this far above you
const PUMP = 9;               // m/s² along the camera direction while holding W
const REEL = 7;               // m/s rope shortening while holding Space
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

export class WebShooter {
  constructor(game) {
    this.game = game;
    this.anchor = null;       // THREE.Vector3 while attached
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

  /** Find a spot to stick to: where you're looking first, then a few up-and-forward guesses (aim assist). */
  _findAnchor() {
    const g = this.game, cam = g.camera.position, look = g.cam.forward(_f);
    const p = g.player.ragdoll.getPos(_a);
    const filter = groups(0xffff, G.WORLD);
    const tryDir = (ox, oy, oz, dx, dy, dz) => {
      const h = g.physics.castRay(ox, oy, oz, dx, dy, dz, RANGE, filter);
      return h && h.y > p.y + MIN_ANCHOR_RISE ? new THREE.Vector3(h.x, h.y, h.z) : null;
    };
    let hit = tryDir(cam.x, cam.y, cam.z, look.x, look.y, look.z);
    if (hit) return hit;
    const yaw = g.cam.yaw;
    for (const pitch of [0.9, 0.6, 1.2, 0.35]) for (const dy of [0, 0.5, -0.5, 1, -1]) {
      const c = Math.cos(pitch);
      hit = tryDir(p.x, p.y + 0.5, p.z, Math.sin(yaw + dy) * c, Math.sin(pitch), Math.cos(yaw + dy) * c);
      if (hit) return hit;
    }
    return null;
  }

  fire() {
    const g = this.game, r = g.player.ragdoll;
    if (g.driving.active || r.mode === 'limp' || this.cooldown > 0) return;
    const at = this._findAnchor();
    this.cooldown = 0.25;
    if (!at) { sfx.empty(); this.quip('miss', 1); return; }
    const p = r.getPos(_a);
    this.anchor = at;
    // rope shorter than the anchor is high, so it lifts you off the ground into a pendulum arc
    this.len = Math.max(4, Math.min(p.distanceTo(at) * 0.9, (at.y - p.y) * 0.8));
    sfx.web();
    this.quip('fire', 0.35);
    if (Math.random() < 0.3) this._npcGasp();
    // a little tug toward the anchor, and off the ground if we're standing
    _d.subVectors(at, p).normalize();
    const lift = r.grounded ? 6 : 0;
    for (const k of Object.keys(r.parts)) {
      const b = r.parts[k].body, v = b.linvel();
      b.setLinvel({ x: v.x + _d.x * 4, y: v.y + _d.y * 4 + lift, z: v.z + _d.z * 4 }, true);
    }
    r.grounded = false; r.groundDist = 99;
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
    if (!this.anchor) return;
    this.anchor = null;
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
    if (!this.anchor) return;
    if (!isSpider || g.driving.active || r.mode === 'limp') { if (r.mode === 'limp' && isSpider) { this.quipAt = 0; this.quip('fall', 0.7); } this.release(false); return; }

    const pos = r.getPos(_a);
    _d.subVectors(pos, this.anchor);
    const dist = _d.length();
    if (dist > RANGE * 1.3) { this.release(false); return; }
    _d.divideScalar(dist || 1);   // unit vector anchor -> you
    if (input.down('Space')) this.len = Math.max(2.5, this.len - REEL * dt);
    if (r.grounded && dist < this.len) this.len = Math.max(this.len, dist);   // walking around under it: stay slack

    // pump along the camera direction while holding W
    const pump = input.down('KeyW') ? g.cam.flatForward(_f).multiplyScalar(PUMP * dt) : _f.set(0, 0, 0);
    const stretch = dist - this.len;
    for (const k of Object.keys(r.parts)) {
      const b = r.parts[k].body, v = b.linvel();
      let vx = v.x + pump.x, vy = v.y, vz = v.z + pump.z;
      if (stretch > 0) {
        const out = vx * _d.x + vy * _d.y + vz * _d.z;          // speed away from the anchor
        if (out > 0) { vx -= _d.x * out; vy -= _d.y * out; vz -= _d.z * out; }
        const pull = Math.min(stretch * ROPE_K * dt, MAX_PULL * dt);
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

  /** Render frame: stretch the web from the hand to the anchor. */
  sync() {
    if (!this.anchor) return;
    const hand = this.game.player.ragdoll.getPartPos('lArmR', _b);
    const len = hand.distanceTo(this.anchor);
    this.line.position.copy(hand);
    this.line.lookAt(this.anchor);
    this.line.scale.set(1, 1, len);
    this.line.visible = true;
    this.blob.position.copy(this.anchor);
    this.blob.visible = true;
  }
}
