// Neon Bay Heat — the police.
// Wanted stars drive a pursuit: patrol cars spawn on nearby roads and chase
// Danny whether he is driving or on foot, a helicopter circles overhead
// with a spotlight from three stars up, and the heat only cools when Danny
// stays out of sight for a while. Get cornered while slow and it is
// BUSTED; let a ram drop your health to zero and it is WASTED. On foot,
// foot officers join the chase too: they run Danny down, and one holding
// him for a second and a bit makes the arrest — punch back or get in a
// car to break free.

import * as THREE from 'three';
import { PLAYER, WANTED } from './config.js';
import { createPoliceCar } from './vehicles.js';
import { buildOfficerFigure } from './peds.js';

// How many patrol cars each wanted level fields. Five is the cap: the
// pursuit has to feel hot, not turn the city into a parking lot.
const UNITS_PER_STAR = [0, 1, 2, 3, 4, 5];
const HELI_STARS = 3;
const SPAWN_MIN_DIST = 45;
const SPAWN_MAX_DIST = 95;
const RESPAWN_DIST = 175;
// A unit sees Danny within this range with a clear line of sight. It
// used to be 55 m, which made a cop blind on an open road the moment
// Danny pulled 56 m ahead: the unit drove to the last-seen spot, sat
// there, and the heat decayed while Danny was still in plain view down
// a straight road (harness loop1). At 90 m, distance alone no longer
// hides Danny on open roads — buildings do, through the line-of-sight
// check — and the 7 s decay clock only runs when he is genuinely out
// of sight.
const SEE_RANGE = 90;
// Foot officers: how many each wanted level fields (three is the cap, for
// performance and for fairness), and how the foot chase plays. Officers
// run a touch faster than Danny's 8 m/s sprint, so a straight sprint
// alone never shakes them — break line of sight, punch one down, or get
// in a car.
const OFFICERS_PER_STAR = [0, 1, 2, 2, 3, 3];
const OFFICER_RUN_SPEED = 8.4;
const OFFICER_SPAWN_MIN = 12;
const OFFICER_SPAWN_MAX = 30;
const OFFICER_DESPAWN_DIST = 90;
const OFFICER_ARREST_RANGE = 1.8;
const OFFICER_ARREST_SECONDS = 1.2;
const OFFICER_DOWN_SECONDS = 5;
const OFFICER_SPAWN_INTERVAL = 1.0;
const HIDDEN_DECAY_SECONDS = 7;
const BUST_FOOT_SECONDS = 2.5;
const BUST_CAR_SECONDS = 3.0;
const BUST_FOOT_RANGE = 6;
const BUST_CAR_RANGE = 7;
const RAM_DAMAGE_COOLDOWN = 1.2;
const RAM_RANGE = 4.6; // just outside traffic's 4.5 m separation
// A patrol car running Danny down on foot re-aims far slower than a
// car-to-car ram: sharing the 1.2 s cooldown let one cop farm a sprinter
// for 12 damage every 1.2 s (harness foot1: 228 damage in 30 s).
const FOOT_RAM_COOLDOWN = 3.0;
// A cop that has caught a slow player pulls up and holds instead of
// driving through them: the arrest pose, and what lets the bust timer run.
const HOLD_FOOT_RANGE = 6;
const HOLD_CAR_RANGE = 7;

