// Neon Bay Heat — cars: box-built bodies, arcade driving physics and
// traffic that follows the road grid. A car is one object whether it is
// parked, driven by the player, or cruising as traffic; its `state`
// field decides which update runs it.

import * as THREE from 'three';
import { CAR, TRAFFIC } from './config.js';

function buildCarMesh(color) {
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1c2833 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x15181c });
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(CAR.bodyWidth, 0.62, CAR.bodyLength), paint);
  body.position.y = 0.62;
  body.castShadow = true;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.55, 2.1), glass);
  cabin.position.set(0, 1.18, -0.25);
  cabin.castShadow = true;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 2.0), paint);
  roof.position.set(0, 1.48, -0.25);
  const bumperF = new THREE.Mesh(new THREE.BoxGeometry(CAR.bodyWidth, 0.22, 0.3), dark);
  bumperF.position.set(0, 0.42, CAR.bodyLength / 2);
  const bumperR = bumperF.clone();
  bumperR.position.z = -CAR.bodyLength / 2;
  const lightL = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), lightMat);
  lightL.position.set(-0.62, 0.72, CAR.bodyLength / 2 + 0.02);
  const lightR = lightL.clone();
  lightR.position.x = 0.62;
  group.add(body, cabin, roof, bumperF, bumperR, lightL, lightR);

  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [x, z, front] of [[-0.88, 1.45, true], [0.88, 1.45, true], [-0.88, -1.45, false], [0.88, -1.45, false]]) {
    const wheel = new THREE.Mesh(wheelGeo, dark);
    wheel.position.set(x, 0.36, z);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push({ mesh: wheel, front, spin: 0 });
  }
  return { group, wheels, paint };
}

