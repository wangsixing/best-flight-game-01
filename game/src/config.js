// Ridge Runner — tuning, missions and course layout.
// One file, one job: every number the flight model, the terrain and the
// missions share lives here so the game can be balanced without hunting.

export const STEP = 1 / 60;
export const GRAVITY = 9.81;

// --- Flight model -----------------------------------------------------------
export const FLIGHT = {
  minSpeed: 24, // m/s — below this the wing stops flying
  maxSpeed: 78, // m/s at full throttle
  cruiseSpeed: 52,
  accelRate: 0.55, // how fast speed chases the throttle target (per second)
  maxRoll: 0.95, // radians of bank
  maxPitch: 0.38, // radians nose up / down
  rollRate: 2.6, // radians per second toward the commanded bank
  pitchRate: 1.9, // radians per second toward the commanded pitch
  stallSpeed: 27,
  groundClearance: 3, // metres above the terrain before a crash
  maxLandingSink: 7, // m/s of descent a touchdown may carry
  maxLandingSpeed: 58,
};

// --- Fuel -------------------------------------------------------------------
export const FUEL = {
  drainBase: 0.12, // units per second at idle
  drainThrottle: 0.55, // extra units per second at full throttle
  reserveWarn: 25, // fuel level that turns the gauge amber, then red
};

// --- Scoring ----------------------------------------------------------------
export const SCORE = {
  gate: 100,
  gateStreakBonus: 25, // per consecutive gate without a miss
  centreBonus: 50, // passing within the inner half of a ring
  landing: 250,
  fuelBonusPerUnit: 4, // left-over fuel at touchdown
  timeBonusPerSecond: 2, // under the mission par time
};

// --- World ------------------------------------------------------------------
export const WORLD = {
  cellSize: 40, // metres between terrain grid samples
  viewAhead: 680, // metres of terrain drawn ahead of the plane
  viewWide: 520, // metres of terrain drawn to each side
  waterLevel: 2.5, // terrain below this is river water
  fieldElevation: 4, // the flat airfield the runway sits on
  fogNear: 260, // metres where haze starts to wash the terrain out
  fogFar: 680, // metres where the terrain is fully haze
};

// --- Missions ---------------------------------------------------------------
// Each mission is a valley run: a chain of glowing rings follows the river
// down the valley, then the runway waits at the far end of the airfield.
// `seed` drives the terrain, the clouds and the gate heights.
export const MISSIONS = [
  {
    id: 0,
    name: 'RIDGE RUN',
    tag: 'Learn the valley — wide turns, generous fuel',
    seed: 101,
    gates: 8,
    gateSpacing: 470,
    gateAltitude: 95, // metres above the valley floor
    gateRadius: 30,
    fuel: 120,
    parTime: 150, // seconds for the time bonus
    dusk: 0, // 0 = bright morning, 1 = full sunset
    difficulty: 'EASY',
  },
  {
    id: 1,
    name: 'RIVER DASH',
    tag: 'Low and fast down the river — tight rings, thin margins',
    seed: 207,
    gates: 10,
    gateSpacing: 430,
    gateAltitude: 62,
    gateRadius: 26,
    fuel: 110,
    parTime: 165,
    dusk: 0.35,
    difficulty: 'MEDIUM',
  },
  {
    id: 2,
    name: 'SUNSET LANDING',
    tag: 'Twelve rings into a golden-hour landing — fly it home',
    seed: 311,
    gates: 12,
    gateSpacing: 400,
    gateAltitude: 78,
    gateRadius: 27,
    fuel: 105,
    parTime: 190,
    dusk: 1,
    difficulty: 'HARD',
  },
];

// The runway sits past the last gate, on the flat airfield.
export const RUNWAY = {
  length: 620,
  width: 42,
  extraPastLastGate: 900, // metres beyond the final ring
};

// How the screens are named (used by render.js and shots.js).
export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_CRASHED = 'crashed';
export const SCREEN_LANDED = 'landed';
export const SCREEN_OUT_OF_FUEL = 'out-of-fuel';
