// Neon Bay Heat — the mission framework and the opening mission.
// A mission is a title, a reward and an ordered list of steps; each step
// has a check that reads the live game context and a line of objective
// text. The manager advances steps, pays rewards and tells the HUD what
// to show. Later phases add missions by pushing more definitions here.

import { MISSION_ONE } from './config.js';

// ctx shape the checks read:
// { inCar, stolenCar, playerX, playerZ, dropOff: {x, z} }
function missionOneDefinition(dropOff) {
  return {
    id: MISSION_ONE.id,
    title: MISSION_ONE.title,
    giver: MISSION_ONE.giver,
    reward: MISSION_ONE.reward,
    intro: MISSION_ONE.intro,
    steps: [
      {
        id: 'steal',
        text: MISSION_ONE.steps[0].text,
        objective: null, // no map marker yet: any car will do
        check: (ctx) => ctx.inCar,
      },
      {
        id: 'deliver',
        text: MISSION_ONE.steps[1].text,
        objective: { x: dropOff.x, z: dropOff.z },
        check: (ctx) => {
          if (!ctx.inCar) return false;
          const dx = ctx.playerX - dropOff.x;
          const dz = ctx.playerZ - dropOff.z;
          return dx * dx + dz * dz < 36; // within 6 metres
        },
      },
    ],
  };
}

export class MissionManager {
  constructor(dropOff) {
    this.missions = [missionOneDefinition(dropOff)];
    this.index = 0; // current mission
    this.step = 0; // current step inside it
    this.completed = []; // ids of finished missions
    this.started = false;
  }

  get current() {
    return this.missions[this.index] || null;
  }

  get currentStep() {
    const mission = this.current;
    if (!mission) return null;
    return mission.steps[this.step] || null;
  }

  // The line the HUD shows, or a free-roam line when all is done.
  objectiveText() {
    const step = this.currentStep;
    if (!step) return 'Free roam — Neon Bay is yours. More jobs coming soon.';
    return `${this.current.title}: ${step.text}`;
  }

  // The world position the minimap and the 3D beam point at, if any.
  objectivePosition() {
    const step = this.currentStep;
    return step ? step.objective : null;
  }

  start() {
    this.started = true;
  }

  // Advance steps while their checks pass. Returns events for main:
  // [{ type: 'step' | 'complete', mission, reward? }]
  update(ctx) {
    if (!this.started) return [];
    const events = [];
    let guard = 0;
    while (guard++ < 8) {
      const mission = this.current;
      if (!mission) break;
      const step = this.currentStep;
      if (!step) break;
      if (!step.check(ctx)) break;
      this.step += 1;
      if (this.step >= mission.steps.length) {
        this.completed.push(mission.id);
        events.push({ type: 'complete', mission, reward: mission.reward });
        this.index += 1;
        this.step = 0;
      } else {
        events.push({ type: 'step', mission, step: this.currentStep });
      }
    }
    return events;
  }

  // Save / restore: only the indices and the completed list matter.
  serialize() {
    return { index: this.index, step: this.step, completed: [...this.completed] };
  }

  restore(data) {
    if (!data) return;
    this.index = data.index || 0;
    this.step = data.step || 0;
    this.completed = Array.isArray(data.completed) ? [...data.completed] : [];
  }
}
