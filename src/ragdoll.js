// Shared ragdoll for player + NPCs. Capsule bodies joined by spherical/revolute joints.
// "active": PD torques keep it upright, a hover spring supports the weight, velocity is blended toward the
//           desired walk velocity, limbs follow a floppy procedural walk.
// "limp":   all motors off (true ragdoll) for a few seconds after a strong hit.
// "recover": control gains ramp up from 0 to 1 so the body gets back up.
import * as THREE from 'three';
import { RAPIER, G, groups, FIXED_DT } from './physics.js';

const V = (x, y, z) => ({ x, y, z });

// Part definitions. Positions are for a character standing at the origin, facing +Z (+X is the character's left).
export const PARTS = {
  pelvis: { shape: 'cap', hh: 0.07, r: 0.17, pos: [0, 0.95, 0], mass: 12, trunk: true, kp: 260, kd: 32 },
  torso:  { shape: 'cap', hh: 0.13, r: 0.18, pos: [0, 1.25, 0], mass: 20, trunk: true, kp: 260, kd: 32, parent: 'pelvis', anchor: [0, 1.09, 0] },
  head:   { shape: 'ball', r: 0.15, pos: [0, 1.62, 0], mass: 5, trunk: true, kp: 110, kd: 14, parent: 'torso', anchor: [0, 1.47, 0] },
  uArmL:  { shape: 'cap', hh: 0.12, r: 0.055, pos: [0.27, 1.195, 0], mass: 2, kp: 90, kd: 11, parent: 'torso', anchor: [0.27, 1.37, 0] },
  lArmL:  { shape: 'cap', hh: 0.11, r: 0.05, pos: [0.27, 0.865, 0], mass: 1.4, kp: 90, kd: 11, parent: 'uArmL', anchor: [0.27, 1.02, 0], hinge: [-2.5, 0.05] },
  uArmR:  { shape: 'cap', hh: 0.12, r: 0.055, pos: [-0.27, 1.195, 0], mass: 2, kp: 90, kd: 11, parent: 'torso', anchor: [-0.27, 1.37, 0] },
  lArmR:  { shape: 'cap', hh: 0.11, r: 0.05, pos: [-0.27, 0.865, 0], mass: 1.4, kp: 90, kd: 11, parent: 'uArmR', anchor: [-0.27, 1.02, 0], hinge: [-2.5, 0.05] },
  uLegL:  { shape: 'cap', hh: 0.17, r: 0.07, pos: [0.1, 0.66, 0], mass: 7, kp: 140, kd: 17, parent: 'pelvis', anchor: [0.1, 0.9, 0] },
  lLegL:  { shape: 'cap', hh: 0.15, r: 0.065, pos: [0.1, 0.24, 0], mass: 4, kp: 140, kd: 17, parent: 'uLegL', anchor: [0.1, 0.46, 0], hinge: [-0.05, 2.4] },
  uLegR:  { shape: 'cap', hh: 0.17, r: 0.07, pos: [-0.1, 0.66, 0], mass: 7, kp: 140, kd: 17, parent: 'pelvis', anchor: [-0.1, 0.9, 0] },
  lLegR:  { shape: 'cap', hh: 0.15, r: 0.065, pos: [-0.1, 0.24, 0], mass: 4, kp: 140, kd: 17, parent: 'uLegR', anchor: [-0.1, 0.46, 0], hinge: [-0.05, 2.4] },
};
export const PART_NAMES = Object.keys(PARTS);
const TOTAL_MASS = PART_NAMES.reduce((s, n) => s + PARTS[n].mass, 0);

const HOVER_H = 1.02;       // ray distance from pelvis at which the hover spring starts
const SPRING_KP = 150;
const SPRING_KD = 24;
const SPRING_MAX_ACC = 24;

const matCache = new Map();
export function getMat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...opts });
    matCache.set(key, m);
  }
  return m;
}