function angleLerp(a, b, t) {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

export class Car {
  constructor(scene, color, x, z, heading, state = 'parked') {
    const parts = buildCarMesh(color);
    this.group = parts.group;
    this.wheels = parts.wheels;
    this.paintMat = parts.paint; // body + roof share this material
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = heading;
    this.speed = 0; // signed m/s along the heading
    this.health = CAR.maxHealth;
    this.state = state; // 'parked' | 'driven' | 'traffic'
    this.steerVisual = 0;
    this.waypoints = null; // traffic route, set by Traffic
    this.waypointIndex = 0;
    this.stuckTime = 0; // seconds the car has been wedged somewhere
    this.checkTimer = 0;
    this.lastCheckPos = null;
    this.group.position.copy(this.pos);
    this.group.rotation.y = heading;
    scene.add(this.group);
  }

  get speedKmh() {
    return Math.abs(this.speed) * 3.6;
  }

  // Repaint the body and roof (the staged scenes use a bright colour
  // so the hero car reads against the dark asphalt).
  setPaint(color) {
    this.paintMat.color.setHex(color);
  }

  // Arcade handling: engine force, drag, speed-sensitive steering and
  // a hard stop against buildings. Returns 'crash' on a damaging hit.
  drive(dt, throttle, steer, world) {
    const forward = throttle > 0;
    if (throttle !== 0) {
      if (forward) {
        this.speed += CAR.accel * throttle * dt;
      } else if (this.speed > 0.5) {
        this.speed -= CAR.brake * dt; // brake while rolling forward
      } else {
        this.speed -= CAR.reverseAccel * dt; // then reverse
      }
    }
    // Drag and rolling resistance always bleed speed.
    this.speed -= this.speed * CAR.drag * dt;
    if (this.speed > 0) this.speed = Math.max(0, this.speed - CAR.rollingDrag * dt);
    else if (this.speed < 0) this.speed = Math.min(0, this.speed + CAR.rollingDrag * dt);
    this.speed = THREE.MathUtils.clamp(this.speed, -CAR.maxReverse, CAR.maxSpeed);

    // Steering bites less at speed, and reverses with reverse gear.
    const speedFactor = 1 - CAR.steerSpeedFalloff * Math.min(1, Math.abs(this.speed) / CAR.maxSpeed);
    const turn = steer * CAR.steerRate * speedFactor * Math.min(1, Math.abs(this.speed) / 4);
    this.heading += turn * Math.sign(this.speed || 1) * dt;
    this.steerVisual += (steer * 0.42 - this.steerVisual) * Math.min(1, dt * 8);

    const before = this.pos.clone();
    this.pos.x += Math.sin(this.heading) * this.speed * dt;
    this.pos.z += Math.cos(this.heading) * this.speed * dt;
    const hit = world.resolveCircle(this.pos, 2.0);
    let event = null;
    if (hit) {
      const impact = Math.abs(this.speed);
      // Bounce back a little; a fast impact wrecks the car.
      this.speed *= -0.28;
      this.pos.copy(before);
      world.resolveCircle(this.pos, 2.0);
      if (impact > CAR.crashDamageSpeed) {
        this.health = Math.max(0, this.health - CAR.crashDamage);
        event = 'crash';
      }
    }
    this.syncVisual(dt);
    return event;
  }

  // Traffic driving: follow the route waypoints, ease around corners,
  // and slow down for the car ahead. Returns nothing.
  cruise(dt, world, others) {
    if (!this.waypoints || this.waypoints.length === 0) return;
    // Stuck recovery: a car shunted off-road against a building would
    // otherwise block the street forever. If it barely moved for two
    // seconds at speed, skip a waypoint and ease back onto the road.
    this.checkTimer += dt;
    if (this.checkTimer > 1) {
      this.checkTimer = 0;
      const moved = this.lastCheckPos
        ? Math.hypot(this.pos.x - this.lastCheckPos.x, this.pos.z - this.lastCheckPos.z)
        : 99;
      this.lastCheckPos = { x: this.pos.x, z: this.pos.z };
      this.stuckTime = (moved < 0.5 && this.speed > 2) ? this.stuckTime + 1 : 0;
      if (this.stuckTime >= 2) {
        this.stuckTime = 0;
        this.waypointIndex = (this.waypointIndex + 1) % this.waypoints.length;
        const road = world.nearestRoadPoint(this.pos.x, this.pos.z);
        this.pos.x += (road.x - this.pos.x) * 0.6;
        this.pos.z += (road.z - this.pos.z) * 0.6;
        const wp = this.waypoints[this.waypointIndex];
        this.heading = Math.atan2(wp.x - this.pos.x, wp.z - this.pos.z);
      }
    }
    const target = this.waypoints[this.waypointIndex];
    const dx = target.x - this.pos.x;
    const dz = target.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 4) {
      this.waypointIndex = (this.waypointIndex + 1) % this.waypoints.length;
      return;
    }
    const desired = Math.atan2(dx, dz);
    this.heading = angleLerp(this.heading, desired, Math.min(1, dt * 2.2));
    // Slow for traffic ahead: any car within the gap, roughly in front.
    let targetSpeed = TRAFFIC.cruiseSpeed;
    for (const other of others) {
      if (other === this) continue;
      const ox = other.pos.x - this.pos.x;
      const oz = other.pos.z - this.pos.z;
      const ahead = ox * Math.sin(this.heading) + oz * Math.cos(this.heading);
      const side = Math.abs(ox * Math.cos(this.heading) - oz * Math.sin(this.heading));
      if (ahead > 0 && ahead < TRAFFIC.minGap + 4 && side < 2.4) {
        targetSpeed = Math.min(targetSpeed, Math.max(0, other.speed));
      }
    }
    // Ease the speed toward the target, then roll.
    this.speed += (targetSpeed - this.speed) * Math.min(1, dt * 1.5);
    this.pos.x += Math.sin(this.heading) * this.speed * dt;
    this.pos.z += Math.cos(this.heading) * this.speed * dt;
    world.resolveCircle(this.pos, 2.0);
    this.syncVisual(dt);
  }

  // Wheels spin with speed; front wheels show the steering angle.
  syncVisual(dt) {
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
    for (const wheel of this.wheels) {
      wheel.spin += (this.speed / 0.36) * dt;
      wheel.mesh.rotation.x = wheel.spin;
      wheel.mesh.rotation.y = wheel.front ? this.steerVisual : 0;
    }
  }
}

