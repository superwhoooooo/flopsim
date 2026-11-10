// Animal skins. Each one is a full re-skin of the ragdoll (fur colours, ears, snout/beak, tail) plus its own traits:
//   passive modifiers (speed, jump, punch power, double jump, flutter, auto-hop) and one Q ability.
// B cycles skins, Q uses the ability. NPCs in the crowd also wear these skins (cosmetic only).
import * as THREE from 'three';
import { getMat } from './ragdoll.js';
import { sfx } from './audio.js';

const fur = { roughness: 0.95 };

function put(parent, geo, color, x, y, z, { rx = 0, ry = 0, rz = 0, opts = fur } = {}) {
  const m = new THREE.Mesh(geo, getMat(color, opts));
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true;
  parent.add(m);
  return m;
}
const ell = (rx, ry, rz) => new THREE.SphereGeometry(1, 14, 10).scale(rx, ry, rz);

// ---- face / tail decorations (head local: +Z forward, +Y up, radius ~0.15) ----
function humanCap(head) {
  put(head, new THREE.SphereGeometry(0.16, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xffc107, 0, 0.04, 0, { opts: { roughness: 0.7 } });
  put(head, new THREE.BoxGeometry(0.16, 0.02, 0.14), 0xffc107, 0, 0.07, 0.17, { opts: { roughness: 0.7 } });
}
function tail(r, parts, color) {       // parts: [[x,y,z,sx,sy,sz,rx,rz]...] in pelvis space
  for (const [x, y, z, sx, sy, sz, rx = 0, rz = 0] of parts) {
    const m = new THREE.Mesh(ell(sx, sy, sz), getMat(color, fur));
    m.position.set(x, y, z); m.rotation.set(rx, 0, rz); m.castShadow = true;
    r.addExtra('pelvis', m);
  }
}
const decorators = {
  dog(head, r) {
    put(head, ell(0.062, 0.05, 0.085), 0xe8cfa8, 0, -0.045, 0.145);                       // muzzle
    put(head, ell(0.02, 0.014, 0.016), 0x151515, 0, -0.03, 0.225);                         // nose
    for (const s of [-1, 1]) put(head, ell(0.035, 0.1, 0.05), 0x5e3a1c, s * 0.135, 0.03, -0.01, { rz: s * 0.35 }); // floppy ears
    put(head, ell(0.05, 0.012, 0.01), 0x3a2410, 0, 0.065, 0.14);                           // brow patch
    tail(r, [[0, 0.02, -0.2, 0.035, 0.035, 0.12, -0.7], [0, 0.14, -0.3, 0.03, 0.03, 0.1, -0.2]], 0xc08a52);
  },
  cat(head, r) {
    put(head, ell(0.05, 0.04, 0.06), 0xf6e8d4, 0, -0.045, 0.125);
    put(head, ell(0.014, 0.01, 0.01), 0xd9778a, 0, -0.025, 0.18);
    for (const s of [-1, 1]) {
      put(head, new THREE.ConeGeometry(0.055, 0.12, 4), 0xe08a3c, s * 0.09, 0.15, 0, { rz: -s * 0.22 });
      put(head, new THREE.ConeGeometry(0.03, 0.07, 4), 0xe6a0b0, s * 0.09, 0.14, 0.02, { rz: -s * 0.22 });
      for (const k of [-1, 0, 1]) put(head, new THREE.BoxGeometry(0.1, 0.003, 0.003), 0xf2f2f2, s * 0.11, -0.04 + k * 0.014, 0.14, { rz: s * k * 0.15 });
    }
    for (const s of [-1, 1]) put(head, ell(0.012, 0.03, 0.012), 0x1a1a1a, s * 0.052, 0.025, 0.141);   // slit pupils
    tail(r, [[0, 0.0, -0.2, 0.03, 0.03, 0.1, -0.5], [0, 0.14, -0.3, 0.028, 0.14, 0.028], [0.03, 0.34, -0.3, 0.028, 0.1, 0.028, 0, 0.5]], 0xe08a3c);
  },
  bunny(head, r) {
    put(head, ell(0.05, 0.04, 0.06), 0xffffff, 0, -0.04, 0.125);
    put(head, ell(0.014, 0.01, 0.01), 0xd9778a, 0, -0.02, 0.18);
    put(head, new THREE.BoxGeometry(0.018, 0.026, 0.006), 0xffffff, 0, -0.07, 0.172, { opts: { roughness: 0.4 } });   // buck teeth
    for (const s of [-1, 1]) {
      put(head, ell(0.035, 0.17, 0.018), 0xf4f0ea, s * 0.06, 0.28, -0.03, { rz: -s * 0.12 });
      put(head, ell(0.02, 0.13, 0.01), 0xf0b4c0, s * 0.06, 0.28, -0.014, { rz: -s * 0.12 });
      put(head, ell(0.04, 0.035, 0.03), 0xf4f0ea, s * 0.075, -0.04, 0.115);          // cheeks
    }
    tail(r, [[0, 0.0, -0.19, 0.06, 0.06, 0.06]], 0xffffff);
  },
  chicken(head, r) {
    put(head, new THREE.ConeGeometry(0.035, 0.09, 8), 0xf5a623, 0, -0.025, 0.2, { rx: Math.PI / 2, opts: { roughness: 0.5 } });  // beak
    put(head, ell(0.03, 0.02, 0.04), 0xf5a623, 0, -0.06, 0.16, { opts: { roughness: 0.5 } });
    for (let i = 0; i < 3; i++) put(head, ell(0.02, 0.03 + (i === 1 ? 0.015 : 0), 0.02), 0xd7263d, 0, 0.17 + (i === 1 ? 0.01 : 0), -0.04 + i * 0.045, { opts: { roughness: 0.5 } }); // comb
    put(head, ell(0.015, 0.035, 0.015), 0xd7263d, 0, -0.1, 0.17, { opts: { roughness: 0.5 } });  // wattle
    tail(r, [[-0.07, 0.07, -0.2, 0.025, 0.12, 0.05, -0.5, 0.35], [0, 0.1, -0.21, 0.025, 0.14, 0.05, -0.5], [0.07, 0.07, -0.2, 0.025, 0.12, 0.05, -0.5, -0.35]], 0xf2eee6);
  },
  gorilla(head) {
    put(head, ell(0.1, 0.085, 0.05), 0x6e5d53, 0, -0.01, 0.12, { opts: { roughness: 0.8 } });          // face
    put(head, new THREE.BoxGeometry(0.2, 0.03, 0.05), 0x231f20, 0, 0.06, 0.13);                       // brow ridge
    put(head, ell(0.085, 0.07, 0.07), 0x231f20, 0, 0.16, -0.01);                                       // crest
    for (const s of [-1, 1]) {
      put(head, ell(0.02, 0.012, 0.01), 0x15110f, s * 0.018, -0.02, 0.165);                            // nostrils
      put(head, ell(0.025, 0.035, 0.02), 0x231f20, s * 0.14, 0.0, -0.01);
    }
    put(head, new THREE.BoxGeometry(0.07, 0.008, 0.01), 0x2a1c1c, 0, -0.07, 0.165);                   // mouth
  },
  // Spider Suit: full purple mask with eight glowing lime eyes, a spider on the chest, lime boots
  spider(head, r) {
    const glow = { emissive: 0x7dff2a, emissiveIntensity: 1.4, roughness: 0.3 };
    for (const s of [-1, 1]) {
      put(head, ell(0.04, 0.03, 0.014), 0xb8ff6a, s * 0.052, 0.03, 0.142, { rz: s * -0.35, opts: glow });   // big lenses
      put(head, ell(0.018, 0.014, 0.008), 0xb8ff6a, s * 0.09, 0.07, 0.122, { opts: glow });
      put(head, ell(0.014, 0.011, 0.007), 0xb8ff6a, s * 0.03, 0.08, 0.14, { opts: glow });
      put(head, ell(0.012, 0.01, 0.006), 0xb8ff6a, s * 0.105, 0.0, 0.11, { opts: glow });
    }
    for (let i = 0; i < 3; i++) put(head, new THREE.TorusGeometry(0.152 - i * 0.012, 0.0035, 4, 28), 0x6a3a9a, 0, 0.03 + i * 0.045, 0, { rx: Math.PI / 2, opts: { roughness: 0.5 } });   // web seams
    const lime = getMat(0x8cff3a, { emissive: 0x3a8a10, roughness: 0.4 });
    const emblem = new THREE.Group();
    emblem.add(new THREE.Mesh(ell(0.035, 0.05, 0.015), lime));
    const ehead = new THREE.Mesh(ell(0.025, 0.025, 0.012), lime); ehead.position.set(0, 0.06, 0); emblem.add(ehead);
    for (const s of [-1, 1]) for (let k = 0; k < 4; k++) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.008, 0.008), lime);
      leg.position.set(s * 0.06, 0.035 - k * 0.025, 0); leg.rotation.z = s * (0.6 - k * 0.4);
      emblem.add(leg);
    }
    emblem.position.set(0, 0.02, 0.185);
    r.addExtra('torso', emblem);
  },
};

