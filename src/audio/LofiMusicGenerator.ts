import type { SynthContext } from './SynthContext';

const BPM = 75;
const SECONDS_PER_BEAT = 60 / BPM; // 0.8s
const SECONDS_PER_16TH = SECONDS_PER_BEAT / 4; // 0.2s
const LOOKAHEAD_INTERVAL_MS = 100;
const SCHEDULE_AHEAD_TIME = 0.3; // 0.3s

interface ChordDef {
  notes: number[];
}

// ii - V - I - vi jazz progression
const CHORDS: ChordDef[] = [
  // Dm9 (ii)
  { notes: [146.83, 174.61, 220.0, 261.63, 329.63] }, // D3, F3, A3, C4, E4
  // G13 (V)
  { notes: [98.0, 174.61, 246.94, 329.63, 440.0] },    // G2, F3, B3, E4, A4
  // Cmaj9 (I)
  { notes: [130.81, 164.81, 196.0, 246.94, 293.66] },  // C3, E3, G3, B3, D4
  // Am9 (vi)
  { notes: [110.0, 130.81, 164.81, 196.0, 246.94] },   // A2, C3, E3, G3, B3
];

export class LofiMusicGenerator {
  private synth: SynthContext;
  private isRunning = false;
  private isPaused = false;
  private schedulerTimer: any = null;
  private nextStepTime = 0;
  private currentStep = 0; // 0..63 (4 bars of 16 steps)

  private vinylSource: AudioBufferSourceNode | null = null;
  private vinylGain: GainNode | null = null;

  constructor(synth: SynthContext) {
    this.synth = synth;
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.isPaused = false;

    const ctx = this.synth.getContext();
    if (!ctx) return;

    this.nextStepTime = ctx.currentTime + 0.05;
    this.currentStep = 0;

    this.startVinylCrackle();

    if (this.schedulerTimer) clearInterval(this.schedulerTimer);
    this.schedulerTimer = setInterval(() => this.tick(), LOOKAHEAD_INTERVAL_MS);
  }

  public stop(): void {
    this.isRunning = false;
    this.isPaused = false;

    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }

