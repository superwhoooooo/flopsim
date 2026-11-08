// Weapon definitions and visible hand meshes.
import * as THREE from 'three';
import { getMat } from '../ragdoll.js';

// melee: windup/strike/recover (s), range/radius (m), knock (impulse), stun, sever = chance a hit limb pops off a fragile NPC.
// ranged: cooldown (s), pellets/spread (shotgun), auto (hold to fire), explosive (rocket: radius/blast).
export const WEAPONS = {
  axe: {
    id: 'axe', name: 'Axe', icon: '\u{1FA93}', melee: true,
    windup: 0.38, strike: 0.2, recover: 0.35,
    range: 2.1, radius: 0.85,
    knock: 11, stun: 1.5, lunge: 2.5, cooldown: 0.0, sever: 0.7,
    color: '#e8a33d',
  },
  sword: {
    id: 'sword', name: 'Sword', icon: '\u{1F5E1}\uFE0F', melee: true,
    windup: 0.1, strike: 0.14, recover: 0.16,
    range: 2.4, radius: 0.8,
    knock: 6, stun: 0.55, lunge: 3.5, cooldown: 0.0, sever: 0.5,
    color: '#8fd3ff',
  },
  gun: {
    id: 'gun', name: 'Pistol', icon: '\u{1F52B}', melee: false,
    windup: 0.0, strike: 0.06, recover: 0.3,
    range: 90, radius: 0,
    knock: 8, stun: 0.5, lunge: 0, cooldown: 0.35, sever: 0.12,
    color: '#ff7a7a',
  },
  bat: {
    id: 'bat', name: 'Baseball Bat', icon: '\u{1F3CF}', melee: true,
    windup: 0.22, strike: 0.15, recover: 0.25,
    range: 2.3, radius: 0.9,
    knock: 14, stun: 1.1, lunge: 2.5, cooldown: 0.0, sever: 0.18,
    color: '#d9a05b',
  },
  pan: {
    id: 'pan', name: 'Frying Pan', icon: '\u{1F373}', melee: true,
    windup: 0.12, strike: 0.1, recover: 0.2,
    range: 2.0, radius: 0.8,
    knock: 8, stun: 1.0, lunge: 3, cooldown: 0.0, sever: 0.0,
    color: '#b0b8c0',
  },
  sledge: {
    id: 'sledge', name: 'Sledgehammer', icon: '\u{1F528}', melee: true,
    windup: 0.62, strike: 0.2, recover: 0.5,
    range: 2.3, radius: 1.15,
    knock: 20, stun: 2.0, lunge: 2, cooldown: 0.0, sever: 0.4,
    color: '#c0c0c8',
  },
  katana: {
    id: 'katana', name: 'Katana', icon: '\u2694\uFE0F', melee: true,
    windup: 0.07, strike: 0.1, recover: 0.12,
    range: 2.6, radius: 0.75,
    knock: 5, stun: 0.5, lunge: 4.5, cooldown: 0.0, sever: 0.9,
    color: '#e6eef5',
  },
  shotgun: {
    id: 'shotgun', name: 'Shotgun', icon: '\u{1F4A5}', melee: false,
    windup: 0.0, strike: 0.06, recover: 0.5,
    range: 40, radius: 0, pellets: 8, spread: 0.07,
    knock: 6, stun: 0.5, lunge: 0, cooldown: 0.9, sever: 0.3,
    color: '#ffb347',
  },
  smg: {
    id: 'smg', name: 'SMG', icon: '\u{1F529}', melee: false, auto: true,
    windup: 0.0, strike: 0.04, recover: 0.1,
    range: 80, radius: 0, spread: 0.02,
    knock: 3.2, stun: 0.3, lunge: 0, cooldown: 0.085, sever: 0.06,
    color: '#7affc8',
  },
  rocket: {
    id: 'rocket', name: 'Rocket Launcher', icon: '\u{1F680}', melee: false,
    windup: 0.0, strike: 0.06, recover: 0.6,
    range: 120, radius: 0, explosive: true, blast: 7,
    knock: 16, stun: 2.0, lunge: 0, cooldown: 1.5, sever: 0.5,
    color: '#ff6a3d',
  },
};
export const WEAPON_ORDER = ['axe', 'sword', 'gun', 'bat', 'pan', 'sledge', 'katana', 'shotgun', 'smg', 'rocket'];
export const STARTER_WEAPONS = ['axe', 'sword', 'gun'];

