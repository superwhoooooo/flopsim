// Weapon definitions and visible hand meshes.
import * as THREE from 'three';
import { getMat } from '../ragdoll.js';

export const WEAPONS = {
  axe: {
    id: 'axe', name: 'Axe', melee: true,
    windup: 0.38, strike: 0.2, recover: 0.35, // seconds
    range: 2.1, radius: 0.85,
    knock: 11, stun: 1.5, lunge: 2.5, cooldown: 0.0,
    color: '#e8a33d',
  },
  sword: {
    id: 'sword', name: 'Sword', melee: true,
    windup: 0.1, strike: 0.14, recover: 0.16,
    range: 2.4, radius: 0.8,
    knock: 6, stun: 0.55, lunge: 3.5, cooldown: 0.0,
    color: '#8fd3ff',
  },
  gun: {
    id: 'gun', name: 'Gun', melee: false,
    windup: 0.0, strike: 0.06, recover: 0.3,
    range: 90, radius: 0,
    knock: 8, stun: 0.5, lunge: 0, cooldown: 0.35,
    color: '#ff7a7a',
  },
};
export const WEAPON_ORDER = ['axe', 'sword', 'gun'];

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
  g.userData.muzzle = id === 'gun' ? new THREE.Vector3(0, -0.36, 0) : null;
  return g;
}
