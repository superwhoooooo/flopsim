// Six NPC archetypes. Order matters: reactions.js indexes by this order.
export const PERSONALITIES = [
  { id: 'grumpy', name: 'Grumpy', shirt: 0x6b4f3a, pants: 0x3b3b3b, skin: 0xe0b090, hat: 'flat', walk: 1.2, voice: 110, wave: 'wave' },
  { id: 'cheerful', name: 'Cheerful', shirt: 0xffd23f, pants: 0x3fa7d6, skin: 0xffd2a8, hat: 'party', walk: 1.9, voice: 330, wave: 'wave' },
  { id: 'shy', name: 'Shy', shirt: 0xc9a7e8, pants: 0x6a5f8a, skin: 0xf6d5c0, hat: 'beanie', walk: 1.1, voice: 420, wave: 'wave' },
  { id: 'dramatic', name: 'Dramatic', shirt: 0xd7263d, pants: 0x1b1b3a, skin: 0xf0c4a0, hat: 'tophat', walk: 1.6, voice: 260, wave: 'wave' },
  { id: 'pirate', name: 'Pirate-ish', shirt: 0xf2f2f2, pants: 0x5a3a22, skin: 0xd9a47a, hat: 'tricorn', walk: 1.5, voice: 150, wave: 'wave' },
  { id: 'robot', name: 'Robot-ish', shirt: 0x9aa5b1, pants: 0x4f5b66, skin: 0xb8c4cf, hat: 'antenna', walk: 1.4, voice: 200, wave: 'wave', headShape: 'box', eyeColor: 0x44ffee },
];
export const PERSONALITY_IDS = PERSONALITIES.map((p) => p.id);
export const personalityIndex = (id) => PERSONALITY_IDS.indexOf(id);

// Short things NPCs say when they get hit (indexed like PERSONALITIES)
export const OUCH = [
  ['Hey! Watch it!', 'Ow! What is your problem?', 'Bonk! Grr!', "That's it, I'm mad!"],
  ['Ow! Hee hee!', 'Whoa! That tickled!', 'Oof! Wheee!', 'Boing!'],
  ['Eep!', 'Ow...', 'Please stop...', 'Why me?'],
  ["I'm WOUNDED!", 'The humanity!', 'Et tu, stranger?!', 'Cut! Cut! I need a medic!'],
  ['Arr! Blimey!', 'Shiver me timbers!', 'Ye will pay fer that!', 'Yarrr!'],
  ['OW. SENSOR DAMAGED.', 'ERROR. ERROR. BONK.', 'Impact detected.', 'Beep boop... ouch.'],
];

// What they yell when a limb comes off (indexed like PERSONALITIES)
export const LIMB_LINES = [
  ['Hey! That was MY arm!', 'Gimme that back!', 'Oh, come ON!'],
  ['Whoops! Lost a bit!', "Hee hee, that's not supposed to come off!", 'Ta-da! No arm!'],
  ['Eep! My... limb...', 'Oh no oh no oh no...', 'Is that... mine?'],
  ['MY LIMB! MY BEAUTIFUL LIMB!', 'Tell my mother I loved her!', 'The tragedy!'],
  ['Arr! Just a scratch!', "I've had worse, matey!", 'Shiver me... other limb!'],
  ['LIMB DETACHED.', 'WARRANTY VOID.', 'MINOR STRUCTURAL ERROR.'],
];

// What each personality does when hit but not knocked out
export const HIT_ACTION = ['revenge', 'laugh', 'flee', 'flee', 'revenge', 'dance'];

// Draw hats / face bits onto the head mesh. Head radius is 0.15.
import * as THREE from 'three';
import { getMat } from '../ragdoll.js';

export function decorateHead(personalityId, hatOverride) {
  return (head) => {
    const kind = hatOverride || (PERSONALITIES.find((p) => p.id === personalityId) || {}).hat;
    const add = (geo, color, x, y, z, rx = 0, rz = 0, opts) => {
      const m = new THREE.Mesh(geo, getMat(color, opts));
      m.position.set(x, y, z);
      m.rotation.set(rx, 0, rz);
      m.castShadow = true;
      head.add(m);
      return m;
    };
    switch (kind) {
      case 'flat':
        add(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 14), 0x444444, 0, 0.14, 0);
        add(new THREE.CylinderGeometry(0.1, 0.12, 0.08, 14), 0x444444, 0, 0.19, 0);
        // grumpy brows
        add(new THREE.BoxGeometry(0.07, 0.015, 0.02), 0x222222, 0.055, 0.075, 0.14, 0, -0.4);
        add(new THREE.BoxGeometry(0.07, 0.015, 0.02), 0x222222, -0.055, 0.075, 0.14, 0, 0.4);
        break;
      case 'party':
        add(new THREE.ConeGeometry(0.1, 0.25, 12), 0xff4fa3, 0, 0.25, 0);
        add(new THREE.SphereGeometry(0.03, 8, 6), 0xffffff, 0, 0.38, 0);
        break;
      case 'beanie':
        add(new THREE.SphereGeometry(0.16, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0x5aa9e6, 0, 0.05, 0);
        add(new THREE.SphereGeometry(0.035, 8, 6), 0xffffff, 0, 0.21, 0);
        break;
      case 'tophat':
        add(new THREE.CylinderGeometry(0.2, 0.2, 0.025, 16), 0x151515, 0, 0.14, 0);
        add(new THREE.CylinderGeometry(0.11, 0.11, 0.26, 16), 0x151515, 0, 0.27, 0);
        add(new THREE.CylinderGeometry(0.112, 0.112, 0.04, 16), 0xd7263d, 0, 0.19, 0);
        break;
      case 'tricorn':
        add(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 3), 0x222222, 0, 0.14, 0, 0, 0).rotation.y = Math.PI / 6;
        add(new THREE.SphereGeometry(0.13, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x222222, 0, 0.14, 0);
        add(new THREE.BoxGeometry(0.1, 0.04, 0.01), 0x111111, -0.055, 0.03, 0.14); // eye patch
        break;
      case 'antenna':
        add(new THREE.CylinderGeometry(0.01, 0.01, 0.2, 6), 0x777777, 0, 0.2, 0);
        add(new THREE.SphereGeometry(0.04, 10, 8), 0xff4444, 0, 0.32, 0, 0, 0, { emissive: 0xff2222 });
        break;
      case 'chef':
        add(new THREE.CylinderGeometry(0.13, 0.13, 0.06, 14), 0xffffff, 0, 0.14, 0);
        add(new THREE.SphereGeometry(0.17, 14, 10), 0xffffff, 0, 0.27, 0);
        add(new THREE.BoxGeometry(0.07, 0.015, 0.02), 0x222222, 0.055, 0.075, 0.14, 0, -0.4);
        add(new THREE.BoxGeometry(0.07, 0.015, 0.02), 0x222222, -0.055, 0.075, 0.14, 0, 0.4);
        break;
      default: break;
    }
  };
}
