// Neon Bay Heat — tuning numbers and colours, all in one place.
// Every gameplay feel, city dimension and palette choice lives here so the
// rest of the game reads like a recipe instead of a pile of magic numbers.

export const GAME = {
  title: 'Neon Bay Heat',
  version: '0.1.0',
  saveKey: 'neon-bay-heat-save-v1',
  autosaveSeconds: 15,
  fixedDt: 1 / 60,
  maxFrameDt: 0.1,
};

export const CITY = {
  grid: 7, // roads per axis
  pitch: 50, // metres between neighbouring road centrelines
  roadWidth: 12,
  sidewalk: 3,
  edge: 175, // half-width of the built city, in metres
  coastX: 178, // where the sand starts (east side)
  waterX: 205, // where the sea starts
  worldLimit: 240, // hard clamp for anything that moves
  parkChance: 0.22,
  lampsEvery: 1, // lamps at every intersection
};

export const PALETTE = {
  sky: 0x87c5e8,
  fog: 0x9fd0ea,
  sun: 0xfff2d0,
  ground: 0x3f7d4e,
  sand: 0xe8d29a,
  sea: 0x2e7fb8,
  road: 0x33373d,
  roadLine: 0xf2e8c9,
  sidewalk: 0x9aa0a3,
  park: 0x4c8a3f,
  palmTrunk: 0x7a5230,
  palmLeaf: 0x2f8f3a,
  lampPole: 0x2b2f33,
  lampGlow: 0xffe9a8,
  buildings: [0xd8cfc0, 0xb8c4cc, 0xe0b8a0, 0xc0c8b0, 0xd0b8d0, 0xa8c0d8, 0xe8d8b0],
  windowLit: 0xffe9a0,
  windowDark: 0x2c3e50,
  carPaints: [0xd23b3b, 0x2b6fd3, 0xf2c230, 0x37b24d, 0xe8e8e8, 0x22262b, 0x8a4fd3, 0xe8722a],
  playerShirt: 0x1f8a70,
  playerPants: 0x2b3a55,
  marker: 0xffd23f,
};

export const PLAYER = {
  walkSpeed: 4.2,
  runSpeed: 8.0,
  radius: 0.55,
  height: 1.8,
  turnRate: 12, // radians per second of heading smoothing
  stepLength: 0.75,
  enterRange: 3.2,
  maxHealth: 100,
};

export const CAR = {
  accel: 22,
  brake: 34,
  reverseAccel: 12,
  maxSpeed: 38, // m/s, about 137 km/h
  maxReverse: 10,
  drag: 0.55, // per-second velocity decay when coasting
  grip: 8, // how fast lateral slide dies out
  steerRate: 2.1, // radians per second at low speed
  steerFalloff: 0.45, // steering authority kept at top speed
  radius: 1.5,
  exitOffset: 2.6,
};

export const TRAFFIC = {
  count: 10,
  cruiseSpeed: 11,
  minCruise: 8,
  maxCruise: 14,
  waypointReach: 3,
  stuckSeconds: 2.5,
  reverseSeconds: 1.2,
  separation: 4.5,
};

export const CAMERA = {
  footDistance: 7.5,
  footHeight: 3.2,
  carDistance: 9.5,
  carHeight: 3.8,
  speedPullback: 0.06, // extra metres of distance per m/s
  pitch: 0.32, // radians looking down
  yawSmooth: 6,
  pitchSmooth: 8,
  positionSmooth: 10,
  orbitSpeed: 0.12, // title-screen orbit, radians per second
};

export const WANTED = {
  maxStars: 5,
  decaySeconds: 45, // seconds of calm per star lost
  stealStars: 1,
  hitAndRunStars: 1,
};

export const MISSION_ONE = {
  id: 'first-wheels',
  name: 'First Wheels',
  reward: 250,
  dropoffRadius: 12,
  stepSteal: 'Steal a car — walk up to a parked car and press E.',
  stepDrive: 'Drive to the marina drop-off on the east coast.',
  complete: 'First Wheels complete! Danny earned $250.',
};

export const AUDIO = {
  masterVolume: 0.5,
  musicVolume: 0.16,
  engineVolume: 0.12,
  blipVolume: 0.2,
  musicTempo: 96, // beats per minute for the chord loop
};
