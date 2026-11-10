import './style.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { initPhysics, Physics, FIXED_DT } from './physics.js';
import { World, LIGHTHOUSE_POS } from './world/world.js';
import { Player } from './player.js';
import { CameraRig } from './camera.js';
import { NPC } from './npc/npc.js';
import { PERSONALITIES } from './npc/personalities.js';
import { pickReply } from './npc/reactions.js';
import { SPECIAL_NPCS } from './quests/questGivers.js';
import { SHOPKEEPERS } from './npc/shopkeepers.js';
import { Driving } from './vehicle.js';
import { WEAPONS } from './weapons/weapons.js';
import { LIMB_OF_PART } from './ragdoll.js';
import { QuestManager, QUEST_BY_ID } from './quests/quests.js';
import { DialogueState } from './dialogue/hotbar.js';
import { LINE_BY_ID } from './dialogue/lines.js';
import { Speech } from './dialogue/speech.js';
import { Effects } from './effects.js';
import { Combat } from './weapons/combat.js';
import { WeaponWheel } from './weapons/weaponWheel.js';
import { Hud } from './ui/hud.js';
import { Journal } from './ui/journal.js';
import { Input } from './input.js';
import { loadSave, writeSave } from './save.js';
import { sfx, resumeAudio } from './audio.js';
import { Abilities } from './abilities.js';
import { REALISTIC, setRealistic } from './settings.js';
import { setForm, cycleForm, useAbility, updateAnimals, CROWD_ANIMALS } from './animals.js';

const NPC_COUNT = 84;

