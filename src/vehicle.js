// Driving: hop into any car (E), arcade-steer it, run people over, hop out (E).
// The car stays an ordinary dynamic Rapier body; while driven we set its velocity directly (grip / accel / steering)
// and lock pitch+roll. The driver's ragdoll is disabled & hidden, and its pelvis tracks the car so NPC brains
// still know where "the player" is.
import * as THREE from 'three';
import { RAPIER } from './physics.js';
import { sfx, engine } from './audio.js';

const CAR_HIT_MIN_SPEED = 2.5;   // m/s: any hit faster than this knocks the person out
const KNOCK_OVER_SPEED = 6;      // m/s needed to flatten a tree / lamp post
const DENT_SPEED = 7;            // m/s needed to dent a building
const CAR_BOOM_RADIUS = 8, CAR_BOOM_POWER = 17;   // Z: blow up the car you're driving
const WRECK_RESPAWN = 45;        // s until a blown-up car is fixed and drivable again

const _q = new THREE.Quaternion();
const _f = new THREE.Vector3();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Driving {
  constructor(game) {
    this.game = game;
    this.car = null;
    this.vf = 0;            // forward speed (m/s, +forward)
    this.heading = 0;
    this.lastSet = 0;
    this.hitCool = new Map();
    this.scanT = 0;
    this.honkCool = 0;
  }

  get active() { return !!this.car; }

  /** Distance from a point to the car's footprint (0 when inside). */
  distanceTo(car, x, z) {
    const t = car.body.translation(), r = car.body.rotation();
    _q.set(r.x, r.y, r.z, r.w); _f.set(0, 0, 1).applyQuaternion(_q);
    const dx = x - t.x, dz = z - t.z;
    const lz = dx * _f.x + dz * _f.z, lx = dx * _f.z - dz * _f.x;
    return Math.hypot(Math.max(Math.abs(lx) - 0.9, 0), Math.max(Math.abs(lz) - 2.1, 0));
  }

  nearestCar(x, z, range = 1.7) {
    let best = null, bd = range;
    for (const p of this.game.world.props) {
      if (p.kind !== 'car') continue;
      const d = this.distanceTo(p, x, z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  enter(car) {
    const g = this.game, pl = g.player, r = pl.ragdoll;
    if (this.car || r.mode !== 'active') return;
    if (car.wrecked) { g.hud.toast("This car is wrecked. It'll be fixed in a bit.", ''); sfx.error(); return; }
    this.car = car;
    pl.vehicle = car; pl.attack = null;
    r.pose = {}; r.desired.x = r.desired.z = 0;
    for (const n of Object.keys(r.parts)) r.parts[n].body.setEnabled(false);
    r.setVisible(false);
    // stand the car back up (yaw only), lock pitch/roll
    const b = car.body, q = b.rotation();
    _q.set(q.x, q.y, q.z, q.w); _f.set(0, 0, 1).applyQuaternion(_q);
    this.heading = Math.atan2(_f.x, _f.z);
    b.setRotation({ x: 0, y: Math.sin(this.heading / 2), z: 0, w: Math.cos(this.heading / 2) }, true);
    const t = b.translation();
    if (t.y > 1.2 || t.y < 0.55) b.setTranslation({ x: t.x, y: 0.8, z: t.z }, true);
    b.setEnabledRotations(false, true, false, true);
    b.setLinearDamping(0.05); b.setAngularDamping(3);
    car.collider.setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min);   // don't let ground friction fight the drive
    car.collider.setFriction(0.0);
    this.vf = 0; this.lastSet = 0; this.honkCool = 0;
    engine.start();
    g.hud.toast('W/S gas & brake · A/D steer · Shift boost · Space handbrake · F horn · E exit', '');
    g.cam.snapBehind?.(this.heading);
  }

  exit() {
    const g = this.game, car = this.car;
    if (!car) return;
    const b = car.body, t = b.translation();
    // pick a free side
    let spot = null;
    const fwd = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
    const cands = [right.clone().multiplyScalar(2.1), right.clone().multiplyScalar(-2.1), fwd.clone().multiplyScalar(-3.3), fwd.clone().multiplyScalar(3.3)];
    for (const c of cands) {
      const hit = g.physics.castRay(t.x, 0.9, t.z, c.x, 0, c.z, c.length() + 0.5, undefined, (col) => col.handle !== car.collider.handle);
      if (!hit) { spot = c; break; }
    }
    if (!spot) spot = new THREE.Vector3(0, 2.5, 0);
    const r = g.player.ragdoll;
    for (const n of Object.keys(r.parts)) r.parts[n].body.setEnabled(true);
    r.setVisible(true);
    r.spawn(t.x + spot.x, t.z + spot.z, this.heading, spot.y > 0 ? 2.5 : 0.03);
    g.player.vehicle = null;
    b.setEnabledRotations(true, true, true, true);
    b.setLinearDamping(car.baseDamping); b.setAngularDamping(car.baseDamping + 0.3);
    car.collider.setFrictionCombineRule(RAPIER.CoefficientCombineRule.Average);
    car.collider.setFriction(0.7);
    car.steer = 0;
    this.car = null;
    engine.stop();
  }

  /** Z: the car explodes. You get thrown out, everyone nearby goes flying, the car is wrecked for a while. */
  blowUp() {
    const g = this.game, car = this.car;
    if (!car) return;
    const t = car.body.translation();
    const at = new THREE.Vector3(t.x, t.y, t.z);
    this.exit();
    // the blast (credited to the player for quests), then launch the player too
    g.combat.explode(at, CAR_BOOM_RADIUS, CAR_BOOM_POWER, g.player, 'carbomb');
    g.effects.bonk(at.x, at.y + 1.5, at.z, 3.5, false);
    g.cam.shake = Math.max(g.cam.shake, 1.4);
    const pp = g.player.ragdoll.getPos(new THREE.Vector3());
    const away = new THREE.Vector3(pp.x - at.x, 0, pp.z - at.z).normalize().setY(1.2).normalize();
    g.playerSafeUntil = 0;
    g.hitRagdoll(g.player.ragdoll, 'torso', away, 14, 3, null, 'carbomb');
    // flip the car into the air and char it
    const m = car.body.mass();
    car.body.applyImpulse({ x: (Math.random() - 0.5) * m * 4, y: m * 9, z: (Math.random() - 0.5) * m * 4 }, true);
    car.body.applyTorqueImpulse({ x: (Math.random() - 0.5) * m * 6, y: (Math.random() - 0.5) * m * 3, z: (Math.random() - 0.5) * m * 6 }, true);
    car.wrecked = true;
    const paint = car.mesh.material;
    car.originalColor ??= paint.color.getHex();
    paint.color.setHex(0x1c1a18); paint.metalness = 0.1; paint.roughness = 0.95;
    g.hud.toast('KABOOM!', 'unlock');
    g.timers.push({ t: WRECK_RESPAWN, fn: () => {
      car.wrecked = false;
      paint.color.setHex(car.originalColor); paint.metalness = 0.6; paint.roughness = 0.28;
    } });
  }

  /** Fixed-step update, before physics.step(). */
  step(dt, input) {
    const car = this.car; if (!car) return;
    const g = this.game, b = car.body;
    const v = b.linvel(), q = b.rotation(), t = b.translation();
    _q.set(q.x, q.y, q.z, q.w); _f.set(0, 0, 1).applyQuaternion(_q);
    const fx = _f.x, fz = _f.z, fl = Math.hypot(fx, fz) || 1;
    const fwx = fx / fl, fwz = fz / fl, rx = fwz, rz = -fwx;
    this.heading = Math.atan2(fwx, fwz);
    let vf = v.x * fwx + v.z * fwz, vl = v.x * rx + v.z * rz;

    // crash feedback: speed we asked for last step vs what physics left us with
    const now = Math.hypot(v.x, v.z);
    if (this.lastSet - now > 4.5) {
      g.cam.shake = Math.max(g.cam.shake, clamp((this.lastSet - now) / 12, 0.3, 1));
      sfx.bonk(clamp((this.lastSet - now) / 10, 0.4, 1.2));
      g.effects.bonk(t.x + fwx * Math.sign(vf || 1) * 2, t.y + 0.4, t.z + fwz * Math.sign(vf || 1) * 2, 0.8);
    }

    const up = input.down('KeyW'), down = input.down('KeyS');
    const boost = input.down('ShiftLeft') || input.down('ShiftRight');
    const hand = input.down('Space');
    const steerIn = (input.down('KeyA') ? 1 : 0) - (input.down('KeyD') ? 1 : 0);
    const maxF = boost ? 32 : 21;
    let target = 0, acc = 3.5;
    if (up) { target = maxF; acc = boost ? 17 : 11; }
    else if (down) { if (vf > 0.8) { target = 0; acc = 26; } else { target = -8; acc = 8; } }
    vf += clamp(target - vf, -acc * dt, acc * dt);
    if (hand) vf *= Math.exp(-1.6 * dt);
    vl *= Math.exp(-(hand ? 1.1 : 7.5) * dt);

    car.steer += (steerIn - car.steer) * Math.min(1, dt * 9);
    const speedFactor = clamp(vf / 5, -1, 1) / (1 + Math.abs(vf) / 28);
    const yawRate = car.steer * 2.1 * speedFactor * (hand ? 1.5 : 1);
    b.setAngvel({ x: 0, y: yawRate, z: 0 }, true);
    b.setLinvel({ x: fwx * vf + rx * vl, y: v.y, z: fwz * vf + rz * vl }, true);
    this.vf = vf;
    this.lastSet = Math.hypot(fwx * vf + rx * vl, fwz * vf + rz * vl);
    // distance driven, reported to quests every 10 m (Joyride)
    this.driven = (this.driven || 0) + Math.abs(vf) * dt;
    if (this.driven >= 10) { this.driven -= 10; g.quests.emit('drive', { amount: 10 }); }

    // driver rides along (NPC brains read the player's pelvis)
    r_track(g.player.ragdoll, t);

    // run people over
    this.honkCool = Math.max(0, this.honkCool - dt);
    const z = input.down('KeyZ');
    if (z && !this.zPrev) { this.zPrev = true; this.blowUp(); return; }
    this.zPrev = z;
    if (input.down('KeyF') && this.honkCool <= 0) { this.honkCool = 0.45; engine.horn(); this._scare(t, 14); }
    for (const [k, tm] of this.hitCool) if (g.time - tm > 0.7) this.hitCool.delete(k);
    const spd = Math.abs(vf);
    if (spd > CAR_HIT_MIN_SPEED) {
      const sgn = Math.sign(vf);
      const cx = t.x + fwx * sgn * 1.7, cz = t.z + fwz * sgn * 1.7;
      const seen = new Set();
      // the bumper in the direction we're going, plus the middle of the car so side-swipes count too
      const onHit = (col) => {
        const o = g.physics.ownerOf(col);
        if (!o) return;
        if (o.type === 'breakable') {   // trees and lamp posts fall over
          if (spd < KNOCK_OVER_SPEED || o.b.fallen) return;
          g.world.knockOver(o.b, { x: fwx * sgn, z: fwz * sgn }, spd);
          g.effects.bonk(o.b.x, 1.2, o.b.z, spd / 10, false);
          sfx.thump?.(); sfx.bonk(1.2);
          g.cam.shake = Math.max(g.cam.shake, 0.6);
          return;
        }
        if (o.type === 'building') {    // dent the wall where we hit it
          if (spd < DENT_SPEED || this.hitCool.has(o.house)) return;
          this.hitCool.set(o.house, g.time);
          g.world.dent(o.house, cx, t.y + 0.4, cz, spd);
          g.effects.bonk(cx, t.y + 0.6, cz, spd / 8, false);
          sfx.thump?.(); sfx.bonk(1.4);
          g.cam.shake = Math.max(g.cam.shake, 0.9);
          return;
        }
        if (o.type !== 'part' || o.ragdoll === g.player.ragdoll) return;
        const tgt = o.ragdoll;
        if (seen.has(tgt) || this.hitCool.has(tgt)) return;
        seen.add(tgt);
        this.hitCool.set(tgt, g.time);
        const dir = new THREE.Vector3(fwx * sgn + rx * vl * 0.05, 0.45, fwz * sgn + rz * vl * 0.05).normalize();
        const tp = tgt.getPartPos(o.part, new THREE.Vector3());
        g.effects.bonk(tp.x, tp.y + 0.2, tp.z, spd / 8);
        sfx.bonk(clamp(spd / 14, 0.5, 1.4));
        g.cam.shake = Math.max(g.cam.shake, 0.5);
        const part = tgt.isSevered(o.part) ? 'torso' : o.part;   // hitting a loose limb still bonks the person
        g.hitRagdoll(tgt, part, dir, clamp(spd * 0.75, 6, 16), 2, g.player, 'car');   // stun 2: always a knockout
      };
      g.physics.overlapSphere(cx, t.y + 0.1, cz, 1.35, onHit);
      g.physics.overlapSphere(t.x, t.y + 0.1, t.z, 1.5, onHit);
    }
    this.scanT -= dt;
    if (this.scanT <= 0) { this.scanT = 0.3; if (spd > 6) this._scare(t, 9); }
    engine.set(clamp(spd / 30, 0, 1), up ? 1 : 0);
  }

  // pedestrians near a speeding car (or a honk) bolt
  _scare(t, radius) {
    for (const n of this.game.npcs) {
      if (n.knockedOut() || n.state === 'flee' || n.def.baker) continue;
      const p = n.pos;
      if (Math.hypot(p.x - t.x, p.z - t.z) < radius) n.react('flee', 2.5);
    }
  }
}

function r_track(ragdoll, t) {
  ragdoll.parts.pelvis.body.setTranslation({ x: t.x, y: t.y + 0.4, z: t.z }, false);
}
