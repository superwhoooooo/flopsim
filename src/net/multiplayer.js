// Multiplayer: peer-to-peer over WebRTC (PeerJS). No game server needed, works across different networks.
//
//  - One player HOSTS and gets a short room code; friends JOIN with it (up to 4 players). The host relays messages
//    between everyone (star layout). The free public PeerJS service is only used to find each other by room code;
//    game data goes directly between browsers (or through a TURN relay when a strict network blocks direct routes).
//  - Shared: everyone's character (pose, skin, weapon, name), cars you drive, speech lines, and hits: anything that
//    bonks another player's avatar (weapons, explosions, cars, body slams...) is sent to that player, whose own
//    game applies it to them for real.
//  - NOT shared (yet): townspeople, props and quests - each player has their own copy of the town.
import * as THREE from 'three';
import { Ragdoll, PART_NAMES } from '../ragdoll.js';
import { LOOKS } from '../animals.js';
import { createWeaponMesh, WEAPONS } from '../weapons/weapons.js';
import { makeNameTag } from '../dialogue/speech.js';
import { RAPIER, G, groups } from '../physics.js';
import { sfx } from '../audio.js';

const ROOM_PREFIX = 'flopsim-room-';
const MAX_PLAYERS = 4;
const SEND_HZ = 20;
const INTERP_DELAY = 0.12;   // s: draw remote players this far in the past so movement is smooth
const SHIRTS = [0x2e86c1, 0x27ae60, 0x8e44ad, 0xf39c12];   // remote players' shirt colours (human skin)
// How browsers find a route to each other across different networks. STUN finds a direct path through most home
// routers. Very strict networks (some school/office wifi, some mobile hotspots) block that and need a TURN relay:
// free public relays have all shut down, so to support those, sign up for a TURN service (e.g. Metered or Cloudflare
// have free tiers) and add its { urls, username, credential } entry to TURN_SERVERS.
const TURN_SERVERS = [];
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  ...TURN_SERVERS,
];
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no 0/O, 1/I/L
const makeCode = () => Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3();

/** Another player's character in our world: a ragdoll whose bodies are moved by network snapshots (kinematic). */
class RemotePlayer {
  constructor(net, id, info) {
    this.net = net; this.id = id; this.game = net.game;
    this.isRemote = true;
    this.name = info.name || 'Friend';
    this.color = info.color ?? SHIRTS[0];
    this.form = null; this.weapon = null;
    this.snaps = [];   // { t, parts: Float32 x/y/z/qx/qy/qz/qw per part, car, ... }
    this.ragdoll = new Ragdoll(this.game.physics, this.game.scene, { owner: this, remote: true, ...this._look(info.form || 'human') });
    this.ragdoll.spawn(0, -500, 0);
    for (const n of PART_NAMES) this.ragdoll.parts[n].body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    this.tag = makeNameTag(this.ragdoll.anchor, this.name);
    this.tag.setMark('');
    this.weaponMeshes = {};
    this.car = null;
  }

  _look(form) {
    const look = { ...(LOOKS[form] || LOOKS.human) };
    if (form === 'human') look.shirt = this.color;   // tell friends apart
    return look;
  }

  setForm(form) {
    if (form === this.form || !LOOKS[form]) return;
    this.form = form;
    this.ragdoll.restyle(this._look(form));
  }

  setWeapon(id) {
    if (id === this.weapon) return;
    if (this.weapon && this.weaponMeshes[this.weapon]) this.weaponMeshes[this.weapon].visible = false;
    this.weapon = id;
    if (!id || !WEAPONS[id]) return;
    if (!this.weaponMeshes[id]) {
      const m = createWeaponMesh(id); m.position.set(0, -0.16, 0);
      this.ragdoll.parts.lArmR.mesh.add(m);
      this.weaponMeshes[id] = m;
    }
    this.weaponMeshes[id].visible = true;
  }

