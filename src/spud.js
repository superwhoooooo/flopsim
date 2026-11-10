// A giant vegetable drops out of the sky every minute and goes thump.
import * as THREE from 'three';
import { RAPIER, groups, G } from './physics.js';
import { sfx } from './audio.js';

const INTERVAL = 60, DROP_H = 90, R = 2.2;
const KINDS = [
  { name: 'potato', color: 0xb98a55, sx: 1.3, sy: 0.9, sz: 1 },
  { name: 'carrot', color: 0xf07a1c, sx: 0.6, sy: 1.8, sz: 0.6 },
  { name: 'turnip', color: 0xd9c4e8, sx: 1, sy: 0.95, sz: 1 },
  { name: 'beetroot', color: 0x8a1a4a, sx: 1, sy: 1, sz: 1 },
  { name: 'cabbage', color: 0x7fb85a, sx: 1.05, sy: 0.95, sz: 1.05 },
];

export class Spud {
  constructor(game) {
    this.game = game;
    this.timer = INTERVAL;
    this.cur = null;
    this.src = { ragdoll: null };
    this.marker = new THREE.Mesh(new THREE.RingGeometry(R * 0.8, R * 1.6, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xff4040, transparent: true, opacity: 0.5, depthWrite: false }));
    this.marker.visible = false;
    game.scene.add(this.marker);
  }

  spawn() {
    const g = this.game, pp = g.player.ragdoll.getPos(new THREE.Vector3());
    const k = KINDS[Math.floor(Math.random() * KINDS.length)];
    const a = Math.random() * Math.PI * 2, d = 6 + Math.random() * 14;
    const x = Math.max(-95, Math.min(95, pp.x + Math.cos(a) * d)), z = Math.max(-95, Math.min(95, pp.z + Math.sin(a) * d));
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(R, 20, 14),
      new THREE.MeshStandardMaterial({ color: k.color, roughness: 0.85 }));
    mesh.scale.set(k.sx, k.sy, k.sz);
    if (k.name === 'carrot') { const top = new THREE.Mesh(new THREE.ConeGeometry(R * 0.4, R * 0.9, 8), new THREE.MeshStandardMaterial({ color: 0x3f9a3a })); top.position.set(0, R * 1.3, 0); mesh.add(top); }
    mesh.castShadow = true;
    g.scene.add(mesh);
    const w = g.physics.world;
    const body = w.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, DROP_H, z)
      .setAngvel({ x: Math.random() * 2, y: Math.random(), z: Math.random() * 2 }).setCcdEnabled(true));
    const col = w.createCollider(RAPIER.ColliderDesc.ball(R * Math.max(k.sx, k.sz) * 0.9).setDensity(0.6).setRestitution(0.25)
      .setCollisionGroups(groups(G.PROP, 0xffff)).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), body);
    this.cur = { mesh, body, col, x, z, age: 0, hit: false, k };
    this.marker.position.set(x, 0.08, z); this.marker.visible = true;
    g.hud.toast(`Look out! A giant ${k.name} is falling from the sky!`, 'quest');
  }

  impact(c) {
    const g = this.game, t = c.body.translation();
    c.hit = true;
    g.discovery?.event('spudImpact', { x: t.x, z: t.z });
    g.combat.explode(new THREE.Vector3(t.x, Math.max(0, t.y - R * 0.5), t.z), 14, 14, this.src, 'spud');
    g.cam.shake = Math.max(g.cam.shake, 1.2);
    setTimeout(() => this.remove(), 8000);
  }

  remove() {
    const c = this.cur; if (!c) return;
    this.game.physics.world.removeRigidBody(c.body);
    this.game.scene.remove(c.mesh);
    c.mesh.geometry.dispose(); c.mesh.material.dispose();
    this.cur = null; this.marker.visible = false;
  }

  step(dt) {
    const c = this.cur;
    if (!c) {
      this.timer -= dt;
      if (this.timer <= 0) { this.timer = INTERVAL; this.spawn(); }
      return;
    }
    const t = c.body.translation(), r = c.body.rotation();
    c.mesh.position.set(t.x, t.y, t.z); c.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    c.age += dt;
    if (!c.hit) {
      const v = c.body.linvel();
      if (t.y < R * 1.3 + 1 && v.y > -2 && c.age > 1 || t.y < R * 1.2) this.impact(c);
      this.marker.material.opacity = 0.3 + 0.3 * Math.sin(c.age * 10);
    } else if (this.marker.visible) this.marker.visible = false;
  }
}
