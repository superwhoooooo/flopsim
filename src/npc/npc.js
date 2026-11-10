// NPC: ragdoll + a simple brain (wander / flee / follow / revenge / dance / laugh / wave) + memory of being hit.
import * as THREE from 'three';
import { Ragdoll } from '../ragdoll.js';
import { PERSONALITIES, OUCH, HIT_ACTION, LIMB_LINES, decorateHead } from './personalities.js';
import { makeNameTag } from '../dialogue/speech.js';
import { sfx } from '../audio.js';
import { createWeaponMesh } from '../weapons/weapons.js';
import { ragdollOptsFor } from '../animals.js';

const tmpV = new THREE.Vector3();

// Bumping: an NPC that runs into the player bonks them. Stun of 1 = knocked down.
const BUMP_DIST = 0.9;          // m between pelvises that counts as touching
const BUMP_MIN_SPEED = 3.0;     // m/s the NPC must be moving toward the player (walkers and joggers don't count)
const BUMP_STUN_PER_MS = 0.2;   // stun per m/s of that speed (revenge charge ~3.6 m/s -> ~0.7: takes two bumps)
const BUMP_COOLDOWN = 1.2;      // s before the same NPC can bump you again
const SHOVE_STUN = 0.6;         // revenge shove: two shoves to knock you down