  /** A simple car body shown (and solid) while they drive. */
  _carMesh(color) {
    if (this.car) return this.car;
    const paint = new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.3 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 4.2), paint);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 2.2), new THREE.MeshStandardMaterial({ color: 0x1d2a38, metalness: 0.8, roughness: 0.1 }));
    cabin.position.set(0, 0.62, -0.2); mesh.add(cabin);
    for (const [x, z] of [[-0.85, 1.35], [0.85, 1.35], [-0.85, -1.35], [0.85, -1.35]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
      w.position.set(x, -0.3, z); mesh.add(w);
    }
    mesh.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.game.scene.add(mesh);
    const body = this.game.physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -500, 0));
    const col = this.game.physics.world.createCollider(RAPIER.ColliderDesc.cuboid(0.9, 0.7, 2.1).setTranslation(0, 0.1, 0)
      .setCollisionGroups(groups(G.PROP, 0xffff)), body);
    this.car = { mesh, body, col, paint };
    return this.car;
  }

  push(snap) {
    this.snaps.push(snap);
    if (this.snaps.length > 30) this.snaps.shift();
    this.setForm(snap.form);
    this.setWeapon(snap.driving ? null : snap.weapon);
  }

  /** Move the kinematic bodies to an interpolated snapshot. Called every fixed step. */
  step() {
    const now = this.net.clock() - INTERP_DELAY;
    const s = this.snaps;
    if (!s.length) return;
    let a = s[0], b = s[0];
    for (let i = s.length - 1; i >= 0; i--) if (s[i].t <= now) { a = s[i]; b = s[i + 1] || s[i]; break; }
    const k = b.t > a.t ? THREE.MathUtils.clamp((now - a.t) / (b.t - a.t), 0, 1) : 0;
    const r = this.ragdoll;
    PART_NAMES.forEach((n, i) => {
      const o = i * 7, pa = a.parts, pb = b.parts;
      const body = r.parts[n].body;
      body.setNextKinematicTranslation({ x: pa[o] + (pb[o] - pa[o]) * k, y: pa[o + 1] + (pb[o + 1] - pa[o + 1]) * k, z: pa[o + 2] + (pb[o + 2] - pa[o + 2]) * k });
      _q.set(pa[o + 3], pa[o + 4], pa[o + 5], pa[o + 6]).slerp(_q2.set(pb[o + 3], pb[o + 4], pb[o + 5], pb[o + 6]), k);
      body.setNextKinematicRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w });
    });
    r.setVisible(!a.driving);
    r.mode = a.limp ? 'limp' : 'active';
    if (a.car) {
      const c = this._carMesh(a.carColor ?? 0x888888);
      const ca = a.car, cb = b.car || a.car;
      _v.set(ca[0] + (cb[0] - ca[0]) * k, ca[1] + (cb[1] - ca[1]) * k, ca[2] + (cb[2] - ca[2]) * k);
      _q.set(ca[3], ca[4], ca[5], ca[6]).slerp(_q2.set(cb[3], cb[4], cb[5], cb[6]), k);
      c.body.setNextKinematicTranslation({ x: _v.x, y: _v.y, z: _v.z });
      c.body.setNextKinematicRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w });
      c.mesh.position.copy(_v); c.mesh.quaternion.copy(_q); c.mesh.visible = true;
    } else if (this.car) { this.car.mesh.visible = false; this.car.body.setNextKinematicTranslation({ x: 0, y: -500, z: 0 }); }
  }

  sync() { this.ragdoll.sync(); }

  dispose() {
    this.ragdoll.dispose();
    if (this.car) { this.game.scene.remove(this.car.mesh); this.game.physics.world.removeRigidBody(this.car.body); }
  }
}

export class Multiplayer {
  constructor(game) {
    this.game = game;
    this.peer = null;
    this.conns = new Map();     // peer id -> DataConnection (host: every client; client: just the host)
    this.remotes = new Map();   // player id -> RemotePlayer
    this.isHost = false;
    this.code = null;
    this.myId = null;
    this.sendT = 0;
    this.t0 = performance.now();
    this.name = (() => { try { return localStorage.getItem('flopsim-name') || ''; } catch (e) { return ''; } })();
    this._buildPanel();
  }

