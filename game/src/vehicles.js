// Neon Bay Heat — cars: arcade drive physics, parked cars, and traffic.
// Driving is a scalar speed along the car's heading with strong lateral
// grip, so it feels planted without a full physics engine. Traffic cars
// cruise rectangular loops around city blocks and reverse out when stuck.

import * as THREE from 'three';
import { CAR, CITY, PALETTE, TRAFFIC } from './config.js';

function buildCarMesh(paint) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: paint });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1c2733 });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1a1d20 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.62, 4.2), bodyMat);
  body.position.y = 0.62;
  body.castShadow = true;
  group.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.55, 2.1), glassMat);
  cabin.position.set(0, 1.18, -0.25);
  cabin.castShadow = true;
  group.add(cabin);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 1.9), bodyMat);
  roof.position.set(0, 1.48, -0.25);
  group.add(roof);

  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [wx, wz] of [[-0.88, 1.35], [0.88, 1.35], [-0.88, -1.35], [0.88, -1.35]]) {
    const wheel = new THREE.Mesh(wheelGeo, darkMat);
    wheel.position.set(wx, 0.36, wz);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  }

  const headMat = new THREE.MeshLambertMaterial({
    color: 0xfff6c9, emissive: 0xfff2b0, emissiveIntensity: 0.5,
  });
  for (const hx of [-0.62, 0.62]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.1), headMat);
    lamp.position.set(hx, 0.66, 2.12);
    group.add(lamp);
  }
  const tailMat = new THREE.MeshLambertMaterial({
    color: 0xd21f1f, emissive: 0xa01010, emissiveIntensity: 0.6,
  });
  for (const hx of [-0.62, 0.62]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.1), tailMat);
    lamp.position.set(hx, 0.66, -2.12);
    group.add(lamp);
  }

  return { group, wheels, bodyMat };
}

export class Car {
  constructor(scene, { x = 0, z = 0, heading = 0, color = 0xd23b3b, parked = false } = {}) {
    this.position = new THREE.Vector3(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.steerVisual = 0;
    this.parked = parked;
    this.paint = color;
    const built = buildCarMesh(color);
    this.group = built.group;
    this.wheels = built.wheels;
    this.bodyMat = built.bodyMat;
    this.group.position.copy(this.position);
    this.group.rotation.y = heading;
    scene.add(this.group);
  }

  get speedKmh() {
    return Math.abs(this.speed) * 3.6;
  }

  setPaint(color) {
    this.paint = color;
    this.bodyMat.color.setHex(color);
  }

  forward() {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  }

  drive(dt, throttle, steer, world) {
    // throttle: +1 gas, -1 brake/reverse. steer: +1 right, -1 left.
    if (throttle > 0) {
      this.speed += CAR.accel * throttle * dt;
    } else if (throttle < 0) {
      if (this.speed > 0.5) this.speed += CAR.brake * throttle * dt;
      else this.speed += CAR.reverseAccel * throttle * dt;
    }
    // Rolling drag and a gentle coast-down.
    this.speed -= this.speed * CAR.drag * dt * (throttle === 0 ? 1.6 : 0.35);
    if (throttle === 0 && Math.abs(this.speed) < 0.15) this.speed = 0;
    this.speed = THREE.MathUtils.clamp(this.speed, -CAR.maxReverse, CAR.maxSpeed);

    const speedFactor = THREE.MathUtils.clamp(Math.abs(this.speed) / 12, 0, 1);
    const authority = CAR.steerRate * (1 - speedFactor * (1 - CAR.steerFalloff));
    this.heading += steer * authority * dt * Math.sign(this.speed || 1) * Math.min(1, Math.abs(this.speed) / 2 + 0.25);
    this.steerVisual += (steer * 0.42 - this.steerVisual) * (1 - Math.exp(-8 * dt));

    const f = this.forward();
    const nx = this.position.x + f.x * this.speed * dt;
    const nz = this.position.z + f.z * this.speed * dt;
    const before = this.position.clone();
    this.position.x = nx;
    this.position.z = nz;
    if (world.resolveCircle(this.position, CAR.radius)) {
      // A wall hit kills most of the speed and nudges the car back out.
      const moved = this.position.distanceTo(before);
      if (moved < Math.abs(this.speed) * dt * 0.4) this.speed *= 0.25;
    }
    this._syncVisuals(dt);
  }

  driveToward(dt, tx, tz, cruiseSpeed, world) {
    // Point the nose at (tx, tz) and hold a cruise speed. Returns distance.
    const dx = tx - this.position.x;
    const dz = tz - this.position.z;
    const dist = Math.hypot(dx, dz);
    const wantHeading = Math.atan2(dx, dz);
    let diff = wantHeading - this.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = THREE.MathUtils.clamp(diff * 1.6, -1, 1);
    let throttle = 0;
    if (this.speed < cruiseSpeed) throttle = 0.7;
    else if (this.speed > cruiseSpeed + 2) throttle = -0.4;
    // Slow down for sharp turns so traffic does not swing wide.
    if (Math.abs(diff) > 0.7 && this.speed > 6) throttle = -0.6;
    this.drive(dt, throttle, steer, world);
    return dist;
  }

  carAhead(cars, range, halfWidth) {
    // True when another car sits in this car's lane ahead of it.
    const f = this.forward();
    const rx = Math.cos(this.heading);
    const rz = -Math.sin(this.heading);
    for (const other of cars) {
      if (other === this) continue;
      const dx = other.position.x - this.position.x;
      const dz = other.position.z - this.position.z;
      const ahead = dx * f.x + dz * f.z;
      const lateral = Math.abs(dx * rx + dz * rz);
      if (ahead > 0 && ahead < range && lateral < halfWidth) return true;
    }
    return false;
  }

  _syncVisuals(dt) {
    this.group.position.copy(this.position);
    this.group.rotation.y = this.heading;
    const spin = (this.speed * dt) / 0.36;
    for (let i = 0; i < this.wheels.length; i++) {
      this.wheels[i].rotation.x += spin;
    }
    this.wheels[0].rotation.y = this.steerVisual;
    this.wheels[1].rotation.y = this.steerVisual;
  }
}

export function createParkedCar(scene, spot, color) {
  return new Car(scene, {
    x: spot.x, z: spot.z, heading: spot.heading, color, parked: true,
  });
}

export function nearestParkedCar(pos, parked, maxDist) {
  let best = null;
  let bestDist = maxDist;
  for (const car of parked) {
    if (!car.parked) continue;
    const d = Math.hypot(car.position.x - pos.x, car.position.z - pos.z);
    if (d < bestDist) {
      bestDist = d;
      best = car;
    }
  }
  return best;
}

function makeLoopRoute(world, rng) {
  // A rectangular loop around one city block, driven on the right side.
  const bx = rng.int(0, CITY.grid - 2);
  const bz = rng.int(0, CITY.grid - 2);
  const x0 = world.roads[bx];
  const x1 = world.roads[bx + 1];
  const z0 = world.roads[bz];
  const z1 = world.roads[bz + 1];
  const lane = 2.6;
  const clockwise = rng.chance(0.5);
  const corners = clockwise
    ? [
      { x: x0 + lane, z: z0 + lane },
      { x: x1 - lane, z: z0 + lane },
      { x: x1 - lane, z: z1 - lane },
      { x: x0 + lane, z: z1 - lane },
    ]
    : [
      { x: x0 + lane, z: z0 + lane },
      { x: x0 + lane, z: z1 - lane },
      { x: x1 - lane, z: z1 - lane },
      { x: x1 - lane, z: z0 + lane },
    ];
  return corners;
}

export class Traffic {
  constructor(scene, world, rng) {
    this.world = world;
    this.cars = [];
    for (let i = 0; i < TRAFFIC.count; i++) {
      const route = makeLoopRoute(world, rng);
      const start = route[0];
      const next = route[1];
      const heading = Math.atan2(next.x - start.x, next.z - start.z);
      const car = new Car(scene, {
        x: start.x, z: start.z, heading,
        color: rng.pick(PALETTE.carPaints),
      });
      this.cars.push({
        car,
        route,
        waypoint: 1,
        cruise: rng.range(TRAFFIC.minCruise, TRAFFIC.maxCruise),
        stuckTimer: 0,
        reverseTimer: 0,
        lastX: start.x,
        lastZ: start.z,
      });
    }
  }