const LOOKS = {
  human: { skin: 0xf2c9a0, shirt: 0xe0442f, pants: 0x2f5fb3, boots: 0x3a2a1c, animal: false, decorate: humanCap },
  dog: { skin: 0xc08a52, shirt: 0xc08a52, pants: 0xa9763f, boots: 0x6b4423, animal: true, headScale: 1.3, shape: { w: 0.92, d: 1.25, limb: 0.9, belly: 0xe8cfa8 }, decorate: decorators.dog },
  cat: { skin: 0xe08a3c, shirt: 0xe08a3c, pants: 0xd07a30, boots: 0xf6e8d4, animal: true, headScale: 1.28, shape: { w: 0.8, d: 1.1, limb: 0.78, belly: 0xf6e8d4 }, decorate: decorators.cat },
  bunny: { skin: 0xf4f0ea, shirt: 0xf4f0ea, pants: 0xe8e2d8, boots: 0xf4f0ea, animal: true, headScale: 1.3, shape: { w: 1.0, d: 1.3, limb: 0.9, belly: 0xffffff }, decorate: decorators.bunny },
  chicken: { skin: 0xfaf8f2, shirt: 0xfaf8f2, pants: 0xe9a93b, boots: 0xe9a93b, animal: true, headScale: 1.15, shape: { w: 1.1, d: 1.35, limb: 0.55, belly: 0xfff4dc }, decorate: decorators.chicken },
  spider: { skin: 0x3a1d5c, shirt: 0x3a1d5c, pants: 0x24123c, boots: 0x8cff3a, animal: true, eyeTone: 0x111111, decorate: decorators.spider },
  gorilla: { skin: 0x2f2a2c, shirt: 0x2f2a2c, pants: 0x2a2526, boots: 0x1c1819, animal: true, headScale: 1.05, shape: { w: 1.4, d: 1.3, limb: 1.45, belly: 0x4a4042 }, decorate: decorators.gorilla },
};