    this.stopVinylCrackle();
  }

  public pause(): void {
    this.isPaused = true;
    if (this.vinylGain && this.synth.getContext()) {
      try {
        const now = this.synth.getContext()!.currentTime;
        this.vinylGain.gain.linearRampToValueAtTime(0.0001, now + 0.1);
      } catch {
        // Guard
      }
    }
  }

  public resume(): void {
    if (!this.isRunning) {
      this.start();
      return;
    }

    this.isPaused = false;
    const ctx = this.synth.getContext();
    if (ctx) {
      // Sync clock so we don't dump missed steps
      this.nextStepTime = Math.max(this.nextStepTime, ctx.currentTime + 0.05);

      if (this.vinylGain) {
        try {
          this.vinylGain.gain.linearRampToValueAtTime(0.015, ctx.currentTime + 0.2);
        } catch {
          // Guard
        }
      }
    }
  }

  private tick(): void {
    if (!this.isRunning || this.isPaused) return;

    try {
      const ctx = this.synth.getContext();
      if (!ctx || ctx.state === 'suspended') return;

      // Handle clock resync if tab was blurred or delayed
      if (this.nextStepTime < ctx.currentTime) {
        this.nextStepTime = ctx.currentTime + 0.02;
      }

      // Schedule notes ahead within the lookahead window
      while (this.nextStepTime < ctx.currentTime + SCHEDULE_AHEAD_TIME) {
        this.scheduleStep(this.currentStep, this.nextStepTime);
        this.nextStepTime += SECONDS_PER_16TH;
        this.currentStep = (this.currentStep + 1) % 64; // 4 bars = 64 16th steps
      }
    } catch {
      // Guard
    }
  }

  private scheduleStep(step: number, time: number): void {
    const stepInBar = step % 16;
    const barIndex = Math.floor(step / 16) % CHORDS.length;

    // 1. Chords: play at the start of each bar (stepInBar === 0)
    if (stepInBar === 0) {
      this.scheduleRhodesChord(CHORDS[barIndex], time);
    }

    // 2. Drums: ~75 BPM boom-bap rhythm
    // Kick on step 0, 6 (swing push before beat 3), 8
    if (stepInBar === 0 || stepInBar === 6 || stepInBar === 8) {
      const velocity = stepInBar === 6 ? 0.07 : 0.1;
      this.scheduleKick(time, velocity);
    }

    // Snare / Rim click on beats 2 and 4 (steps 4 and 12)
    if (stepInBar === 4 || stepInBar === 12) {
      this.scheduleRim(time, 0.06);
    }

    // Closed Hi-hat on 8th notes (0, 2, 4, 6, 8, 10, 12, 14) with slight swing
    if (stepInBar % 2 === 0) {
      const isUpbeat = stepInBar % 4 === 2;
      const swingOffset = isUpbeat ? 0.02 : 0.0;
      const velocity = isUpbeat ? 0.025 : 0.04;
      this.scheduleHiHat(time + swingOffset, velocity);
    }
  }

  /** Rhodes-like FM/triangle chord with warm lowpass */
  private scheduleRhodesChord(chord: ChordDef, time: number): void {
    const ctx = this.synth.getContext();
    const dest = this.synth.musicGain;
    if (!ctx || !dest) return;

    const chordDuration = SECONDS_PER_16TH * 14; // ~2.8s sustain

    chord.notes.forEach((freq, idx) => {
      // Electric piano strum delay (~15ms per note)
      const noteTime = time + idx * 0.015;

      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      if (!this.synth.registerVoice(osc, idx * 0.015 + chordDuration)) return;

      // Triangle wave with lowpass creates warm mellow Rhodes electric piano tone
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, noteTime);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(850, noteTime);
      filter.frequency.exponentialRampToValueAtTime(650, noteTime + chordDuration);

      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.setValueAtTime(0.0001, noteTime);
      gain.gain.linearRampToValueAtTime(0.032, noteTime + 0.04); // soft attack
      gain.gain.setValueAtTime(0.032, noteTime + chordDuration * 0.6);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteTime + chordDuration);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(dest);

      osc.start(noteTime);
      osc.stop(noteTime + chordDuration);
    });
  }

  /** Soft low lo-fi kick drum */
  private scheduleKick(time: number, volume: number): void {
    const ctx = this.synth.getContext();
    const dest = this.synth.musicGain;
    if (!ctx || !dest) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const dur = 0.14;

    if (!this.synth.registerVoice(osc, dur)) return;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(105, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + dur);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    osc.connect(gain);
    gain.connect(dest);

    osc.start(time);
    osc.stop(time + dur);
  }

  /** Soft lo-fi snare / rim click */
  private scheduleRim(time: number, volume: number): void {
    const ctx = this.synth.getContext();
    const dest = this.synth.musicGain;
    const noiseBuffer = this.synth.getWhiteNoise();
    if (!ctx || !dest || !noiseBuffer) return;

    const dur = 0.06;
    const noise = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    if (!this.synth.registerVoice(noise, dur)) return;

    noise.buffer = noiseBuffer;
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, time);
    filter.Q.setValueAtTime(2.0, time);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    noise.start(time);
    noise.stop(time + dur);
  }

  /** Soft closed hi-hat */
  private scheduleHiHat(time: number, volume: number): void {
    const ctx = this.synth.getContext();
    const dest = this.synth.musicGain;
    const noiseBuffer = this.synth.getWhiteNoise();
    if (!ctx || !dest || !noiseBuffer) return;

    const dur = 0.035;
    const noise = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    if (!this.synth.registerVoice(noise, dur)) return;

    noise.buffer = noiseBuffer;
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(6500, time);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    noise.start(time);
    noise.stop(time + dur);
  }

  /** Vinyl crackle background */
  private startVinylCrackle(): void {
    try {
      const ctx = this.synth.getContext();
      const dest = this.synth.musicGain;
      const buffer = this.synth.getWhiteNoise();
      if (!ctx || !dest || !buffer) return;

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2400, ctx.currentTime);
      filter.Q.setValueAtTime(2.0, ctx.currentTime);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.015, ctx.currentTime + 0.4);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(dest);

      source.start();

      this.vinylSource = source;
      this.vinylGain = gain;
    } catch {
      this.vinylSource = null;
      this.vinylGain = null;
    }
  }

  private stopVinylCrackle(): void {
    if (this.vinylSource) {
      try {
        this.vinylSource.stop();
        this.vinylSource.disconnect();
      } catch {
        // Guard
      }
      this.vinylSource = null;
    }

    if (this.vinylGain) {
      try {
        this.vinylGain.disconnect();
      } catch {
        // Guard
      }
      this.vinylGain = null;
    }
  }

  public dispose(): void {
    this.stop();
  }
}
