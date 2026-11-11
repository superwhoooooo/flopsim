// Progress: area challenges, the home base trophy room, glowing secrets, and the hidden room.
//  - The town is split into 5 areas (Downtown, North, South, East, West), each with 3 silly challenges.
//    The map shows how many are done per area; the journal's Challenges tab lists them.
//  - Home base: a little garage in Old Oak Park. Its shelves fill up with your hats, golden ducks and feat trophies.
//  - Secrets: 6 glowing orbs in hard-to-reach places (rooftops, the water tower, out at sea, a hidden room).
//  - Hidden room: a shed in the west with a cracked wall. Break it open to get in.
import * as THREE from 'three';
import { getMat } from '../ragdoll.js';
import { buildHat, duckMesh, HATS } from '../discovery/hats.js';
import { sfx } from '../audio.js';

export const AREAS = [
  { id: 'downtown', name: 'Downtown', x: 0, z: 0 },
  { id: 'north', name: 'North', x: 0, z: -65 },
  { id: 'south', name: 'South', x: 0, z: 65 },
  { id: 'east', name: 'East', x: 65, z: 0 },
  { id: 'west', name: 'West', x: -65, z: 0 },
];
export function areaOf(x, z) {
  if (Math.abs(x) <= 35 && Math.abs(z) <= 35) return 'downtown';
  if (Math.abs(z) >= Math.abs(x)) return z < 0 ? 'north' : 'south';
  return x > 0 ? 'east' : 'west';
}

// type: which fun.challengeEvent counts; goal: how many; test(data) filters (optional)
export const CHALLENGES = [
  { id: 'dt_fountain', area: 'downtown', text: 'Toss someone into the plaza fountain', type: 'fountain', goal: 1 },
  { id: 'dt_ko', area: 'downtown', text: 'Knock out 10 people downtown', type: 'ko', goal: 10 },
  { id: 'dt_combo', area: 'downtown', text: 'Land a x3 trick combo downtown', type: 'combo', goal: 1, test: (d) => d.n >= 3 },
  { id: 'n_flop', area: 'north', text: 'Tumble 20 m in one flop up north', type: 'flop', goal: 1, test: (d) => d.m >= 20 },
  { id: 'n_drag', area: 'north', text: 'Drag someone or something 25 m (hold F)', type: 'drag', goal: 1, test: (d) => d.m >= 25 },
  { id: 'n_tower', area: 'north', text: 'Topple the water tower', type: 'topple', goal: 1, test: (d) => d.id === 'tower' },
  { id: 's_harbour', area: 'south', text: 'Throw a person or a prop into the harbour', type: 'harbour', goal: 1 },
  { id: 's_air', area: 'south', text: 'Stay in the air for 3 seconds', type: 'air', goal: 1 },
  { id: 's_ko', area: 'south', text: 'Knock out 8 people in the south', type: 'ko', goal: 8 },
  { id: 'e_board', area: 'east', text: 'Topple the giant billboard', type: 'topple', goal: 1, test: (d) => d.id === 'board' },
  { id: 'e_slow', area: 'east', text: 'Knock someone out in slow motion (T)', type: 'slowko', goal: 1 },
  { id: 'e_ko', area: 'east', text: 'Knock out 8 people in the east', type: 'ko', goal: 8 },
  { id: 'w_room', area: 'west', text: 'Break into the hidden room', type: 'room', goal: 1 },
  { id: 'w_hang', area: 'west', text: 'Hang off a ledge for 3 seconds (grab it mid-air)', type: 'hang', goal: 1 },
  { id: 'w_chain', area: 'west', text: 'Set off a 3-person chain reaction', type: 'chain', goal: 1, test: (d) => d.n >= 3 },
];

const _a = new THREE.Vector3();

export class Progress {
  constructor(game, fun) {
    this.game = game; this.fun = fun;
    this.prog = {};             // challenge id -> count
    this.areasDone = new Set();
    this.secrets = new Set();
    this.secretList = [];
    this.home = null;
    this.room = null;
    this.tick = 0;
    this.trophyKey = '';
  }

  // ---------------------------------------------------------------- challenges
  event(type, data, x, z) {
    const area = areaOf(x, z);
    for (const c of CHALLENGES) {
      if (c.type !== type || c.area !== area) continue;
      if ((this.prog[c.id] || 0) >= c.goal) continue;
      if (c.test && !c.test(data)) continue;
      this.prog[c.id] = (this.prog[c.id] || 0) + 1;
      if (this.prog[c.id] >= c.goal) this._done(c);
      this.fun.changed();
    }
  }

