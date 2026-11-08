// The free-roam city: street grid, skyscrapers, plaza, parks, parked cars, props, lighthouse pier, sky, lights.
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RAPIER, G, groups } from '../physics.js';
import { getMat } from '../ragdoll.js';
import { createWeaponMesh, WEAPONS } from '../weapons/weapons.js';

export const WORLD_HALF = 100;
export const LIGHTHOUSE_POS = new THREE.Vector3(89, 0, -89);
export const HAT_POS = new THREE.Vector3(-60, 0, 30);

// Street grid: road centre lines (both axes). Blocks sit between them.
const ROADS = [-75, -45, -15, 15, 45, 75];
const ROAD_W = 8;
const SIDEWALK = 2.6;
const BLOCK_CENTERS = [-89.5, -60, -30, 0, 30, 60, 89.5];
const BLOCK_SIZES = [21, 22, 22, 22, 22, 22, 21];
const PLAZA = '0,0';
const PARKS = new Set(['-60,30', '30,-60', '-30,-60', '89.5,-89.5', '60,60']);
const BAKERY_BLOCK = '0,30';

// Walk-in shops, one per block, front facing `front` (a unit axis). Owners are NPCs (see npc/shopkeepers.js).
export const SHOPS = {
  hank:  { block: '-30,0', front: [1, 0],  name: "HANK'S HARDWARE", wall: 0xcbb9a0, trim: 0x3b5a7a, awning: 0x2e86c1, sign: ['#243b55', '#ffe9b0'], stock: ['bat', 'crowbar', 'sledge'], alley: 'chainsaw' },
  mei:   { block: '30,0',  front: [-1, 0], name: "MEI'S PANS & BLADES", wall: 0xdcb7a4, trim: 0x7a2f2f, awning: 0xc0392b, sign: ['#5a1f1f', '#ffe3d0'], stock: ['pan', 'katana', 'knife'] },
  gerda: { block: '0,-30', front: [0, 1],  name: "GERDA'S GUNS", wall: 0xb9bdb2, trim: 0x3a4a3a, awning: 0x4a7a3a, sign: ['#26331f', '#e8f5c8'], stock: ['shotgun', 'sniper', 'rocket'], alley: 'smg' },
  gus:   { block: '30,30', front: [-1, 0], name: "GUS'S FRESH MELONS", wall: 0xe0d6a8, trim: 0x4a6a2a, awning: 0x27ae60, sign: ['#1f4a22', '#fff6c0'], stock: [], melons: true },
};
const SHOP_BY_BLOCK = Object.fromEntries(Object.entries(SHOPS).map(([k, v]) => [v.block, k]));

function signTexture(text, bg, fg) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 200;
  const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, 1024, 200);
  x.strokeStyle = fg; x.lineWidth = 8; x.strokeRect(10, 10, 1004, 180);
  x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
  let size = 110; x.font = `900 ${size}px "Trebuchet MS", system-ui, sans-serif`;
  while (x.measureText(text).width > 920 && size > 30) { size -= 4; x.font = `900 ${size}px "Trebuchet MS", system-ui, sans-serif`; }
  x.fillText(text, 512, 104);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

const _q = new THREE.Quaternion(), _f = new THREE.Vector3();
function mulberry(seed) {
  let a = seed;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function canvasTex(size, draw, repeat = 1, srgb = true) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function noise(x, s, r, n, a, base) {
  for (let i = 0; i < n; i++) {
    const v = base + (r() - 0.5) * 40;
    x.fillStyle = `rgba(${v},${v},${v},${a})`;
    x.fillRect(r() * s, r() * s, 1 + r() * 3, 1 + r() * 3);
  }
}

// Facade: 8x8 window cells; colour map + emissive map (lit windows glow at golden hour).
function facadeTextures(seed, style) {
  const r = mulberry(seed);
  const lit = [];
  for (let i = 0; i < 64; i++) lit.push(r() < 0.28);
  const cell = 64, S = cell * 8;
  const map = canvasTex(S, (x) => {
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, S, S);
    noise(x, S, r, 3000, 0.08, 200);
    for (let i = 0; i < 64; i++) {
      const cx = (i % 8) * cell, cy = Math.floor(i / 8) * cell;
      if (style === 'glass') {
        x.fillStyle = lit[i] ? '#e9d7a6' : `rgb(${40 + r() * 20},${60 + r() * 25},${85 + r() * 30})`;
        x.fillRect(cx + 3, cy + 3, cell - 6, cell - 10);
      } else if (style === 'brick') {
        x.fillStyle = lit[i] ? '#f3dca0' : '#2c3a4a';
        x.fillRect(cx + 16, cy + 12, cell - 32, cell - 24);
        x.fillStyle = 'rgba(255,255,255,0.55)'; x.fillRect(cx + 13, cy + cell - 13, cell - 26, 4);
      } else {
        x.fillStyle = lit[i] ? '#f6e2ae' : '#33465a';
        x.fillRect(cx + 9, cy + 10, cell - 18, cell - 22);
        x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(cx + 9, cy + cell - 13, cell - 18, 3);
      }
    }
  }, 1);
  const emissive = canvasTex(S, (x) => {
    x.fillStyle = '#000'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 64; i++) {
      if (!lit[i]) continue;
      const cx = (i % 8) * cell, cy = Math.floor(i / 8) * cell;
      x.fillStyle = '#ffcf7a';
      if (style === 'glass') x.fillRect(cx + 3, cy + 3, cell - 6, cell - 10);
      else if (style === 'brick') x.fillRect(cx + 16, cy + 12, cell - 32, cell - 24);
      else x.fillRect(cx + 9, cy + 10, cell - 18, cell - 22);
    }
  }, 1);
  return { map, emissive };
}

// Box geometry with UVs scaled so one window cell ≈ cellW x cellH metres on every face.
function facadeBox(w, h, d, cellW, cellH) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const faces = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const [fu, fv] = faces[f];
    const su = Math.max(1, Math.round(fu / cellW)) / 8, sv = Math.max(1, Math.round(fv / cellH)) / 8;
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    }
  }
  return g;
}

export class World {
  constructor(physics, scene, renderer) {
    this.physics = physics;
    this.scene = scene;
    this.renderer = renderer;
    this.props = [];
    this.houses = [];       // building footprints {x,z,w,d,h} — used by NPC wander/spawn checks
    this.npcSpawnPoints = [];
    this.rnd = mulberry(1234);
    this.hat = null;
    this.clear = [];        // extra keep-clear rectangles (shop forecourts) used by _blocked
    this.shops = {};        // key -> { owner:{x,z,yaw}, name, ... }
    this.pickups = [];      // weapons lying around / on shop counters
    this.batches = new Map(); // material -> [geometry] (merged into one mesh per material)
    this._build();
  }

