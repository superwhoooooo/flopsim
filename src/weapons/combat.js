// Melee sphere sweeps, hitscan gun, impulses on whatever got hit.
import * as THREE from 'three';
import { G, groups } from '../physics.js';
import { sfx } from '../audio.js';
import { LIMB_OF_PART } from '../ragdoll.js';

// Where the hitting part of each melee weapon sits, as [start, end] distance down the weapon from the grip.
const BLADE = {
  axe: [0.3, 0.78], sword: [0.25, 1.04], bat: [0.25, 0.84], pan: [0.35, 0.7], sledge: [0.4, 1.12], katana: [0.25, 1.15],
  knife: [0.15, 0.5], crowbar: [0.3, 0.86], chainsaw: [0.25, 0.78], golf: [0.5, 1.06], baguette: [0.2, 0.75],
};
const CONTACT_MIN_SPEED = 4;     // m/s the blade must be moving (relative to the player) to hurt
const CONTACT_COOLDOWN = 0.35;   // s before the same target can be hit again by blade contact
// Body collisions: any part of you (arms, legs, torso) that hits someone while moving fast hurts them,
// weaker than a weapon. Speed is that body part's own speed toward them.
const BODY_MIN_SPEED = 3.8;      // m/s (walking is 3.4, sprinting 6, a spinning arm ~6-7), so a gentle touch does nothing
const BODY_KNOCK_PER_MS = 0.6;   // knock per m/s
const BODY_STUN_PER_MS = 0.1;    // stun per m/s: a full sprint is ~0.6, so it takes two hits to knock someone down
const BODY_COOLDOWN = 0.8;       // s before the same person can be body-hit again
const _q = new THREE.Quaternion();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

export class Combat {
  constructor(game) {
    this.game = game;
    this.prevTip = null;
    this.contactUntil = new Map();   // ragdoll or prop -> game time it can be hit again
  }

  /**
   * Blade contact: every step, sweep small spheres along the held melee weapon and hurt anything it
   * touches while moving fast (e.g. spinning with R). Damage scales with blade speed.
   * Skipped during a normal click attack, which already does its own hit.
   */
  bladeContact(player, dt) {
    const g = this.game;
    const r = player.ragdoll;
    const w = player.weapon;
    const span = BLADE[w.id];
    if (r.mode !== 'limp' && !player.vehicle) this._bodyCollisions(player);
    if (player.noodles) { this.prevTip = null; this._noodleContact(player); return; }
    if (!span || player.attack || player.vehicle || r.mode === 'limp') { this.prevTip = null; return; }

    const hand = r.parts.lArmR.body;
    const t = hand.translation(), rot = hand.rotation();
    _q.set(rot.x, rot.y, rot.z, rot.w);
    // weapon hangs down the forearm's local -Y, offset 0.16 from the hand body's centre
    const along = (d, out) => out.set(0, -0.16 - d, 0).applyQuaternion(_q).add(_b.set(t.x, t.y, t.z));
    const tip = along(span[1], new THREE.Vector3());
    const prev = this.prevTip;
    this.prevTip = tip;
    if (!prev) return;

    // speed relative to the body, so just running around with a sword doesn't hurt people
    const pv = r.parts.pelvis.body.linvel();
    const motion = new THREE.Vector3().subVectors(tip, prev).multiplyScalar(1 / dt);
    motion.x -= pv.x; motion.y -= pv.y; motion.z -= pv.z;
    const speed = motion.length();
    if (speed < CONTACT_MIN_SPEED) return;
    const power = THREE.MathUtils.clamp(speed / 10, 0.4, 1.2);

    const partHits = new Map();
    const props = new Set();
    const ready = (key) => (this.contactUntil.get(key) ?? 0) <= g.time;
    const cb = (col) => {
      if (player.colliderHandles.has(col.handle)) return;
      const o = g.physics.ownerOf(col);
      if (!o) return;
      if (o.type === 'part') {
        if (o.ragdoll === r || !ready(o.ragdoll)) return;
        const arr = partHits.get(o.ragdoll) || [];
        if (!arr.includes(o.part)) arr.push(o.part);
        partHits.set(o.ragdoll, arr);
      } else if (o.type === 'prop' && ready(o.prop)) props.add(o.prop);
    };
    for (const f of [0, 0.5, 1]) {
      along(span[0] + (span[1] - span[0]) * f, _a);
      g.physics.overlapSphere(_a.x, _a.y, _a.z, 0.2, cb);
    }
    if (!partHits.size && !props.size) return;

    const pel = r.getPos(new THREE.Vector3());
    const swingDir = motion.clone().setY(0).normalize();
    for (const [rd, parts] of partHits) {
      const live = parts.filter((p) => !rd.isSevered(p));
      const pool = live.length ? live : parts;
      const limbs = pool.filter((p) => LIMB_OF_PART[p]);
      const part = (w.sever >= 0.3 && limbs.length) ? limbs[Math.floor(Math.random() * limbs.length)]
        : pool.includes('torso') ? 'torso' : pool[0];
      const tp = rd.getPartPos(part, new THREE.Vector3());
      // knock them along the swing and a little away from us
      const dir = new THREE.Vector3(tp.x - pel.x, 0, tp.z - pel.z).normalize().multiplyScalar(0.4).addScaledVector(swingDir, 0.6);
      dir.y = 0.3; dir.normalize();
      this.contactUntil.set(rd, g.time + CONTACT_COOLDOWN);
      this._hitFx(tp, w.knock * power);
      g.hitRagdoll(rd, part, dir, w.knock * power, w.stun * power, player, w.id);
    }
    for (const p of props) {
      this.contactUntil.set(p, g.time + CONTACT_COOLDOWN);
      const pt = p.body.translation(), m = p.body.mass();
      const k = w.knock * power * 0.6;
      const dir = new THREE.Vector3(pt.x - pel.x, 0, pt.z - pel.z).normalize().addScaledVector(swingDir, 1).setY(0.5).normalize();
      p.body.applyImpulse({ x: dir.x * m * k, y: dir.y * m * k, z: dir.z * m * k }, true);
      this._hitFx(new THREE.Vector3(pt.x, pt.y, pt.z), k * 0.6);
    }
    g.cam.shake = Math.max(g.cam.shake, 0.3);
    // forget stale cooldown entries now and then
    if (this.contactUntil.size > 64) for (const [k, v] of this.contactUntil) if (v <= g.time) this.contactUntil.delete(k);
  }

