// Chaos: chain reactions, the wanted (heat) meter + angry mob, and big destructible set pieces.
//  - Chain reactions: anything YOU sent flying (people you bonked or threw, props you threw / blew / blasted)
//    bonks the people it crashes into, and they become missiles too. 2+ knockouts in a chain score a bonus.
//  - Heat: causing trouble fills a 3-star meter. 1 star: shops lock their doors and people get nervous.
//    2 stars: tough folks come for you. 3 stars: an ANGRY MOB. Stay out of sight and it cools down.
//  - Set pieces: a water tower, a giant billboard and a giant donut sign. Hit them hard enough (weapons, cars,
//    explosions, flying stuff) and they come crashing down, then get rebuilt a couple of minutes later.
import * as THREE from 'three';
import { RAPIER, G, groups } from '../physics.js';
import { getMat } from '../ragdoll.js';
import { ROADS, ROAD_W } from '../world/world.js';
import { sfx } from '../audio.js';

const MISSILE_SPEED = 6.5;     // m/s: faster than this and it bonks people it touches
const TAINT_TIME = 4;          // s a thrown / blasted thing stays "yours"
const CHAIN_WINDOW = 3;        // s with no chain knockout ends the chain
const STARS = [25, 50, 80];
const MOB_LINES = ['THERE they are!', 'Get them!', 'You owe me a hat!', 'Nobody flops on MY street!', 'Stop right there!', 'Grab the troublemaker!'];

const _a = new THREE.Vector3(), _b = new THREE.Vector3();

function textTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/** A structure made of blocks that stay fixed until it takes enough damage, then topples as physics debris. */
class SetPiece {
  constructor(game, def) {
    this.game = game; this.def = def;
    this.id = def.id; this.name = def.name; this.x = def.x; this.z = def.z;
    this.hp = def.hp; this.fallen = false; this.rebuildT = 0;
    this.blocks = [];
    this.hitCool = new Map();
    const q0 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), def.ry || 0);
    let top = 0;
    for (const b of def.blocks) {
      const off = new THREE.Vector3(...b.pos).applyQuaternion(q0);
      const pos = new THREE.Vector3(def.x + off.x, off.y, def.z + off.z);
      const quat = q0.clone();
      if (b.rot) quat.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...b.rot)));
      let geo, col;
      if (b.shape === 'cyl') { geo = new THREE.CylinderGeometry(b.r, b.r, b.h, 20); col = RAPIER.ColliderDesc.cylinder(b.h / 2, b.r); }
      else if (b.shape === 'torus') { geo = new THREE.TorusGeometry(b.R, b.r, 12, 28); col = RAPIER.ColliderDesc.cylinder(b.r, b.R + b.r).setRotation({ x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 }); }
      else if (b.shape === 'cone') { geo = new THREE.ConeGeometry(b.r, b.h, 20); col = RAPIER.ColliderDesc.cone(b.h / 2, b.r); }
      else { geo = new THREE.BoxGeometry(...b.size); col = RAPIER.ColliderDesc.cuboid(b.size[0] / 2, b.size[1] / 2, b.size[2] / 2); }
      const mesh = new THREE.Mesh(geo, b.mat || getMat(b.color, b.opts || {}));
      mesh.castShadow = true; mesh.receiveShadow = true;
      if (b.extra) b.extra(mesh);
      game.scene.add(mesh);
      const body = game.physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(pos.x, pos.y, pos.z)
        .setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w }).setLinearDamping(0.2).setAngularDamping(0.4));
      const collider = game.physics.world.createCollider(col.setMass(b.mass).setFriction(0.8).setRestitution(0.1)
        .setCollisionGroups(groups(G.WORLD, 0xffff)), body);
      game.physics.registerCollider(collider, { type: 'setpiece', sp: this });
      mesh.position.copy(pos); mesh.quaternion.copy(quat);
      const blk = { mesh, body, collider, pos, quat, prop: null };
      this.blocks.push(blk);
      top = Math.max(top, pos.y + (b.h || b.size?.[1] || b.R * 2 || 1) / 2);
    }
    this.top = top;
    this.radius = def.radius;
    this.cy = top / 2;
  }

  dist(p) { return Math.max(0, Math.hypot(p.x - this.x, p.z - this.z) - this.radius); }

  damage(n, label) {
    if (this.fallen || n <= 0) return;
    this.hp -= n;
    const g = this.game;
    sfx.bonk(Math.min(1.2, n / 20));
    if (!this._warned && this.hp < this.def.hp * 0.5) { this._warned = true; g.hud.toast(`The ${this.name} creaks and wobbles...`, ''); }
    if (this.hp <= 0) this.collapse(label);
  }

  collapse() {
    const g = this.game;
    this.fallen = true; this._warned = false;
    this.rebuildT = this.def.respawn ?? 150;
    for (const blk of this.blocks) {
      const b = blk.body;
      b.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      blk.collider.setCollisionGroups(groups(G.PROP, 0xffff));
      g.physics.unregisterCollider(blk.collider);
      const prop = { kind: 'debris', mesh: blk.mesh, body: b, collider: blk.collider, home: { x: this.x, z: this.z }, wheels: null, spin: 0, steer: 0, baseDamping: 0.2, taintT: g.time };
      g.physics.registerCollider(blk.collider, { type: 'prop', prop });
      g.world.props.push(prop);
      blk.prop = prop;
      const t = b.translation(), m = b.mass();
      const out = _a.set(t.x - this.x, 0, t.z - this.z);
      if (out.lengthSq() < 0.01) out.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      out.normalize();
      const k = m * (1.5 + t.y * 0.25);
      b.applyImpulse({ x: out.x * k + (this.lean?.x || 0) * m * 3, y: m * 0.5, z: out.z * k + (this.lean?.z || 0) * m * 3 }, true);
      b.applyTorqueImpulse({ x: (Math.random() - 0.5) * m * 4, y: (Math.random() - 0.5) * m * 2, z: (Math.random() - 0.5) * m * 4 }, true);
    }
    g.cam.shake = Math.max(g.cam.shake, 1.2);
    sfx.explosion(0.8); sfx.thump();
    g.effects.bonk(this.x, 1, this.z, 3, false);
    this.def.onCollapse?.();
  }

  rebuild() {
    const g = this.game;
    this.fallen = false; this.hp = this.def.hp;
    for (const blk of this.blocks) {
      if (blk.prop) { const i = g.world.props.indexOf(blk.prop); if (i >= 0) g.world.props.splice(i, 1); blk.prop = null; }
      g.physics.unregisterCollider(blk.collider);
      g.physics.registerCollider(blk.collider, { type: 'setpiece', sp: this });
      blk.collider.setCollisionGroups(groups(G.WORLD, 0xffff));
      const b = blk.body;
      b.setLinvel({ x: 0, y: 0, z: 0 }, false); b.setAngvel({ x: 0, y: 0, z: 0 }, false);
      b.setBodyType(RAPIER.RigidBodyType.Fixed, false);
      b.setTranslation(blk.pos, false);
      b.setRotation({ x: blk.quat.x, y: blk.quat.y, z: blk.quat.z, w: blk.quat.w }, false);
      blk.mesh.position.copy(blk.pos); blk.mesh.quaternion.copy(blk.quat);
    }
  }
}

export class Chaos {
  constructor(game, fun) {
    this.game = game; this.fun = fun;
    this.heat = 0; this.calmT = 0; this.peakStars = 0;
    this.chain = null;         // { n, t, x, z }
    this.tick = 0;
    this.pieces = [];
    this.reserved = [{ x: 0, z: 0, r: 12 }, { x: 0, z: -7, r: 4 }];   // the plaza and the spawn point stay clear
    this._buildHud();
    this._wrapExplode();
  }

