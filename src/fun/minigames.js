// Multiplayer minigames (the host starts them from the N panel) and co-op launches.
//  - Floor is Lava: after a 5 s warning, touching the ground burns you. Last one standing (on benches, cars,
//    roofs, the fountain...) wins.
//  - King of the Hill: stand in the glowing ring to score a point a second. Most points wins.
//  - Flop Tag: whoever is IT tags someone by touching them; the tagged player flops over and is IT now.
//    You score a point for every second you are NOT it.
//  - Prop Hunt: one seeker counts to 15 (blind) while everyone else turns into a crate, barrel, bin or melon
//    (attack to switch disguise). Then the seeker hunts: attack a suspicious prop up close to find a friend.
//  - Co-op launch: whenever a friend's hit sends you flying, your flight is measured and everyone sees how far.
// The host keeps the scores; everyone checks their own player and reports events to the host.
import * as THREE from 'three';
import { getMat } from '../ragdoll.js';
import { sfx } from '../audio.js';

const KINDS = {
  lava: { name: 'Floor is Lava', icon: '🌋', dur: 75, help: 'Get off the ground! Benches, cars, roofs, the fountain... Last one standing wins.' },
  hill: { name: 'King of the Hill', icon: '👑', dur: 90, help: 'Stand inside the glowing ring to score. Shove the others out!' },
  tag: { name: 'Flop Tag', icon: '🏃', dur: 90, help: 'Whoever is IT: touch someone to tag them. Score a point every second you are NOT it.' },
  hide: { name: 'Prop Hunt', icon: '📦', dur: 105, help: 'Hiders: you are a prop now (attack to switch). Seeker: attack props up close to find people.' },
};
const LAVA_WARM = 5, HIDE_PHASE = 15, HILL_R = 5;
const DISGUISES = ['crate', 'barrel', 'bin', 'melon'];

const _a = new THREE.Vector3(), _b = new THREE.Vector3();

function disguiseMesh(kind) {
  let m;
  if (kind === 'crate') { m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), getMat(0xb98550)); m.add(new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.1, 0.92), getMat(0x7d5632))); }
  else if (kind === 'barrel') { m = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.95, 14), getMat(0x9a5a2e)); }
  else if (kind === 'bin') { m = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.26, 0.9, 12), getMat(0x2f6b3a, { roughness: 0.5, metalness: 0.4 })); }
  else { m = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), getMat(0x3f8f3a, { roughness: 0.55 })); }
  m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return m;
}

export class Minigames {
  constructor(game, fun) {
    this.game = game; this.fun = fun;
    this.net = game.net;
    this.cur = null;
    this.disguise = null;
    this.launch = null;
    this.best = null;          // best launch this session { by, who, dist }
    this.reportT = 0;
    this.disguiseMeshes = new Map();   // player id (or 'me') -> { kind, mesh }
    this.itMarks = new Map();
    this._buildHud();
    // hill ring
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(HILL_R, 0.12, 8, 64).rotateX(Math.PI / 2), getMat(0xffe14a, { emissive: 0xffc000, emissiveIntensity: 2 }));
    this.ring.visible = false; game.scene.add(this.ring);
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(HILL_R, HILL_R, 14, 40, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
    this.beam.visible = false; game.scene.add(this.beam);
    const net = this.net;
    net.on('mg', (m) => this._onMg(m));
    net.on('mgev', (m, from) => { if (net.isHost) this._onEv(m, from); });
    net.on('launch', (m, from) => this._onLaunch(m, from));
  }

  get me() { return this.net.myId; }
  ids() { return [this.net.myId, ...this.net.remotes.keys()]; }
  name(id) { return this.net.nameOf(id).replace(/[<>&]/g, ''); }

  // ---------------------------------------------------------------- panel (N)
  renderPanel(el) {
    if (!el) return;
    const net = this.net;
    if (!net.active) { el.innerHTML = ''; return; }
    const best = this.best ? `<div class="mg-best">🚀 Longest launch: ${this.name(this.best.by)} launched ${this.name(this.best.who)} ${this.best.dist.toFixed(1)} m</div>` : '';
    if (!net.isHost) { el.innerHTML = `<div class="mg-note">${this.cur ? `Playing <b>${KINDS[this.cur.kind].name}</b>!` : 'Minigames: the host can start one from here.'}</div>${best}`; return; }
    el.innerHTML = `<div class="mg-title">Minigames</div><div class="mg-btns">${Object.entries(KINDS).map(([k, v]) => `<button data-mg="${k}" ${this.cur ? 'disabled' : ''}>${v.icon} ${v.name}</button>`).join('')}</div>`
      + (this.cur ? '<button class="mg-stop">Stop game</button>' : '') + best;
    el.querySelectorAll('[data-mg]').forEach((b) => b.addEventListener('click', () => { this.start(b.dataset.mg); this.net.toggle(false); }));
    el.querySelector('.mg-stop')?.addEventListener('click', () => this.end(true));
  }

