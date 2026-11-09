// Weapon definitions and visible hand meshes.
import * as THREE from 'three';
import { getMat } from '../ragdoll.js';

// melee: windup/strike/recover (s), range/radius (m), knock (impulse), stun, sever = chance a hit limb pops off a fragile NPC.
// ranged: cooldown (s), pellets/spread (shotgun), auto (hold to fire), explosive (rocket: radius/blast).
export const WEAPONS = {
  // nothing in your hands: a quick weak punch (no mesh; body collisions still bonk people)
  fists: {
    id: 'fists', name: 'Unarmed', icon: '\u270A', melee: true,
    windup: 0.08, strike: 0.1, recover: 0.14,
    range: 1.5, radius: 0.6,
    knock: 4, stun: 0.35, lunge: 3, cooldown: 0.0, sever: 0.0,
    color: '#f2c9a0',
  },
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
  knife: {
    id: 'knife', name: 'Combat Knife', icon: '\u{1F52A}', melee: true,
    windup: 0.05, strike: 0.08, recover: 0.09,
    range: 1.7, radius: 0.7,
    knock: 3, stun: 0.3, lunge: 4, cooldown: 0.0, sever: 0.6,
    color: '#cfd8dc',
  },
  crowbar: {
    id: 'crowbar', name: 'Crowbar', icon: '\u{1F527}', melee: true,
    windup: 0.2, strike: 0.12, recover: 0.22,
    range: 2.2, radius: 0.85,
    knock: 12, stun: 1.2, lunge: 2.8, cooldown: 0.0, sever: 0.15,
    color: '#c0392b',
  },
  chainsaw: {
    id: 'chainsaw', name: 'Chainsaw', icon: '\u{1FA9A}', melee: true,
    windup: 0.08, strike: 0.12, recover: 0.06,
    range: 1.9, radius: 0.9,
    knock: 3.5, stun: 0.5, lunge: 3, cooldown: 0.0, sever: 0.95,
    color: '#f39c12',
  },
  golf: {
    id: 'golf', name: 'Golf Club', icon: '\u26F3', melee: true,
    windup: 0.3, strike: 0.13, recover: 0.3,
    range: 2.6, radius: 0.7,
    knock: 22, stun: 1.6, lunge: 2, cooldown: 0.0, sever: 0.1,
    color: '#58d68d',
  },
  baguette: {
    id: 'baguette', name: 'Baguette', icon: '\u{1F956}', melee: true,
    windup: 0.12, strike: 0.1, recover: 0.16,
    range: 2.2, radius: 0.8,
    knock: 7, stun: 0.9, lunge: 3, cooldown: 0.0, sever: 0.0,
    color: '#e6b86a',
  },
  sniper: {
    id: 'sniper', name: 'Sniper Rifle', icon: '\u{1F3AF}', melee: false,
    windup: 0.0, strike: 0.06, recover: 0.8,
    range: 300, radius: 0, spread: 0,
    knock: 20, stun: 2.2, lunge: 0, cooldown: 1.1, sever: 0.55,
    color: '#85c1e9',
  },
  minigun: {
    id: 'minigun', name: 'Minigun', icon: '\u2699\uFE0F', melee: false, auto: true,
    windup: 0.0, strike: 0.03, recover: 0.05,
    range: 90, radius: 0, spread: 0.05,
    knock: 2.4, stun: 0.25, lunge: 0, cooldown: 0.045, sever: 0.05,
    color: '#f5b041',
  },
  grenade: {
    id: 'grenade', name: 'Grenade Launcher', icon: '\u{1F4A3}', melee: false,
    windup: 0.0, strike: 0.06, recover: 0.5,
    range: 70, radius: 0, explosive: true, blast: 5, speed: 38,
    knock: 13, stun: 1.6, lunge: 0, cooldown: 0.9, sever: 0.4,
    color: '#a9dfbf',
  },
};
export const WEAPON_ORDER = ['fists', 'axe', 'sword', 'gun', 'knife', 'bat', 'pan', 'baguette', 'crowbar', 'golf', 'sledge', 'katana', 'chainsaw',
  'shotgun', 'smg', 'minigun', 'sniper', 'grenade', 'rocket'];
