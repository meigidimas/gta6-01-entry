// Neon Bay Heat — tuning, colours and city parameters.
// Every magic number the game uses lives here so later phases can
// retune feel without hunting through the systems.

export const GAME = {
  title: 'NEON BAY HEAT',
  hero: 'Danny Cole',
  city: 'Neon Bay',
  saveKey: 'neon-bay-heat-save-v1',
  fixedStep: 1 / 60,
  defaultSeed: 20261118,
};

export const CITY = {
  // Grid: BLOCKS x BLOCKS city blocks separated by roads.
  blocks: 7,
  blockSize: 36, // metres of buildings per block side
  roadWidth: 14, // metres of asphalt between blocks
  sidewalk: 2.5, // pavement apron around each block
  // Derived: distance between neighbouring road centrelines.
  get pitch() { return this.blockSize + this.roadWidth; },
  // Derived: half-extent of the whole built area (roads included).
  get halfExtent() {
    return ((this.blocks - 1) * this.pitch + this.roadWidth) / 2 + this.blockSize / 2;
  },
  buildingMinHeight: 7,
  buildingMaxHeight: 42,
  towerChance: 0.16, // chance a building becomes a tall tower
  towerMinHeight: 48,
  towerMaxHeight: 88,
  coastOffset: 34, // metres of sand between the last road and the water
  waterWidth: 260,
};

export const PALETTE = {
  sky: 0x87c5e8,
  fog: 0x9fd0e8,
  sun: 0xfff2d0,
  ground: 0x3f7d4e, // grass / park green under the city
  asphalt: 0x33373d,
  roadLine: 0xf2e8c9,
  sidewalk: 0xb9b3a4,
  sand: 0xe8d9a0,
  water: 0x2a7f9e,
  // Building facade tints: sun-bleached coastal pastels and glass.
  facades: [0xe8dcc8, 0xd8c8b0, 0xc8d8e0, 0xe0b8a8, 0xb8d0c0, 0xd8d0e8, 0xf0e0b8, 0xa8c8d8, 0xe8c8c8, 0x90b8c8],
  glass: 0x6fa8c8,
  palmTrunk: 0x8a6a48,
  palmLeaf: 0x2f8a4a,
  lampPole: 0x44484e,
  lampGlow: 0xffe9a8,
  marker: 0xffd23f,
  markerBeam: 0xffd23f,
};

export const PLAYER = {
  walkSpeed: 4.2, // m/s on foot
  runSpeed: 8.0, // m/s while holding Shift
  accel: 26, // m/s^2 towards target velocity
  radius: 0.55, // collision circle radius
  enterCarRange: 3.4, // metres to a car door to steal it
  turnRate: 10, // rad/s facing blend
};

export const CAR = {
  accel: 18, // m/s^2 engine force
  brake: 30, // m/s^2 braking force
  reverseAccel: 10,
  maxSpeed: 34, // m/s forward (~122 km/h)
  maxReverse: 9, // m/s backwards
  drag: 0.45, // 1/s velocity decay
  rollingDrag: 1.6, // m/s^2 constant rolling resistance
  steerRate: 2.6, // rad/s at full lock, low speed
  steerSpeedFalloff: 0.55, // steering authority lost at top speed
  grip: 8.5, // 1/s sideways velocity kill (arcade grip)
  bodyWidth: 1.9,
  bodyLength: 4.4,
  crashDamageSpeed: 9, // m/s impact that starts hurting the car
  crashDamage: 14, // health lost per hard hit
  maxHealth: 100,
  colours: [0xc23b3b, 0x2b6fc2, 0xe8c33c, 0x3fae6a, 0xe8e8e8, 0x22262c, 0xc27ab8, 0x37b8b0, 0xe87a2b, 0x7a5fd0],
};

export const TRAFFIC = {
  count: 10,
  cruiseSpeed: 8.5, // m/s
  minGap: 7, // metres to the car ahead before slowing
  carColours: CAR.colours,
};

export const CAMERA = {
  onFootDistance: 7.5,
  onFootHeight: 3.2,
  driveDistance: 10.5,
  driveHeight: 3.4,
  orbitSpeed: 0.0032, // radians per pixel of mouse drag
  pitchMin: -0.12,
  pitchMax: 1.05,
  smooth: 6.0, // 1/s camera position lerp
  lookSmooth: 9.0, // 1/s look-target lerp
  fov: 62,
};

export const WANTED = {
  stealStars: 1, // stars gained for stealing a parked car
  maxStars: 5,
  decaySeconds: 45, // seconds of calm before a star fades
  finePerStar: 50, // cash lost per star if busted (later phase)
};

export const MISSION_ONE = {
  id: 'first-wheels',
  title: 'First Wheels',
  giver: 'Rosa',
  reward: 250,
  intro: 'Rosa needs a ride. Grab any car on the street, then bring it to the drop-off by the marina.',
  steps: [
    { id: 'steal', text: 'Steal a car — walk up to one and press E' },
    { id: 'deliver', text: 'Drive to the drop-off marker by the marina' },
  ],
};

export const AUDIO = {
  masterVolume: 0.5,
  engineVolume: 0.16,
  musicVolume: 0.12,
  // A lazy four-chord loop in A minor, one chord per bar, 100 BPM.
  musicBpm: 100,
  musicChords: [
    [110.0, 164.81, 220.0], // A2 E3 A3
    [87.31, 130.81, 174.61], // F2 C3 F3
    [98.0, 146.83, 196.0], // G2 D3 G3
    [82.41, 123.47, 164.81], // E2 B2 E3
  ],
};