  clock() { return (performance.now() - this.t0) / 1000; }
  get active() { return !!this.peer; }

  // ---------- UI: N opens this panel ----------
  _buildPanel() {
    const el = document.createElement('div');
    el.id = 'mpPanel';
    el.innerHTML = `
      <div class="mp-box">
        <h2>Multiplayer</h2>
        <label>Your name <input id="mpName" maxlength="16" placeholder="Player"></label>
        <div class="mp-row"><button id="mpHost">Host a game</button></div>
        <div class="mp-row"><input id="mpCode" maxlength="4" placeholder="CODE"><button id="mpJoin">Join</button></div>
        <div id="mpStatus" class="mp-status">Play with friends anywhere: one hosts, the others join with the room code.</div>
        <div id="mpPlayers" class="mp-players"></div>
        <div class="mp-row"><button id="mpLeave" class="mp-leave">Leave</button><button id="mpClose">Close (N)</button></div>
      </div>`;
    document.body.appendChild(el);
    this.panel = el;
    const $ = (id) => el.querySelector('#' + id);
    this.ui = { name: $('mpName'), code: $('mpCode'), status: $('mpStatus'), players: $('mpPlayers'), host: $('mpHost'), join: $('mpJoin'), leave: $('mpLeave') };
    this.ui.name.value = this.name;
    this.ui.name.addEventListener('change', () => { this.name = this.ui.name.value.trim().slice(0, 16); try { localStorage.setItem('flopsim-name', this.name); } catch (e) { /* ignore */ } });
    this.ui.code.addEventListener('input', () => { this.ui.code.value = this.ui.code.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
    $('mpHost').addEventListener('click', () => this.host());
    $('mpJoin').addEventListener('click', () => this.join(this.ui.code.value));
    this.ui.code.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.join(this.ui.code.value); });
    $('mpLeave').addEventListener('click', () => this.leave());
    $('mpClose').addEventListener('click', () => this.toggle(false));
    this._refresh();
  }

  toggle(show = !this.panel.classList.contains('open')) {
    this.panel.classList.toggle('open', show);
    if (show) { document.exitPointerLock?.(); this.game.input.clear(); this._refresh(); }
  }
  get open() { return this.panel.classList.contains('open'); }

  _status(text) { this.ui.status.textContent = text; }
  _refresh() {
    const on = this.active;
    this.ui.host.disabled = on; this.ui.join.disabled = on; this.ui.code.disabled = on;
    this.ui.leave.style.display = on ? '' : 'none';
    const names = [`${this.name || 'You'} (you${this.isHost ? ', host' : ''})`, ...[...this.remotes.values()].map((r) => r.name)];
    this.ui.players.innerHTML = on ? '<b>Players:</b> ' + names.map((n) => n.replace(/[<>&]/g, '')).join(', ') : '';
  }

  // ---------- connecting ----------
  async _peer(id) {
    const { Peer } = await import('peerjs');
    return new Peer(id, { config: { iceServers: ICE_SERVERS }, debug: 0 });
  }

  async host() {
    if (this.peer) return;
    this.isHost = true;
    this.code = makeCode();
    this._status('Creating room...');
    const peer = this.peer = await this._peer(ROOM_PREFIX + this.code);
    peer.on('open', () => {
      this.myId = 'host';
      this._status(`Room code: ${this.code}  -  tell your friends to press N and join with it.`);
      this.game.hud.toast(`Hosting! Room code: ${this.code}`, 'unlock');
      this._refresh();
    });
    peer.on('connection', (conn) => this._acceptClient(conn));
    peer.on('error', (err) => {
      if (err.type === 'unavailable-id') { this.peer.destroy(); this.peer = null; this.host(); return; }   // code taken: new one
      this._status('Could not host: ' + (err.type || err.message));
      this._teardown();
    });
  }