  /** Melee: overlap spheres in front of the attacker at the moment of the strike. */
  meleeSwing(player, w) {
    const g = this.game;
    const r = player.ragdoll;
    const pel = r.getPos(new THREE.Vector3());
    const fwd = r.getForward(new THREE.Vector3());
    const seen = new Set();
    const hits = [];
    const partHits = new Map();   // ragdoll -> overlapped part names
    const cb = (col) => {
      if (player.colliderHandles.has(col.handle)) return;
      const o = g.physics.ownerOf(col);
      if (!o) return;
      if (o.type === 'part') {
        const arr = partHits.get(o.ragdoll) || [];
        if (!arr.includes(o.part)) arr.push(o.part);
        partHits.set(o.ragdoll, arr);
        return;
      }
      if (seen.has(o.prop)) return;
      seen.add(o.prop);
      hits.push({ o, col });
    };
    for (const f of [0.35, 0.7, 1.0]) {
      g.physics.overlapSphere(pel.x + fwd.x * w.range * f, pel.y + 0.35, pel.z + fwd.z * w.range * f, w.radius, cb);
    }
    // one hit per ragdoll: sharp weapons aim for a limb if one is in reach, otherwise the torso
    for (const [rd, parts] of partHits) {
      const live = parts.filter((p) => !rd.isSevered(p));
      const pool = live.length ? live : parts;
      const limbs = pool.filter((p) => LIMB_OF_PART[p]);
      const pick = (w.sever >= 0.3 && limbs.length) ? limbs[Math.floor(Math.random() * limbs.length)]
        : pool.includes('torso') ? 'torso' : pool[0];
      hits.push({ o: { type: 'part', ragdoll: rd, part: pick } });
    }
    let any = false;
    for (const h of hits) {
      if (h.o.type === 'part') {
        const target = h.o.ragdoll;
        if (target === r) continue;
        const tp = target.getPartPos(h.o.part, new THREE.Vector3());
        const dir = new THREE.Vector3(tp.x - pel.x, 0, tp.z - pel.z).normalize().multiplyScalar(0.4).addScaledVector(fwd, 0.6);
        dir.y = 0.3; dir.normalize();
        this._hitFx(tp, w.knock);
        g.hitRagdoll(target, h.o.part, dir, w.knock * (player.knockMul || 1), w.stun, player, w.id);
        any = true;
      } else if (h.o.type === 'prop') {
        const p = h.o.prop;
        const t = p.body.translation();
        const dir = new THREE.Vector3(t.x - pel.x, 0.4, t.z - pel.z).normalize();
        const m = p.body.mass();
        const km = w.knock * (player.knockMul || 1) * 0.7;
        p.body.applyImpulse({ x: dir.x * m * km, y: dir.y * m * km, z: dir.z * m * km }, true);
        p.body.applyTorqueImpulse({ x: (Math.random() - 0.5) * m * 2, y: (Math.random() - 0.5) * m * 2, z: (Math.random() - 0.5) * m * 2 }, true);
        this._hitFx(new THREE.Vector3(t.x, t.y, t.z), w.knock * 0.6);
        any = true;
      }
    }
    if (any) g.cam.shake = Math.max(g.cam.shake, w.id === 'axe' ? 0.8 : 0.4);
  }

