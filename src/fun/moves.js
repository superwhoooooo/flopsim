// Moves: flop on command (X), grab & drag (F), throw what you hold (attack), trick combos, and slow motion (T).
//  - Flop: hold X to go fully limp, let go to get back up. Self-flops never end a trick combo.
//  - Grab: hold F to grab whatever is in front of your hand with a physics joint: people (they go floppy),
//    props, cars (if it moves, you get dragged along) or a wall / ledge in mid-air (hang; Space climbs up).
//    Attack while holding = throw it where you look.
//  - Tricks: spins, flips, big air, big drops, air bonks, yeets, car surfing... chain them into a combo whose
//    multiplier grows with every trick. Land on your feet and stay upright to bank it; get knocked out to bail.
//  - Slow motion: T, a few seconds of bullet time on a cooldown.
import * as THREE from 'three';
import { RAPIER, G, groups } from '../physics.js';
import { sfx } from '../audio.js';

const GRAB_REACH = 1.6;       // m from the chest (giraffes reach twice as far)
const HAND = { x: 0, y: -0.15, z: 0 };   // grab point on the right forearm, body local
const THROW_SPEED = 17;       // m/s
const BANK_AFTER = 2.0;       // s with no new trick (feet down, upright) to bank a combo
const SLOW_SCALE = 0.3, SLOW_TIME = 4, SLOW_COOLDOWN = 10;
const TWO_PI = Math.PI * 2;

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion();

export class Moves {
  constructor(game, fun) {
    this.game = game; this.fun = fun;
    this.selfFlop = false;
    this.flopStart = null;
    this.grab = null;           // { kind: 'npc' | 'prop' | 'world' | 'remote', joint, body, ... }
    this.grabPrev = false;
    this.combo = null;          // { tricks: [], pts, t }
    this.air = { on: false, t: 0, yaw: 0, fx: 0, fz: 0, spins: 0, flips: 0, maxY: 0, fast: false, prevVy: 0 };
    this.surfT = 0;
    this.prevGrounded = true;
    this.slow = 0; this.slowCd = 0;
    this.prevVy = 0;
    this._buildHud();
  }

  // ---------------------------------------------------------------- HUD
  _buildHud() {
    const root = document.getElementById('hud');
    this.comboEl = document.createElement('div'); this.comboEl.id = 'comboBox'; root.appendChild(this.comboEl);
    this.slowEl = document.createElement('div'); this.slowEl.id = 'slowFx'; document.body.appendChild(this.slowEl);
  }

  _renderCombo(state = '') {
    const c = this.combo, el = this.comboEl;
    if (!c) { if (!state) el.classList.remove('show'); return; }
    const names = c.tricks.slice(-5).map((t) => t.name).join(' + ');
    el.innerHTML = `<div class="cb-tricks">${c.tricks.length > 5 ? '... + ' : ''}${names}</div>`
      + `<div class="cb-total">${c.pts} <span>x${c.tricks.length}</span></div><div class="cb-bar"><i style="width:${Math.max(0, 100 - (c.t / BANK_AFTER) * 100)}%"></i></div>`;
    el.className = 'show' + (state ? ' ' + state : '');
  }

  // ---------------------------------------------------------------- tricks & combos
  trick(name, pts) {
    const g = this.game;
    if (g.driving.active) return;
    if (!this.combo) this.combo = { tricks: [], pts: 0, t: 0 };
    const c = this.combo;
    c.tricks.push({ name, pts }); c.pts += pts; c.t = 0;
    sfx.blip(380 + Math.min(10, c.tricks.length) * 55);
    this._renderCombo();
  }

  _bank() {
    const c = this.combo; this.combo = null;
    if (!c) return;
    const n = c.tricks.length, total = c.pts * n;
    const D = this.game.discovery;
    D.addPoints(total, n > 1 ? `COMBO x${n}` : c.tricks[0].name);
    if (n >= 3) D.award('combo3');
    if (n >= 6) D.award('combo6');
    this.fun.challengeEvent('combo', { n });
    this.comboEl.innerHTML = `<div class="cb-total">+${total} <span>${n > 1 ? 'COMBO x' + n : 'NICE'}</span></div>`;
    this.comboEl.className = 'show banked';
    clearTimeout(this._hideT); this._hideT = setTimeout(() => { if (!this.combo) this.comboEl.classList.remove('show'); }, 1400);
    if (n >= 4) this.fun.offerReplay();
  }

