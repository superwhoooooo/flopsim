// Abilities: unlocked by quests, sit in a hotbar slot like a line (see dialogue/lines.js `ability`),
// and fire when you press that slot's number key. Each has a cooldown.
import * as THREE from 'three';
import { RAPIER, G, groups } from './physics.js';
import { getMat } from './ragdoll.js';
import { sfx } from './audio.js';

export const ABILITIES = {
  longarms: { name: 'Long Arms', cooldown: 25, duration: 8, desc: 'Your arms turn into long floppy noodles for 8 seconds.' },
  npcrain: { name: 'NPC Rain', cooldown: 30, desc: 'The nearest townsfolk fall out of the sky on top of you.' },
  superjump: { name: 'Super Jump', cooldown: 6, desc: 'Jump really, really high.' },
  bonkwave: { name: 'Bonk Wave', cooldown: 20, desc: 'A shockwave that knocks down everyone around you.' },
};

// Long Arms: each arm grows a floppy physics chain of segments hanging off the forearm.
const NOODLE_SEGS = 8;          // segments per arm
const NOODLE_SEG_LEN = 0.5;     // m each -> 4 m of extra arm
const NOODLE_R = 0.05;          // thickness
const NOODLE_MASS = 0.15;       // kg per segment (light, so they don't drag you around)
const NOODLE_DAMPING = 0.6;     // angular damping: lower = floppier
const NOODLE_GRAVITY = 0.35;    // fraction of normal gravity: they hang and flop but don't lie dragging on the ground
const NOODLE_SNAG = 1.4;        // if a noodle stretches past this x its length (stuck in something), snap it back
const RAIN_COUNT = 8;
const SUPER_JUMP_SPEED = 17;   // normal jump is 6.4
const WAVE_RADIUS = 8, WAVE_POWER = 13;

export class Abilities {
  constructor(game) {
    this.game = game;
    this.readyAt = {};          // ability id -> game time it can be used again
    this.longArmsUntil = 0;
  }

  /** Grow noodle arms on the player (physics chains), moving held weapons to the right noodle's tip. */
  _growNoodles() {
    const p = this.game.player;
    if (p.noodles) return;
    const right = new Noodle(this.game, p.ragdoll, 'lArmR', 0xf2c9a0);
    const left = new Noodle(this.game, p.ragdoll, 'lArmL', 0xf2c9a0);
    right.holdsWeapon = true;
    const tip = right.segs[right.segs.length - 1].mesh;
    for (const m of Object.values(p.weaponMeshes)) { tip.add(m); m.position.set(0, -NOODLE_SEG_LEN / 2, 0); }
    p.noodles = { arms: [right, left] };
    for (const a of p.noodles.arms) for (const s of a.segs) p.colliderHandles.add(s.collider.handle);   // our guns/swings ignore them
  }

  _shrinkNoodles() {
    const p = this.game.player;
    if (!p.noodles) return;
    for (const m of Object.values(p.weaponMeshes)) { p.handMesh.add(m); m.position.set(0, -0.16, 0); }
    for (const a of p.noodles.arms) { for (const s of a.segs) p.colliderHandles.delete(s.collider.handle); a.dispose(); }
    p.noodles = null;
    sfx.pop?.();
  }

  /** Try to use an ability. Returns true if it fired. */
  use(id) {
    const g = this.game;
    const a = ABILITIES[id];
    if (!a) return false;
    const left = (this.readyAt[id] ?? 0) - g.time;
    if (left > 0) { g.hud.toast(`${a.name} is recharging (${Math.ceil(left)}s)`, ''); sfx.error(); return false; }
    const fired = this['_' + id]();
    if (fired === false) return false;
    this.readyAt[id] = g.time + a.cooldown;
    return true;
  }

  get longArmsActive() { return this.game.time < this.longArmsUntil; }

  _longarms() {
    if (this.game.driving.active) return false;
    this.longArmsUntil = this.game.time + ABILITIES.longarms.duration;
    this._growNoodles();
    this.game.hud.toast('Long Arms!', 'unlock');
    sfx.boing();
  }

  _npcrain() {
    const g = this.game;
    const pp = g.player.ragdoll.getPos(new THREE.Vector3());
    // ordinary townsfolk only: quest givers, the baker and shopkeepers stay put
    const pool = g.npcs.filter((n) => !n.def.special && !n.isShop && !n.isBaker && n.state !== 'axe')
      .sort((a, b) => a.pos.distanceToSquared(pp) - b.pos.distanceToSquared(pp))
      .slice(0, RAIN_COUNT);
    if (!pool.length) return false;
    pool.forEach((n, i) => {
      const ang = Math.random() * Math.PI * 2, rad = Math.random() * 1.3;
      n.ragdoll.teleport(pp.x + Math.cos(ang) * rad, pp.y + 5 + i * 1.3, pp.z + Math.sin(ang) * rad);
      n.ragdoll.knockout(2.5 + i * 0.3);   // flop down limp
      n.setState('wander', 0);
    });
    g.hud.toast('It is raining people!', 'unlock');
    sfx.boing();
  }