  async join(code) {
    code = (code || '').toUpperCase().trim();
    if (this.peer || code.length !== 4) { if (code.length !== 4) this._status('Type the 4-letter room code first.'); return; }
    this.isHost = false; this.code = code;
    this._status(`Connecting to room ${code}...`);
    const peer = this.peer = await this._peer();
    peer.on('open', (id) => {
      this.myId = id;
      const conn = peer.connect(ROOM_PREFIX + code, { reliable: true, metadata: { name: this.name || 'Friend' } });
      const timeout = setTimeout(() => {
        if (conn.open) return;
        this._status("Couldn't connect. Check the code and that the host is still in the room. If it's right, one of your networks may block direct connections (common on school/office wifi): try a different network, like home wifi or a phone hotspot.");
        this._teardown();
      }, 15000);
      conn.on('open', () => {
        clearTimeout(timeout);
        this.conns.set('host', conn);
        this._status(`Connected to room ${code}!`);
        this.game.hud.toast(`Joined room ${code}`, 'unlock');
        sfx.unlock();
        this._refresh();
      });
      conn.on('data', (m) => this._onMessage(m, 'host'));
      conn.on('close', () => { this.game.hud.toast('The host left the game', ''); this._teardown(); });
    });
    peer.on('error', (err) => {
      this._status(err.type === 'peer-unavailable' ? `No room with code ${code}. Check it and try again.` : 'Connection failed: ' + (err.type || err.message));
      this._teardown();
    });
  }

