// Neon Bay Heat — on-foot combat.
// Danny's fists: a punch (F key, or a mouse click) that lands on the
// nearest pedestrian or patrol car in front of him. Hitting people is a
// crime — the stars go up — and a patrol car beaten down far enough gives
// up the chase. Getting rammed by a patrol car is the other side of the
// same coin, and the police module owns that half.

const PUNCH_RANGE = 2.4;
const PUNCH_ARC_COS = 0.5; // about 60 degrees either side of facing
const PUNCH_COOLDOWN = 0.45;
const PUNCH_ANIM_SECONDS = 0.28;
const COP_PUNCH_DAMAGE = 34;
const COP_HEAT_COOLDOWN = 8;

export class Combat {
  constructor() {
    this.cooldown = 0;
    this.animTimer = 0;
    this.copHeatCooldown = 0;
    this.punchLeft = false; // fists alternate, so the flurry reads
  }

  reset() {
    this.cooldown = 0;
    this.animTimer = 0;
    this.copHeatCooldown = 0;
    this.punchLeft = false;
  }

  update(dt, game, punchRequested) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.copHeatCooldown = Math.max(0, this.copHeatCooldown - dt);

    // The punch swing: the player's own update already ran this step, so
    // overriding the arm here survives until the next frame is drawn.
    if (this.animTimer > 0) {
      this.animTimer -= dt;
      const player = game.player;
      if (!player.inCar) {
        const arm = this.punchLeft ? player.armL : player.armR;
        if (arm) arm.rotation.x = -1.55;
      }
    }

    if (!punchRequested || this.cooldown > 0) return;
    const player = game.player;
    if (player.inCar) return;
    this.cooldown = PUNCH_COOLDOWN;
    this.animTimer = PUNCH_ANIM_SECONDS;
    this.punchLeft = !this.punchLeft;

    // A short step into the punch: it lands more often, and looks like
    // Danny means it.
    const stepX = Math.sin(player.heading) * 0.35;
    const stepZ = Math.cos(player.heading) * 0.35;
    player.position.x += stepX;
    player.position.z += stepZ;
    game.world.resolveCircle(player.position, 0.55);
    player.group.position.copy(player.position);

    const fx = Math.sin(player.heading);
    const fz = Math.cos(player.heading);
    const inFront = (pos) => {
      const dx = pos.x - player.position.x;
      const dz = pos.z - player.position.z;
      const d = Math.hypot(dx, dz);
      if (d > PUNCH_RANGE || d < 0.01) return -1;
      const dot = (dx * fx + dz * fz) / d;
      return dot > PUNCH_ARC_COS ? d : -1;
    };

    // Pedestrians first — the nearest one in reach and in the arc.
    let bestPed = null;
    let bestDist = Infinity;
    if (game.peds) {
      for (const ped of game.peds.peds) {
        if (ped.state === 'down') continue;
        const d = inFront(ped.group.position);
        if (d >= 0 && d < bestDist) {
          bestDist = d;
          bestPed = ped;
        }
      }
    }
    if (bestPed) {
      game.peds.knockDown(bestPed, fx, fz);
      game.peds.alarm(
        bestPed.group.position.x, bestPed.group.position.z, 20,
      );
      game.police.addHeat(1);
      game.hud.toast('You assaulted a pedestrian! +1 star.', 3000);
      game.audio.blip(180, 0.1);
      return;
    }

    // Then patrol cars: fists versus sheet metal, but enough of them and
    // the unit gives up the chase.
    if (game.police) {
      let bestUnit = null;
      bestDist = Infinity;
      for (const unit of game.police.patrolUnits) {
        if (unit.state !== 'chase') continue;
        const d = inFront(unit.car.position);
        if (d >= 0 && d < bestDist) {
          bestDist = d;
          bestUnit = unit;
        }
      }
      if (bestUnit) {
        bestUnit.hp -= COP_PUNCH_DAMAGE;
        game.audio.blip(220, 0.08);
        if (bestUnit.hp <= 0) {
          game.police.disableUnit(bestUnit);
          game.hud.toast('Cop car disabled!', 2600);
        } else if (this.copHeatCooldown <= 0) {
          this.copHeatCooldown = COP_HEAT_COOLDOWN;
          game.police.addHeat(1);
          game.hud.toast('You attacked a cop car! +1 star.', 3000);
        }
        return;
      }
    }

    // A whiff still makes a little noise.
    game.audio.blip(300, 0.04);
  }
}
