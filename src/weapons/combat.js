// Melee sphere sweeps, hitscan gun, impulses on whatever got hit.
import * as THREE from 'three';
import { G, groups } from '../physics.js';
import { sfx } from '../audio.js';

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
    const cb = (col) => {
      if (player.colliderHandles.has(col.handle)) return;
      const o = g.physics.ownerOf(col);
      if (!o) return;
      const key = o.type === 'part' ? o.ragdoll : o.prop;
      if (seen.has(key)) {
        // prefer head/torso part if multiple
        return;
      }
      seen.add(key);
      hits.push({ o, col });
    };
    for (const f of [0.35, 0.7, 1.0]) {
      g.physics.overlapSphere(pel.x + fwd.x * w.range * f, pel.y + 0.35, pel.z + fwd.z * w.range * f, w.radius, cb);
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

  /** Gun: hitscan from the camera (skipping ahead of the camera in third person), tracer from the muzzle. */
  fireGun(player) {
    const g = this.game;
    const cam = g.camera;
    const dir = g.cam.forward(new THREE.Vector3());
    const origin = cam.position.clone().addScaledVector(dir, g.cam.curDist);
    const hit = g.physics.castRay(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, 90, undefined,
      (c) => !player.colliderHandles.has(c.handle));
    const end = hit ? new THREE.Vector3(hit.x, hit.y, hit.z) : origin.clone().addScaledVector(dir, 90);
    // muzzle position in world space
    const mesh = player.weaponMeshes.gun;
    mesh.updateWorldMatrix(true, false);
    const muzzle = mesh.localToWorld(mesh.userData.muzzle.clone());
    g.effects.tracer(muzzle, end);
    g.effects.muzzle(muzzle);
    sfx.gun();
    g.cam.shake = Math.max(g.cam.shake, 0.25);
    if (hit) {
      const o = g.physics.ownerOf(hit.collider);
      const w = player.weapon;
      if (o && o.type === 'part') {
        const k = THREE.MathUtils.lerp(w.knock, 3, Math.min(1, hit.toi / 60));
        this._hitFx(end, k * 0.8);
        g.hitRagdoll(o.ragdoll, o.part, dir.clone().setY(dir.y * 0.5 + 0.15).normalize(), k, w.stun, player, 'gun');
      } else if (o && o.type === 'prop') {
        const p = o.prop; const m = p.body.mass();
        const k = THREE.MathUtils.lerp(7, 2, Math.min(1, hit.toi / 60));
        p.body.applyImpulseAtPoint({ x: dir.x * m * k, y: dir.y * m * k + m, z: dir.z * m * k }, end, true);
        this._hitFx(end, 4);
      } else {
        g.effects.bonk(end.x, end.y, end.z, 0.2, false); // tiny spark of stars on walls
      }
    }
  }
}
