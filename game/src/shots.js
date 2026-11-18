// Neon Bay Heat — screenshot scenes.
// ?shot=<scene>&seed=1 stages a deterministic scene for the competition
// screenshots. The seed re-seeds the whole city. Scenes:
//
//   start    — the title screen over an orbiting city.
//   play     — Danny driving a yellow car on autopilot (legacy scene).
//   end      — the WASTED game-over screen.
//   chase    — a police pursuit: 3 wanted stars, Hot Pursuit's "lose the
//              heat" objective live, HUD and minimap on show.
//   mission  — Danny on foot at an objective marker (The Drop pickup).
//   delivery — Danny driving across town to the marina with the timed
//              Drop clock ticking in the objective line.
//
// The chase scene is written against the shared police contract (a
// game.police object with pursuing/units/helicopter state and setWanted
// / addHeat / clearPursuit methods). If the police system is ever absent,
// the scene degrades gracefully: the wanted stars, the objective and the
// pursuit framing all still render.

import { MISSION_POINTS } from './missions.js';
import { nearestParkedSedan } from './vehicles.js';

export function parseShotParams() {
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  if (!shot) return null;
  const seed = parseInt(params.get('seed') || '1', 10) || 1;
  return { shot, seed };
}

function beginPlaying(game) {
  game.state = 'playing';
  game.hud.showScreen('playing');
}

function setMission(game, id, stepIndex) {
  game.missions.currentId = id;
  game.missions.stepIndex = stepIndex;
  // Fresh staging, fresh clock: timed missions start counting now.
  game.missions._timerMission = null;
  game.missions._startedId = null;
}

// Put Danny behind the wheel of the nearest parked sedan, repainted as
// the hero car, already rolling. A sedan, so the hero car never wears a
// taxi roof sign. Returns the car, or null when no parked car is in range.
function stageHeroCar(game, paint, x, z, heading, speed) {
  const car = nearestParkedSedan(game.player.position, game.parked, 400);
  if (!car) return null;
  car.setPaint(paint);
  for (const other of game.parked) {
    if (other !== car && other.paint === paint) other.setPaint(0x2b6fd3);
  }
  car.parked = false;
  game.stolenCars.add(car);
  game.player.enterCar(car);
  game.playerCar = car;
  car.position.set(x, 0, z);
  car.heading = heading;
  car.speed = speed;
  car.group.position.copy(car.position);
  car.group.rotation.y = heading;
  game.player.position.copy(car.position);
  game.player.heading = heading;
  return car;
}

// Ask the police system for a pursuit, if it exists yet. setWanted is
// the real entry point: the update loop spawns the units for the level
// (one at once, the rest 1.2 s apart) and the helicopter from 3 stars
// up. A missing or failing police object just means "no units yet" —
// the wanted stars and the objective still carry the scene. Returns true
// when a pursuit was actually requested.
function wakePursuit(game, stars) {
  const police = game.police;
  if (!police || typeof police.setWanted !== 'function') return false;
  try {
    police.setWanted(stars);
  } catch {
    return false;
  }
  return true;
}

function stageChaseShot(game) {
  beginPlaying(game);
  // Danny in a yellow car on the west road, already rolling south with
  // three stars on him and Hot Pursuit asking him to lose the heat.
  const car = stageHeroCar(game, 0xf2c230, -150, -120, 0, 12);
  if (!car) return;
  game.cash = 650; // First Wheels + The Drop, already banked
  game.wantedTimer = 0;
  // The police set the wanted level themselves when they exist, so the
  // units and the helicopter spawn with it; only fall back to setting
  // the stars directly when there is no police system yet.
  const pursuitLive = wakePursuit(game, 3);
  if (!pursuitLive) {
    game.wanted = 3;
    game.hud.toast('3 stars — lose the cops!', 3600);
  }
  setMission(game, 'hot-pursuit', 1);
  game.setAutopilot({ x: -150, z: 150 });
  // The chase camera sits behind Danny, so patrol cars closing in from
  // behind hide behind the camera itself. Swing the staging angle round
  // to a three-quarter front view: the camera rides ahead of Danny's car
  // looking back, and the pursuit fills the road behind him. The shot
  // needs a few seconds of game time before the shutter fires — the
  // units spawn 1.2 s apart and have to close in from 45–95 m out.
  game.cameraRig.shotYawOffset = 2.4;
  game.cameraRig.snapTo(car.position, car.heading, 'car');
}

function stageMissionShot(game) {
  beginPlaying(game);
  // Danny on foot, a few steps from The Drop pickup, facing the marker
  // beam. The tracker and the objective line both name the job.
  const pickup = MISSION_POINTS.dropPickup;
  game.player.teleport(pickup.x, pickup.z + 17, Math.PI);
  clearHeat(game);
  setMission(game, 'the-drop', 0);
  game.cameraRig.snapTo(game.player.position, game.player.heading, 'foot');
}

// Drop the heat entirely, through the police when they exist (so their
// units and helicopter go away too), or directly when they do not.
function clearHeat(game) {
  const police = game.police;
  if (police && typeof police.clearPursuit === 'function') {
    try {
      police.clearPursuit();
    } catch {
      game.wanted = 0;
    }
  } else {
    game.wanted = 0;
  }
  game.wantedTimer = 0;
}

function stageDeliveryShot(game) {
  beginPlaying(game);
  // Danny driving across town with the package: The Drop's delivery leg,
  // autopilot bound for the marina, the countdown live in the objective.
  const car = stageHeroCar(game, 0xf2c230, -120, -100, Math.PI / 2, 11);
  if (!car) return;
  game.cash = 250;
  clearHeat(game);
  setMission(game, 'the-drop', 1);
  game.setAutopilot(game.world.marina);
  game.cameraRig.snapTo(car.position, car.heading, 'car');
}

export function stageShot(game, name) {
  if (name === 'start') {
    game.toTitle();
  } else if (name === 'play') {
    game.stagePlayShot();
  } else if (name === 'end') {
    game.stageEndShot();
  } else if (name === 'chase') {
    stageChaseShot(game);
  } else if (name === 'mission') {
    stageMissionShot(game);
  } else if (name === 'delivery') {
    stageDeliveryShot(game);
  }
}