async function main() {
  const pauseMsg = document.getElementById('pauseMsg');
  await initPhysics();

  // ---------- renderer ----------
  const app = document.getElementById('app');
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));   // adaptResolution() may raise this to 2 on fast machines
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.7;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  app.appendChild(renderer.domElement);
  const canvas = renderer.domElement;

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.domElement.style.position = 'fixed';
  labelRenderer.domElement.style.inset = '0';
  labelRenderer.domElement.style.pointerEvents = 'none';
  app.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 1500);
  scene.add(camera);

  // ---------- post-processing: MSAA render target -> subtle bloom -> tone map/output ----------
  const rt = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.addPass(new RenderPass(scene, camera));
  // ambient occlusion: soft contact shadows where things meet (benches on the ground, wall bases, under cars).
  // adaptResolution() turns it off first if the game is running slow.
  const ao = new GTAOPass(scene, camera, window.innerWidth, window.innerHeight);
  ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.6, thickness: 1.5, scale: 1.2, samples: 12 });
  ao.updatePdMaterial({ radius: 6, samples: 12 });
  ao.blendIntensity = 0.85;
  composer.addPass(ao);
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.3, 0.45, 1.6);
  composer.addPass(bloom);
  const grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, time: { value: 0 }, curve: { value: REALISTIC ? 0.18 : 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float time; uniform float curve; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      void main(){
        vec3 c = texture2D(tDiffuse, vUv).rgb;
        float l = dot(c, vec3(0.299,0.587,0.114));
        c = mix(vec3(l), c, 0.92);                                   // slightly less saturated
        vec3 lo = min(c, 1.0);                                        // (values can be HDR here: only curve the 0..1 part)
        c = mix(c, lo * lo * (3.0 - 2.0 * lo) + max(c - 1.0, 0.0), curve);  // realistic look: gentle S-curve, deeper shadows
        c *= vec3(1.04, 1.0, 0.95);                                   // warm tint
        vec2 d = vUv - 0.5; c *= 1.0 - dot(d, d) * 0.9;               // vignette
        c += (h(vUv * 900.0 + time) - 0.5) * 0.025;                   // film grain
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  // ---------- game object ----------
  const game = {
    scene, camera, renderer, physics: new Physics(), time: 0, paused: true, npcs: [], timers: [],
    faceCamTimer: 0, input: new Input(), journalOpen: false,
  };
  game.speech = new Speech();
  game.effects = new Effects(scene);
  game.world = new World(game.physics, scene, renderer);
  game.combat = new Combat(game);
  game.quests = new QuestManager();
  game.dialogue = new DialogueState();
  game.player = new Player(game, 0, -7);
  game.abilities = new Abilities(game);
  // after getting back up you get a few seconds where hits push you but can't knock you down again
  const GETUP_GRACE = 3;
  game.playerSafeUntil = 0;
  game.player.ragdoll.onGetUp = () => { game.playerSafeUntil = game.time + GETUP_GRACE; };
  game.driving = new Driving(game);
  game.cam = new CameraRig(camera, game);
  game.cam.yaw = 0;
  game.wheel = new WeaponWheel();
  game.hud = new Hud(game);
  if (REALISTIC) setTimeout(() => game.hud.toast('Realistic graphics on (V to switch back to Classic)', ''), 1500);
  game.journal = new Journal(game);
  game.giverName = (id) => (SPECIAL_NPCS.find((s) => s.id === id) || {}).name || 'someone';
  window.__game = game; // handy for debugging in the console
  game.ao = ao;          // ambient occlusion pass (toggled by adaptResolution)
  game.composer = composer; game.bloom = bloom;   // debug / profiling handles

  // ---------- save / load ----------
  const saved = loadSave();
  if (saved) {
    game.dialogue.load(saved);
    game.quests.load(saved.quests);
    if (Array.isArray(saved.weapons)) saved.weapons.forEach((w) => { if (WEAPONS[w]) game.player.owned.add(w); });
    if (saved.weapon) game.player.equip(saved.weapon);
    if (saved.hatFound) game.world.hat.collected = true;
    if (saved.form) setForm(game, saved.form, false);
  }
  game.wheel.setItems(game.player.ownedList());
  if (game.world.hat.collected) { game.world.hat.mesh.visible = false; game.world.hat.ring.visible = false; }
  let saveTimer = null;
  const doSave = () => {
    writeSave({
      ...game.dialogue.serialize(), quests: game.quests.serialize(),
      weapon: game.player.weaponId, weapons: [...game.player.owned], form: game.player.formId, hatFound: !!game.world.hat.collected,
    });
  };
  const queueSave = () => { clearTimeout(saveTimer); saveTimer = setTimeout(doSave, 250); };
  window.addEventListener('beforeunload', doSave);

  // ---------- NPCs ----------
  const spawnFree = () => {
    for (let i = 0; i < 200; i++) {
      const x = (Math.random() * 2 - 1) * 88, z = (Math.random() * 2 - 1) * 88;
      if (game.world.props.some((p) => p.kind === 'car' && Math.hypot(x - p.home.x, z - p.home.z) < 3)) continue;
      if (Math.hypot(x, z + 3) < 10) continue;
      if (Math.hypot(x - LIGHTHOUSE_POS.x, z - LIGHTHOUSE_POS.z) < 9) continue;
      if (game.world._blocked(x, z, 2)) continue;
      return [x, z];
    }
    return [20, -25];
  };
  for (const s of [...SPECIAL_NPCS, ...SHOPKEEPERS]) {
    let x, z, yaw = Math.random() * 6;
    if (s.shop) { const o = game.world.shops[s.shop].owner; x = o.x; z = o.z; yaw = o.yaw; }
    else if (s.home === 'bakery') { x = game.world.bakery.x; z = game.world.bakery.z; } else [x, z] = s.home;
    const npc = new NPC(game, { ...s, special: true }, x, z, yaw);
    if (s.shop) npc.shopYaw = yaw;
    game.npcs.push(npc);
  }
  let pi = 0;
  while (game.npcs.length < NPC_COUNT) {
    const [x, z] = spawnFree();
    const p = PERSONALITIES[pi++ % PERSONALITIES.length];
    const animal = Math.random() < 0.3 ? CROWD_ANIMALS[Math.floor(Math.random() * CROWD_ANIMALS.length)] : null;
    game.npcs.push(new NPC(game, { id: 'crowd' + pi, personality: p.id, fragile: Math.random() < 0.45, animal }, x, z, Math.random() * 6));
  }
  game.npcByRagdoll = new Map(game.npcs.map((n) => [n.ragdoll, n]));

  // ---------- hooks ----------
  game.quests.onToast = (t, kind) => { game.hud.toast(t, kind); if (kind === 'quest') sfx.accept(); };
  game.quests.onChange = () => { game.hud.refreshQuests(); game.npcs.forEach((n) => n.updateTag()); game.journal.render(); queueSave(); };
  game.quests.onUnlock = (ids) => {
    const added = game.dialogue.unlock(ids);
    if (!added.length) return;
    // abilities drop straight into the first empty hotbar slot
    for (const id of added) {
      if (!LINE_BY_ID[id].ability) continue;
      const free = game.dialogue.slots.indexOf(null);
      if (free >= 0) game.dialogue.assign(free, id);
    }
    game.hud.unlockToast(added);
    game.hud.toast(added.some((id) => LINE_BY_ID[id].ability) ? 'Press its number key to use your ability! (J to rearrange)' : 'Press J to put new lines on your hotbar!', '');
    sfx.unlock();
  };
  game.dialogue.onChange = () => { game.hud.refreshHotbar(); game.journal.render(); queueSave(); };
  game.hud.setWeapon(game.player.weaponId);
  game.hud.setForm(game.player);
  game.hud.setCamMode('third');
  game.hud.refreshHotbar();
  game.hud.refreshQuests();
  game.npcs.forEach((n) => n.updateTag());

  // ---------- hit handling ----------
  game.hitRagdoll = (ragdoll, part, dir, strength, stun, source, weaponId) => {
    const owner = ragdoll.owner;
    if (owner === game.player && game.driving.active) return false;     // nobody shoves a driver
    if (owner === game.player && game.time < game.playerSafeUntil) stun = 0;   // just got up: no chain knockdowns
    if (ragdoll.isSevered(part)) { ragdoll.hit(part, dir, strength, 0, source); return false; }   // booting a loose limb
    const byPlayer = source === game.player;
    if (byPlayer && strength >= 9) game.hitStop = Math.max(game.hitStop || 0, strength >= 16 ? 0.085 : 0.05);   // brief freeze on heavy hits
    if (owner instanceof NPC && byPlayer) { owner.lastHitByPlayer = game.time; owner.lastHitWeapon = weaponId; }
    const ko = ragdoll.hit(part, dir, strength, stun, source);
    if (owner instanceof NPC) {
      owner.onHit(ko, byPlayer ? 'player' : 'npc');
      if (byPlayer && weaponId === 'axe') game.quests.emit('axeHit');
      if (byPlayer && weaponId && weaponId !== 'body') game.quests.emit('weaponHit', { key: weaponId });
      if (byPlayer && weaponId === 'car' && ko) game.quests.emit('carKO');
      // fragile folks lose a limb when a limb takes a solid hit
      const limb = LIMB_OF_PART[part];
      if (limb && owner.fragile && strength >= 3 && !ragdoll.severed.has(limb)) {
        const base = weaponId === 'car' ? 0.3 : (WEAPONS[weaponId]?.sever ?? 0);
        if (Math.random() < base * Math.min(1.4, strength / 8)) ragdoll.sever(limb, dir, 2.5 + strength * 0.25);
      }
    } else if (owner === game.player) {
      game.cam.shake = Math.max(game.cam.shake, 0.7);
      if (ko) game.speech.say(ragdoll.anchor, 'Oof!', 1.5, 'player');
    }
    return ko;
  };

  // ---------- dialogue ----------
  const tmpA = new THREE.Vector3();
  game.sayLine = (slot) => {
    const id = game.dialogue.lineAt(slot);
    const pr = game.player.ragdoll;
    if (!id) { game.hud.toast('That hotbar slot is empty. Press J to equip a line!', ''); sfx.error(); return; }
    if (pr.mode === 'limp' || game.driving.active) return;
    const line = LINE_BY_ID[id];
    if (line.ability) { if (game.abilities.use(line.ability)) game.hud.flashSlot(slot); return; }
    game.hud.flashSlot(slot);
    game.speech.say(pr.anchor, line.text, 2.6, 'player');
    sfx.blip(300);
    // pick the nearest NPC in front of us (within ~6 m)
    const pp = pr.getPos(tmpA);
    const fwd = game.cam.flatForward(new THREE.Vector3());
    let best = null, bd = 1e9;
    for (const n of game.npcs) {
      const np = n.pos;
      const dx = np.x - pp.x, dz = np.z - pp.z;
      const d = Math.hypot(dx, dz);
      if (d > 6.2 || d < 0.01) continue;
      const dot = (dx * fwd.x + dz * fwd.z) / d;
      if (dot < 0.35) continue;
      const score = d * (2 - dot);
      if (score < bd) { bd = score; best = n; }
    }
    if (!best) return;
    game.faceCamTimer = 0.0;
    game.quests.emit('sayTo', { key: best.personality.id, npc: best.id });
    if (best.isBaker) game.quests.emit('talkBaker');
    const ko = best.knockedOut();
    const reply = pickReply(id, best.pIndex, best.recentlyHit(), ko);
    const fire = () => {
      best.say(reply.text, 3);
      if (!ko) {
        const p2 = pr.getPos(new THREE.Vector3());
        best._faceToward(p2.x, p2.z);
        best.react(reply.action === 'none' ? 'chat' : reply.action);
      }
    };
    if (ko) fire(); else game.timers.push({ t: 0.9, fn: fire });
  };

  // ---------- interaction (E) ----------
  const INTERACT_RANGE = 3.4;
  const ownerOf = (shopKey) => game.npcs.find((n) => n.def.shop === shopKey);
  const hasPermit = (p) => {
    const sh = game.world.shops[p.shop], o = ownerOf(p.shop);
    return !o || o.knockedOut() || game.time < (sh.permitUntil || 0);
  };
  function nearestInteractable() {
    if (game.driving.active) return { type: 'exit' };
    const pp = game.player.ragdoll.getPos(new THREE.Vector3());
    for (const p of game.world.pickups) {
      if (p.taken || !p.shop) continue;
      if (Math.hypot(p.x - pp.x, p.z - pp.z) < 3.0) return { type: 'item', p };
    }
    const car = game.driving.nearestCar(pp.x, pp.z, 1.7);
    if (car && game.driving.distanceTo(car, pp.x, pp.z) < 1.1) return { type: 'car', car };   // hugging a car: it wins
    let best = null, bd = INTERACT_RANGE;
    for (const n of game.npcs) {
      if (n.knockedOut()) continue;
      const d = Math.hypot(n.pos.x - pp.x, n.pos.z - pp.z);
      const pri = (n.isGiver || n.isBaker || n.isShop) ? 0.6 : 1;
      if (d * pri < bd) { bd = d * pri; best = n; }
    }
    if (best) return { type: 'npc', n: best };
    return car ? { type: 'car', car } : null;
  }
  function promptFor(t) {
    if (!t) return '';
    if (t.type === 'exit') return 'E: get out';
    if (t.type === 'car') return t.car.wrecked ? 'Wrecked car' : 'E: drive this car (Z inside: blow it up)';
    if (t.type === 'item') {
      const w = WEAPONS[t.p.id];
      const owned = game.player.owned.has(t.p.id) ? ' (you already have one)' : '';
      return hasPermit(t.p) ? `E: take the ${w.name}${owned}` : `E: ask ${ownerOf(t.p.shop).name} about the ${w.name}`;
    }
    const n = t.n;
    if (n.isGiver) {
      const q = game.quests.forGiver(n.id);
      const s = game.quests.state[q.id].status;
      if (s === 'available') return `E: ${n.name} has a quest (${q.title})`;
      if (s === 'ready') return `E: turn in "${q.title}"`;
    }
    return n.isShop ? `E: browse ${n.name}'s shop` : `E: talk to ${n.name}`;
  }
  function grabWeapon(id, announce = true) {
    const isNew = game.player.pickup(id);
    sfx.hat();
    if (announce) game.hud.toast(isNew ? `You got the ${WEAPONS[id].name}! (hold Tab to switch)` : `${WEAPONS[id].name} - already have it, now equipped`, isNew ? 'unlock' : '');
    queueSave();
  }
  function interact() {
    const t = nearestInteractable();
    if (!t) return;
    if (t.type === 'exit') { game.driving.exit(); return; }
    if (t.type === 'car') { game.driving.enter(t.car); return; }
    if (t.type === 'item') {
      const o = ownerOf(t.p.shop), sh = game.world.shops[t.p.shop];
      if (!hasPermit(t.p)) {
        const def = o.def;
        sh.permitUntil = game.time + 120;
        o._faceToward(game.player.ragdoll.getPos(new THREE.Vector3()).x, game.player.ragdoll.getPos(new THREE.Vector3()).z);
        o.say(def.permit, 3);
        return;
      }
      game.world.takePickup(t.p);
      grabWeapon(t.p.id);
      return;
    }
    const n = t.n;
    const q = n.isGiver ? game.quests.forGiver(n.id) : null;
    const turnToPlayer = () => { const p = game.player.ragdoll.getPos(new THREE.Vector3()); n._faceToward(p.x, p.z); n.react('chat'); };
    if (q) {
      const s = game.quests.state[q.id].status;
      turnToPlayer();
      if (s === 'available') { n.say(q.offer, 5); game.quests.accept(q.id); }
      else if (s === 'active') n.say(q.waiting, 3.5);
      else if (s === 'ready') { n.say(q.ready, 4); game.quests.turnIn(q.id); n.react('wave'); }
      else n.say('Thanks again, friend!', 2.5);
      return;
    }
    turnToPlayer();
    if (n.isShop) {
      game.world.shops[n.def.shop].permitUntil = game.time + 120;
      n.say(n.recentlyHit() ? 'You again?! Get out of my shop!' : n.def.greet[Math.floor(Math.random() * n.def.greet.length)], 3.6);
    } else if (n.isBaker) {
      game.quests.emit('talkBaker');
      n.say(n.recentlyHit() ? 'You again? After what you did?!' : ['Hmph. Bread is not ready yet.', 'What do you want? I am busy kneading.', 'Grr. Fresh loaves at dawn. Not now.'][Math.floor(Math.random() * 3)], 3.2);
    } else {
      const r = pickReply('hello', n.pIndex, n.recentlyHit(), false);
      n.say(r.text, 3);
      if (r.action !== 'none') n.react(r.action);
    }
  }

  game.interact = interact; game.nearestInteractable = nearestInteractable; game.promptFor = promptFor;   // handy for debugging

  // ---------- pause / pointer lock / journal ----------
  const pauseEl = document.getElementById('pause');
  const setPauseUI = (show, msg) => { pauseEl.classList.toggle('show', show); if (msg) pauseMsg.textContent = msg; };
  const locked = () => document.pointerLockElement === canvas;
  game.toggleJournal = (v) => {
    game.journalOpen = v;
    game.journal.show(v);
    if (v) {
      game.paused = true;
      game.input.clear();
      if (game.wheel.open) game.wheel.hide();
      try { document.exitPointerLock(); } catch (e) { /* ignore */ }
      setPauseUI(false);
    } else {
      game.journal.selected = null;
      requestLock();
      if (!locked()) { setPauseUI(true, 'Paused - click to resume'); }
    }
  };
  function requestLock() {
    resumeAudio();
    try {
      const p = canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => { game.paused = false; setPauseUI(false); });
    } catch (e) { game.paused = false; setPauseUI(false); }
  }
  document.addEventListener('pointerlockchange', () => {
    if (locked()) { game.paused = false; setPauseUI(false); }
    else if (!game.journalOpen) {
      game.paused = true; game.input.clear();
      if (game.wheel.open) game.wheel.hide();
      setPauseUI(true, 'Paused - click to resume');
    }
  });
  document.addEventListener('pointerlockerror', () => { game.paused = false; setPauseUI(false); });
  pauseEl.addEventListener('click', () => requestLock());
  canvas.addEventListener('click', () => { if (!locked() && !game.journalOpen) requestLock(); });
  window.addEventListener('blur', () => { game.input.clear(); if (game.wheel.open) game.wheel.hide(); });

  // ---------- input ----------
  const DIGITS = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Digit6: 5, Digit7: 6, Digit8: 7, Digit9: 8, Digit0: 9,
    Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3, Numpad5: 4, Numpad6: 5, Numpad7: 6, Numpad8: 7, Numpad9: 8, Numpad0: 9 };
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Tab') {
      e.preventDefault();
      if (!e.repeat && !game.paused && !game.wheel.open && !game.driving.active) { resumeAudio(); game.wheel.show(game.player.weaponId); }
      return;
    }
    if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    if (e.code === 'KeyJ') { game.toggleJournal(!game.journalOpen); return; }
    if (e.code === 'Escape') {
      if (game.journalOpen) game.toggleJournal(false);
      return;
    }
    if (game.paused) return;
    game.input.keys.add(e.code);
    if (e.code in DIGITS) game.sayLine(DIGITS[e.code]);
    else if (e.code === 'KeyE') interact();
    else if (e.code === 'KeyB') { if (!game.driving.active) { cycleForm(game, e.shiftKey ? -1 : 1); queueSave(); } }
    else if (e.code === 'KeyQ') useAbility(game);
    else if (e.code === 'KeyG') game.cycleQuality();
    else if (e.code === 'KeyV') {   // switch Classic <-> Realistic graphics: save, then reload so the city is rebuilt
      setRealistic(!REALISTIC);
      game.hud.toast(`Switching to ${REALISTIC ? 'Classic' : 'Realistic'} graphics...`, 'unlock');
      doSave();
      setTimeout(() => location.reload(), 400);
    }
    else if (e.code === 'KeyK') game.cam.setMode('third');
    else if (e.code === 'KeyL') game.cam.setMode('first');
  });
  window.addEventListener('keyup', (e) => {
    game.input.keys.delete(e.code);
    if (e.code === 'Tab') {
      e.preventDefault();
      if (game.wheel.open) { const c = game.wheel.hide(); if (c) game.player.equip(c); }
    }
  });
  window.addEventListener('mousemove', (e) => {
    if (!locked() || game.paused) return;
    if (game.wheel.open) game.wheel.move(e.movementX, e.movementY);
    else game.cam.look(e.movementX, e.movementY);
  });
  window.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || !locked() || game.paused || game.wheel.open) return;
    game.input.mouseHeld = true;
    game.player.tryAttack();
  });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) game.input.mouseHeld = false; });
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('wheel', (e) => {
    if (!locked() || game.paused || game.wheel.open) return;
    if (game.driving.active) return;
    const order = game.player.ownedList(), n = order.length;
    const i = order.indexOf(game.player.weaponId);
    game.player.equip(order[(i + (e.deltaY > 0 ? 1 : n - 1)) % n]);
  }, { passive: true });
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    labelRenderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  // ---------- physics LOD: only NPCs near the player (and quest / shop folks nearby) are simulated ----------
  const ACTIVE_MAX = 20, ACTIVE_R = 38, KEEP_R = 46, SPECIAL_R = 60;
  const lodTmp = new THREE.Vector3();
  function updateNpcLod() {
    const pp = game.player.ragdoll.getPos(lodTmp);
    const ranked = [];
    for (const n of game.npcs) {
      const p = n.ragdoll.getPos(tmpA);
      n._lodD = Math.hypot(p.x - pp.x, p.z - pp.z);
      if (n.def.special) n.setDormant(n._lodD > SPECIAL_R);
      else ranked.push(n);
    }
    ranked.sort((a, b) => a._lodD - b._lodD);
    ranked.forEach((n, i) => {
      const keep = n.dormant ? (i < ACTIVE_MAX && n._lodD < ACTIVE_R) : (i < ACTIVE_MAX + 4 && n._lodD < KEEP_R);
      n.setDormant(!keep);
    });
  }

  // ---------- fixed step ----------
  let hatMsgCooldown = 0, lodTick = 0;
  function step() {
    const dt = FIXED_DT;
    game.time += dt;
    game.faceCamTimer = Math.max(0, game.faceCamTimer - dt);
    // player
    if (game.driving.active) game.driving.step(dt, game.input);
    else {
      game.player.brain(dt, game.input, game.cam);
      if (game.input.mouseHeld && !game.wheel.open) game.player.tryAttack();
      game.player.update(dt);
    }
    updateAnimals(game, dt);
    // npcs
    if ((lodTick++ % 20) === 0) updateNpcLod();
    for (const n of game.npcs) { if (n.dormant) continue; n.brain(dt); n.update(dt); }
    game.physics.step();
    game.abilities.step(dt);
    if (!game.driving.active) game.combat.bladeContact(game.player, dt);
    // timers
    for (let i = game.timers.length - 1; i >= 0; i--) {
      const t = game.timers[i]; t.t -= dt;
      if (t.t <= 0) { game.timers.splice(i, 1); t.fn(); }
    }
    // world triggers
    const pp = game.player.ragdoll.getPos(tmpA);
    if (Math.hypot(pp.x - LIGHTHOUSE_POS.x, pp.z - LIGHTHOUSE_POS.z) < 10) game.quests.emit('lighthouse');
    if (!game.driving.active) {
      for (const p of game.world.pickups) {
        if (p.taken || p.shop) continue;
        if (Math.hypot(p.x - pp.x, p.z - pp.z) < 1.5) { game.world.takePickup(p); grabWeapon(p.id); }
      }
    }
    const hat = game.world.hat;
    hatMsgCooldown -= dt;
    if (!hat.collected && Math.hypot(pp.x - hat.pos.x, pp.z - hat.pos.z) < 2.3) {
      if (game.quests.state.hat.status === 'active') {
        hat.collected = true; hat.mesh.visible = false; hat.ring.visible = false;
        game.hud.toast('You found the lost hat!', 'quest'); sfx.hat();
        game.quests.emit('hatFound'); queueSave();
      } else if (hatMsgCooldown <= 0) {
        hatMsgCooldown = 8;
        game.hud.toast('A fancy pink hat... maybe somebody is looking for it? (Try Diva Dolores)', '');
      }
    }
  }

  // ---------- adaptive resolution: trade pixels for framerate on slower GPUs ----------
  const MAX_PR = Math.min(window.devicePixelRatio, 2), MIN_PR = Math.min(1, MAX_PR);   // never below native resolution: no blur / pixelation
  let curPR = Math.min(MAX_PR, 1.5), frameAcc = 0, frameN = 0, lastAdapt = 0, prevNow = 0;
  // ---------- graphics quality ----------
  // Auto mode steps down when frames are slow (after resolution is already at native) and back up when there's
  // headroom; the level that works is remembered for next time. G cycles Auto / Low / Medium / High by hand.
  const QUALITY = [
    { name: 'Low', ao: false, bloom: false, msaa: 0, shadowSize: 1024, shadowRange: 35, shadowEvery: 2, npcDist: 55, npcShadow: 14 },
    { name: 'Medium', ao: false, bloom: true, msaa: 2, shadowSize: 2048, shadowRange: 50, shadowEvery: 2, npcDist: 85, npcShadow: 24 },
    { name: 'High', ao: true, bloom: true, msaa: 4, shadowSize: 4096, shadowRange: 60, shadowEvery: 1, npcDist: 130, npcShadow: 35 },
  ];
  const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } return null; };
  let qAuto = store('flopsim-quality-mode') !== 'manual';
  let qLevel = Number(store('flopsim-quality-level') ?? NaN);
  if (!(qLevel >= 0 && qLevel <= 2)) qLevel = (navigator.hardwareConcurrency || 4) >= 8 ? 2 : 1;   // first run: guess from CPU cores
  let lastQDrop = -1e9;
  game.quality = QUALITY[qLevel];
  function applyQuality(i) {
    qLevel = i; const Q = game.quality = QUALITY[i];
    ao.enabled = Q.ao && REALISTIC; bloom.enabled = Q.bloom;   // ambient occlusion is part of the realistic look
    for (const t of [composer.renderTarget1, composer.renderTarget2]) if (t.samples !== Q.msaa) { t.samples = Q.msaa; t.dispose(); }
    const sun = game.world.sun, sc = sun.shadow.camera;
    if (sun.shadow.mapSize.x !== Q.shadowSize) { sun.shadow.mapSize.set(Q.shadowSize, Q.shadowSize); sun.shadow.map?.dispose(); sun.shadow.map = null; }
    sc.left = sc.bottom = -Q.shadowRange; sc.right = sc.top = Q.shadowRange; sc.updateProjectionMatrix();
    renderer.shadowMap.needsUpdate = true;
    store('flopsim-quality-level', String(i));
  }
  applyQuality(qLevel);
  renderer.shadowMap.autoUpdate = false;   // the loop asks for shadow updates (every frame, or every other frame on lower settings)
  game.cycleQuality = () => {   // G: Auto -> Low -> Medium -> High -> Auto
    if (qAuto) { qAuto = false; applyQuality(0); } else if (qLevel < 2) applyQuality(qLevel + 1); else qAuto = true;
    store('flopsim-quality-mode', qAuto ? 'auto' : 'manual');
    game.hud.toast(`Graphics: ${qAuto ? 'Auto (now ' + QUALITY[qLevel].name + ')' : QUALITY[qLevel].name}`, '');
  };

  function adaptResolution(now) {
    if (game.paused) { prevNow = 0; return; }
    if (prevNow) { frameAcc += now - prevNow; frameN++; }
    prevNow = now;
    if (now - lastAdapt < 1500 || frameN < 20) return;
    const avg = frameAcc / frameN; frameAcc = 0; frameN = 0; lastAdapt = now;
    let want = curPR;
    if (qAuto) {
      if (avg > 30 && curPR <= MIN_PR && qLevel > 0) { applyQuality(qLevel - 1); lastQDrop = now; return; }   // slow at native res: lower quality
      if (avg < 12 && qLevel < 2 && now - lastQDrop > 20000) { applyQuality(qLevel + 1); return; }          // lots of headroom: try higher
    }
    if (avg > 30) want = Math.max(MIN_PR, curPR - 0.25);          // slower than ~33 fps: drop toward native (never below)
    else if (avg < 14.5 && curPR < MAX_PR) want = Math.min(MAX_PR, curPR + 0.1);   // comfortably fast: win some back
    if (want !== curPR) {
      curPR = want;
      renderer.setPixelRatio(curPR);
      composer.setPixelRatio(curPR);
      composer.setSize(window.innerWidth, window.innerHeight);
      renderer.setSize(window.innerWidth, window.innerHeight);
    }
  }

  // ---------- main loop ----------
  let acc = 0, last = performance.now(), frame = 0;
  const frustum = new THREE.Frustum(), projScreen = new THREE.Matrix4(), cullSphere = new THREE.Sphere(), tmpB = new THREE.Vector3();
  function loop(now) {
    requestAnimationFrame(loop);
    let dt = (now - last) / 1000; last = now;
    dt = Math.min(dt, 0.1);
    if (!game.paused) {
      if (game.hitStop > 0) { game.hitStop -= dt; dt = 0; }
      acc += dt;
      let steps = 0;
      const t0 = performance.now();
      // never spend more than ~22 ms of a frame on physics: slow-motion beats a death spiral of catch-up steps
      while (acc >= FIXED_DT && steps < 4 && (steps === 0 || performance.now() - t0 < 22)) { step(); acc -= FIXED_DT; steps++; }
      if (acc >= FIXED_DT) acc = 0;
      game.world.update(dt, game.time, game.player.ragdoll.getPos(tmpA));
      game.effects.update(dt);
      game.speech.update(dt);
    }
    game.player.ragdoll.sync();
    game.abilities.sync();
    game.cam.update(game.paused ? 0.016 : dt);
    // sprint FOV kick
    const sp = game.driving.active ? 0 : game.player.ragdoll.speedNorm;
    const wantFov = (game.cam.mode === 'first' ? 78 : 70) + sp * sp * 7;
    if (Math.abs(camera.fov - wantFov) > 0.05) { camera.fov += (wantFov - camera.fov) * Math.min(1, dt * 6 + 0.02); camera.updateProjectionMatrix(); }
    // NPC culling: only sync + draw crowd members that are near or on screen
    camera.updateMatrixWorld();
    projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projScreen);
    for (const n of game.npcs) {
      const p = n.ragdoll.getPos(tmpB);
      const d = p.distanceTo(camera.position);
      const far = game.quality.npcDist;   // beyond this they're lost in the haze anyway
      const vis = d < 22 || (d < (n.dormant ? Math.min(115, far) : far) && frustum.intersectsSphere(cullSphere.set(p, 4)));
      n.ragdoll.group.visible = vis;
      // only nearby people cast shadows (a far-off person's shadow is a few pixels but costs a whole extra draw)
      const cast = vis && d < game.quality.npcShadow;
      if (n._cast !== cast) {
        n._cast = cast;
        n._casters ||= (() => { const a = []; n.ragdoll.group.traverse((o) => { if (o.isMesh && o.castShadow) a.push(o); }); return a; })();
        for (const m of n._casters) m.castShadow = cast;
      }
      if (n.dormant) continue;                 // frozen: its pose was synced when it went dormant
      if (vis) n.ragdoll.sync(); else n.ragdoll.syncAnchor();
    }
    if ((frame++ % 12) === 0) {
      game.npcs.forEach((n) => n.updateTag());
      game.hud.setPrompt(game.paused ? '' : promptFor(nearestInteractable()));
      game.hud.tickForm(game.player);
    }
    grade.uniforms.time.value = (game.time * 60) % 1000;
    adaptResolution(now);
    if (frame % game.quality.shadowEvery === 0) renderer.shadowMap.needsUpdate = true;
    composer.render();
    labelRenderer.render(scene, camera);
  }

  // initial placement of the camera, then show "click to play"
  game.player.ragdoll.sync();
  for (const n of game.npcs) n.ragdoll.sync();
  game.cam.update(0.016);
  setPauseUI(true, 'Click to play');
  requestAnimationFrame((t) => { last = t; loop(t); });
}

main().catch((err) => {
  console.error(err);
  const m = document.getElementById('pauseMsg');
  if (m) m.textContent = 'Failed to start: ' + (err && err.message ? err.message : err);
});