// Parked cars the player can steal, placed on the kerb spots the world
// laid out. Returns the array of cars.
export function createParkedCars(scene, world, rng, count = 12) {
  const cars = [];
  const spots = [...world.parkSpots];
  for (let i = 0; i < count && spots.length > 0; i++) {
    const spot = spots.splice(Math.floor(rng.next() * spots.length), 1)[0];
    cars.push(new Car(scene, rng.pick(CAR.colours), spot.x, spot.z, spot.heading, 'parked'));
  }
  return cars;
}

// Traffic: cars looping rectangular routes around the road grid.
export class Traffic {
  constructor(scene, world, rng, count = TRAFFIC.count) {
    this.cars = [];
    for (let i = 0; i < count; i++) {
      const xA = rng.pick(world.roadXs);
      let xB = rng.pick(world.roadXs);
      if (xB === xA) xB = world.roadXs[(world.roadXs.indexOf(xA) + 2) % world.roadXs.length];
      const zA = rng.pick(world.roadZs);
      let zB = rng.pick(world.roadZs);
      if (zB === zA) zB = world.roadZs[(world.roadZs.indexOf(zA) + 2) % world.roadZs.length];
      const route = [
        { x: xA, z: zA }, { x: xB, z: zA }, { x: xB, z: zB }, { x: xA, z: zB },
      ];
      const start = route[Math.floor(rng.next() * route.length)];
      const car = new Car(scene, rng.pick(TRAFFIC.carColours), start.x, start.z, 0, 'traffic');
      car.waypoints = route;
      car.waypointIndex = (route.indexOf(start) + 1) % route.length;
      car.heading = Math.atan2(
        route[car.waypointIndex].x - start.x,
        route[car.waypointIndex].z - start.z,
      );
      car.speed = TRAFFIC.cruiseSpeed * rng.range(0.8, 1);
      this.cars.push(car);
    }
  }

  update(dt, world, playerCar) {
    const all = playerCar ? [...this.cars, playerCar] : this.cars;
    for (const car of this.cars) car.cruise(dt, world, all);
    separateCars(all);
  }
}

// Soft circle separation so cars never overlap: push both apart, and
// match speeds along the push direction instead of bleeding speed every
// step — the old per-step bleed made a car crawl forever behind traffic.
export function separateCars(cars) {
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      const dx = b.pos.x - a.pos.x;
      const dz = b.pos.z - a.pos.z;
      const dist = Math.hypot(dx, dz);
      const min = 3.4;
      if (dist >= min || dist < 1e-4) continue;
      const push = (min - dist) / 2;
      const nx = dx / dist;
      const nz = dz / dist;
      a.pos.x -= nx * push;
      a.pos.z -= nz * push;
      b.pos.x += nx * push;
      b.pos.z += nz * push;
      // How fast the pair is closing, along the normal from A to B.
      const aToward = a.speed * (Math.sin(a.heading) * nx + Math.cos(a.heading) * nz);
      const bToward = b.speed * (Math.sin(b.heading) * nx + Math.cos(b.heading) * nz);
      const closing = aToward - bToward;
      if (closing > 0.5) {
        // Whoever contributes more to the closing slows to the other's
        // pace; the other gets a small nudge. Once matched, closing is
        // ~0 and nothing more is taken — no endless crawl.
        if (aToward >= -bToward) {
          if (a.speed > 0) a.speed = Math.max(0, a.speed - closing * 0.6);
          b.speed = Math.min(b.speed + 1, 34);
        } else {
          if (b.speed > 0) b.speed = Math.max(0, b.speed - closing * 0.6);
          a.speed = Math.min(a.speed + 1, 34);
        }
      }
      a.syncVisual(0);
      b.syncVisual(0);
    }
  }
}

// The nearest stealable (parked) car within range of a point, or null.
export function nearestParkedCar(cars, x, z, range) {
  let best = null;
  let bestDist = range;
  for (const car of cars) {
    if (car.state !== 'parked') continue;
    const dist = Math.hypot(car.pos.x - x, car.pos.z - z);
    if (dist < bestDist) {
      best = car;
      bestDist = dist;
    }
  }
  return best;
}
