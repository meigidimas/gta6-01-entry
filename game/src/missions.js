// Neon Bay Heat — missions.
// A mission is a list of steps; each step has its objective text, a check
// against the live game context, and a map target for the marker and the
// minimap. Five missions unlock in order, and progress saves with the game:
//
//   1. First Wheels — steal a car, drive it to the marina. $250.
//   2. The Drop — pick up a package uptown, deliver it to the marina
//      before the clock runs out. $400.
//   3. Hot Pursuit — earn 2 wanted stars, then lose the heat. $500.
//   4. Payback — chase the rival's car and ram it until it quits. $600.
//   5. The Big Score — pick up the crew, hit the vault, escape hot. $1,000.
//
// Steps reach the wanted level and the police only through small guarded
// helpers below: the framework never imports police code, and every
// reference degrades to "no heat" when the police system is not wired yet.

import { MISSION_ONE } from './config.js';
import { nearestParkedCar } from './vehicles.js';

// Fixed mission landmarks, on road centrelines so the autopilot and the
// player can always reach them. The city grid runs -150..150 on both axes
// with the marina at the east coast.
export const MISSION_POINTS = {
  dropPickup: { x: -150, z: -125 }, // uptown, north-west corner
  crewPickup: { x: -100, z: 100 }, // south-west, near the park blocks
  vault: { x: 100, z: -100 }, // north-east, downtown towers
  escapePoint: { x: -150, z: 150 }, // far south-west corner
  reachRadius: 12,
};

export const MISSION_ORDER = [
  'first-wheels',
  'the-drop',
  'hot-pursuit',
  'payback',
  'the-big-score',
];

const REWARDS = {
  'the-drop': 400,
  'hot-pursuit': 500,
  'payback': 600,
  'the-big-score': 1000,
};

const DROP_TIME_LIMIT = 150; // seconds to finish The Drop once it starts
const PAYBACK_RAMS = 5; // solid hits that disable the rival's car
const PAYBACK_RAM_COOLDOWN = 1.5; // seconds between counted hits

