// Seamless skinned body for the ragdoll. The physics is still one rigid capsule per body part, but instead of
// drawing one mesh per capsule we loft smooth tubes (torso, 2 arms, 2 legs) and skin them to the part bodies, so
// elbows / knees / waist / neck bend like cloth over a mannequin rather than like separate sausages.
// Everything is authored in the standing rest pose (character at origin, facing +Z).
import * as THREE from 'three';

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const FOAM = new THREE.Color(0xe9dfca);        // the "inside" colour shown on a detached limb's cut end

// Catmull-Rom over rows of numbers (keys[i] = [y, hx, hz, cx, cz]); returns `steps` samples per key interval.
function resample(keys, steps) {
  const out = [];
  const n = keys.length;
  const at = (i) => keys[Math.max(0, Math.min(n - 1, i))];
  for (let i = 0; i < n - 1; i++) {
    for (let s = 0; s < steps; s++) {
      const u = s / steps, u2 = u * u, u3 = u2 * u;
      const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
      out.push(p1.map((_, c) => 0.5 * ((2 * p1[c]) + (-p0[c] + p2[c]) * u + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * u2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * u3)));
    }
  }
  out.push(keys[n - 1].slice());
  for (const r of out) { r[1] = Math.max(0.012, r[1]); r[2] = Math.max(0.012, r[2]); }
  return out;
}

/**
 * Loft an elliptical tube through `keys` (ascending y). colorFn(y) -> THREE.Color, weightFn(y) -> [[boneIdx, w], ...]
 * Returns a BufferGeometry with position/normal/color/skinIndex/skinWeight and closed (foam-coloured) end caps.
 */