  // queue a static geometry (already positioned) for merging
  _add(geo, mat, { cast = true, receive = true } = {}) {
    const key = mat.uuid + (cast ? 'c' : '') + (receive ? 'r' : '');
    let b = this.batches.get(key);
    if (!b) { b = { mat, cast, receive, geos: [] }; this.batches.set(key, b); }
    b.geos.push(geo.index ? geo : geo);
  }
  _place(geo, x, y, z, ry = 0, rx = 0, rz = 0) {
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz));
    m.setPosition(x, y, z);
    geo.applyMatrix4(m);
    return geo;
  }
  _flush() {
    for (const b of this.batches.values()) {
      const geos = b.geos.map((g) => (g.index ? g.toNonIndexed() : g));
      for (const g of geos) { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); }
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, b.mat);
      mesh.castShadow = b.cast; mesh.receiveShadow = b.receive;
      this.scene.add(mesh);
    }
    this.batches.clear();
  }

  _build() {
    this._skyAndLights();
    this._ground();
    this._roads();
    this._blocks();
    this._streetFurniture();
    this._lighthouse();
    this._props();
    this._looseWeapons();
    this._cars();
    this._hat();
    this._flush();
    this._water();
    this._clouds();
  }

  _skyAndLights() {
    const { scene } = this;
    const sky = new Sky();
    sky.scale.setScalar(4500);
    const u = sky.material.uniforms;
    u.turbidity.value = 6; u.rayleigh.value = 1.6; u.mieCoefficient.value = 0.003; u.mieDirectionalG.value = 0.8;
    // golden-hour sun
    const elev = THREE.MathUtils.degToRad(42), azim = THREE.MathUtils.degToRad(215);
    const sunDir = new THREE.Vector3().setFromSphericalCoords(1, Math.PI / 2 - elev, azim);
    u.sunPosition.value.copy(sunDir);
    // The stock sun disc is ~60000x brighter than the sky; the bloom pass smears that into a screen-wide white-out
    // whenever you look toward the sun. Clamp the sky to displayable HDR so it can never feed the bloom.
    sky.material.fragmentShader = sky.material.fragmentShader.replace(
      'gl_FragColor = vec4( texColor, 1.0 );', 'gl_FragColor = vec4( min( texColor, vec3( 1.05 ) ), 1.0 );');
    scene.add(sky);
    this.sky = sky;

    // image-based lighting from the sky for nice PBR reflections on glass/cars
    if (this.renderer) {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environmentIntensity = 0.35;
      pmrem.dispose();
    }

    scene.fog = new THREE.Fog(0xd9c7b0, 70, 300);

    scene.add(new THREE.HemisphereLight(0xbcd4ff, 0x5a4a3c, 0.45));
    const sun = new THREE.DirectionalLight(0xffd9a8, 2.4);
    this.sunOffset = sunDir.clone().multiplyScalar(110);
    sun.position.copy(this.sunOffset);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    const sc = sun.shadow.camera;
    sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.near = 1; sc.far = 300;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.05;
    sun.shadow.radius = 3;
    scene.add(sun); scene.add(sun.target);
    this.sun = sun;
  }

  _ground() {
    const { physics } = this;
    const asphalt = canvasTex(512, (x, s) => {
      x.fillStyle = '#3d3f44'; x.fillRect(0, 0, s, s);
      noise(x, s, mulberry(3), 9000, 0.25, 70);
      x.strokeStyle = 'rgba(20,20,22,0.35)'; x.lineWidth = 2;
      for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(Math.random() * s, Math.random() * s); x.lineTo(Math.random() * s, Math.random() * s); x.stroke(); }
    }, 50);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(210, 210),
      new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.92, metalness: 0 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    physics.addStaticBox(0, -0.5, 0, WORLD_HALF + 20, 0.5, WORLD_HALF + 20);
    const w = WORLD_HALF + 4;
    physics.addStaticBox(w, 10, 0, 1, 10, w); physics.addStaticBox(-w, 10, 0, 1, 10, w);
    physics.addStaticBox(0, 10, w, w, 10, 1); physics.addStaticBox(0, 10, -w, w, 10, 1);

    this.mats = {
      sidewalk: new THREE.MeshStandardMaterial({ roughness: 0.85, map: canvasTex(256, (x, s) => {
        x.fillStyle = '#b9b3a8'; x.fillRect(0, 0, s, s); noise(x, s, mulberry(5), 2500, 0.12, 170);
        x.strokeStyle = 'rgba(80,75,70,0.45)'; x.lineWidth = 3;
        for (let i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(i * s / 4, 0); x.lineTo(i * s / 4, s); x.stroke(); x.beginPath(); x.moveTo(0, i * s / 4); x.lineTo(s, i * s / 4); x.stroke(); }
      }, 1) }),
      plaza: new THREE.MeshStandardMaterial({ roughness: 0.7, map: canvasTex(256, (x, s) => {
        x.fillStyle = '#c9b79c'; x.fillRect(0, 0, s, s);
        const r = mulberry(9);
        for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
          const v = 180 + r() * 40; x.fillStyle = `rgb(${v},${v * 0.9},${v * 0.75})`;
          x.fillRect(i * 32 + 1, j * 32 + 1, 30, 30);
        }
      }, 1) }),
      grass: new THREE.MeshStandardMaterial({ roughness: 1, map: canvasTex(256, (x, s) => {
        x.fillStyle = '#5c9a45'; x.fillRect(0, 0, s, s);
        const r = mulberry(7);
        for (let i = 0; i < 3000; i++) { x.fillStyle = `rgba(${50 + r() * 50},${120 + r() * 70},${40 + r() * 30},0.4)`; x.fillRect(r() * s, r() * s, 1 + r() * 3, 2 + r() * 4); }
      }, 1) }),
      curb: getMat(0x8f8b84, { roughness: 0.9 }),
      line: new THREE.MeshStandardMaterial({ color: 0xf2f0e6, roughness: 0.8 }),
      yellow: new THREE.MeshStandardMaterial({ color: 0xe8c547, roughness: 0.8 }),
    };
  }

  // flat textured plane with world-space UV tiling
  _flat(x, z, sx, sz, y, mat, tile) {
    const g = new THREE.PlaneGeometry(sx, sz);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx / tile, uv.getY(i) * sz / tile);
    g.rotateX(-Math.PI / 2);
    g.translate(x, y, z);
    this._add(g, mat, { cast: false });
  }

  _roads() {
    const { line, yellow } = this.mats;
    const span = WORLD_HALF * 2;
    for (const c of ROADS) {
      // centre double yellow
      for (const off of [-0.18, 0.18]) {
        this._flat(c + off, 0, 0.12, span, 0.025, yellow, 1);
        this._flat(0, c + off, span, 0.12, 0.025, yellow, 1);
      }
      // dashed lane lines
      for (let t = -WORLD_HALF + 2; t < WORLD_HALF; t += 6) {
        if (ROADS.some((r) => Math.abs(t - r) < 6)) continue;
        for (const off of [-2, 2]) {
          this._flat(c + off, t, 0.12, 2.4, 0.025, line, 1);
          this._flat(t, c + off, 2.4, 0.12, 0.025, line, 1);
        }
      }
    }
    // crosswalks at each intersection
    for (const cx of ROADS) for (const cz of ROADS) {
      for (const side of [-1, 1]) {
        for (let k = -3; k <= 3; k++) {
          this._flat(cx + k * 1.05, cz + side * (ROAD_W / 2 + 1.0), 0.55, 1.8, 0.026, line, 1);
          this._flat(cx + side * (ROAD_W / 2 + 1.0), cz + k * 1.05, 1.8, 0.55, 0.026, line, 1);
        }
      }
    }
  }

  _blocks() {
    const styles = ['glass', 'brick', 'concrete'];
    this.facades = [];
    const tints = {
      glass: [0xdfe8f0, 0xc8d8e6, 0xe6e0d2, 0xb8c8d8],
      brick: [0xb5624a, 0xa0523f, 0xc27a5c, 0x8e4a3a],
      concrete: [0xe8e2d6, 0xd6cfc2, 0xf0e6cf, 0xcfd6dc, 0xe8d2b8],
    };
    let seed = 11;
    for (const s of styles) for (const tint of tints[s]) {
      const { map, emissive } = facadeTextures(seed++, s);
      const mat = new THREE.MeshStandardMaterial({
        color: tint, map, emissiveMap: emissive, emissive: 0xffffff, emissiveIntensity: 0.55,
        roughness: s === 'glass' ? 0.25 : 0.8, metalness: s === 'glass' ? 0.35 : 0.02,
      });
      this.facades.push({ style: s, mat });
    }
    this.roofMat = getMat(0x6d6a66, { roughness: 0.95 });
    this.trimMat = getMat(0x55575c, { roughness: 0.7, metalness: 0.3 });

    BLOCK_CENTERS.forEach((bx, i) => BLOCK_CENTERS.forEach((bz, j) => {
      const sx = BLOCK_SIZES[i], sz = BLOCK_SIZES[j];
      const key = `${bx},${bz}`;
      // sidewalk slab + curb edge (very low so ragdolls don't trip)
      if (key === PLAZA) {
        this._flat(bx, bz, sx, sz, 0.04, this.mats.plaza, 4);
        this._plaza(bx, bz);
        return;
      }
      if (PARKS.has(key)) {
        this._flat(bx, bz, sx, sz, 0.035, this.mats.sidewalk, 4);
        this._flat(bx, bz, sx - SIDEWALK * 2, sz - SIDEWALK * 2, 0.05, this.mats.grass, 6);
        this._park(bx, bz, sx - SIDEWALK * 2, sz - SIDEWALK * 2, key);
        return;
      }
      this._flat(bx, bz, sx, sz, 0.04, this.mats.sidewalk, 4);
      this._cityBlock(bx, bz, sx - SIDEWALK * 2, sz - SIDEWALK * 2, key);
    }));
  }

  _building(x, z, w, d, h, facade, frontDir = null) {
    const fm = facade.mat;
    const cellW = facade.style === 'glass' ? 2.6 : 3.2, cellH = facade.style === 'glass' ? 3.2 : 3.4;
    // ground floor podium (darker, shop-front) + tower
    const podH = 4.2;
    this._add(new THREE.BoxGeometry(w + 0.3, podH, d + 0.3).translate(x, podH / 2, z), this.trimMat);
    this._add(facadeBox(w, h - podH, d, cellW, cellH).translate(x, podH + (h - podH) / 2, z), fm);
    // shop windows on ground floor
    const glow = getMat(0xffe7b8, { emissive: 0xffc070, emissiveIntensity: 0.6, roughness: 0.3 });
    for (const [fx, fz, rw] of [[0, 1, w], [0, -1, w], [1, 0, d], [-1, 0, d]]) {
      const n = Math.max(1, Math.floor(rw / 4));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n - 0.5;
        const g = new THREE.BoxGeometry(fx ? 0.1 : rw / n - 1.2, 2.2, fx ? rw / n - 1.2 : 0.1);
        g.translate(x + (fx ? fx * (w / 2 + 0.17) : t * rw), 1.7, z + (fz ? fz * (d / 2 + 0.17) : t * rw));
        this._add(g, glow, { cast: false });
      }
    }
    // roof cap + parapet + rooftop clutter
    this._add(new THREE.BoxGeometry(w + 0.4, 0.5, d + 0.4).translate(x, h + 0.25, z), this.roofMat);
    const r = this.rnd;
    const nAc = 1 + Math.floor(r() * 3);
    for (let k = 0; k < nAc; k++) {
      const s = 1 + r() * 1.5;
      this._add(new THREE.BoxGeometry(s, 0.9, s * 0.8).translate(x + (r() - 0.5) * (w - 3), h + 0.95, z + (r() - 0.5) * (d - 3)), this.trimMat);
    }
    if (r() < 0.25 && h > 14) { // water tower
      const wx = x + (r() - 0.5) * (w - 4), wz = z + (r() - 0.5) * (d - 4);
      this._add(new THREE.CylinderGeometry(1.3, 1.3, 2.2, 12).translate(wx, h + 2.8, wz), getMat(0x8a5a3a));
      this._add(new THREE.ConeGeometry(1.45, 0.8, 12).translate(wx, h + 4.3, wz), getMat(0x5a3a2a));
      for (const [ox, oz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) this._add(new THREE.CylinderGeometry(0.08, 0.08, 1.8, 5).translate(wx + ox, h + 1.0, wz + oz), this.trimMat);
    }
    if (h > 40 && r() < 0.6) { // antenna with red light
      this._add(new THREE.CylinderGeometry(0.12, 0.2, 7, 6).translate(x, h + 4, z), this.trimMat);
      this._add(new THREE.SphereGeometry(0.3, 8, 6).translate(x, h + 7.6, z), getMat(0xff3030, { emissive: 0xff2020, emissiveIntensity: 3 }), { cast: false });
    }
    // awning on the front
    if (frontDir) {
      const [fx, fz] = frontDir;
      const aw = getMat([0xc0392b, 0x2e86c1, 0x27ae60, 0xf39c12, 0x8e44ad][Math.floor(r() * 5)], { roughness: 0.9 });
      const len = fx ? d * 0.6 : w * 0.6;
      const g = new THREE.BoxGeometry(fx ? 1.4 : len, 0.12, fx ? len : 1.4);
      this._place(g, 0, 0, 0, 0, fz ? -fz * 0.3 : 0, fx ? fx * 0.3 : 0);
      g.translate(x + fx * (w / 2 + 0.7), 3.3, z + fz * (d / 2 + 0.7));
      this._add(g, aw);
    }
    this.physics.addStaticBox(x, h / 2, z, w / 2 + 0.15, h / 2, d / 2 + 0.15);
    this.houses.push({ x, z, w: w + 0.3, d: d + 0.3, h });
  }

  _cityBlock(bx, bz, iw, id, key) {
    if (SHOP_BY_BLOCK[key]) { this._shop(SHOP_BY_BLOCK[key], bx, bz, iw, id); return; }
    const r = this.rnd;
    const dist = Math.hypot(bx, bz);
    const tall = Math.max(0, 1 - dist / 120); // taller downtown
    const pickH = () => 9 + r() * 14 + tall * tall * (25 + r() * 45);
    const fac = () => this.facades[Math.floor(r() * this.facades.length)];
    if (key === BAKERY_BLOCK) {
      // bakery: low brick shop facing the plaza (-z), plus a tower behind
      const bw = 10, bd = 8, bh = 6;
      const bzC = bz - id / 2 + bd / 2;
      this._building(bx, bzC, bw, bd, bh, this.facades.find((f) => f.style === 'brick'), [0, -1]);
      this.bakery = { x: bx, z: bzC - bd / 2 - 2.2 };
      // sign
      const sign = new THREE.Mesh(new THREE.BoxGeometry(5, 1, 0.2), getMat(0xfff2d6, { emissive: 0xffd28a, emissiveIntensity: 0.4 }));
      sign.position.set(bx, 4.6, bzC - bd / 2 - 0.3); this.scene.add(sign);
      const loaf = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.2, 4, 10), getMat(0xc98a3e));
      loaf.rotation.z = Math.PI / 2; loaf.position.set(bx, 4.6, bzC - bd / 2 - 0.5); this.scene.add(loaf);
      this._building(bx, bz + id / 2 - 5, iw, 10, pickH() + 8, fac());
      return;
    }
    const split = r();
    const front = (cx, cz) => (Math.abs(cx - bx) > Math.abs(cz - bz) ? [Math.sign(cx - bx), 0] : [0, Math.sign(cz - bz) || 1]);
    if (split < 0.3) {
      this._building(bx, bz, iw - 1, id - 1, pickH() + 6, fac());
    } else if (split < 0.6) {
      const w2 = iw / 2 - 0.8;
      for (const s of [-1, 1]) { const cx = bx + s * (iw / 4); this._building(cx, bz, w2, id - 1, pickH(), fac(), front(cx, bz + 0.01)); }
    } else {
      const w2 = iw / 2 - 0.8, d2 = id / 2 - 0.8;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const cx = bx + sx * iw / 4, cz = bz + sz * id / 4;
        this._building(cx, cz, w2, d2, pickH(), fac(), r() < 0.6 ? front(cx, cz) : null);
      }
    }
  }

  _tree(x, z, s = 1) {
    const trunkMat = getMat(0x6a4a30, { roughness: 1 });
    const leafMats = [getMat(0x3f8a3c, { roughness: 0.9 }), getMat(0x4f9a44, { roughness: 0.9 }), getMat(0x5a8f35, { roughness: 0.9 })];
    this._add(new THREE.CylinderGeometry(0.16 * s, 0.24 * s, 2.6 * s, 7).translate(x, 1.3 * s, z), trunkMat);
    const lm = leafMats[Math.floor(this.rnd() * 3)];
    for (let k = 0; k < 4; k++) {
      const g = new THREE.IcosahedronGeometry((1.0 + this.rnd() * 0.5) * s, 1);
      g.translate(x + (this.rnd() - 0.5) * 1.2 * s, (3.0 + this.rnd() * 1.1) * s, z + (this.rnd() - 0.5) * 1.2 * s);
      this._add(g, lm);
    }
    this.physics.addStaticCylinder(x, 1.5, z, 1.5, 0.25 * s);
  }

  _bench(x, z, ry) {
    const wood = getMat(0x9a6a3a), iron = getMat(0x2d2f33, { metalness: 0.6, roughness: 0.4 });
    this._add(this._place(new THREE.BoxGeometry(1.8, 0.08, 0.5), x, 0.48, z, ry), wood);
    this._add(this._place(new THREE.BoxGeometry(1.8, 0.4, 0.06), x - Math.sin(ry) * 0.25, 0.75, z - Math.cos(ry) * 0.25, ry), wood);
    for (const o of [-0.75, 0.75]) this._add(this._place(new THREE.BoxGeometry(0.06, 0.48, 0.5), x + Math.cos(ry) * o, 0.24, z - Math.sin(ry) * o, ry), iron);
    this.physics.addStaticBox(x, 0.3, z, 0.9, 0.3, 0.3, ry);
  }

  _plaza(bx, bz) {
    // fountain
    const stone = getMat(0xd8d0c0, { roughness: 0.6 });
    this._add(new THREE.CylinderGeometry(3.2, 3.4, 0.7, 32).translate(bx, 0.35, bz), stone);
    this._add(new THREE.CylinderGeometry(0.5, 0.7, 2.2, 16).translate(bx, 1.4, bz), stone);
    this._add(new THREE.CylinderGeometry(1.4, 1.1, 0.25, 24).translate(bx, 2.5, bz), stone);
    this._add(new THREE.SphereGeometry(0.4, 12, 10).translate(bx, 2.95, bz), getMat(0xd4af37, { metalness: 0.9, roughness: 0.25 }));
    const water = new THREE.Mesh(new THREE.CircleGeometry(2.95, 32), new THREE.MeshStandardMaterial({ color: 0x3a8fb7, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.85 }));
    water.rotation.x = -Math.PI / 2; water.position.set(bx, 0.62, bz); this.scene.add(water);
    this.fountainWater = water;
    this.physics.addStaticCylinder(bx, 0.35, bz, 0.35, 3.3);
    this.physics.addStaticCylinder(bx, 1.4, bz, 1.4, 0.6);
    // planters with trees on the four corners, benches facing the fountain
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const px = bx + sx * 8, pz = bz + sz * 8;
      this._add(new THREE.BoxGeometry(2.4, 0.5, 2.4).translate(px, 0.25, pz), stone);
      this._add(new THREE.BoxGeometry(2.1, 0.05, 2.1).translate(px, 0.51, pz), getMat(0x4a3423));
      this._tree(px, pz, 1.1);
    }
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + Math.PI / 4;
      this._bench(bx + Math.cos(a) * 5.5, bz + Math.sin(a) * 5.5, -a + Math.PI / 2);
    }
  }

  _park(bx, bz, w, d, key) {
    const r = this.rnd;
    // gravel paths
    const path = getMat(0xc8b89a, { roughness: 1 });
    this._add(new THREE.PlaneGeometry(2.2, d).rotateX(-Math.PI / 2).translate(bx, 0.06, bz), path, { cast: false });
    this._add(new THREE.PlaneGeometry(w, 2.2).rotateX(-Math.PI / 2).translate(bx, 0.06, bz), path, { cast: false });
    const isHat = key === '-60,30', isLight = key === '89.5,-89.5';
    let n = 0, tries = 0;
    while (n < (isLight ? 4 : 9) && tries++ < 80) {
      const x = bx + (r() - 0.5) * (w - 2), z = bz + (r() - 0.5) * (d - 2);
      if (Math.abs(x - bx) < 2 || Math.abs(z - bz) < 2) continue;
      if (isHat && Math.hypot(x - HAT_POS.x, z - HAT_POS.z) < 4) continue;
      if (isLight && Math.hypot(x - LIGHTHOUSE_POS.x, z - LIGHTHOUSE_POS.z) < 7) continue;
      this._tree(x, z, 0.9 + r() * 0.5); n++;
    }
    if (!isLight) { this._bench(bx + 3, bz + 1.8, 0); this._bench(bx - 3, bz - 1.8, Math.PI); }
    // flowers
    const fGeo = new THREE.SphereGeometry(0.12, 6, 5);
    const cols = [0xff6b9d, 0xffd93d, 0xffffff, 0xc77dff];
    for (let i = 0; i < 40; i++) {
      const x = bx + (r() - 0.5) * w, z = bz + (r() - 0.5) * d;
      if (Math.abs(x - bx) < 1.5 || Math.abs(z - bz) < 1.5) continue;
      this._add(fGeo.clone().translate(x, 0.16, z), getMat(cols[i % 4], { roughness: 0.8 }), { cast: false });
    }
  }

  _streetFurniture() {
    const pole = getMat(0x2a2c30, { metalness: 0.7, roughness: 0.35 });
    const lampMat = getMat(0xfff1c8, { emissive: 0xffd590, emissiveIntensity: 2.5 });
    const hydrant = getMat(0xd63a2a, { roughness: 0.5 });
    // street lamps along the sidewalks
    for (const c of ROADS) {
      for (let t = -WORLD_HALF + 6; t < WORLD_HALF; t += 16) {
        if (ROADS.some((rr) => Math.abs(t - rr) < 7)) continue;
        for (const side of [-1, 1]) {
          const off = c + side * (ROAD_W / 2 + 0.6);
          for (const [x, z, ax, az] of [[off, t, -side, 0], [t, off, 0, -side]]) {
            if (this._blocked(x, z)) continue;
            this._add(new THREE.CylinderGeometry(0.08, 0.12, 5.5, 6).translate(x, 2.75, z), pole);
            this._add(new THREE.BoxGeometry(ax ? 1.4 : 0.12, 0.1, az ? 1.4 : 0.12).translate(x + ax * 0.65, 5.45, z + az * 0.65), pole);
            this._add(new THREE.BoxGeometry(0.5, 0.15, 0.3).translate(x + ax * 1.25, 5.35, z + az * 1.25), lampMat, { cast: false });
            this.physics.addStaticCylinder(x, 2.75, z, 2.75, 0.12);
          }
        }
      }
    }
    // traffic lights + hydrants at intersections
    for (const cx of ROADS) for (const cz of ROADS) {
      const x = cx + ROAD_W / 2 + 0.8, z = cz + ROAD_W / 2 + 0.8;
      this._add(new THREE.CylinderGeometry(0.1, 0.1, 4.2, 6).translate(x, 2.1, z), pole);
      this._add(new THREE.BoxGeometry(0.45, 1.2, 0.45).translate(x, 4.6, z), pole);
      const colors = [0xff3b30, 0xffcc00, 0x34c759];
      colors.forEach((col, k) => this._add(new THREE.SphereGeometry(0.13, 8, 6).translate(x, 5.0 - k * 0.38, z - 0.24),
        getMat(col, { emissive: col, emissiveIntensity: k === ((cx + cz) / 30 & 1 ? 0 : 2) ? 2.5 : 0.15 }), { cast: false }));
      this.physics.addStaticCylinder(x, 2.1, z, 2.1, 0.12);
      const hx = cx - ROAD_W / 2 - 1.0, hz = cz + ROAD_W / 2 + 1.6;
      this._add(new THREE.CylinderGeometry(0.18, 0.22, 0.7, 8).translate(hx, 0.35, hz), hydrant);
      this._add(new THREE.SphereGeometry(0.2, 8, 6).translate(hx, 0.72, hz), hydrant);
      this.physics.addStaticCylinder(hx, 0.4, hz, 0.4, 0.22);
    }
    // sidewalk street trees in the city blocks
    BLOCK_CENTERS.forEach((bx, i) => BLOCK_CENTERS.forEach((bz, j) => {
      const key = `${bx},${bz}`;
      if (key === PLAZA || PARKS.has(key)) return;
      const hw = BLOCK_SIZES[i] / 2 - 1.1, hd = BLOCK_SIZES[j] / 2 - 1.1;
      for (const t of [-0.3, 0.3]) {
        for (const [x, z] of [[bx + t * hw * 2, bz - hd], [bx + t * hw * 2, bz + hd], [bx - hw, bz + t * hd * 2], [bx + hw, bz + t * hd * 2]]) {
          if (this.rnd() < 0.45 || this._blocked(x, z, 0.8)) continue;
          if (key === BAKERY_BLOCK && Math.abs(x - bx) < 6 && z < bz) continue;
          this._tree(x, z, 0.75);
        }
      }
    }));
  }

  _blocked(x, z, m = 0.4) {
    return this.houses.some((h) => Math.abs(x - h.x) < h.w / 2 + m && Math.abs(z - h.z) < h.d / 2 + m)
      || this.clear.some((h) => Math.abs(x - h.x) < h.w / 2 + m && Math.abs(z - h.z) < h.d / 2 + m);
  }

  // ---- shops: open-front walk-in stores with a counter, shelves, sign and an owner NPC behind the counter ----
  _shop(k, bx, bz, iw, id) {
    const S = SHOPS[k];
    const [fx, fz] = S.front, th = Math.atan2(fx, fz);
    const W = 12, D = 8, H = 4.2;
    const hf = (fx ? iw : id) / 2, T = fx ? id : iw;
    const cx = bx + fx * (hf - D / 2), cz = bz + fz * (hf - D / 2);
    const c = Math.cos(th), sn = Math.sin(th);
    const P = (lx, lz) => [cx + lx * c + lz * sn, cz - lx * sn + lz * c];
    const lbox = (lx, ly, lz, sx, sy, sz, mat, { phys = true, cast = true, rx = 0 } = {}) => {
      const [wx, wz] = P(lx, lz);
      const g = new THREE.BoxGeometry(sx, sy, sz);
      const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, th, 0, 'YXZ'));
      m.setPosition(wx, ly, wz); g.applyMatrix4(m);
      this._add(g, mat, { cast });
      if (phys) this.physics.addStaticBox(wx, ly, wz, sx / 2, sy / 2, sz / 2, th);
    };
    const wall = getMat(S.wall, { roughness: 0.92 }), trim = getMat(S.trim, { roughness: 0.7 });
    const wood = getMat(0x8a6a48, { roughness: 0.8 }), counterM = getMat(0x6d4a2c, { roughness: 0.75 });
    const topM = getMat(0x2c2622, { roughness: 0.4, metalness: 0.2 });

    lbox(0, H / 2, -D / 2 + 0.15, W, H, 0.3, wall);                      // back wall
    for (const s of [-1, 1]) lbox(s * (W / 2 - 0.15), H / 2, 0, 0.3, H, D, wall);   // side walls
    lbox(0, H + 0.15, 0, W + 0.6, 0.3, D + 0.6, trim);                   // roof
    lbox(0, 3.55, D / 2 - 0.15, W, 1.3, 0.3, trim);                      // fascia beam over the open front
    lbox(0, 0.03, 0, W - 0.5, 0.06, D - 0.5, wood, { phys: false, cast: false });
    lbox(0, 0.55, 0.9, 7.4, 1.1, 1.0, counterM);                         // counter
    lbox(0, 1.12, 0.9, 7.6, 0.07, 1.2, topM, { phys: false });
    // awning (striped)
    for (let i = 0; i < 6; i++) {
      const col = i % 2 ? 0xf4efe4 : S.awning;
      lbox(-W / 2 + (i + 0.5) * (W / 6), 2.95, D / 2 + 0.85, W / 6, 0.08, 1.9, getMat(col, { roughness: 0.9 }), { phys: false, rx: 0.25 });
    }
    // back-wall shelves with random goods
    const r = this.rnd;
    const goods = [0xd94a3a, 0x3a7ad9, 0xe8c547, 0x56b36b, 0xb06ad9, 0xf2f0e6];
    for (const ty of [0.9, 1.7, 2.5]) {
      lbox(0, ty, -D / 2 + 0.5, W - 1.4, 0.07, 0.6, wood, { phys: false });
      for (let i = 0; i < 14; i++) {
        const w = 0.25 + r() * 0.35, h = 0.25 + r() * 0.35;
        lbox((r() - 0.5) * (W - 2.4), ty + 0.035 + h / 2, -D / 2 + 0.5 + (r() - 0.5) * 0.25, w, h, 0.3, getMat(goods[Math.floor(r() * goods.length)], { roughness: 0.7 }), { phys: false });
      }
    }
    // sign
    const [sx0, sz0] = P(0, D / 2 + 0.02);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(W - 1.4, 1.1),
      new THREE.MeshStandardMaterial({ map: signTexture(S.name, S.sign[0], S.sign[1]), emissiveMap: null, roughness: 0.6 }));
    sign.material.emissive = new THREE.Color(0xffffff); sign.material.emissiveMap = sign.material.map; sign.material.emissiveIntensity = 0.35;
    sign.position.set(sx0, 3.6, sz0); sign.rotation.y = th; this.scene.add(sign);
    // warm interior light
    const [lx0, lz0] = P(0, 0);
    const light = new THREE.PointLight(0xffd9a0, 16, 15, 2); light.position.set(lx0, 3.3, lz0); this.scene.add(light);

    // goods on the counter
    S.stock.forEach((wid, i) => {
      const [ix, iz] = P((i - (S.stock.length - 1) / 2) * 2.4, 0.9);
      this.addPickup(wid, ix, iz, { shop: k, y: 1.5 });
    });
    if (S.melons) {
      let n = 0;
      for (let row = 0; row < 3; row++) for (let i = 0; i < 4 - row; i++) {
        const [mx, mz] = P(-2.6 + (i - (3 - row) / 2) * 0.46 + 0.2, 0.9 + (n % 2) * 0.05);
        this.addProp('melon', mx, 1.35 + row * 0.38, mz); n++;
      }
      for (const s of [-1, 1]) { const [mx, mz] = P(s * 2.6 + 0.4, 0.9); for (let i = 0; i < 3; i++) this.addProp('melon', mx + (i - 1) * 0.02, 1.35 + i * 0.4, mz); }
      for (let i = 0; i < 4; i++) { const [mx, mz] = P(-4.2 + i * 0.6, D / 2 + 1.4); this.addProp('melon', mx, 0.4, mz); }
    }
    const [ox, oz] = P(0, -1.2);
    this.shops[k] = { key: k, name: S.name, owner: { x: ox, z: oz, yaw: th }, stock: S.stock, center: { x: cx, z: cz } };

    // alley beside the shop: crates, a bin and (maybe) a loose weapon
    for (const sgn of [-1, 1]) {
      const [ax, az] = P(sgn * (W / 2 + 1.2), 0);
      this.addProp('crate', ax, 0.6, az); this.addProp('crate', ax + 0.1 * c, 1.5, az - 0.1 * sn);
    }
    if (S.alley) { const [ax, az] = P(W / 2 + 1.2, 2.0); this.addPickup(S.alley, ax, az); }

    // tower behind
    const R = 2 * hf - D - 0.5;
    const bcx = bx + fx * (-hf + R / 2 + 0.05), bcz = bz + fz * (-hf + R / 2 + 0.05);
    const fac = this.facades[Math.floor(r() * this.facades.length)];
    this._building(bcx, bcz, fx ? R - 0.1 : T - 0.4, fx ? T - 0.4 : R - 0.1, 12 + r() * 16, fac);
    // footprint + forecourt for NPC spawn / prop / tree avoidance
    this.houses.push({ x: cx, z: cz, w: fx ? D : W, d: fx ? W : D, h: H });
    const [fx0, fz0] = P(0, D / 2 + 2.2);
    this.clear.push({ x: fx0, z: fz0, w: fx ? 4.4 : W + 2, d: fx ? W + 2 : 4.4 });
  }

  // ---- weapon pickups ----
  addPickup(id, x, z, { shop = null, y = 0.9 } = {}) {
    const holder = new THREE.Group();
    const mesh = createWeaponMesh(id);
    const box = new THREE.Box3().setFromObject(mesh), ctr = box.getCenter(new THREE.Vector3());
    mesh.position.sub(ctr);
    const lay = new THREE.Group(); lay.add(mesh); lay.rotation.z = Math.PI / 2;     // lie the weapon flat
    mesh.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const size = Math.max(box.max.y - box.min.y, 0.5);
    lay.scale.setScalar(Math.min(1.7, 1.1 / size + 0.8));
    holder.add(lay);
    const col = new THREE.Color(WEAPONS[id].color);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.04, 6, 28), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, fog: false }));
    ring.rotation.x = Math.PI / 2; ring.position.set(x, shop ? 1.17 : 0.12, z);
    if (shop) ring.scale.setScalar(0.55);
    holder.position.set(x, y, z);
    this.scene.add(holder, ring);
    const p = { id, holder, ring, x, z, baseY: y, taken: false, respawn: 0, shop, phase: this.rnd() * 6 };
    this.pickups.push(p);
    return p;
  }

  takePickup(p) {
    p.taken = true; p.respawn = 75;
    p.holder.visible = false; p.ring.visible = false;
  }

  _looseWeapons() {
    // [weapon, x, z]: parks, the pier, the plaza near spawn, the back alleys. Each is nudged to open ground if blocked.
    const spots = [
      ['bat', -3.5, -10], ['sledge', -53, 35], ['pan', -26, -55], ['katana', 66, 54],
      ['shotgun', 36, -55], ['rocket', 83, -83],
      ['golf', -62, -22], ['baguette', this.bakery ? this.bakery.x + 2 : 10, this.bakery ? this.bakery.z + 2 : 40],
      ['minigun', 78, 24], ['grenade', -74, -72], ['knife', 12, 62],
    ].map(([id, x, z]) => {
      for (let r = 0; r < 14; r += 1.5) for (let k = 0; k < 8; k++) {
        const px = x + Math.cos(k * 0.785) * r, pz = z + Math.sin(k * 0.785) * r;
        if (!this._blocked(px, pz, 1.2)) return [id, px, pz];
      }
      return [id, x, z];
    });
    for (const [id, x, z] of spots) this.addPickup(id, x, z);
  }

  _lighthouse() {
    const { x, z } = LIGHTHOUSE_POS;
    const H = 26, stripes = 6;
    for (let i = 0; i < stripes; i++) {
      const h = H / stripes;
      const rb = 3.2 - 1.2 * (i / stripes), rt = 3.2 - 1.2 * ((i + 1) / stripes);
      this._add(new THREE.CylinderGeometry(rt, rb, h, 24).translate(x, h * (i + 0.5), z), getMat(i % 2 ? 0xd9372c : 0xf5f5f5, { roughness: 0.6 }));
    }
    this._add(new THREE.CylinderGeometry(3.0, 3.0, 0.4, 24).translate(x, H + 0.2, z), getMat(0x333333));
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 2.2, 16), new THREE.MeshStandardMaterial({ color: 0xfff2a0, emissive: 0xffdd55, emissiveIntensity: 2 }));
    lamp.position.set(x, H + 1.5, z); this.scene.add(lamp);
    this._add(new THREE.ConeGeometry(1.7, 1.6, 16).translate(x, H + 3.4, z), getMat(0xd9372c));
    this.lamp = lamp;
    this.beam = new THREE.Mesh(new THREE.ConeGeometry(4, 40, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    this.beam.geometry.translate(0, -20, 0); this.beam.geometry.rotateZ(Math.PI / 2);
    this.beam.position.set(x, H + 1.5, z); this.scene.add(this.beam);
    this.physics.addStaticCylinder(x, H / 2, z, H / 2, 3.1);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      this._add(new THREE.DodecahedronGeometry(1.2 + this.rnd() * 0.8).translate(x + Math.cos(a) * 4.6, 0.6, z + Math.sin(a) * 4.6), getMat(0x8a8d93));
    }
  }

  addProp(kind, x, y, z, ry = null) {
    const { physics } = this;
    let mesh, colDesc, damping = 0.2, wheels = null;
    if (kind === 'crate') {
      const s = 0.8 + this.rnd() * 0.3;
      mesh = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), getMat(0xb98550));
      mesh.add(new THREE.Mesh(new THREE.BoxGeometry(s * 1.02, s * 0.12, s * 1.02), getMat(0x7d5632)));
      colDesc = RAPIER.ColliderDesc.cuboid(s / 2, s / 2, s / 2).setMass(6 * s);
    } else if (kind === 'bin') {
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.26, 0.9, 12), getMat(0x2f6b3a, { roughness: 0.5, metalness: 0.4 }));
      mesh.add(new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.06, 12).translate(0, 0.46, 0), getMat(0x23502b, { metalness: 0.5 })));
      colDesc = RAPIER.ColliderDesc.cylinder(0.45, 0.3).setMass(5);
    } else if (kind === 'car') {
      const cols = [0xc0392b, 0x2e86c1, 0xf1c40f, 0xecf0f1, 0x27ae60, 0x34495e, 0xe67e22, 0x8e44ad];
      const paint = new THREE.MeshStandardMaterial({ color: cols[Math.floor(this.rnd() * cols.length)], metalness: 0.6, roughness: 0.28 });
      const glass = getMat(0x1d2a38, { metalness: 0.8, roughness: 0.1 });
      const tire = getMat(0x1a1a1a, { roughness: 0.9 });
      mesh = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 4.2), paint);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 2.2), glass); cabin.position.set(0, 0.62, -0.2); mesh.add(cabin);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.08, 1.9), paint); roof.position.set(0, 0.95, -0.2); mesh.add(roof);
      wheels = [];
      for (const [wx, wz] of [[-0.85, 1.35], [0.85, 1.35], [-0.85, -1.35], [0.85, -1.35]]) {
        const pivot = new THREE.Group(); pivot.rotation.order = 'YXZ'; pivot.position.set(wx, -0.3, wz);
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.28, 14), tire);
        w.rotation.z = Math.PI / 2;
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.3, 8), getMat(0xb8bcc4, { metalness: 0.8, roughness: 0.3 }));
        hub.rotation.z = Math.PI / 2;
        pivot.add(w, hub); mesh.add(pivot);
        wheels.push({ pivot, front: wz > 0 });
      }
      for (const sx of [-0.6, 0.6]) {
        const hl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.15, 0.05), getMat(0xfff6d8, { emissive: 0xfff0c0, emissiveIntensity: 1.5 }));
        hl.position.set(sx, 0.05, 2.11); mesh.add(hl);
        const tl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.15, 0.05), getMat(0xff2a2a, { emissive: 0xff1010, emissiveIntensity: 1.2 }));
        tl.position.set(sx, 0.05, -2.11); mesh.add(tl);
      }
      colDesc = RAPIER.ColliderDesc.cuboid(0.9, 0.7, 2.1).setMass(900).setTranslation(0, 0.1, 0);
      damping = 1.5;
    } else if (kind === 'melon') {
      const rr = 0.2 + this.rnd() * 0.05;
      const tex = canvasTex(64, (x, sz) => {
        x.fillStyle = '#3f8f3a'; x.fillRect(0, 0, sz, sz);
        x.fillStyle = '#2b6b2a';
        for (let i = 0; i < 8; i++) x.fillRect(i * 8 + 2, 0, 3, sz);
      }, 1);
      mesh = new THREE.Mesh(new THREE.SphereGeometry(rr, 16, 12).scale(1, 0.92, 1.08), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 }));
      colDesc = RAPIER.ColliderDesc.ball(rr * 1.02).setMass(2.2);
    } else {
      const rr = 0.38, h = 0.95;
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, h, 14), getMat(0x9a5a2e));
      for (const yy of [-0.28, 0.28]) {
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(rr * 1.03, rr * 1.03, 0.07, 14), getMat(0x444444));
        ring.position.y = yy; mesh.add(ring);
      }
      colDesc = RAPIER.ColliderDesc.cylinder(h / 2, rr).setMass(7);
    }
    mesh.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.scene.add(mesh);
    const a = ry ?? this.rnd() * 6;
    const desc = RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setLinearDamping(damping).setAngularDamping(damping + 0.3)
      .setRotation({ x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) });
    const body = physics.world.createRigidBody(desc);
    const col = physics.world.createCollider(colDesc.setFriction(0.7).setRestitution(0.15)
      .setCollisionGroups(groups(G.PROP, 0xffff)), body);
    const prop = { kind, mesh, body, collider: col, home: { x, z }, wheels, spin: 0, steer: 0, baseDamping: damping };
    physics.registerCollider(col, { type: 'prop', prop });
    this.props.push(prop);
    return prop;
  }

  _props() {
    // crates/barrels in alleys & sidewalks, bins at corners
    let n = 0, tries = 0;
    while (n < 36 && tries++ < 600) {
      const x = (this.rnd() * 2 - 1) * 92, z = (this.rnd() * 2 - 1) * 92;
      const onRoad = ROADS.some((rr) => Math.abs(x - rr) < ROAD_W / 2 + 0.3) || ROADS.some((rr) => Math.abs(z - rr) < ROAD_W / 2 + 0.3);
      if (onRoad || this._blocked(x, z, 0.8)) continue;
      if (Math.hypot(x, z) < 5 || Math.hypot(x - LIGHTHOUSE_POS.x, z - LIGHTHOUSE_POS.z) < 7) continue;
      this.addProp(n % 3 === 0 ? 'barrel' : 'crate', x, 0.6, z);
      if (n % 5 === 0) this.addProp('crate', x + 0.1, 1.6, z);
      n++;
    }
    for (const cx of ROADS) for (const cz of ROADS) {
      if (this.rnd() < 0.5) this.addProp('bin', cx - ROAD_W / 2 - 1.2, 0.5, cz - ROAD_W / 2 - 1.2);
    }
    // a pyramid of crates near spawn to bonk
    for (let row = 0; row < 3; row++) for (let i = 0; i < 3 - row; i++) this.addProp('crate', 6 + i * 0.9 + row * 0.45, 0.45 + row * 0.85, -6);
  }

  _cars() {
    // parked cars in the outer lanes (heavy dynamic bodies — you can shove them a bit)
    let n = 0;
    for (const c of ROADS) {
      for (let t = -WORLD_HALF + 8; t < WORLD_HALF - 6; t += 11) {
        if (ROADS.some((rr) => Math.abs(t - rr) < 9)) continue;
        if (this.rnd() < 0.55) continue;
        const side = this.rnd() < 0.5 ? -1 : 1;
        const lane = c + side * (ROAD_W / 2 - 1.1);
        if (this.rnd() < 0.5) this.addProp('car', lane, 0.75, t + (this.rnd() - 0.5) * 2, side > 0 ? 0 : Math.PI);
        else this.addProp('car', t + (this.rnd() - 0.5) * 2, 0.75, lane, side > 0 ? Math.PI / 2 : -Math.PI / 2);
        n++;
      }
    }
    this.carCount = n;
  }

  _hat() {
    const g = new THREE.Group();
    const pink = getMat(0xff2d95, { emissive: 0x551133 });
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.06, 18), pink);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.5, 16), pink);
    top.position.y = 0.28;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.385, 0.385, 0.1, 16), getMat(0xffe14a));
    band.position.y = 0.12;
    const feather = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.6, 6), getMat(0x43e0ff));
    feather.position.set(0.3, 0.7, 0); feather.rotation.z = -0.5;
    g.add(brim, top, band, feather);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.position.set(HAT_POS.x, 0.9, HAT_POS.z);
    this.scene.add(g);
    this.hat = { mesh: g, pos: HAT_POS.clone(), collected: false };
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.06, 6, 24), getMat(0xffe14a, { emissive: 0xaa8800 }));
    ring.rotation.x = Math.PI / 2; ring.position.set(HAT_POS.x, 0.1, HAT_POS.z);
    this.scene.add(ring);
    this.hat.ring = ring;
    for (let i = 0; i < 4; i++) {
      const x = HAT_POS.x + 2 + i * 0.4, z = HAT_POS.z + (i - 1.5) * 1.1;
      this._add(new THREE.DodecahedronGeometry(0.9).translate(x, 0.5, z), getMat(0x8a8d93));
      this.physics.addStaticCylinder(x, 0.5, z, 0.5, 0.8);
    }
  }

  _water() {
    // harbour water surrounding the city
    const geo = new THREE.PlaneGeometry(1200, 1200, 1, 1);
    const ripple = canvasTex(256, (x, s) => {
      x.fillStyle = '#808080'; x.fillRect(0, 0, s, s);
      const r = mulberry(21);
      for (let i = 0; i < 400; i++) { const v = 100 + r() * 80; x.fillStyle = `rgba(${v},${v},${v},0.5)`; x.beginPath(); x.ellipse(r() * s, r() * s, 6 + r() * 14, 2 + r() * 3, 0, 0, Math.PI * 2); x.fill(); }
    }, 120, false);
    const mat = new THREE.MeshStandardMaterial({ color: 0x2b5f7a, roughness: 0.12, metalness: 0.6, bumpMap: ripple, bumpScale: 0.6 });
    const water = new THREE.Mesh(geo, mat);
    water.rotation.x = -Math.PI / 2; water.position.y = -0.6; water.receiveShadow = true;
    this.scene.add(water);
    this.water = water; this.rippleTex = ripple;
    // seawall edge
    const wall = getMat(0x9a958c, { roughness: 0.9 });
    const e = 105;
    for (const [x, z, sx, sz] of [[0, e, 2 * e + 2, 2], [0, -e, 2 * e + 2, 2], [e, 0, 2, 2 * e], [-e, 0, 2, 2 * e]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, 1.4, sz), wall);
      m.position.set(x, 0.0, z); m.receiveShadow = true; this.scene.add(m);
    }
  }

  _clouds() {
    // Lumpy, flat-bottomed cumulus. Shading is baked into vertex colours (unlit material) so they can never blow out:
    // sun-facing tops are a warm light grey, undersides a cool blue-grey. Lumps come from layered sine noise.
    const lit = new THREE.Color(0xe3d9c8), shade = new THREE.Color(0x8e98aa), tmp = new THREE.Color();
    const sunDir = this.sunOffset.clone().normalize();
    const cloudMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.86, depthWrite: false, fog: false });
    const lump = (x, y, z, s) => Math.sin(x * 0.9 + s) * Math.sin(y * 1.1 + s * 1.7) * 0.5 + Math.sin(z * 1.3 - s) * Math.sin(x * 1.9 + y * 0.8 + s) * 0.35
      + Math.sin(x * 3.1 + z * 2.7 + s * 2.3) * Math.sin(y * 3.4 - s) * 0.18;
    this.clouds = [];
    for (let i = 0; i < 18; i++) {
      const c = new THREE.Group();
      const puffs = 5 + Math.floor(this.rnd() * 4);
      for (let k = 0; k < puffs; k++) {
        const R = 5 + this.rnd() * 7, seed = this.rnd() * 50;
        const geo = new THREE.IcosahedronGeometry(R, 3);
        const pos = geo.attributes.position;
        const col = new Float32Array(pos.count * 3);
        for (let v = 0; v < pos.count; v++) {
          let x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
          const l = Math.hypot(x, y, z) || 1;
          const nx = x / l, ny = y / l, nz = z / l;
          const r = R * (1 + 0.22 * lump(nx * 2.2, ny * 2.2, nz * 2.2, seed));
          x = nx * r; y = ny * r * (ny < 0 ? 0.28 : 0.62); z = nz * r;      // flat bottoms, domed tops
          pos.setXYZ(v, x, y, z);
          const d = nx * sunDir.x + ny * sunDir.y + nz * sunDir.z;
          const t = THREE.MathUtils.clamp(d * 0.5 + 0.5 + ny * 0.25, 0, 1);
          tmp.copy(shade).lerp(lit, t * t * (3 - 2 * t));
          col[v * 3] = tmp.r; col[v * 3 + 1] = tmp.g; col[v * 3 + 2] = tmp.b;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        const s = new THREE.Mesh(geo, cloudMat);
        s.position.set((k - puffs / 2) * 8 + this.rnd() * 3, this.rnd() * 3 + (k % 2) * 1.5, this.rnd() * 9 - 4);
        c.add(s);
      }
      c.position.set((this.rnd() * 2 - 1) * 320, 105 + this.rnd() * 45, (this.rnd() * 2 - 1) * 320);
      this.scene.add(c); this.clouds.push(c);
    }
  }

  update(dt, t, playerPos) {
    for (const p of this.props) {
      const tr = p.body.translation(), r = p.body.rotation();
      p.mesh.position.set(tr.x, tr.y, tr.z);
      p.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      if (p.wheels) {
        const v = p.body.linvel();
        _q.set(r.x, r.y, r.z, r.w); _f.set(0, 0, 1).applyQuaternion(_q);
        p.spin += (v.x * _f.x + v.z * _f.z) * dt / 0.36;
        for (const w of p.wheels) { w.pivot.rotation.x = p.spin; w.pivot.rotation.y = w.front ? p.steer * 0.5 : 0; }
      }
      if (tr.y < -8) { p.body.setTranslation({ x: p.home.x, y: 1, z: p.home.z }, true); p.body.setLinvel({ x: 0, y: 0, z: 0 }, true); }
    }
    for (const p of this.pickups) {
      if (p.taken) {
        p.respawn -= dt;
        if (p.respawn <= 0) { p.taken = false; p.holder.visible = true; p.ring.visible = true; }
        continue;
      }
      p.holder.rotation.y = t * 1.2 + p.phase;
      p.holder.position.y = p.baseY + Math.sin(t * 2.2 + p.phase) * 0.1;
      p.ring.rotation.z = t * 0.8;
    }
    for (const c of this.clouds) { c.position.x += dt * 1.2; if (c.position.x > 340) c.position.x = -340; }
    if (this.hat && !this.hat.collected) {
      this.hat.mesh.rotation.y = t * 1.5;
      this.hat.mesh.position.y = 0.9 + Math.sin(t * 2.5) * 0.15;
      this.hat.ring.rotation.z = t;
    }
    if (playerPos) {
      // snap the shadow camera to texel-sized steps to avoid shimmering
      const step = 120 / 4096;
      const px = Math.round(playerPos.x / step) * step, pz = Math.round(playerPos.z / step) * step;
      this.sun.target.position.set(px, 0, pz);
      this.sun.position.copy(this.sun.target.position).add(this.sunOffset);
    }
    if (this.lamp) this.lamp.material.emissiveIntensity = 1.6 + Math.sin(t * 3) * 0.6;
    if (this.beam) this.beam.rotation.y = t * 0.6;
    if (this.rippleTex) { this.rippleTex.offset.x = t * 0.004; this.rippleTex.offset.y = t * 0.0025; }
  }
}
