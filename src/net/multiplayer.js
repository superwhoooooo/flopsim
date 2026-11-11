// Multiplayer: peer-to-peer over WebRTC (PeerJS). No game server needed, works across different networks.
//
//  - One player HOSTS and gets a short room code; friends JOIN with it (up to 4 players). The host relays messages
//    between everyone (star layout). The free public PeerJS service is only used to find each other by room code;
//    game data goes directly between browsers (or through a TURN relay when a strict network blocks direct routes).
//  - Shared: everyone's character (pose, skin, weapon, name), cars you drive, speech lines, and hits: anything that
//    bonks another player's avatar (weapons, explosions, cars, body slams...) is sent to that player, whose own
//    game applies it to them for real.
//  - The town is shared too: the HOST's game runs the townspeople and props and streams them to everyone (~12 times a
//    second, only what's near each player). A joined player's NPCs and props are puppets that follow the host's; hits
//    on NPCs and pushes on props are sent to the host, who applies them, so everyone sees the same thing. NPCs go after
//    whoever hit them, knockout credit goes to whoever did it, and a joined player who gets in a car drives it
//    themselves until they get out. Quests, feats and inventories stay per-player.
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
const TOWN_HZ = 12;          // host -> each friend: townspeople + props near them
const TOWN_NPC_R = 85;       // m around a friend that we send townspeople for
const TOWN_PROP_R = 100;     // m around a friend that we send moving props for
const LIMBS = ['armL', 'armR', 'legL', 'legR'];
const NPC_STRIDE = 2 + 11 * 7;   // index, flags, 11 parts x (pos cm, quat x32767)
const PROP_STRIDE = 8;           // id, pos cm, quat
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
// Relay fallback (no account needed): when a network blocks the direct connection (common when both players are on
// the same school/office/guest wifi), game messages go through free public MQTT message servers instead. The host
// listens on all of them; a joiner uses the first one that works. Slower than direct, and public: anyone who knew the
// room code could watch the traffic (positions, hits, names) - nothing personal.
const RELAY_BROKERS = ['wss://broker.hivemq.com:8884/mqtt', 'wss://broker.emqx.io:8084/mqtt', 'wss://test.mosquitto.org:8081/mqtt'];
const RELAY_PREFIX = 'flopsim-relay/v1/';
const DIRECT_TIMEOUT = 9000;   // ms to wait for a direct connection before switching to the relay
const RELAY_SILENCE = 12000;   // ms without hearing from someone over the relay = they're gone
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no 0/O, 1/I/L
const makeCode = () => Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3();

// ---------- relay plumbing ----------
const b64 = (buf) => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (str) => { const s = atob(str), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; };
const relayEncode = (o) => JSON.stringify(o, (k, v) => (v instanceof ArrayBuffer ? { __b: b64(v) } : v));
const relayDecode = (txt) => JSON.parse(txt, (k, v) => (v && typeof v === 'object' && typeof v.__b === 'string' ? unb64(v.__b) : v));
const _td = new TextDecoder();
async function relayConnect(url) {
  const { default: mqtt } = await import('mqtt');
  return new Promise((resolve) => {
    let c;
    try { c = mqtt.connect(url, { connectTimeout: 6000, reconnectPeriod: 2000, clean: true }); } catch (e) { resolve(null); return; }
    const t = setTimeout(() => { try { c.end(true); } catch (e) { /* ignore */ } resolve(null); }, 8000);
    c.once('connect', () => { clearTimeout(t); resolve(c); });
  });
}