// Axe revenge: when the player hits an NPC, sometimes they pull out an axe, chase you and bonk you in one swing.
const AXE_CHANCE = 0.25;        // per hit from the player
const AXE_COOLDOWN = 20;        // s after an axe attack ends before anyone can pull out another; only one axe out at a time
const AXE_CHASE_SPEED = 4.8;    // m/s (you walk at 3.4 and sprint at 6, so sprinting gets you away)
const AXE_CHASE_TIME = 8;       // s they chase before giving up
const AXE_REACH = 1.7;          // m: start swinging when this close
const AXE_WINDUP = 0.3, AXE_STRIKE = 0.15, AXE_RECOVER = 0.35;
const AXE_LINES = [             // indexed like PERSONALITIES
  ["That's IT!", 'You want trouble? Here it is!'],
  ['Wanna see my axe? Hee hee!', 'Bonk time!'],
  ["I... I've had ENOUGH!", 'Leave. Me. ALONE!'],
  ['You have made a GRAVE mistake!', 'Prepare for the FINALE!'],
  ['Taste me axe, ye bilge rat!', 'Arr! Now ye be in fer it!'],
  ['AXE PROTOCOL ENGAGED.', 'RETALIATION MODE: ON.'],
];

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
    this.isShop = !!def.shop;
    this.fragile = !!def.fragile;     // limbs can pop off
    this.limbTimer = 0;
    this.dormant = false;
    const P = this.personality;
    // slight colour variation for the crowd
    const vary = (c) => { const k = new THREE.Color(c); const hsl = {}; k.getHSL(hsl); k.setHSL(hsl.h + (Math.random() - 0.5) * 0.04, hsl.s, Math.min(0.9, Math.max(0.15, hsl.l + (Math.random() - 0.5) * 0.12))); return k.getHex(); };
    this.ragdoll = new Ragdoll(game.physics, game.scene, {
      owner: this, skin: P.skin, shirt: def.special ? P.shirt : vary(P.shirt), pants: vary(P.pants),
      headShape: P.headShape, eyeColor: P.eyeColor,
      decorate: decorateHead(P.id, def.hat),
      ...(def.animal ? { ...ragdollOptsFor(def.animal), headShape: undefined, eyeColor: undefined } : {}),
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
    this.bumpCooldown = 0;
    this.axeMesh = null;         // created the first time this NPC pulls out an axe
    this.axeSwing = null;        // { t, hitDone } while swinging
    this.axePending = false;     // rolled the axe while knocked out: pull it out on getting up
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
    this.ragdoll.onSever = (r, limb) => this._onSever(limb);
  }

  _onSever(limb) {
    const g = this.game, r = this.ragdoll;
    const part = limb.startsWith('arm') ? 'uArm' + limb.slice(3) : 'uLeg' + limb.slice(3);
    const p = r.getPartPos(part);
    g.effects.bonk(p.x, p.y, p.z, 1.6, false);
    g.effects.bonk(p.x, p.y + 0.1, p.z, 1.2, false);
    sfx.boing();
    this.limbTimer = 0;
    if (r.mode === 'limp') return;
    const pool = LIMB_LINES[this.pIndex];
    this.say(pool[Math.floor(Math.random() * pool.length)], 2.4);
    this.react(this.personality.id === 'robot' ? 'dance' : this.personality.id === 'cheerful' ? 'laugh' : HIT_ACTION[this.pIndex] === 'revenge' ? 'revenge' : 'flee');
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
    const rollAxe = source === 'player' && this.state !== 'axe' && Math.random() < AXE_CHANCE;
    if (knockedOut) { if (rollAxe) this.axePending = true; return; } // _onKnockout handles the rest
    if (rollAxe && this._drawAxe()) return;
    if (this.state === 'axe') return;   // already coming for you; don't get distracted
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
      this.game.quests.emit('knockout', { npc: this, personality: this.personality.id, spinning: !!this.game.player.spinning, weapon: this.lastHitWeapon });
      this.game.discovery?.event('knockout', { npc: this, weapon: this.lastHitWeapon });
    }
    this.setState('wander', 0);
  }

  _onGetUp() {
    this.state = 'wander'; this.target = null; this.idleTimer = 1;
    if (this.axePending) { this.axePending = false; if (this._drawAxe()) return; }
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
    this.bumpCooldown = Math.max(0, this.bumpCooldown - dt);
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
    if (this.axeMesh) {
      const out = this.state === 'axe';
      if (this.axeMesh.visible && !out) {   // attack over
        g.axeCooldownUntil = Math.min(g.axeCooldownUntil || 0, g.time + AXE_COOLDOWN);
        if (!this.axeLanded) g.quests.emit('axeEscape');   // you got away (Escape Artist)
      }
      this.axeMesh.visible = out;
    }
    if (dPlayer < BUMP_DIST) this._bump(player, pp, dPlayer);

    switch (this.state) {
      case 'axe': this._axeBrain(dt, player, pp, dPlayer); break;
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
          if (this.shoveCooldown <= 0 && player.mode !== 'limp' && !g.driving.active) this._shove(player, pp);
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
        if (this.def.noWander) {
          const hd = Math.hypot(this.home.x - p.x, this.home.z - p.z);
          if (hd > 1.0) { this._moveToward(this.home.x, this.home.z, 2.2, dt, 0.4); this._unstick(dt, 2.2); }
          else { this._faceIdle(pp, dPlayer, dt); if (this.isShop && this.shopYaw !== undefined && dPlayer > 7) r.targetYaw = this.shopYaw; }
          break;
        }
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
    if (dPlayer < 7 && (this.isGiver || this.isBaker || this.isShop)) this._faceToward(pp.x, pp.z);
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

  /** Running into the player: bonk them, harder the faster we were going at them. */
  _bump(player, pp, d) {
    const g = this.game;
    if (this.bumpCooldown > 0 || player.mode === 'limp' || g.driving.active) return;
    const p = this.pos;
    const nx = (pp.x - p.x) / (d || 1), nz = (pp.z - p.z) / (d || 1);
    // only our own speed toward them counts, so the player sprinting into a standing NPC doesn't get bonked
    const v = this.ragdoll.parts.pelvis.body.linvel();
    const toward = v.x * nx + v.z * nz;
    if (toward < BUMP_MIN_SPEED) return;
    this.bumpCooldown = BUMP_COOLDOWN;
    const dir = new THREE.Vector3(nx, 0.25, nz).normalize();
    g.effects.bonk(pp.x, pp.y + 0.4, pp.z, 0.6);
    sfx.bonk(0.6);
    g.hitRagdoll(player, 'torso', dir, 3 + toward, toward * BUMP_STUN_PER_MS, this);
  }

  /** Pull out an axe and come after the player. Returns false if someone else has one out, or one was used recently. */
  _drawAxe() {
    const g = this.game;
    if (g.time < (g.axeCooldownUntil || 0) || g.npcs.some((n) => n !== this && n.state === 'axe')) return false;
    g.axeCooldownUntil = g.time + AXE_CHASE_TIME + AXE_COOLDOWN;   // shortened to AXE_COOLDOWN once this attack ends
    if (!this.axeMesh) {
      this.axeMesh = createWeaponMesh('axe');
      this.axeMesh.position.set(0, -0.16, 0);   // same grip offset as the player's weapons
      this.ragdoll.parts.lArmR.mesh.add(this.axeMesh);
    }
    this.axeMesh.visible = true;
    this.axeSwing = null;
    this.axeLanded = false;
    const pool = AXE_LINES[this.pIndex];
    this.say(pool[Math.floor(Math.random() * pool.length)], 2.4);
    sfx.equip();
    this.setState('axe', AXE_CHASE_TIME);
    return true;
  }

  /** Axe state: chase, then wind up and swing. One clean hit knocks the player out. */
  _axeBrain(dt, player, pp, dPlayer) {
    const g = this.game;
    const r = this.ragdoll;
    // right-arm keyframes [swing, elbow], same idea as the player's swing
    let sw = -0.6, el = -2.0;
    if (!this.axeSwing) {
      if (dPlayer > AXE_REACH) this._moveToward(pp.x, pp.z, AXE_CHASE_SPEED, dt, 0.2);
      else this._faceToward(pp.x, pp.z);
      if (dPlayer <= AXE_REACH && player.mode !== 'limp') { this.axeSwing = { t: 0, hitDone: false }; sfx.swing(true); }
      this._unstick(dt, AXE_CHASE_SPEED);
    } else {
      const a = this.axeSwing;
      a.t += dt;
      this._faceToward(pp.x, pp.z);
      const ease = (t) => t * t * (3 - 2 * t);
      if (a.t < AXE_WINDUP) {
        const k = ease(a.t / AXE_WINDUP); sw = -0.6 - 2.3 * k; el = -2.0 + 1.85 * k;
        r.pose.lean = -0.15;
      } else if (a.t < AXE_WINDUP + AXE_STRIKE) {
        const k = ease((a.t - AXE_WINDUP) / AXE_STRIKE); sw = -2.9 + 2.4 * k; el = -0.15 + 0.05 * k;
        r.pose.lean = 0.35;
        if (!a.hitDone && k > 0.45) {
          a.hitDone = true;
          if (dPlayer < AXE_REACH + 0.6 && player.mode !== 'limp' && !g.driving.active) {
            const p = this.pos;
            const dir = new THREE.Vector3(pp.x - p.x, 0, pp.z - p.z).normalize();
            dir.y = 0.3; dir.normalize();
            g.effects.bonk(pp.x, pp.y + 0.5, pp.z, 2);
            sfx.bonk(1.4);
            g.cam.shake = Math.max(g.cam.shake, 0.9);
            g.hitRagdoll(player, 'head', dir, 11, 3, this, 'axe');   // stun 3: always a knockout
            this.stateTime = AXE_RECOVER + 0.4;                      // got you: put the axe away soon
            this.axeLanded = true;
          }
        }
      } else if (a.t < AXE_WINDUP + AXE_STRIKE + AXE_RECOVER) {
        const k = ease((a.t - AXE_WINDUP - AXE_STRIKE) / AXE_RECOVER); sw = -0.5 - 0.1 * k; el = -0.1 - 1.9 * k;
      } else this.axeSwing = null;   // missed: chase and try again
    }
    r.pose.armR = { swing: sw, elbow: el, side: 0.04, gain: 3.2 };
  }

  _shove(player, pp) {
    this.shoveCooldown = 2.5;
    const p = this.pos;
    const dir = new THREE.Vector3(pp.x - p.x, 0, pp.z - p.z).normalize();
    dir.y = 0.25;
    this.ragdoll.pose.armR = { swing: -1.6, side: 0 };
    this.game.effects.bonk(pp.x, pp.y + 0.4, pp.z, 0.8);
    sfx.bonk(0.8);
    this.game.hitRagdoll(player, 'torso', dir, 6, SHOVE_STUN, this);
    this.setState('wander', 0);
    this.target = null; this.idleTimer = 1.5;
  }

  /** Far-away NPCs freeze (physics off, no AI) until the player comes near again. */
  setDormant(v) {
    if (v === this.dormant) return;
    this.dormant = v;
    this.ragdoll.setPhysicsEnabled(!v);
    if (v) this.ragdoll.sync();
    else this.idleTimer = Math.random() * 2;
  }

  update(dt) {
    this.ragdoll.update(dt);
    if (this.ragdoll.severed.size) {       // limbs pop back on after a while (sooner if the player isn't watching)
      this.limbTimer += dt;
      const far = this.pos.distanceTo(this.game.player.ragdoll.getPos(tmpV)) > 22;
      if (this.limbTimer > (far ? 25 : 120)) { this.ragdoll.regrow(); this.limbTimer = 0; }
    }
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
