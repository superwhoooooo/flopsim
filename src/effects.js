// Impact dust, debris, bullet tracers, muzzle flashes. No blood, ever.
import * as THREE from 'three';

function puffTexture(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 2, 32, 32, 31);
  g.addColorStop(0, inner); g.addColorStop(0.5, outer); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function starTexture() { return puffTexture('rgba(190,176,156,0.85)', 'rgba(150,138,122,0.45)'); } // dust puff
function wordTexture() { return null; }

const WORDS = [];

export class Effects {
  constructor(scene) {
    this.scene = scene;
    const starTex = starTexture();
    this.stars = [];
    for (let i = 0; i < 90; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, transparent: true, depthWrite: false, fog: true }));
      s.visible = false; s.scale.set(0.3, 0.3, 0.3);
      scene.add(s);
      this.stars.push({ sprite: s, vel: new THREE.Vector3(), life: 0, max: 1 });
    }
    this.wordTex = []; this.words = [];
    this.tracers = [];
    const tg = new THREE.CylinderGeometry(0.018, 0.018, 1, 5);
    tg.translate(0, 0.5, 0); tg.rotateX(Math.PI / 2); // along +Z, from 0 to 1
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: 0xffe9b8, transparent: true, fog: false }));
      m.visible = false; scene.add(m);
      this.tracers.push({ mesh: m, life: 0 });
    }
    this.flashes = [];
    const flashTex = puffTexture('rgba(255,244,210,1)', 'rgba(255,170,70,0.55)');
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, color: 0xffd060, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
      s.visible = false; scene.add(s);
      this.flashes.push({ sprite: s, life: 0 });
    }
    this.pulse = [];
  }

  bonk(x, y, z, power = 1, word = true) {
    const n = Math.min(12, 5 + Math.floor(power * 3));
    for (let i = 0; i < n; i++) {
      const st = this.stars.find((q) => q.life <= 0);
      if (!st) break;
      st.life = st.max = 0.6 + Math.random() * 0.6;
      st.sprite.visible = true;
      st.sprite.position.set(x, y, z);
      const sp = 1.2 + Math.random() * 2.2 * Math.min(1.5, 0.6 + power);
      const a = Math.random() * Math.PI * 2;
      st.vel.set(Math.cos(a) * sp, 0.4 + Math.random() * 1.6, Math.sin(a) * sp);
      st.s0 = 0.25 + Math.random() * 0.25;
      st.sprite.scale.set(st.s0, st.s0, st.s0);
      st.sprite.material.rotation = Math.random() * 6;
    }
  }

  word() { /* comic words removed for a grounded look */ }

  tracer(from, to) {
    const t = this.tracers.find((s) => s.life <= 0);
    if (!t) return;
    t.life = 0.09;
    t.mesh.visible = true;
    t.mesh.position.copy(from);
    t.mesh.lookAt(to);
    t.mesh.scale.set(1, 1, from.distanceTo(to));
    t.mesh.material.opacity = 1;
  }

  muzzle(pos) {
    const f = this.flashes.find((s) => s.life <= 0);
    if (!f) return;
    f.life = 0.07;
    f.sprite.visible = true;
    f.sprite.position.copy(pos);
    const s = 0.45 + Math.random() * 0.25;
    f.sprite.scale.set(s, s, s);
    f.sprite.material.rotation = Math.random() * 6;
  }

  update(dt) {
    for (const s of this.stars) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) { s.sprite.visible = false; continue; }
      const k = 1 - s.life / s.max;
      s.vel.multiplyScalar(Math.exp(-2.4 * dt)); s.vel.y += 0.5 * dt;   // drag + slight rise, like dust
      s.sprite.position.addScaledVector(s.vel, dt);
      const sc = s.s0 * (1 + k * 3.2);
      s.sprite.scale.set(sc, sc, sc);
      s.sprite.material.opacity = Math.min(1, s.life / s.max * 1.6) * 0.65;
      s.sprite.material.rotation += dt * 0.6;
    }
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) t.mesh.visible = false; else t.mesh.material.opacity = t.life / 0.09;
    }
    for (const f of this.flashes) {
      if (f.life <= 0) continue;
      f.life -= dt;
      if (f.life <= 0) f.sprite.visible = false;
    }
  }
}
