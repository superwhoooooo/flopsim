// Photo mode (P) and instant replay (O).
//  - Photo mode freezes the world, hides the HUD and gives you a free camera: WASD / the stick to fly,
//    mouse / drag to look, Q / E down / up, Shift for speed, scroll or +/- for zoom. Space / click / 📸 saves
//    a PNG. P or Esc leaves.
//  - Instant replay keeps the last 10 seconds of you, the people around you and nearby props, and plays them
//    back in slow motion with a sweeping camera. Space pauses, O or Esc leaves.
import * as THREE from 'three';
import { PART_NAMES } from '../ragdoll.js';
import { sfx } from '../audio.js';

const REC_HZ = 30, REC_SECONDS = 10, MAX_FRAMES = REC_HZ * REC_SECONDS;
const REC_NPCS = 16, REC_PROPS = 30, NP = PART_NAMES.length * 7;

const _a = new THREE.Vector3(), _q = new THREE.Quaternion();

function writeRagdoll(r, arr, off) {
  for (let i = 0; i < PART_NAMES.length; i++) {
    const b = r.parts[PART_NAMES[i]].body, t = b.translation(), q = b.rotation(), o = off + i * 7;
    arr[o] = t.x; arr[o + 1] = t.y; arr[o + 2] = t.z; arr[o + 3] = q.x; arr[o + 4] = q.y; arr[o + 5] = q.z; arr[o + 6] = q.w;
  }
}
function applyRagdoll(r, a, b, k, off) {
  for (let i = 0; i < PART_NAMES.length; i++) {
    const n = PART_NAMES[i], p = r.parts[n], o = off + i * 7;
    const x = a[o] + (b[o] - a[o]) * k, y = a[o + 1] + (b[o + 1] - a[o + 1]) * k, z = a[o + 2] + (b[o + 2] - a[o + 2]) * k;
    _q.set(a[o + 3], a[o + 4], a[o + 5], a[o + 6]).slerp(new THREE.Quaternion(b[o + 3], b[o + 4], b[o + 5], b[o + 6]), k);
    p.mesh.position.set(x, y, z); p.mesh.quaternion.copy(_q);
    const bone = r.bones[r.boneIndex[n]];
    bone.position.set(x, y, z); bone.quaternion.copy(_q);
    if (n === 'head') r.anchor.position.set(x, y + 0.45, z);
  }
}

export class Photo {
  constructor(game, fun) {
    this.game = game; this.fun = fun;
    this.active = false;
    this.pos = new THREE.Vector3();
    this.fov = 60;
    this._buildUi();
  }

