// Neon Bay Heat — pedestrians.
// Folks out for a walk along the sidewalks. They stroll their block, turn
// at intersections, scatter when a car comes at them fast or a fight
// breaks out nearby, and go down hard when a car clips them — which the
// cops notice, if Danny was driving.

import * as THREE from 'three';
import { CITY, PLAYER } from './config.js';

const PED_COUNT = 14;
const WALK_SPEED = 1.4;
const FLEE_SPEED = 5.4;
const DOWN_SECONDS = 6;
const SIDEWALK_OFF = CITY.roadWidth / 2 + 1.5; // 7.5 m off the centreline
const CAR_SCARE_DIST = 14;
const CAR_SCARE_SPEED = 14;

const SHIRTS = [
  0xd23b3b, 0x2b6fd3, 0xf2c230, 0x37b24d, 0xe8722a,
  0x8a4fd3, 0x20b2aa, 0xe8e8e8, 0xd63384, 0x6a8caf,
];
const PANTS = [0x2b3a55, 0x3a3a3a, 0x5a4632, 0x24402e, 0x4a4a6a];
const SKINS = [0xc98d64, 0x8d5a3b, 0xe8b48c, 0x6b4423, 0xf2c9a0];

function buildPedFigure(rng) {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: rng.pick(SKINS) });
  const shirt = new THREE.MeshLambertMaterial({ color: rng.pick(SHIRTS) });
  const pants = new THREE.MeshLambertMaterial({ color: rng.pick(PANTS) });
  const hair = new THREE.MeshLambertMaterial({ color: rng.pick([0x2a1c12, 0x111111, 0x6b4a2a, 0x888888]) });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.68, 0.32), shirt);
  torso.position.y = 1.1;
  torso.castShadow = true;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.4, 0.36), skin);
  head.position.y = 1.68;
  head.castShadow = true;
  group.add(head);

  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.4), hair);
  cap.position.y = 1.9;
  group.add(cap);

  const legGeo = new THREE.BoxGeometry(0.22, 0.76, 0.26);
  legGeo.translate(0, -0.38, 0);
  const legL = new THREE.Mesh(legGeo, pants);
  legL.position.set(-0.15, 0.76, 0);
  legL.castShadow = true;
  group.add(legL);
  const legR = new THREE.Mesh(legGeo, pants);
  legR.position.set(0.15, 0.76, 0);
  legR.castShadow = true;
  group.add(legR);

  const armGeo = new THREE.BoxGeometry(0.17, 0.62, 0.2);
  armGeo.translate(0, -0.31, 0);
  const armL = new THREE.Mesh(armGeo, shirt);
  armL.position.set(-0.4, 1.4, 0);
  group.add(armL);
  const armR = new THREE.Mesh(armGeo, shirt);
  armR.position.set(0.4, 1.4, 0);
  group.add(armR);

  return { group, legL, legR, armL, armR };
}

export class Pedestrians {
  constructor(scene, world, rng, game) {
    this.scene = scene;
    this.world = world;
    this.rng = rng;
    this.game = game;
    this.peds = [];
    for (let i = 0; i < PED_COUNT; i++) {
      this.peds.push(this._spawnPed());
    }
  }

  _spawnPed() {
    const axis = this.rng.chance(0.5) ? 'x' : 'z';
    const line = this.rng.pick(this.world.roads);
    const side = this.rng.chance(0.5) ? 1 : -1;
    const along = this.rng.range(-CITY.edge + 15, CITY.edge - 15);
    const x = axis === 'x' ? along : line + side * SIDEWALK_OFF;
    const z = axis === 'x' ? line + side * SIDEWALK_OFF : along;
    const figure = buildPedFigure(this.rng);
    figure.group.position.set(x, 0, z);
    const heading = axis === 'x'
      ? (this.rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2)
      : (this.rng.chance(0.5) ? 0 : Math.PI);
    figure.group.rotation.y = heading;
    this.scene.add(figure.group);
    return {
      ...figure,
      heading,
      axis,
      line,
      side,
      dir: this.rng.chance(0.5) ? 1 : -1,
      speed: WALK_SPEED * this.rng.range(0.85, 1.2),
      state: 'walk', // 'walk' | 'flee' | 'down'
      walkPhase: this.rng.range(0, Math.PI * 2),
      fleeTimer: 0,
      fleeX: 0,
      fleeZ: 0,
      fleeReaim: 0, // counts down to the next flee-direction re-aim
      downTimer: 0,
      turnTimer: this.rng.range(3, 8),
    };
  }

  // Everyone nearby runs from a scare at (x, z): a punch, a crash, a shot.
  alarm(x, z, radius) {
    for (const ped of this.peds) {
      if (ped.state === 'down') continue;
      const dx = ped.group.position.x - x;
      const dz = ped.group.position.z - z;
      const d = Math.hypot(dx, dz);
      if (d > radius || d < 0.01) continue;
      this._startFlee(ped, dx / d, dz / d);
    }
  }