  // ---------------------------------------------------------------- host: start / end
  start(kind) {
    const net = this.net, g = this.game;
    if (!net.isHost || this.cur) return;
    const ids = this.ids();
    if (ids.length < 2) { g.hud.toast('Minigames need at least 2 players. Share your room code!', ''); sfx.error(); return; }
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    const m = { t: 'mg', act: 'start', kind, dur: KINDS[kind].dur, players: ids, scores: Object.fromEntries(ids.map((i) => [i, 0])) };
    if (kind === 'hill') { const l = pick(g.discovery.landmarkList.filter((x) => Math.abs(x.x) < 100 && Math.abs(x.z) < 100)); m.hill = [l.x, l.z, l.name]; }
    if (kind === 'tag') m.it = pick(ids);
    if (kind === 'hide') m.seeker = pick(ids);
    net.send(m);
    this._onMg(m);
  }

  end(stopped = false) {
    const c = this.cur, net = this.net;
    if (!c || !net.isHost) return;
    let winners = [];
    if (!stopped) {
      if (c.kind === 'lava') winners = c.players.filter((i) => !c.out.includes(i));
      else if (c.kind === 'hide') winners = c.found.length >= c.players.length - 1 ? [c.seeker] : c.players.filter((i) => i !== c.seeker && !c.found.includes(i));
      else { const top = Math.max(...c.players.map((i) => c.scores[i] || 0)); winners = c.players.filter((i) => (c.scores[i] || 0) === top); }
    }
    const m = { t: 'mg', act: 'end', winners, scores: c.scores, stopped };
    net.send(m);
    this._onMg(m);
  }

  _broadcastScores(it = this.cur.it) {
    const c = this.cur;
    const m = { t: 'mg', act: 'score', scores: c.scores, out: c.out, found: c.found, it };
    this.net.send(m);
    this._onMg(m);
  }

  // ---------------------------------------------------------------- everyone: game messages from the host
  _onMg(m) {
    const g = this.game, me = this.me;
    if (m.act === 'start') {
      this.cur = { kind: m.kind, t: 0, dur: m.dur, players: m.players || [], scores: m.scores || {}, out: [], found: [], it: m.it, seeker: m.seeker, hill: m.hill, tagCd: 0, sec: 0, burned: false };
      const k = KINDS[m.kind];
      g.discovery.banner(`${k.icon} ${k.name.toUpperCase()}`, k.help, 'rank');
      sfx.fanfare();
      if (m.kind === 'hill' && m.hill) { this.ring.position.set(m.hill[0], 0.15, m.hill[1]); this.beam.position.set(m.hill[0], 7, m.hill[1]); this.ring.visible = this.beam.visible = true; g.hud.toast(`The hill is at ${m.hill[2]}! Check the map (M).`, ''); }
      if (m.kind === 'tag' && m.it === me) this._tagged();
      if (m.kind === 'hide') {
        if (m.seeker === me) g.hud.toast(`You are the SEEKER. Count to ${HIDE_PHASE}...`, 'unlock');
        else { this.setDisguise(DISGUISES[Math.floor(Math.random() * DISGUISES.length)]); g.hud.toast(`HIDE! You have ${HIDE_PHASE} s. Stand still somewhere sneaky. Attack to switch prop.`, 'unlock'); }
      }
      this.net._refresh();
    } else if (m.act === 'score' && this.cur) {
      const c = this.cur, wasIt = c.it;
      c.scores = m.scores || c.scores; c.out = m.out || c.out; c.found = m.found || c.found;
      if (m.it && m.it !== wasIt) { c.it = m.it; if (m.it === me) this._tagged(); else g.hud.toast(`${this.name(m.it)} is IT!`, ''); }
      if (c.kind === 'hide' && c.found.includes(me) && this.disguise) { this.setDisguise(null); g.hud.toast('Found you!', ''); sfx.error(); }
    } else if (m.act === 'end' && this.cur) {
      const won = (m.winners || []).includes(me);
      if (!m.stopped) {
        const names = (m.winners || []).map((i) => this.name(i)).join(', ') || 'Nobody';
        g.discovery.banner(won ? 'YOU WIN!' : 'GAME OVER', `Winner: ${names}`, won ? 'feat' : 'place');
        if (won) { g.discovery.award('mg_win'); g.discovery.addPoints(150, 'MINIGAME WIN'); sfx.fanfare(); }
      } else g.hud.toast('The host stopped the minigame.', '');
      this.reset();
    }
  }