  _buildUi() {
    const bar = document.createElement('div'); bar.id = 'photoBar';
    bar.innerHTML = '<span class="pb-help">PHOTO MODE &middot; move: WASD / stick &middot; look: mouse / drag &middot; Q/E down/up &middot; scroll: zoom</span>'
      + '<button data-a="out">➖</button><button data-a="in">➕</button><button data-a="snap" class="big">📸</button><button data-a="exit">✖</button>';
    document.body.appendChild(bar);
    bar.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      e.preventDefault(); e.stopPropagation();
      const a = b.dataset.a;
      if (a === 'snap') this.snap(); else if (a === 'exit') this.toggle(false);
      else this.zoom(a === 'in' ? -6 : 6);
    });
    this.flash = document.createElement('div'); this.flash.id = 'photoFlash'; document.body.appendChild(this.flash);
    window.addEventListener('wheel', (e) => { if (this.active) this.zoom(Math.sign(e.deltaY) * 4); }, { passive: true });
  }

  toggle(v = !this.active) {
    const g = this.game;
    if (v === this.active) return;
    if (v && (g.paused || this.fun.replay.active)) return;
    this.active = v;
    document.body.classList.toggle('photo', v);
    if (v) {
      this.pos.copy(g.camera.position);
      this.fov = g.camera.fov;
      g.input.mouseHeld = false;
      sfx.pop();
      g.discovery.award('photo');
    } else {
      g.camera.fov = 70; g.camera.updateProjectionMatrix();
      for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft']) g.input.keys.delete(k);
    }
  }

  zoom(d) { this.fov = THREE.MathUtils.clamp(this.fov + d, 20, 100); }

  /** Key pressed while in photo mode (movement keys are read from game.input). */
  key(code) {
    if (code === 'KeyP' || code === 'Escape') this.toggle(false);
    else if (code === 'Space' || code === 'Enter') this.snap();
    else if (code === 'Equal' || code === 'NumpadAdd') this.zoom(-6);
    else if (code === 'Minus' || code === 'NumpadSubtract') this.zoom(6);
  }

  snap() {
    const g = this.game;
    g.composer.render();
    try {
      g.renderer.domElement.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `flopsim-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.png`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }, 'image/png');
    } catch (e) { g.hud.toast('Could not save the photo in this browser.', ''); }
    this.flash.classList.remove('go'); void this.flash.offsetWidth; this.flash.classList.add('go');
    sfx.hat();
  }

  /** Render frame while active: fly the free camera. */
  update(dt) {
    const g = this.game, cam = g.camera, k = g.input;
    const f = g.cam.forward(new THREE.Vector3()), right = new THREE.Vector3(-f.z, 0, f.x).normalize();
    const sp = (k.down('ShiftLeft') ? 16 : 6) * dt;
    const st = k.stick;
    let fw = (k.down('KeyW') ? 1 : 0) - (k.down('KeyS') ? 1 : 0), rt = (k.down('KeyD') ? 1 : 0) - (k.down('KeyA') ? 1 : 0);
    if (st && (st.x || st.y)) { fw = st.y; rt = st.x; }
    this.pos.addScaledVector(f, fw * sp).addScaledVector(right, rt * sp);
    this.pos.y += ((k.down('KeyE') ? 1 : 0) - (k.down('KeyQ') ? 1 : 0)) * sp;
    // stay near the player (and out of the ground)
    const pp = g.player.ragdoll.getPos(_a);
    const off = this.pos.clone().sub(pp);
    if (off.length() > 40) this.pos.copy(pp).addScaledVector(off.normalize(), 40);
    this.pos.y = Math.max(0.3, this.pos.y);
    cam.position.copy(this.pos);
    cam.lookAt(this.pos.clone().add(f));
    if (Math.abs(cam.fov - this.fov) > 0.05) { cam.fov += (this.fov - cam.fov) * Math.min(1, dt * 10); cam.updateProjectionMatrix(); }
  }
}