  nearest(pos, maxDist) {
    let best = null;
    let bestDist = maxDist;
    for (const ped of this.peds) {
      if (ped.state === 'down') continue;
      const d = Math.hypot(
        ped.group.position.x - pos.x, ped.group.position.z - pos.z,
      );
      if (d < bestDist) {
        bestDist = d;
        best = ped;
      }
    }
    return best;
  }

  knockDown(ped, dirX, dirZ) {
    if (ped.state === 'down') return;
    ped.state = 'down';
    ped.downTimer = DOWN_SECONDS;
    // Fall flat on the pavement, sliding a little with the hit.
    ped.group.rotation.x = -Math.PI / 2;
    ped.group.position.y = 0.35;
    ped.group.position.x += dirX * 1.1;
    ped.group.position.z += dirZ * 1.1;
    this.world.resolveCircle(ped.group.position, 0.5);
    ped.legL.rotation.x = 0;
    ped.legR.rotation.x = 0;
    ped.armL.rotation.x = 0;
    ped.armR.rotation.x = 0;
  }

  reset() {
    for (const ped of this.peds) {
      if (ped.state !== 'down') continue;
      ped.state = 'walk';
      ped.downTimer = 0;
      ped.group.rotation.x = 0;
      ped.group.position.y = 0;
    }
  }

  update(dt) {
    const playerCar = this.game.playerCar;
    const policeCars = this.game.police ? this.game.police.cars : [];
    for (const ped of this.peds) {
      if (ped.state === 'down') {
        ped.downTimer -= dt;
        if (ped.downTimer <= 0) {
          // Back on their feet — and straight into a run.
          ped.group.rotation.x = 0;
          ped.group.position.y = 0;
          const away = this._awayFrom(ped, this.game.player.position);
          this._startFlee(ped, away.x, away.z);
          ped.fleeTimer = 3;
        }
        continue;
      }
      if (ped.state === 'flee') {
        this._moveFlee(ped, dt);
        continue;
      }
      this._moveWalk(ped, dt);
      this._scanThreats(ped, playerCar, policeCars);
    }
    this._checkCarHits(playerCar, policeCars);
    this._separatePeds();
  }