  update(dt, playerCar) {
    const others = this.cars.map((t) => t.car);
    if (playerCar) others.push(playerCar);
    for (const t of this.cars) {
      const target = t.route[t.waypoint];
      if (t.reverseTimer > 0) {
        t.reverseTimer -= dt;
        t.car.drive(dt, -0.8, 0.6, this.world);
        continue;
      }
      // Brake for the car ahead instead of ramming it: traffic queues
      // politely at corners and behind the player's car.
      const cruise = t.car.carAhead(others, 9, 2.6) ? 0 : t.cruise;
      const dist = t.car.driveToward(dt, target.x, target.z, cruise, this.world);
      if (dist < TRAFFIC.waypointReach) {
        t.waypoint = (t.waypoint + 1) % t.route.length;
      }
      // Stuck recovery: barely moved while trying to drive.
      const moved = Math.hypot(t.car.position.x - t.lastX, t.car.position.z - t.lastZ);
      if (moved < 0.4 && Math.abs(t.car.speed) < 1.5) {
        t.stuckTimer += dt;
        if (t.stuckTimer > TRAFFIC.stuckSeconds) {
          t.stuckTimer = 0;
          t.reverseTimer = TRAFFIC.reverseSeconds;
        }
      } else {
        t.stuckTimer = 0;
      }
      t.lastX = t.car.position.x;
      t.lastZ = t.car.position.z;
    }
    this._separate(playerCar);
  }

  _separate(playerCar) {
    const all = this.cars.map((t) => t.car);
    if (playerCar) all.push(playerCar);
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i];
        const b = all[j];
        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const d = Math.hypot(dx, dz);
        const min = TRAFFIC.separation;
        if (d > 0.01 && d < min) {
          const push = (min - d) / 2;
          const ux = dx / d;
          const uz = dz / d;
          a.position.x -= ux * push;
          a.position.z -= uz * push;
          b.position.x += ux * push;
          b.position.z += uz * push;
        }
      }
    }
  }
}