  reset() {
    this.cur = null;
    this.setDisguise(null);
    this.ring.visible = this.beam.visible = false;
    for (const [, m] of this.itMarks) m.visible = false;
    this.hud.classList.remove('show');
    document.body.classList.remove('mg-blind', 'mg-lava');
    this.net._refresh?.();
  }

  _tagged() {
    const g = this.game, r = g.player.ragdoll;
    g.hud.toast("You're IT! Tag someone!", 'unlock'); sfx.boing();
    if (!g.driving.active) r.knockout(1.8);
    this.cur.tagCd = this.cur.t + 3;   // no instant tag-backs
  }

  // ---------------------------------------------------------------- host: events from players
  _onEv(m, from) {
    const c = this.cur;
    if (!c) return;
    if (m.ev === 'out' && c.kind === 'lava' && !c.out.includes(from)) { c.out.push(from); this.game.hud.toast(`${this.name(from)} touched the lava!`, ''); }
    if (m.ev === 'hill' && c.kind === 'hill') c.scores[from] = (c.scores[from] || 0) + 1;
    let it = c.it;
    if (m.ev === 'tag' && c.kind === 'tag' && from === c.it && c.players.includes(m.who) && c.t >= (c.hostTagCd || 0)) { it = m.who; c.hostTagCd = c.t + 2.5; }
    if (m.ev === 'found' && c.kind === 'hide' && from === c.seeker && !c.found.includes(m.who) && m.who !== c.seeker) { c.found.push(m.who); this.game.hud.toast(`${this.name(m.who)} was found!`, ''); }
    this._broadcastScores(it);
    if (c.kind === 'lava' && c.players.length - c.out.length <= 1) this.end();
    if (c.kind === 'hide' && c.found.length >= c.players.length - 1) this.end();
  }

  _ev(m) {
    m.t = 'mgev';
    if (this.net.isHost) this._onEv(m, this.me); else this.net.sendTo('host', m);
  }

  // ---------------------------------------------------------------- props disguise
  setDisguise(kind) {
    this.disguise = kind;
    const r = this.game.player.ragdoll;
    if (!this.game.driving.active) r.setVisible(!kind);
    this._meshFor('me', kind);
  }

  _meshFor(id, kind) {
    let d = this.disguiseMeshes.get(id);
    if (d && d.kind !== kind) { this.game.scene.remove(d.mesh); this.disguiseMeshes.delete(id); d = null; }
    if (!kind || d) return d;
    d = { kind, mesh: disguiseMesh(kind) };
    this.game.scene.add(d.mesh);
    this.disguiseMeshes.set(id, d);
    return d;
  }

  /** Attack pressed. Returns true if a minigame used it. */
  attackPress() {
    const c = this.cur;
    if (!c || c.kind !== 'hide') return false;
    if (this.disguise) { this.setDisguise(DISGUISES[(DISGUISES.indexOf(this.disguise) + 1) % DISGUISES.length]); sfx.pop(); return true; }
    if (c.seeker === this.me && c.t > HIDE_PHASE) {
      const pp = this.game.player.ragdoll.getPos(_a);
      for (const [id, r] of this.net.remotes) {
        const snap = r.snaps[r.snaps.length - 1];
        if (!snap?.dg || c.found.includes(id)) continue;
        if (r.ragdoll.getPos(_b).distanceTo(pp) < 2.8) { this._ev({ ev: 'found', who: id }); sfx.bonk(1); return false; }
      }
    }
    return false;
  }

  netState() { return this.disguise ? { dg: this.disguise } : null; }

  // ---------------------------------------------------------------- co-op launches
  onFriendHit(by) {
    const r = this.game.player.ragdoll;
    this.launch = { by, start: r.getPos(new THREE.Vector3()), t: 0, air: false };
  }

