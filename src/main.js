import './style.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
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

const NPC_COUNT = 26;

async function main() {
  const pauseMsg = document.getElementById('pauseMsg');
  await initPhysics();

  // ---------- renderer ----------
  const app = document.getElementById('app');
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
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
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.3, 0.45, 1.6);
  composer.addPass(bloom);
  const grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, time: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float time; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      void main(){
        vec3 c = texture2D(tDiffuse, vUv).rgb;
        float l = dot(c, vec3(0.299,0.587,0.114));
        c = mix(vec3(l), c, 0.92);                                   // slightly less saturated
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
  game.cam = new CameraRig(camera, game);
  game.cam.yaw = 0;
  game.wheel = new WeaponWheel();
  game.hud = new Hud(game);
  game.journal = new Journal(game);
  game.giverName = (id) => (SPECIAL_NPCS.find((s) => s.id === id) || {}).name || 'someone';
  window.__game = game; // handy for debugging in the console

  // ---------- save / load ----------
  const saved = loadSave();
  if (saved) {
    game.dialogue.load(saved);
    game.quests.load(saved.quests);
    if (saved.weapon) game.player.equip(saved.weapon);
    if (saved.hatFound) game.world.hat.collected = true;
  }
  if (game.world.hat.collected) { game.world.hat.mesh.visible = false; game.world.hat.ring.visible = false; }
  let saveTimer = null;
  const doSave = () => {
    writeSave({
      ...game.dialogue.serialize(), quests: game.quests.serialize(),
      weapon: game.player.weaponId, hatFound: !!game.world.hat.collected,
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
      if (game.world.houses.some((h) => Math.abs(x - h.x) < h.w / 2 + 2 && Math.abs(z - h.z) < h.d / 2 + 2)) continue;
      return [x, z];
    }
    return [20, -25];
  };
  for (const s of SPECIAL_NPCS) {
    let x, z;
    if (s.home === 'bakery') { x = game.world.bakery.x; z = game.world.bakery.z; } else [x, z] = s.home;
    const npc = new NPC(game, { ...s, special: true }, x, z, Math.random() * 6);
    game.npcs.push(npc);
  }
  let pi = 0;
  while (game.npcs.length < NPC_COUNT) {
    const [x, z] = spawnFree();
    const p = PERSONALITIES[pi++ % PERSONALITIES.length];
    game.npcs.push(new NPC(game, { id: 'crowd' + pi, personality: p.id }, x, z, Math.random() * 6));
  }
  game.npcByRagdoll = new Map(game.npcs.map((n) => [n.ragdoll, n]));

  // ---------- hooks ----------
  game.quests.onToast = (t, kind) => { game.hud.toast(t, kind); if (kind === 'quest') sfx.accept(); };
  game.quests.onChange = () => { game.hud.refreshQuests(); game.npcs.forEach((n) => n.updateTag()); game.journal.render(); queueSave(); };
  game.quests.onUnlock = (ids) => {
    const added = game.dialogue.unlock(ids);
    if (added.length) { game.hud.unlockToast(added); game.hud.toast('Press J to put new lines on your hotbar!', ''); sfx.unlock(); }
  };
  game.dialogue.onChange = () => { game.hud.refreshHotbar(); game.journal.render(); queueSave(); };
  game.hud.setWeapon(game.player.weaponId);
  game.hud.setCamMode('third');
  game.hud.refreshHotbar();
  game.hud.refreshQuests();
  game.npcs.forEach((n) => n.updateTag());

  // ---------- hit handling ----------
  game.hitRagdoll = (ragdoll, part, dir, strength, stun, source, weaponId) => {
    const owner = ragdoll.owner;
    const byPlayer = source === game.player;
    if (owner instanceof NPC && byPlayer) owner.lastHitByPlayer = game.time;
    const ko = ragdoll.hit(part, dir, strength, stun, source);
    if (owner instanceof NPC) {
      owner.onHit(ko, byPlayer ? 'player' : 'npc');
      if (byPlayer && weaponId === 'axe') game.quests.emit('axeHit');
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
    if (pr.mode === 'limp') return;
    const line = LINE_BY_ID[id];
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
    game.quests.emit('sayTo', { key: best.personality.id });
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
  function nearestInteractable() {
    const pp = game.player.ragdoll.getPos(new THREE.Vector3());
    let best = null, bd = INTERACT_RANGE;
    for (const n of game.npcs) {
      if (n.knockedOut()) continue;
      const d = Math.hypot(n.pos.x - pp.x, n.pos.z - pp.z);
      const pri = (n.isGiver || n.isBaker) ? 0.6 : 1;
      if (d * pri < bd) { bd = d * pri; best = n; }
    }
    return best;
  }
  function promptFor(n) {
    if (!n) return '';
    if (n.isGiver) {
      const q = game.quests.forGiver(n.id);
      const s = game.quests.state[q.id].status;
      if (s === 'available') return `E: ${n.name} has a quest (${q.title})`;
      if (s === 'ready') return `E: turn in "${q.title}"`;
    }
    return `E: talk to ${n.name}`;
  }
  function interact() {
    const n = nearestInteractable();
    if (!n) return;
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
    if (n.isBaker) {
      game.quests.emit('talkBaker');
      n.say(n.recentlyHit() ? 'You again? After what you did?!' : ['Hmph. Bread is not ready yet.', 'What do you want? I am busy kneading.', 'Grr. Fresh loaves at dawn. Not now.'][Math.floor(Math.random() * 3)], 3.2);
    } else {
      const r = pickReply('hello', n.pIndex, n.recentlyHit(), false);
      n.say(r.text, 3);
      if (r.action !== 'none') n.react(r.action);
    }
  }

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
      if (!e.repeat && !game.paused && !game.wheel.open) { resumeAudio(); game.wheel.show(game.player.weaponId); }
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
    const order = ['axe', 'sword', 'gun'];
    const i = order.indexOf(game.player.weaponId);
    game.player.equip(order[(i + (e.deltaY > 0 ? 1 : 2)) % 3]);
  }, { passive: true });
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    labelRenderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  // ---------- fixed step ----------
  let hatMsgCooldown = 0;
  function step() {
    const dt = FIXED_DT;
    game.time += dt;
    game.faceCamTimer = Math.max(0, game.faceCamTimer - dt);
    // player
    game.player.brain(dt, game.input, game.cam);
    if (game.input.mouseHeld && !game.wheel.open) game.player.tryAttack();
    game.player.update(dt);
    // npcs
    for (const n of game.npcs) { n.brain(dt); n.update(dt); }
    game.physics.step();
    // timers
    for (let i = game.timers.length - 1; i >= 0; i--) {
      const t = game.timers[i]; t.t -= dt;
      if (t.t <= 0) { game.timers.splice(i, 1); t.fn(); }
    }
    // world triggers
    const pp = game.player.ragdoll.getPos(tmpA);
    if (Math.hypot(pp.x - LIGHTHOUSE_POS.x, pp.z - LIGHTHOUSE_POS.z) < 10) game.quests.emit('lighthouse');
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

  // ---------- main loop ----------
  let acc = 0, last = performance.now(), frame = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    let dt = (now - last) / 1000; last = now;
    dt = Math.min(dt, 0.1);
    if (!game.paused) {
      acc += dt;
      let steps = 0;
      while (acc >= FIXED_DT && steps < 5) { step(); acc -= FIXED_DT; steps++; }
      if (steps >= 5) acc = 0;
      game.world.update(dt, game.time, game.player.ragdoll.getPos(tmpA));
      game.effects.update(dt);
      game.speech.update(dt);
    }
    game.player.ragdoll.sync();
    for (const n of game.npcs) n.ragdoll.sync();
    game.cam.update(game.paused ? 0.016 : dt);
    if ((frame++ % 12) === 0) {
      game.npcs.forEach((n) => n.updateTag());
      game.hud.setPrompt(game.paused ? '' : promptFor(nearestInteractable()));
    }
    grade.uniforms.time.value = (game.time * 60) % 1000;
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

