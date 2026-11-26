// Ridge Runner — the flight model and the sortie state machine.
// One file, one job: how the plane moves, what a gate pass scores, when a
// sortie is won, crashed or out of fuel. No drawing happens here.

import { FLIGHT, FUEL, GRAVITY, SCORE, SCREEN_CRASHED, SCREEN_LANDED, SCREEN_OUT_OF_FUEL, SCREEN_PLAY, STEP } from './config.js';
import { clamp, lerp } from './random.js';
import { buildWorld, courseHeading, courseX, terrainHeight } from './terrain.js';

/** Fresh plane state at the start of a mission. */
export function freshPlane(world) {
  const startZ = 0;
  return {
    x: courseX(startZ, world.seed),
    y: terrainHeight(courseX(startZ, world.seed), startZ, world.mission) + 130,
    z: startZ,
    heading: courseHeading(startZ, world.seed),
    pitch: 0,
    roll: 0,
    speed: FLIGHT.cruiseSpeed,
    throttle: 0.62,
    fuel: world.mission.fuel,
    verticalSpeed: 0,
    onGround: false,
    landed: false,
  };
}

/** Fresh sortie state for mission `missionIndex`. */
export function newSortie(missionIndex) {
  const world = buildWorld(missionIndex);
  return {
    world,
    plane: freshPlane(world),
    screen: SCREEN_PLAY,
    score: 0,
    gatesPassed: 0,
    streak: 0,
    time: 0,
    message: '',
    messageUntil: 0,
    crashReason: '',
    popups: [], // floating "+100" score callouts {text, until}
    best: 0,
  };
}

/** Show a centre-screen message for `seconds`. */
function announce(sortie, text, seconds) {
  sortie.message = text;
  sortie.messageUntil = sortie.time + seconds;
}

/** Add a floating score popup. */
function popup(sortie, text) {
  sortie.popups.push({ text, until: sortie.time + 1.6 });
}

/**
 * One physics step. `control` is {bank, pitch, throttle} in [-1, 1] (throttle
 * 0..1): bank steers the roll, pitch the nose, throttle the target speed.
 * Returns an event flag string ('gate' | 'landed' | 'crashed' | 'fuel-out' | '').
 */