export const STARTER_WEAPONS = ['fists', 'axe', 'sword', 'gun'];   // fists = Unarmed, always owned

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
  } else if (id === 'knife') {
    mk(new THREE.CylinderGeometry(0.022, 0.024, 0.14, 8), 0x1d1d22, 0, -0.05, 0, { roughness: 0.9 });
    mk(new THREE.BoxGeometry(0.1, 0.02, 0.04), 0x555a60, 0, -0.13, 0, { metalness: 0.7 });
    mk(new THREE.BoxGeometry(0.03, 0.3, 0.008), 0xeef3f8, 0, -0.29, 0, { metalness: 0.9, roughness: 0.15 });
    mk(new THREE.ConeGeometry(0.0212, 0.07, 4), 0xeef3f8, 0, -0.475, 0, { metalness: 0.9, roughness: 0.15 }).rotation.x = Math.PI;
  } else if (id === 'crowbar') {
    mk(new THREE.CylinderGeometry(0.018, 0.018, 0.82, 8), 0xb8322a, 0, -0.4, 0, { metalness: 0.5, roughness: 0.5 });
    const hook = mk(new THREE.TorusGeometry(0.07, 0.016, 6, 12, Math.PI * 1.1), 0xb8322a, 0.0, -0.82, 0.05, { metalness: 0.5, roughness: 0.5 });
    hook.rotation.y = Math.PI / 2;
    mk(new THREE.BoxGeometry(0.03, 0.08, 0.05), 0xb8322a, 0, 0.02, 0.02, { metalness: 0.5 });
  } else if (id === 'chainsaw') {
    mk(new THREE.BoxGeometry(0.11, 0.22, 0.12), 0xf39c12, 0, -0.1, 0);
    mk(new THREE.BoxGeometry(0.04, 0.1, 0.09), 0x222222, 0, 0.0, 0.08);
    mk(new THREE.BoxGeometry(0.03, 0.55, 0.1), 0xaab4bd, 0, -0.5, 0, { metalness: 0.8, roughness: 0.3 });
    mk(new THREE.BoxGeometry(0.036, 0.55, 0.014), 0x2a2a2a, 0, -0.5, 0.05, { metalness: 0.6 });
    mk(new THREE.BoxGeometry(0.036, 0.55, 0.014), 0x2a2a2a, 0, -0.5, -0.05, { metalness: 0.6 });
  } else if (id === 'golf') {
    mk(new THREE.CylinderGeometry(0.011, 0.014, 0.98, 8), 0xc9ced3, 0, -0.5, 0, { metalness: 0.8, roughness: 0.25 });
    mk(new THREE.CylinderGeometry(0.019, 0.019, 0.22, 8), 0x222222, 0, -0.08, 0, { roughness: 0.95 });
    const head = mk(new THREE.BoxGeometry(0.06, 0.07, 0.14), 0x9aa3ab, 0, -1.02, 0.05, { metalness: 0.8, roughness: 0.3 });
    head.rotation.x = 0.15;
  } else if (id === 'baguette') {
    const b = mk(new THREE.CylinderGeometry(0.04, 0.04, 0.75, 12), 0xd9a04e, 0, -0.38, 0, { roughness: 0.85 });
    b.scale.set(1, 1, 0.9);
    for (let i = 0; i < 4; i++) mk(new THREE.BoxGeometry(0.05, 0.012, 0.012), 0xf2d49b, 0.0, -0.18 - i * 0.14, 0.036, { roughness: 0.9 }).rotation.z = 0.5;
  } else if (id === 'sniper') {
    mk(new THREE.BoxGeometry(0.05, 0.16, 0.07), 0x2d2f33, 0, -0.03, 0);
    mk(new THREE.CylinderGeometry(0.018, 0.018, 0.95, 10), 0x3a3d42, 0, -0.55, 0, { metalness: 0.7, roughness: 0.35 });
    mk(new THREE.BoxGeometry(0.05, 0.3, 0.07), 0x4a3b2a, 0, -0.18, 0);
    mk(new THREE.CylinderGeometry(0.024, 0.024, 0.28, 10), 0x15171a, 0, -0.3, 0.07, { metalness: 0.5 });  // scope
    mk(new THREE.BoxGeometry(0.05, 0.24, 0.07), 0x4a3b2a, 0, 0.1, 0.07).rotation.x = -0.3;
  } else if (id === 'minigun') {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      mk(new THREE.CylinderGeometry(0.013, 0.013, 0.7, 8), 0x55595f, Math.cos(a) * 0.04, -0.5, Math.sin(a) * 0.04, { metalness: 0.8, roughness: 0.3 });
    }
    mk(new THREE.CylinderGeometry(0.075, 0.075, 0.28, 14), 0x34383d, 0, -0.1, 0, { metalness: 0.6 });
    mk(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 14), 0x25282c, 0, -0.84, 0, { metalness: 0.6 });
    mk(new THREE.BoxGeometry(0.04, 0.12, 0.05), 0x222222, 0, 0.0, 0.1);
  } else if (id === 'grenade') {
    mk(new THREE.CylinderGeometry(0.055, 0.055, 0.5, 14), 0x4a5a3d, 0, -0.3, 0.02);
    mk(new THREE.CylinderGeometry(0.1, 0.1, 0.16, 14), 0x3a472f, 0, -0.18, 0.02);       // drum
    mk(new THREE.BoxGeometry(0.04, 0.12, 0.05), 0x2a2a2a, 0, -0.04, 0.09);
    mk(new THREE.CylinderGeometry(0.07, 0.055, 0.06, 14), 0x2a2a2a, 0, -0.58, 0.02);
    mk(new THREE.BoxGeometry(0.05, 0.22, 0.07), 0x3b2a1c, 0, 0.1, 0.07).rotation.x = -0.3;
  }
  const MUZZLE = { gun: -0.36, shotgun: -0.7, smg: -0.46, rocket: -1.0, sniper: -1.05, minigun: -0.88, grenade: -0.62 };
  g.userData.muzzle = id in MUZZLE ? new THREE.Vector3(0, MUZZLE[id], 0) : null;
  return g;
}
