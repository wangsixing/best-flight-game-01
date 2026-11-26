// Ridge Runner — synthesized sound, no audio files.
// One file, one job: a WebAudio engine hum that follows the throttle, plus
// the gate chime, the touchdown fanfare and the crash thud. Everything is
// generated, so the game ships with zero audio assets and zero network.

/** Create the sound engine. Call `unlock()` from a user gesture first. */
export function createAudio() {
  const audio = {
    context: null,
    master: null,
    engineOsc: null,
    engineGain: null,
    windGain: null,
    muted: false,
    unlocked: false,
  };

  /** Start the AudioContext (browsers require a gesture) and the engine loop. */
  audio.unlock = function unlock() {
    if (audio.unlocked) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audio.context = new Ctx();
      audio.master = audio.context.createGain();
      audio.master.gain.value = 0.5;
      audio.master.connect(audio.context.destination);

      // Engine: a low sawtooth plus a soft sub sine, through a low-pass.
      const filter = audio.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      filter.connect(audio.master);
      audio.engineOsc = audio.context.createOscillator();
      audio.engineOsc.type = 'sawtooth';
      audio.engineOsc.frequency.value = 62;
      audio.engineGain = audio.context.createGain();
      audio.engineGain.gain.value = 0;
      audio.engineOsc.connect(audio.engineGain);
      audio.engineGain.connect(filter);
      audio.engineOsc.start();

      // Wind: looped filtered noise whose level follows airspeed.
      const buffer = audio.context.createBuffer(1, audio.context.sampleRate, audio.context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      const noise = audio.context.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const windFilter = audio.context.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 700;
      windFilter.Q.value = 0.6;
      audio.windGain = audio.context.createGain();
      audio.windGain.gain.value = 0;
      noise.connect(windFilter);
      windFilter.connect(audio.windGain);
      audio.windGain.connect(audio.master);
      noise.start();

      audio.unlocked = true;
    } catch (error) {
      audio.unlocked = false;
    }
  };

  /** Continuous engine + wind levels, called every frame. */
  audio.update = function update(throttle, speed, onGround) {
    if (!audio.unlocked || audio.muted) return;
    const t = audio.context.currentTime;
    const rpm = 46 + throttle * 58 + speed * 0.12;
    audio.engineOsc.frequency.setTargetAtTime(rpm, t, 0.08);
    const engineLevel = onGround && speed < 2 ? 0 : 0.05 + throttle * 0.075;
    audio.engineGain.gain.setTargetAtTime(engineLevel, t, 0.1);
    const windLevel = Math.max(0, (speed - 30) / 90) * 0.05;
    audio.windGain.gain.setTargetAtTime(windLevel, t, 0.15);
  };

  /** One short tone: frequency, seconds, shape, volume. */
  function tone(freq, seconds, type, volume, when) {
    if (!audio.unlocked || audio.muted) return;
    const t0 = audio.context.currentTime + (when || 0);
    const osc = audio.context.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    const gain = audio.context.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(volume || 0.18, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + seconds);
    osc.connect(gain);
    gain.connect(audio.master);
    osc.start(t0);
    osc.stop(t0 + seconds + 0.05);
  }

  audio.gate = function gate(centre) {
    tone(880, 0.35, 'sine', 0.2);
    tone(1318, 0.4, 'sine', 0.16, 0.07);
    if (centre) tone(1760, 0.5, 'sine', 0.14, 0.14);
  };

  audio.miss = function miss() {
    tone(220, 0.3, 'triangle', 0.12);
  };

  audio.touchdown = function touchdown() {
    [523, 659, 784, 1046].forEach((freq, i) => tone(freq, 0.5, 'sine', 0.18, i * 0.11));
  };

  audio.crash = function crash() {
    tone(90, 0.7, 'sawtooth', 0.3);
    tone(55, 0.9, 'sine', 0.32, 0.05);
  };

  audio.click = function click() {
    tone(660, 0.08, 'square', 0.07);
  };

  audio.setMuted = function setMuted(muted) {
    audio.muted = muted;
    if (audio.master) audio.master.gain.value = muted ? 0 : 0.5;
  };

  return audio;
}
