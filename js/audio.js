/**
 * audio.js — frontend-only synthesized sound system for SLOP-MACHINE.
 *
 * Uses a single, lazily created Web AudioContext. All sounds route through one
 * master gain node so muting and volume apply consistently. No external audio
 * assets, network requests or backend services are used.
 *
 * The module is intentionally isolated from game logic: callers send semantic
 * events (spinStart, reelStop, win, ...) and never touch audio nodes directly.
 * Every public method is safe to call when audio is unavailable or blocked.
 */

'use strict';

const AudioSystem = {
  // Safe defaults — quiet enough for a first-enabled experience.
  DEFAULT_VOLUME: 0.45,
  MIN_VOLUME: 0,
  MAX_VOLUME: 1,

  // Variation bounds for repeated effects (± percent).
  PITCH_VARIATION: 0.05,
  TIMING_VARIATION: 0.03,

  context: null,
  master: null,
  _muted: false,
  _volume: 0.45,
  _unlocked: false,
  _reelSource: null,
  _reelGain: null,
  _reelNodes: [],
  _reelLfo: null,
  _reelLfoGain: null,
  _lastClickAt: 0,
  _available: true,

  // --------------------------------------------------------------
  // Core lifecycle
  // --------------------------------------------------------------

  /** Detect Web Audio availability without creating a context. */
  isAvailable() {
    if (typeof window === 'undefined') return false;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    return Boolean(Ctor) && this._available !== false;
  },

  /**
   * Create/resume the single AudioContext after a user gesture.
   * Safe to call repeatedly; returns true when audio can be used.
   */
  unlock() {
    if (!this.isAvailable()) return false;
    try {
      if (!this.context) {
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return false;
        this.context = new Ctor();
        this.master = this.context.createGain();
        this.master.gain.value = this._muted ? 0 : this._volume;
        if (this.master.connect) this.master.connect(this.context.destination);
      }
      if (this.context.state === 'suspended' && this.context.resume) {
        // resume() may return a promise; failures are intentionally ignored.
        const result = this.context.resume();
        if (result && typeof result.catch === 'function') result.catch(() => {});
      }
      this._unlocked = this.context.state !== 'closed';
      return this._unlocked;
    } catch (error) {
      this._available = false;
      return false;
    }
  },

  /** Re-apply master gain from current preferences. */
  _applyMasterGain() {
    if (!this.master || !this.context) return;
    try {
      const value = this._muted ? 0 : this._volume;
      const now = this.context.currentTime;
      if (this.master.gain.setTargetAtTime) {
        this.master.gain.setTargetAtTime(value, now, 0.015);
      } else {
        this.master.gain.value = value;
      }
    } catch (error) { /* audio must never affect gameplay */ }
  },

  setMuted(muted) {
    this._muted = Boolean(muted);
    this._applyMasterGain();
    if (this._muted) this.stopReel(); // no silent background work
    return this._muted;
  },

  isMuted() { return this._muted; },

  setVolume(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return this._volume;
    this._volume = Math.max(this.MIN_VOLUME, Math.min(this.MAX_VOLUME, n));
    this._applyMasterGain();
    return this._volume;
  },

  getVolume() { return this._volume; },

  /** Restore preferences (used by Progression at init). */
  applyPreferences(prefs) {
    if (!prefs) return;
    if (typeof prefs.muted === 'boolean') this._muted = prefs.muted;
    if (prefs.volume !== undefined) this.setVolume(prefs.volume);
    this._applyMasterGain();
  },

  // --------------------------------------------------------------
  // Reusable building blocks
  // --------------------------------------------------------------

  /** Random multiplier within the configured variation limit. */
  _variation() {
    const amount = this.PITCH_VARIATION;
    return 1 + (Math.random() * 2 - 1) * amount;
  },

  /** Create one oscillator + envelope, started/stopped automatically. */
  tone(frequency, options) {
    if (!this._unlocked || this._muted || !this.context || !this.master) return null;
    const opts = options || {};
    try {
      const ctx = this.context;
      const now = ctx.currentTime + (opts.delay || 0);
      const duration = opts.duration || 0.12;
      const gain = ctx.createGain();
      const osc = ctx.createOscillator();

      osc.type = opts.type || 'triangle';
      osc.frequency.setValueAtTime(Math.max(1, frequency), now);
      if (opts.endFrequency && osc.frequency.exponentialRampToValueAtTime) {
        osc.frequency.exponentialRampToValueAtTime(
          Math.max(1, opts.endFrequency), now + duration
        );
      }

      const peak = Math.max(0, Math.min(1, opts.gain === undefined ? 0.18 : opts.gain));
      if (gain.gain.setValueAtTime) {
        gain.gain.setValueAtTime(0.0001, now);
        if (gain.gain.exponentialRampToValueAtTime) {
          gain.gain.exponentialRampToValueAtTime(peak, now + Math.min(0.015, duration / 3));
          gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        } else {
          gain.gain.value = peak;
        }
      } else {
        gain.gain.value = peak;
      }

      osc.connect(gain);
      gain.connect(this.master);
      osc.start(now);
      osc.stop(now + duration + 0.02);
      // Release references once the sound has finished.
      const cleanup = () => {
        try { osc.disconnect(); gain.disconnect(); } catch (e) { /* noop */ }
      };
      if (typeof osc.onended !== 'undefined') osc.onended = cleanup;
      else if (ctx.setTimeout) ctx.setTimeout(cleanup, (duration + 0.1) * 1000);

      return { oscillator: osc, gain: gain };
    } catch (error) {
      return null;
    }
  },

  /** Short filtered-noise burst used for clicks and mechanical textures. */
  noise(options) {
    if (!this._unlocked || this._muted || !this.context || !this.master) return null;
    const opts = options || {};
    try {
      const ctx = this.context;
      const duration = opts.duration || 0.06;
      const sampleCount = Math.max(1, Math.floor(ctx.sampleRate * duration));
      const buffer = ctx.createBuffer ? ctx.createBuffer(1, sampleCount, ctx.sampleRate) : null;
      if (!buffer) return null;
      const data = buffer.getChannelData(0);
      for (let i = 0; i < sampleCount; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / sampleCount);
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = opts.filterType || 'bandpass';
      filter.frequency.value = opts.frequency || 900;
      filter.Q.value = opts.q || 1;
      const gain = ctx.createGain();
      const now = ctx.currentTime + (opts.delay || 0);
      const peak = Math.max(0, Math.min(1, opts.gain === undefined ? 0.08 : opts.gain));
      if (gain.gain.setValueAtTime) {
        gain.gain.setValueAtTime(peak, now);
        if (gain.gain.exponentialRampToValueAtTime) {
          gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        }
      } else {
        gain.gain.value = peak;
      }
      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      source.start(now);
      const cleanup = () => {
        try { source.disconnect(); filter.disconnect(); gain.disconnect(); } catch (e) { /* noop */ }
      };
      if (typeof source.onended !== 'undefined') source.onended = cleanup;
      return { source: source, filter: filter, gain: gain };
    } catch (error) {
      return null;
    }
  },

  // --------------------------------------------------------------
  // Continuous reel sound
  // --------------------------------------------------------------

  /** Start the (single) continuous mechanical reel loop. */
  startReel() {
    if (!this._unlocked || this._muted || !this.context || !this.master) return false;
    if (this._reelSource) return false; // never overlap loops
    try {
      const ctx = this.context;
      const now = ctx.currentTime;
      const source = ctx.createBufferSource();
      const length = Math.max(1, Math.floor(ctx.sampleRate * 0.5));
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      // A low, buzzy mechanical texture rather than a tone.
      let phase = 0;
      for (let i = 0; i < length; i++) {
        phase += (2 * Math.PI * 90) / ctx.sampleRate;
        data[i] = (Math.sin(phase) * 0.45 + (Math.random() * 2 - 1) * 0.25);
      }
      source.buffer = buffer;
      source.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 620;

      const gain = ctx.createGain();
      gain.gain.value = 0.0001;

      // Subtle frequency modulation makes the loop feel alive.
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 7;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 45;
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      source.start(now);
      lfo.start(now);

      if (gain.gain.exponentialRampToValueAtTime) {
        gain.gain.exponentialRampToValueAtTime(0.06, now + 0.09);
      } else {
        gain.gain.value = 0.06;
      }

      this._reelSource = source;
      this._reelGain = gain;
      this._reelNodes = [filter];
      this._reelLfo = lfo;
      this._reelLfoGain = lfoGain;
      return true;
    } catch (error) {
      this.stopReel();
      return false;
    }
  },

  /** Fade out and fully stop the reel loop, releasing all nodes. */
  stopReel() {
    if (!this._reelSource) return false;
    const source = this._reelSource;
    const gain = this._reelGain;
    const lfo = this._reelLfo;
    this._reelSource = null;
    this._reelGain = null;
    this._reelLfo = null;
    this._reelLfoGain = null;
    this._reelNodes = [];
    try {
      const now = this.context ? this.context.currentTime : 0;
      if (gain && gain.gain && gain.gain.setTargetAtTime) {
        gain.gain.setTargetAtTime(0.0001, now, 0.04);
      } else if (gain && gain.gain) {
        gain.gain.value = 0.0001;
      }
      const stopAt = now + 0.16;
      try { source.stop(stopAt); } catch (e) { /* already stopped */ }
      if (lfo) { try { lfo.stop(stopAt); } catch (e) { /* already stopped */ } }
      const cleanup = () => {
        try {
          source.disconnect();
          if (gain) gain.disconnect();
          if (lfo) lfo.disconnect();
        } catch (e) { /* noop */ }
      };
      if (typeof source.onended !== 'undefined') source.onended = cleanup;
      else cleanup();
    } catch (error) { /* audio must never affect gameplay */ }
    return true;
  },

  // --------------------------------------------------------------
  // Semantic game sounds
  // --------------------------------------------------------------

  /** Subtle mechanical button click with slight pitch variation. */
  buttonClick() {
    // Avoid double-firing from rapid synthetic clicks in the same frame.
    const now = Date.now();
    if (now - this._lastClickAt < 25) return false;
    this._lastClickAt = now;
    const base = 760 * this._variation();
    this.noise({ duration: 0.035, frequency: base, gain: 0.05, q: 1.4 });
    this.tone(base * 0.7, { duration: 0.04, gain: 0.05, type: 'square',
      endFrequency: base * 0.5 });
    return true;
  },

  /** Mechanical spin startup. Called once when a spin genuinely begins. */
  spinStart() {
    this.stopReel(); // guard against a stale loop
    this.tone(180, { duration: 0.18, gain: 0.14, type: 'sawtooth',
      endFrequency: 300 * this._variation() });
    this.noise({ duration: 0.16, frequency: 420, gain: 0.07 });
    return this.startReel();
  },

  /** One reel has actually stopped (index 0,1,2). Distinct pitch per reel. */
  reelStop(index) {
    const i = Math.max(0, Math.min(2, Number(index) || 0));
    const base = [520, 440, 360][i] * this._variation();
    const delay = (Math.random() - 0.5) * this.TIMING_VARIATION;
    this.tone(base, { duration: 0.1, gain: 0.13, type: 'square',
      endFrequency: base * 0.7, delay: delay });
    this.noise({ duration: 0.06, frequency: base * 1.4, gain: 0.06, delay: delay });
    if (i === 2) this.stopReel(); // final reel ends the continuous sound
    return true;
  },

  /** Ordinary win: short, pleasant two-note motif with subtle variation. */
  win() {
    const root = 523.25 * this._variation();
    this.tone(root, { duration: 0.16, gain: 0.13, type: 'triangle' });
    this.tone(root * 1.25, { duration: 0.24, gain: 0.11, type: 'triangle', delay: 0.1 });
    return true;
  },

  /** Jackpot: distinctive, more impactful celebration. */
  jackpot() {
    const root = 392 * this._variation();
    [1, 1.25, 1.5, 2].forEach((mult, i) => {
      this.tone(root * mult, { duration: 0.45, gain: 0.12, type: 'triangle', delay: i * 0.09 });
    });
    this.noise({ duration: 0.35, frequency: 1800, gain: 0.05, delay: 0.05 });
    return true;
  },

  /** Subtle, non-annoying loss feedback. */
  loss() {
    this.tone(220 * this._variation(), { duration: 0.14, gain: 0.06,
      type: 'sine', endFrequency: 165 });
    return true;
  },

  /** Mission completed chime. */
  missionComplete() {
    const root = 659.25 * this._variation();
    this.tone(root, { duration: 0.12, gain: 0.1, type: 'triangle' });
    this.tone(root * 1.5, { duration: 0.2, gain: 0.09, type: 'triangle', delay: 0.09 });
    return true;
  },

  /** Reward claimed confirmation. */
  rewardClaim() {
    const root = 784 * this._variation();
    this.tone(root, { duration: 0.1, gain: 0.12, type: 'sine' });
    this.tone(root * 1.25, { duration: 0.18, gain: 0.08, type: 'sine', delay: 0.07 });
    return true;
  },

  /** Short transition sound when switching machines. */
  machineSwitch() {
    this.stopReel();
    this.tone(330, { duration: 0.2, gain: 0.1, type: 'sine',
      endFrequency: 520 * this._variation() });
    return true;
  },

  /** Interrupt/stop — ensure no background sound survives. */
  stopAll() { return this.stopReel(); }
};

if (typeof window !== 'undefined') window.AudioSystem = AudioSystem;
if (typeof module !== 'undefined' && module.exports) module.exports = { AudioSystem };