  _stepLaunch(dt) {
    const L = this.launch;
    if (!L) return;
    const g = this.game, r = g.player.ragdoll;
    L.t += dt;
    const p = r.getPos(_a);
    // (a knocked-out ragdoll doesn't update r.grounded, so look for the ground ourselves)
    const hit = g.physics.castRay(p.x, p.y, p.z, 0, -1, 0, 3, undefined, (col) => !g.player.colliderHandles.has(col.handle));
    const v = r.parts.pelvis.body.linvel();
    const down = hit && hit.toi < 1.1 && Math.hypot(v.x, v.y, v.z) < 2.5;
    if (!down) L.air = true;
    if ((L.air && down && L.t > 0.4) || L.t > 6) {
      this.launch = null;
      const dist = Math.hypot(p.x - L.start.x, p.z - L.start.z);
      if (dist < 6) return;
      const m = { t: 'launch', by: L.by, who: this.me, dist: Math.round(dist * 10) / 10 };
      this.net.send(m);
      this._onLaunch(m);
    }
  }

  _onLaunch(m) {
    const g = this.game, dist = +m.dist || 0;
    g.hud.toast(`🚀 ${this.name(m.by)} launched ${this.name(m.who)} ${dist.toFixed(1)} m!`, dist >= 20 ? 'unlock' : '');
    if (dist >= 20 && (m.by === this.me || m.who === this.me)) g.discovery.award('launch20');
    if (!this.best || dist > this.best.dist) { this.best = { by: m.by, who: m.who, dist }; if (this.net.open) this.net._refresh(); }
  }

  // ---------------------------------------------------------------- per fixed step
  step(dt) {
    this._stepLaunch(dt);
    const c = this.cur;
    if (!c || !this.net.active) return;
    const g = this.game, me = this.me, r = g.player.ragdoll;
    c.t += dt;
    const pp = r.getPos(_a);
    const second = Math.floor(c.t) !== Math.floor(c.t - dt);
    if (c.kind === 'lava') {
      document.body.classList.toggle('mg-lava', c.t > LAVA_WARM && !c.out.includes(me));
      if (c.t > LAVA_WARM && !c.out.includes(me) && !c.burned && !g.driving.active) {
        const hit = g.physics.castRay(pp.x, pp.y, pp.z, 0, -1, 0, 1.6, undefined, (col) => !g.player.colliderHandles.has(col.handle));
        const onFloor = hit && hit.y < 0.35 && !g.physics.ownerOf(hit.collider);
        if (onFloor) {
          c.burned = true;
          this._ev({ ev: 'out' });
          g.effects.explosion(new THREE.Vector3(pp.x, 0.2, pp.z), 0.6);
          r.knockout(2.5); sfx.explosion(0.5);
          g.hud.toast('🔥 BURNED! You touched the lava.', '');
        }
      }
      if (second && c.t > LAVA_WARM && c.t < LAVA_WARM + 1) g.hud.toast('🌋 THE FLOOR IS LAVA!', 'unlock');
    } else if (c.kind === 'hill') {
      const [hx, hz] = c.hill || [0, 0];
      const inside = Math.hypot(pp.x - hx, pp.z - hz) < HILL_R && r.mode !== 'limp';
      if (second && inside) { this._ev({ ev: 'hill' }); sfx.blip(700); }
    } else if (c.kind === 'tag') {
      if (c.it === me && c.t > c.tagCd && r.mode !== 'limp') {
        for (const [id, rem] of this.net.remotes) {
          if (rem.ragdoll.getPos(_b).distanceTo(pp) < 1.5) { this._ev({ ev: 'tag', who: id }); c.tagCd = c.t + 2.5; sfx.bonk(1); break; }
        }
      }
      if (this.net.isHost && second) { for (const id of c.players) if (id !== c.it) c.scores[id] = (c.scores[id] || 0) + 1; this._broadcastScores(); }
    } else if (c.kind === 'hide') {
      document.body.classList.toggle('mg-blind', c.seeker === me && c.t < HIDE_PHASE);
      if (second && c.t > HIDE_PHASE && c.t < HIDE_PHASE + 1) g.hud.toast(c.seeker === me ? 'Ready or not... go find them!' : 'The seeker is coming! Hold still...', 'unlock');
      if (this.net.isHost && second && c.t > HIDE_PHASE) { for (const id of c.players) if (id !== c.seeker && !c.found.includes(id)) c.scores[id] = (c.scores[id] || 0) + 1; this._broadcastScores(); }
    }
    if (this.net.isHost) {
      if (c.kind === 'hill' && second) this._broadcastScores();
      if (c.t >= c.dur) this.end();
    }
    if (second) this._renderHud();
  }