export const ANIMALS = {
  human: { id: 'human', name: 'Human', icon: '\u{1F9CD}', speedMul: 1, jumpMul: 1, knockMul: 1, ability: null,
    blurb: 'No special tricks. Just you.' },
  dog: { id: 'dog', name: 'Dog', icon: '\u{1F415}', speedMul: 1.22, jumpMul: 1.05, knockMul: 1.1, ability: { name: 'Bark', cd: 2.5 },
    blurb: 'Fast sprinter. Q: BARK scares everyone nearby and knocks over the close ones.' },
  cat: { id: 'cat', name: 'Cat', icon: '\u{1F408}', speedMul: 1.1, jumpMul: 1.25, knockMul: 0.9, doubleJump: true, ability: { name: 'Pounce', cd: 1.6 },
    blurb: 'Double jump! Q: POUNCE leaps forward and claws whatever you land on.' },
  bunny: { id: 'bunny', name: 'Bunny', icon: '\u{1F407}', speedMul: 1, jumpMul: 1.5, knockMul: 1, autoHop: true, ability: { name: 'Mega hop', cd: 1.2 },
    blurb: 'Hold Space to keep bouncing. Q: MEGA HOP launches you sky high.' },
  chicken: { id: 'chicken', name: 'Chicken', icon: '\u{1F414}', speedMul: 0.95, jumpMul: 1.1, knockMul: 0.9, flutter: true, ability: { name: 'Egg bomb', cd: 1.5 },
    blurb: 'Hold Space in the air to flutter down slowly. Q: lay an EGG BOMB.' },
  gorilla: { id: 'gorilla', name: 'Gorilla', icon: '\u{1F98D}', speedMul: 0.86, jumpMul: 0.85, knockMul: 1.6, ability: { name: 'Ground pound', cd: 3.2 },
    blurb: 'Slow but hits like a truck. Q: GROUND POUND blasts everything around you.' },
  spider: { id: 'spider', name: 'Spider Suit', icon: '\u{1F577}\u{FE0F}', speedMul: 1.15, jumpMul: 1.3, knockMul: 1, locked: true, ability: { name: 'Web swing (hold)', cd: 0 },
    blurb: 'Hold Q or right mouse to shoot a web where you look: it sticks to walls, the ground, cars and people. Swing on high spots, yank people over. Release to let go. W pumps, Space reels in.' },
};
export const ANIMAL_ORDER = ['human', 'dog', 'cat', 'bunny', 'chicken', 'gorilla', 'spider'];
/** Skins everyone starts with (the rest are unlocked through discovery.js). */
export const BASE_FORMS = ANIMAL_ORDER.filter((id) => !ANIMALS[id].locked);
const hasForm = (game, id) => !ANIMALS[id].locked || !!game.discovery?.skins.has(id);
export const CROWD_ANIMALS = ['dog', 'cat', 'bunny', 'chicken', 'gorilla'];
export const lookOf = (id) => LOOKS[id] || LOOKS.human;
/** Opts for a Ragdoll constructor (used for animal NPCs). */
export const ragdollOptsFor = (id) => ({ ...LOOKS[id] });