  _bail() {
    if (!this.combo) return;
    this.combo = null;
    sfx.error();
    this.comboEl.innerHTML = '<div class="cb-total">BAILED!</div>';
    this.comboEl.className = 'show bailed';
    clearTimeout(this._hideT); this._hideT = setTimeout(() => { if (!this.combo) this.comboEl.classList.remove('show'); }, 1200);
  }

  // ---------------------------------------------------------------- input edges
  /** Attack pressed. Returns true if we used it (throwing what we hold). */
  attackPress() {
    if (!this.grab || this.grab.kind === 'world') return false;
    this._throw();
    return true;
  }

  toggleSlow() {
    const g = this.game;
    if (this.slow > 0) { this.slow = 0; return; }
    if (this.slowCd > 0) { g.hud.toast(`Slow motion recharging (${this.slowCd.toFixed(0)}s)`, ''); sfx.error(); return; }
    this.slow = SLOW_TIME; this.slowCd = SLOW_COOLDOWN + SLOW_TIME;
    sfx.whoosh();
  }

  get timeScale() { return this.slow > 0 ? SLOW_SCALE : 1; }

  // ---------------------------------------------------------------- grabbing
  _findGrab() {
    const g = this.game, p = g.player, r = p.ragdoll;
    const reach = GRAB_REACH * (p.form.reachMul || 1);
    const chest = r.getPartPos('torso', _a); chest.y += 0.1;
    const f = g.cam.flatForward(new THREE.Vector3());
    const right = new THREE.Vector3(f.z, 0, -f.x);
    const own = p.colliderHandles;
    let best = null;
    for (const yaw of [0, -0.35, 0.35]) for (const pitch of [-0.35, 0.05, 0.45, -0.8]) {
      const d = f.clone().multiplyScalar(Math.cos(yaw)).addScaledVector(right, Math.sin(yaw));
      d.multiplyScalar(Math.cos(pitch)); d.y = Math.sin(pitch); d.normalize();
      const h = g.physics.castRay(chest.x, chest.y, chest.z, d.x, d.y, d.z, reach, undefined, (c) => !own.has(c.handle));
      if (h && (!best || h.toi < best.toi)) best = h;
    }
    return best;
  }

  _startGrab() {
    const g = this.game, p = g.player, r = p.ragdoll;
    const h = this._findGrab();
    if (!h) return;
    const owner = g.physics.ownerOf(h.collider);
    const body = h.collider.parent();
    if (!body) return;
    let kind;
    if (owner?.type === 'part') {
      if (owner.ragdoll === r) return;
      kind = owner.ragdoll.owner?.isRemote ? 'remote' : 'npc';
      if (kind === 'npc') {
        owner.ragdoll.knockout(1.5);
        const npc = g.npcByRagdoll.get(owner.ragdoll);
        if (npc) { npc.lastHitByPlayer = g.time; npc.lastHitWeapon = 'grab'; }
      }
    } else if (owner?.type === 'prop') kind = 'prop';
    else {
      if (r.grounded) return;   // walls and ledges: only grab them in mid-air (to hang)
      kind = 'world';
    }
    const hand = r.parts.lArmR.body;
    const local = this._local(body, new THREE.Vector3(h.x, h.y, h.z));
    let joint;
    try {
      joint = g.physics.world.createImpulseJoint(RAPIER.JointData.spherical(HAND, { x: local.x, y: local.y, z: local.z }), hand, body, true);
    } catch (e) { return; }
    const prop = owner?.type === 'prop' ? owner.prop : null;
    this.grab = { kind, joint, body, ragdoll: owner?.ragdoll || null, prop, t: 0, last: new THREE.Vector3(h.x, h.y, h.z), dragged: 0 };
    sfx.pop();
    g.discovery.award('grab_first');
    if (kind === 'world') g.hud.toast('Hanging on! Space to climb up, let go of F to drop.', '');
  }

  release() {
    const gr = this.grab;
    if (!gr) return;
    this.grab = null;
    try { this.game.physics.world.removeImpulseJoint(gr.joint, true); } catch (e) { /* already gone */ }
    if (gr.dragged > 2) this.fun.challengeEvent('drag', { m: gr.dragged });
  }

  _bodiesOf(gr) {
    if (gr.ragdoll) return Object.keys(gr.ragdoll.parts).filter((n) => !gr.ragdoll.isSevered(n)).map((n) => gr.ragdoll.parts[n].body);
    return [gr.body];
  }

