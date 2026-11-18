// Neon Bay Heat — screenshot scenes.
// ?shot=start|play|end&seed=1 stages a deterministic scene for the
// competition screenshots: the title screen over an orbiting city, Danny
// driving a yellow car on autopilot with one wanted star, or the WASTED
// game-over screen. The seed re-seeds the whole city.

export function parseShotParams() {
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  if (!shot) return null;
  const seed = parseInt(params.get('seed') || '1', 10) || 1;
  return { shot, seed };
}

export function stageShot(game, name) {
  if (name === 'start') {
    game.toTitle();
  } else if (name === 'play') {
    game.stagePlayShot();
  } else if (name === 'end') {
    game.stageEndShot();
  }
}