  _separatePeds() {
    // Pedestrians give each other a little personal space instead of
    // walking through each other on a shared sidewalk.
    const peds = this.peds;
    for (let i = 0; i < peds.length; i++) {
      if (peds[i].state === 'down') continue;
      for (let j = i + 1; j < peds.length; j++) {
        if (peds[j].state === 'down') continue;
        const a = peds[i].group.position;
        const b = peds[j].group.position;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.01 && d < 1.1) {
          const push = (1.1 - d) / 2;
          const ux = dx / d;
          const uz = dz / d;
          a.x -= ux * push;
          a.z -= uz * push;
          b.x += ux * push;
          b.z += uz * push;
        }
      }
    }
  }

  _awayFrom(ped, pos) {
    const dx = ped.group.position.x - pos.x;
    const dz = ped.group.position.z - pos.z;
    const d = Math.hypot(dx, dz) || 1;
    return { x: dx / d, z: dz / d };
  }

  _startFlee(ped, dirX, dirZ) {
    ped.state = 'flee';
    ped.fleeX = dirX;
    ped.fleeZ = dirZ;
    ped.fleeTimer = this.rng.range(2.5, 4.5);
    ped.heading = Math.atan2(dirX, dirZ);
  }

  _moveFlee(ped, dt) {
    ped.fleeTimer -= dt;
    ped.fleeReaim -= dt;
    // Re-aim away from the threat as it moves: a ped running from a car
    // that turns after them should swerve, not jog in a straight line.
    if (ped.fleeReaim <= 0) {
      ped.fleeReaim = 0.4;
      const threat = this._nearestThreat(ped);
      if (threat) {
        const away = this._awayFrom(ped, threat);
        ped.fleeX = away.x;
        ped.fleeZ = away.z;
        ped.heading = Math.atan2(away.x, away.z);
      }
    }
    const pos = ped.group.position;
    pos.x += ped.fleeX * FLEE_SPEED * dt;
    pos.z += ped.fleeZ * FLEE_SPEED * dt;
    this.world.resolveCircle(pos, 0.5);
    ped.walkPhase += (FLEE_SPEED * dt) / 0.7;
    this._swingLimbs(ped, 0.7, true);
    ped.group.rotation.y = ped.heading;
    if (ped.fleeTimer <= 0) {
      // Calm down: find the nearest sidewalk and stroll again.
      ped.state = 'walk';
      this._snapToSidewalk(ped);
    }
  }

  _nearestThreat(ped) {
    // The closest fast car or the player, if either is near enough to
    // still be scary.
    const pos = ped.group.position;
    let best = null;
    let bestD = 18;
    const consider = (p) => {
      if (!p) return;
      const d = Math.hypot(p.x - pos.x, p.z - pos.z);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    };
    const playerCar = this.game.playerCar;
    if (playerCar && Math.abs(playerCar.speed) > 4) consider(playerCar.position);
    if (this.game.police) {
      for (const cop of this.game.police.cars) {
        if (Math.abs(cop.speed) > 4) consider(cop.position);
      }
    }
    if (!playerCar) consider(this.game.player.position);
    return best;
  }

  _snapToSidewalk(ped) {
    const pos = ped.group.position;
    const near = this.world.nearestRoadPoint(pos.x, pos.z);
    if (Math.abs(near.x - pos.x) < Math.abs(near.z - pos.z)) {
      ped.axis = 'z';
      ped.line = near.x;
      ped.side = pos.x >= near.x ? 1 : -1;
    } else {
      ped.axis = 'x';
      ped.line = near.z;
      ped.side = pos.z >= near.z ? 1 : -1;
    }
    ped.dir = this.rng.chance(0.5) ? 1 : -1;
    ped.turnTimer = this.rng.range(3, 8);
  }

  _moveWalk(ped, dt) {
    const pos = ped.group.position;
    // Drift back onto the sidewalk line if a flee left them adrift.
    const ideal = ped.line + ped.side * SIDEWALK_OFF;
    if (ped.axis === 'x') {
      const off = ideal - pos.z;
      pos.z += THREE.MathUtils.clamp(off, -1.2 * dt, 1.2 * dt);
      pos.x += ped.dir * ped.speed * dt;
      if (pos.x > CITY.edge - 8 || pos.x < -CITY.edge + 8) ped.dir *= -1;
    } else {
      const off = ideal - pos.x;
      pos.x += THREE.MathUtils.clamp(off, -1.2 * dt, 1.2 * dt);
      pos.z += ped.dir * ped.speed * dt;
      if (pos.z > CITY.edge - 8 || pos.z < -CITY.edge + 8) ped.dir *= -1;
    }
    ped.heading = ped.axis === 'x'
      ? (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2)
      : (ped.dir > 0 ? 0 : Math.PI);
    this.world.resolveCircle(pos, 0.5);

    // At an intersection, sometimes turn onto the crossing sidewalk.
    ped.turnTimer -= dt;
    if (ped.turnTimer <= 0) {
      ped.turnTimer = this.rng.range(3, 8);
      const cross = this._nearestCrossing(ped);
      if (cross !== null && this.rng.chance(0.35)) {
        ped.axis = ped.axis === 'x' ? 'z' : 'x';
        ped.line = cross;
        ped.side = this.rng.chance(0.5) ? 1 : -1;
        ped.dir = this.rng.chance(0.5) ? 1 : -1;
      }
    }

    ped.walkPhase += (ped.speed * dt) / PLAYER.stepLength;
    this._swingLimbs(ped, 0.45, false);
    ped.group.rotation.y = ped.heading;
  }

  _nearestCrossing(ped) {
    // The road line on the other axis, if one is close by.
    const pos = ped.group.position;
    const along = ped.axis === 'x' ? pos.x : pos.z;
    let best = null;
    let bestD = 3;
    for (const line of this.world.roads) {
      const d = Math.abs(line - along);
      if (d < bestD) {
        bestD = d;
        best = line;
      }
    }
    return best;
  }

  _swingLimbs(ped, amp, panicked) {
    const s = Math.sin(ped.walkPhase * Math.PI * 2) * amp;
    ped.legL.rotation.x = s;
    ped.legR.rotation.x = -s;
    if (panicked) {
      // Arms up, running scared.
      ped.armL.rotation.x = -2.4;
      ped.armR.rotation.x = -2.4;
    } else {
      ped.armL.rotation.x = -s * 0.8;
      ped.armR.rotation.x = s * 0.8;
    }
  }

  _scanThreats(ped, playerCar, policeCars) {
    const pos = ped.group.position;
    const threats = [];
    if (playerCar && Math.abs(playerCar.speed) > CAR_SCARE_SPEED) {
      threats.push(playerCar);
    }
    for (const cop of policeCars) {
      if (Math.abs(cop.speed) > CAR_SCARE_SPEED) threats.push(cop);
    }
    for (const car of threats) {
      const d = Math.hypot(car.position.x - pos.x, car.position.z - pos.z);
      if (d < CAR_SCARE_DIST) {
        const away = this._awayFrom(ped, car.position);
        this._startFlee(ped, away.x, away.z);
        return;
      }
    }
  }

  _checkCarHits(playerCar, policeCars) {
    const check = (car, byPlayer) => {
      if (!car || Math.abs(car.speed) < 2.5) return;
      for (const ped of this.peds) {
        if (ped.state === 'down') continue;
        const pos = ped.group.position;
        const dx = pos.x - car.position.x;
        const dz = pos.z - car.position.z;
        const d = Math.hypot(dx, dz);
        if (d > 2.1 || d < 0.01) continue;
        const f = car.forward();
        this.knockDown(ped, f.x, f.z);
        const px = pos.x;
        const pz = pos.z;
        this.alarm(px, pz, 25);
        if (byPlayer) {
          this.game.police.addHeat(1);
          this.game.hud.toast('You hit a pedestrian! +1 star.', 3000);
          this.game.audio.crashThud();
        }
      }
    };
    check(playerCar, true);
    for (const cop of policeCars) check(cop, false);
  }
}
