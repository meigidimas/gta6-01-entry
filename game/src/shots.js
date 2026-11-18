// Neon Bay Heat — staged scenes for screenshots.
// ?shot=start shows the title over a slow orbit of the city.
// ?shot=play drops Danny into a car already rolling down Ocean Avenue.
// ?shot=end shows the game-over screen. Every scene is deterministic:
// the same ?seed= rebuilds the same city, the same cars, the same shot.
// Later phases extend this file with chase and mission scenes.

export const SHOT_SCENES = ['start', 'play', 'end'];

export function shotFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  return SHOT_SCENES.includes(shot) ? shot : null;
}

export function seedFromQuery(fallback) {
  const params = new URLSearchParams(window.location.search);
  const raw = Number(params.get('seed'));
  return Number.isFinite(raw) && raw !== 0 ? Math.abs(Math.floor(raw)) : fallback;
}

// game: the live Game object from main.js. Called once after boot.
export function applyShotScene(game, shot) {
  if (shot === 'start') {
    game.showTitle(true);
    return;
  }
  if (shot === 'end') {
    game.showGameOver('Busted by the marina patrol — the heat got too hot.');
    return;
  }
  if (shot === 'play') {
    // Danny is already in a red coupe, rolling down the avenue toward
    // the drop-off, wanted level 1, mission step 2 live.
    game.startGame();
    const car = game.parkedCars[0];
    if (car) {
      car.group.visible = true;
      game.stealCar(car);
      car.pos.set(0, 0, -40);
      car.heading = 0;
      car.speed = 14;
      car.setPaint(0xe8c33c); // bright yellow: reads against dark asphalt
      car.syncVisual(0);
    }
    game.missions.started = true;
    game.missions.step = 1; // past the steal, onto the delivery
    game.wanted = 1;
    game.autopilot = true;
    game.cameraRig.snapTo(game.playerFocus(), game.playerHeading());
    return;
  }
}