// ---- switching ----
export function setForm(game, id, announce = true) {
  const p = game.player;
  if (!ANIMALS[id] || p.formId === id || !hasForm(game, id)) return;
  if (p.formId === 'spider') game.web?.release(false);
  p.formId = id;
  p.form = ANIMALS[id];
  p.knockMul = p.form.knockMul;
  p.abilityCd = 0;
  p.usedAir = false;
  p.ragdoll.restyle(LOOKS[id]);
  p.ragdoll.sync();
  game.hud?.setForm(p);
  game.discovery?.applyHat();
  game.discovery?.event('form', { id });
  if (announce) { game.hud?.toast(`${p.form.icon} ${p.form.name}: ${p.form.blurb}`, 'unlock'); sfx.unlock(); animalVoice(id); }
  if (announce && id === 'spider' && game.web) { game.web.quipAt = 0; game.web.quip('suitUp'); }
}
export function cycleForm(game, dir = 1) {
  const list = ANIMAL_ORDER.filter((id) => hasForm(game, id));
  const i = list.indexOf(game.player.formId);
  setForm(game, list[(i + dir + list.length) % list.length]);
}
export function animalVoice(id) {
  if (id === 'dog') sfx.bark(); else if (id === 'cat') sfx.meow(); else if (id === 'chicken') sfx.cluck();
  else if (id === 'gorilla') sfx.thump(); else if (id === 'bunny') sfx.pop();
}