  /**
   * Long Arms: every noodle segment that whips past someone fast enough bonks them (blunt),
   * and the weapon on the right noodle's tip hits with its own stats. Speed is from each segment's own velocity.
   */
  _noodleContact(player) {
    const g = this.game;
    const r = player.ragdoll;
    const w = player.weapon;
    const pv = r.parts.pelvis.body.linvel();
    const pel = r.getPos(new THREE.Vector3());
    const ready = (key) => (this.contactUntil.get(key) ?? 0) <= g.time;
    const blows = new Map();   // target (ragdoll or prop) -> strongest { part, speed, dir, blade }
    const consider = (x, y, z, radius, speed, dir, blade) => {
      g.physics.overlapSphere(x, y, z, radius, (col) => {
        if (player.colliderHandles.has(col.handle)) return;
        const o = g.physics.ownerOf(col);
        if (!o) return;
        const key = o.type === 'part' ? o.ragdoll : o.type === 'prop' ? o.prop : null;
        if (!key || key === r || !ready(key)) return;
        const prev = blows.get(key);
        if (prev && prev.speed >= speed && (prev.blade || !blade)) return;
        blows.set(key, { o, speed, dir: dir.clone(), blade });
      });
    };
    const rel = new THREE.Vector3();
    for (const arm of player.noodles.arms) {
      arm.segs.forEach((s, i) => {
        const v = s.body.linvel();
        rel.set(v.x - pv.x, v.y - pv.y, v.z - pv.z);
        const speed = rel.length();
        if (speed < CONTACT_MIN_SPEED + 1) return;
        const t = s.body.translation();
        const dir = rel.clone().setY(0).normalize();
        const isTip = i === arm.segs.length - 1;
        consider(t.x, t.y, t.z, isTip ? 0.2 : 0.14, speed, dir, false);
        // the held weapon on the right noodle's tip
        if (isTip && arm.holdsWeapon && BLADE[w.id]) {
          const rot = s.body.rotation();
          _q.set(rot.x, rot.y, rot.z, rot.w);
          for (const d of [0.3, 0.65, 1.0]) {
            _a.set(0, -arm.segLen / 2 - BLADE[w.id][1] * d, 0).applyQuaternion(_q).add(_b.set(t.x, t.y, t.z));
            consider(_a.x, _a.y, _a.z, 0.2, speed * 1.2, dir, true);
          }
        }
      });
    }
    for (const [key, h] of blows) {
      this.contactUntil.set(key, g.time + CONTACT_COOLDOWN);
      const strength = h.blade ? w.knock * THREE.MathUtils.clamp(h.speed / 10, 0.5, 1.6) : THREE.MathUtils.clamp(h.speed * 0.6, 3, 11);
      const stun = h.blade ? w.stun * THREE.MathUtils.clamp(h.speed / 10, 0.5, 1.6) : THREE.MathUtils.clamp(h.speed * 0.06, 0.25, 1.0);
      if (h.o.type === 'part') {
        const rd = h.o.ragdoll;
        const part = h.o.part;
        const tp = rd.getPartPos(part, new THREE.Vector3());
        const dir = new THREE.Vector3(tp.x - pel.x, 0, tp.z - pel.z).normalize().multiplyScalar(0.3).addScaledVector(h.dir, 0.7);
        dir.y = 0.35; dir.normalize();
        this._hitFx(tp, strength);
        g.hitRagdoll(rd, part, dir, strength, stun, player, h.blade ? w.id : 'noodle');
      } else {
        const p = h.o.prop, pt = p.body.translation(), m = p.body.mass();
        const k = strength * 0.6;
        const dir = h.dir.clone().setY(0.5).normalize();
        p.body.applyImpulse({ x: dir.x * m * k, y: dir.y * m * k, z: dir.z * m * k }, true);
        this._hitFx(new THREE.Vector3(pt.x, pt.y, pt.z), k * 0.6);
      }
    }
    if (blows.size) g.cam.shake = Math.max(g.cam.shake, 0.3);
  }

