// Cartoony "bonk" stars, comic words, bullet tracers, muzzle flashes. No blood, ever.
import * as THREE from 'three';

function starTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  x.translate(32, 33);
  x.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 11 : 28, a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    x.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  x.closePath();
  x.fillStyle = '#ffe14a'; x.fill();
  x.lineWidth = 4; x.strokeStyle = '#ff9d1a'; x.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function wordTexture(text, color) {
  const c = document.createElement('canvas'); c.width = 340; c.height = 96;
  const x = c.getContext('2d');
  x.font = '900 64px "Comic Sans MS", "Chalkboard SE", Impact, sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 12; x.strokeStyle = '#2b1a05'; x.lineJoin = 'round';
  x.strokeText(text, 170, 50);
  x.fillStyle = color; x.fillText(text, 170, 50);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const WORDS = [['BONK!', '#ffe14a'], ['WHAM!', '#ff7a45'], ['BOING!', '#7ae0ff'], ['POW!', '#ff6bd0'], ['THWACK!', '#b6ff6b']];

export class Effects {
  constructor(scene) {
    this.scene = scene;
    const starTex = starTexture();
    this.stars = [];
    for (let i = 0; i < 90; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, transparent: true, depthWrite: false, fog: false }));
      s.visible = false; s.scale.set(0.3, 0.3, 0.3);
      scene.add(s);
      this.stars.push({ sprite: s, vel: new THREE.Vector3(), life: 0, max: 1 });
    }
    this.wordTex = WORDS.map(([t, c]) => wordTexture(t, c));
    this.words = [];
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.wordTex[0], transparent: true, depthWrite: false, fog: false }));
      s.visible = false; s.scale.set(2.4, 0.68, 1);
      scene.add(s);
      this.words.push({ sprite: s, life: 0, vel: 0 });
    }
    this.tracers = [];
    const tg = new THREE.CylinderGeometry(0.018, 0.018, 1, 5);
    tg.translate(0, 0.5, 0); tg.rotateX(Math.PI / 2); // along +Z, from 0 to 1
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: 0xfff1a0, transparent: true, fog: false }));
      m.visible = false; scene.add(m);
      this.tracers.push({ mesh: m, life: 0 });
    }
    this.flashes = [];
    const flashTex = starTex;
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, color: 0xffd060, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
      s.visible = false; scene.add(s);
      this.flashes.push({ sprite: s, life: 0 });
    }
    this.pulse = [];
  }

  bonk(x, y, z, power = 1, word = true) {
    const n = Math.min(9, 4 + Math.floor(power * 2));
    for (let i = 0; i < n; i++) {
      const st = this.stars.find((s) => s.life <= 0);
      if (!st) break;
      st.life = st.max = 0.55 + Math.random() * 0.4;
      st.sprite.visible = true;
      st.sprite.position.set(x, y, z);
      st.vel.set((Math.random() - 0.5) * 5, 2 + Math.random() * 4, (Math.random() - 0.5) * 5);
      const sc = 0.25 + Math.random() * 0.25;
      st.sprite.scale.set(sc, sc, sc);
      st.sprite.material.rotation = Math.random() * 6;
    }
    if (word) this.word(x, y + 0.5, z);
  }

  word(x, y, z, idx) {
    const w = this.words.find((s) => s.life <= 0);
    if (!w) return;
    const i = idx ?? Math.floor(Math.random() * this.wordTex.length);
    w.sprite.material.map = this.wordTex[i];
    w.sprite.material.needsUpdate = true;
    w.sprite.position.set(x, y, z);
    w.sprite.visible = true; w.life = 0.8; w.vel = 1.6;
    w.sprite.material.opacity = 1;
  }

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
      s.vel.y -= 12 * dt;
      s.sprite.position.addScaledVector(s.vel, dt);
      if (s.sprite.position.y < 0.05) { s.sprite.position.y = 0.05; s.vel.y *= -0.4; s.vel.x *= 0.6; s.vel.z *= 0.6; }
      s.sprite.material.opacity = Math.min(1, s.life / 0.25);
      s.sprite.material.rotation += dt * 6;
    }
    for (const w of this.words) {
      if (w.life <= 0) continue;
      w.life -= dt;
      if (w.life <= 0) { w.sprite.visible = false; continue; }
      w.sprite.position.y += w.vel * dt;
      w.vel *= 0.96;
      w.sprite.material.opacity = Math.min(1, w.life / 0.3);
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