// ---- abilities (Q) ----
const CLAW = { id: 'claw', range: 2.1, radius: 0.95, knock: 7, stun: 0.9, sever: 0.5 };
// Cat pounce: launched straight into a long fast arc (was a hop of 5.2 + a weak 10 m/s push that air drag mostly ate)
const POUNCE_SPEED = 22;   // m/s forward
const POUNCE_UP = 8.5;     // m/s up (normal jump is 6.4): ~1.4 s in the air, ~30 m
const _v = new THREE.Vector3();
export function useAbility(game) {
  const p = game.player, f = p.form, r = p.ragdoll;
  if (!f.ability || game.driving.active) return;
  if (r.mode !== 'active' && !(r.mode === 'recover' && r.ctrl > 0.8)) return;
  if (p.abilityCd > 0) { sfx.error(); return; }
  const pos = r.getPos(new THREE.Vector3());
  const fwd = r.getForward(new THREE.Vector3());
  const say = (t) => game.speech.say(r.anchor, t, 1.1, 'player');
  let ok = true;
  switch (f.id) {
    case 'dog': {
      sfx.bark(); say('WOOF!');
      game.cam.shake = Math.max(game.cam.shake, 0.35);
      game.effects.bonk(pos.x, 0.3, pos.z, 0.6, false);
      for (const n of game.npcs) {
        if (n.knockedOut()) continue;
        const d = Math.hypot(n.pos.x - pos.x, n.pos.z - pos.z);
        if (d > 11) continue;
        n.react('flee');
        if (d < 3.2) {
          _v.set(n.pos.x - pos.x, 0.5, n.pos.z - pos.z).normalize();
          n.ragdoll.hit('torso', _v.clone(), 7 * (1 - d / 4), 0.8, p);
        }
      }
      break;
    }
    case 'cat': {
      if (!r.grounded) { ok = false; break; }
      sfx.meow();
      // launch every body part toward where the camera looks: left/right AND up/down.
      // The camera's resting tilt (slightly down) counts as "straight ahead"; look up to fly high, down to skim low.
      const yaw = game.cam.yaw; r.yaw = r.targetYaw = yaw;
      const aim = THREE.MathUtils.clamp(game.cam.pitch + 0.2, -0.6, 1.2);
      const flat = Math.cos(aim) * POUNCE_SPEED;
      const fx = Math.sin(yaw) * flat, fz = Math.cos(yaw) * flat;
      const vy = THREE.MathUtils.clamp(Math.sin(aim) * POUNCE_SPEED + POUNCE_UP, 2.5, 26);
      for (const k of Object.keys(r.parts)) r.parts[k].body.setLinvel({ x: fx, y: vy, z: fz }, true);
      r.grounded = false; r.groundDist = 99;
      const claw = () => { if (p.form.id === 'cat') { game.combat.meleeSwing(p, CLAW); sfx.swing(true); } };
      game.timers.push({ t: 0.35, fn: claw });                 // swipe at whatever we fly past
      p.leap = { t: 3, speed: flat, onLand: claw };   // and claw what we land on
      break;
    }
    case 'bunny': {
      if (!r.grounded) { ok = false; break; }
      sfx.boing(); r.hop(14.5);
      game.effects.bonk(pos.x, 0.2, pos.z, 0.4, false);
      break;
    }
    case 'chicken': {
      sfx.cluck(); say('BAWK!');
      spawnEgg(game, pos, fwd);
      break;
    }
    case 'gorilla': {
      say('OOK!'); sfx.thump();
      let delay = 0.25;
      if (r.grounded) { r.hop(8.5); delay = 0.62; }
      else for (const k of Object.keys(r.parts)) { const b = r.parts[k].body, v = b.linvel(); b.setLinvel({ x: v.x, y: -26, z: v.z }, true); }
      game.timers.push({ t: delay, fn: () => {
        const at = r.getPos(new THREE.Vector3()); at.y = 0.15;
        game.combat.explode(at, 6, 11, p, 'pound');
        game.effects.bonk(at.x, 0.2, at.z, 2.2, false);
        sfx.thump(); game.cam.shake = Math.max(game.cam.shake, 1.0);
      } });
      break;
    }
    default: ok = false;
  }
  if (ok) p.abilityCd = f.ability.cd;
}

// ---- egg bombs ----
const EGG_RADIUS = 10;     // m (was 4.5)
const EGG_POWER = 20;      // shove strength (was 10)
const EGG_FX_SIZE = 1.8;   // size of the fireball / smoke / shockwave
function spawnEgg(game, pos, fwd) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10).scale(0.8, 1, 0.8), getMat(0xfff4dc, { roughness: 0.35 }));
  mesh.castShadow = true;
  mesh.position.set(pos.x + fwd.x * 0.6, pos.y + 0.5, pos.z + fwd.z * 0.6);
  game.scene.add(mesh);
  (game.eggs ||= []).push({ mesh, vx: fwd.x * 6, vy: 3, vz: fwd.z * 6, fuse: 1.5 });
}
export function updateAnimals(game, dt) {
  const p = game.player;
  p.abilityCd = Math.max(0, p.abilityCd - dt);
  const eggs = game.eggs;
  if (!eggs || !eggs.length) return;
  for (let i = eggs.length - 1; i >= 0; i--) {
    const e = eggs[i];
    e.fuse -= dt; e.vy -= 20 * dt;
    e.mesh.position.x += e.vx * dt; e.mesh.position.y += e.vy * dt; e.mesh.position.z += e.vz * dt;
    if (e.mesh.position.y < 0.14) { e.mesh.position.y = 0.14; e.vy = Math.abs(e.vy) * 0.3; e.vx *= 0.7; e.vz *= 0.7; }
    e.mesh.rotation.x += dt * 6;
    if (e.fuse <= 0) {
      // a BIG egg blast: wide radius, strong shove, fireball + smoke + shockwave, and a proper boom
      const at = e.mesh.position.clone();
      game.combat.explode(at, EGG_RADIUS, EGG_POWER, p, 'egg');
      game.effects.explosion(at, EGG_FX_SIZE);
      const dist = at.distanceTo(game.camera.position);
      sfx.explosion(Math.min(1, 28 / (dist + 10)));
      game.cam.shake = Math.max(game.cam.shake, Math.min(1.6, 40 / (dist + 12)));
      game.scene.remove(e.mesh); e.mesh.geometry.dispose();
      eggs.splice(i, 1);
    }
  }
}
