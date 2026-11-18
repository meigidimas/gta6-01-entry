// Neon Bay Heat — cars: arcade drive physics, parked cars, and traffic.
// Driving is a scalar speed along the car's heading with strong lateral
// grip, so it feels planted without a full physics engine. Traffic cars
// cruise rectangular loops around city blocks and reverse out when stuck.
// The Payback rival lives here too: a dedicated striped sports car with
// its own fleeing AI (RivalCar), not a traffic car with a marker on it.

import * as THREE from 'three';
import { CAR, CITY, PALETTE, TRAFFIC } from './config.js';

// Models: sedan (default), van, sports, taxi and police. Each one is the
// same box-built language with different proportions and a couple of
// signature parts, so traffic reads as varied at a glance.
function buildCarMesh(paint, model = 'sedan') {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: paint });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1c2733 });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1a1d20 });

  const dims = {
    sedan: { w: 1.9, h: 0.62, l: 4.2, y: 0.62, cabin: true },
    van: { w: 2.0, h: 1.5, l: 4.7, y: 1.02, cabin: false },
    sports: { w: 1.95, h: 0.5, l: 4.3, y: 0.54, cabin: true },
    rival: { w: 1.95, h: 0.5, l: 4.3, y: 0.54, cabin: true },
    taxi: { w: 1.9, h: 0.62, l: 4.2, y: 0.62, cabin: true },
    police: { w: 1.9, h: 0.62, l: 4.2, y: 0.62, cabin: true },
  }[model] || { w: 1.9, h: 0.62, l: 4.2, y: 0.62, cabin: true };

  const body = new THREE.Mesh(new THREE.BoxGeometry(dims.w, dims.h, dims.l), bodyMat);
  body.position.y = dims.y;
  body.castShadow = true;
  group.add(body);

  if (dims.cabin) {
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.55, 2.1), glassMat);
    cabin.position.set(0, dims.y + 0.56, -0.25);
    cabin.castShadow = true;
    group.add(cabin);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 1.9), bodyMat);
    roof.position.set(0, dims.y + 0.86, -0.25);
    group.add(roof);
  } else {
    // A van's windshield is a dark slab on the nose.
    const shield = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 0.1), glassMat);
    shield.position.set(0, 1.35, dims.l / 2 + 0.01);
    group.add(shield);
  }

  if (model === 'sports' || model === 'rival') {
    // Low nose, rear spoiler.
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.4), darkMat);
    spoiler.position.set(0, 1.15, -2.0);
    group.add(spoiler);
    for (const sx of [-0.7, 0.7]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.08), darkMat);
      strut.position.set(sx, 0.98, -2.0);
      group.add(strut);
    }
  }

  if (model === 'rival') {
    // Black racing stripes down the hood and roof: the rival reads as
    // the mark from across the street, not just another magenta car.
    const stripeMat = new THREE.MeshLambertMaterial({ color: 0x14181d });
    const hoodStripe = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 1.3), stripeMat);
    hoodStripe.position.set(0, dims.y + dims.h / 2 + 0.02, 1.35);
    group.add(hoodStripe);
    const roofStripe = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 1.9), stripeMat);
    roofStripe.position.set(0, dims.y + 0.92, -0.25);
    group.add(roofStripe);
  }

  if (model === 'taxi') {
    const signMat = new THREE.MeshLambertMaterial({
      color: 0xfff6c9, emissive: 0xffe9a0, emissiveIntensity: 0.7,
    });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.34), signMat);
    sign.position.set(0, dims.y + 0.98, -0.25);
    group.add(sign);
  }

  // A police lightbar: red on the driver's side, blue on the other. The
  // materials come back out so the pursuit can flash them.
  let lights = null;
  if (model === 'police') {
    const barMat = new THREE.MeshLambertMaterial({ color: 0x14181d });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 0.34), barMat);
    bar.position.set(0, dims.y + 0.96, -0.25);
    group.add(bar);
    const leftMat = new THREE.MeshLambertMaterial({
      color: 0xd21f1f, emissive: 0xff2020, emissiveIntensity: 0.15,
    });
    const rightMat = new THREE.MeshLambertMaterial({
      color: 0x2050ff, emissive: 0x2050ff, emissiveIntensity: 0.15,
    });
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.2, 0.3), leftMat);
    left.position.set(-0.4, dims.y + 1.08, -0.25);
    group.add(left);
    const right = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.2, 0.3), rightMat);
    right.position.set(0.4, dims.y + 1.08, -0.25);
    group.add(right);
    // Black doors read as a patrol car even from a distance.
    const doorMat = new THREE.MeshLambertMaterial({ color: 0x1c2733 });
    for (const sx of [-1, 1]) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 1.6), doorMat);
      door.position.set(sx * (dims.w / 2 + 0.01), dims.y, -0.2);
      group.add(door);
    }
    lights = { left: leftMat, right: rightMat };
  }

  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  const wz = dims.l / 2 - 0.75;
  for (const [wx, wz2] of [[-0.88, wz], [0.88, wz], [-0.88, -wz], [0.88, -wz]]) {
    const wheel = new THREE.Mesh(wheelGeo, darkMat);
    wheel.position.set(wx, 0.36, wz2);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  }

  const headMat = new THREE.MeshLambertMaterial({
    color: 0xfff6c9, emissive: 0xfff2b0, emissiveIntensity: 0.5,
  });
  for (const hx of [-0.62, 0.62]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.1), headMat);
    lamp.position.set(hx, dims.y + 0.04, dims.l / 2 + 0.02);
    group.add(lamp);
  }
  const tailMat = new THREE.MeshLambertMaterial({
    color: 0xd21f1f, emissive: 0xa01010, emissiveIntensity: 0.6,
  });
  for (const hx of [-0.62, 0.62]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.1), tailMat);
    lamp.position.set(hx, dims.y + 0.04, -dims.l / 2 - 0.02);
    group.add(lamp);
  }

  return { group, wheels, bodyMat, lights };
}

