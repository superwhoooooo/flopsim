// Thrown things hurt: anything flung by the Lift Beam or the Grapple Hook (people, crates, barrels...) is a projectile
// for a little while. If it smashes into someone while still moving fast, they get bonked - harder the faster it's
// going (and the heavier it is). The thrower gets the credit. Runs wherever the thing is actually being simulated
// (single player, or the multiplayer host for the shared town; a thrown friend's own game for them).
import * as THREE from 'three';
import { sfx } from './audio.js';

const LIFETIME = 2.5;        // s a thrown thing stays dangerous
const MIN_SPEED = 6;         // m/s: slower than this does nothing
const COOLDOWN = 0.6;        // s before the same thing can hit the same person again
const ARM_TIME = 0.08;       // s after the throw before it can hit (so it doesn't clip whoever is next to the thrower)

const _p = new THREE.Vector3(), _box = new THREE.Box3(), _sph = new THREE.Sphere();

export class Thrown {
  constructor(game) {
    this.game = game;
    this.list = [];
  }

  /** Something was just thrown. `ragdoll` (a person) or `prop`; `by` = who threw it (the player, or a friend). */
  add({ ragdoll = null, prop = null, by = null }) {
    if (!ragdoll && !prop) return;
    const g = this.game;
    // a joined player's townspeople / props are puppets of the host's: the host tracks those
    if (g.net?.isClient && (prop?.proxy || (ragdoll && ragdoll.owner && !ragdoll.owner.isRemote && ragdoll !== g.player.ragdoll))) return;
    this.list = this.list.filter((e) => e.ragdoll !== ragdoll || e.prop !== prop);
    let radius = 0.75, massK = 1;
    if (prop) {
      prop._hitR ??= (_box.setFromObject(prop.mesh).getBoundingSphere(_sph).radius || 0.5);
      radius = Math.min(3, prop._hitR + 0.25);
      massK = THREE.MathUtils.clamp(0.7 + prop.body.mass() / 40, 0.7, 2.5);   // light things still sting; heavy things hit harder
    }
    this.list.push({ ragdoll, prop, by, t: 0, radius, massK, hits: new Map() });
  }

  step(dt) {
    if (!this.list.length) return;
    const g = this.game;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      e.t += dt;
      let body;
      try {
        body = e.prop ? e.prop.body : e.ragdoll.parts.pelvis.body;
        const t = body.translation(); _p.set(t.x, t.y, t.z);
      } catch (err) { this.list.splice(i, 1); continue; }   // it was removed from the world
      if (e.t > LIFETIME) { this.list.splice(i, 1); continue; }
      if (e.t < ARM_TIME) continue;
      const v = body.linvel(), speed = Math.hypot(v.x, v.y, v.z);
      if (speed < MIN_SPEED) continue;
      // who is it touching?
      const victims = new Map();
      g.physics.overlapSphere(_p.x, _p.y, _p.z, e.radius, (col) => {
        const o = g.physics.ownerOf(col);
        if (!o || o.type !== 'part') return;
        const rd = o.ragdoll;
        if (rd === e.ragdoll || rd === e.by?.ragdoll) return;                 // not itself, not the thrower
        if ((e.hits.get(rd) ?? -9) > g.time - COOLDOWN) return;
        if (!victims.has(rd)) victims.set(rd, o.part);
      });
      for (const [rd, part] of victims) {
        e.hits.set(rd, g.time);
        const strength = THREE.MathUtils.clamp(speed * 0.45 * e.massK, 3, 20);
        const stun = THREE.MathUtils.clamp(speed * 0.055 * e.massK, 0.3, 3);   // ~18 m/s person: a knockout
        const dir = new THREE.Vector3(v.x, 0, v.z).normalize().setY(0.35).normalize();
        const at = rd.getPartPos(part, new THREE.Vector3());
        g.effects.bonk(at.x, at.y + 0.3, at.z, strength / 7);
        sfx.bonk(Math.min(1.4, strength / 10));
        g.hitRagdoll(rd, part, dir, strength, stun, e.by, 'thrown');
      }
    }
  }
}
