// Discovery & progression: golden ducks hidden around town, named landmarks, feats, Flop Points with ranks, and hats.
// Everything here is driven by game events (event()) plus a few per-step checks (step()).
import * as THREE from 'three';
import { HAT_POS, LIGHTHOUSE_POS, SHOPS, ROADS, ROAD_W } from '../world/world.js';
import { groups, G } from '../physics.js';
import { sfx } from '../audio.js';
import { FEATS, FEAT_BY_ID, RANKS, DUCK_HATS, POINTS } from './feats.js';
import { HATS, HAT_BY_ID, buildHat, duckMesh } from './hats.js';
import { QUESTS } from '../quests/quests.js';
import { BASE_FORMS, ANIMALS } from '../animals.js';

export const DUCK_COUNT = 30;
const COLLECT_R = 1.7;        // m from the pelvis
const QUACK_R = 22;           // ducks quack when you are this close
const KO_COMBO_WINDOW = 1.5;  // s
const FLOP_MIN = 3;           // m of tumbling before a flop scores
const ONE_HIT_WINDOW = 0.3;   // s: knockouts this close together count as one hit

function mulberry(seed) {
  let a = seed;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const titleCase = (s) => s.toLowerCase().replace(/(^|[\s&])([a-z])/g, (m, a, b) => a + b.toUpperCase());

/** Rough compass area for a spot, used for hints: "in the north-west", "downtown", "out on the water". */
export function regionOf(x, z) {
  if (Math.abs(x) > 104 || Math.abs(z) > 104) return 'out on the water';
  const ns = z < -35 ? 'north' : z > 35 ? 'south' : '', ew = x < -35 ? 'west' : x > 35 ? 'east' : '';
  return ns || ew ? `in the ${ns}${ns && ew ? '-' : ''}${ew}` : 'downtown';
}

export class Discovery {
  constructor(game) {
    this.game = game;
    this.points = 0;
    this.ducksFound = new Set();     // duck indices
    this.feats = new Set();
    this.landmarks = new Set();
    this.hats = new Set(['none']);
    this.hat = 'none';
    this.hatsWorn = new Set();
    this.skins = new Set();          // locked skins you have earned (e.g. 'spider')
    this.hitGroup = { start: -9, n: 0 };
    this.stats = { kos: 0, limbs: 0, said: 0, forms: ['human'], webMeters: 0 };
    this.introShown = false;
    this.onChange = null;
    // transient
    this.koTimes = [];
    this.flop = null;
    this.air = 0;
    this.spinT = 0;
    this.driveKOs = 0;
    this.quackT = 2;
    this.hatGroup = null;
    this.hatAnim = null;
    this._v = new THREE.Vector3();
    this._buildDucks();
    this._buildLandmarks();
    this._buildHud();
    this.refreshHud();
  }

  // ---------------------------------------------------------------- ducks
  _duckSpots() {
    const w = this.game.world, spots = [];
    const add = (x, y, z, where) => spots.push({ x, y, z, where });
    add(6.9, 3.1, -6, 'On top of the crate pyramid by the plaza');
    add(HAT_POS.x + 4.4, 0.45, HAT_POS.z, 'Behind the rocks in Lost Hat Park');
    add(LIGHTHOUSE_POS.x + 6, 0.45, LIGHTHOUSE_POS.z - 6, 'Behind the lighthouse');
    add(-30, -0.25, 113, 'Bobbing in the harbour, south of town');
    add(113, -0.25, 40, 'Bobbing in the harbour, east of town');
    add(-113, -0.25, -70, 'Bobbing in the harbour, far north-west');
    if (w.bakery) add(w.bakery.x, 6.45, w.bakery.z + 6.2, "On the bakery's roof");
    for (const [k, s] of Object.entries(w.shops)) add(s.center.x, 4.95, s.center.z, `On the roof of ${titleCase(SHOPS[k].name)}`);
    add(32.5, 0.45, -62.5, 'In Pigeon Park');
    add(-27.5, 0.45, -62.5, 'In Old Oak Park');
    add(62.5, 0.45, 57.5, 'In Sunny Gardens');
    // low rooftops you can Super Jump onto (super jump peaks a little under 12 m)
    const r = mulberry(4242);
    const low = w.houses.filter((h) => h.h > 5 && h.h <= 9.3 && !(w.bakery && Math.abs(h.x - w.bakery.x) < 6 && Math.abs(h.z - (w.bakery.z + 6.2)) < 6));
    for (const h of low.sort(() => r() - 0.5).slice(0, 3)) add(h.x, h.h + 0.45, h.z, 'On a low rooftop');
    // tucked in alleys, right up against buildings
    const onRoad = (v) => ROADS.some((rr) => Math.abs(v - rr) < ROAD_W / 2 + 0.5);
    for (let i = 0; i < 6000 && spots.length < DUCK_COUNT; i++) {
      const x = (r() * 2 - 1) * 94, z = (r() * 2 - 1) * 94;
      if (onRoad(x) || onRoad(z)) continue;
      if (w._blocked(x, z, 0.7) || !w._blocked(x, z, 2.2)) continue;
      if (Math.hypot(x, z) < 10) continue;
      if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < 16)) continue;
      add(x, 0.45, z, 'Tucked in an alley');
    }
    return spots.slice(0, DUCK_COUNT);
  }

  _buildDucks() {
    this.ducks = this._duckSpots().map((s, i) => {
      const mesh = duckMesh();
      mesh.scale.setScalar(0.55);
      mesh.position.set(s.x, s.y, s.z);
      this.game.scene.add(mesh);
      return { ...s, i, mesh, phase: i * 1.7 };
    });
    this.duckTotal = this.ducks.length;
  }

  _collectDuck(d) {
    const g = this.game;
    this.ducksFound.add(d.i);
    d.mesh.visible = false;
    g.effects.bonk(d.x, d.y + 0.3, d.z, 2.5, false);
    sfx.quack(1.4); sfx.hat();
    const n = this.ducksFound.size;
    this.banner(`GOLDEN DUCK  ${n} / ${this.duckTotal}`, d.where, 'duck');
    this.addPoints(POINTS.duck, 'DUCK');
    if (DUCK_HATS[n]) this.unlockHat(DUCK_HATS[n]);
    if (n >= 10) this.award('ducks10');
    if (n >= this.duckTotal) this.award('ducks30');
    this.changed();
  }

  // ---------------------------------------------------------------- landmarks
  _buildLandmarks() {
    const w = this.game.world;
    this.landmarkList = [
      { id: 'plaza', name: 'The Plaza', x: 0, z: 0, r: 9 },
      ...(w.bakery ? [{ id: 'bakery', name: "Bruno's Bakery", x: w.bakery.x, z: w.bakery.z, r: 6 }] : []),
      ...Object.entries(w.shops).map(([k, s]) => ({ id: 'shop_' + k, name: titleCase(SHOPS[k].name), x: s.center.x, z: s.center.z, r: 8 })),
      { id: 'hatpark', name: 'Lost Hat Park', x: -60, z: 30, r: 10 },
      { id: 'pigeon', name: 'Pigeon Park', x: 30, z: -60, r: 10 },
      { id: 'oak', name: 'Old Oak Park', x: -30, z: -60, r: 10 },
      { id: 'gardens', name: 'Sunny Gardens', x: 60, z: 60, r: 10 },
      { id: 'lighthouse', name: 'Lighthouse Pier', x: LIGHTHOUSE_POS.x, z: LIGHTHOUSE_POS.z, r: 12 },
    ];
  }

  _discover(l) {
    this.landmarks.add(l.id);
    sfx.fanfare();
    this.banner('DISCOVERED', l.name, 'place');
    this.addPoints(POINTS.landmark, 'NEW PLACE');
    if (this.landmarks.size >= this.landmarkList.length) this.award('tourist');
    this.changed();
  }

  // ---------------------------------------------------------------- points, ranks, feats, hats
  rankIndex(pts = this.points) { let i = 0; while (i + 1 < RANKS.length && pts >= RANKS[i + 1].pts) i++; return i; }

  addPoints(n, label) {
    if (n <= 0) return;
    const before = this.rankIndex();
    this.points += n;
    this.popup(`+${n} ${label}`);
    const after = this.rankIndex();
    for (let i = before + 1; i <= after; i++) {
      this.banner('RANK UP!', RANKS[i].name, 'rank');
      sfx.fanfare();
      if (RANKS[i].hat) this.unlockHat(RANKS[i].hat);
    }
    this.refreshHud();
    this.changed();
  }

  /** Every quest turned in? (Checked on each turn-in, and on load for saves that finished before feats existed.) */
  checkQuests() {
    const g = this.game;
    if (QUESTS.every((q) => g.quests.state[q.id]?.status === 'done')) this.award('quests');
  }

  award(id) {
    if (this.feats.has(id) || !FEAT_BY_ID[id]) return;
    const f = FEAT_BY_ID[id];
    this.feats.add(id);
    this.banner('FEAT UNLOCKED', f.name, 'feat');
    sfx.unlock();
    this.addPoints(f.pts, 'FEAT');
    if (id === 'tourist') this.unlockHat('halo');
    if (id === 'fivehit') this.unlockSkin('spider');
    if (id === 'ko250') {
      this.game.player.pickup('lift');
      this.game.hud.toast('Lift Beam unlocked! Click someone to lift them, then click and hold to charge a throw.', 'unlock');
    }
    if (id === 'web1000') {
      this.game.player.pickup('grapple');
      this.game.hud.toast('Grapple Hook unlocked! Click to fire: it yanks you to walls and reels people in.', 'unlock');
    }
    this.changed();
  }

  unlockHat(id) {
    if (this.hats.has(id)) return;
    this.hats.add(id);
    const h = HAT_BY_ID[id];
    this.game.hud.toast(`${h.icon} New hat: ${h.name}! Press H to wear it.`, 'unlock');
  }

  unlockSkin(id) {
    if (this.skins.has(id)) return;
    this.skins.add(id);
    const f = ANIMALS[id];
    this.banner('NEW SKIN', `${f.icon} ${f.name}`, 'rank');
    this.game.hud.toast(`${f.icon} ${f.name} unlocked! Press B to put it on. ${f.blurb}`, 'unlock');
    this.changed();
  }

  ownedHats() { return HATS.filter((h) => this.hats.has(h.id)); }

  setHat(id, announce = true) {
    if (!this.hats.has(id)) return;
    this.hat = id;
    if (id !== 'none') this.hatsWorn.add(id);
    this.applyHat();
    if (announce) { const h = HAT_BY_ID[id]; this.game.hud.toast(`${h.icon} ${h.name}`, ''); sfx.equip(); }
    if (this.hatsWorn.size >= 4) this.award('fashion');
    this.changed();
  }

  cycleHat(dir = 1) {
    const list = this.ownedHats();
    if (list.length < 2) { this.game.hud.toast('No hats yet! Earn Flop Points, find golden ducks and feats to unlock them.', ''); sfx.error(); return; }
    const i = list.findIndex((h) => h.id === this.hat);
    this.setHat(list[(i + dir + list.length) % list.length].id);
  }

  /** (Re)attach the current hat to the player's head. Call after anything that restyles the ragdoll. */
  applyHat() {
    const head = this.game.player.ragdoll.parts.head.mesh;
    if (this.hatGroup) { this.hatGroup.parent?.remove(this.hatGroup); this.hatGroup = null; this.hatAnim = null; }
    if (this.hat === 'none') return;
    const g = new THREE.Group();
    this.hatAnim = buildHat(this.hat, g);
    head.add(g);
    this.hatGroup = g;
  }

  // ---------------------------------------------------------------- events from the rest of the game
  event(type, data = {}) {
    const g = this.game, t = g.time;
    switch (type) {
      case 'knockout': {
        this.stats.kos++;
        this.koTimes.push(t);
        this.koTimes = this.koTimes.filter((k) => t - k < 3);
        const combo = this.koTimes.filter((k) => t - k < KO_COMBO_WINDOW).length;
        // knockouts landing within a blink of the first one count as the same hit (blasts, sweeps, car ploughs)
        if (t - this.hitGroup.start > ONE_HIT_WINDOW) this.hitGroup = { start: t, n: 0 };
        if (++this.hitGroup.n >= 5) this.award('fivehit');
        this.addPoints(POINTS.ko * Math.min(combo, 8), combo > 1 ? `BONK x${combo}` : 'BONK');
        if (combo >= 4) this.award('multi_ko');
        if (this.koTimes.length >= 8) this.award('domino');
        if (this.stats.kos >= 25) this.award('ko25');
        if (this.stats.kos >= 100) this.award('ko100');
        if (this.stats.kos >= 250) this.award('ko250');
        const n = data.npc;
        if (n?.isBaker) this.award('baker');
        if (n?.isShop) this.award('shopko');
        if (n?.isGiver) this.award('giverko');
        if (data.weapon === 'car' && ++this.driveKOs >= 3) this.award('hitrun');
        break;
      }
      case 'sever': if (++this.stats.limbs >= 10) this.award('limbs'); break;
      case 'said': if (++this.stats.said >= 30) this.award('chatter'); break;
      case 'form':
        if (!this.stats.forms.includes(data.id)) this.stats.forms.push(data.id);
        if (BASE_FORMS.every((f) => this.stats.forms.includes(f))) this.award('zoologist');
        break;
      case 'weapon': if (g.player.owned.size >= 10) this.award('armory'); break;
      case 'carEnter': this.driveKOs = 0; break;
      case 'carBoom': this.award('carboom'); break;
      case 'questDone':
        this.addPoints(POINTS.quest, 'QUEST');
        this.checkQuests();
        break;
      case 'spudImpact': {
        const p = g.player.ragdoll.getPos(this._v);
        if (Math.hypot(p.x - data.x, p.z - data.z) < 7) this.award('veg_victim');
        break;
      }
      default: break;
    }
    this.changed();
  }

  // ---------------------------------------------------------------- per fixed step
  step(dt) {
    const g = this.game, r = g.player.ragdoll, driving = g.driving.active;
    const p = r.getPos(this._v);
    const px = p.x, py = p.y, pz = p.z;

    // ducks: collect + quack when close
    let nearest = 1e9;
    for (const d of this.ducks) {
      if (this.ducksFound.has(d.i)) continue;
      const dist = Math.hypot(d.x - px, d.y - py, d.z - pz);
      if (dist < COLLECT_R) { this._collectDuck(d); continue; }
      nearest = Math.min(nearest, dist);
    }
    this.quackT -= dt;
    if (nearest < QUACK_R && this.quackT <= 0) { sfx.quack(0.25 + 0.75 * (1 - nearest / QUACK_R)); this.quackT = 1.6 + nearest * 0.12; }

    // landmarks
    for (const l of this.landmarkList) if (!this.landmarks.has(l.id) && Math.hypot(l.x - px, l.z - pz) < l.r) this._discover(l);

    // places
    if (Math.abs(px) > 106 || Math.abs(pz) > 106) this.award('harbour');
    const spud = g.spud.cur;
    const nearSpud = spud && Math.hypot(spud.body.translation().x - px, spud.body.translation().z - pz) < 4.5;
    if (!driving && r.mode === 'active' && r.grounded && py > 4.2 && !nearSpud) this.award('rooftop');
    if (nearSpud && spud.hit && py > 3.4 && r.mode !== 'limp') this.award('veg_rider');
    if (py > 16) this.award('sky_high');

    // airtime (ray to whatever is under us)
    const hit = driving ? null : g.physics.castRay(px, py, pz, 0, -1, 0, 60, groups(0xffff, G.WORLD | G.PROP));
    const airborne = !driving && (!hit || hit.toi > 1.7);
    if (airborne) { this.air += dt; if (this.air >= 3) this.award('airtime'); }
    else {
      if (this.air > 1.2) this.addPoints(Math.round(this.air * 15), `AIRTIME ${this.air.toFixed(1)}s`);
      this.air = 0;
    }

    // flops: from going limp until getting back up
    if (r.mode === 'limp') {
      if (!this.flop) { this.flop = { x: px, y: py, z: pz, startY: py, maxY: py, dist: 0 }; this.award('first_flop'); }
      const f = this.flop, seg = Math.hypot(px - f.x, py - f.y, pz - f.z);
      if (seg > 0.02) { f.dist += seg; f.x = px; f.y = py; f.z = pz; }
      f.maxY = Math.max(f.maxY, py);
    } else if (this.flop) {
      const f = this.flop; this.flop = null;
      if (f.dist >= FLOP_MIN) this.addPoints(Math.round(f.dist * 2 + Math.max(0, f.maxY - f.startY) * 3), `FLOP ${f.dist.toFixed(1)} m`);
      if (f.dist >= 15) this.award('long_flop');
      if (f.dist >= 40) this.award('epic_flop');
    }

    // spinning / speed
    this.spinT = g.player.spinning ? this.spinT + dt : 0;
    if (this.spinT >= 8) this.award('spin');
    if (driving && Math.abs(g.driving.vf) > 30.5) this.award('speed');

    // web swinging distance (one unbroken chain of swings, until your feet touch down)
    if (g.web?.active || (this.swing && !r.grounded && r.mode !== 'limp')) {
      if (!this.swing) this.swing = { x: px, z: pz, dist: 0 };
      const step = Math.hypot(px - this.swing.x, pz - this.swing.z);
      this.swing.dist += step; this.swing.x = px; this.swing.z = pz;
      if (this.swing.dist >= 100) this.award('webswing');
      // lifetime total toward the Grapple Hook (1000 m), with a progress note every 250 m
      if (step < 5 && !this.feats.has('web1000')) {   // (ignore teleport-sized jumps)
        const before = this.stats.webMeters || 0, after = before + step;
        this.stats.webMeters = after;
        if (Math.floor(after / 250) > Math.floor(before / 250) && after < 1000) g.hud.toast(`Web swinging: ${Math.floor(after / 250) * 250} / 1000 m toward the Grapple Hook`, '');
        if (after >= 1000) this.award('web1000');
      }
    } else this.swing = null;

    if (!this.introShown && g.time > 4) {
      this.introShown = true;
      g.hud.toast(`${this.duckTotal} golden ducks are hidden around town. Listen for quacking! (M = map, J = feats)`, 'unlock');
      this.changed();
    }
  }

  // ---------------------------------------------------------------- per render frame
  update(dt, t) {
    const cam = this.game.camera.position;
    for (const d of this.ducks) {
      if (this.ducksFound.has(d.i)) continue;
      const near = Math.abs(d.x - cam.x) < 110 && Math.abs(d.z - cam.z) < 110;
      d.mesh.visible = near;
      if (!near) continue;
      d.mesh.rotation.y = t * 1.3 + d.phase;
      d.mesh.position.y = d.y + Math.sin(t * 2.4 + d.phase) * 0.12;
    }
    if (this.hatGroup) {
      this.hatGroup.visible = this.game.cam.mode !== 'first';
      this.hatAnim?.(dt);
    }
    // popups drift up and fade
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i]; p.t += dt;
      p.el.style.transform = `translateY(${-p.t * 40}px)`;
      p.el.style.opacity = String(Math.max(0, 1 - Math.max(0, p.t - 0.9) / 0.6));
      if (p.t > 1.5) { p.el.remove(); this.popups.splice(i, 1); }
    }
  }

  // ---------------------------------------------------------------- HUD bits
  _buildHud() {
    const root = document.getElementById('hud');
    const box = document.createElement('div'); box.id = 'scoreBox'; root.appendChild(box);
    const banner = document.createElement('div'); banner.id = 'banner'; root.appendChild(banner);
    const pops = document.createElement('div'); pops.id = 'popups'; root.appendChild(pops);
    this.el = { box, banner, pops };
    this.popups = [];
    this.bannerQ = [];
    this.bannerBusy = false;
  }

  refreshHud() {
    const ri = this.rankIndex(), rank = RANKS[ri], next = RANKS[ri + 1];
    const frac = next ? (this.points - rank.pts) / (next.pts - rank.pts) : 1;
    this.el.box.innerHTML = `<div class="sb-top"><span class="sb-pts">★ ${this.points.toLocaleString()}</span><span class="sb-rank">${rank.name}</span></div>`
      + `<div class="sb-bar"><i style="width:${(frac * 100).toFixed(1)}%"></i></div>`
      + `<div class="sb-sub">${next ? `${(next.pts - this.points).toLocaleString()} to ${next.name}` : 'Max rank!'}</div>`
      + `<div class="sb-sub">🦆 ${this.ducksFound.size}/${this.duckTotal} &middot; 🏆 ${this.feats.size}/${FEATS.length} &middot; 🗺 ${this.landmarks.size}/${this.landmarkList.length}</div>`;
  }

  popup(text) {
    const el = document.createElement('div');
    el.className = 'popup'; el.textContent = text;
    this.el.pops.prepend(el);
    this.popups.push({ el, t: 0 });
  }

  banner(title, sub, kind) {
    this.bannerQ.push({ title, sub, kind });
    if (!this.bannerBusy) this._nextBanner();
  }

  _nextBanner() {
    const b = this.bannerQ.shift();
    if (!b) { this.bannerBusy = false; return; }
    this.bannerBusy = true;
    const el = this.el.banner;
    el.className = 'show ' + b.kind;
    el.innerHTML = `<div class="bn-title">${b.title}</div>${b.sub ? `<div class="bn-sub">${b.sub}</div>` : ''}`;
    setTimeout(() => { el.className = b.kind; }, 2300);
    setTimeout(() => this._nextBanner(), 2700);
  }

  changed() { this.refreshHud(); this.onChange?.(); }

  // ---------------------------------------------------------------- save / load
  serialize() {
    return {
      points: this.points, ducks: [...this.ducksFound], feats: [...this.feats], landmarks: [...this.landmarks],
      hats: [...this.hats], hat: this.hat, skins: [...this.skins], worn: [...this.hatsWorn], stats: this.stats, intro: this.introShown,
    };
  }

  load(d) {
    if (!d || typeof d !== 'object') return;
    this.points = Number(d.points) || 0;
    if (Array.isArray(d.ducks)) d.ducks.forEach((i) => { if (this.ducks[i]) { this.ducksFound.add(i); this.ducks[i].mesh.visible = false; } });
    if (Array.isArray(d.feats)) d.feats.forEach((f) => FEAT_BY_ID[f] && this.feats.add(f));
    if (Array.isArray(d.landmarks)) d.landmarks.forEach((l) => this.landmarks.add(l));
    if (Array.isArray(d.hats)) d.hats.forEach((h) => HAT_BY_ID[h] && this.hats.add(h));
    if (Array.isArray(d.worn)) d.worn.forEach((h) => HAT_BY_ID[h] && this.hatsWorn.add(h));
    if (d.stats && typeof d.stats === 'object') this.stats = { ...this.stats, ...d.stats, forms: Array.isArray(d.stats.forms) ? d.stats.forms : ['human'] };
    this.introShown = !!d.intro;
    if (Array.isArray(d.skins)) d.skins.forEach((s) => ANIMALS[s] && this.skins.add(s));
    if (this.feats.has('fivehit')) this.skins.add('spider');
    if (this.feats.has('web1000')) this.game.player.owned.add('grapple');
    if (this.feats.has('ko250') || this.stats.kos >= 250) { this.feats.add('ko250'); this.game.player.owned.add('lift'); }
    // re-derive unlocks so older saves (or rebalanced thresholds) stay consistent
    for (const r of RANKS) if (r.hat && this.points >= r.pts) this.hats.add(r.hat);
    for (const [n, h] of Object.entries(DUCK_HATS)) if (this.ducksFound.size >= Number(n)) this.hats.add(h);
    if (this.feats.has('tourist')) this.hats.add('halo');
    if (HAT_BY_ID[d.hat] && this.hats.has(d.hat)) this.hat = d.hat;
    this.applyHat();
    this.refreshHud();
  }
}
