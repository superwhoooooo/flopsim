// Player: input -> ragdoll motion, weapon pose/swing animation, weapon meshes in hand.
import * as THREE from 'three';
import { Ragdoll } from './ragdoll.js';
import { WEAPONS, WEAPON_ORDER, STARTER_WEAPONS, createWeaponMesh } from './weapons/weapons.js';
import { sfx } from './audio.js';

const ease = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

// right-arm keyframes: [swing, elbow]
const REST = [-0.6, -2.0];
const RAISED = [-2.9, -0.15];
const STRIKE = [-0.5, -0.1];
const SPIN_SPEED = 13;   // rad/s while holding Q (~2 turns per second)

export class Player {
  constructor(game, x, z) {
    this.game = game;
    this.ragdoll = new Ragdoll(game.physics, game.scene, {
      owner: this, isPlayer: true, skin: 0xf2c9a0, shirt: 0xe0442f, pants: 0x2f5fb3, boots: 0x3a2a1c,
      decorate: (head) => {
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffc107 }));
        cap.position.y = 0.04; cap.castShadow = true; head.add(cap);
        const bill = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.14), new THREE.MeshStandardMaterial({ color: 0xffc107 }));
        bill.position.set(0, 0.07, 0.17); head.add(bill);
      },
    });
    this.ragdoll.spawn(x, z, 0);
    this.ragdoll.turnSpeed = 12;
    this.weaponId = 'sword';
    this.owned = new Set(STARTER_WEAPONS.concat('sword'));
    this.vehicle = null;        // car prop while driving
    this.weaponMeshes = {};
    const hand = this.ragdoll.parts.lArmR.mesh;
    for (const id of Object.keys(WEAPONS)) {
      const m = createWeaponMesh(id);
      m.position.set(0, -0.16, 0);
      m.visible = false;
      hand.add(m);
      this.weaponMeshes[id] = m;
    }
    this.weaponMeshes[this.weaponId].visible = true;
    this.handMesh = hand;
    this.noodles = null;        // Long Arms: { arms: [right, left] } of physics noodle arms, see abilities.js
    this.attack = null;         // { t, weapon, hitDone }
    this.gunCooldown = 0;
    this.recoil = 0;
    this.lunge = 0;
    this.jumpPrev = false;
    this.facingFromMove = 0;
    this.colliderHandles = new Set(Object.values(this.ragdoll.parts).map((p) => p.collider.handle));
  }

  /** Weapons in wheel order. */
  ownedList() { return WEAPON_ORDER.filter((id) => this.owned.has(id)); }

  /** Add a weapon to the inventory and equip it. Returns true if it was new. */
  pickup(id) {
    if (!WEAPONS[id]) return false;
    const isNew = !this.owned.has(id);
    this.owned.add(id);
    this.equip(id);
    this.game.wheel?.setItems(this.ownedList());
    return isNew;
  }

  equip(id) {
    if (!WEAPONS[id] || !this.owned.has(id) || id === this.weaponId) return;
    this.weaponMeshes[this.weaponId].visible = false;
    this.weaponId = id;
    this.weaponMeshes[id].visible = true;
    this.attack = null;
    this.game.hud?.setWeapon(id);
    sfx.equip();
  }

  get weapon() { return WEAPONS[this.weaponId]; }

  tryAttack() {
    const r = this.ragdoll;
    if (this.vehicle) return;
    if (r.mode !== 'active' && !(r.mode === 'recover' && r.ctrl > 0.8)) return;
    const w = this.weapon;
    if (w.melee) {
      if (this.attack || this.spinning) return;
      this.attack = { t: 0, weapon: w, hitDone: false };
      sfx.swing(w.id === 'axe' || w.id === 'sledge');
    } else {
      if (this.gunCooldown > 0) return;
      this.gunCooldown = w.cooldown;
      this.recoil = 1;
      this.game.combat.fireGun(this);
    }
  }

  /** Called once per fixed step before ragdoll.update */
  brain(dt, input, camRig) {
    const r = this.ragdoll;
    this.gunCooldown = Math.max(0, this.gunCooldown - dt);
    this.recoil = Math.max(0, this.recoil - dt * 6);
    r.pose = {};
    r.desired.x = 0; r.desired.z = 0;
    if (r.mode === 'limp') { this.attack = null; this.spinning = false; r.turnSpeed = 12; return; }

    // movement relative to camera
    const f = camRig.flatForward(new THREE.Vector3());
    const rt = camRig.flatRight(new THREE.Vector3());
    let mx = 0, mz = 0;
    if (input.down('KeyW')) { mx += f.x; mz += f.z; }
    if (input.down('KeyS')) { mx -= f.x; mz -= f.z; }
    if (input.down('KeyD')) { mx += rt.x; mz += rt.z; }
    if (input.down('KeyA')) { mx -= rt.x; mz -= rt.z; }
    const len = Math.hypot(mx, mz);
    const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
    const speed = sprint ? 6.0 : 3.4;
    const canMove = !this.game.paused;
    if (len > 0.01 && canMove) {
      mx /= len; mz /= len;
      r.desired.x = mx * speed; r.desired.z = mz * speed;
    }
    // facing
    const w = this.weapon;
    const faceCam = camRig.mode === 'first' || !w.melee || this.attack || this.game.faceCamTimer > 0;
    if (faceCam) r.targetYaw = camRig.yaw;
    else if (len > 0.01) r.targetYaw = Math.atan2(mx, mz);

    // hold R: spin in circles with the weapon arm out (the blade hurts whatever it sweeps through)
    this.spinning = input.down('KeyR') && canMove && !this.vehicle;
    if (this.spinning) {
      this.attack = null;
      r.targetYaw = r.yaw + 1.5;   // always ahead of us, so we turn at full speed
    }
    r.turnSpeed = this.spinning ? SPIN_SPEED : 12;

    // jump
    const jump = input.down('Space');
    if (jump && !this.jumpPrev && canMove && r.grounded && r.mode === 'active') { r.hop(6.4); sfx.jump(); }
    this.jumpPrev = jump;

    // lunge during melee strike
    if (this.lunge > 0) {
      this.lunge -= dt;
      const fw = r.getForward(new THREE.Vector3());
      r.desired.x += fw.x * 3.5; r.desired.z += fw.z * 3.5;
    }

    this._armPose(dt, camRig);
  }

  _armPose(dt, camRig) {
    const r = this.ragdoll;
    const w = this.weapon;
    let sw = REST[0], el = REST[1], gain = 1.6;
    if (!w.melee) {
      // gun: aim forward, follow camera pitch, kick on recoil
      const p = camRig.pitch;
      sw = -1.3 - p - this.recoil * 0.35; el = -0.27 + this.recoil * 0.1; gain = 2.2;
    }
    if (this.attack) {
      const a = this.attack;
      a.t += dt;
      const { windup, strike, recover } = w;
      gain = 3.2;
      if (a.t < windup) {
        const k = ease(a.t / windup);
        sw = lerp(REST[0], RAISED[0], k); el = lerp(REST[1], RAISED[1], k);
      } else if (a.t < windup + strike) {
        const k = ease((a.t - windup) / strike);
        sw = lerp(RAISED[0], STRIKE[0], k); el = lerp(RAISED[1], STRIKE[1], k);
        if (!a.hitDone && k > 0.45) {
          a.hitDone = true;
          this.lunge = 0.14;
          this.game.combat.meleeSwing(this, w);
        }
      } else if (a.t < windup + strike + recover) {
        const k = ease((a.t - windup - strike) / recover);
        sw = lerp(STRIKE[0], REST[0], k); el = lerp(STRIKE[1], REST[1], k);
      } else this.attack = null;
    }
    if (this.spinning) {
      // both arms straight out to the sides, weapon pointing outward
      r.pose.armR = { swing: -0.15, elbow: -0.05, side: 1.45, gain: 3.2 };
      r.pose.armL = { swing: -0.15, elbow: -0.1, side: 1.3, gain: 1.6 };
      return;
    }
    r.pose.armR = { swing: sw, elbow: el, side: 0.04, gain };
    if (this.attack) r.pose.lean = this.attack.t < w.windup ? -0.15 : 0.35;
  }

  update(dt) {
    this.ragdoll.update(dt);
  }
}