const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const tmpQ3 = new THREE.Quaternion();
const yawQ = new THREE.Quaternion();
const AX = new THREE.Vector3(1, 0, 0);
const AZ = new THREE.Vector3(0, 0, 1);
const AY = new THREE.Vector3(0, 1, 0);

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class Ragdoll {
  /**
   * @param physics Physics instance
   * @param scene THREE.Scene (may be null in headless tests)
   * @param opts { skin, shirt, pants, boots, headShape:'ball'|'box', isPlayer, owner }
   */
  constructor(physics, scene, opts = {}) {
    this.physics = physics;
    this.scene = scene;
    this.opts = opts;
    this.owner = opts.owner || this;
    this.isPlayer = !!opts.isPlayer;
    this.parts = {};
    this.joints = [];
    this.group = new THREE.Group();
    this.anchor = new THREE.Object3D(); // for speech bubbles / labels, follows head
    if (scene) { scene.add(this.group); scene.add(this.anchor); }

    this.mode = 'active';
    this.ctrl = 1;
    this.limpTimer = 0;
    this.stun = 0;
    this.staggerTimer = 0;
    this.yaw = 0;
    this.targetYaw = 0;
    this.turnSpeed = 9;
    this.desired = { x: 0, z: 0 };    // desired world velocity
    this.walkPhase = Math.random() * 6;
    this.speedNorm = 0;
    this.groundDist = 99;
    this.grounded = false;
    this.pose = {};                   // optional animation overrides, see applyPose
    this.lean = 0;
    this.time = Math.random() * 10;
    this.home = { x: 0, z: 0 };
    this.onKnockout = null;           // callbacks
    this.onGetUp = null;
    this.lastHitTime = -999;
    this.hopCooldown = 0;
    this.headLook = 0;

    this._build();
  }

  _build() {
    const { world } = this.physics;
    const o = this.opts;
    const skin = o.skin ?? 0xf0c8a0, shirt = o.shirt ?? 0x4477cc, pants = o.pants ?? 0x333a55, boots = o.boots ?? 0x2a2a2a;
    for (const name of PART_NAMES) {
      const d = PARTS[name];
      const desc = RAPIER.RigidBodyDesc.dynamic().setTranslation(d.pos[0], d.pos[1], d.pos[2])
        .setLinearDamping(0.1).setAngularDamping(2.5).setCanSleep(false);
      const body = world.createRigidBody(desc);
      const cdesc = (d.shape === 'ball' ? RAPIER.ColliderDesc.ball(d.r) : RAPIER.ColliderDesc.capsule(d.hh, d.r))
        .setMass(d.mass).setFriction(0.8).setRestitution(0.0)
        .setCollisionGroups(d.trunk ? groups(G.TRUNK, G.WORLD | G.PROP | G.TRUNK) : groups(G.LIMB, G.WORLD | G.PROP));
      const collider = world.createCollider(cdesc, body);
      this.physics.registerCollider(collider, { type: 'part', ragdoll: this, part: name, owner: this.owner });

      let geo, color;
      if (d.shape === 'ball') {
        geo = o.headShape === 'box' ? new THREE.BoxGeometry(d.r * 1.9, d.r * 1.9, d.r * 1.9) : new THREE.SphereGeometry(d.r, 16, 12);
        color = skin;
      } else {
        geo = new THREE.CapsuleGeometry(d.r, d.hh * 2, 4, 10);
        if (name === 'pelvis') color = pants;
        else if (name === 'torso' || name.startsWith('uArm')) color = shirt;
        else if (name.startsWith('lArm')) color = skin;
        else if (name.startsWith('uLeg')) color = pants;
        else color = boots;
      }
      const mesh = new THREE.Mesh(geo, getMat(color, o.headShape === 'box' && name === 'head' ? { metalness: 0.6, roughness: 0.35 } : {}));
      mesh.castShadow = true;
      this.group.add(mesh);
      const I = d.mass * ((d.hh ? (d.hh * 2 + d.r * 2) : d.r * 2) ** 2 / 12 + d.r * d.r / 4);
      this.parts[name] = { name, def: d, body, collider, mesh, I: Math.max(I, 0.01) };
    }
    // Joints
    for (const name of PART_NAMES) {
      const d = PARTS[name];
      if (!d.parent) continue;
      const p = PARTS[d.parent];
      const a1 = V(d.anchor[0] - p.pos[0], d.anchor[1] - p.pos[1], d.anchor[2] - p.pos[2]);
      const a2 = V(d.anchor[0] - d.pos[0], d.anchor[1] - d.pos[1], d.anchor[2] - d.pos[2]);
      let jd;
      if (d.hinge) jd = RAPIER.JointData.revolute(a1, a2, V(1, 0, 0));
      else jd = RAPIER.JointData.spherical(a1, a2);
      const j = this.physics.world.createImpulseJoint(jd, this.parts[d.parent].body, this.parts[name].body, true);
      try { j.setContactsEnabled(false); } catch (e) { /* ignore */ }
      if (d.hinge) j.setLimits(d.hinge[0], d.hinge[1]);
      this.joints.push(j);
    }
    this._decorateHead();
  }

  _decorateHead() {
    const head = this.parts.head.mesh;
    const eyeMat = getMat(0x111111);
    const r = 0.15;
    const eyeGeo = new THREE.SphereGeometry(0.02, 8, 6);
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, this.opts.eyeColor ? getMat(this.opts.eyeColor, { emissive: this.opts.eyeColor }) : eyeMat);
      eye.position.set(sx * 0.055, 0.025, r * 0.93);
      head.add(eye);
    }
    if (this.opts.decorate) this.opts.decorate(head, this);
    this.headMeshes = head;
  }

  setVisible(v) { this.group.visible = v; }
  setHeadVisible(v) { this.parts.head.mesh.visible = v; }

  // -------- queries --------
  get pelvis() { return this.parts.pelvis.body; }
  getPos(out = new THREE.Vector3()) {
    const t = this.parts.pelvis.body.translation();
    return out.set(t.x, t.y, t.z);
  }
  getPartPos(name, out = new THREE.Vector3()) {
    const t = this.parts[name].body.translation();
    return out.set(t.x, t.y, t.z);
  }
  getForward(out = new THREE.Vector3()) { return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  isDown() { return this.mode === 'limp'; }
  isUpright() { return this.mode === 'active' || (this.mode === 'recover' && this.ctrl > 0.7); }
  speedXZ() {
    const v = this.parts.pelvis.body.linvel();
    return Math.hypot(v.x, v.z);
  }

  // -------- placement --------
  spawn(x, z, yaw = 0, y = 0.03) {
    this.yaw = this.targetYaw = yaw;
    this.home.x = x; this.home.z = z;
    const q = new THREE.Quaternion().setFromAxisAngle(AY, yaw);
    const off = new THREE.Vector3();
    for (const name of PART_NAMES) {
      const d = PARTS[name];
      const b = this.parts[name].body;
      off.set(d.pos[0], d.pos[1], d.pos[2]).applyQuaternion(q);
      b.setTranslation(V(x + off.x, y + off.y, z + off.z), true);
      b.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
      b.setLinvel(V(0, 0, 0), true);
      b.setAngvel(V(0, 0, 0), true);
    }
    this.mode = 'active'; this.ctrl = 1; this.limpTimer = 0; this.stun = 0;
    this._setDamping(true);
    this.sync();
  }

  teleport(x, y, z) {
    const p = this.parts.pelvis.body.translation();
    const dx = x - p.x, dy = y - p.y, dz = z - p.z;
    for (const name of PART_NAMES) {
      const b = this.parts[name].body;
      const t = b.translation();
      b.setTranslation(V(t.x + dx, t.y + dy, t.z + dz), true);
      b.setLinvel(V(0, 0, 0), true);
    }
  }

  _setDamping(active) {
    for (const name of PART_NAMES) {
      const b = this.parts[name].body;
      b.setAngularDamping(active ? 2.5 : 1.2);
      b.setLinearDamping(active ? 0.1 : 0.15);
    }
  }

  // -------- combat --------
  /** Apply an impulse (world space velocity-change style: dv in m/s on a unit-ish mass) to a part + the body core. */
  hit(partName, dir, strength, stunAmount = 1, source = null) {
    const part = this.parts[partName] || this.parts.torso;
    const k = strength;
    const imp = V(dir.x * k * part.def.mass * 1.2, dir.y * k * part.def.mass * 1.2, dir.z * k * part.def.mass * 1.2);
    part.body.applyImpulse(imp, true);
    for (const n of ['pelvis', 'torso']) {
      if (n === partName) continue;
      const m = PARTS[n].mass * 0.5;
      this.parts[n].body.applyImpulse(V(dir.x * k * m, dir.y * k * m, dir.z * k * m), true);
    }
    this.stun += stunAmount;
    this.staggerTimer = 0.5;
    this.lastHitTime = this.time;
    this.lastHitSource = source;
    if (this.mode !== 'limp' && this.stun >= 1) {
      this.knockout(2 + Math.min(2, k * 0.2 + Math.random() * 0.6));
      return true;
    }
    if (this.mode === 'limp') this.limpTimer = Math.max(this.limpTimer, 1.5);
    return false;
  }

  knockout(duration = 3) {
    const was = this.mode;
    this.mode = 'limp';
    this.limpTimer = duration;
    this.ctrl = 0;
    this.stun = 0;
    this.pose = {};
    this._setDamping(false);
    if (was !== 'limp' && this.onKnockout) this.onKnockout(this);
  }

  // -------- per-step update (fixed dt) --------
  update(dt) {
    this.time += dt;
    this.stun = Math.max(0, this.stun - 0.5 * dt);
    this.staggerTimer = Math.max(0, this.staggerTimer - dt);
    this.hopCooldown = Math.max(0, this.hopCooldown - dt);

    const p = this.parts.pelvis.body.translation();
    if (p.y < -8 || Math.abs(p.x) > 140 || Math.abs(p.z) > 140) {
      this.spawn(this.home.x, this.home.z, this.yaw);
      return;
    }

    if (this.mode === 'limp') {
      this.limpTimer -= dt;
      if (this.limpTimer <= 0) {
        this.mode = 'recover';
        this.ctrl = 0.05;
        this._setDamping(true);
        this._recoverYaw();
      }
      return;
    }
    if (this.mode === 'recover') {
      this.ctrl = Math.min(1, this.ctrl + dt / 1.6);
      if (this.ctrl >= 1) {
        this.mode = 'active';
        if (this.onGetUp) this.onGetUp(this);
      }
    }
    this._control(dt);
  }

  _recoverYaw() {
    // Face the direction the torso's local +Z currently points, projected onto the ground (if usable).
    const r = this.parts.torso.body.rotation();
    tmpQ.set(r.x, r.y, r.z, r.w);
    const f = new THREE.Vector3(0, 0, 1).applyQuaternion(tmpQ);
    if (Math.hypot(f.x, f.z) > 0.4) {
      this.yaw = this.targetYaw = Math.atan2(f.x, f.z);
    }
  }

  _control(dt) {
    const parts = this.parts;
    const ctrl = this.ctrl;
    const pel = parts.pelvis.body;
    const pt = pel.translation();
    const pv = pel.linvel();

    // ground probe
    const hit = this.physics.castRay(pt.x, pt.y, pt.z, 0, -1, 0, 2.0, groups(0xffff, G.WORLD | G.PROP));
    this.groundDist = hit ? hit.toi : 99;
    this.grounded = this.groundDist < HOVER_H + 0.12;

    // hover spring (supports weight)
    if (this.groundDist < HOVER_H) {
      let acc = SPRING_KP * (HOVER_H - this.groundDist) - SPRING_KD * pv.y;
      acc = Math.max(0, Math.min(SPRING_MAX_ACC * ctrl, acc));
      const f = TOTAL_MASS * acc * dt;
      pel.applyImpulse(V(0, f * 0.5, 0), true);
      parts.torso.body.applyImpulse(V(0, f * 0.5, 0), true);
    }

    // yaw
    const dy = wrapAngle(this.targetYaw - this.yaw);
    const maxTurn = this.turnSpeed * dt;
    this.yaw = wrapAngle(this.yaw + Math.max(-maxTurn, Math.min(maxTurn, dy)));

    // horizontal velocity blending (walking)
    const stag = this.staggerTimer > 0 ? 0.25 : 1;
    const rate = (this.grounded ? 10 : 1.5) * ctrl * stag;
    const k = 1 - Math.exp(-rate * dt);
    let spd = 0;
    for (const name of PART_NAMES) {
      const b = parts[name].body;
      const v = b.linvel();
      const f = name.startsWith('uArm') || name.startsWith('lArm') ? 0.5 : 1;
      b.setLinvel(V(v.x + (this.desired.x - v.x) * k * f, v.y, v.z + (this.desired.z - v.z) * k * f), true);
      if (name === 'pelvis') spd = Math.hypot(this.desired.x, this.desired.z);
    }
    const actual = Math.hypot(pv.x, pv.z);
    this.speedNorm += (Math.min(1, actual / 5.5) - this.speedNorm) * Math.min(1, dt * 8);
    this.walkPhase += dt * (3 + actual * 1.6) * (this.grounded ? 1 : 0.3);

    this._torques(dt, ctrl);
  }

  _pd(part, qTarget, gain, dt) {
    const b = part.body;
    const r = b.rotation();
    tmpQ.set(r.x, r.y, r.z, r.w);
    tmpQ2.copy(qTarget).multiply(tmpQ.invert());
    if (tmpQ2.w < 0) { tmpQ2.x *= -1; tmpQ2.y *= -1; tmpQ2.z *= -1; tmpQ2.w *= -1; }
    const s = Math.hypot(tmpQ2.x, tmpQ2.y, tmpQ2.z);
    let rx = 0, ry = 0, rz = 0;
    if (s > 1e-6) {
      const ang = Math.min(2 * Math.atan2(s, tmpQ2.w), 1.6);
      const m = ang / s;
      rx = tmpQ2.x * m; ry = tmpQ2.y * m; rz = tmpQ2.z * m;
    }
    const w = b.angvel();
    const kp = part.def.kp * gain, kd = part.def.kd * Math.sqrt(gain);
    const I = part.I * dt;
    b.applyTorqueImpulse(V((kp * rx - kd * w.x) * I, (kp * ry - kd * w.y) * I, (kp * rz - kd * w.z) * I), true);
  }

  _target(yaw, side, swing) {
    // yaw * Rz(side) * Rx(swing)
    yawQ.setFromAxisAngle(AY, yaw);
    tmpQ3.setFromAxisAngle(AZ, side);
    const q = new THREE.Quaternion().copy(yawQ).multiply(tmpQ3);
    tmpQ3.setFromAxisAngle(AX, swing);
    return q.multiply(tmpQ3);
  }

  _torques(dt, ctrl) {
    const parts = this.parts;
    const g = ctrl;
    const s = this.speedNorm;
    const ph = this.walkPhase;
    const pose = this.pose;

    // trunk
    const lean = (pose.lean ?? 0) + s * 0.12;
    this._pd(parts.pelvis, this._target(this.yaw + (pose.pelvisTwist ?? 0), pose.sway ?? 0, 0), g, dt);
    this._pd(parts.torso, this._target(this.yaw, pose.sway ?? 0, lean), g, dt);
    this._pd(parts.head, this._target(this.yaw + this.headLook, 0, (pose.headPitch ?? 0) - lean * 0.5), g, dt);

    // legs
    const air = !this.grounded;
    const swingL = air ? -0.4 : -0.75 * Math.sin(ph) * s;
    const swingR = air ? 0.2 : 0.75 * Math.sin(ph) * s;
    const kneeL = air ? 0.7 : 0.12 + 1.0 * s * Math.max(0, Math.cos(ph));
    const kneeR = air ? 0.4 : 0.12 + 1.0 * s * Math.max(0, -Math.cos(ph));
    const legSide = 0.04;
    this._pd(parts.uLegL, this._target(this.yaw, legSide, pose.legL ?? swingL), g, dt);
    this._pd(parts.lLegL, this._target(this.yaw, legSide, (pose.legL ?? swingL) + kneeL), g, dt);
    this._pd(parts.uLegR, this._target(this.yaw, -legSide, pose.legR ?? swingR), g, dt);
    this._pd(parts.lLegR, this._target(this.yaw, -legSide, (pose.legR ?? swingR) + kneeR), g, dt);

    // arms. swing: negative = forward/up. side: outward splay.
    const defL = { swing: 0.65 * Math.sin(ph) * s, side: 0.12, elbow: -0.25 - 0.5 * s, gain: 1 };
    const defR = { swing: -0.65 * Math.sin(ph) * s, side: 0.12, elbow: -0.25 - 0.5 * s, gain: 1 };
    const aL = Object.assign(defL, pose.armL || {});
    const aR = Object.assign(defR, pose.armR || {});
    this._pd(parts.uArmL, this._target(this.yaw, aL.side, aL.swing), g * aL.gain, dt);
    this._pd(parts.lArmL, this._target(this.yaw, aL.side, aL.swing + aL.elbow), g * aL.gain, dt);
    this._pd(parts.uArmR, this._target(this.yaw, -aR.side, aR.swing), g * aR.gain, dt);
    this._pd(parts.lArmR, this._target(this.yaw, -aR.side, aR.swing + aR.elbow), g * aR.gain, dt);
  }

  /** Make the whole body hop up (dance / laugh / jump). */
  hop(vy) {
    if (!this.grounded || this.mode !== 'active') return;
    for (const name of PART_NAMES) {
      const b = this.parts[name].body;
      const v = b.linvel();
      b.setLinvel(V(v.x, vy, v.z), true);
    }
    this.groundDist = 99;
    this.grounded = false;
  }

  // -------- render sync --------
  sync() {
    for (const name of PART_NAMES) {
      const p = this.parts[name];
      const t = p.body.translation();
      const r = p.body.rotation();
      p.mesh.position.set(t.x, t.y, t.z);
      p.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
    const h = this.parts.head.body.translation();
    this.anchor.position.set(h.x, h.y + 0.45, h.z);
  }

  dispose() {
    if (this.scene) { this.scene.remove(this.group); this.scene.remove(this.anchor); }
    for (const name of PART_NAMES) {
      this.physics.unregisterCollider(this.parts[name].collider);
      this.physics.world.removeRigidBody(this.parts[name].body);
    }
  }
}

export { FIXED_DT };
