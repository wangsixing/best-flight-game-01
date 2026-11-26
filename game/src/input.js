// Ridge Runner — keyboard and mouse input.
// One file, one job: turn keys and the pointer into a flight control
// {bank, pitch, throttle} and expose menu actions (pause, restart, mute,
// mission select). The mouse steers toward the pointer; the keys always win
// while they are held.

import { clamp } from './random.js';

/** Fresh input state, bound to a canvas and a callback for menu keys. */
export function createInput(canvas, onMenuKey) {
  const keys = new Set();
  const state = {
    keys,
    mouseX: 0.5, // pointer position as a fraction of the canvas
    mouseY: 0.5,
    mouseActive: false, // the pointer has moved since the last key press
    mouseDown: false,
  };

  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', ArrowDown: 'down',
    KeyW: 'throttleUp', KeyS: 'throttleDown',
    ShiftLeft: 'boost', ShiftRight: 'boost',
    ControlLeft: 'slow', ControlRight: 'slow',
  };

  function onKeyDown(event) {
    const mapped = KEYMAP[event.code];
    if (mapped) {
      keys.add(mapped);
      state.mouseActive = false;
      event.preventDefault();
      return;
    }
    if (['KeyP', 'KeyR', 'KeyM', 'Digit1', 'Digit2', 'Digit3', 'Enter', 'Space'].includes(event.code)) {
      event.preventDefault();
      onMenuKey(event.code);
    }
  }

  function onKeyUp(event) {
    const mapped = KEYMAP[event.code];
    if (mapped) keys.delete(mapped);
  }

  function onPointerMove(event) {
    const rect = canvas.getBoundingClientRect();
    state.mouseX = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    state.mouseY = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    state.mouseActive = true;
  }

  function onPointerDown(event) {
    state.mouseDown = true;
    onPointerMove(event);
  }

  function onPointerUp() {
    state.mouseDown = false;
  }

  function onBlur() {
    keys.clear();
    state.mouseDown = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  return state;
}

/**
 * Read the current flight control from the input state.
 * `throttle` is carried over from the previous frame so the lever stays
 * where the pilot left it.
 */
export function readControl(input, throttle) {
  let bank = 0;
  let pitch = 0;
  if (input.keys.has('left')) bank -= 1;
  if (input.keys.has('right')) bank += 1;
  if (input.keys.has('up')) pitch += 1;
  if (input.keys.has('down')) pitch -= 1;

  if (bank === 0 && pitch === 0 && input.mouseActive) {
    // Mouse steering: the pointer's offset from centre is the command.
    // Push the pointer left to bank left, up to climb.
    bank = clamp((input.mouseX - 0.5) * 2.4, -1, 1);
    pitch = clamp((0.5 - input.mouseY) * 2.2, -1, 1);
    // A small dead zone around the centre so the plane flies straight.
    if (Math.abs(bank) < 0.08) bank = 0;
    if (Math.abs(pitch) < 0.08) pitch = 0;
  }

  let nextThrottle = throttle;
  if (input.keys.has('throttleUp') || input.keys.has('boost')) nextThrottle = clamp(throttle + 0.9 / 60, 0, 1);
  if (input.keys.has('throttleDown') || input.keys.has('slow')) nextThrottle = clamp(throttle - 0.9 / 60, 0, 1);
  return { bank, pitch, throttle: nextThrottle };
}
