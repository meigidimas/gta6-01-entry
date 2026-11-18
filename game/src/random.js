// Neon Bay Heat — a small seeded deterministic random number generator.
// The whole city, traffic and parked cars are built from one seed, so a
// screenshot scene or a saved game can rebuild the exact same Neon Bay.

export function makeRng(seed) {
  // mulberry32: tiny, fast, and good enough for procedural placement.
  let state = seed >>> 0;
  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    // Uniform float in [0, 1).
    next,
    // Uniform float in [min, max).
    range(min, max) {
      return min + (max - min) * next();
    },
    // Uniform integer in [min, max] inclusive.
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    // True with probability p.
    chance(p) {
      return next() < p;
    },
    // One element of a non-empty array.
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
    // A new generator forked from this one (independent stream).
    fork() {
      return makeRng(Math.floor(next() * 0xffffffff));
    },
  };
}

// Hash a short string into a 32-bit seed so named scenes are stable.
export function seedFromString(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
