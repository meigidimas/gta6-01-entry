// Neon Bay Heat — synthesised sound with the Web Audio API only.
// No audio files: the engine is a filtered sawtooth, the UI is short
// sine blips, and the music is a slow chord loop of detuned triangles.
// Nothing starts until a user gesture (the browser's rule), and every
// sound survives a missing AudioContext by quietly doing nothing.

import { AUDIO } from './config.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineFilter = null;
    this.engineGain = null;
    this.musicTimer = null;
    this.musicChord = 0;
    this.muted = false;
    this.engineOn = false;
  }

  // Create the context on a click or keypress; safe to call repeatedly.
  // Without a real gesture the browser would suspend it at once (and
  // log a warning), so staged screenshot runs simply stay silent.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.userActivation
      && !navigator.userActivation.hasBeenActive) return;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : AUDIO.masterVolume;
      this.master.connect(this.ctx.destination);
      this.startEngineLoop();
      this.startMusic();
    } catch {
      this.ctx = null;
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : AUDIO.masterVolume, this.ctx.currentTime, 0.05);
    }
  }

  // The engine: two detuned saws through a lowpass, pitch follows speed.
  startEngineLoop() {
    const ctx = this.ctx;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 420;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc2.type = 'sawtooth';
    this.engineOsc2.frequency.value = 55 * 1.007;
    this.engineOsc.connect(this.engineFilter);
    this.engineOsc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    this.engineOsc2.start();
    this.engineOn = true;
  }

  // speedNorm in [0, 1]; inCar false silences the engine.
  setEngine(speedNorm, inCar) {
    if (!this.engineOn || !this.ctx) return;
    const t = this.ctx.currentTime;
    const rpm = 50 + speedNorm * 165;
    this.engineOsc.frequency.setTargetAtTime(rpm, t, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(rpm * 1.007, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(320 + speedNorm * 1400, t, 0.1);
    const target = inCar ? AUDIO.engineVolume * (0.45 + 0.55 * speedNorm) : 0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.12);
  }

  // One short sine blip; pitch picks the mood (UI, pickup, error).
  blip(freq = 660, seconds = 0.09, volume = 0.22) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + seconds + 0.02);
  }

  // A rising three-note jingle for a completed mission step.
  success() {
    if (!this.ctx) return;
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      window.setTimeout(() => this.blip(freq, 0.22, 0.25), i * 110);
    });
  }

  // A low two-note sting for a crash or a failed objective.
  thud() {
    if (!this.ctx) return;
    this.blip(110, 0.22, 0.35);
    window.setTimeout(() => this.blip(82, 0.3, 0.3), 90);
  }

  // The music loop: one chord per bar, soft triangle pads, plus a
  // sparse plucked melody note on some beats. Pure oscillators.
  startMusic() {
    if (this.musicTimer !== null) return;
    const beatMs = (60 / AUDIO.musicBpm) * 1000;
    let beat = 0;
    const playChord = (freqs) => {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      freqs.forEach((freq) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(AUDIO.musicVolume / freqs.length, t + 0.4);
        gain.gain.setValueAtTime(AUDIO.musicVolume / freqs.length, t + beatMs * 3.6 / 1000);
        gain.gain.linearRampToValueAtTime(0, t + beatMs * 4 / 1000);
        osc.connect(gain);
        gain.connect(this.master);
        osc.start(t);
        osc.stop(t + beatMs * 4 / 1000 + 0.05);
      });
    };
    const melody = [440, 0, 523.25, 0, 659.25, 0, 587.33, 0];
    this.musicTimer = window.setInterval(() => {
      if (!this.ctx) return;
      if (beat % 4 === 0) {
        playChord(AUDIO.musicChords[this.musicChord % AUDIO.musicChords.length]);
        this.musicChord += 1;
      }
      const note = melody[beat % melody.length];
      if (note) this.blip(note, 0.3, 0.06);
      beat += 1;
    }, beatMs);
  }

  stopMusic() {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }
}