function loft(keys, { steps = 4, segs = 14, colorFn, weightFn }) {
  const rings = resample(keys, steps);
  const pos = [], col = [], si = [], sw = [], idx = [];
  const pushVert = (x, y, z, c, wts) => {
    pos.push(x, y, z); col.push(c.r, c.g, c.b);
    const w = wts.slice(0, 4);
    while (w.length < 4) w.push([0, 0]);
    let sum = 0; for (const [, ww] of w) sum += ww;
    for (const [bi, ww] of w) { si.push(bi); sw.push(sum > 0 ? ww / sum : 0); }
    return pos.length / 3 - 1;
  };
  const R = rings.length;
  for (let j = 0; j < R; j++) {
    const [y, hx, hz, cx, cz] = rings[j];
    const c = colorFn(y), w = weightFn(y);
    for (let k = 0; k < segs; k++) {
      const a = (k / segs) * Math.PI * 2;
      pushVert(cx + hx * Math.cos(a), y, cz + hz * Math.sin(a), c, w);
    }
  }
  for (let j = 0; j < R - 1; j++) {
    for (let k = 0; k < segs; k++) {
      const k2 = (k + 1) % segs;
      const a = j * segs + k, b = (j + 1) * segs + k, c2 = j * segs + k2, d = (j + 1) * segs + k2;
      idx.push(a, b, c2, b, d, c2);
    }
  }
  // end caps (own vertices so the cut face shades flat and can be coloured differently)
  const cap = (j, up) => {
    const [y, hx, hz, cx, cz] = rings[j];
    const w = weightFn(y);
    const c0 = pushVert(cx, y, cz, FOAM, w);
    const base = pos.length / 3;
    for (let k = 0; k < segs; k++) {
      const a = (k / segs) * Math.PI * 2;
      pushVert(cx + hx * Math.cos(a), y, cz + hz * Math.sin(a), FOAM, w);
    }
    for (let k = 0; k < segs; k++) {
      const k2 = (k + 1) % segs;
      if (up) idx.push(c0, base + k2, base + k); else idx.push(c0, base + k, base + k2);
    }
  };
  cap(0, false); cap(R - 1, true);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * @param bi  map part name -> bone index
 * @param c   { skin, shirt, pants } as THREE.Color
 * @returns { torso, armL, armR, legL, legR } geometries
 */
export function buildBodyGeometries(bi, c) {
  const { skin, shirt, pants } = c;
  const torso = loft([
    [0.80, 0.08, 0.06, 0, 0],
    [0.86, 0.17, 0.115, 0, -0.005],
    [0.94, 0.215, 0.135, 0, -0.01],
    [1.02, 0.205, 0.13, 0, -0.005],
    [1.12, 0.185, 0.118, 0, 0],
    [1.22, 0.195, 0.122, 0, 0.005],
    [1.31, 0.225, 0.135, 0, 0.01],
    [1.38, 0.235, 0.125, 0, 0],
    [1.42, 0.17, 0.10, 0, 0],
    [1.455, 0.062, 0.062, 0, 0.005],
    [1.50, 0.052, 0.052, 0, 0.01],
    [1.56, 0.05, 0.05, 0, 0.01],
  ], {
    steps: 3, segs: 18,
    colorFn: (y) => (y < 1.03 ? pants : y < 1.445 ? shirt : skin),
    weightFn: (y) => {
      const head = sstep(1.44, 1.54, y);
      const tor = (1 - head) * sstep(1.0, 1.18, y);
      return [[bi.head, head], [bi.torso, tor], [bi.pelvis, (1 - head) * (1 - sstep(1.0, 1.18, y))]];
    },
  });

  const leg = (side) => loft([
    [0.05, 0.036, 0.036, side * 0.1, 0.02],
    [0.10, 0.040, 0.040, side * 0.1, 0.01],
    [0.18, 0.048, 0.050, side * 0.1, 0],
    [0.30, 0.062, 0.066, side * 0.1, -0.005],
    [0.40, 0.058, 0.060, side * 0.1, 0],
    [0.46, 0.058, 0.058, side * 0.1, 0],
    [0.54, 0.066, 0.068, side * 0.1, 0],
    [0.66, 0.080, 0.085, side * 0.1, 0],
    [0.80, 0.090, 0.095, side * 0.1, 0],
    [0.90, 0.092, 0.095, side * 0.1, 0],
    [0.97, 0.082, 0.085, side * 0.1, 0],
  ], {
    steps: 3, segs: 14,
    colorFn: () => pants,
    weightFn: (y) => {
      const up = side > 0 ? bi.uLegL : bi.uLegR, lo = side > 0 ? bi.lLegL : bi.lLegR;
      const p = sstep(0.82, 0.98, y), l = 1 - sstep(0.38, 0.54, y);
      return [[bi.pelvis, p], [lo, l], [up, Math.max(0, 1 - p - l)]];
    },
  });

  const arm = (side) => loft([
    [0.65, 0.022, 0.018, side * 0.27, 0],
    [0.68, 0.040, 0.030, side * 0.27, 0],
    [0.72, 0.046, 0.033, side * 0.27, 0],
    [0.77, 0.038, 0.030, side * 0.27, 0],
    [0.82, 0.034, 0.034, side * 0.27, 0],
    [0.88, 0.040, 0.040, side * 0.27, 0],
    [0.96, 0.044, 0.044, side * 0.27, 0],
    [1.02, 0.044, 0.044, side * 0.27, 0],
    [1.08, 0.048, 0.048, side * 0.27, 0],
    [1.18, 0.054, 0.054, side * 0.27, 0],
    [1.30, 0.060, 0.060, side * 0.27, 0],
    [1.38, 0.062, 0.062, side * 0.27, 0],
    [1.43, 0.045, 0.045, side * 0.27, 0],
  ], {
    steps: 3, segs: 12,
    colorFn: (y) => (y > 1.12 ? shirt : skin),
    weightFn: (y) => {
      const up = side > 0 ? bi.uArmL : bi.uArmR, lo = side > 0 ? bi.lArmL : bi.lArmR;
      const t = sstep(1.32, 1.42, y), l = 1 - sstep(0.96, 1.08, y);
      return [[bi.torso, t], [lo, l], [up, Math.max(0, 1 - t - l)]];
    },
  });

  return { torso, armL: arm(1), armR: arm(-1), legL: leg(1), legR: leg(-1) };
}
