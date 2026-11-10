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
// lumpy white cloud puff (tinted per sprite), so smoke reads as billows rather than a flat disc
function cloudTexture() {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d');
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2, d = Math.random() * 26, r = 18 + Math.random() * 22;
    const cx = S / 2 + Math.cos(a) * d, cy = S / 2 + Math.sin(a) * d;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
  }
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
    this._initExplosions(scene);
  }

  // ---------- big explosions (egg bombs) ----------
  _initExplosions(scene) {
    const fireTex = puffTexture('rgba(255,250,225,1)', 'rgba(255,150,50,0.65)');
    const smokeTex = cloudTexture();
    const sparkTex = puffTexture('rgba(255,245,200,1)', 'rgba(255,170,60,0.6)');
    const pool = (n, tex, additive) => Array.from({ length: n }, () => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: !additive,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
      s.visible = false; scene.add(s);
      return { sprite: s, vel: new THREE.Vector3(), life: 0, max: 1, s0: 1, s1: 1 };
    });
    this.fire = pool(72, fireTex, true);
    this.smoke = pool(60, smokeTex, false);
    this.sparks = pool(80, sparkTex, true);
    this.rings = Array.from({ length: 3 }, () => {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xffe2b0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      m.visible = false; scene.add(m);
      return { mesh: m, life: 0, max: 0.4, size: 1 };
    });
    this.scorches = Array.from({ length: 10 }, () => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ map: puffTexture('rgba(15,12,10,0.85)', 'rgba(25,20,16,0.5)'), transparent: true, depthWrite: false,
          polygonOffset: true, polygonOffsetFactor: -2 }));
      m.visible = false; scene.add(m);
      return { mesh: m, life: 0 };
    });
    // one light that is always in the scene (intensity 0 when idle) so explosions never trigger shader recompiles
    this.boomLight = new THREE.PointLight(0xffa64d, 0, 40, 2);
    scene.add(this.boomLight);
    this.boomLife = 0; this.boomPeak = 0;
  }

  /** A big fiery explosion at `p`. size 1 ~ a rocket, 2 ~ a huge blast. */
  explosion(p, size = 1) {
    const take = (arr) => arr.find((q) => q.life <= 0);
    const rnd = (a, b) => a + Math.random() * (b - a);
    // flash of light
    this.boomLight.position.set(p.x, p.y + 1.5, p.z);
    this.boomLight.distance = 30 * size;
    this.boomPeak = 260 * size; this.boomLife = 0.45;
    // white-hot core flash
    const core = this.flashes.find((q) => q.life <= 0);
    if (core) { core.life = 0.16; core.sprite.position.set(p.x, p.y + 1.2 * size, p.z); core.sprite.scale.setScalar(9 * size); core.sprite.visible = true; }
    // fireball
    for (let i = 0; i < 30; i++) {
      const f = take(this.fire); if (!f) break;
      f.life = f.max = rnd(0.45, 0.9);
      const dir = new THREE.Vector3(rnd(-1, 1), rnd(0.1, 1.2), rnd(-1, 1)).normalize();
      f.sprite.position.set(p.x + dir.x * 0.4 * size, p.y + 0.5 + dir.y * 0.4 * size, p.z + dir.z * 0.4 * size);
      f.vel.copy(dir).multiplyScalar(rnd(2, 8) * size);
      f.s0 = rnd(1.4, 2.4) * size; f.s1 = rnd(3.5, 6) * size;
      f.sprite.material.rotation = Math.random() * 6;
      f.sprite.visible = true;
    }
    // smoke column
    for (let i = 0; i < 26; i++) {
      const s = take(this.smoke); if (!s) break;
      s.life = s.max = rnd(3, 5.5);
      s.sprite.position.set(p.x + rnd(-1, 1) * size, p.y + rnd(0.3, 1.6) * size, p.z + rnd(-1, 1) * size);
      s.vel.set(rnd(-1.2, 1.2), rnd(1.2, 3.2), rnd(-1.2, 1.2)).multiplyScalar(size * 0.8);
      s.s0 = rnd(1.2, 2) * size; s.s1 = rnd(4, 6.5) * size;
      s.delay = rnd(0, 0.25);
      s.sprite.material.rotation = Math.random() * 6;
      s.sprite.material.opacity = 0;
      s.sprite.visible = true;
    }
    // sparks / burning bits
    for (let i = 0; i < 36; i++) {
      const s = take(this.sparks); if (!s) break;
      s.life = s.max = rnd(0.6, 1.4);
      s.sprite.position.set(p.x, p.y + 0.6, p.z);
      s.vel.set(rnd(-1, 1), rnd(0.4, 1.6), rnd(-1, 1)).normalize().multiplyScalar(rnd(8, 18) * Math.sqrt(size));
      s.s0 = s.s1 = rnd(0.12, 0.28) * Math.sqrt(size);
      s.sprite.visible = true;
    }
    // ground shockwave + scorch
    const ring = take(this.rings);
    if (ring) { ring.life = ring.max; ring.size = 11 * size; ring.mesh.position.set(p.x, 0.08, p.z); ring.mesh.visible = true; }
    const sc = take(this.scorches) || this.scorches.reduce((a, b) => (a.life < b.life ? a : b));
    sc.life = 25; sc.mesh.position.set(p.x, 0.04, p.z); sc.mesh.scale.setScalar(rnd(2.2, 3) * size);
    sc.mesh.rotation.y = Math.random() * 6; sc.mesh.material.opacity = 1; sc.mesh.visible = true;
  }

  _updateExplosions(dt) {
    if (this.boomLife > 0) {
      this.boomLife -= dt;
      const k = Math.max(0, this.boomLife / 0.45);
      this.boomLight.intensity = this.boomPeak * k * k;
    } else if (this.boomLight.intensity) this.boomLight.intensity = 0;
    const col = new THREE.Color();
    for (const f of this.fire) {
      if (f.life <= 0) continue;
      f.life -= dt;
      if (f.life <= 0) { f.sprite.visible = false; continue; }
      const k = 1 - f.life / f.max;                    // 0 -> 1 over its life
      f.vel.multiplyScalar(Math.exp(-4 * dt)); f.vel.y += 2 * dt;
      f.sprite.position.addScaledVector(f.vel, dt);
      const sc = f.s0 + (f.s1 - f.s0) * Math.sqrt(k);
      f.sprite.scale.set(sc, sc, sc);
      // white-hot -> orange -> deep red as it cools
      col.setRGB(1, Math.max(0.15, 1 - k * 1.1), Math.max(0.03, 0.85 - k * 1.8));
      f.sprite.material.color.copy(col);
      f.sprite.material.opacity = (1 - k) * (1 - k) * 1.2;
    }
    for (const s of this.smoke) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) { s.sprite.visible = false; continue; }
      if (s.delay > 0) { s.delay -= dt; continue; }
      const k = 1 - s.life / s.max;
      s.vel.multiplyScalar(Math.exp(-0.9 * dt)); s.vel.y += 0.3 * dt;
      s.sprite.position.addScaledVector(s.vel, dt);
      const sc = s.s0 + (s.s1 - s.s0) * Math.sqrt(k);
      s.sprite.scale.set(sc, sc, sc);
      s.sprite.material.rotation += dt * 0.25;
      const fadeIn = Math.min(1, k * 8);
      s.sprite.material.opacity = 0.85 * fadeIn * Math.pow(1 - k, 0.8);
      const g = 0.3 + k * 0.45; s.sprite.material.color.setRGB(g * 1.04, g, g * 0.96);   // sooty, then lighter grey as it spreads
    }
    for (const s of this.sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) { s.sprite.visible = false; continue; }
      s.vel.y -= 14 * dt; s.vel.multiplyScalar(Math.exp(-0.6 * dt));
      s.sprite.position.addScaledVector(s.vel, dt);
      if (s.sprite.position.y < 0.05) { s.sprite.position.y = 0.05; s.vel.y *= -0.3; s.vel.x *= 0.6; s.vel.z *= 0.6; }
      s.sprite.material.opacity = Math.min(1, s.life / s.max * 2);
    }
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      if (r.life <= 0) { r.mesh.visible = false; continue; }
      const k = 1 - r.life / r.max;
      r.mesh.scale.setScalar(0.5 + r.size * Math.sqrt(k));
      r.mesh.material.opacity = (1 - k) * 0.8;
    }
    for (const sc of this.scorches) {
      if (sc.life <= 0) continue;
      sc.life -= dt;
      if (sc.life <= 0) { sc.mesh.visible = false; continue; }
      sc.mesh.material.opacity = Math.min(1, sc.life / 5);   // fades over its last 5 s
    }
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
    this._updateExplosions(dt);
  }
}