  _throw() {
    const g = this.game, gr = this.grab;
    if (!gr) return;
    const look = g.cam.forward(new THREE.Vector3());
    const vx = look.x * THROW_SPEED, vz = look.z * THROW_SPEED, vy = Math.max(4, look.y * THROW_SPEED + 5);
    const bodies = gr.kind === 'remote' ? [] : this._bodiesOf(gr);
    this.release();
    for (const b of bodies) b.setLinvel({ x: vx, y: vy, z: vz }, true);
    if (gr.ragdoll && gr.kind === 'npc') {
      gr.ragdoll.limpTimer = Math.max(gr.ragdoll.limpTimer, 2.5);
      const npc = g.npcByRagdoll.get(gr.ragdoll);
      if (npc) { npc.lastHitByPlayer = g.time; npc.lastHitWeapon = 'throw'; }
    }
    if (gr.kind === 'remote') g.hitRagdoll(gr.ragdoll, 'torso', look.clone().setY(0.6).normalize(), 14, 2, g.player, 'throw');
    if (gr.prop) gr.prop.taintT = g.time;
    sfx.swing(true); sfx.whoosh();
    g.cam.shake = Math.max(g.cam.shake, 0.25);
    this.trick('YEET', 30);
    this.fun.stats.yeets = (this.fun.stats.yeets || 0) + 1;
    if (this.fun.stats.yeets >= 10) g.discovery.award('yeet10');
    this.fun.changed();
  }

  _local(body, worldPoint) {
    const t = body.translation(), q = body.rotation();
    return worldPoint.clone().sub(_b.set(t.x, t.y, t.z)).applyQuaternion(_q.set(q.x, q.y, q.z, q.w).invert());
  }

  _stepGrab(dt) {
    const g = this.game, p = g.player, r = p.ragdoll, input = g.input;
    const held = input.down('KeyF') && !g.driving.active && !g.paused;
    const edge = held && !this.grabPrev;
    this.grabPrev = held;
    if (!this.grab) {
      if (edge && r.mode !== 'limp') this._startGrab();
      return;
    }
    const gr = this.grab;
    gr.t += dt;
    let alive = true;
    try { alive = gr.body.isValid?.() !== false && g.physics.world.getImpulseJoint(gr.joint.handle) != null; } catch (e) { alive = false; }
    if (!held || !alive || g.driving.active || (r.mode === 'limp' && !this.selfFlop)) { this.release(); return; }
    if (gr.ragdoll && gr.kind === 'npc') {
      if (!gr.ragdoll.physicsOn) { this.release(); return; }
      gr.ragdoll.limpTimer = Math.max(gr.ragdoll.limpTimer, 0.8);   // stays floppy while you hold them
    }
    // arm reaches out to hold it
    r.pose.armR = { swing: -1.45, elbow: -0.15, side: 0.08, gain: 3 };
    // distance dragged (what you hold moving along the ground with you)
    const t = gr.body.translation(); _a.set(t.x, t.y, t.z);
    const step = _a.distanceTo(gr.last); gr.last.copy(_a);
    if (gr.kind !== 'world' && step < 1) gr.dragged += step;
    if (gr.kind === 'world') {
      if (gr.t > 5) g.discovery.award('hang');
      if (gr.t > 3 && !gr.hang3) { gr.hang3 = true; this.fun.challengeEvent('hang', {}); }
      if (input.down('Space') && gr.t > 0.25) {   // climb / jump up off the ledge
        const f = g.cam.flatForward(_b);
        this.release();
        for (const k of Object.keys(r.parts)) r.parts[k].body.setLinvel({ x: f.x * 2.5, y: 7.5, z: f.z * 2.5 }, true);
        sfx.jump();
      }
    }
  }