// Meshes extend along local -Y from the hand (the forearm direction).
export function createWeaponMesh(id) {
  const g = new THREE.Group();
  const mk = (geo, color, x, y, z, opts) => {
    const m = new THREE.Mesh(geo, getMat(color, opts));
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  if (id === 'axe') {
    mk(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 8), 0x7a4a24, 0, -0.35, 0);
    const head = mk(new THREE.BoxGeometry(0.06, 0.22, 0.34), 0xaab4bd, 0, -0.68, 0.14, { metalness: 0.7, roughness: 0.35 });
    mk(new THREE.BoxGeometry(0.05, 0.12, 0.08), 0x555e66, 0, -0.68, -0.04, { metalness: 0.7 });
    head.rotation.x = 0;
  } else if (id === 'sword') {
    mk(new THREE.CylinderGeometry(0.022, 0.022, 0.16, 8), 0x553322, 0, -0.04, 0);
    mk(new THREE.BoxGeometry(0.24, 0.035, 0.06), 0xd4a017, 0, -0.14, 0, { metalness: 0.6 });
    mk(new THREE.BoxGeometry(0.045, 0.78, 0.015), 0xe6eef5, 0, -0.55, 0, { metalness: 0.85, roughness: 0.2 });
    mk(new THREE.ConeGeometry(0.0318, 0.1, 4), 0xe6eef5, 0, -0.99, 0, { metalness: 0.85, roughness: 0.2 }).rotation.x = Math.PI;
  } else if (id === 'gun') {
    mk(new THREE.BoxGeometry(0.05, 0.1, 0.07), 0x333333, 0, -0.03, 0.0);          // grip block
    mk(new THREE.BoxGeometry(0.045, 0.3, 0.06), 0x555a60, 0, -0.2, 0, { metalness: 0.6 }); // barrel/slide along -Y
    mk(new THREE.BoxGeometry(0.04, 0.1, 0.05), 0x2a2a2a, 0, 0.0, 0.07).rotation.x = -0.3; // handle sticking back
    mk(new THREE.BoxGeometry(0.02, 0.02, 0.03), 0xff4444, 0, -0.32, 0, { emissive: 0xff2200 });
  }
  else if (id === 'bat') {
    mk(new THREE.CylinderGeometry(0.045, 0.02, 0.78, 12), 0xcf9a55, 0, -0.43, 0);
    mk(new THREE.SphereGeometry(0.03, 10, 8), 0x8a5a2b, 0, -0.02, 0);
    mk(new THREE.CylinderGeometry(0.024, 0.024, 0.18, 10), 0x2a2a2e, 0, -0.1, 0, { roughness: 0.9 }); // tape grip
  } else if (id === 'pan') {
    mk(new THREE.CylinderGeometry(0.018, 0.018, 0.4, 8), 0x2b2b30, 0, -0.18, 0);
    const disc = mk(new THREE.CylinderGeometry(0.17, 0.17, 0.035, 24), 0x3a3d42, 0, -0.52, 0.02, { metalness: 0.7, roughness: 0.4 });
    disc.rotation.x = Math.PI / 2;
    const inner = mk(new THREE.CylinderGeometry(0.145, 0.145, 0.04, 24), 0x1b1c1f, 0, -0.52, 0.025, { metalness: 0.5, roughness: 0.5 });
    inner.rotation.x = Math.PI / 2;
  } else if (id === 'sledge') {
    mk(new THREE.CylinderGeometry(0.03, 0.03, 1.05, 10), 0x9a6a38, 0, -0.5, 0);
    mk(new THREE.BoxGeometry(0.2, 0.17, 0.17), 0x8b8f96, 0, -1.04, 0, { metalness: 0.8, roughness: 0.4 });
    mk(new THREE.BoxGeometry(0.205, 0.04, 0.175), 0x55595f, 0, -1.04, 0, { metalness: 0.8, roughness: 0.4 });
  } else if (id === 'katana') {
    mk(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 8), 0x1d1d22, 0, -0.06, 0, { roughness: 0.9 });
    mk(new THREE.CylinderGeometry(0.06, 0.06, 0.012, 16), 0xb59a3a, 0, -0.18, 0, { metalness: 0.7 });
    mk(new THREE.BoxGeometry(0.026, 0.88, 0.008), 0xeef3f8, 0, -0.63, 0, { metalness: 0.9, roughness: 0.15 });
    mk(new THREE.ConeGeometry(0.0185, 0.07, 4), 0xeef3f8, 0, -1.11, 0, { metalness: 0.9, roughness: 0.15 }).rotation.x = Math.PI;
  } else if (id === 'shotgun') {
    mk(new THREE.BoxGeometry(0.05, 0.12, 0.07), 0x3b2a1c, 0, -0.03, 0);
    mk(new THREE.CylinderGeometry(0.022, 0.022, 0.62, 10), 0x4b5056, 0, -0.38, 0, { metalness: 0.7, roughness: 0.35 });
    mk(new THREE.BoxGeometry(0.05, 0.2, 0.06), 0x5a3a22, 0, -0.26, 0.04);                        // pump
    mk(new THREE.BoxGeometry(0.05, 0.22, 0.07), 0x5a3a22, 0, 0.06, 0.07).rotation.x = -0.3;     // stock
  } else if (id === 'smg') {
    mk(new THREE.BoxGeometry(0.05, 0.32, 0.07), 0x2f3237, 0, -0.18, 0, { metalness: 0.5 });
    mk(new THREE.BoxGeometry(0.04, 0.1, 0.06), 0x222428, 0, -0.03, 0.01);
    mk(new THREE.BoxGeometry(0.035, 0.16, 0.05), 0x1c1d20, 0, -0.2, 0.075);                      // magazine
    mk(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 8), 0x54595f, 0, -0.39, 0, { metalness: 0.7 });
  } else if (id === 'rocket') {
    mk(new THREE.CylinderGeometry(0.075, 0.075, 0.85, 14), 0x5b6b47, 0, -0.4, 0.02);
    mk(new THREE.CylinderGeometry(0.095, 0.075, 0.12, 14), 0x3d4732, 0, -0.84, 0.02);
    mk(new THREE.CylinderGeometry(0.095, 0.075, 0.1, 14), 0x3d4732, 0, 0.05, 0.02);
    mk(new THREE.BoxGeometry(0.04, 0.12, 0.05), 0x2a2a2a, 0, -0.15, 0.1);                       // grip
    mk(new THREE.ConeGeometry(0.06, 0.18, 12), 0xd94a2a, 0, -0.95, 0.02, { emissive: 0x3a0f05 }).rotation.x = Math.PI;
  }
  const MUZZLE = { gun: -0.36, shotgun: -0.7, smg: -0.46, rocket: -1.0 };
  g.userData.muzzle = id in MUZZLE ? new THREE.Vector3(0, MUZZLE[id], 0) : null;
  return g;
}
