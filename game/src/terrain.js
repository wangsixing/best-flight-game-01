// Ridge Runner — the valley itself.
// One file, one job: the course centreline, the terrain height function,
// the ring gates, the runway and the clouds, all derived from one seed so
// every mission flies over its own valley, every time.

import { MISSIONS, RUNWAY, WORLD } from './config.js';
import { clamp, fbm, lerp, makeRng } from './random.js';

/** The valley's centreline: a gentle S-curve the river and the rings follow. */
export function courseX(z, seed) {
  return (
    170 * Math.sin(z * 0.00042 + seed * 0.11) +
    90 * Math.sin(z * 0.0011 + seed * 0.031 + 1.7)
  );
}

/** Heading (radians, 0 = north / +z) of the centreline at distance z. */
export function courseHeading(z, seed) {
  const dx = courseX(z + 20, seed) - courseX(z - 20, seed);
  return Math.atan2(dx, 40);
}

/** Smooth falloff: 1 inside the valley, 0 out on the ridges. */
function valleyMask(x, z, seed) {
  const d = Math.abs(x - courseX(z, seed));
  return 1 - clamp((d - 130) / 320, 0, 1);
}

/**
 * Terrain height in metres at world (x, z).
 * The valley floor hugs the river; the ridges rise on both sides with
 * fbm ridges; the airfield past the last gate is flattened for the runway.
 */
export function terrainHeight(x, z, mission) {
  const seed = mission.seed;
  const valley = valleyMask(x, z, seed);
  // Rolling valley floor: low, with a shallow river channel down the middle.
  const riverD = Math.abs(x - courseX(z, seed));
  const floor = 6 + fbm(x * 0.002, z * 0.002, seed) * 7 - Math.max(0, 26 - riverD) * 0.28;
  // Ridges: big fbm swell that only reaches full height away from the valley.
  const ridge = 34 + fbm(x * 0.0011 + 40, z * 0.0011, seed + 31) * 95;
  let h = lerp(ridge, floor, valley);
  // Airfield: flatten a corridor around the runway and its approach so the
  // landing is on flat ground, not on a ridge shoulder. The blend ramps in
  // over the last 300 m before the threshold and out 120–300 m to each side.
  const rz = runwayZ(mission);
  const rx = courseX(rz, seed);
  const rh = courseHeading(rz, seed);
  const dx = x - rx;
  const dz = z - rz;
  const along = dx * Math.sin(rh) + dz * Math.cos(rh);
  const across = dx * Math.cos(rh) - dz * Math.sin(rh);
  const halfLen = RUNWAY.length / 2;
  if (along > -halfLen - 700 && along < halfLen + 100 && Math.abs(across) < 300) {
    const inT = clamp((along + halfLen + 700) / 300, 0, 1);
    const latT = clamp(1 - (Math.abs(across) - 120) / 180, 0, 1);
    const w = inT * inT * (3 - 2 * inT) * latT;
    h = lerp(h, WORLD.fieldElevation + fbm(x * 0.004, z * 0.004, seed + 7) * 1.2, w);
  }
  return h;
}

/** Z coordinate of the runway centre for a mission. */
export function runwayZ(mission) {
  const lastGateZ = gateZ(mission.gates - 1, mission);
  return lastGateZ + RUNWAY.extraPastLastGate;
}

/** Z coordinate of gate `index` (0-based). */
export function gateZ(index, mission) {
  return 420 + index * mission.gateSpacing;
}

/**
 * Build the ring gates for a mission: each one hangs over the river at a
 * height above the valley floor, tilted to face the oncoming pilot.
 */
export function buildGates(mission) {
  const rng = makeRng(mission.seed * 7 + 13);
  const gates = [];
  for (let i = 0; i < mission.gates; i += 1) {
    const z = gateZ(i, mission);
    const cx = courseX(z, mission.seed);
    const floorY = terrainHeight(cx, z, mission);
    const wobble = (rng() - 0.5) * 46;
    gates.push({
      index: i,
      x: cx + wobble,
      y: floorY + mission.gateAltitude + (rng() - 0.5) * 22,
      z,
      radius: mission.gateRadius,
      heading: courseHeading(z, mission.seed),
      passed: false,
      centre: false,
    });
  }
  return gates;
}

/** The runway rectangle, in world coordinates, for a mission. */
export function buildRunway(mission) {
  const z = runwayZ(mission);
  const x = courseX(z, mission.seed);
  const heading = courseHeading(z, mission.seed);
  const halfLen = RUNWAY.length / 2;
  const halfWid = RUNWAY.width / 2;
  const sinH = Math.sin(heading);
  const cosH = Math.cos(heading);
  return {
    x, z, heading, length: RUNWAY.length, width: RUNWAY.width,
    elevation: WORLD.fieldElevation,
    /**
     * Local runway coordinates of a world point: `along` runs -halfLen..halfLen
     * down the strip, `across` runs -halfWid..halfWid over it.
     */
    local(px, pz) {
      const dx = px - x;
      const dz = pz - z;
      return {
        along: dx * sinH + dz * cosH,
        across: dx * cosH - dz * sinH,
      };
    },
    /** World point on the runway centreline at `along` (0 = centre). */
    pointAt(along) {
      return {
        x: x + sinH * along,
        z: z + cosH * along,
      };
    },
    /** True when a world point is over the asphalt. */
    contains(px, pz) {
      const l = this.local(px, pz);
      return Math.abs(l.along) <= halfLen && Math.abs(l.across) <= halfWid;
    },
  };
}

/** Build one mission's whole world: gates, runway and clouds. */
export function buildWorld(missionIndex) {
  const mission = MISSIONS[missionIndex];
  const rng = makeRng(mission.seed * 3 + 5);
  const clouds = [];
  for (let i = 0; i < 26; i += 1) {
    const z = 300 + rng() * 5600;
    clouds.push({
      x: courseX(z, mission.seed) + (rng() - 0.5) * 1500,
      y: 260 + rng() * 180,
      z,
      scale: 90 + rng() * 160,
      drift: (rng() - 0.5) * 2,
    });
  }
  return {
    mission,
    gates: buildGates(mission),
    runway: buildRunway(mission),
    clouds,
    seed: mission.seed,
  };
}