  // ---------------------------------------------------------------- per fixed step (after player.brain, before physics)
  step(dt) {
    const g = this.game, p = g.player, r = p.ragdoll, input = g.input;
    // slow motion timers run on real-ish time (scaled steps would make them last forever)
    this.slowCd = Math.max(0, this.slowCd - dt / this.timeScale);
    if (this.slow > 0) { this.slow = Math.max(0, this.slow - dt / SLOW_SCALE); }
    document.body.classList.toggle('slowmo', this.slow > 0);

    // ---- flop on command
    const flopHeld = input.down('KeyX') && !g.driving.active && !g.paused;
    if (flopHeld) {
      if (r.mode !== 'limp') {
        r.knockout(0.4);
        this.selfFlop = true;
        this.flopStart = r.getPos(new THREE.Vector3());
        sfx.boing();
      }
      if (this.selfFlop) r.limpTimer = Math.max(r.limpTimer, 0.3);
    } else if (this.selfFlop && r.mode === 'limp') r.limpTimer = Math.min(r.limpTimer, 0.15);
    if (this.selfFlop && r.mode === 'active') {
      this.selfFlop = false;
      if (this.flopStart) {
        const d = r.getPos(_a).distanceTo(this.flopStart);
        if (d > 6) this.trick('TUMBLE', Math.round(d * 3));
        this.flopStart = null;
      }
    }

    this._stepGrab(dt);
    if (g.driving.active) { this.air.on = false; return; }

    // ---- tricks (airborne detection like discovery: ray down to anything solid)
    const pos = r.getPos(_a);
    const hit = g.physics.castRay(pos.x, pos.y, pos.z, 0, -1, 0, 40, groups(0xffff, G.WORLD | G.PROP));
    const airborne = (!hit || hit.toi > 1.6) && !(this.grab && this.grab.kind === 'world');
    const A = this.air, tv = r.parts.torso.body.angvel(), pv = r.parts.pelvis.body.linvel();
    if (airborne) {
      if (!A.on) Object.assign(A, { on: true, t: 0, yaw: 0, fx: 0, fz: 0, spins: 0, flips: 0, maxY: pos.y, fast: false });
      A.t += dt; A.maxY = Math.max(A.maxY, pos.y);
      A.yaw += tv.y * dt; A.fx += tv.x * dt; A.fz += tv.z * dt;
      const spins = Math.floor(Math.abs(A.yaw) / (TWO_PI * 0.92));
      while (A.spins < spins) { A.spins++; this.trick(`SPIN ${A.spins * 360}`, 25 * A.spins); }
      const flips = Math.floor(Math.max(Math.abs(A.fx), Math.abs(A.fz)) / (TWO_PI * 0.9));
      while (A.flips < flips) { A.flips++; this.trick(A.flips === 1 ? 'FLIP' : A.flips === 2 ? 'DOUBLE FLIP' : `${A.flips}x FLIP`, 40 * A.flips); }
      if (!A.fast && Math.hypot(pv.x, pv.y, pv.z) > 16) { A.fast = true; this.trick('SPEED DEMON', 20); }
    } else if (A.on) {
      A.on = false;
      if (A.t > 1.0) this.trick('BIG AIR', Math.round(A.t * 15));
      const drop = A.maxY - pos.y;
      if (drop > 6) this.trick('BIG DROP', Math.round(drop * 3));
      if (A.t > 3) this.fun.challengeEvent('air', { s: A.t });
    }

    // ---- landings: springs / blob bounce, blob slam
    const grounded = r.grounded;
    if (grounded && !this.prevGrounded && r.mode === 'active') {
      const vy = this.prevVy;
      const bouncy = p.form.bouncy || this.fun.gear.feet === 'springs';
      if (bouncy && vy < -7) { r.hop(Math.min(15, -vy * 0.78)); sfx.boing(); this.trick('BOING', 15); }
      if (p.blobSlam) {
        p.blobSlam = false;
        const at = r.getPos(new THREE.Vector3()); at.y = 0.15;
        g.combat.explode(at, 6.5, 11, p, 'bounce');
        g.cam.shake = Math.max(g.cam.shake, 0.8); sfx.thump();
      }
    }
    if (!grounded) this.prevVy = pv.y;
    this.prevGrounded = grounded;

    // ---- car surfing: standing on a moving car
    const on = hit && hit.toi < 1.6 ? g.physics.ownerOf(hit.collider) : null;
    const car = on?.type === 'prop' && on.prop.kind === 'car' ? on.prop : null;
    if (car && r.mode === 'active') {
      const v = car.body.linvel();
      if (Math.hypot(v.x, v.z) > 4) { this.surfT += dt; if (this.surfT > 2) { this.surfT = 0; this.trick('CAR SURF', 30); } }
    } else this.surfT = 0;

    // ---- combo: bank when upright on the ground for a bit; bail if knocked out (unless you flopped on purpose)
    if (this.combo) {
      if (r.mode === 'limp' && !this.selfFlop) { this._bail(); return; }
      const settled = !airborne && r.mode === 'active';
      this.combo.t += settled ? dt : 0;
      if (this.combo.t >= BANK_AFTER) this._bank();
      else if ((this._rT = (this._rT || 0) + 1) % 6 === 0) this._renderCombo();
    }
  }

  /** A knockout the player caused (from fun.onKnockout). */
  onKnockout() {
    const r = this.game.player.ragdoll;
    if (this.air.on && r.mode !== 'limp') this.trick('AIR BONK', 30);
    if (this.slow > 0) { this.game.discovery.award('slowko'); this.fun.challengeEvent('slowko', {}); }
  }
}