/** Looks like a PeerJS connection to the rest of this file, but sends through a relay message server. */
class RelayConn {
  constructor(client, topicOut, myId, peerId, metadata) {
    this.client = client; this.topicOut = topicOut; this.myId = myId; this.peer = peerId; this.metadata = metadata;
    this.open = false; this.relay = true; this.handlers = {}; this.lastSeen = performance.now();
  }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
  emit(ev, a) { for (const f of this.handlers[ev] || []) f(a); }
  send(m) { if (this.open) this.client.publish(this.topicOut, relayEncode({ k: 'm', from: this.myId, m })); }
  close() {
    if (!this.open) return;
    try { this.client.publish(this.topicOut, relayEncode({ k: 'bye', from: this.myId })); } catch (e) { /* ignore */ }
    this.open = false; this.emit('close');
  }
}

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
    // hiding (they're holding B): barely visible, and no name tag
    r.setGhost(!!a.hide, 0.18);
    this.tag.obj.visible = !a.hide;
    // they're driving one of the town's cars: the host moves the real car (and streams it to everyone else)
    if (a.car && a.carId != null && this.net.isHost) {
      const prop = this.net.prop(a.carId);
      if (prop && prop.ownedBy === this.id) {
        const ca = a.car, cb = b.car || a.car;
        prop.body.setNextKinematicTranslation({ x: ca[0] + (cb[0] - ca[0]) * k, y: ca[1] + (cb[1] - ca[1]) * k, z: ca[2] + (cb[2] - ca[2]) * k });
        _q.set(ca[3], ca[4], ca[5], ca[6]).slerp(_q2.set(cb[3], cb[4], cb[5], cb[6]), k);
        prop.body.setNextKinematicRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w });
      }
    }
  }

  sync() { this.ragdoll.sync(); }

  dispose() {
    this.gone = true;   // NPCs chasing this player give up
    this.ragdoll.dispose();
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
    this.townT = 0;
    this.townReady = false;     // joined player: the host's town has taken over ours
    this.knockLog = [];         // host: trees / lamp posts knocked over so far (replayed for late joiners)
    this.pending = new Map();   // joined player: pushes on props waiting to be sent to the host
    this.relayClients = [];     // open connections to relay message servers
    this.relayConns = new Map(); // host: joiners reaching us through a relay
    this.t0 = performance.now();
    this.name = (() => { try { return localStorage.getItem('flopsim-name') || ''; } catch (e) { return ''; } })();
    this.handlers = new Map();   // message type -> fn(msg, senderId), for add-ons like minigames
    this._buildPanel();
  }

  clock() { return (performance.now() - this.t0) / 1000; }
  /** Listen for a custom message type. */
  on(type, fn) { this.handlers.set(type, fn); }
  /** Send a custom message to everyone (clients go through the host, which relays it). */
  send(m) { if (this.active) this._broadcast(m); }
  /** Send a custom message to one player ('host' or a peer id). */
  sendTo(id, m) { if (this.active) this._sendTo(id, m); }
  /** Display name for a player id (ours included). */
  nameOf(id) { return id === this.myId ? (this.name || (this.isHost ? 'Host' : 'You')) : (this.remotes.get(id)?.name || 'Friend'); }
  get active() { return !!this.peer; }
  /** Joined someone else's game (and their town is now driving ours). */
  get isClient() { return !!this.peer && !this.isHost && this.townReady; }
  /** Host: where every friend is (keeps townspeople near them awake). */
  friendPositions() { return this.isHost ? [...this.remotes.values()].map((r) => r.ragdoll.getPos(new THREE.Vector3())) : []; }
  prop(id) {
    if (!this._props || this._propsN !== this.game.world.props.length) {   // rebuild the id lookup when props come and go
      this._props = new Map(this.game.world.props.filter((p) => p.netId != null).map((p) => [p.netId, p]));
      this._propsN = this.game.world.props.length;
    }
    return this._props.get(id);
  }

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
        <div id="mpGames" class="mp-games"></div>
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
    this.game.fun?.mg.renderPanel(this.panel.querySelector('#mpGames'));
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
      this._relayHost();   // also reachable through the relays, for friends whose network blocks direct connections
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
        // (a wrong code fails fast with 'peer-unavailable', so reaching this means the room was found:
        // the network is blocking the direct connection - go through a relay instead)
        try { conn.close(); } catch (e) { /* ignore */ }
        this._joinViaRelay(code);
      }, DIRECT_TIMEOUT);
      conn.on('open', () => {
        clearTimeout(timeout);
        this.conns.set('host', conn);
        this._status(`Connected to room ${code}!`);
        this.game.hud.toast(`Joined room ${code}`, 'unlock');
        sfx.unlock();
        this._refresh();
      });
      conn.on('data', (m) => this._onMessage(m, 'host'));
      conn.on('close', () => { if (this.conns.get('host') !== conn) return; this.game.hud.toast('The host left the game', ''); this._teardown(); });
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
      conn.send({ t: 'welcome', you: conn.peer, town: true, knocked: this.knockLog, players: [{ id: 'host', name: this.name || 'Host', color: SHIRTS[0] }, ...[...this.remotes.values()].map((r) => ({ id: r.id, name: r.name, color: r.color }))] });
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
    this.relayConns.delete(id);
    for (const p of this.game.world.props) if (p.ownedBy === id) { p.ownedBy = null; p.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true); }
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
    for (const c of this.relayClients) { try { c.end(false); } catch (e) { /* ignore */ } }   // gentle: lets the goodbye go out first
    this.relayClients = []; this.relayConns.clear(); this._welcomed = false;
    this.peer = null; this.isHost = false; this.myId = null;
    if (this.townReady) this._restoreTown();
    this.game.fun?.mg.reset();
    this._refresh();
  }

  // ---------- relay fallback ----------
  /** Host: listen for joiners on every relay server. */
  async _relayHost() {
    const code = this.code, inbox = RELAY_PREFIX + code + '/host';
    await Promise.all(RELAY_BROKERS.map(async (url) => {
      const client = await relayConnect(url);
      if (!client) return;
      if (!this.peer || this.code !== code) { client.end(true); return; }   // we left meanwhile
      this.relayClients.push(client);
      client.subscribe(inbox);
      client.on('message', (topic, payload) => {
        if (topic !== inbox) return;
        let d; try { d = relayDecode(_td.decode(payload)); } catch (e) { return; }
        if (!d || !d.from) return;
        let conn = this.relayConns.get(d.from);
        if (d.k === 'hello') {
          if (conn || this.conns.has(d.from)) return;   // (they repeat hello until welcomed)
          conn = new RelayConn(client, RELAY_PREFIX + code + '/c/' + d.from, 'host', d.from, { name: d.name });
          this.relayConns.set(d.from, conn);
          this._acceptClient(conn);
          conn.open = true; conn.emit('open');
          return;
        }
        if (!conn) return;
        conn.lastSeen = performance.now();
        if (d.k === 'm') conn.emit('data', d.m);
        else if (d.k === 'bye') { conn.open = false; conn.emit('close'); }
      });
    }));
  }

  /** Joiner: the direct connection was blocked, so reach the host through a relay server. */
  async _joinViaRelay(code) {
    if (!this.peer) return;
    this._status('Your network blocked the direct connection - connecting through a relay instead...');
    const myId = this.myId;
    for (const url of RELAY_BROKERS) {
      const client = await relayConnect(url);
      if (!this.peer) { client?.end(true); return; }
      if (!client) continue;
      const inbox = RELAY_PREFIX + code + '/c/' + myId;
      const conn = new RelayConn(client, RELAY_PREFIX + code + '/host', myId, 'host', null);
      conn.open = true;
      client.subscribe(inbox);
      client.on('message', (topic, payload) => {
        if (topic !== inbox) return;
        let d; try { d = relayDecode(_td.decode(payload)); } catch (e) { return; }
        conn.lastSeen = performance.now();
        if (d.k === 'm') conn.emit('data', d.m);
        else if (d.k === 'bye') { conn.open = false; conn.emit('close'); }
      });
      conn.on('data', (m) => this._onMessage(m, 'host'));
      conn.on('close', () => { if (this.conns.get('host') !== conn) return; this.game.hud.toast('The host left the game', ''); this._teardown(); });
      this.conns.set('host', conn);
      // say hello until the host welcomes us
      this._welcomed = false;
      for (let i = 0; i < 8 && !this._welcomed && this.peer; i++) {
        client.publish(RELAY_PREFIX + code + '/host', relayEncode({ k: 'hello', from: myId, name: this.name || 'Friend' }));
        await new Promise((r) => setTimeout(r, 1000));
      }
      if (this._welcomed) {
        this.relayClients.push(client);
        conn.lastSeen = performance.now();
        this._status(`Connected to room ${code} through a relay (a bit slower than direct, but it works on this network).`);
        this.game.hud.toast(`Joined room ${code} (via relay)`, 'unlock');
        sfx.unlock();
        this._refresh();
        return;
      }
      this.conns.delete('host');
      client.end(true);
    }
    this._status("Couldn't connect, even through the relay. Check the code, that the host is still in the room, and that you're both on the latest version (refresh).");
    this._teardown();
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
        this._welcomed = true;
        this.myId = m.you;
        for (const p of m.players) this._addRemote(p.id, p);
        if (m.town) this._takeOverTown(m.knocked || []);
        this._refresh();
        break;
      // ---- town sync: host -> joined players ----
      case 'town': if (this.isClient) this._applyTown(m); break;
      case 'npcSay': { const n = this.game.npcs[m.i]; if (n && !this.isHost) { this._quiet = true; n.say(String(m.text).slice(0, 100), m.dur || 2.6); this._quiet = false; } break; }
      case 'credit': this._credit(m); break;
      case 'knocked': if (!this.isHost) this._applyKnocked(m); break;
      case 'spud': if (this.isClient) this.game.spud.spawn({ k: m.k, x: m.x, z: m.z }); break;
      case 'dent': { const h = this.game.world.houses[m.h]; if (h) this.game.world.dent(h, m.x, m.y, m.z, m.speed); break; }
      case 'claimDenied': { const g = this.game; if (g.driving.car?.netId === m.id) { g.driving.exit(); g.hud.toast('Someone else is driving that car!', ''); } break; }
      // ---- town sync: joined players -> host ----
      case 'npcHit': if (this.isHost) this._onNpcHit(m, sender); break;
      case 'push': if (this.isHost) this._onPush(m); break;
      case 'knock': if (this.isHost) { const b = this.game.world.breakables[m.b]; if (b && !b.fallen) this.game.knockOver(b, { x: m.dir[0], z: m.dir[1] }, m.speed); } break;
      case 'claim': if (this.isHost) this._onClaim(m, sender); break;
      case 'unclaim': if (this.isHost) this._onUnclaim(m, sender); break;
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
        const wasUp = g.player.ragdoll.mode !== 'limp';
        const ko = g.hitRagdoll(g.player.ragdoll, m.part || 'torso', new THREE.Vector3(d[0], d[1], d[2]).normalize(), Math.min(30, +m.strength || 0), Math.min(5, +m.stun || 0), r || null, m.weapon);
        if (ko && wasUp) this._sendTo(sender, { t: 'pko' });   // they knocked us out: it counts as their bonk
        g.fun?.mg.onFriendHit(sender);
        break;
      }
      case 'pko': this.game.discovery?.event('knockout', { weapon: 'friend' }); break;   // we knocked out a friend
      // ---- Lift Beam ----
      case 'lift': this.game.liftBeam.lifted = m.hold ? { hold: new THREE.Vector3(m.hold[0], m.hold[1], m.hold[2]), t: this.game.time } : null; break;
      case 'fling': {   // a friend threw us with their Lift Beam
        const g = this.game, r = g.player.ragdoll, v = m.vel || [0, 0, 0];
        g.liftBeam.lifted = null;
        if (g.driving.active) break;
        if (r.mode !== 'limp') r.knockout(2.5);
        r.limpTimer = Math.max(r.limpTimer, 2.5);
        for (const k of Object.keys(r.parts)) r.parts[k].body.setLinvel({ x: v[0], y: v[1], z: v[2] }, true);
        g.thrown?.add({ ragdoll: r, by: g.player });   // we're the projectile: whoever we smash into gets bonked
        break;
      }
      case 'npcLift': if (this.isHost) { const n = this.game.npcs[m.i]; if (n) n.liftHold = m.hold ? { p: new THREE.Vector3(m.hold[0], m.hold[1], m.hold[2]), t: this.game.time } : null; } break;
      case 'npcFling': if (this.isHost) {
        const g = this.game, n = g.npcs[m.i], v = m.vel || [0, 0, 0];
        if (!n) break;
        n.liftHold = null;
        const rd = n.ragdoll; rd.limpTimer = Math.max(rd.limpTimer, 3);
        n.lastHitByFriend = { id: sender, t: g.time, weapon: 'lift' };
        for (const k of Object.keys(rd.parts)) if (!rd.isSevered(k)) rd.parts[k].body.setLinvel({ x: v[0], y: v[1], z: v[2] }, true);
        g.thrown?.add({ ragdoll: rd, by: this.remotes.get(sender) || null });
        break;
      }
      case 'thrownProp': if (this.isHost) { const p = this.prop(m.id); if (p) this.game.thrown?.add({ prop: p, by: this.remotes.get(sender) || null }); } break;
      default: { const h = this.handlers.get(m.t); if (h) h(m, sender); break; }
    }
  }

  /** Called from game.hitRagdoll when something hits a remote player's avatar: forward it to them. */
  sendHit(remote, part, dir, strength, stun, weaponId) {
    this._sendTo(remote.id, { t: 'hit', part, dir: [dir.x, dir.y, dir.z], strength, stun, weapon: weaponId });
  }

  sendSay(text) { if (this.active) this._broadcast({ t: 'say', text }); }

  /** Fixed step: move remote avatars; send our own state ~20 times a second; stream / follow the town. */
  step(dt) {
    if (!this.active) return;
    for (const r of this.remotes.values()) r.step();
    if (this.isClient) this._followTown(dt);
    if (this.isHost && this.conns.size) {
      this.townT -= dt;
      if (this.townT <= 0) { this.townT = 1 / TOWN_HZ; this._sendTown(); }
    }
    for (const [id, c] of this.conns) if (c.relay && performance.now() - c.lastSeen > RELAY_SILENCE) { c.open = false; c.emit('close'); this._dropPeer(id); }
    this.sendT -= dt;
    if (this.sendT > 0 || !this.conns.size) return;
    this.sendT = [...this.conns.values()].some((c) => c.relay) ? 1 / 12 : 1 / SEND_HZ;   // gentler on the public relay
    const g = this.game, p = g.player, rd = p.ragdoll;
    const parts = [];
    for (const n of PART_NAMES) {
      const b = rd.parts[n].body, t = b.translation(), q = b.rotation();
      parts.push(+t.x.toFixed(3), +t.y.toFixed(3), +t.z.toFixed(3), +q.x.toFixed(4), +q.y.toFixed(4), +q.z.toFixed(4), +q.w.toFixed(4));
    }
    const m = { t: 'state', parts, form: p.formId, weapon: p.weaponId, limp: rd.mode === 'limp', hide: !!p.hiding, name: this.name || (this.isHost ? 'Host' : 'Friend'), ...(g.fun?.mg.netState() || {}) };
    if (g.driving.active && g.driving.car) {
      const b = g.driving.car.body, t = b.translation(), q = b.rotation();
      m.driving = true;
      m.car = [t.x, t.y, t.z, q.x, q.y, q.z, q.w].map((v) => +v.toFixed(3));
      m.carId = g.driving.car.netId;
    }
    this._broadcast(m);
    if (this.isClient && this.pending.size) this._flushPushes();
  }

  sync() { for (const r of this.remotes.values()) r.sync(); }

  // =====================================================================================================
  // Town sync
  // =====================================================================================================

  // ---------- host side ----------
  /** Snapshot of the townspeople + moving props near each friend, packed as 16-bit numbers. */
  _sendTown() {
    const g = this.game;
    this._keyframe = (this._keyframe || 0) + 1;
    const allProps = this._keyframe % (TOWN_HZ * 3) === 0;   // every ~3 s, every prop (catches anything missed)
    for (const [id, conn] of this.conns) {
      const r = this.remotes.get(id);
      if (!r || !conn.open) continue;
      if (conn.relay && this._keyframe % 2 && !allProps) continue;   // relay: half rate (6 a second)
      const at = r.ragdoll.getPos(new THREE.Vector3());
      const npcs = g.npcs.filter((n) => n.ragdoll.getPos(_v).distanceTo(at) < TOWN_NPC_R && (!n.dormant || allProps));
      const nb = new Int16Array(npcs.length * NPC_STRIDE);
      npcs.forEach((n, j) => {
        const o = j * NPC_STRIDE, rd = n.ragdoll;
        nb[o] = g.npcs.indexOf(n);
        let flags = (rd.mode === 'limp' ? 1 : 0) | (n.state === 'axe' ? 2 : 0);
        LIMBS.forEach((l, k) => { if (rd.severed.has(l)) flags |= 4 << k; });
        nb[o + 1] = flags;
        PART_NAMES.forEach((pn, k) => this._packBody(rd.parts[pn].body, nb, o + 2 + k * 7));
      });
      const props = g.world.props.filter((p) => p.netId != null && !p.local && p.ownedBy !== id && (allProps || this._moving(p.body)) && p.body.translation().y > -50 &&
        Math.hypot(p.body.translation().x - at.x, p.body.translation().z - at.z) < TOWN_PROP_R);
      const pb = new Int16Array(props.length * PROP_STRIDE);
      props.forEach((p, j) => { pb[j * PROP_STRIDE] = p.netId; this._packBody(p.body, pb, j * PROP_STRIDE + 1); });
      conn.send({ t: 'town', n: nb.buffer, p: pb.buffer });
    }
  }
  _moving(b) { const v = b.linvel(), w = b.angvel(); return v.x * v.x + v.y * v.y + v.z * v.z + w.x * w.x + w.y * w.y + w.z * w.z > 0.004; }
  _packBody(b, arr, o) {
    const t = b.translation(), q = b.rotation(), c = (v) => Math.max(-32767, Math.min(32767, Math.round(v)));
    arr[o] = c(t.x * 100); arr[o + 1] = c(t.y * 100); arr[o + 2] = c(t.z * 100);
    arr[o + 3] = c(q.x * 32767); arr[o + 4] = c(q.y * 32767); arr[o + 5] = c(q.z * 32767); arr[o + 6] = c(q.w * 32767);
  }

  /** A friend hit a townsperson: apply it here (the host's town is the real one). */
  _onNpcHit(m, sender) {
    const g = this.game, n = g.npcs[m.i], r = this.remotes.get(sender);
    if (!n || !r) return;
    const d = m.dir || [0, 0.3, 1];
    g.hitRagdoll(n.ragdoll, m.part || 'torso', new THREE.Vector3(d[0], d[1], d[2]).normalize(), Math.min(30, +m.strength || 0), Math.min(5, +m.stun || 0), r, m.weapon);
  }
  /** A friend pushed / shot / grappled a prop. */
  _onPush(m) {
    const p = this.prop(m.id);
    if (!p || p.ownedBy) return;
    const b = p.body, V = (a) => ({ x: a[0], y: a[1], z: a[2] });
    if (m.vel) b.setLinvel(V(m.vel), true);
    if (m.imp) { if (m.at) b.applyImpulseAtPoint(V(m.imp), V(m.at), true); else b.applyImpulse(V(m.imp), true); }
    if (m.tq) b.applyTorqueImpulse(V(m.tq), true);
  }
  _onClaim(m, sender) {
    const p = this.prop(m.id);
    if (!p) return;
    if (p.ownedBy || this.game.driving.car === p) { this._sendTo(sender, { t: 'claimDenied', id: m.id }); return; }
    p.ownedBy = sender;
    p.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
  }
  _onUnclaim(m, sender) {
    const p = this.prop(m.id);
    if (!p || p.ownedBy !== sender) return;
    p.ownedBy = null;
    p.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    if (m.p) { p.body.setTranslation({ x: m.p[0], y: m.p[1], z: m.p[2] }, true); p.body.setRotation({ x: m.p[3], y: m.p[4], z: m.p[5], w: m.p[6] }, true); }
    if (m.v) p.body.setLinvel({ x: m.v[0], y: m.v[1], z: m.v[2] }, true);
  }
  /** Host: a knockout by a friend - their game gets the quest / feat credit. */
  creditKO(id, npc, weapon) { this._sendTo(id, { t: 'credit', i: this.game.npcs.indexOf(npc), weapon }); }
  /** Host: a townsperson said something. */
  npcSaid(npc, text, dur) {
    if (!this.isHost || !this.conns.size || this._quiet) return;
    this._broadcast({ t: 'npcSay', i: this.game.npcs.indexOf(npc), text, dur });
  }
  /** Host: a tree / lamp post went over - give its new prop an id and tell everyone. */
  knocked(b, prop, dir, speed) {
    const ps = this.game.world.props;
    prop.netId = this._nextId ??= ps.reduce((m, p) => Math.max(m, p.netId ?? -1), -1) + 1;
    this._nextId++;
    if (!this.isHost) return;
    const msg = { t: 'knocked', b: this.game.world.breakables.indexOf(b), id: prop.netId, dir: [dir.x, dir.z], speed };
    this.knockLog.push(msg);
    this._broadcast(msg);
  }
  dented(house, x, y, z, speed) { if (this.active) this._broadcast({ t: 'dent', h: this.game.world.houses.indexOf(house), x, y, z, speed }); }
  spudSpawned(k, x, z) { if (this.isHost && this.conns.size) this._broadcast({ t: 'spud', k, x, z }); }

  // ---------- joined player side ----------
  /** Our town becomes puppets of the host's. */
  _takeOverTown(knocked) {
    const g = this.game;
    this.townReady = true;
    for (const n of g.npcs) {
      n.setDormant(false);
      for (const pn of PART_NAMES) n.ragdoll.parts[pn].body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
      n.target = null; n.netT = null;
    }
    g.spud.remove?.();
    for (const p of g.world.props) if (p.netId != null && !p.local) this._proxyProp(p);
    for (const k of knocked) this._applyKnocked(k);
    g.hud.toast('Sharing the host\'s town: everyone sees the same people and things', '');
  }
  /** Leaving: our own game runs the town again. */
  _restoreTown() {
    const g = this.game;
    this.townReady = false;
    for (const n of g.npcs) {
      for (const pn of PART_NAMES) n.ragdoll.parts[pn].body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      n.netT = null; n.showAxe(false);
      if (n.ragdoll.mode === 'limp') n.ragdoll.limpTimer = 1;
    }
    for (const p of g.world.props) this._unproxyProp(p);
    this.pending.clear();
  }

  /** A prop that follows the host. Pushes on it (impulses, velocity changes) are collected and sent to the host. */
  _proxyProp(p) {
    if (p.proxy) return;
    const b = p.body;
    p.proxy = true;
    p._mass = b.mass();
    p._orig = { applyImpulse: b.applyImpulse, applyImpulseAtPoint: b.applyImpulseAtPoint, setLinvel: b.setLinvel, applyTorqueImpulse: b.applyTorqueImpulse, mass: b.mass };
    b.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    b.applyImpulse = (v) => this._queuePush(p, 'imp', v);
    b.applyImpulseAtPoint = (v, at) => this._queuePush(p, 'imp', v, at);
    b.setLinvel = (v) => this._queuePush(p, 'vel', v);
    b.applyTorqueImpulse = (v) => this._queuePush(p, 'tq', v);
    b.mass = () => p._mass;
  }
  _unproxyProp(p) {
    if (!p.proxy) return;
    const b = p.body;
    for (const k of Object.keys(p._orig)) delete b[k];   // back to the real methods
    p.proxy = false; p.netT = null;
    b.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
  }
  _queuePush(p, kind, v, at) {
    const e = this.pending.get(p) || {};
    if (kind === 'vel') e.vel = [v.x, v.y, v.z];
    else { const a = e[kind] || [0, 0, 0]; a[0] += v.x; a[1] += v.y; a[2] += v.z; e[kind] = a; if (at) e.at = [at.x, at.y, at.z]; }
    this.pending.set(p, e);
  }
  _flushPushes() {
    for (const [p, e] of this.pending) this._sendTo('host', { t: 'push', id: p.netId, ...e });
    this.pending.clear();
  }

  /** Host snapshot arrived: remember where everything should be. */
  _applyTown(m) {
    const g = this.game;
    const nb = new Int16Array(m.n), pb = new Int16Array(m.p);
    for (let o = 0; o < nb.length; o += NPC_STRIDE) {
      const n = g.npcs[nb[o]];
      if (!n) continue;
      const rd = n.ragdoll, flags = nb[o + 1];
      n.netT = nb.slice(o + 2, o + NPC_STRIDE);
      n.netAge = 0;
      const limp = !!(flags & 1);
      if (limp && rd.mode !== 'limp') { g.effects.word(n.pos.x, n.pos.y + 1.2, n.pos.z, 2); sfx.boing(); }
      rd.mode = limp ? 'limp' : 'active';
      n.showAxe(!!(flags & 2));
      LIMBS.forEach((l, k) => {
        const off = !!(flags & (4 << k));
        if (off && !rd.severed.has(l)) { const cb = rd.onSever; rd.onSever = null; rd.sever(l, { x: 0, y: 0.5, z: 0 }, 0); rd.onSever = cb; }
        else if (!off && rd.severed.has(l)) rd.regrow();
      });
    }
    for (let o = 0; o < pb.length; o += PROP_STRIDE) {
      const p = this.prop(pb[o]);
      if (!p || !p.proxy) continue;
      p.netT = pb.slice(o + 1, o + PROP_STRIDE);
    }
  }
  /** Every step: glide the puppets toward the host's latest positions. */
  _followTown(dt) {
    const k = 1 - Math.exp(-16 * dt);
    const glide = (body, arr, o) => {
      const t = body.translation(), r = body.rotation();
      const x = arr[o] / 100, y = arr[o + 1] / 100, z = arr[o + 2] / 100;
      const far = Math.abs(x - t.x) + Math.abs(y - t.y) + Math.abs(z - t.z) > 6;   // big jump: snap
      body.setNextKinematicTranslation(far ? { x, y, z } : { x: t.x + (x - t.x) * k, y: t.y + (y - t.y) * k, z: t.z + (z - t.z) * k });
      _q2.set(arr[o + 3] / 32767, arr[o + 4] / 32767, arr[o + 5] / 32767, arr[o + 6] / 32767).normalize();
      _q.set(r.x, r.y, r.z, r.w).slerp(_q2, far ? 1 : k);
      body.setNextKinematicRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w });
    };
    for (const n of this.game.npcs) {
      if (!n.netT) continue;
      PART_NAMES.forEach((pn, i) => glide(n.ragdoll.parts[pn].body, n.netT, i * 7));
    }
    for (const p of this.game.world.props) if (p.proxy && p.netT) glide(p.body, p.netT, 0);
  }

  // ---------- Lift Beam over the network ----------
  liftFriend(remote, hold) { this._sendTo(remote.id, { t: 'lift', hold: hold ? [hold.x, hold.y, hold.z] : null }); }
  flingFriend(remote, vel) { this._sendTo(remote.id, { t: 'fling', vel: [vel.x, vel.y, vel.z] }); }
  thrownProp(prop) { this._sendTo('host', { t: 'thrownProp', id: prop.netId }); }
  liftNpc(npc, hold) { this._sendTo('host', { t: 'npcLift', i: this.game.npcs.indexOf(npc), hold: hold ? [hold.x, hold.y, hold.z] : null }); }
  flingNpc(npc, vel) { this._sendTo('host', { t: 'npcFling', i: this.game.npcs.indexOf(npc), vel: [vel.x, vel.y, vel.z] }); }

  /** We hit a townsperson: the host applies it. */
  sendNpcHit(npc, part, dir, strength, stun, weapon) {
    this._sendTo('host', { t: 'npcHit', i: this.game.npcs.indexOf(npc), part, dir: [dir.x, dir.y, dir.z], strength, stun, weapon });
  }
  /** Our hit knocked someone out over in the host's game: count it here. */
  _credit(m) {
    const g = this.game, n = g.npcs[m.i];
    if (!n) return;
    g.quests.emit('knockout', { npc: n, personality: n.personality.id, spinning: !!g.player.spinning, weapon: m.weapon });
    g.discovery?.event('knockout', { npc: n, weapon: m.weapon });
    if (m.weapon === 'car') g.quests.emit('carKO');
  }
  requestKnock(b, dir, speed) {
    if (b.requested || b.fallen) return;
    b.requested = true;
    this._sendTo('host', { t: 'knock', b: this.game.world.breakables.indexOf(b), dir: [dir.x, dir.z], speed });
  }
  _applyKnocked(m) {
    const w = this.game.world, b = w.breakables[m.b];
    if (!b || b.fallen) return;
    const prop = w.knockOver(b, { x: m.dir[0], z: m.dir[1] }, m.speed || 0);
    if (!prop) return;
    prop.netId = m.id;
    this._props = null;
    if (this.isClient) this._proxyProp(prop);
  }
  /** Getting into one of the town's cars: we drive it ourselves until we get out. */
  claimCar(car) {
    if (!this.isClient || car.netId == null) return;
    this._unproxyProp(car);
    this._sendTo('host', { t: 'claim', id: car.netId });
  }
  releaseCar(car) {
    if (!this.isClient || car.netId == null) return;
    const b = car.body, t = b.translation(), q = b.rotation(), v = b.linvel();
    this._sendTo('host', { t: 'unclaim', id: car.netId, p: [t.x, t.y, t.z, q.x, q.y, q.z, q.w], v: [v.x, v.y, v.z] });
    this._proxyProp(car);
  }
}
