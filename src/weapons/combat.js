// Melee sphere sweeps, hitscan gun, impulses on whatever got hit.
import * as THREE from 'three';
import { G, groups } from '../physics.js';
import { sfx } from '../audio.js';
import { LIMB_OF_PART } from '../ragdoll.js';

export class Combat {
  constructor(game) { this.game = game; }

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
        g.hitRagdoll(target, h.o.part, dir, w.knock, w.stun, player, w.id);
        any = true;
      } else if (h.o.type === 'prop') {
        const p = h.o.prop;
        const t = p.body.translation();
        const dir = new THREE.Vector3(t.x - pel.x, 0.4, t.z - pel.z).normalize();
        const m = p.body.mass();
        p.body.applyImpulse({ x: dir.x * m * w.knock * 0.7, y: dir.y * m * w.knock * 0.7, z: dir.z * m * w.knock * 0.7 }, true);
        p.body.applyTorqueImpulse({ x: (Math.random() - 0.5) * m * 2, y: (Math.random() - 0.5) * m * 2, z: (Math.random() - 0.5) * m * 2 }, true);
        this._hitFx(new THREE.Vector3(t.x, t.y, t.z), w.knock * 0.6);
        any = true;
      }
    }
    if (any) g.cam.shake = Math.max(g.cam.shake, w.id === 'axe' ? 0.8 : 0.4);
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
    g.cam.shake = Math.max(g.cam.shake, w.id === 'shotgun' ? 0.5 : w.explosive ? 0.6 : w.id === 'smg' ? 0.12 : 0.25);

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
      if (!hit) continue;
      if (w.explosive) {
        const delay = muzzle.distanceTo(end) / 70;
        g.timers.push({ t: delay, fn: () => this.explode(end, w.blast, w.knock, player, w.id) });
        continue;
      }
      const o = g.physics.ownerOf(hit.collider);
      const falloff = Math.min(1, hit.toi / (w.id === 'shotgun' ? 22 : 60));
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
        const key = o.ragdoll.owner;
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
