// Ridge Runner — deterministic screenshot scenes.
// One file, one job: drive the real game forward from a fresh sortie with a
// simple autopilot, so ?shot=start|play|land|end always frames the same
// moment of the same flight. The screenshots are renders of the game's own
// code, never staged pictures.

import { SCREEN_CRASHED, SCREEN_LANDED, SCREEN_PLAY, SCREEN_TITLE, STEP } from './config.js';
import { newSortie, nextGate, stepFlight, wrapAngle } from './flight.js';
import { clamp } from './random.js';

const SAMPLE = STEP;

/**
 * Steer toward a target point: bank to turn onto it, pitch to meet its
 * altitude, throttle to hold a sensible speed.
 */
function autopilotControl(sortie, target, speedTarget) {
  const plane = sortie.plane;
  const dx = target.x - plane.x;
  const dz = target.z - plane.z;
  const desiredHeading = Math.atan2(dx, dz);
  const headingError = wrapAngle(desiredHeading - plane.heading);
  // Bank toward the heading error; the steeper the error, the harder the bank.
  const bank = clamp(headingError * 1.6, -1, 1);
  const dy = target.y - plane.y;
  const dist = Math.max(40, Math.sqrt(dx * dx + dz * dz));
  const desiredPitch = clamp(Math.atan2(dy, dist), -0.3, 0.3);
  const pitch = clamp(desiredPitch * 2.4 - plane.pitch, -1, 1);
  const throttle = clamp(0.35 + (speedTarget - plane.speed) * 0.02, 0.25, 0.9);
  return { bank, pitch, throttle };
}

/** Run the sortie forward for up to `seconds` of game time with the autopilot. */
function flyForward(sortie, seconds, targetFor, stopWhen) {
  let event = '';
  for (let t = 0; t < seconds; t += SAMPLE) {
    const target = targetFor(sortie);
    const control = autopilotControl(sortie, target, 52);
    event = stepFlight(sortie, control, SAMPLE);
    if (event === 'crashed' || event === 'landed' || event === 'fuel-out') break;
    if (stopWhen && stopWhen(sortie)) break;
  }
  return event;
}

/** Where the autopilot aims while gates remain: the next ring. */
function gateTarget(sortie) {
  const gate = nextGate(sortie);
  if (gate) return { x: gate.x, y: gate.y, z: gate.z };
  const runway = sortie.world.runway;
  return { x: runway.x, y: runway.elevation + 14, z: runway.z - runway.length / 2 + 60 };
}

/** Where the autopilot aims on final approach: the runway threshold, low. */
function landingTarget(sortie) {
  const runway = sortie.world.runway;
  const plane = sortie.plane;
  const local = runway.local(plane.x, plane.z);
  const halfLen = runway.length / 2;
  // Distance still to fly before the threshold (positive while approaching).
  const before = -(local.along + halfLen);
  // Far out, or badly off the centreline: hold altitude and fly to a point
  // 600 m out on the extended centreline, so the descent starts aligned.
  if (before > 550 || Math.abs(local.across) > 70) {
    const p = runway.pointAt(-halfLen - 600);
    return { x: p.x, y: runway.elevation + 90, z: p.z };
  }
  // On final: aim 150 m ahead of the plane, on a 6-degree glide to the
  // threshold, so the nose stays on the slope instead of diving at it.
  // Once over the runway, aim at the surface itself: the flare that ends
  // the flight in a touchdown instead of a float down the whole strip.
  const aheadAlong = clamp(local.along + 150, -halfLen - 600, halfLen);
  const aheadBefore = Math.max(0, -(aheadAlong + halfLen));
  const p = runway.pointAt(aheadAlong);
  const targetY =
    aheadAlong > -halfLen
      ? runway.elevation + 1.5
      : runway.elevation + 6 + aheadBefore * 0.1;
  return { x: p.x, y: targetY, z: p.z };
}

/**
 * Stage the named screenshot scene on a fresh sortie and return the screen
 * to draw over it. Scenes: start (title over a cruising plane), play
 * (mid-flight through the rings), land (final approach, runway ahead),
 * end (mission complete after a full flown sortie).
 */
export function stageShot(name, missionIndex) {
  const sortie = newSortie(missionIndex);
  if (name === 'start') {
    // Attract mode: cruise for a few seconds, then show the title.
    flyForward(sortie, 6, gateTarget);
    sortie.screen = SCREEN_TITLE;
    sortie.best = 0;
    return { sortie, screen: SCREEN_TITLE };
  }
  if (name === 'play') {
    flyForward(sortie, 24, gateTarget);
    sortie.screen = sortie.screen === SCREEN_PLAY ? SCREEN_PLAY : sortie.screen;
    return { sortie, screen: sortie.screen };
  }
  if (name === 'land') {
    // Fly the rings, then line up on final approach and freeze the frame
    // just before touchdown, with the runway filling the view.
    flyForward(sortie, 260, gateTarget, (s) => nextGate(s) === null);
    let guard = 0;
    while (sortie.screen === SCREEN_PLAY && guard < 6000) {
      const control = autopilotControl(sortie, landingTarget(sortie), 42);
      const event = stepFlight(sortie, control, SAMPLE);
      guard += 1;
      if (event === 'crashed' || event === 'landed' || event === 'fuel-out') break;
      const runway = sortie.world.runway;
      const local = runway.local(sortie.plane.x, sortie.plane.z);
      const distToThreshold = -(local.along + runway.length / 2);
      if (distToThreshold < 180 && distToThreshold > -100 && sortie.plane.y < runway.elevation + 32) break;
    }
    sortie.screen = SCREEN_PLAY;
    return { sortie, screen: SCREEN_PLAY };
  }
  // end: fly the whole mission, rings and landing, with the autopilot.
  flyForward(sortie, 260, gateTarget, (s) => nextGate(s) === null);
  let guard = 0;
  while (sortie.screen === SCREEN_PLAY && guard < 12000) {
    const control = autopilotControl(sortie, landingTarget(sortie), 40);
    const event = stepFlight(sortie, control, SAMPLE);
    guard += 1;
    if (event === 'crashed' || event === 'landed' || event === 'fuel-out') break;
  }
  return { sortie, screen: sortie.screen };
}