export function stepFlight(sortie, control, dt) {
  const plane = sortie.plane;
  const mission = sortie.world.mission;
  sortie.time += dt;

  if (plane.onGround) {
    // Rolling out on the runway: bleed speed, hold the centreline.
    plane.speed = Math.max(0, plane.speed - 14 * dt);
    plane.z += Math.cos(plane.heading) * plane.speed * dt;
    plane.x += Math.sin(plane.heading) * plane.speed * dt;
    if (plane.speed < 6 && !plane.landed) {
      plane.landed = true;
      return finishLanding(sortie);
    }
    return '';
  }

  // --- Throttle and speed ---------------------------------------------------
  plane.throttle = clamp(control.throttle, 0, 1);
  const targetSpeed = lerp(FLIGHT.minSpeed, FLIGHT.maxSpeed, plane.throttle);
  plane.speed += (targetSpeed - plane.speed) * FLIGHT.accelRate * dt;
  if (plane.fuel <= 0) {
    // Engine out: the prop windmills and the plane glides, sinking gently.
    plane.speed = Math.max(FLIGHT.minSpeed * 0.7, plane.speed - 3 * dt);
  }

  // --- Attitude -------------------------------------------------------------
  const targetRoll = control.bank * FLIGHT.maxRoll;
  plane.roll += clamp(targetRoll - plane.roll, -FLIGHT.rollRate * dt, FLIGHT.rollRate * dt);
  const targetPitch = control.pitch * FLIGHT.maxPitch;
  plane.pitch += clamp(targetPitch - plane.pitch, -FLIGHT.pitchRate * dt, FLIGHT.pitchRate * dt);

  // --- Motion ---------------------------------------------------------------
  const turnRate = (GRAVITY * Math.tan(plane.roll)) / Math.max(plane.speed, 20);
  plane.heading += turnRate * dt;
  const forward = Math.cos(plane.pitch);
  plane.x += Math.sin(plane.heading) * plane.speed * forward * dt;
  plane.z += Math.cos(plane.heading) * plane.speed * forward * dt;
  plane.verticalSpeed = plane.speed * Math.sin(plane.pitch);
  if (plane.speed < FLIGHT.stallSpeed) {
    // The wing gives up: the nose drops and the plane sinks.
    plane.verticalSpeed -= (FLIGHT.stallSpeed - plane.speed) * 0.55;
    plane.pitch = Math.max(plane.pitch - 0.35 * dt, -0.3);
  }
  plane.y += plane.verticalSpeed * dt;

  // --- Fuel -----------------------------------------------------------------
  if (plane.fuel > 0) {
    plane.fuel = Math.max(0, plane.fuel - (FUEL.drainBase + FUEL.drainThrottle * plane.throttle) * dt);
    if (plane.fuel === 0) {
      announce(sortie, 'FUEL EMPTY — GLIDE TO THE RUNWAY', 4);
    }
  }

  // --- Gates ----------------------------------------------------------------
  const next = nextGate(sortie);
  if (next) {
    const dx = plane.x - next.x;
    const dy = plane.y - next.y;
    const dz = plane.z - next.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < next.radius + 8) {
      next.passed = true;
      sortie.gatesPassed += 1;
      sortie.streak += 1;
      const centre = dist < next.radius * 0.55;
      next.centre = centre;
      let points = SCORE.gate + (sortie.streak - 1) * SCORE.gateStreakBonus;
      if (centre) points += SCORE.centreBonus;
      sortie.score += points;
      popup(sortie, `GATE ${next.index + 1}  +${points}${centre ? '  DEAD CENTRE!' : ''}`);
      if (sortie.gatesPassed === sortie.world.gates.length) {
        announce(sortie, 'ALL GATES — LAND ON THE RUNWAY', 4);
      }
      return 'gate';
    }
    // Missed it: flew past the ring without going through.
    if (plane.z > next.z + 60 && Math.abs(plane.x - next.x) > next.radius + 40) {
      next.passed = true; // mark so the next ring becomes the target
      sortie.streak = 0;
      popup(sortie, 'GATE MISSED');
    }
  }

  // --- Terrain and landing --------------------------------------------------
  const ground = terrainHeight(plane.x, plane.z, mission);
  const runway = sortie.world.runway;
  const overRunway = runway.contains(plane.x, plane.z);
  const clearance = plane.y - ground;

  if (overRunway && clearance <= 3.5 && plane.y - runway.elevation <= 4.5) {
    // Touchdown: a gentle, slow, aligned arrival is a landing; anything
    // else is a runway excursion. The window is wider than the crash
    // clearance so a skimming arrival lands instead of clipping the turf.
    const aligned = Math.abs(wrapAngle(plane.heading - runway.heading)) < 0.35;
    const gentle = plane.verticalSpeed > -FLIGHT.maxLandingSink;
    const slow = plane.speed < FLIGHT.maxLandingSpeed;
    if (gentle && slow && aligned) {
      plane.onGround = true;
      plane.y = runway.elevation + 1.5;
      plane.pitch = 0;
      plane.roll = 0;
      announce(sortie, 'TOUCHDOWN — ROLLING OUT', 3);
      return 'touchdown';
    }
    return crash(sortie, 'RAN OFF THE RUNWAY');
  }
  if (clearance <= FLIGHT.groundClearance) {
    return crash(sortie, clearance <= 0.5 ? 'TERRAIN STRIKE' : 'CLIPPED THE RIDGE');
  }
  if (plane.y < -5) return crash(sortie, 'INTO THE RIVER');

  // Out of fuel and sinking below the valley: the sortie is over.
  if (plane.fuel <= 0 && plane.y < terrainHeight(plane.x, plane.z, mission) + 25 && plane.speed < FLIGHT.minSpeed) {
    sortie.screen = SCREEN_OUT_OF_FUEL;
    sortie.crashReason = 'OUT OF FUEL — DITCHED IN THE VALLEY';
    return 'fuel-out';
  }
  return '';
}

/** The next ring the pilot should fly through, or null when all are done. */
export function nextGate(sortie) {
  for (let i = 0; i < sortie.world.gates.length; i += 1) {
    if (!sortie.world.gates[i].passed) return sortie.world.gates[i];
  }
  return null;
}

/** Score the landing and close the sortie as a success. */
function finishLanding(sortie) {
  const plane = sortie.plane;
  const mission = sortie.world.mission;
  const allGates = sortie.gatesPassed === sortie.world.gates.length;
  let bonus = 0;
  if (allGates) {
    bonus += SCORE.landing;
    bonus += Math.round(plane.fuel) * SCORE.fuelBonusPerUnit;
    bonus += Math.max(0, Math.round(mission.parTime - sortie.time)) * SCORE.timeBonusPerSecond;
  }
  sortie.score += bonus;
  sortie.screen = SCREEN_LANDED;
  sortie.crashReason = allGates
    ? `MISSION COMPLETE — LANDING BONUS +${bonus}`
    : `LANDED — ${sortie.world.gates.length - sortie.gatesPassed} GATE(S) MISSED`;
  return 'landed';
}

/** End the sortie in a crash. */
function crash(sortie, reason) {
  sortie.screen = SCREEN_CRASHED;
  sortie.crashReason = reason;
  sortie.streak = 0;
  return 'crashed';
}

/** Wrap an angle to [-PI, PI]. */
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Seconds of fuel left at the current burn rate (for the gauge). */
export function fuelSecondsLeft(plane) {
  const burn = FUEL.drainBase + FUEL.drainThrottle * plane.throttle;
  return plane.fuel / burn;
}

export { STEP };