export class Car {
  constructor(scene, { x = 0, z = 0, heading = 0, color = 0xd23b3b, parked = false, model = 'sedan' } = {}) {
    this.position = new THREE.Vector3(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.steerVisual = 0;
    this.parked = parked;
    this.paint = color;
    this.model = model;
    // Counts hard wall hits: the game loop watches this and plays the
    // crash thud when it rises, so the car never touches audio itself.
    this.crashCount = 0;
    // Patrol cars run a hotter engine than civilian traffic.
    this.topSpeed = CAR.maxSpeed;
    const built = buildCarMesh(color, model);
    this.group = built.group;
    this.wheels = built.wheels;
    this.bodyMat = built.bodyMat;
    this.lights = built.lights;
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
    this.speed = THREE.MathUtils.clamp(this.speed, -CAR.maxReverse, this.topSpeed);

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
      // A hard one also rings the crash counter once, so the game loop
      // can play the impact thud without the car knowing about audio.
      const moved = this.position.distanceTo(before);
      if (moved < Math.abs(this.speed) * dt * 0.4) {
        if (Math.abs(this.speed) > 4) this.crashCount++;
        this.speed *= 0.25;
      }
    }
    this._syncVisuals(dt);
  }

  driveToward(dt, tx, tz, cruiseSpeed, world, opts = {}) {
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
    // Slow down for sharp turns so traffic does not swing wide. The
    // pursuit opts out on the open road (brakeForTurns: false): a cop
    // that braked for every route corner lost ~70 m to Danny at each
    // one and never closed (harness loop1). turnBrakeFloor raises the
    // speed the braking stops at — the pursuit passes a higher floor
    // close in, so the cop sheds speed for the turn but keeps pace
    // instead of dropping to a crawl at every one.
    const brakeFloor = opts.turnBrakeFloor ?? 6;
    if (opts.brakeForTurns !== false && Math.abs(diff) > 0.7 && this.speed > brakeFloor) {
      throttle = -0.6;
    }
    this.drive(dt, throttle, steer, world);
    return dist;
  }

  carAhead(cars, range, halfWidth) {
    return this.gapAhead(cars, range, halfWidth) < range;
  }

