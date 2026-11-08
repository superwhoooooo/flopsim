// Headless Rapier stability test for the ragdoll (no rendering).
import { initPhysics, Physics, G, RAPIER } from '../src/physics.js';
import { Ragdoll } from '../src/ragdoll.js';

await initPhysics();
const phys = new Physics();
phys.addStaticBox(0, -0.5, 0, 200, 0.5, 200);
const rd = [];
for (let i = 0; i < 26; i++) {
  const r = new Ragdoll(phys, null, {});
  r.spawn((i % 6) * 3 - 7, Math.floor(i / 6) * 3 - 6, i * 0.7);
  rd.push(r);
}
const A = rd[0];
function stats(r) {
  const p = r.getPartPos('pelvis'), t = r.getPartPos('torso'), h = r.getPartPos('head');
  return `pelvis y=${p.y.toFixed(2)} torsoY=${t.y.toFixed(2)} headY=${h.y.toFixed(2)} xz=(${p.x.toFixed(1)},${p.z.toFixed(1)}) mode=${r.mode} speed=${r.speedXZ().toFixed(2)}`;
}
function run(sec, fn) {
  for (let i = 0; i < sec * 60; i++) {
    if (fn) fn(i);
    for (const r of rd) r.update(1 / 60);
    phys.step();
  }
}
let t0 = performance.now();
run(5);
console.log('stand 5s     ', stats(A), 'npc5', stats(rd[5]));
A.desired = { x: 0, z: 2 }; A.targetYaw = 0;
run(5);
console.log('walk 5s      ', stats(A));
A.desired = { x: 4.5, z: 0 }; A.targetYaw = Math.PI / 2;
run(4);
console.log('sprint 4s    ', stats(A));
A.desired = { x: 0, z: 0 };
run(2);
console.log('stop         ', stats(A));
// jump
A.hop(5.5); let maxY = 0;
run(1.2, () => { maxY = Math.max(maxY, A.getPartPos('pelvis').y); });
console.log('jump max pelvis y', maxY.toFixed(2), stats(A));
// strong hit
A.hit('torso', { x: 0.7, y: 0.3, z: 0.7 }, 9, 1.5);
run(0.5); console.log('after hit .5s', stats(A));
run(1.5); console.log('limp 2s      ', stats(A));
run(2.5); console.log('+2.5s        ', stats(A));
run(3); console.log('+3s          ', stats(A));
run(3); console.log('+3s          ', stats(A));
// multiple knockouts, check getting up each time
for (let k = 0; k < 5; k++) {
  A.hit('head', { x: Math.cos(k), y: 0.3, z: Math.sin(k) }, 11, 2);
  run(7);
  console.log('ko cycle', k, stats(A));
}
// bad cases: all NPCs, random hits, 30s
for (let i = 0; i < 20; i++) {
  rd[i % 26].hit('pelvis', { x: Math.random() - .5, y: 0.5, z: Math.random() - .5 }, 12, 2);
  run(1.5);
}
run(10);
let bad = 0;
for (const r of rd) { const p = r.getPartPos('torso'); if (!(p.y > 1.0 && p.y < 1.6) || r.mode !== 'active') { bad++; console.log('NOT UP', stats(r)); } if (!Number.isFinite(p.y)) console.log('NaN!'); }
console.log('not standing:', bad, 'of', rd.length);
console.log('elapsed ms', (performance.now() - t0).toFixed(0));
