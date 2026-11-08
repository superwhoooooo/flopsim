// NPC: ragdoll + a simple brain (wander / flee / follow / revenge / dance / laugh / wave) + memory of being hit.
import * as THREE from 'three';
import { Ragdoll } from '../ragdoll.js';
import { PERSONALITIES, OUCH, HIT_ACTION, decorateHead } from './personalities.js';
import { makeNameTag } from '../dialogue/speech.js';
import { sfx } from '../audio.js';

const tmpV = new THREE.Vector3();

export class NPC {
  constructor(game, def, x, z, yaw = 0) {
    this.game = game;
    this.def = def;
    this.id = def.id || 'npc';
    this.personality = PERSONALITIES.find((p) => p.id === def.personality) || PERSONALITIES[0];
    this.pIndex = PERSONALITIES.indexOf(this.personality);
    this.name = def.name || this.personality.name;
    this.isGiver = !!def.giver;
    this.isBaker = !!def.baker;
    const P = this.personality;
    // slight colour variation for the crowd
    const vary = (c) => { const k = new THREE.Color(c); const hsl = {}; k.getHSL(hsl); k.setHSL(hsl.h + (Math.random() - 0.5) * 0.04, hsl.s, Math.min(0.9, Math.max(0.15, hsl.l + (Math.random() - 0.5) * 0.12))); return k.getHex(); };
    this.ragdoll = new Ragdoll(game.physics, game.scene, {
      owner: this, skin: P.skin, shirt: def.special ? P.shirt : vary(P.shirt), pants: vary(P.pants),
      headShape: P.headShape, eyeColor: P.eyeColor,
      decorate: decorateHead(P.id, def.hat),
    });
    this.ragdoll.spawn(x, z, yaw);
    this.home = { x, z };
    this._pos = new THREE.Vector3();
    this.state = 'wander';
    this.stateTime = 0;
    this.target = null;
    this.idleTimer = Math.random() * 3;
    this.lastHit = -999;
    this.hitCount = 0;
    this.lastOuch = -999;
    this.shoveCooldown = 0;
    this.stuckTimer = 0;
    this.lastPos = { x, z };
    this.fleeFrom = null;
    this.speedMul = 0.85 + Math.random() * 0.3;
    this.tag = null;
    if (def.special) {
      this.tag = makeNameTag(this.ragdoll.anchor, this.name);
      this.tag.setMark('');
    }
    this.ragdoll.onKnockout = () => this._onKnockout();
    this.ragdoll.onGetUp = () => this._onGetUp();
  }

  get pos() { return this.ragdoll.getPos(this._pos); }
  recentlyHit() { return this.game.time - this.lastHit < 25; }
  knockedOut() { return this.ragdoll.isDown(); }

  say(text, dur = 2.6) {
    this.game.speech.say(this.ragdoll.anchor, text, dur, 'p-' + this.personality.id);
    sfx.blip(this.personality.voice);
  }

  setState(s, dur = 3, data = null) {
    this.state = s; this.stateTime = dur; this.stateData = data; this.stuckTimer = 0;
  }

  /** Called when the player (or anything) hits this NPC. */
  onHit(knockedOut, source) {
    this.lastHit = this.game.time;
    this.hitCount++;
    if (source === 'player') this.lastHitByPlayer = this.game.time;
    if (knockedOut) return; // _onKnockout handles the rest
    if (this.game.time - this.lastOuch > 1.2) {
      const pool = OUCH[this.pIndex];
      this.say(pool[Math.floor(Math.random() * pool.length)], 1.8);
      this.lastOuch = this.game.time;
    }
    this.react(HIT_ACTION[this.pIndex]);
    // nearby shy / dramatic folks get scared
    for (const o of this.game.npcs) {
      if (o === this || o.knockedOut()) continue;
      const d = o.pos.distanceTo(this.pos);
      if (d < 9 && (o.personality.id === 'shy' || o.personality.id === 'dramatic') && Math.random() < 0.8) o.react('flee');
    }
  }

  _onKnockout() {
    this.game.effects.word(this.pos.x, this.pos.y + 1.2, this.pos.z, 2);
    sfx.boing();
    if (this.lastHitByPlayer && this.game.time - this.lastHitByPlayer < 1.5) {
      this.game.quests.emit('knockout', { npc: this });
    }
    this.setState('wander', 0);
  }

