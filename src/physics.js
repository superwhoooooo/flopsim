// Thin wrapper around the Rapier world: fixed step, collision groups, collider ownership lookup.
import RAPIER from '@dimforge/rapier3d-compat';

export { RAPIER };

// Collision group membership bits
export const G = { WORLD: 1, TRUNK: 2, PROP: 4, LIMB: 8 };
export const groups = (membership, filter) => ((membership << 16) | filter) >>> 0;

export const FIXED_DT = 1 / 60;
export const GRAVITY = -12;

let initialised = false;
export async function initPhysics() {
  if (!initialised) {
    await RAPIER.init();
    initialised = true;
  }
}

export class Physics {
  constructor() {
    this.world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
    this.world.timestep = FIXED_DT;
    try {
      this.world.integrationParameters.numSolverIterations = 5;
    } catch (e) { /* older/newer API: ignore */ }
    // collider handle -> owner info ({ type:'part', ragdoll, part } | { type:'prop', prop })
    this.owners = new Map();
    this.ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    this.ball = new RAPIER.Ball(0.5);
    this.identity = { x: 0, y: 0, z: 0, w: 1 };
  }

  step() {
    this.world.step();
  }

  registerCollider(collider, owner) {
    this.owners.set(collider.handle, owner);
  }

  unregisterCollider(collider) {
    this.owners.delete(collider.handle);
  }

  ownerOf(collider) {
    return this.owners.get(collider.handle) || null;
  }

  addStaticBox(x, y, z, hx, hy, hz, rotY = 0) {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z)
      .setRotation({ x: 0, y: Math.sin(rotY / 2), z: 0, w: Math.cos(rotY / 2) }));
    const col = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(hx, hy, hz).setFriction(0.9).setCollisionGroups(groups(G.WORLD, 0xffff)), body);
    return { body, col };
  }

  addStaticCylinder(x, y, z, halfH, radius) {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z));
    const col = this.world.createCollider(
      RAPIER.ColliderDesc.cylinder(halfH, radius).setFriction(0.9).setCollisionGroups(groups(G.WORLD, 0xffff)), body);
    return { body, col };
  }

  // Cast a ray; returns { toi, collider, point } or null. `filter` (optional) = predicate(collider) => bool
  castRay(ox, oy, oz, dx, dy, dz, maxToi, groupsFilter, predicate) {
    this.ray.origin.x = ox; this.ray.origin.y = oy; this.ray.origin.z = oz;
    this.ray.dir.x = dx; this.ray.dir.y = dy; this.ray.dir.z = dz;
    const hit = this.world.castRay(this.ray, maxToi, true, undefined, groupsFilter, undefined, undefined, predicate);
    if (!hit) return null;
    return {
      toi: hit.timeOfImpact,
      collider: hit.collider,
      x: ox + dx * hit.timeOfImpact, y: oy + dy * hit.timeOfImpact, z: oz + dz * hit.timeOfImpact,
    };
  }

  // Call cb(collider) for every collider overlapping a sphere
  overlapSphere(x, y, z, radius, cb, predicate) {
    this.ball.radius = radius;
    this.world.intersectionsWithShape({ x, y, z }, this.identity, this.ball, (c) => { cb(c); return true; },
      undefined, undefined, undefined, undefined, predicate);
  }
}