  _done(c) {
    const g = this.game, D = g.discovery;
    const a = AREAS.find((ar) => ar.id === c.area);
    D.banner('CHALLENGE DONE', c.text, 'feat');
    D.addPoints(75, 'CHALLENGE');
    sfx.unlock();
    const all = CHALLENGES.filter((k) => k.area === c.area).every((k) => (this.prog[k.id] || 0) >= k.goal);
    if (all && !this.areasDone.has(c.area)) {
      this.areasDone.add(c.area);
      g.timers.push({ t: 2.5, fn: () => { D.banner('AREA COMPLETE', a.name, 'rank'); D.addPoints(150, `${a.name.toUpperCase()} DONE`); sfx.fanfare(); } });
      if (this.areasDone.size >= AREAS.length) D.award('areas_all');
    }
  }

  areaCount(id) {
    const list = CHALLENGES.filter((c) => c.area === id);
    return [list.filter((c) => (this.prog[c.id] || 0) >= c.goal).length, list.length];
  }

  // ---------------------------------------------------------------- world bits: home, hidden room, secrets
  build() {
    this._buildHome();
    this._buildRoom();
  }

  _buildHome() {
    const g = this.game, w = g.world;
    const [x, z] = this.fun.chaos.findSpot(-30, -60, 4.2);   // Old Oak Park
    const ry = Math.atan2(-x, -z);   // open side faces downtown
    const grp = new THREE.Group(); grp.position.set(x, 0, z); grp.rotation.y = ry;
    const wall = getMat(0xe9dcc4, { roughness: 0.85 }), trim = getMat(0x7a4a2a), roof = getMat(0xb5452f, { roughness: 0.7 });
    const box = (sx, sy, sz, px, py, pz, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat); m.position.set(px, py, pz); m.castShadow = true; m.receiveShadow = true; grp.add(m); return m; };
    box(6, 0.1, 5, 0, 0.05, 0, getMat(0x8f8a80));
    box(6, 3, 0.2, 0, 1.5, -2.4, wall);
    box(0.2, 3, 5, -2.9, 1.5, 0, wall); box(0.2, 3, 5, 2.9, 1.5, 0, wall);
    box(6.6, 0.25, 5.6, 0, 3.12, 0, roof);
    // sign over the opening
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const x2 = c.getContext('2d'); x2.fillStyle = '#7a4a2a'; x2.fillRect(0, 0, 512, 128); x2.fillStyle = '#ffe14a'; x2.font = '900 72px Trebuchet MS, sans-serif'; x2.textAlign = 'center'; x2.textBaseline = 'middle'; x2.fillText('HOME', 256, 68);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 })); sign.position.set(0, 2.7, 2.52); grp.add(sign);
    box(2.8, 0.75, 0.08, 0, 2.7, 2.47, trim);
    // shelves on the back wall
    for (const y of [0.7, 1.45, 2.2]) box(5.4, 0.08, 0.5, 0, y, -2.05, trim);
    g.scene.add(grp);
    // physics: back + side walls + roof
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry);
    const at = (lx, lz) => { const v = new THREE.Vector3(lx, 0, lz).applyQuaternion(q); return [x + v.x, z + v.z]; };
    const sb = (lx, ly, lz, hx, hy, hz) => { const [px, pz] = at(lx, lz); g.physics.addStaticBox(px, ly, pz, hx, hy, hz, ry); };
    sb(0, 1.5, -2.4, 3, 1.5, 0.1); sb(-2.9, 1.5, 0, 0.1, 1.5, 2.5); sb(2.9, 1.5, 0, 0.1, 1.5, 2.5); sb(0, 3.12, 0, 3.3, 0.12, 2.8);
    w.houses.push({ x, z, w: 6, d: 5, h: 3.2, home: true });   // NPCs walk around it
    this.home = { x, z, ry, grp, shelf: new THREE.Group() };
    grp.add(this.home.shelf);
    g.discovery.landmarkList.push({ id: 'home', name: 'Home Base', x, z, r: 4.5 });
    this.refreshTrophies(true);
  }

  /** Rebuild the trophy shelves (hats / ducks / feat cups) when something changed. */
  refreshTrophies(force = false) {
    const D = this.game.discovery, h = this.home;
    if (!h) return;
    const key = `${[...D.hats].join(',')}|${D.ducksFound.size}|${D.feats.size}`;
    if (!force && key === this.trophyKey) return;
    this.trophyKey = key;
    const s = h.shelf;
    for (const c of s.children.slice()) s.remove(c);
    // top shelf: hats on little stands
    const hats = HATS.filter((ht) => ht.id !== 'none' && D.hats.has(ht.id)).slice(0, 10);
    hats.forEach((ht, i) => {
      const stand = new THREE.Group(); stand.position.set(-2.4 + i * 0.53, 2.32, -2.05);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), getMat(0xd8d0c0)); head.position.y = 0.08; stand.add(head);
      const hatG = new THREE.Group(); hatG.position.y = 0.08; hatG.scale.setScalar(0.85); buildHat(ht.id, hatG); stand.add(hatG);
      s.add(stand);
    });
    // middle shelf: golden ducks
    for (let i = 0; i < Math.min(18, D.ducksFound.size); i++) {
      const d = duckMesh(); d.scale.setScalar(0.32); d.position.set(-2.5 + i * 0.29, 1.56, -2.0); s.add(d);
    }
    // bottom shelf: a trophy cup for every 3 feats
    const cups = Math.min(14, Math.floor(D.feats.size / 3));
    const gold = getMat(0xffcc33, { metalness: 0.85, roughness: 0.25 });
    for (let i = 0; i < cups; i++) {
      const cup = new THREE.Group(); cup.position.set(-2.45 + i * 0.37, 0.75, -2.0);
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.05, 0.14, 12), gold); bowl.position.y = 0.2; cup.add(bowl);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.1, 6), gold); stem.position.y = 0.08; cup.add(stem);
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.12), getMat(0x3a2a1c)); base.position.y = 0.02; cup.add(base);
      s.add(cup);
    }
  }

  _buildRoom() {
    const g = this.game, w = g.world;
    const [x, z] = this.fun.chaos.findSpot(-70, 18, 3);
    const ry = Math.atan2(-x, -z);   // cracked wall faces into town
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry);
    const at = (lx, lz) => { const v = new THREE.Vector3(lx, 0, lz).applyQuaternion(q); return [x + v.x, z + v.z]; };
    const wall = getMat(0xb5a48a, { roughness: 0.9 }), roofM = getMat(0x5a4a3a);
    const grp = new THREE.Group(); grp.position.set(x, 0, z); grp.rotation.y = ry;
    const box = (sx, sy, sz, px, py, pz, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat); m.position.set(px, py, pz); m.castShadow = true; m.receiveShadow = true; grp.add(m); };
    box(3.2, 2.6, 0.2, 0, 1.3, -1.5, wall); box(0.2, 2.6, 3.2, -1.5, 1.3, 0, wall); box(0.2, 2.6, 3.2, 1.5, 1.3, 0, wall);
    box(3.6, 0.2, 3.6, 0, 2.7, 0, roofM);
    box(3.2, 0.2, 0.2, 0, 2.5, 1.5, wall);   // lintel over the cracked wall
    // a little lamp inside so it glows when you break in
    const lamp = new THREE.PointLight(0xffd27a, 3, 6); lamp.position.set(0, 2.2, 0); grp.add(lamp);
    g.scene.add(grp);
    const sb = (lx, ly, lz, hx, hy, hz) => { const [px, pz] = at(lx, lz); g.physics.addStaticBox(px, ly, pz, hx, hy, hz, ry); };
    sb(0, 1.3, -1.5, 1.6, 1.3, 0.1); sb(-1.5, 1.3, 0, 0.1, 1.3, 1.6); sb(1.5, 1.3, 0, 0.1, 1.3, 1.6); sb(0, 2.7, 0, 1.8, 0.1, 1.8);
    w.houses.push({ x, z, w: 3.4, d: 3.4, h: 2.8, room: true });
    const [wx, wz] = at(0, 1.5);
    this.room = { x, z, ry, wx, wz, entered: false };
    this.room.wall = this.fun.chaos.buildSecretWall(this.room);
  }

  /** Secrets: placed after set pieces exist (one sits on top of the water tower). */
  placeSecrets() {
    const g = this.game, w = g.world;
    const tall = [...w.houses].filter((h) => !h.home && !h.room && h.h > 12).sort((a, b) => b.h - a.h);
    const spots = [];
    if (tall[0]) spots.push([tall[0].x, tall[0].h + 0.9, tall[0].z, 'On the tallest roof in town']);
    if (tall[3]) spots.push([tall[3].x, tall[3].h + 0.9, tall[3].z, 'On a very tall roof']);
    const tower = this.fun.chaos.pieces.find((p) => p.id === 'tower');
    if (tower) spots.push([tower.x, 11.2, tower.z, 'On top of the water tower']);
    const board = this.fun.chaos.pieces.find((p) => p.id === 'board');
    if (board) spots.push([board.x, 10.6, board.z, 'Balanced on top of the billboard']);
    spots.push([118, 0.9, 118, 'Way out at sea, south-east']);
    if (this.room) spots.push([this.room.x, 1.1, this.room.z, 'Inside the hidden room', true]);
    const mat = new THREE.MeshStandardMaterial({ color: 0x9fe8ff, emissive: 0x40c8ff, emissiveIntensity: 2.2, transparent: true, opacity: 0.85, roughness: 0.2 });
    spots.forEach(([x, y, z, where, inRoom], i) => {
      const grp = new THREE.Group();
      grp.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 1), mat));
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.font = '900 52px Trebuchet MS, sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText('?', 32, 36);
      const tex = new THREE.CanvasTexture(c);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false })); sp.scale.setScalar(0.45); grp.add(sp);
      grp.position.set(x, y, z);
      g.scene.add(grp);
      this.secretList.push({ id: 's' + i, x, y, z, where, grp, inRoom: !!inRoom });
    });
    for (const s of this.secretList) s.grp.visible = !this.secrets.has(s.id);
  }

  _findSecret(s) {
    const D = this.game.discovery;
    this.secrets.add(s.id);
    s.grp.visible = false;
    D.banner(`SECRET ${this.secrets.size} / ${this.secretList.length}`, s.where, 'place');
    D.addPoints(75, 'SECRET');
    sfx.hat(); sfx.fanfare();
    if (this.secrets.size >= this.secretList.length) D.award('secrets_all');
    this.fun.changed();
  }

  // ---------------------------------------------------------------- per fixed step
  step() {
    const g = this.game, D = g.discovery;
    if (++this.tick % 6 !== 0) return;
    const pp = g.player.ragdoll.getPos(_a);
    for (const s of this.secretList) if (!this.secrets.has(s.id) && !(s.inRoom && !this.room.wall.fallen) && Math.hypot(s.x - pp.x, s.y - pp.y, s.z - pp.z) < 1.6) this._findSecret(s);
    // home
    if (this.home && Math.hypot(pp.x - this.home.x, pp.z - this.home.z) < 4) {
      if (!D.feats.has('home')) { D.award('home'); g.hud.toast('Welcome home! Your hats, golden ducks and trophies show up on these shelves.', 'unlock'); }
    }
    if (this.tick % 60 === 0) this.refreshTrophies();
    // hidden room: get inside
    const R = this.room;
    if (R && R.wall.fallen && Math.hypot(pp.x - R.x, pp.z - R.z) < 1.4) {
      if (!R.entered) { R.entered = true; D.award('secret_room'); this.fun.challengeEvent('room', {}); }
    }
    // fountain + harbour: people / props you sent flying landing there
    if (this.tick % 12 === 0) {
      const t = g.time;
      for (const n of g.npcs) {
        if (n.dormant || t - (n.lastHitByPlayer ?? -99) > 8) continue;
        const p = n.ragdoll.getPos(_a);
        if (n.knockedOut() && Math.hypot(p.x, p.z) < 3.1 && p.y < 1.4 && !n._fountain) { n._fountain = t; this.fun.challengeEvent('fountain', {}, 0, 0); }
        if ((Math.abs(p.x) > 106 || Math.abs(p.z) > 106) && !n._harbour) { n._harbour = t; this.fun.challengeEvent('harbour', {}, p.x, p.z); }
      }
      for (const p of g.world.props) {
        if (t - (p.taintT ?? -99) > 8 || p._harbour) continue;
        const tr = p.body.translation();
        if (Math.abs(tr.x) > 106 || Math.abs(tr.z) > 106) { p._harbour = t; this.fun.challengeEvent('harbour', {}, tr.x, tr.z); }
      }
    }
  }

  update(t) {
    for (const s of this.secretList) { if (!s.grp.visible) continue; s.grp.rotation.y = t * 1.5; s.grp.position.y = s.y + Math.sin(t * 2 + s.x) * 0.12; }
  }

  serialize() { return { prog: this.prog, areas: [...this.areasDone], secrets: [...this.secrets], room: !!this.room?.entered }; }
  load(d) {
    if (!d) return;
    if (d.prog && typeof d.prog === 'object') for (const c of CHALLENGES) if (Number(d.prog[c.id]) > 0) this.prog[c.id] = Math.min(c.goal, Number(d.prog[c.id]));
    if (Array.isArray(d.areas)) d.areas.forEach((a) => this.areasDone.add(a));
    if (Array.isArray(d.secrets)) d.secrets.forEach((s) => this.secrets.add(s));
    for (const s of this.secretList) s.grp.visible = !this.secrets.has(s.id);
    if (d.room && this.room) this.room.entered = true;
    this.refreshTrophies(true);
  }
}