  // ---------------------------------------------------------------- set pieces
  /** Find a free spot near (ax, az): not inside a building, off the roads, away from trees and lamp posts. */
  findSpot(ax, az, r) {
    const w = this.game.world;
    const onRoad = (v) => ROADS.some((rr) => Math.abs(v - rr) < ROAD_W / 2 + r);
    for (let ring = 0; ring < 30; ring++) {
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2 + ring * 0.7, d = ring * 1.5;
        const x = ax + Math.cos(a) * d, z = az + Math.sin(a) * d;
        if (Math.abs(x) > 100 - r || Math.abs(z) > 100 - r) continue;
        if (onRoad(x) || onRoad(z) || w._blocked(x, z, r)) continue;
        if ((w.breakables || []).some((b) => Math.hypot(b.x - x, b.z - z) < r + 1)) continue;
        if (this.pieces.some((p) => Math.hypot(p.x - x, p.z - z) < p.radius + r + 2)) continue;
        if (this.reserved.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + r)) continue;
        this.reserved.push({ x, z, r });
        return [x, z];
      }
    }
    return [ax, az];
  }

  buildPieces() {
    const g = this.game, D = g.discovery;
    const add = (def) => {
      const sp = new SetPiece(g, def); this.pieces.push(sp);
      if (def.landmark) D.landmarkList.push({ id: 'sp_' + def.id, name: def.name, x: sp.x, z: sp.z, r: def.radius + 6 });
      return sp;
    };
    // water tower: Pigeon Park (north)
    {
      const [x, z] = this.findSpot(30, -60, 3.2);
      const legMat = getMat(0x7a3b2a, { roughness: 0.8 });
      const tankTex = textTex(512, 128, (c, w, h) => { c.fillStyle = '#a9c4d6'; c.fillRect(0, 0, w, h); c.fillStyle = '#3a5a78'; c.font = '900 64px Trebuchet MS, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('FLOP CITY', w / 2, h / 2 + 4); });
      const blocks = [];
      for (const [lx, lz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) blocks.push({ size: [0.3, 6, 0.3], pos: [lx, 3, lz], mat: legMat, mass: 80 });
      blocks.push({ size: [4.2, 0.3, 4.2], pos: [0, 6.15, 0], mat: legMat, mass: 150 });
      blocks.push({ shape: 'cyl', r: 2, h: 3.2, pos: [0, 7.9, 0], mat: new THREE.MeshStandardMaterial({ map: tankTex, roughness: 0.6, metalness: 0.2 }), mass: 400 });
      blocks.push({ shape: 'cone', r: 2.2, h: 1.1, pos: [0, 10.05, 0], color: 0x5f7f99, mass: 60 });
      add({ id: 'tower', name: 'Water Tower', feat: 'topple_tower', x, z, radius: 2.4, hp: 140, blocks, landmark: true });
    }
    // billboard: Sunny Gardens, east side
    {
      const [x, z] = this.findSpot(67, 54, 4.6);
      const ad = textTex(1024, 448, (c, w, h) => {
        const gr = c.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#ffcf3a'); gr.addColorStop(1, '#ff7a3a');
        c.fillStyle = gr; c.fillRect(0, 0, w, h);
        c.fillStyle = '#2a1a0a'; c.textAlign = 'center'; c.font = '900 120px Trebuchet MS, sans-serif'; c.fillText("BRUNO'S BREAD", w / 2, 170);
        c.font = '700 64px Trebuchet MS, sans-serif'; c.fillText("It's bread. What did you expect?", w / 2, 290);
        c.font = '700 44px Trebuchet MS, sans-serif'; c.fillText('Now 10% less crumbly', w / 2, 380);
      });
      const post = getMat(0x5a5f66, { metalness: 0.6, roughness: 0.4 });
      add({ id: 'board', name: 'Giant Billboard', feat: 'topple_board', x, z, ry: -Math.PI / 2, radius: 4, hp: 120, landmark: true, blocks: [
        { size: [0.35, 7, 0.35], pos: [-2.8, 3.5, 0], mat: post, mass: 90 },
        { size: [0.35, 7, 0.35], pos: [2.8, 3.5, 0], mat: post, mass: 90 },
        { size: [8, 3.6, 0.25], pos: [0, 8.2, 0], mat: [getMat(0xd8d8d8), getMat(0xd8d8d8), getMat(0xd8d8d8), getMat(0xd8d8d8), new THREE.MeshStandardMaterial({ map: ad, roughness: 0.7 }), getMat(0x9a9a9a)], mass: 260 },
      ] });
    }
    // giant donut sign: next to the bakery (wherever the bakery ended up)
    {
      const bk = g.world.bakery || { x: -20, z: 20 };
      const [x, z] = this.findSpot(bk.x + 7, bk.z + 4, 2.6);
      add({ id: 'donut', name: 'Giant Donut', feat: 'topple_donut', x, z, radius: 2.2, hp: 90, landmark: true, blocks: [
        { shape: 'cyl', r: 0.18, h: 5.5, pos: [0, 2.75, 0], color: 0x8a8f96, opts: { metalness: 0.6, roughness: 0.4 }, mass: 70 },
        { shape: 'torus', R: 1.5, r: 0.65, pos: [0, 7.5, 0], color: 0xd9a066, mass: 160,
          extra: (m) => { const icing = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.67, 12, 28, Math.PI * 2), getMat(0xff7fbf, { roughness: 0.35 })); icing.scale.set(1, 1, 0.55); icing.position.z = 0.18; m.add(icing);
            for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2, rr = 1.5 + (Math.random() - 0.5) * 0.8; const sp = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.06), getMat([0xffffff, 0x4dabff, 0xffd84d, 0x7cff6b][i % 4])); sp.position.set(Math.cos(a) * rr, Math.sin(a) * rr, 0.55); sp.rotation.z = Math.random() * 3; m.add(sp); } } },
      ] });
    }
    for (const sp of this.pieces) sp.def.onCollapse = () => this._toppled(sp);
  }

  /** The hidden room's cracked wall: a tiny set piece that breaks easily. */
  buildSecretWall(room) {
    const tex = textTex(256, 256, (c, w, h) => {
      c.fillStyle = '#b5a48a'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#7d6e58'; c.lineWidth = 3;
      for (let y = 0; y < h; y += 32) for (let x = (y / 32) % 2 ? 0 : 32; x < w; x += 64) c.strokeRect(x, y, 64, 32);
      c.strokeStyle = '#2a2018'; c.lineWidth = 5; c.beginPath();
      c.moveTo(128, 40); c.lineTo(110, 100); c.lineTo(150, 140); c.lineTo(120, 210); c.moveTo(110, 100); c.lineTo(60, 120); c.moveTo(150, 140); c.lineTo(200, 160); c.stroke();
    });
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
    const sp = new SetPiece(this.game, { id: 'secretwall', name: 'cracked wall', x: room.wx, z: room.wz, ry: room.ry, radius: 1.4, hp: 18, respawn: 9999, blocks: [
      { size: [1.4, 2.4, 0.2], pos: [-0.7, 1.2, 0], mat, mass: 40 },
      { size: [1.4, 2.4, 0.2], pos: [0.7, 1.2, 0], mat, mass: 40 },
    ] });
    sp.def.onCollapse = () => { this.game.hud.toast('The cracked wall caved in! Something is inside...', 'unlock'); };
    this.pieces.push(sp);
    return sp;
  }

  _toppled(sp) {
    const g = this.game, D = g.discovery;
    D.banner('TOPPLED!', sp.name, 'rank');
    D.addPoints(200, 'TOPPLED');
    if (sp.def.feat) D.award(sp.def.feat);
    this.addHeat(30);
    this.fun.challengeEvent('topple', { id: sp.id, x: sp.x, z: sp.z });
    this.fun.moves.trick('TIMBER!', 100);
    this.fun.offerReplay();
  }

  _wrapExplode() {
    const combat = this.game.combat, orig = combat.explode.bind(combat);
    combat.explode = (at, radius, power, source, weaponId) => {
      orig(at, radius, power, source, weaponId);
      const g = this.game;
      if (source !== g.player) return;
      g.physics.overlapSphere(at.x, at.y, at.z, radius, (col) => { const o = g.physics.ownerOf(col); if (o?.type === 'prop') o.prop.taintT = g.time; });
      for (const sp of this.pieces) if (sp.dist(at) < radius) sp.damage(power * 4 * (1 - sp.dist(at) / radius) + 10);
      this.addHeat(6);
    };
  }

  // ---------------------------------------------------------------- heat
  get stars() { let s = 0; while (s < 3 && this.heat >= STARS[s]) s++; return s; }
  shopsClosed() { return this.stars >= 1; }

  addHeat(n) {
    const before = this.stars;
    this.heat = Math.min(100, this.heat + n);
    this.calmT = 0;
    const s = this.stars;
    if (s > before) {
      const g = this.game;
      if (s === 1) g.hud.toast('★ People are getting nervous. The shops just locked their doors!', '');
      if (s === 2) g.hud.toast('★★ The tough folks in town are coming for you!', '');
      if (s === 3) { g.discovery.banner('ANGRY MOB!', 'Run! Hide! Stay out of sight to cool off.', 'rank'); sfx.fanfare(); g.discovery.award('wanted3'); }
    }
    this.peakStars = Math.max(this.peakStars, s);
    this._renderHeat();
  }

  _renderHeat() {
    const s = this.stars, el = this.heatEl;
    if (this.heat <= 0.5) { el.classList.remove('show'); return; }
    el.classList.add('show');
    el.classList.toggle('hot', s >= 3);
    el.innerHTML = `<span class="hs">${'★'.repeat(s)}<i>${'★'.repeat(3 - s)}</i></span><span class="hb"><b style="width:${this.heat}%"></b></span>`;
  }

  _buildHud() {
    this.heatEl = document.createElement('div'); this.heatEl.id = 'heatBox';
    document.getElementById('hud').appendChild(this.heatEl);
  }

  _stepHeat(dt) {
    const g = this.game;
    this.calmT += dt;
    if (this.heat <= 0) return;
    const pp = g.player.ragdoll.getPos(_a);
    let seen = false;
    for (const n of g.npcs) { if (n.dormant || n.knockedOut()) continue; if (n.pos.distanceTo(pp) < 16) { seen = true; break; } }
    if (this.calmT > 6) {
      const before = this.stars;
      this.heat = Math.max(0, this.heat - dt * (seen ? 4 : 12));
      if (this.heat <= 0 && this.peakStars >= 2) { g.hud.toast('You lost them! Things are calming down.', 'quest'); g.discovery.award('escape'); }
      if (this.heat <= 0) this.peakStars = 0;
      if (this.stars < before) this._renderHeat();
    }
    if (this.tick % 15 === 0) this._renderHeat();
    // reactions
    if (this.tick % 60 !== 0) return;
    const s = this.stars;
    const near = g.npcs.filter((n) => !n.dormant && !n.knockedOut() && n.state !== 'axe' && !n.def.special).map((n) => ({ n, d: n.pos.distanceTo(pp) })).sort((a, b) => a.d - b.d);
    if (s >= 1) for (const { n, d } of near) if (d < 10 && n.state === 'wander' && Math.random() < 0.4) n.react('flee', 3);
    const chasers = s >= 3 ? 8 : s >= 2 ? 3 : 0;
    near.filter(({ d }) => d < 35).slice(0, chasers).forEach(({ n }, i) => {
      n.setState('revenge', 4);
      if (s >= 3 && Math.random() < 0.25 && i < 4) n.say(MOB_LINES[Math.floor(Math.random() * MOB_LINES.length)], 2);
    });
  }

  // ---------------------------------------------------------------- chain reactions
  _stepChain() {
    const g = this.game, t = g.time;
    const missiles = [];
    for (const n of g.npcs) {
      if (n.dormant) continue;
      const fresh = (t - (n.lastHitByPlayer ?? -99) < TAINT_TIME) || (t - (n.chainT ?? -99) < TAINT_TIME);
      if (!fresh) continue;
      const v = n.ragdoll.parts.pelvis.body.linvel(), sp = Math.hypot(v.x, v.y, v.z);
      if (sp < MISSILE_SPEED) continue;
      missiles.push({ pos: n.ragdoll.getPos(new THREE.Vector3()), v, sp, depth: n.chainDepth || 0, src: n, r: 0.95 });
    }
    for (const p of g.world.props) {
      if (t - (p.taintT ?? -99) > TAINT_TIME) continue;
      if (g.driving.active && p === g.driving.car) continue;
      const v = p.body.linvel(), sp = Math.hypot(v.x, v.y, v.z);
      if (sp < MISSILE_SPEED) continue;
      const tr = p.body.translation();
      missiles.push({ pos: new THREE.Vector3(tr.x, tr.y, tr.z), v, sp, depth: p.chainDepth || 0, src: p, r: p.kind === 'debris' ? 2 : 1.1 });
    }
    if (!missiles.length) return;
    for (const n of g.npcs) {
      if (n.dormant || n.knockedOut()) continue;
      const np = n.ragdoll.getPos(_b);
      for (const m of missiles) {
        if (m.src === n) continue;
        if (Math.abs(np.y - m.pos.y) > 1.6 || Math.hypot(np.x - m.pos.x, np.z - m.pos.z) > m.r) continue;
        const dir = new THREE.Vector3(m.v.x, Math.max(0.3, m.v.y * 0.3 + 0.4), m.v.z).normalize();
        n.chainDepth = m.depth + 1; n.chainT = t;
        g.hitRagdoll(n.ragdoll, 'torso', dir, Math.min(16, m.sp * 0.95), 1.6, g.player, 'chain');
        n.lastHitByPlayer = t; n.lastHitWeapon = 'chain';
        break;
      }
    }
    // set pieces take damage from fast stuff crashing into them
    for (const sp of this.pieces) {
      if (sp.fallen) continue;
      for (const m of missiles) {
        if (sp.dist(m.pos) > 0.6 || m.pos.y > sp.top + 0.5) continue;
        if ((sp.hitCool.get(m.src) ?? 0) > t) continue;
        sp.hitCool.set(m.src, t + 1);
        const mass = m.src.body ? Math.min(120, m.src.body.mass()) : 60;
        sp.damage(m.sp * mass / 12);
      }
    }
  }

  /** A knockout the player caused (via fun.onKnockout). */
  onKnockout(npc) {
    const g = this.game, t = g.time;
    this.addHeat(npc.chainDepth ? 4 : 7);
    if (!npc.chainDepth || t - (npc.chainT ?? -99) > 1.5) return;
    const p = npc.pos;
    if (!this.chain || t - this.chain.t > CHAIN_WINDOW) this.chain = { n: 0, t, x: p.x, z: p.z, depth: 0 };
    this.chain.n++; this.chain.t = t; this.chain.depth = Math.max(this.chain.depth, npc.chainDepth);
    if (this.chain.n >= 2) g.discovery.popup(`CHAIN x${this.chain.n}!`);
  }

  _endChain() {
    const c = this.chain; this.chain = null;
    if (!c || c.n < 2) return;
    const g = this.game, D = g.discovery;
    D.addPoints(Math.round(20 * c.n * c.n), `CHAIN REACTION x${c.n}`);
    if (c.n >= 3) { D.award('chain3'); this.fun.challengeEvent('chain', { n: c.n, x: c.x, z: c.z }); }
    if (c.n >= 6) D.award('chain6');
    this.fun.moves.trick(`CHAIN x${c.n}`, 30 * c.n);
    if (c.n >= 3) this.fun.offerReplay();
  }

  // ---------------------------------------------------------------- per fixed step
  step(dt) {
    const g = this.game;
    this.tick++;
    if (this.tick % 2 === 0) this._stepChain();
    if (this.chain && g.time - this.chain.t > CHAIN_WINDOW) this._endChain();
    this._stepHeat(dt);
    for (const n of g.npcs) if (n.chainDepth && g.time - (n.chainT ?? 0) > 6 && !n.knockedOut()) n.chainDepth = 0;
    // set pieces: melee swings and car rams
    if (this.tick % 3 === 0) {
      const p = g.player, pp = p.ragdoll.getPos(_a);
      for (const sp of this.pieces) {
        if (sp.fallen) {
          sp.rebuildT -= dt * 3;
          if (sp.rebuildT <= 0 && sp.dist(pp) > 25) sp.rebuild();
          continue;
        }
        const a = p.attack;
        if (a && a.hitDone && !a.spHit && sp.dist(pp) < 1.6 && pp.y < sp.top) {
          a.spHit = true;
          sp.lean = g.cam.flatForward(new THREE.Vector3());
          sp.damage((a.weapon.knock || 5) * 1.6 * (p.knockMul || 1));
        }
        if (g.driving.active && g.driving.car) {
          const ct = g.driving.car.body.translation();
          const spd = Math.abs(g.driving.vf || 0);
          if (spd > 7 && sp.dist(ct) < 2.4 && (sp.hitCool.get('car') ?? 0) < g.time) {
            sp.hitCool.set('car', g.time + 1);
            sp.lean = new THREE.Vector3(Math.sin(g.driving.heading), 0, Math.cos(g.driving.heading));
            sp.damage(spd * 5);
          }
        }
      }
    }
  }

  serialize() { return {}; }
}