export class Replay {
  constructor(game, fun) {
    this.game = game; this.fun = fun;
    this.frames = [];
    this.active = false;
    this.paused = false;
    this.t = 0; this.speed = 0.5;
    this.tick = 0;
    this.offeredAt = -99;
    const bar = document.createElement('div'); bar.id = 'replayBar';
    bar.innerHTML = '<span class="rb-tag">▶ REPLAY</span><span class="rb-track"><i></i></span><button data-a="slow">½×</button><button data-a="pause">⏯</button><button data-a="exit">✖</button>';
    document.body.appendChild(bar);
    this.bar = bar; this.barFill = bar.querySelector('i');
    bar.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      e.preventDefault(); e.stopPropagation();
      if (b.dataset.a === 'exit') this.stop(); else if (b.dataset.a === 'pause') this.paused = !this.paused;
      else { this.speed = this.speed === 0.5 ? 1 : this.speed === 1 ? 0.25 : 0.5; b.textContent = this.speed === 1 ? '1×' : this.speed === 0.5 ? '½×' : '¼×'; }
    });
  }

  /** Fixed step (while the game runs): record every other step. */
  record() {
    const g = this.game;
    if (this.active || (this.tick++ % 2) !== 0) return;
    const pp = g.player.ragdoll.getPos(_a);
    const npcs = g.npcs.filter((n) => !n.dormant && n.ragdoll.group.visible).map((n) => [n, n.ragdoll.getPos(new THREE.Vector3()).distanceToSquared(pp)])
      .sort((a, b) => a[1] - b[1]).slice(0, REC_NPCS).map(([n]) => n);
    const props = [];
    for (const p of g.world.props) {
      const t = p.body.translation();
      if ((t.x - pp.x) ** 2 + (t.z - pp.z) ** 2 < 35 * 35) { props.push(p); if (props.length >= REC_PROPS) break; }
    }
    const remotes = [...g.net.remotes.values()];
    const f = { pr: new Float32Array(NP), npcs, np: new Float32Array(npcs.length * NP), props, pp: new Float32Array(props.length * 7), remotes, rp: new Float32Array(remotes.length * NP), driving: g.driving.active };
    writeRagdoll(g.player.ragdoll, f.pr, 0);
    npcs.forEach((n, i) => writeRagdoll(n.ragdoll, f.np, i * NP));
    remotes.forEach((r, i) => writeRagdoll(r.ragdoll, f.rp, i * NP));
    props.forEach((p, i) => { const t = p.body.translation(), q = p.body.rotation(), o = i * 7; f.pp.set([t.x, t.y, t.z, q.x, q.y, q.z, q.w], o); });
    this.frames.push(f);
    if (this.frames.length > MAX_FRAMES) this.frames.shift();
  }

  start() {
    const g = this.game;
    if (this.active || g.paused || this.fun.photo.active) return;
    if (this.frames.length < REC_HZ) { g.hud.toast('Nothing to replay yet!', ''); return; }
    this.active = true; this.paused = false; this.t = 0;
    this.play = this.frames.slice();
    this.camA = g.cam.yaw + Math.PI * 0.6;
    document.body.classList.add('replay');
    g.input.mouseHeld = false;
    sfx.whoosh();
  }

  stop() {
    if (!this.active) return;
    const g = this.game;
    this.active = false; this.play = null;
    document.body.classList.remove('replay');
    // snap everything back to where the (frozen) physics actually is
    g.player.ragdoll.sync();
    g.player.ragdoll.setVisible(!g.driving.active);
    for (const n of g.npcs) n.ragdoll.sync();
    for (const r of g.net.remotes.values()) r.ragdoll.sync();
    for (const p of g.world.props) { const t = p.body.translation(), q = p.body.rotation(); p.mesh.position.set(t.x, t.y, t.z); p.mesh.quaternion.set(q.x, q.y, q.z, q.w); }
    g.camera.fov = 70; g.camera.updateProjectionMatrix();
  }

  key(code) {
    if (code === 'KeyO' || code === 'Escape') this.stop();
    else if (code === 'Space') this.paused = !this.paused;
  }

  /** Render frame while active: pose everything from the recording and sweep the camera around you. */
  update(dt) {
    const g = this.game, F = this.play;
    if (!this.paused) this.t += dt * this.speed;
    const total = (F.length - 1) / REC_HZ;
    if (this.t >= total) this.t = 0;   // loop
    const fi = this.t * REC_HZ, i = Math.floor(fi), k = fi - i;
    const a = F[i], b = F[Math.min(F.length - 1, i + 1)];
    g.player.ragdoll.setVisible(!a.driving);
    applyRagdoll(g.player.ragdoll, a.pr, b.pr, k, 0);
    a.npcs.forEach((n, j) => { const jb = b.npcs.indexOf(n); applyRagdoll(n.ragdoll, a.np, jb >= 0 ? b.np : a.np, jb >= 0 ? k : 0, j * NP); n.ragdoll.group.visible = true; });
    a.remotes.forEach((r, j) => { if (r.ragdoll.parts) applyRagdoll(r.ragdoll, a.rp, a.rp, 0, j * NP); });
    a.props.forEach((p, j) => { const o = j * 7, s = a.pp; p.mesh.position.set(s[o], s[o + 1], s[o + 2]); p.mesh.quaternion.set(s[o + 3], s[o + 4], s[o + 5], s[o + 6]); });
    // camera: slow orbit around the player's recorded position, a little above
    const px = a.pr[0] + (b.pr[0] - a.pr[0]) * k, py = a.pr[1] + (b.pr[1] - a.pr[1]) * k, pz = a.pr[2] + (b.pr[2] - a.pr[2]) * k;
    if (!this.paused) this.camA += dt * 0.35;
    const cam = g.camera;
    cam.position.set(px + Math.sin(this.camA) * 5.5, py + 1.8, pz + Math.cos(this.camA) * 5.5);
    cam.lookAt(px, py + 0.3, pz);
    if (cam.fov !== 55) { cam.fov = 55; cam.updateProjectionMatrix(); }
    this.barFill.style.width = `${(this.t / total) * 100}%`;
  }
}