  /** Everyone within the target's ragdoll -> overlapped part names, plus props, in a sphere. */
  _gather(player, x, y, z, radius, cooldownOk) {
    const g = this.game;
    const parts = new Map(), props = new Set();
    g.physics.overlapSphere(x, y, z, radius, (col) => {
      if (player.colliderHandles.has(col.handle)) return;
      const o = g.physics.ownerOf(col);
      if (!o) return;
      if (o.type === 'part') {
        if (o.ragdoll === player.ragdoll || !cooldownOk(o.ragdoll)) return;
        const arr = parts.get(o.ragdoll) || [];
        if (!arr.includes(o.part)) arr.push(o.part);
        parts.set(o.ragdoll, arr);
      } else if (o.type === 'prop' && cooldownOk(o.prop)) props.add(o.prop);
    });
    return { parts, props };
  }

  /** Each of your body parts that touches someone while moving fast at them bonks them (weaker than a weapon). */
  _bodyCollisions(player) {
    const g = this.game;
    const r = player.ragdoll;
    // body hits get their own cooldown key per ragdoll, separate from weapon hits
    const ready = (k) => (this.contactUntil.get(k.bodyKey ??= Symbol('body')) ?? 0) <= g.time;
    const best = new Map();   // target ragdoll -> strongest { part, toward, dir }
    for (const name of Object.keys(r.parts)) {
      if (r.isSevered(name)) continue;
      const part = r.parts[name];
      const v = part.body.linvel();
      if (Math.hypot(v.x, v.y, v.z) < BODY_MIN_SPEED) continue;      // cheap early out: most parts are slow
      const t = part.body.translation();
      const radius = part.def.r + (part.def.hh || 0) * 0.5 + 0.05;
      const { parts } = this._gather(player, t.x, t.y, t.z, radius, ready);
      for (const [rd, ps] of parts) {
        const hitPart = ps.includes('torso') ? 'torso' : ps[0];
        const tp = rd.getPartPos(hitPart, new THREE.Vector3());
        const dx = tp.x - t.x, dy = tp.y - t.y, dz = tp.z - t.z, d = Math.hypot(dx, dy, dz) || 1;
        const toward = (v.x * dx + v.y * dy + v.z * dz) / d;   // our part's speed into them
        if (toward < BODY_MIN_SPEED) continue;
        const prev = best.get(rd);
        if (!prev || toward > prev.toward) best.set(rd, { part: hitPart, toward, dir: new THREE.Vector3(v.x, 0, v.z).normalize().setY(0.3).normalize(), tp });
      }
    }
    for (const [rd, h] of best) {
      this.contactUntil.set(rd.bodyKey, g.time + BODY_COOLDOWN);
      this._hitFx(h.tp, h.toward * BODY_KNOCK_PER_MS);
      g.hitRagdoll(rd, h.part, h.dir, 2 + h.toward * BODY_KNOCK_PER_MS, h.toward * BODY_STUN_PER_MS, player, 'body');
    }
  }

  _hitFx(p, power) {
    this.game.effects.bonk(p.x, p.y + 0.3, p.z, power / 6);
    sfx.bonk(power / 8);
  }

