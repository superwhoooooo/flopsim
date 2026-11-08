// Third-person orbit camera (with collision) and first-person head camera. K / L switch.
import * as THREE from 'three';
import { G, groups } from './physics.js';

export class CameraRig {
  constructor(camera, game) {
    this.camera = camera;
    this.game = game;
    this.yaw = Math.PI;      // facing direction convention: forward = (sin yaw, 0, cos yaw)
    this.pitch = -0.15;
    this.mode = 'third';
    this.dist = 4.6;
    this.curDist = 4.6;
    this.target = new THREE.Vector3();
    this.smoothTarget = new THREE.Vector3();
    this.initialised = false;
    this.camera.rotation.order = 'YXZ';
    this.tmp = new THREE.Vector3();
    this.shake = 0;
    this.lastLook = 0;
    this.chaseDist = 6.8;
  }

  snapBehind(yaw) { this.yaw = yaw; this.pitch = -0.2; }

  setMode(m) {
    if (this.mode === m) return;
    this.mode = m;
    this.game.player.ragdoll.setHeadVisible(m === 'third');
    this.game.hud?.setCamMode(m);
  }

  look(dx, dy) {
    const s = 0.0023;
    this.lastLook = performance.now();
    this.yaw -= dx * s;
    this.pitch = Math.max(-1.25, Math.min(1.25, this.pitch - dy * s));
  }

  forward(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    return out.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
  }
  flatForward(out = new THREE.Vector3()) { return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  flatRight(out = new THREE.Vector3()) { return out.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw)); }

  update(dt) {
    const cam = this.camera;
    const r = this.game.player.ragdoll;
    const drv = this.game.driving;
    if (drv && drv.active) {
      // chase cam: swing slowly behind the direction of travel unless the player is looking around
      if (Math.abs(drv.vf) > 2.5 && performance.now() - this.lastLook > 1400) {
        let want = drv.heading; if (drv.vf < 0) want += Math.PI;
        let dy = want - this.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
        this.yaw += dy * (1 - Math.exp(-2.2 * dt));
      }
    }
    const dir = this.forward(this.tmp.set(0, 0, 0));
    if (drv && drv.active) {
      const cp = drv.car.body.translation();
      this.target.set(cp.x, cp.y + 0.9, cp.z);
      if (!this.initialised) { this.smoothTarget.copy(this.target); this.initialised = true; }
      this.smoothTarget.lerp(this.target, 1 - Math.exp(-12 * dt));
      this.chaseDist += ((6.8 + Math.min(2.5, Math.abs(drv.vf) * 0.09)) - this.chaseDist) * (1 - Math.exp(-3 * dt));
      const t = this.smoothTarget;
      const want = new THREE.Vector3(t.x - dir.x * this.chaseDist, t.y - dir.y * this.chaseDist + 0.6, t.z - dir.z * this.chaseDist);
      const d = new THREE.Vector3().subVectors(want, t); const len = d.length(); d.normalize();
      const hit = this.game.physics.castRay(t.x, t.y, t.z, d.x, d.y, d.z, len, groups(0xffff, G.WORLD));
      const use = hit ? Math.max(0.6, hit.toi - 0.3) : len;
      this.curDist = use;
      cam.position.set(t.x + d.x * use, t.y + d.y * use, t.z + d.z * use);
    } else if (this.mode === 'first') {
      const h = r.getPartPos('head', this.target);
      cam.position.set(h.x + dir.x * 0.16, h.y + 0.05 + dir.y * 0.05, h.z + dir.z * 0.16);
      this.curDist = 0;
    } else {
      const p = r.getPartPos('pelvis', this.target);
      this.target.y += 0.85;
      if (!this.initialised) { this.smoothTarget.copy(this.target); this.initialised = true; }
      const k = 1 - Math.exp(-14 * dt);
      this.smoothTarget.lerp(this.target, k);
      const t = this.smoothTarget;
      const right = this.flatRight(new THREE.Vector3());
      const want = new THREE.Vector3(
        t.x - dir.x * this.dist + right.x * 0.4,
        t.y - dir.y * this.dist + 0.15,
        t.z - dir.z * this.dist + right.z * 0.4);
      // collision: ray from target toward the wanted camera position, world geometry only
      const d = new THREE.Vector3().subVectors(want, t);
      const len = d.length();
      d.normalize();
      const hit = this.game.physics.castRay(t.x, t.y, t.z, d.x, d.y, d.z, len, groups(0xffff, G.WORLD));
      const use = hit ? Math.max(0.4, hit.toi - 0.25) : len;
      this.curDist = use;
      cam.position.set(t.x + d.x * use, t.y + d.y * use, t.z + d.z * use);
    }
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      cam.position.x += (Math.random() - 0.5) * this.shake * 0.25;
      cam.position.y += (Math.random() - 0.5) * this.shake * 0.25;
    }
    cam.rotation.set(this.pitch, this.yaw + Math.PI, 0);
  }
}
