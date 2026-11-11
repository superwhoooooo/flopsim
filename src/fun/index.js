// "Fun" add-ons, wired into the game through one object (game.fun):
//   moves (flop / grab / tricks / slow-mo), gear, chaos (chains / heat / set pieces), progress (area challenges,
//   home base, secrets, hidden room), multiplayer minigames, photo mode and instant replay.
import { Moves } from './moves.js';
import { Gear, GEAR, GEAR_IDS } from './gear.js';
import { Chaos } from './chaos.js';
import { Progress, AREAS, CHALLENGES, areaOf } from './progress.js';
import { Minigames } from './minigames.js';
import { Photo, Replay } from './photo.js';

export class Fun {
  constructor(game) {
    this.game = game;
    this.stats = { yeets: 0 };
    this.onChange = null;
    this.moves = new Moves(game, this);
    this.gear = new Gear(game, this);
    this.chaos = new Chaos(game, this);
    this.progress = new Progress(game, this);
    this.mg = new Minigames(game, this);
    this.photo = new Photo(game, this);
    this.replay = new Replay(game, this);
    // world bits (order matters: set pieces first, they pick free spots the rest avoid)
    this.chaos.buildPieces();
    this.progress.build();
    this.progress.placeSecrets();
    this.gear.placeChests(Gear.defaultSpots(game.world, this.progress.room));
    const magnet = this.gear.chests.find((c) => c.id === 'magnet');
    if (magnet) magnet.locked = () => !this.progress.room.wall.fallen;
    this._hookDiscovery();
  }

  /** Physics frozen (photo mode or a replay): the main loop skips simulation steps. */
  get frozen() { return this.photo.active || this.replay.active; }
  get timeScale() { return this.moves.timeScale; }
  speedMul() { return this.gear.speedMul; }
  jumpMul() { return this.gear.jumpMul; }

  _hookDiscovery() {
    const D = this.game.discovery;
    const award = D.award.bind(D);
    D.award = (id) => { const had = D.feats.has(id); award(id); if (!had && D.feats.has(id)) this.onAward(id); };
    const ev = D.event.bind(D);
    D.event = (type, data = {}) => {
      ev(type, data);
      if (type === 'carBoom') this.chaos.addHeat(20);
      if (type === 'sever') this.chaos.addHeat(2);
    };
    // flops measured by discovery count toward "tumble N m" challenges
    const step = D.step.bind(D);
    D.step = (dt) => {
      const f = D.flop;
      step(dt);
      if (f && !D.flop && f.dist >= 3) this.challengeEvent('flop', { m: f.dist });
    };
  }

  onAward(id) {
    const D = this.game.discovery;
    if (id === 'yeet10') D.unlockSkin('giraffe');
    if (id === 'combo6') D.unlockSkin('blob');
    if (id === 'combo3') this.gear.unlock('skates');
  }

  /** Something the player did, at the player's position (or x, z), for the area challenges. */
  challengeEvent(type, data = {}, x, z) {
    if (x === undefined) { const p = this.game.player.ragdoll.getPos(); x = data.x ?? p.x; z = data.z ?? p.z; }
    this.progress.event(type, data, x, z);
  }

  /** NPC knocked out by the player (called from npc.js). */
  onKnockout(npc) {
    this.moves.onKnockout(npc);
    this.chaos.onKnockout(npc);
    const p = npc.pos;
    this.challengeEvent('ko', {}, p.x, p.z);
  }

  /** Attack button / click. Returns true if an add-on used it (so no weapon swing). */
  attackPress() { return this.mg.attackPress() || this.moves.attackPress(); }

  /** Keys the add-ons handle. Returns true if used. */
  key(code, shift) {
    const g = this.game;
    if (this.photo.active) { this.photo.key(code); return true; }
    if (this.replay.active) { this.replay.key(code); return true; }
    switch (code) {
      case 'KeyP': this.photo.toggle(true); return true;
      case 'KeyO': this.replay.start(); return true;
      case 'KeyT': this.moves.toggleSlow(); return true;
      case 'KeyY': this.gear.cycle('back'); return true;
      case 'KeyU': this.gear.cycle('feet'); return true;
      default: return false;
    }
  }

  offerReplay() {
    const g = this.game;
    if (g.time - this.replay.offeredAt < 20) return;
    this.replay.offeredAt = g.time;
    g.timers.push({ t: 1.2, fn: () => g.hud.toast('That was something! Press O for an instant replay.', '') });
  }

  offerTip() {
    const g = this.game;
    if (this._tipped) return;
    this._tipped = true;
    g.timers.push({ t: 4, fn: () => g.hud.toast('Gear tip: swap gear in the journal (J > Gear), or with Y (back) and U (shoes).', '') });
  }

  changed() { this.onChange?.(); }

  // ---------------------------------------------------------------- per fixed step / render frame
  /** After player.brain (and web / grapple), before the attack check and physics. */
  preStep(dt) {
    this.moves.step(dt);
    this.gear.step(dt);
  }

