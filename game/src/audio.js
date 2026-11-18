// Neon Bay Heat — synthesized sound, no audio files.
// Everything is built from WebAudio oscillators: a sawtooth engine hum, UI
// blips, a success jingle and a slow chord-loop soundtrack. The context is
// created only after a real user gesture, as browsers require.

import { AUDIO } from './config.js';

const CHORDS = [
  [220.0, 261.63, 329.63], // A minor
  [174.61, 220.0, 261.63], // F major
  [196.0, 246.94, 293.66], // G major
  [164.81, 220.0, 261.63], // E minor
];

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.musicGain = null;
    this.musicTimer = null;
    this.nextChordAt = 0;
    this.chordIndex = 0;
    this.muted = false;
  }

  ensure() {
    // Call from a click or key press. Safe to call repeatedly.
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : AUDIO.masterVolume;
    this.master.connect(this.ctx.destination);

    // Engine: one sawtooth through a low-pass, gain driven by speed.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = AUDIO.musicVolume;
    this.musicGain.connect(this.master);
  }

  setEngine(speedNorm, driving) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const freq = 52 + Math.min(1, speedNorm) * 130;
    this.engineOsc.frequency.setTargetAtTime(freq, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(320 + Math.min(1, speedNorm) * 900, t, 0.1);
    const target = driving ? AUDIO.engineVolume * (0.45 + 0.55 * Math.min(1, speedNorm)) : 0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.12);
  }

  blip(freq = 880, dur = 0.09) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(AUDIO.blipVolume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  success() {
    if (!this.ctx) return;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    const t0 = this.ctx.currentTime;
    notes.forEach((freq, i) => {
      const t = t0 + i * 0.11;
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.28, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t);
      osc.stop(t + 0.45);
    });
  }

  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    this.nextChordAt = this.ctx.currentTime + 0.1;
    this.chordIndex = 0;
    const barSeconds = (60 / AUDIO.musicTempo) * 4;
    this.musicTimer = window.setInterval(() => {
      if (!this.ctx) return;
      while (this.nextChordAt < this.ctx.currentTime + 0.6) {
        this._playChord(CHORDS[this.chordIndex % CHORDS.length], this.nextChordAt, barSeconds);
        this.chordIndex++;
        this.nextChordAt += barSeconds;
      }
    }, 200);
  }

  _playChord(freqs, startAt, dur) {
    for (const freq of freqs) {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.linearRampToValueAtTime(0.5, startAt + 0.4);
      gain.gain.setValueAtTime(0.5, startAt + dur - 0.5);
      gain.gain.linearRampToValueAtTime(0.0001, startAt + dur);
      osc.connect(gain);
      gain.connect(this.musicGain);
      osc.start(startAt);
      osc.stop(startAt + dur + 0.05);
    }
  }

  stopMusic() {
    if (this.musicTimer) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : AUDIO.masterVolume, this.ctx.currentTime, 0.05);
    }
  }
}