  // ---------------------------------------------------------------- render frame
  sync(t) {
    const c = this.cur, g = this.game;
    // our own disguise
    const mine = this.disguiseMeshes.get('me');
    if (mine) { const p = g.player.ragdoll.getPos(_a); mine.mesh.position.set(p.x, Math.max(0.45, p.y - 0.5), p.z); g.player.ragdoll.setVisible(false); }
    // friends' disguises and IT markers
    for (const [id, rem] of this.net.remotes) {
      const snap = rem.snaps[rem.snaps.length - 1];
      const dg = c && c.kind === 'hide' && snap?.dg ? snap.dg : null;
      const d = this._meshFor(id, dg);
      if (d) { const p = rem.ragdoll.getPos(_a); d.mesh.position.set(p.x, Math.max(0.45, p.y - 0.5), p.z); rem.ragdoll.setVisible(false); }
      if (rem.tag?.obj) rem.tag.obj.visible = !dg;
      this._itMark(id, c?.kind === 'tag' && c.it === id ? rem.ragdoll : null, t);
    }
    this._itMark('me', c?.kind === 'tag' && c.it === this.me ? g.player.ragdoll : null, t);
    if (this.ring.visible) { this.ring.rotation.y = t * 0.5; this.beam.material.opacity = 0.09 + Math.sin(t * 3) * 0.04; }
  }

  _itMark(id, ragdoll, t) {
    let m = this.itMarks.get(id);
    if (!ragdoll) { if (m) m.visible = false; return; }
    if (!m) { m = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 12).rotateX(Math.PI), getMat(0xff2a3d, { emissive: 0xff0000, emissiveIntensity: 1.5 })); this.game.scene.add(m); this.itMarks.set(id, m); }
    const h = ragdoll.parts.head.body.translation();
    m.position.set(h.x, h.y + 0.75 + Math.sin(t * 5) * 0.08, h.z); m.rotation.y = t * 3;
    m.visible = true;
  }

  // ---------------------------------------------------------------- HUD
  _buildHud() {
    this.hud = document.createElement('div'); this.hud.id = 'mgBox';
    document.getElementById('hud').appendChild(this.hud);
  }

  _renderHud() {
    const c = this.cur;
    if (!c) { this.hud.classList.remove('show'); return; }
    const k = KINDS[c.kind], me = this.me;
    const left = Math.max(0, Math.ceil(c.dur - c.t));
    let role = '';
    if (c.kind === 'lava') role = c.t < LAVA_WARM ? `Get off the ground! ${Math.ceil(LAVA_WARM - c.t)}...` : c.out.includes(me) ? 'Burned. Spectating...' : 'Stay off the floor!';
    if (c.kind === 'tag') role = c.it === me ? 'YOU are IT!' : `${this.name(c.it)} is IT`;
    if (c.kind === 'hide') role = c.seeker === me ? (c.t < HIDE_PHASE ? `Counting... ${Math.ceil(HIDE_PHASE - c.t)}` : `Find them! ${c.found.length}/${c.players.length - 1} found`) : c.found.includes(me) ? 'Found! Spectating...' : `Hiding as a ${this.disguise || 'person'}`;
    if (c.kind === 'hill') role = 'Stand in the ring!';
    const rows = c.players.map((i) => {
      const s = c.kind === 'lava' ? (c.out.includes(i) ? '🔥' : '✔') : c.kind === 'hide' && i !== c.seeker && c.found.includes(i) ? '👀' : (c.scores[i] || 0);
      return `<div class="${i === me ? 'me' : ''}"><span>${this.name(i)}${c.it === i || c.seeker === i ? ' ⭐' : ''}</span><b>${s}</b></div>`;
    }).join('');
    this.hud.innerHTML = `<div class="mg-h">${k.icon} ${k.name} <span>${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</span></div><div class="mg-role">${role}</div><div class="mg-rows">${rows}</div>`;
    this.hud.classList.add('show');
  }
}