  /** After physics. */
  postStep(dt) {
    this.chaos.step(dt);
    this.progress.step(dt);
    this.mg.step(dt);
    this.replay.record();
  }

  update(dt, t) {
    this.gear.update(t);
    this.progress.update(t);
    this.mg.sync(t);
  }

  // ---------------------------------------------------------------- UI hooks
  drawMap(x, X, Z, label, dot) {
    const P = this.progress;
    for (const a of AREAS) {
      const [done, n] = P.areaCount(a.id);
      label(`${a.name} ${done}/${n}`, X(a.x), Z(a.z) + 22, done === n ? '#8cff8c' : '#ffd6a0', 11);
    }
    if (P.home) { dot(X(P.home.x), Z(P.home.z), 6, '#ff9ad5', '#fff'); label('HOME', X(P.home.x), Z(P.home.z) - 12, '#ff9ad5', 11); }
    for (const c of this.gear.chests) if (this.gear.owned.has(c.id)) continue; // chests stay secret on the map
    const hill = this.mg.cur?.kind === 'hill' && this.mg.cur.hill;
    if (hill) { dot(X(hill[0]), Z(hill[1]), 10, 'rgba(255,225,74,.5)', '#ffe14a'); label('👑', X(hill[0]), Z(hill[1]), '#fff', 14); }
  }

  renderGear(el) {
    const G = this.gear;
    const card = (id) => {
      const it = GEAR[id], own = G.owned.has(id), on = G.back === id || G.feet === id;
      const chest = G.chests.find((c) => c.id === id);
      const how = own ? (on ? 'Wearing (click to take off)' : 'Click to wear') : id === 'skates' ? 'Earn the "Show-Off" feat (x3 trick combo)' : `Hidden in a chest: ${chest ? chest.where : 'somewhere'}`;
      return `<div class="jr-gear ${own ? 'own' : 'locked'} ${on ? 'on' : ''}" data-gear="${id}"><span class="gi">${own ? it.icon : '🔒'}</span><b>${it.name}</b><small>${own ? it.blurb : ''}</small><em>${how}</em></div>`;
    };
    el.innerHTML = `<p class="jr-help">Back gear: hold <b>C</b> to use it (Y swaps). Shoes are always on (U swaps). ${G.owned.size}/${GEAR_IDS.length} found.</p>`
      + `<h3>Back</h3><div class="jr-gears">${GEAR_IDS.filter((i) => GEAR[i].slot === 'back').map(card).join('')}</div>`
      + `<h3>Feet</h3><div class="jr-gears">${GEAR_IDS.filter((i) => GEAR[i].slot === 'feet').map(card).join('')}</div>`;
    el.querySelectorAll('.jr-gear.own').forEach((d) => d.addEventListener('click', () => {
      const id = d.dataset.gear, slot = GEAR[id].slot;
      if ((slot === 'back' ? G.back : G.feet) === id) G.unequip(slot); else G.equip(id);
    }));
  }

  renderChallenges(el) {
    const P = this.progress;
    el.innerHTML = `<p class="jr-help">Every part of town has its own challenges. ${P.areasDone.size}/${AREAS.length} areas complete &middot; secrets found: ${P.secrets.size}/${P.secretList.length}.</p><div class="jr-areas">`
      + AREAS.map((a) => {
        const [done, n] = P.areaCount(a.id);
        return `<div class="jr-area ${done === n ? 'done' : ''}"><h3>${a.name} <small>${done}/${n}</small></h3>`
          + CHALLENGES.filter((c) => c.area === a.id).map((c) => {
            const k = Math.min(c.goal, P.prog[c.id] || 0), ok = k >= c.goal;
            return `<div class="jr-ch ${ok ? 'done' : ''}">${ok ? '✅' : '⬜'} ${c.text}${c.goal > 1 ? ` <span>${k}/${c.goal}</span>` : ''}</div>`;
          }).join('') + '</div>';
      }).join('') + '</div>';
  }

  // ---------------------------------------------------------------- save
  serialize() { return { stats: this.stats, gear: this.gear.serialize(), progress: this.progress.serialize() }; }
  load(d) {
    const D = this.game.discovery;
    if (D.feats.has('yeet10')) D.skins.add('giraffe');
    if (D.feats.has('combo6')) D.skins.add('blob');
    if (D.feats.has('combo3')) this.gear.owned.add('skates');
    if (!d || typeof d !== 'object') { this.gear.load({ owned: [...this.gear.owned] }); this.progress.backfill(); return; }
    if (d.stats && typeof d.stats === 'object') this.stats = { ...this.stats, ...d.stats };
    this.gear.load({ ...(d.gear || {}), owned: [...(d.gear?.owned || []), ...this.gear.owned] });
    this.progress.load(d.progress);
    this.progress.backfill();
  }
}

export { areaOf };