  _acceptClient(conn) {
    if (this.conns.size >= MAX_PLAYERS - 1) { conn.on('open', () => { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 300); }); return; }
    conn.on('open', () => {
      this.conns.set(conn.peer, conn);
      const name = String(conn.metadata?.name || 'Friend').slice(0, 16);
      this.game.hud.toast(`${name} joined!`, 'unlock'); sfx.unlock();
      // tell the newcomer who is here, and everyone else about the newcomer
      conn.send({ t: 'welcome', you: conn.peer, players: [{ id: 'host', name: this.name || 'Host', color: SHIRTS[0] }, ...[...this.remotes.values()].map((r) => ({ id: r.id, name: r.name, color: r.color }))] });
      const color = SHIRTS[(this.conns.size) % SHIRTS.length];
      this._addRemote(conn.peer, { name, color });
      this._broadcast({ t: 'join', id: conn.peer, name, color }, conn.peer);
      this._refresh();
    });
    conn.on('data', (m) => this._onMessage(m, conn.peer));
    conn.on('close', () => this._dropPeer(conn.peer));
    conn.on('error', () => this._dropPeer(conn.peer));
  }

  _dropPeer(id) {
    if (!this.conns.has(id)) return;
    this.conns.delete(id);
    const r = this.remotes.get(id);
    if (r) { this.game.hud.toast(`${r.name} left`, ''); r.dispose(); this.remotes.delete(id); }
    this._broadcast({ t: 'leave', id });
    this._refresh();
  }

  _addRemote(id, info) {
    if (id === this.myId || this.remotes.has(id)) return this.remotes.get(id);
    const r = new RemotePlayer(this, id, info);
    this.remotes.set(id, r);
    return r;
  }

  leave() {
    if (!this.peer) return;
    this._broadcast({ t: 'leave', id: this.myId });
    this._teardown();
    this._status('Left the game.');
  }

  _teardown() {
    for (const c of this.conns.values()) { try { c.close(); } catch (e) { /* ignore */ } }
    this.conns.clear();
    for (const r of this.remotes.values()) r.dispose();
    this.remotes.clear();
    try { this.peer?.destroy(); } catch (e) { /* ignore */ }
    this.peer = null; this.isHost = false; this.myId = null;
    this._refresh();
  }

  // ---------- messages ----------
  /** Host: send to every client (except `skip`). Client: send to the host (who relays). */
  _broadcast(m, skip = null) {
    for (const [id, c] of this.conns) if (id !== skip && c.open) c.send(m);
  }
  _sendTo(id, m) {
    if (this.isHost) { const c = this.conns.get(id); if (c?.open) c.send(m); }
    else { const c = this.conns.get('host'); if (c?.open) c.send({ ...m, to: id }); }
  }

  _onMessage(m, from) {
    if (!m || typeof m !== 'object') return;
    // host relays everything that isn't for it
    if (this.isHost && from !== 'host') {
      if (m.to && m.to !== 'host') { const c = this.conns.get(m.to); if (c?.open) c.send({ ...m, from }); return; }
      if (!m.to) this._broadcast({ ...m, from }, from);
      m = { ...m, from };
    }
    const sender = m.from || from;
    switch (m.t) {
      case 'welcome':
        this.myId = m.you;
        for (const p of m.players) this._addRemote(p.id, p);
        this._refresh();
        break;
      case 'join': this._addRemote(m.id, m); this.game.hud.toast(`${m.name} joined!`, ''); this._refresh(); break;
      case 'leave': { const r = this.remotes.get(m.id); if (r) { this.game.hud.toast(`${r.name} left`, ''); r.dispose(); this.remotes.delete(m.id); this._refresh(); } break; }
      case 'full': this._status('That room is full (4 players).'); this._teardown(); break;
      case 'state': {
        const r = this.remotes.get(sender) || this._addRemote(sender, { name: m.name, color: m.color });
        if (!r) break;
        if (m.name && m.name !== r.name) { r.name = m.name; r.tag.obj.element.querySelector('.qname').textContent = m.name; this._refresh(); }
        m.t = this.clock();   // our own clock for interpolation (their clock differs)
        r.push(m);
        break;
      }
      case 'say': { const r = this.remotes.get(sender); if (r) this.game.speech.say(r.ragdoll.anchor, String(m.text).slice(0, 80), 2.6, 'player'); break; }
      case 'hit': {   // someone bonked us
        const g = this.game, d = m.dir || [0, 0.3, 1];
        const r = this.remotes.get(sender);
        g.hitRagdoll(g.player.ragdoll, m.part || 'torso', new THREE.Vector3(d[0], d[1], d[2]).normalize(), Math.min(30, +m.strength || 0), Math.min(5, +m.stun || 0), r || null, m.weapon);
        break;
      }
      default: break;
    }
  }

  /** Called from game.hitRagdoll when something hits a remote player's avatar: forward it to them. */
  sendHit(remote, part, dir, strength, stun, weaponId) {
    this._sendTo(remote.id, { t: 'hit', part, dir: [dir.x, dir.y, dir.z], strength, stun, weapon: weaponId });
  }

  sendSay(text) { if (this.active) this._broadcast({ t: 'say', text }); }

  /** Fixed step: move remote avatars; send our own state ~20 times a second. */
  step(dt) {
    if (!this.active) return;
    for (const r of this.remotes.values()) r.step();
    this.sendT -= dt;
    if (this.sendT > 0 || !this.conns.size) return;
    this.sendT = 1 / SEND_HZ;
    const g = this.game, p = g.player, rd = p.ragdoll;
    const parts = [];
    for (const n of PART_NAMES) {
      const b = rd.parts[n].body, t = b.translation(), q = b.rotation();
      parts.push(+t.x.toFixed(3), +t.y.toFixed(3), +t.z.toFixed(3), +q.x.toFixed(4), +q.y.toFixed(4), +q.z.toFixed(4), +q.w.toFixed(4));
    }
    const m = { t: 'state', parts, form: p.formId, weapon: p.weaponId, limp: rd.mode === 'limp', name: this.name || (this.isHost ? 'Host' : 'Friend') };
    if (g.driving.active && g.driving.car) {
      const b = g.driving.car.body, t = b.translation(), q = b.rotation();
      m.driving = true;
      m.car = [t.x, t.y, t.z, q.x, q.y, q.z, q.w].map((v) => +v.toFixed(3));
      m.carColor = g.driving.car.mesh.material.color.getHex();
    }
    this._broadcast(m);
  }

  sync() { for (const r of this.remotes.values()) r.sync(); }
}
