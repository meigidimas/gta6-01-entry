// Neon Bay Heat — small seeded deterministic RNG.
// The whole city is generated from one seed, so the same seed always builds
// the same streets, buildings and parked cars. That is what makes the
// screenshot scenes reproducible: shot mode re-seeds the world with seed 1.

export function seedFromString(text) {
  // FNV-1a over the string's code points, folded to an unsigned 32-bit seed.
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function createRng(seed) {
  // mulberry32: tiny, fast, and good enough for city generation.
  let state = (seed >>> 0) || 0x9e3779b9;

  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    next,
    range(min, max) {
      return min + (max - min) * next();
    },
    int(min, max) {
      // Inclusive on both ends: int(0, 3) can return 0, 1, 2 or 3.
      return Math.floor(min + (max - min + 1) * next());
    },
    chance(p) {
      return next() < p;
    },
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
    fork() {
      // A child stream that stays deterministic under the parent's seed.
      return createRng(Math.floor(next() * 4294967296));
    },
  };
}