  gapAhead(cars, range, halfWidth) {
    // Distance to the nearest car in this car's lane ahead of it, or
    // Infinity when the lane is clear — the graded version of carAhead,
    // so traffic can ease off instead of slamming to a stop.
    const f = this.forward();
    const rx = Math.cos(this.heading);
    const rz = -Math.sin(this.heading);
    let best = Infinity;
    for (const other of cars) {
      if (other === this) continue;
      const dx = other.position.x - this.position.x;
      const dz = other.position.z - this.position.z;
      const ahead = dx * f.x + dz * f.z;
      const lateral = Math.abs(dx * rx + dz * rz);
      if (ahead > 0 && ahead < range && lateral < halfWidth && ahead < best) {
        best = ahead;
      }
    }
    return best;
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
  // Parked variety without an RNG: the spot's own coordinates pick the
  // model, so the same city always parks the same cars.
  const pick = Math.abs(Math.round(spot.x * 7 + spot.z * 13)) % 6;
  const model = pick === 0 ? 'van' : pick === 1 ? 'sports' : pick === 2 ? 'taxi' : 'sedan';
  return new Car(scene, {
    x: spot.x, z: spot.z, heading: spot.heading,
    color: model === 'taxi' ? 0xf2c230 : color, parked: true, model,
  });
}

// A patrol car: white body, black doors, a flashing lightbar, and a
// hotter top speed so the pursuit can actually catch Danny.
export function createPoliceCar(scene, x, z, heading) {
  const car = new Car(scene, {
    x, z, heading, color: 0xf2f4f6, model: 'police',
  });
  car.topSpeed = 42;
  return car;
}

// The Payback rival's car: magenta, striped, spoilered, and a touch
// slower flat-out than Danny's best (36 vs 38 m/s), so a committed chase
// always catches it — the rubber-band in RivalCar keeps it tense, not
// the top speed.
export function createRivalCar(scene, x, z, heading) {
  const car = new Car(scene, {
    x, z, heading, color: 0xd63384, model: 'rival',
  });
  car.topSpeed = 36;
  return car;
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

// The nearest parked sedan — the hero car for screenshots and the play
// scene. A sedan reads as Danny's car; a taxi wears a roof sign, and a
// van or a sports car reads as set dressing. Falls back to the nearest
// parked car of any model when no sedan is left standing.
export function nearestParkedSedan(pos, parked, maxDist) {
  const sedans = parked.filter((car) => car.model === 'sedan');
  return nearestParkedCar(pos, sedans, maxDist)
    || nearestParkedCar(pos, parked, maxDist);
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
    this.rng = rng;
    this.cars = [];
    for (let i = 0; i < TRAFFIC.count; i++) {
      const route = makeLoopRoute(world, rng);
      const start = route[0];
      const next = route[1];
      const heading = Math.atan2(next.x - start.x, next.z - start.z);
      // Mixed traffic: mostly sedans, with vans, sports cars and the odd
      // yellow taxi among them.
      const model = rng.pick(['sedan', 'sedan', 'sedan', 'van', 'sports', 'taxi']);
      const color = model === 'taxi' ? 0xf2c230 : rng.pick(PALETTE.carPaints);
      const car = new Car(scene, {
        x: start.x, z: start.z, heading,
        color, model,
      });
      // Sports cars hurry, vans dawdle: the cruise speed follows the model.
      const pace = model === 'sports' ? 1.25 : model === 'van' ? 0.85 : 1;
      this.cars.push({
        car,
        route,
        waypoint: 1,
        cruise: rng.range(TRAFFIC.minCruise, TRAFFIC.maxCruise) * pace,
        stuckTimer: 0,
        stuckCount: 0,
        reverseTimer: 0,
        reverseSteer: 0.6,
        lastX: start.x,
        lastZ: start.z,
      });
    }
  }

  update(dt, playerCar, extraCars = []) {
    const others = this.cars.map((t) => t.car);
    if (playerCar) others.push(playerCar);
    for (const extra of extraCars) others.push(extra);
    for (const t of this.cars) {
      const target = t.route[t.waypoint];
      if (t.reverseTimer > 0) {
        t.reverseTimer -= dt;
        t.car.drive(dt, -0.8, t.reverseSteer, this.world);
        continue;
      }
      // Graded braking: ease off as the gap ahead closes, stop only when
      // it is properly tight — traffic queues instead of accordioning.
      const gap = t.car.gapAhead(others, 16, 2.6);
      let cruise = t.cruise;
      if (gap < 7) cruise = 0;
      else if (gap < 16) cruise = t.cruise * ((gap - 7) / 9);
      const dist = t.car.driveToward(dt, target.x, target.z, cruise, this.world);
      if (dist < TRAFFIC.waypointReach) {
        t.waypoint = (t.waypoint + 1) % t.route.length;
      }
      // Stuck recovery: barely moved while trying to drive. Reverse out,
      // steering the other way each time; if two reverses fail, the loop
      // itself is the problem, so pick a fresh route around another block.
      const moved = Math.hypot(t.car.position.x - t.lastX, t.car.position.z - t.lastZ);
      if (moved < 0.4 && Math.abs(t.car.speed) < 1.5) {
        t.stuckTimer += dt;
        if (t.stuckTimer > TRAFFIC.stuckSeconds) {
          t.stuckTimer = 0;
          t.stuckCount++;
          t.reverseSteer = t.stuckCount % 2 === 0 ? -0.7 : 0.7;
          t.reverseTimer = TRAFFIC.reverseSeconds;
          if (t.stuckCount >= 2) {
            t.stuckCount = 0;
            t.route = makeLoopRoute(this.world, this.rng);
            let nearest = 0;
            let nearestD = Infinity;
            t.route.forEach((corner, i) => {
              const d = Math.hypot(
                corner.x - t.car.position.x, corner.z - t.car.position.z,
              );
              if (d < nearestD) {
                nearestD = d;
                nearest = i;
              }
            });
            t.waypoint = nearest;
          }
        }
      } else {
        t.stuckTimer = 0;
      }
      t.lastX = t.car.position.x;
      t.lastZ = t.car.position.z;
    }
    this._separate(playerCar, extraCars);
  }

  _separate(playerCar, extraCars = []) {
    const all = this.cars.map((t) => t.car);
    if (playerCar) all.push(playerCar);
    for (const extra of extraCars) all.push(extra);
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

// The Payback rival: a dedicated car with its own fleeing AI. It runs
// road routes away from Danny and rubber-bands its cruise speed — quick
// when Danny is close, easing off when he falls far behind — so the
// chase stays tense without ever becoming uncatchable. Five solid rams
// disable it; the mission counts those, this class only drives and stops.
export class RivalCar {
  constructor(scene, world, rng, x, z, heading) {
    this.world = world;
    this.rng = rng;
    this.car = createRivalCar(scene, x, z, heading);
    this.state = 'flee'; // 'flee' | 'disabled'
    this.route = [];
    this.routeIndex = 0;
    this.routeTimer = 0;
    this.holdTimer = 0;
    this.holdX = x;
    this.holdZ = z;
    this.stuckTimer = 0;
    this.reverseTimer = 0;
    this.reverseSteer = 0.7;
    this.lastX = x;
    this.lastZ = z;
  }

  get position() {
    return this.car.position;
  }

  disable() {
    if (this.state === 'disabled') return;
    this.state = 'disabled';
    this.car.speed = 0;
  }

  remove(scene) {
    scene.remove(this.car.group);
  }

  update(dt, player, playerCar, others = []) {
    const car = this.car;
    if (this.state === 'disabled') {
      car.speed = 0;
      return;
    }
    if (this.reverseTimer > 0) {
      this.reverseTimer -= dt;
      car.drive(dt, -0.8, this.reverseSteer, this.world);
      return;
    }
    const dist = Math.hypot(
      car.position.x - player.position.x,
      car.position.z - player.position.z,
    );
    if (!playerCar) {
      // Danny is on foot: the rival loiters on a nearby road instead of
      // racing off, so the job stays playable — steal a car and the
      // chase is on. The hold point drifts every few seconds so the
      // rival never looks parked.
      this.holdTimer -= dt;
      if (this.holdTimer <= 0) {
        this.holdTimer = 4;
        const dx = car.position.x - player.position.x;
        const dz = car.position.z - player.position.z;
        const d = Math.hypot(dx, dz) || 1;
        const hold = this.world.nearestRoadPoint(
          THREE.MathUtils.clamp(player.position.x + (dx / d) * 28, -150, 150),
          THREE.MathUtils.clamp(player.position.z + (dz / d) * 28, -150, 150),
        );
        this.holdX = hold.x;
        this.holdZ = hold.z;
      }
      const holdDist = Math.hypot(car.position.x - this.holdX, car.position.z - this.holdZ);
      if (holdDist < 6) {
        if (Math.abs(car.speed) > 0.5) {
          car.drive(dt, car.speed > 0 ? -1 : 0.5, 0, this.world);
        } else {
          car.speed = 0;
        }
      } else {
        car.driveToward(dt, this.holdX, this.holdZ, 10, this.world);
      }
      this._recoverIfStuck(dt);
      return;
    }
    // Fleeing: an L-shaped road route away from Danny, rebuilt often so
    // the rival reacts when the chase turns a corner. The flee target
    // is the road point ~90 m out that gets farthest from Danny, with a
    // bonus for the straight-away direction — sampling eight directions
    // instead of running blindly away keeps the rival turning along the
    // edge roads instead of pinning itself against the world limit when
    // Danny herds it to the map edge (harness rival chase).
    this.routeTimer -= dt;
    if (this.routeTimer <= 0 || this.routeIndex >= this.route.length) {
      this.routeTimer = 1.5;
      this.routeIndex = 0;
      const dx = car.position.x - player.position.x;
      const dz = car.position.z - player.position.z;
      const d = Math.hypot(dx, dz) || 1;
      const awayX = dx / d;
      const awayZ = dz / d;
      const start = this.world.nearestRoadPoint(car.position.x, car.position.z);
      let best = null;
      let bestScore = -Infinity;
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const dirX = Math.sin(angle);
        const dirZ = Math.cos(angle);
        const tx = THREE.MathUtils.clamp(car.position.x + dirX * 90, -150, 150);
        const tz = THREE.MathUtils.clamp(car.position.z + dirZ * 90, -150, 150);
        const p = this.world.nearestRoadPoint(tx, tz);
        const score = Math.hypot(p.x - player.position.x, p.z - player.position.z)
          + 20 * (dirX * awayX + dirZ * awayZ);
        if (score > bestScore) {
          bestScore = score;
          best = p;
        }
      }
      const end = best || start;
      this.route = [start, { x: end.x, z: start.z }, end];
    }
    const wp = this.route[this.routeIndex];
    // Rubber-band: quick when Danny breathes down its neck, easing off
    // when he drops back, so the chase stays tense but catchable — the
    // player's 38 m/s always beats the rival's 34 m/s best.
    let cruise = 34;
    if (dist > 70) cruise = 20;
    else if (dist > 40) cruise = 26;
    else if (dist > 18) cruise = 31;
    // Brake for traffic ahead instead of piling into it.
    const gap = car.gapAhead(others, 16, 2.6);
    if (gap < 7) cruise = 0;
    else if (gap < 16) cruise = Math.min(cruise, 26 * ((gap - 7) / 9));
    const d = car.driveToward(dt, wp.x, wp.z, cruise, this.world);
    if (d < 6) this.routeIndex++;
    this._recoverIfStuck(dt);
  }

  _recoverIfStuck(dt) {
    const car = this.car;
    const moved = Math.hypot(car.position.x - this.lastX, car.position.z - this.lastZ);
    if (moved < 0.4 && Math.abs(car.speed) < 1.5) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 2) {
        this.stuckTimer = 0;
        this.reverseSteer = -this.reverseSteer;
        this.reverseTimer = 1.1;
      }
    } else {
      this.stuckTimer = 0;
    }
    this.lastX = car.position.x;
    this.lastZ = car.position.z;
  }
}