  /** Guns: hitscan from the camera (skipping ahead of the camera in third person), tracers from the muzzle. */
  fireGun(player) {
    const g = this.game;
    const w = player.weapon;
    const cam = g.camera;
    const base = g.cam.forward(new THREE.Vector3());
    const origin = cam.position.clone().addScaledVector(base, g.cam.curDist);
    const mesh = player.weaponMeshes[w.id];
    mesh.updateWorldMatrix(true, false);
    const muzzle = mesh.localToWorld(mesh.userData.muzzle.clone());
    g.effects.muzzle(muzzle);
    sfx.gun();
    g.cam.shake = Math.max(g.cam.shake, w.id === 'shotgun' ? 0.5 : w.explosive ? 0.6 : w.id === 'sniper' ? 0.55 : (w.id === 'smg' || w.id === 'minigun') ? 0.12 : 0.25);

    const n = w.pellets || 1;
    const right = new THREE.Vector3().crossVectors(base, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, base).normalize();
    for (let i = 0; i < n; i++) {
      const dir = base.clone();
      if (w.spread) dir.addScaledVector(right, (Math.random() - 0.5) * 2 * w.spread).addScaledVector(up, (Math.random() - 0.5) * 2 * w.spread).normalize();
      const hit = g.physics.castRay(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, w.range, undefined,
        (c) => !player.colliderHandles.has(c.handle));
      const end = hit ? new THREE.Vector3(hit.x, hit.y, hit.z) : origin.clone().addScaledVector(dir, w.range);
      g.effects.tracer(muzzle, end);
      if (!hit && !w.explosive) continue;
      if (w.explosive) {   // rockets blow up where they hit, or at max range if they hit nothing
        const delay = muzzle.distanceTo(end) / (w.speed || 70);
        g.timers.push({ t: delay, fn: () => this.explode(end, w.blast, w.knock, player, w.id) });
        continue;
      }
      const o = g.physics.ownerOf(hit.collider);
      const falloff = w.id === 'sniper' ? 0 : Math.min(1, hit.toi / (w.id === 'shotgun' ? 22 : 60));
      if (o && o.type === 'part') {
        const k = THREE.MathUtils.lerp(w.knock, 2.5, falloff);
        this._hitFx(end, k * 0.8);
        g.hitRagdoll(o.ragdoll, o.part, dir.clone().setY(dir.y * 0.5 + 0.15).normalize(), k, w.stun, player, w.id);
      } else if (o && o.type === 'prop') {
        const p = o.prop; const m = p.body.mass();
        const k = THREE.MathUtils.lerp(7, 2, falloff);
        p.body.applyImpulseAtPoint({ x: dir.x * m * k, y: dir.y * m * k + m, z: dir.z * m * k }, end, true);
        this._hitFx(end, 4);
      } else {
        g.effects.bonk(end.x, end.y, end.z, 0.2, false); // tiny spark of stars on walls
      }
    }
  }

  /** Radial blast: shoves every ragdoll part and prop in range away from `at`. */
  explode(at, radius, power, source, weaponId = 'rocket') {
    const g = this.game;
    g.effects.bonk(at.x, at.y + 0.3, at.z, 3);
    g.effects.bonk(at.x, at.y + 0.8, at.z, 3, false);
    g.effects.muzzle(at.clone().setY(at.y + 0.6));
    sfx.gun(); sfx.boing();
    const dc = g.camera.position.distanceTo(at);
    g.cam.shake = Math.max(g.cam.shake, Math.min(1.2, 14 / (dc + 6)));
    const done = new Set();
    g.physics.overlapSphere(at.x, at.y, at.z, radius, (col) => {
      const o = g.physics.ownerOf(col);
      if (!o) return;
      if (o.type === 'part') {
        if (o.ragdoll === source.ragdoll) return;
        const tp = o.ragdoll.getPartPos(o.part, new THREE.Vector3());
        const d = tp.distanceTo(at);
        const fall = 1 - Math.min(1, d / radius);
        const dir = new THREE.Vector3(tp.x - at.x, 0, tp.z - at.z);
        if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
        dir.normalize(); dir.y = 0.8; dir.normalize();
        if (done.has(o.ragdoll) && !o.ragdoll.isSevered(o.part)) { o.ragdoll.parts[o.part].body.applyImpulse({ x: dir.x * fall * power, y: dir.y * fall * power, z: dir.z * fall * power }, true); return; }
        done.add(o.ragdoll);
        g.hitRagdoll(o.ragdoll, o.part, dir, power * (0.4 + fall), 2, source, weaponId);
      } else if (o.type === 'prop' && !done.has(o.prop)) {
        done.add(o.prop);
        const p = o.prop, t = p.body.translation(), m = p.body.mass();
        const dir = new THREE.Vector3(t.x - at.x, 0.6, t.z - at.z).normalize();
        const fall = 1 - Math.min(1, new THREE.Vector3(t.x, t.y, t.z).distanceTo(at) / radius);
        const k = power * (0.3 + fall) * 0.8;
        p.body.applyImpulse({ x: dir.x * m * k, y: dir.y * m * k, z: dir.z * m * k }, true);
        p.body.applyTorqueImpulse({ x: (Math.random() - 0.5) * m * 3, y: (Math.random() - 0.5) * m * 3, z: (Math.random() - 0.5) * m * 3 }, true);
      }
    });
  }
}