  _onGetUp() {
    this.state = 'wander'; this.target = null; this.idleTimer = 1;
    if (this.recentlyHit() && Math.random() < 0.7) {
      const pool = OUCH[this.pIndex];
      this.say(pool[Math.floor(Math.random() * pool.length)], 2);
      const a = HIT_ACTION[this.pIndex];
      if (a === 'revenge' || a === 'flee') this.react(a);
    }
  }

  /** Apply an action word from the reactions table. */
  react(action, duration) {
    const r = this.ragdoll;
    switch (action) {
      case 'laugh': this.setState('laugh', duration || 2.6); break;
      case 'flee': this.setState('flee', duration || 5); break;
      case 'wave': this.setState('wave', duration || 2.6); break;
      case 'follow': this.setState('follow', duration || 9); break;
      case 'shove': case 'revenge': this.setState('revenge', duration || 6); break;
      case 'dance': this.setState('dance', duration || 4); break;
      case 'faint': r.knockout(3); break;
      default: this.setState('chat', duration || 2.5); break;
    }
  }

  _pickWanderTarget() {
    const w = this.game.world;
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2, rr = 3 + Math.random() * 11;
      const x = this.home.x + Math.cos(a) * rr, z = this.home.z + Math.sin(a) * rr;
      if (Math.abs(x) > 92 || Math.abs(z) > 92) continue;
      let bad = false;
      for (const h of w.houses) if (Math.abs(x - h.x) < h.w / 2 + 1.5 && Math.abs(z - h.z) < h.d / 2 + 1.5) { bad = true; break; }
      if (!bad) return { x, z };
    }
    return { x: this.home.x, z: this.home.z };
  }

  _moveToward(tx, tz, speed, dt, stopDist = 0.6) {
    const r = this.ragdoll;
    const p = this.pos;
    const dx = tx - p.x, dz = tz - p.z;
    const d = Math.hypot(dx, dz);
    if (d < stopDist) { r.desired.x = 0; r.desired.z = 0; return true; }
    r.desired.x = (dx / d) * speed; r.desired.z = (dz / d) * speed;
    r.targetYaw = Math.atan2(dx, dz);
    return false;
  }

  _faceToward(tx, tz) {
    const p = this.pos;
    this.ragdoll.targetYaw = Math.atan2(tx - p.x, tz - p.z);
  }

  /** Per-frame brain update (called from the fixed step loop). */
  brain(dt) {
    const r = this.ragdoll;
    this.shoveCooldown = Math.max(0, this.shoveCooldown - dt);
    r.desired.x = 0; r.desired.z = 0;
    r.pose = {};
    r.headLook = 0;
    if (r.mode === 'limp') return;
    const g = this.game;
    const player = g.player.ragdoll;
    const pp = player.getPos(tmpV);
    const p = this.pos;
    const t = g.time;
    const dPlayer = Math.hypot(pp.x - p.x, pp.z - p.z);

    this.stateTime -= dt;
    if (this.stateTime <= 0 && this.state !== 'wander') this.state = 'wander';

    switch (this.state) {
      case 'flee': {
        const dx = p.x - pp.x, dz = p.z - pp.z;
        const d = Math.hypot(dx, dz) || 1;
        // add some wobble so they zig-zag
        const ang = Math.atan2(dx, dz) + Math.sin(t * 2 + this.pIndex) * 0.5;
        r.desired.x = Math.sin(ang) * 4.6; r.desired.z = Math.cos(ang) * 4.6;
        r.targetYaw = ang;
        r.pose.armL = { swing: -2.6, side: 0.5 + Math.sin(t * 14) * 0.3 };
        r.pose.armR = { swing: -2.6, side: 0.5 + Math.cos(t * 14) * 0.3 };
        this._unstick(dt, 4.6);
        break;
      }
      case 'follow': {
        if (dPlayer > 2.4) this._moveToward(pp.x, pp.z, 2.8 * this.speedMul, dt);
        else this._faceToward(pp.x, pp.z);
        this._unstick(dt, 2.8);
        break;
      }
      case 'revenge': {
        if (dPlayer > 1.5) this._moveToward(pp.x, pp.z, 3.6, dt, 0.2);
        else {
          this._faceToward(pp.x, pp.z);
          if (this.shoveCooldown <= 0 && player.mode !== 'limp') this._shove(player, pp);
        }
        r.pose.armL = { swing: -1.3, side: 0.2 };
        r.pose.armR = { swing: -1.3, side: 0.2 };
        this._unstick(dt, 3.6);
        break;
      }
      case 'dance': {
        r.targetYaw += dt * 5;
        r.yaw = r.targetYaw;
        const s = Math.sin(t * 9);
        r.pose.armL = { swing: -2.8, side: 0.4 + s * 0.4, elbow: -0.3 };
        r.pose.armR = { swing: -2.8, side: 0.4 - s * 0.4, elbow: -0.3 };
        r.pose.sway = s * 0.12;
        r.pose.legL = s * 0.5; r.pose.legR = -s * 0.5;
        if (Math.sin(t * 9) > 0.95) r.hop(3.2);
        break;
      }
      case 'laugh': {
        this._faceToward(pp.x, pp.z);
        r.pose.headPitch = -0.35;
        r.pose.lean = -0.15 + Math.sin(t * 22) * 0.12;
        r.pose.armL = { swing: -0.9, side: 0.1, elbow: -1.5 };
        r.pose.armR = { swing: -0.9, side: 0.1, elbow: -1.5 };
        if (Math.sin(t * 11) > 0.97) r.hop(2.4);
        break;
      }
      case 'chat': {
        this._faceToward(pp.x, pp.z);
        break;
      }
      case 'wave': {
        this._faceToward(pp.x, pp.z);
        r.pose.armR = { swing: -2.9, side: 0.35 + Math.sin(t * 9) * 0.35, elbow: -0.15 };
        break;
      }
      default: { // wander
        if (this.def.noWander) { this._faceIdle(pp, dPlayer, dt); break; }
        if (this.target) {
          const arrived = this._moveToward(this.target.x, this.target.z, this.personality.walk * this.speedMul, dt);
          this._unstick(dt, this.personality.walk, true);
          if (arrived) { this.target = null; this.idleTimer = 1 + Math.random() * 4; }
        } else {
          this._faceIdle(pp, dPlayer, dt);
          this.idleTimer -= dt;
          if (this.idleTimer <= 0) this.target = this._pickWanderTarget();
        }
      }
    }
    // Look at the player when nearby and idle-ish
    if (dPlayer < 6 && (this.state === 'wander' && !this.target)) r.headLook = 0;
  }

  _faceIdle(pp, dPlayer, dt) {
    // chat-friendly: giver NPCs look at the player when near
    if (dPlayer < 7 && (this.isGiver || this.isBaker)) this._faceToward(pp.x, pp.z);
  }

  _unstick(dt, speed, clearTarget = false) {
    const p = this.pos;
    this.stuckTimer += dt;
    if (this.stuckTimer > 1.5) {
      const moved = Math.hypot(p.x - this.lastPos.x, p.z - this.lastPos.z);
      if (moved < speed * 0.25) {
        if (clearTarget) { this.target = null; this.idleTimer = 0.2; }
        else this.ragdoll.targetYaw += (Math.random() - 0.5) * 3;
        if (this.state === 'flee') this.ragdoll.hop(4.5);
      }
      this.lastPos.x = p.x; this.lastPos.z = p.z; this.stuckTimer = 0;
    }
  }

  _shove(player, pp) {
    this.shoveCooldown = 2.5;
    const p = this.pos;
    const dir = new THREE.Vector3(pp.x - p.x, 0, pp.z - p.z).normalize();
    dir.y = 0.25;
    this.ragdoll.pose.armR = { swing: -1.6, side: 0 };
    this.game.effects.bonk(pp.x, pp.y + 0.4, pp.z, 0.8);
    sfx.bonk(0.8);
    this.game.hitRagdoll(player, 'torso', dir, 6, 0.6, this);
    this.setState('wander', 0);
    this.target = null; this.idleTimer = 1.5;
  }

  update(dt) {
    this.ragdoll.update(dt);
  }

  updateTag() {
    if (!this.tag) return;
    const g = this.game;
    const q = g.quests.forGiver(this.id);
    let mark = '';
    if (q) {
      const s = g.quests.state[q.id].status;
      mark = s === 'available' ? '!' : s === 'ready' ? '?' : '';
    }
    this.tag.setMark(mark);
    const d = this.pos.distanceTo(g.player.ragdoll.getPos(tmpV));
    this.tag.obj.visible = d < 45;
  }
}
