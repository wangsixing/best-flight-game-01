// Ridge Runner — deterministic randomness.
// One file, one job: a small seeded generator and the value-noise field the
// terrain, clouds and gate heights are all built from, so the same seed
// always draws the same valley (and the screenshots are reproducible).

/** Mulberry32: a tiny, fast seeded PRNG with a good spread. */
export function makeRng(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A deterministic hash of two integer grid coordinates -> [0, 1). */
function hash2(ix, iz, seed) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 974634211) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

/**
 * 2D value noise: smooth, continuous, deterministic for a given seed.
 * Returns roughly [-1, 1].
 */
export function valueNoise(x, z, seed) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  const ux = smooth(fx);
  const uz = smooth(fz);
  const top = a + (b - a) * ux;
  const bottom = c + (d - c) * ux;
  return (top + (bottom - top) * uz) * 2 - 1;
}

/**
 * Fractal noise: three octaves of value noise, weighted toward the big shapes.
 * Returns roughly [-1, 1].
 */
export function fbm(x, z, seed) {
  return (
    valueNoise(x, z, seed) * 0.55 +
    valueNoise(x * 2.13 + 7.7, z * 2.13 + 3.1, seed + 5) * 0.3 +
    valueNoise(x * 4.31 + 13.7, z * 4.31 + 9.4, seed + 11) * 0.15
  );
}

/** Clamp a number into [lo, hi]. */
export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Linear interpolation. */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}