function angleLerp(a, b, t) {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

export class Police {
  constructor(scene, world, rng, game) {
    this.scene = scene;
    this.world = world;
    this.rng = rng;
    this.game = game;
    this._units = []; // { car, hp, state, ramCooldown, heatCooldown, ... }
    this._officers = []; // { figure, heading, state, walkPhase, ... }
    this._heli = null; // { group, rotor, cone, glow, angle }
    this._spawnTimer = 0;
    this._officerTimer = 0;
    this._hiddenTimer = 0;
    // The heat cannot decay before the pursuit has seen Danny at least
    // once: without this, a unit spawning 90 m out — beyond the 55 m
    // see range — let the hidden timer run from the first second, and a
    // one-star chase evaporated in seven seconds before the cop ever
    // closed in (harness loop1).
    this._everSeen = false;
    this._bustedTimer = 0;
    this._bustWarned = false;
    this._arrestWarned = false;
    this._flashTime = 0;
    this._time = 0;
  }

  // ----- shared contract: missions poll these -----

  get pursuing() {
    return this._units.some((u) => u.state === 'chase');
  }

  get units() {
    return this._units.length;
  }

  get helicopter() {
    return this._heli !== null;
  }

  // The patrol cars themselves, for the minimap dots.
  get cars() {
    return this._units.map((u) => u.car);
  }

  // The live pursuit units (car, hp, state) — combat punches them through here.
  get patrolUnits() {
    return this._units;
  }

  // The foot officers on the street — combat punches them, the minimap
  // dots them. Empty while Danny is in a car.
  get officers() {
    return this._officers;
  }

  // Distance from Danny to the nearest chasing unit, or Infinity when
  // none is out — the siren's volume follows this.
  nearestUnitDistance() {
    const target = this._playerTarget();
    let best = Infinity;
    for (const unit of this._units) {
      if (unit.state !== 'chase') continue;
      const d = Math.hypot(
        unit.car.position.x - target.x, unit.car.position.z - target.z,
      );
      if (d < best) best = d;
    }
    return best;
  }

  addHeat(stars) {
    if (stars <= 0) return;
    this.setWanted(this.game.wanted + stars);
  }

  setWanted(stars) {
    const next = THREE.MathUtils.clamp(Math.round(stars), 0, WANTED.maxStars);
    const rising = next > this.game.wanted;
    this.game.wanted = next;
    this._hiddenTimer = 0;
    // Fresh heat brings a fresh unit at once, not after the spawn timer,
    // and the decay clock waits until the new pursuit has made contact.
    if (rising) {
      this._spawnTimer = 0;
      this._everSeen = false;
    }
    if (next === 0) {
      this._removeAllUnits();
      this._removeAllOfficers();
      this._removeHeli();
    }
  }

  clearPursuit() {
    this.game.wanted = 0;
    this._hiddenTimer = 0;
    this._everSeen = false;
    this._spawnTimer = 0;
    this._officerTimer = 0;
    this._bustedTimer = 0;
    this._bustWarned = false;
    this._arrestWarned = false;
    this._removeAllUnits();
    this._removeAllOfficers();
    this._removeHeli();
  }

  // A cop car beaten down by punches stops dead, then gets towed away.
  disableUnit(unit) {
    if (unit.state !== 'chase') return;
    unit.state = 'disabled';
    unit.car.speed = 0;
    unit.disableTimer = 4;
    this._setLights(unit, 0, 0);
  }

  // ----- per-step update -----

  update(dt) {
    this._time += dt;
    this._flashTime += dt;
    const wanted = this.game.wanted;
    if (wanted <= 0) return;

    this._manageUnits(dt, wanted);
    this._manageOfficers(dt, wanted);
    this._manageHeli(wanted);

    const player = this.game.player;
    const playerCar = this.game.playerCar;
    const target = playerCar ? playerCar.position : player.position;

    let seen = this._heli !== null;
    for (const unit of this._units) {
      if (unit.state === 'disabled') {
        unit.disableTimer -= dt;
        if (unit.disableTimer <= 0) this._removeUnit(unit);
        continue;
      }
      const d = Math.hypot(
        unit.car.position.x - target.x,
        unit.car.position.z - target.z,
      );
      // A unit sees Danny only with a clear line of sight: ducking
      // behind a building breaks the lock, even up close.
      const sees = d < SEE_RANGE && this._hasLineOfSight(unit.car.position, target);
      if (sees) {
        seen = true;
        unit.lastSeenX = target.x;
        unit.lastSeenZ = target.z;
        unit.hasLastSeen = true;
      }
      if (d > RESPAWN_DIST) {
        // Lost the trail far behind: rejoin the chase from a road near Danny.
        this._placeNearPlayer(unit.car, target);
      }
      // A unit that lost sight drives to where it last saw Danny and
      // waits there, instead of homing in on him through walls.
      const aim = sees || !unit.hasLastSeen
        ? target
        : { x: unit.lastSeenX, z: unit.lastSeenZ };
      this._chase(dt, unit, aim, wanted, sees);
      this._checkRam(unit, player, playerCar);
      this._flashLights(unit);
    }
    // Units removed mid-loop above leave holes; compact the list.
    if (this._units.some((u) => u._gone)) {
      this._units = this._units.filter((u) => !u._gone);
    }
    this._separateUnits();
    this._updateOfficers(dt);
    this._updateHeli(dt, target);

    // Heat decay: stay unseen and the stars bleed off one at a time.
    // Being spotted loosens the hiding instead of erasing it outright,
    // so repeated short breaks from the pursuit add up to losing them.
    // The clock only runs after first contact (see _everSeen): the heat
    // cannot bleed off while the cops are still driving to the scene.
    if (seen) {
      this._everSeen = true;
      this._hiddenTimer = Math.max(0, this._hiddenTimer - dt * 2);
    } else if (this._everSeen) {
      this._hiddenTimer += dt;
      if (this._hiddenTimer >= HIDDEN_DECAY_SECONDS) {
        this._hiddenTimer = 0;
        this.setWanted(wanted - 1);
        if (wanted - 1 === 0) {
          this.game.hud.toast('You lost the heat.', 2500);
        }
      }
    }

    this._checkBusted(dt, player, playerCar);
  }

  // ----- unit management -----

  _manageUnits(dt, wanted) {
    const desired = UNITS_PER_STAR[wanted];
    // Trim the farthest units first when the heat drops.
    while (this._units.length > desired) {
      const target = this._playerTarget();
      let far = null;
      let farD = -1;
      for (const u of this._units) {
        const d = Math.hypot(
          u.car.position.x - target.x, u.car.position.z - target.z,
        );
        if (d > farD) {
          farD = d;
          far = u;
        }
      }
      if (far) this._removeUnit(far);
      else break;
    }
    if (this._units.length < desired) {
      this._spawnTimer -= dt;
      if (this._spawnTimer <= 0) {
        this._spawnTimer = 1.2;
        this._spawnUnit();
      }
    }
  }

  _playerTarget() {
    const playerCar = this.game.playerCar;
    return playerCar ? playerCar.position : this.game.player.position;
  }

  _spawnUnit() {
    const target = this._playerTarget();
    const spot = this._pickSpawnPoint(target);
    const heading = Math.atan2(
      target.x - spot.x, target.z - spot.z,
    );
    const car = createPoliceCar(this.scene, spot.x, spot.z, heading);
    this._units.push({
      car,
      hp: 100,
      state: 'chase',
      ramCooldown: 0,
      footRamCooldown: 0,
      heatCooldown: 0,
      stuckTimer: 0,
      reverseTimer: 0,
      reverseSteer: 0.7,
      disableTimer: 0,
      route: [], // road waypoints toward the player, rebuilt often
      routeIndex: 0,
      routeTimer: 0,
      lastSeenX: spot.x,
      lastSeenZ: spot.z,
      hasLastSeen: false,
      lastX: spot.x,
      lastZ: spot.z,
      _gone: false,
    });
  }

  _pickSpawnPoint(target, minDist = SPAWN_MIN_DIST, maxDist = SPAWN_MAX_DIST) {
    for (let i = 0; i < 10; i++) {
      const p = this.world.randomRoadPoint(this.rng);
      const d = Math.hypot(p.x - target.x, p.z - target.z);
      if (d >= minDist && d <= maxDist) return p;
    }
    // Fallback: the nearest road, a fixed hop away from Danny.
    const near = this.world.nearestRoadPoint(target.x, target.z);
    return { x: near.x + minDist, z: near.z };
  }

  _placeNearPlayer(car, target) {
    const spot = this._pickSpawnPoint(target);
    car.position.set(spot.x, 0, spot.z);
    car.heading = Math.atan2(target.x - spot.x, target.z - spot.z);
    car.speed = Math.min(car.speed, 12);
    car.group.position.copy(car.position);
    car.group.rotation.y = car.heading;
  }

  _removeUnit(unit) {
    unit._gone = true;
    this.scene.remove(unit.car.group);
  }

  _removeAllUnits() {
    for (const unit of this._units) {
      this.scene.remove(unit.car.group);
    }
    this._units = [];
  }

  // ----- foot officers -----

  _manageOfficers(dt, wanted) {
    // Officers chase on foot only: the moment Danny is in a car they
    // are out of the hunt (the patrol cars take it from there).
    if (this.game.playerCar || wanted <= 0) {
      if (this._officers.length > 0) this._removeAllOfficers();
      return;
    }
    const desired = OFFICERS_PER_STAR[wanted];
    // Trim the farthest officers first when the heat drops.
    while (this._officers.length > desired) {
      const target = this.game.player.position;
      let far = null;
      let farD = -1;
      for (const o of this._officers) {
        const d = Math.hypot(
          o.figure.group.position.x - target.x,
          o.figure.group.position.z - target.z,
        );
        if (d > farD) {
          farD = d;
          far = o;
        }
      }
      if (far) this._removeOfficer(far);
      else break;
    }
    if (this._officers.length < desired) {
      this._officerTimer -= dt;
      if (this._officerTimer <= 0) {
        this._officerTimer = OFFICER_SPAWN_INTERVAL;
        this._spawnOfficer();
      }
    }
  }

  _spawnOfficer() {
    const target = this.game.player.position;
    const spot = this._pickSpawnPoint(target, OFFICER_SPAWN_MIN, OFFICER_SPAWN_MAX);
    const figure = buildOfficerFigure(this.rng);
    figure.group.position.set(spot.x, 0, spot.z);
    const heading = Math.atan2(target.x - spot.x, target.z - spot.z);
    figure.group.rotation.y = heading;
    this.scene.add(figure.group);
    this._officers.push({
      figure,
      heading,
      state: 'chase', // 'chase' | 'down'
      walkPhase: this.rng.range(0, Math.PI * 2),
      arrestTimer: 0,
      downTimer: 0,
      lastSeenX: spot.x,
      lastSeenZ: spot.z,
      hasLastSeen: false,
      _gone: false,
    });
  }

  _removeOfficer(officer) {
    officer._gone = true;
    this.scene.remove(officer.figure.group);
  }

  _removeAllOfficers() {
    for (const officer of this._officers) {
      this.scene.remove(officer.figure.group);
    }
    this._officers = [];
  }

  // A punch puts an officer on the pavement for a few seconds. They get
  // back up and resume the chase — punching a cop is a way out of a
  // grab, not a way out of the heat.
  knockDownOfficer(officer) {
    if (officer.state === 'down') return;
    officer.state = 'down';
    officer.downTimer = OFFICER_DOWN_SECONDS;
    officer.arrestTimer = 0;
    officer.figure.group.rotation.x = -Math.PI / 2;
    officer.figure.group.position.y = 0.35;
    officer.figure.legL.rotation.x = 0;
    officer.figure.legR.rotation.x = 0;
    officer.figure.armL.rotation.x = 0;
    officer.figure.armR.rotation.x = 0;
  }

  _updateOfficers(dt) {
    const player = this.game.player;
    if (this.game.playerCar) return; // managed out by _manageOfficers
    let contact = false;
    for (const officer of this._officers) {
      const pos = officer.figure.group.position;
      if (officer.state === 'down') {
        officer.downTimer -= dt;
        if (officer.downTimer <= 0) {
          officer.state = 'chase';
          officer.figure.group.rotation.x = 0;
          pos.y = 0;
        }
        continue;
      }
      const dx = player.position.x - pos.x;
      const dz = player.position.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > OFFICER_DESPAWN_DIST) {
        // Left far behind: gone, and a fresh one spawns near Danny.
        this._removeOfficer(officer);
        continue;
      }
      // Like the patrol cars, an officer only homes in on Danny with a
      // clear line of sight; otherwise they run to where they last saw
      // him and wait there, so ducking behind a building still works.
      const sees = dist < SEE_RANGE && this._hasLineOfSight(pos, player.position);
      if (sees) {
        officer.lastSeenX = player.position.x;
        officer.lastSeenZ = player.position.z;
        officer.hasLastSeen = true;
      }
      const aimX = sees || !officer.hasLastSeen ? player.position.x : officer.lastSeenX;
      const aimZ = sees || !officer.hasLastSeen ? player.position.z : officer.lastSeenZ;
      const aimDx = aimX - pos.x;
      const aimDz = aimZ - pos.z;
      const aimDist = Math.hypot(aimDx, aimDz);
      if (!sees && aimDist < 4) {
        // Lost the trail: stand at the last-seen spot and look around.
        officer.figure.legL.rotation.x = 0;
        officer.figure.legR.rotation.x = 0;
        officer.figure.armL.rotation.x = 0;
        officer.figure.armR.rotation.x = 0;
        officer.arrestTimer = Math.max(0, officer.arrestTimer - dt * 2);
        continue;
      }
      const wantHeading = Math.atan2(aimDx, aimDz);
      officer.heading = angleLerp(officer.heading, wantHeading, 1 - Math.exp(-8 * dt));
      pos.x += Math.sin(officer.heading) * OFFICER_RUN_SPEED * dt;
      pos.z += Math.cos(officer.heading) * OFFICER_RUN_SPEED * dt;
      this.world.resolveCircle(pos, 0.5);
      officer.walkPhase += (OFFICER_RUN_SPEED * dt) / PLAYER.stepLength;
      const s = Math.sin(officer.walkPhase * Math.PI * 2) * 0.7;
      officer.figure.legL.rotation.x = s;
      officer.figure.legR.rotation.x = -s;
      officer.figure.armL.rotation.x = -s * 0.8;
      officer.figure.armR.rotation.x = s * 0.8;
      officer.figure.group.rotation.y = officer.heading;
      // The grab: an officer on top of Danny for a second and a bit
      // makes the arrest. Sprinting clear breaks the hold.
      if (dist < OFFICER_ARREST_RANGE) {
        contact = true;
        officer.arrestTimer += dt;
        if (!this._arrestWarned) {
          this._arrestWarned = true;
          this.game.hud.toast('An officer has you — break free or punch back!', 2600);
        }
        if (officer.arrestTimer >= OFFICER_ARREST_SECONDS) {
          this.game.busted();
          return;
        }
      } else {
        officer.arrestTimer = Math.max(0, officer.arrestTimer - dt * 2);
      }
    }
    // Officers removed mid-loop above leave holes; compact the list.
    if (this._officers.some((o) => o._gone)) {
      this._officers = this._officers.filter((o) => !o._gone);
    }
    if (!contact) this._arrestWarned = false;
    this._separateOfficers();
  }

  _separateOfficers() {
    // Officers give each other a little room instead of running as one.
    const officers = this._officers;
    for (let i = 0; i < officers.length; i++) {
      if (officers[i].state === 'down') continue;
      for (let j = i + 1; j < officers.length; j++) {
        if (officers[j].state === 'down') continue;
        const a = officers[i].figure.group.position;
        const b = officers[j].figure.group.position;
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

  // True when no building footprint crosses the ground-level line
  // between two points — the line-of-sight check for the pursuit.
  _hasLineOfSight(from, to) {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    for (const b of this.world.buildings) {
      // Cheap reject: the building is nowhere near the segment.
      const minX = Math.min(from.x, to.x) - b.w / 2;
      const maxX = Math.max(from.x, to.x) + b.w / 2;
      const minZ = Math.min(from.z, to.z) - b.d / 2;
      const maxZ = Math.max(from.z, to.z) + b.d / 2;
      if (b.x < minX || b.x > maxX || b.z < minZ || b.z > maxZ) continue;
      let tmin = 0;
      let tmax = 1;
      let blocked = true;
      const axes = [
        [from.x, dx, b.x - b.w / 2, b.x + b.w / 2],
        [from.z, dz, b.z - b.d / 2, b.z + b.d / 2],
      ];
      for (const [origin, dir, lo, hi] of axes) {
        if (Math.abs(dir) < 1e-9) {
          if (origin < lo || origin > hi) {
            blocked = false;
            break;
          }
          continue;
        }
        let a = (lo - origin) / dir;
        let c = (hi - origin) / dir;
        if (a > c) {
          const tmp = a;
          a = c;
          c = tmp;
        }
        tmin = Math.max(tmin, a);
        tmax = Math.min(tmax, c);
        if (tmin > tmax) {
          blocked = false;
          break;
        }
      }
      if (blocked) return false;
    }
    return true;
  }

  _chase(dt, unit, target, wanted, live = true) {
    const car = unit.car;
    const player = this.game.player;
    const playerCar = this.game.playerCar;
    unit.ramCooldown = Math.max(0, unit.ramCooldown - dt);
    unit.footRamCooldown = Math.max(0, unit.footRamCooldown - dt);
    unit.heatCooldown = Math.max(0, unit.heatCooldown - dt);

    if (unit.reverseTimer > 0) {
      unit.reverseTimer -= dt;
      car.drive(dt, -0.9, unit.reverseSteer, this.world);
      return;
    }

    const dist = Math.hypot(
      car.position.x - target.x, car.position.z - target.z,
    );

    // Lost the scent: reached the last-seen spot and Danny is not there.
    // Sit and wait — the heat still decays while nobody can see him.
    if (!live && dist < 8) {
      if (Math.abs(car.speed) > 0.5) {
        car.drive(dt, car.speed > 0 ? -1 : 0.5, 0, this.world);
      } else {
        car.speed = 0;
      }
      unit.route = [];
      return;
    }

    // Caught them: a slow player on foot, or a stopped car, gets a cop
    // pulling up alongside and holding — not another drive-through.
    // Only when the cop can actually see Danny, of course.
    const playerSlow = playerCar
      ? Math.abs(playerCar.speed) < 1
      : player.speed < 1.5;
    const holdRange = playerCar ? HOLD_CAR_RANGE : HOLD_FOOT_RANGE;
    if (live && playerSlow && dist < holdRange) {
      // Brake to a stop and sit there, nose toward Danny.
      if (Math.abs(car.speed) > 0.5) {
        car.drive(dt, car.speed > 0 ? -1 : 0.5, 0, this.world);
      } else {
        car.speed = 0;
      }
      const wantHeading = Math.atan2(target.x - car.position.x, target.z - car.position.z);
      car.heading = angleLerp(car.heading, wantHeading, 1 - Math.exp(-4 * dt));
      car.group.rotation.y = car.heading;
      return;
    }

    let aimX;
    let aimZ;
    if (dist < 22) {
      // Close in: hunt the target directly. Leading the aim and going
      // for the rear quarter only make sense against the live player,
      // not a remembered position.
      unit.route = [];
      aimX = target.x;
      aimZ = target.z;
      if (live && playerCar) {
        const f = playerCar.forward();
        aimX += f.x * playerCar.speed * 0.35;
        aimZ += f.z * playerCar.speed * 0.35;
        const dx = car.position.x - playerCar.position.x;
        const dz = car.position.z - playerCar.position.z;
        if (dist < 8 && dist > 0.01) {
          const rx = Math.cos(playerCar.heading);
          const rz = -Math.sin(playerCar.heading);
          const side = (dx * rx + dz * rz) >= 0 ? 1 : -1;
          aimX = playerCar.position.x - f.x * 2.4 + rx * 1.8 * side;
          aimZ = playerCar.position.z - f.z * 2.4 + rz * 1.8 * side;
        }
      }
    } else {
      // Far off: stay on the roads. A beeline across the blocks ends
      // nose-first in a building; an L-shaped route along two roads
      // actually gets there.
      unit.routeTimer -= dt;
      if (unit.routeTimer <= 0 || unit.routeIndex >= unit.route.length) {
        unit.routeTimer = 0.8;
        unit.routeIndex = 0;
        const start = this.world.nearestRoadPoint(car.position.x, car.position.z);
        // Lead a moving target: route at where Danny will be, not where
        // he is, so the route turns the corner with him instead of
        // chasing his tail-light around it a second late.
        let ex = target.x;
        let ez = target.z;
        if (live && playerCar) {
          const f = playerCar.forward();
          ex += f.x * playerCar.speed * 1.2;
          ez += f.z * playerCar.speed * 1.2;
        }
        const end = this.world.nearestRoadPoint(ex, ez);
        unit.route = [
          start,
          { x: end.x, z: start.z },
          end,
        ];
      }
      const wp = unit.route[unit.routeIndex];
      aimX = wp.x;
      aimZ = wp.z;
      // Look past the waypoint toward the next one, so corners are cut
      // smoothly instead of braked through at a right angle.
      const next = unit.route[unit.routeIndex + 1];
      if (next) {
        const dx = next.x - wp.x;
        const dz = next.z - wp.z;
        const len = Math.hypot(dx, dz) || 1;
        aimX += (dx / len) * 5;
        aimZ += (dz / len) * 5;
      }
      if (Math.hypot(car.position.x - wp.x, car.position.z - wp.z) < 6) {
        unit.routeIndex++;
      }
    }

    // The cruise tracks Danny's own speed with a small margin, so the
    // pursuit always closes — gently at one star, firmly at five. The
    // old flat cruise (30 + 2.2/star) topped out below Danny's 38 m/s at
    // one star, so a flat-out flee simply drove away and the heat
    // decayed in seven seconds; the chase evaporated instead of chasing.
    // A far unit gets a little extra to rejoin the hunt briskly.
    const playerSpeed = playerCar ? Math.abs(playerCar.speed) : player.speed;
    const margin = 1.0 + 0.6 * wanted;
    let cruise = Math.max(30 + wanted * 2, playerSpeed + margin);
    if (dist > 60) cruise += 2;
    // Cornering: on the open road the cop takes route corners hot (no
    // turn braking — route corners are intersections, so swinging wide
    // stays on asphalt). Close in, the beeline cuts across blocks, so
    // the cop still brakes for sharp turns — but only down to 15 m/s,
    // not the usual 6: braking to a crawl at every one of Danny's turns
    // cost ~70 m per corner and the chase never re-closed (harness
    // loop1), while no braking at all blew the cop past Danny and into
    // the buildings. The hold pose (slow player) and the ram do not use
    // driveToward, so they keep their precision.
    const cornerOpts = dist < 22
      ? { turnBrakeFloor: 15 }
      : { brakeForTurns: false };
    car.driveToward(dt, aimX, aimZ, Math.min(cruise, 42), this.world, cornerOpts);

    // Stuck recovery: reverse out with alternating steering.
    const moved = Math.hypot(car.position.x - unit.lastX, car.position.z - unit.lastZ);
    if (moved < 0.4 && Math.abs(car.speed) < 1.5) {
      unit.stuckTimer += dt;
      if (unit.stuckTimer > 2) {
        unit.stuckTimer = 0;
        unit.reverseSteer = -unit.reverseSteer;
        unit.reverseTimer = 1.1;
      }
    } else {
      unit.stuckTimer = 0;
    }
    unit.lastX = car.position.x;
    unit.lastZ = car.position.z;
  }

  _checkRam(unit, player, playerCar) {
    const car = unit.car;
    if (playerCar) {
      const dx = playerCar.position.x - car.position.x;
      const dz = playerCar.position.z - car.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > RAM_RANGE || dist < 0.01) return;
      // Closing speed along the line between the cars: positive when the
      // cop is running Danny down, negative when Danny runs the cop down.
      // Traffic separation holds cars 4.5 m apart, so this runs just
      // outside that, right as the bumpers meet.
      const ux = dx / dist;
      const uz = dz / dist;
      const cf = car.forward();
      const pf = playerCar.forward();
      const closing = (cf.x * car.speed - pf.x * playerCar.speed) * ux
        + (cf.z * car.speed - pf.z * playerCar.speed) * uz;
      if (unit.ramCooldown <= 0 && closing > 5) {
        // The cop slammed into Danny: damage plus a shove and a spin.
        unit.ramCooldown = RAM_DAMAGE_COOLDOWN;
        const dmg = Math.min(16, 4 + (closing - 5) * 1.0);
        this.game.damagePlayer(dmg);
        playerCar.position.x += ux * 1.6;
        playerCar.position.z += uz * 1.6;
        playerCar.heading += (this.rng.chance(0.5) ? 1 : -1) * 0.22;
        playerCar.speed *= 0.55;
        this.game.audio.crashThud();
      } else if (unit.heatCooldown <= 0 && closing < -8) {
        // Danny rammed a cop car: that is a crime too.
        unit.heatCooldown = 6;
        this.addHeat(1);
        this.game.hud.toast('You rammed a cop car! +1 star.', 2600);
      }
      return;
    }
    // On foot: a patrol car barrelling into Danny hurts.
    const dx = player.position.x - car.position.x;
    const dz = player.position.z - car.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 2.4 || dist < 0.01) return;
    if (unit.footRamCooldown <= 0 && Math.abs(car.speed) > 3) {
      unit.footRamCooldown = FOOT_RAM_COOLDOWN;
      this.game.damagePlayer(12);
      const ux = dx / dist;
      const uz = dz / dist;
      player.position.x += ux * 2.6;
      player.position.z += uz * 2.6;
      this.world.resolveCircle(player.position, 0.55);
      player.group.position.copy(player.position);
      car.speed *= 0.3;
      this.game.audio.crashThud();
    }
  }

  _separateUnits() {
    // Keep patrol cars from piling onto the same bumper.
    const units = this._units;
    for (let i = 0; i < units.length; i++) {
      for (let j = i + 1; j < units.length; j++) {
        const a = units[i].car;
        const b = units[j].car;
        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.01 && d < 4.5) {
          const push = (4.5 - d) / 2;
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

  _checkBusted(dt, player, playerCar) {
    let cornered = false;
    if (playerCar) {
      if (Math.abs(playerCar.speed) < 1) {
        let near = 0;
        for (const u of this._units) {
          if (u.state !== 'chase') continue;
          const d = Math.hypot(
            u.car.position.x - playerCar.position.x,
            u.car.position.z - playerCar.position.z,
          );
          if (d < BUST_CAR_RANGE) near++;
        }
        cornered = near >= 2;
        if (cornered) this._bustedTimer += dt;
      }
    } else if (player.speed < 1.2) {
      for (const u of this._units) {
        if (u.state !== 'chase') continue;
        const d = Math.hypot(
          u.car.position.x - player.position.x,
          u.car.position.z - player.position.z,
        );
        if (d < BUST_FOOT_RANGE) {
          cornered = true;
          break;
        }
      }
      if (cornered) this._bustedTimer += dt;
    }
    if (!cornered) {
      // The net loosens instead of vanishing: the timer bleeds off twice
      // as fast as it builds, so a brief break buys time but not freedom.
      this._bustedTimer = Math.max(0, this._bustedTimer - dt * 2);
      if (this._bustedTimer === 0) this._bustWarned = false;
      return;
    }
    if (!this._bustWarned) {
      this._bustWarned = true;
      this.game.hud.toast('The cops are closing in — RUN!', 2600);
    }
    const limit = playerCar ? BUST_CAR_SECONDS : BUST_FOOT_SECONDS;
    if (this._bustedTimer >= limit) {
      this.game.busted();
    }
  }

  // ----- lightbar -----

  _flashLights(unit) {
    // Alternate red/blue about four times a second.
    const on = Math.sin(this._flashTime * 12 + unit.car.position.x) > 0;
    this._setLights(unit, on ? 1.6 : 0.15, on ? 0.15 : 1.6);
  }

  _setLights(unit, left, right) {
    const lights = unit.car.lights;
    if (!lights) return;
    lights.left.emissiveIntensity = left;
    lights.right.emissiveIntensity = right;
  }

  // ----- helicopter -----

  _manageHeli(wanted) {
    if (wanted >= HELI_STARS && !this._heli) this._spawnHeli();
    else if (wanted < HELI_STARS && this._heli) this._removeHeli();
  }

  _spawnHeli() {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x1c2f4a });
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x14181d });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 4.6), bodyMat);
    body.position.y = 0;
    body.castShadow = true;
    group.add(body);
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 0.9, 1.4),
      new THREE.MeshLambertMaterial({ color: 0x9fd0ea }),
    );
    glass.position.set(0, 0.25, 1.8);
    group.add(glass);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 3.4), bodyMat);
    tail.position.set(0, 0.3, -3.8);
    group.add(tail);
    const rotor = new THREE.Mesh(
      new THREE.BoxGeometry(9.5, 0.08, 0.4),
      darkMat,
    );
    rotor.position.y = 1.0;
    group.add(rotor);
    const skids = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.12, 3.4),
      darkMat,
    );
    skids.position.y = -0.85;
    group.add(skids);

    // The spotlight cone: apex at the helicopter, base on the street.
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xfff6c9,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(6.5, 34, 20, 1, true),
      coneMat,
    );
    this.scene.add(cone);

    // A pool of light on the ground where the beam lands.
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xfff6c9,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const glow = new THREE.Mesh(new THREE.CircleGeometry(4.5, 24), glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.3;
    this.scene.add(glow);

    this.scene.add(group);
    this._heli = {
      group,
      rotor,
      cone,
      glow,
      angle: this.rng.range(0, Math.PI * 2),
    };
  }

  _updateHeli(dt, target) {
    const heli = this._heli;
    if (!heli) return;
    heli.angle += dt * 0.22;
    const hx = target.x + Math.cos(heli.angle) * 24;
    const hz = target.z + Math.sin(heli.angle) * 24;
    const hy = 32;
    const prevX = heli.group.position.x;
    const prevZ = heli.group.position.z;
    heli.group.position.set(hx, hy, hz);
    // Face along the direction of travel.
    const moveX = hx - prevX;
    const moveZ = hz - prevZ;
    if (Math.hypot(moveX, moveZ) > 0.001) {
      const want = Math.atan2(moveX, moveZ);
      heli.group.rotation.y = angleLerp(heli.group.rotation.y, want, 1 - Math.exp(-3 * dt));
    }
    heli.rotor.rotation.y += dt * 28;

    // Aim the cone from the helicopter down at Danny.
    const up = new THREE.Vector3(0, 1, 0);
    const dir = new THREE.Vector3(hx - target.x, hy - target.y, hz - target.z).normalize();
    heli.cone.position.set(
      (hx + target.x) / 2,
      (hy + target.y) / 2,
      (hz + target.z) / 2,
    );
    heli.cone.quaternion.setFromUnitVectors(up, dir);
    heli.glow.position.set(target.x, 0.3, target.z);
  }

  _removeHeli() {
    if (!this._heli) return;
    this.scene.remove(this._heli.group);
    this.scene.remove(this._heli.cone);
    this.scene.remove(this._heli.glow);
    this._heli = null;
  }
}
