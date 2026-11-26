// Ridge Runner — the game loop and screen flow.
// One file, one job: boot the canvas, run the frame loop at a fixed step,
// wire input and sound to the sortie, and switch between the title, play,
// pause and end screens. The ?shot= query stages a deterministic screenshot
// scene instead of starting at the title.

import { MISSIONS, SCREEN_CRASHED, SCREEN_LANDED, SCREEN_OUT_OF_FUEL, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, STEP } from './config.js';
import { createAudio } from './audio.js';
import { newSortie, stepFlight } from './flight.js';
import { createInput, readControl } from './input.js';
import { render, titleMissionRects } from './render.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const statusLine = document.getElementById('status');
const ctx = canvas.getContext('2d');
const audio = createAudio();

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const shotSeed = Number(params.get('seed') || '1');
const missionParam = Number(params.get('mission') || '0');
const missionIndex = Number.isInteger(missionParam) && missionParam >= 0 && missionParam < MISSIONS.length ? missionParam : 0;

let sortie;
let screenTime = 0; // seconds the current screen has been shown (for animation)
let throttle = 0.62;
let selectedMission = missionIndex;
let lastAnnounced = '';

if (shotName) {
  // Screenshot mode: stage the scene deterministically; it is rendered once
  // at the bottom of this module, after resize(), so nothing clears it.
  const staged = stageShot(shotName, missionIndex);
  sortie = staged.sortie;
  screenTime = 24;
  document.title = `Ridge Runner — ${shotName}`;
} else {
  sortie = newSortie(selectedMission);
  sortie.screen = SCREEN_TITLE;
  sortie.best = readBest();
}

function readBest() {
  try {
    return Number(window.localStorage.getItem('ridge-runner-best') || '0');
  } catch {
    return 0;
  }
}

function saveBest(score) {
  try {
    window.localStorage.setItem('ridge-runner-best', String(score));
  } catch {
    // Storage is a nicety, never a failure.
  }
}

/** Start a fresh sortie on mission `index`, at the title or in play. */
function startMission(index, inPlay) {
  selectedMission = index;
  throttle = 0.62;
  sortie = newSortie(index);
  sortie.best = readBest();
  sortie.screen = inPlay ? SCREEN_PLAY : SCREEN_TITLE;
  screenTime = 0;
  lastAnnounced = '';
  announce();
}

/** Restart the current mission, straight into play. */
function restart() {
  audio.click();
  startMission(selectedMission, true);
}

function onMenuKey(code) {
  audio.unlock();
  if (code === 'KeyM') {
    audio.setMuted(!audio.muted);
    return;
  }
  if (sortie.screen === SCREEN_TITLE) {
    if (code === 'Digit1') startMission(0, true);
    else if (code === 'Digit2') startMission(1, true);
    else if (code === 'Digit3') startMission(2, true);
    else if (code === 'Enter' || code === 'Space') startMission(selectedMission, true);
    return;
  }
  if (code === 'KeyP') {
    if (sortie.screen === SCREEN_PLAY) {
      sortie.screen = SCREEN_PAUSED;
      audio.update(0, 0, true);
    } else if (sortie.screen === SCREEN_PAUSED) {
      sortie.screen = SCREEN_PLAY;
    }
    return;
  }
  if (code === 'KeyR') {
    if (sortie.screen !== SCREEN_TITLE) restart();
    return;
  }
  if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3') {
    const index = Number(code.slice(-1)) - 1;
    if (sortie.screen === SCREEN_PAUSED || sortie.screen === SCREEN_CRASHED || sortie.screen === SCREEN_LANDED || sortie.screen === SCREEN_OUT_OF_FUEL) {
      startMission(index, true);
    }
  }
}

const input = createInput(canvas, onMenuKey);

canvas.addEventListener('pointerdown', (event) => {
  audio.unlock();
  if (sortie.screen !== SCREEN_TITLE) return;
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
  const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
  for (const r of titleMissionRects(canvas.width, canvas.height)) {
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
      startMission(r.mission, true);
      return;
    }
  }
});

canvas.addEventListener('pointermove', (event) => {
  if (sortie.screen !== SCREEN_TITLE) return;
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
  const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
  sortie.hoverMission = -1;
  for (const r of titleMissionRects(canvas.width, canvas.height)) {
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
      sortie.hoverMission = r.mission;
      return;
    }
  }
});

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
}
window.addEventListener('resize', resize);
resize();

/** Keep the screen-reader status line in step with the game. */
function announce() {
  const plane = sortie.plane;
  const text =
    sortie.screen === SCREEN_TITLE
      ? 'Ridge Runner. Choose a mission: 1 Ridge Run, 2 River Dash, 3 Sunset Landing.'
      : sortie.screen === SCREEN_PLAY
        ? `Flying. Score ${sortie.score}. Gates ${sortie.gatesPassed} of ${sortie.world.gates.length}. Altitude ${Math.round(plane.y * 3.281)} feet, speed ${Math.round(plane.speed * 1.944)} knots, fuel ${Math.round(plane.fuel)}.`
        : `${sortie.screen}. ${sortie.crashReason}. Score ${sortie.score}.`;
  if (text !== lastAnnounced) {
    statusLine.textContent = text;
    lastAnnounced = text;
  }
}

let last = performance.now();
let accumulator = 0;

function frame(now) {
  const elapsed = Math.min((now - last) / 1000, 0.25);
  last = now;
  screenTime += elapsed;
  if (sortie.screen === SCREEN_PLAY) {
    accumulator += elapsed;
    while (accumulator >= STEP) {
      const control = readControl(input, throttle);
      throttle = control.throttle;
      const event = stepFlight(sortie, control, STEP);
      if (event === 'gate') audio.gate(sortie.world.gates[sortie.gatesPassed - 1]?.centre);
      if (event === 'touchdown' || event === 'landed') audio.touchdown();
      if (event === 'crashed' || event === 'fuel-out') audio.crash();
      if (sortie.score > sortie.best) {
        sortie.best = sortie.score;
        saveBest(sortie.best);
      }
      accumulator -= STEP;
      if (sortie.screen !== SCREEN_PLAY) break;
    }
    audio.update(throttle, sortie.plane.speed, sortie.plane.onGround);
    if (Math.floor(screenTime * 2) !== Math.floor((screenTime - elapsed) * 2)) announce();
  } else if (sortie.screen === SCREEN_TITLE) {
    // Attract mode: the plane cruises the valley behind the title.
    accumulator += elapsed;
    while (accumulator >= STEP) {
      const gate = sortie.world.gates[0];
      const dx = gate.x - sortie.plane.x;
      const dz = gate.z - sortie.plane.z;
      const desired = Math.atan2(dx, dz);
      const bank = Math.max(-0.6, Math.min(0.6, (desired - sortie.plane.heading) * 1.4));
      stepFlight(sortie, { bank, pitch: 0, throttle: 0.55 }, STEP);
      accumulator -= STEP;
      if (sortie.plane.z > 2600 || sortie.screen !== SCREEN_TITLE) {
        // Loop the attract flight back to the start of the valley.
        sortie = newSortie(selectedMission);
        sortie.screen = SCREEN_TITLE;
        sortie.best = readBest();
        break;
      }
    }
  }
  render(ctx, canvas.width, canvas.height, sortie, screenTime);
  requestAnimationFrame(frame);
}

function startLoop() {
  requestAnimationFrame(frame);
}

if (shotName) {
  render(ctx, canvas.width, canvas.height, sortie, screenTime);
} else {
  startLoop();
}