  _superjump() {
    const r = this.game.player.ragdoll;
    if (!r.grounded || r.mode !== 'active') { this.game.hud.toast('You need to be standing on the ground', ''); return false; }
    r.hop(SUPER_JUMP_SPEED);
    sfx.jump(); sfx.boing();
  }

  _bonkwave() {
    const g = this.game;
    const pp = g.player.ragdoll.getPos(new THREE.Vector3());
    g.combat.explode(pp, WAVE_RADIUS, WAVE_POWER, g.player, 'bonkwave');
  }

  /** Per fixed step: noodles go away when the time is up or you get in a car; snagged noodles snap back. */
  step() {
    const p = this.game.player;
    if (!p.noodles) return;
    if (!this.longArmsActive || this.game.driving.active) { this._shrinkNoodles(); return; }
    for (const a of p.noodles.arms) if (a.snagged()) a.reset();
  }

  /** Per render frame: move noodle meshes to their physics bodies. */
  sync() {
    if (this.game.player.noodles) for (const a of this.game.player.noodles.arms) a.sync();
  }
}

/** A chain of capsule bodies joined by ball joints, hanging off the end of a ragdoll forearm. */
class Noodle {
  constructor(game, ragdoll, partName, skin) {
    this.game = game;
    this.segLen = NOODLE_SEG_LEN;
    this.segs = [];
    this.group = new THREE.Group();
    game.scene.add(this.group);
    const world = game.physics.world;
    const base = ragdoll.parts[partName].body;
    this.base = base;
    const mat = getMat(skin, { roughness: 0.55 });
    const geo = new THREE.CapsuleGeometry(NOODLE_R, NOODLE_SEG_LEN - 2 * NOODLE_R + 0.06, 4, 10);
    const L = NOODLE_SEG_LEN;
    let parent = base, parentAnchor = -0.16;   // bottom of the forearm capsule
    for (let i = 0; i < NOODLE_SEGS; i++) {
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
        .setLinearDamping(0.05).setAngularDamping(NOODLE_DAMPING).setGravityScale(NOODLE_GRAVITY)
        .setCcdEnabled(true).setCanSleep(false));
      // slippery, and only bumps into the world (ground, walls), so it slides instead of snagging on things
      const collider = world.createCollider(RAPIER.ColliderDesc.capsule(L / 2 - NOODLE_R, NOODLE_R)
        .setMass(NOODLE_MASS).setFriction(0).setRestitution(0.1)
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
        .setCollisionGroups(groups(G.LIMB, G.WORLD)), body);
      const j = world.createImpulseJoint(RAPIER.JointData.spherical({ x: 0, y: parentAnchor, z: 0 }, { x: 0, y: L / 2, z: 0 }), parent, body, true);
      try { j.setContactsEnabled(false); } catch (e) { /* ignore */ }
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      this.group.add(mesh);
      this.segs.push({ body, collider, mesh });
      parent = body; parentAnchor = -L / 2;
    }
    // a fist on the end
    const fist = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), mat);
    fist.position.y = -L / 2; fist.castShadow = true;
    this.segs[this.segs.length - 1].mesh.add(fist);
    this.length = 0.16 + L * NOODLE_SEGS;
    this.reset();
  }

  /** Lay the chain out straight from the forearm, moving with it. */
  reset() {
    const base = this.base;
    const t = base.translation(), rot = base.rotation(), v = base.linvel();
    const down = new THREE.Vector3(0, -1, 0).applyQuaternion(new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w));
    this.segs.forEach((s, i) => {
      const c = new THREE.Vector3(t.x, t.y, t.z).addScaledVector(down, 0.16 + this.segLen * (i + 0.5));
      s.body.setTranslation({ x: c.x, y: c.y, z: c.z }, true);
      s.body.setRotation({ x: rot.x, y: rot.y, z: rot.z, w: rot.w }, true);
      s.body.setLinvel({ x: v.x, y: v.y, z: v.z }, true);
      s.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    });
    this.sync();
  }

  /** Stuck: the tip is much further from the hand than the noodle is long. */
  snagged() {
    const a = this.base.translation(), b = this.segs[this.segs.length - 1].body.translation();
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) > this.length * NOODLE_SNAG;
  }

  sync() {
    for (const s of this.segs) {
      const t = s.body.translation(), r = s.body.rotation();
      s.mesh.position.set(t.x, t.y, t.z);
      s.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }

  dispose() {
    for (const s of this.segs) this.game.physics.world.removeRigidBody(s.body);   // also removes its collider + joints
    this.game.scene.remove(this.group);
    this.segs = [];
  }
}
