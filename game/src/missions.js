// Neon Bay Heat — missions.
// A mission is a list of steps; each step has its objective text, a check
// against the live game context, and a map target for the marker and the
// minimap. Mission 1, "First Wheels": steal any car, then drive it to the
// marina drop-off for $250.

import { MISSION_ONE } from './config.js';
import { nearestParkedCar } from './vehicles.js';

function dist2D(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
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
};

export class MissionManager {
  constructor() {
    this.currentId = MISSION_ONE.id;
    this.stepIndex = 0;
    this.completed = [];
  }

  get current() {
    return this.currentId ? MISSIONS[this.currentId] : null;
  }

  get currentStep() {
    const mission = this.current;
    if (!mission) return null;
    return mission.steps[this.stepIndex] || null;
  }

  objectiveText() {
    const step = this.currentStep;
    if (step) return `${this.current.name}: ${step.text}`;
    return 'Free roam — Neon Bay is yours.';
  }

  objectivePos(ctx) {
    const step = this.currentStep;
    if (!step || !step.target) return null;
    return step.target(ctx);
  }

  // Returns { type: 'step' } when a step completes, { type: 'mission',
  // mission } when a mission completes, or null.
  update(ctx) {
    const mission = this.current;
    const step = this.currentStep;
    if (!mission || !step) return null;
    if (!step.check(ctx)) return null;
    this.stepIndex++;
    if (this.stepIndex >= mission.steps.length) {
      this.completed.push(mission.id);
      this.currentId = null;
      this.stepIndex = 0;
      return { type: 'mission', mission };
    }
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
    if (data.currentId && MISSIONS[data.currentId]) this.currentId = data.currentId;
    else if (data.currentId === null) this.currentId = null;
    if (typeof data.stepIndex === 'number') this.stepIndex = data.stepIndex;
    if (Array.isArray(data.completed)) {
      this.completed = data.completed.filter((id) => MISSIONS[id]);
    }
  }
}