function dist2D(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function formatClock(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// The live game object, when the caller hands it over or when the game has
// published itself for debugging. Never throws, never required.
function gameOf(ctx) {
  if (ctx && ctx.game) return ctx.game;
  try {
    return typeof window !== 'undefined' && window.__neonBay
      ? window.__neonBay.game || null
      : null;
  } catch {
    return null;
  }
}

function wantedOf(ctx) {
  if (ctx && typeof ctx.wanted === 'number') return ctx.wanted;
  const game = gameOf(ctx);
  return game && typeof game.wanted === 'number' ? game.wanted : 0;
}

function policeOf(ctx) {
  if (ctx && ctx.police) return ctx.police;
  const game = gameOf(ctx);
  return game ? game.police || null : null;
}

function trafficOf(ctx) {
  if (ctx && ctx.traffic) return ctx.traffic;
  const game = gameOf(ctx);
  return game && game.traffic ? game.traffic : null;
}

// Raise the heat through the police system when it exists, otherwise by
// setting the wanted level directly. Used by The Big Score's vault step:
// the alarm goes off, and Danny leaves hot.
function addHeat(ctx, stars) {
  const police = policeOf(ctx);
  try {
    if (police && typeof police.addHeat === 'function') {
      police.addHeat(stars);
      return;
    }
    if (police && typeof police.addWanted === 'function') {
      police.addWanted(stars);
      return;
    }
  } catch {
    // Fall through to the direct set below.
  }
  const game = gameOf(ctx);
  if (game && typeof game.wanted === 'number') {
    game.wanted = Math.min(5, game.wanted + stars);
  }
}

function emitMissionEvent(type, mission, extra = {}) {
  try {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
    window.dispatchEvent(new window.CustomEvent('neon-bay:mission', {
      detail: { type, mission, ...extra },
    }));
  } catch {
    // Events are a convenience for the HUD and audio; the mission flow
    // never depends on them.
  }
}

export const MISSIONS = {
  [MISSION_ONE.id]: {
    id: MISSION_ONE.id,
    name: MISSION_ONE.name,
    reward: MISSION_ONE.reward,
    steps: [
      {
        text: MISSION_ONE.stepSteal,
        check(ctx) {
          return ctx.player.inCar;
        },
        target(ctx) {
          const car = nearestParkedCar(ctx.player.position, ctx.parked, 400);
          return car ? { x: car.position.x, z: car.position.z } : null;
        },
      },
      {
        text: MISSION_ONE.stepDrive,
        check(ctx) {
          return dist2D(ctx.player.position, ctx.world.marina) < MISSION_ONE.dropoffRadius;
        },
        target(ctx) {
          return { x: ctx.world.marina.x, z: ctx.world.marina.z };
        },
      },
    ],
  },

  'the-drop': {
    id: 'the-drop',
    name: 'The Drop',
    reward: REWARDS['the-drop'],
    timeLimit: DROP_TIME_LIMIT,
    steps: [
      {
        text: 'Pick up the package uptown — north-west corner of the city.',
        check(ctx) {
          return dist2D(ctx.player.position, MISSION_POINTS.dropPickup)
            < MISSION_POINTS.reachRadius;
        },
        target() {
          return { ...MISSION_POINTS.dropPickup };
        },
      },
      {
        text: 'Deliver the package to the marina drop-off. Hurry!',
        check(ctx) {
          return dist2D(ctx.player.position, ctx.world.marina) < MISSION_ONE.dropoffRadius;
        },
        target(ctx) {
          return { x: ctx.world.marina.x, z: ctx.world.marina.z };
        },
      },
    ],
  },

  'hot-pursuit': {
    id: 'hot-pursuit',
    name: 'Hot Pursuit',
    reward: REWARDS['hot-pursuit'],
    steps: [
      {
        text: 'Get the cops\' attention — reach 2 wanted stars. Stealing cars works.',
        check(ctx) {
          return wantedOf(ctx) >= 2;
        },
        target() {
          return null;
        },
      },
      {
        text: 'Now lose them — stay out of trouble until the heat drops to zero.',
        check(ctx) {
          return wantedOf(ctx) <= 0;
        },
        target() {
          return null;
        },
      },
    ],
  },

  'payback': {
    id: 'payback',
    name: 'Payback',
    reward: REWARDS['payback'],
    steps: [
      {
        text: 'Chase down the rival\'s car — it is marked on your map.',
        check(ctx, mgr) {
          const rival = mgr.rivalCar(ctx);
          return rival
            ? dist2D(ctx.player.position, rival.position) < 8
            : false;
        },
        target(ctx, mgr) {
          const rival = mgr.rivalCar(ctx);
          return rival ? { x: rival.position.x, z: rival.position.z } : null;
        },
      },
      {
        text: 'Ram the rival\'s car until it is disabled.',
        progress(ctx, mgr) {
          return `${mgr.ramHits} / ${PAYBACK_RAMS} hits`;
        },
        check(ctx, mgr) {
          return mgr.ramHits >= PAYBACK_RAMS;
        },
        target(ctx, mgr) {
          const rival = mgr.rivalCar(ctx);
          return rival ? { x: rival.position.x, z: rival.position.z } : null;
        },
      },
    ],
  },

  'the-big-score': {
    id: 'the-big-score',
    name: 'The Big Score',
    reward: REWARDS['the-big-score'],
    steps: [
      {
        text: 'Pick up the crew at the south-west rendezvous.',
        check(ctx) {
          return dist2D(ctx.player.position, MISSION_POINTS.crewPickup)
            < MISSION_POINTS.reachRadius;
        },
        target() {
          return { ...MISSION_POINTS.crewPickup };
        },
      },
      {
        text: 'Reach the vault downtown — north-east towers.',
        check(ctx) {
          return dist2D(ctx.player.position, MISSION_POINTS.vault)
            < MISSION_POINTS.reachRadius;
        },
        target() {
          return { ...MISSION_POINTS.vault };
        },
        // The vault alarm trips as Danny arrives: he leaves with heat.
        onComplete(ctx) {
          addHeat(ctx, 2);
        },
      },
      {
        text: 'Escape to the south-west corner — and stay hot until you get there.',
        check(ctx) {
          return wantedOf(ctx) >= 1
            && dist2D(ctx.player.position, MISSION_POINTS.escapePoint)
              < MISSION_POINTS.reachRadius;
        },
        target() {
          return { ...MISSION_POINTS.escapePoint };
        },
      },
    ],
  },
};

export class MissionManager {
  constructor() {
    this.currentId = MISSION_ONE.id;
    this.stepIndex = 0;
    this.completed = [];
    this._lastCtx = null;
    this._timerMission = null;
    this._timerStart = 0;
    this._startedId = null;
    // Payback state: the rival car identity plus counted rams.
    this._rival = null;
    this.ramHits = 0;
    this._lastRamAt = 0;
  }

  get current() {
    return this.currentId ? MISSIONS[this.currentId] : null;
  }

  get currentStep() {
    const mission = this.current;
    if (!mission) return null;
    return mission.steps[this.stepIndex] || null;
  }

  get missionNumber() {
    const idx = MISSION_ORDER.indexOf(this.currentId);
    return idx >= 0 ? idx + 1 : 0;
  }

  get totalMissions() {
    return MISSION_ORDER.length;
  }

  // Seconds left on a timed mission, or null when the mission has no clock.
  timeRemaining() {
    const mission = this.current;
    if (!mission || !mission.timeLimit) return null;
    if (this._timerMission !== mission.id) return mission.timeLimit;
    const elapsed = (performance.now() - this._timerStart) / 1000;
    return Math.max(0, mission.timeLimit - elapsed);
  }

  objectiveText() {
    const step = this.currentStep;
    if (!step) {
      return this.completed.length >= MISSION_ORDER.length
        ? 'Every job done — Neon Bay is yours, Danny.'
        : 'Free roam — Neon Bay is yours.';
    }
    let text = `${this.current.name}: ${step.text}`;
    if (step.progress) {
      try {
        const suffix = step.progress(this._lastCtx, this);
        if (suffix) text += ` (${suffix})`;
      } catch {
        // Progress text is cosmetic; never let it break the objective.
      }
    }
    const remaining = this.timeRemaining();
    if (remaining !== null) text += ` — ${formatClock(remaining)} left`;
    return text;
  }

  objectivePos(ctx) {
    const step = this.currentStep;
    if (!step || !step.target) return null;
    try {
      return step.target(ctx, this);
    } catch {
      return null;
    }
  }

  // The rival for Payback: the traffic car nearest the player when the
  // mission starts, kept by identity for the whole mission. Traffic cars
  // have no health model, so "disabled" is counted rams instead.
  rivalCar(ctx) {
    const traffic = trafficOf(ctx);
    const cars = traffic && Array.isArray(traffic.cars)
      ? traffic.cars.map((t) => t.car || t).filter(Boolean)
      : [];
    if (cars.length === 0) return null;
    if (this._rival && cars.includes(this._rival)) return this._rival;
    let best = null;
    let bestDist = Infinity;
    for (const car of cars) {
      const d = dist2D(ctx.player.position, car.position);
      if (d < bestDist) {
        bestDist = d;
        best = car;
      }
    }
    this._rival = best;
    return best;
  }

  _resetPayback() {
    this._rival = null;
    this.ramHits = 0;
    this._lastRamAt = 0;
  }

  // Count a ram: the player is driving fast and brushes the rival's car.
  // Called every frame while Payback is active.
  _countRams(ctx) {
    if (this.currentId !== 'payback' || this.stepIndex !== 1) return;
    const rival = this.rivalCar(ctx);
    if (!rival || !ctx.player.inCar) return;
    const now = performance.now() / 1000;
    if (now - this._lastRamAt < PAYBACK_RAM_COOLDOWN) return;
    const game = gameOf(ctx);
    const playerCar = game ? game.playerCar : null;
    const speed = playerCar ? Math.abs(playerCar.speed || 0) : 0;
    // Traffic separation holds cars 4.5 m apart, so a ram has to count
    // just outside that ring — 4.5 itself could never trigger, because
    // separation runs before this check every frame and pushes the cars
    // back out to exactly 4.5. The speed floor keeps a gentle nudge in
    // traffic from counting as a ram.
    if (dist2D(ctx.player.position, rival.position) < 5.2 && speed > 6) {
      this.ramHits++;
      this._lastRamAt = now;
      emitMissionEvent('ram', this.current, { hits: this.ramHits, total: PAYBACK_RAMS });
    }
  }

  // The next job after the one just finished: the first mission past it
  // in the order that is not done yet. Advancing only forward is what
  // keeps a staged or out-of-order completion from rewinding the chain
  // back to mission 1 — including after the finale, where there is
  // simply nothing left to unlock. With no argument (resuming a save
  // that stopped mid-chain) it is the first open job in the whole order.
  _nextMissionId(afterId = null) {
    if (afterId) {
      const idx = MISSION_ORDER.indexOf(afterId);
      const start = idx >= 0 ? idx + 1 : 0;
      for (let i = start; i < MISSION_ORDER.length; i++) {
        if (!this.completed.includes(MISSION_ORDER[i])) return MISSION_ORDER[i];
      }
      return null;
    }
    for (const id of MISSION_ORDER) {
      if (!this.completed.includes(id)) return id;
    }
    return null;
  }

  _startTimerIfNeeded(mission) {
    if (!mission || !mission.timeLimit) return;
    if (this._timerMission !== mission.id) {
      this._timerMission = mission.id;
      this._timerStart = performance.now();
    }
  }

  // Returns { type: 'step' } when a step completes, { type: 'mission',
  // mission } when a mission completes, { type: 'fail', mission } when a
  // timed mission runs out of time, or null.
  update(ctx) {
    const mission = this.current;
    const step = this.currentStep;
    if (!mission || !step) return null;
    this._lastCtx = ctx;

    // Announce a mission the first time it runs, so the HUD and audio can
    // greet it even though the game loop never calls a start hook.
    if (this._startedId !== mission.id) {
      this._startedId = mission.id;
      if (mission.id === 'payback') this._resetPayback();
      emitMissionEvent('start', mission);
    }

    this._startTimerIfNeeded(mission);

    // Timed missions fail when the clock hits zero: back to step one with
    // a fresh clock, so the player can retry immediately.
    const remaining = this.timeRemaining();
    if (remaining !== null && remaining <= 0) {
      this.stepIndex = 0;
      this._timerMission = null;
      emitMissionEvent('fail', mission);
      return { type: 'fail', mission };
    }

    this._countRams(ctx);

    let done = false;
    try {
      done = step.check(ctx, this);
    } catch {
      done = false;
    }
    if (!done) return null;

    if (step.onComplete) {
      try {
        step.onComplete(ctx, this);
      } catch {
        // A step hook must never break the mission flow.
      }
    }

    this.stepIndex++;
    if (this.stepIndex >= mission.steps.length) {
      this.completed.push(mission.id);
      this._timerMission = null;
      const finished = mission;
      this.currentId = this._nextMissionId(finished.id);
      this.stepIndex = 0;
      if (this.currentId === 'payback') this._resetPayback();
      emitMissionEvent('mission', finished);
      return { type: 'mission', mission: finished };
    }
    emitMissionEvent('step', mission, { stepIndex: this.stepIndex });
    return { type: 'step', mission, stepIndex: this.stepIndex };
  }

  save() {
    return {
      currentId: this.currentId,
      stepIndex: this.stepIndex,
      completed: [...this.completed],
    };
  }

  load(data) {
    if (!data) return;
    if (Array.isArray(data.completed)) {
      this.completed = data.completed.filter((id) => MISSIONS[id]);
    }
    if (data.currentId && MISSIONS[data.currentId]) {
      this.currentId = data.currentId;
    } else if (data.currentId === null) {
      // Old saves stopped after mission 1; resume at the next open job.
      this.currentId = this._nextMissionId();
    }
    if (typeof data.stepIndex === 'number') this.stepIndex = data.stepIndex;
    this._timerMission = null;
    this._startedId = null;
  }
}
