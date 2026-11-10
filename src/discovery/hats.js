// Wearable hats for the player. Unlocked by Flop Rank, golden ducks and feats (see discovery.js). H cycles owned hats.
import * as THREE from 'three';
import { getMat } from '../ragdoll.js';
import { decorateHead } from '../npc/personalities.js';

// `from` says how you get it (shown in the journal while it's locked).
export const HATS = [
  { id: 'none', name: 'No Hat', icon: '🙂', from: 'Always yours' },
  { id: 'party', name: 'Party Hat', icon: '🥳', from: 'Reach rank Floppy Amateur' },
  { id: 'beanie', name: 'Beanie', icon: '🧢', from: 'Reach rank Bonk Apprentice' },
  { id: 'cone', name: 'Traffic Cone', icon: '🚧', from: 'Reach rank Ragdoll Regular' },
  { id: 'tophat', name: 'Top Hat', icon: '🎩', from: 'Reach rank Chaos Enthusiast' },
  { id: 'propeller', name: 'Propeller Cap', icon: '🚁', from: 'Reach rank Flop Professional' },
  { id: 'crown', name: 'Crown', icon: '👑', from: 'Reach rank Legend of the Flop' },
  { id: 'tricorn', name: 'Pirate Hat', icon: '🏴‍☠️', from: 'Find 5 golden ducks' },
  { id: 'chef', name: 'Chef Hat', icon: '👨‍🍳', from: 'Find 10 golden ducks' },
  { id: 'antenna', name: 'Robot Antenna', icon: '📡', from: 'Find 20 golden ducks' },
  { id: 'duckhat', name: 'Golden Duck', icon: '🦆', from: 'Find all 30 golden ducks' },
  { id: 'halo', name: 'Halo', icon: '😇', from: 'Feat: Tourist (discover every landmark)' },
];
export const HAT_BY_ID = Object.fromEntries(HATS.map((h) => [h.id, h]));

/** A golden rubber duck (used for collectibles and the Golden Duck hat). ~1 unit long. */
export function duckMesh() {
  const gold = new THREE.MeshStandardMaterial({ color: 0xffc31a, metalness: 0.85, roughness: 0.22, emissive: 0x6a4200, emissiveIntensity: 0.9 });
  const beakM = new THREE.MeshStandardMaterial({ color: 0xff7a1a, metalness: 0.4, roughness: 0.4, emissive: 0x5a1a00 });
  const eyeM = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 18, 12).scale(1, 0.72, 1.25), gold);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.35, 10).rotateX(-2.3), gold); tail.position.set(0, 0.22, -0.6);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), gold); head.position.set(0, 0.48, 0.32);
  const beak = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8).scale(1, 0.45, 1.4), beakM); beak.position.set(0, 0.43, 0.62);
  g.add(body, tail, head, beak);
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), eyeM); e.position.set(s * 0.15, 0.56, 0.55); g.add(e); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

/** Build the hat into `group` (a child of the head mesh; head radius ~0.15). Returns an optional per-frame animator. */
export function buildHat(id, group) {
  const add = (geo, color, x, y, z, opts) => {
    const m = new THREE.Mesh(geo, getMat(color, opts));
    m.position.set(x, y, z); m.castShadow = true; group.add(m); return m;
  };
  switch (id) {
    case 'none': return null;
    case 'cone': {
      add(new THREE.ConeGeometry(0.12, 0.34, 16), 0xff6a13, 0, 0.3, 0, { roughness: 0.6 });
      add(new THREE.CylinderGeometry(0.083, 0.098, 0.06, 16), 0xffffff, 0, 0.26, 0);
      add(new THREE.BoxGeometry(0.3, 0.03, 0.3), 0xff6a13, 0, 0.13, 0, { roughness: 0.6 });
      return null;
    }
    case 'propeller': {
      add(new THREE.SphereGeometry(0.16, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0x3a7bd5, 0, 0.05, 0);
      add(new THREE.BoxGeometry(0.07, 0.01, 0.08), 0xffd23f, 0, 0.06, 0.16);   // peak
      add(new THREE.CylinderGeometry(0.01, 0.01, 0.08, 6), 0x888888, 0, 0.24, 0);
      const rotor = new THREE.Group(); rotor.position.set(0, 0.28, 0); group.add(rotor);
      const colors = [0xff4f4f, 0x4fd16b];
      for (let i = 0; i < 2; i++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.008, 0.05), getMat(colors[i]));
        b.rotation.y = i * Math.PI / 2; rotor.add(b);
      }
      return (dt) => { rotor.rotation.y += dt * 18; };
    }
    case 'crown': {
      const gold = { metalness: 0.9, roughness: 0.25, emissive: 0x4a3000 };
      add(new THREE.CylinderGeometry(0.13, 0.13, 0.08, 16, 1, true), 0xffcc33, 0, 0.17, 0, { ...gold, side: THREE.DoubleSide });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        add(new THREE.ConeGeometry(0.03, 0.08, 6), 0xffcc33, Math.sin(a) * 0.125, 0.25, Math.cos(a) * 0.125, gold);
        add(new THREE.SphereGeometry(0.015, 6, 5), [0xff2a4a, 0x2a8aff, 0x2aff8a][i % 3], Math.sin(a) * 0.13, 0.17, Math.cos(a) * 0.13, { emissive: 0x220000 });
      }
      return null;
    }
    case 'halo': {
      const m = add(new THREE.TorusGeometry(0.13, 0.018, 8, 28), 0xfff3a0, 0, 0.32, 0, { emissive: 0xffe680, emissiveIntensity: 2 });
      m.rotation.x = Math.PI / 2; m.castShadow = false;
      let t = 0;
      return (dt) => { t += dt; m.position.y = 0.32 + Math.sin(t * 2.5) * 0.02; };
    }
    case 'duckhat': {
      const d = duckMesh(); d.scale.setScalar(0.22); d.position.set(0, 0.2, 0); group.add(d);
      return null;
    }
    default:
      decorateHead(null, id)(group);   // party, beanie, tophat, tricorn, chef, antenna: same as the townsfolk wear
      return null;
  }
}
