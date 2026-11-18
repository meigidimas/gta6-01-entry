// Neon Bay Heat — synthesized sound, no audio files.
// Everything is built from WebAudio oscillators: a sawtooth engine hum, UI
// blips, a success jingle and a slow chord-loop soundtrack. The context is
// created only after a real user gesture, as browsers require.

import { AUDIO } from './config.js';

// Two four-chord loops the soundtrack alternates between, each chord with
// a bass root an octave below it. Loop A is the original minor drive;
// loop B is a brighter lift for the second pass, so long drives stop
// sounding like the same four bars on repeat.
const PROGRESSIONS = [
  {
    chords: [
      [220.0, 261.63, 329.63], // A minor
      [174.61, 220.0, 261.63], // F major
      [196.0, 246.94, 293.66], // G major
      [164.81, 220.0, 261.63], // E minor
    ],
    bass: [55.0, 43.65, 49.0, 41.2],
  },
  {
    chords: [
      [261.63, 329.63, 392.0], // C major
      [196.0, 246.94, 293.66], // G major
      [220.0, 261.63, 329.63], // A minor
      [174.61, 220.0, 261.63], // F major
    ],
    bass: [65.41, 49.0, 55.0, 43.65],
  },
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
    // Police siren nodes; created by startSiren, torn down by stopSiren.
    this.sirenOsc = null;
    this.sirenLfo = null;
    this.sirenLfoGain = null;
    this.sirenGain = null;
    // Mission stingers arrive over the mission event bridge, so the
    // soundtrack reacts with no game-loop wiring. The 'mission'
    // (complete) event is left to the game loop's success() call today;
    // integration can swap that call for missionComplete() to get the
    // fuller fanfare instead.
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('neon-bay:mission', (event) => {
        const detail = (event && event.detail) || {};
        if (detail.type === 'start') this.missionStart();
        else if (detail.type === 'fail') this.missionFail();
        else if (detail.type === 'step'
          && detail.mission && detail.mission.id === 'the-drop'
          && detail.stepIndex === 1) this.pickupBlip();
      });
    }
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
        const cycle = Math.floor(this.chordIndex / 4) % PROGRESSIONS.length;
        const prog = PROGRESSIONS[cycle];
        const step = this.chordIndex % 4;
        this._playChord(prog.chords[step], this.nextChordAt, barSeconds);
        this._playBass(prog.bass[step], this.nextChordAt, barSeconds);
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

  // The bass walks under each chord: the root on the downbeat and again
  // on the half-bar, so the loop drives instead of drones.
  _playBass(freq, startAt, dur) {
    const half = dur / 2;
    for (const at of [startAt, startAt + half]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.linearRampToValueAtTime(0.6, at + 0.08);
      gain.gain.setValueAtTime(0.6, at + half - 0.25);
      gain.gain.linearRampToValueAtTime(0.0001, at + half);
      osc.connect(gain);
      gain.connect(this.musicGain);
      osc.start(at);
      osc.stop(at + half + 0.05);
    }
  }

  // A short run of notes with a soft attack and a quick decay, shared by
  // the mission stingers so each one is a one-liner to write.
  _phrase(notes, gap, type, peak, decay = 0.35) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    notes.forEach((freq, i) => {
      const t = t0 + i * gap;
      const osc = this.ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(peak, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + decay);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t);
      osc.stop(t + decay + 0.05);
    });
  }

  // A new job lands: a bright rising figure.
  missionStart() {
    this._phrase([392.0, 523.25, 659.25], 0.09, 'triangle', 0.26);
  }

  // A job pays out: a five-note fanfare over a low root.
  missionComplete() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const root = this.ctx.createOscillator();
    root.type = 'sine';
    root.frequency.value = 130.81;
    const rootGain = this.ctx.createGain();
    rootGain.gain.setValueAtTime(0.0001, t);
    rootGain.gain.exponentialRampToValueAtTime(0.3, t + 0.03);
    rootGain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    root.connect(rootGain);
    rootGain.connect(this.master);
    root.start(t);
    root.stop(t + 0.95);
    this._phrase([523.25, 659.25, 783.99, 1046.5, 1318.5], 0.1, 'triangle', 0.28, 0.45);
  }

  // A job fails: a slow descending minor line.
  missionFail() {
    this._phrase([392.0, 349.23, 311.13, 261.63], 0.17, 'triangle', 0.24, 0.5);
  }

  // A heavy low thud for impacts. No collision hook calls it yet — the
  // integration phase wires it to car and wall hits.
  crashThud() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.22);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.32);
  }

  // A quick two-note chirp when Danny grabs something — the package in
  // The Drop, and anything else the game hands him.
  pickupBlip() {
    this._phrase([1174.66, 1567.98], 0.07, 'square', 0.14, 0.16);
  }

  // A looping two-tone police siren: one triangle oscillator wailing
  // between ~590 and ~970 Hz on a slow LFO. Safe to call every frame;
  // starting an already-running siren is a no-op.
  startSiren() {
    if (!this.ctx || this.sirenOsc) return;
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 780;
    this.sirenLfo = this.ctx.createOscillator();
    this.sirenLfo.type = 'sine';
    this.sirenLfo.frequency.value = 0.9;
    this.sirenLfoGain = this.ctx.createGain();
    this.sirenLfoGain.gain.value = 190;
    this.sirenLfo.connect(this.sirenLfoGain);
    this.sirenLfoGain.connect(this.sirenOsc.frequency);
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenGain.gain.setTargetAtTime(0.05, this.ctx.currentTime, 0.3);
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    this.sirenLfo.start();
  }

  stopSiren() {
    if (!this.sirenOsc) return;
    try {
      this.sirenOsc.stop();
      this.sirenLfo.stop();
    } catch {
      // Already stopped; just drop the nodes.
    }
    this.sirenOsc.disconnect();
    this.sirenLfo.disconnect();
    this.sirenLfoGain.disconnect();
    this.sirenGain.disconnect();
    this.sirenOsc = null;
    this.sirenLfo = null;
    this.sirenLfoGain = null;
    this.sirenGain = null;
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
