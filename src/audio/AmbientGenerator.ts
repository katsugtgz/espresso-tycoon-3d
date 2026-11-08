import type { SynthContext } from './SynthContext';

export class AmbientGenerator {
  private synth: SynthContext;
  private isRunning = false;
  private isPaused = false;

  private murmurSource: AudioBufferSourceNode | null = null;
  private lfoOsc: OscillatorNode | null = null;
  private murmurGain: GainNode | null = null;
  private clinkTimer: any = null;

  constructor(synth: SynthContext) {
    this.synth = synth;
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.isPaused = false;
    this.startMurmur();
    this.scheduleNextClink();
  }

  public stop(): void {
    this.isRunning = false;
    this.isPaused = false;
    this.stopMurmur();
    if (this.clinkTimer) {
      clearTimeout(this.clinkTimer);
      this.clinkTimer = null;
    }
  }

  public pause(): void {
    this.isPaused = true;
    if (this.murmurGain && this.synth.getContext()) {
      try {
        const now = this.synth.getContext()!.currentTime;
        this.murmurGain.gain.linearRampToValueAtTime(0.0001, now + 0.1);
      } catch {
        // Guard
      }
    }
  }

  public resume(): void {
    this.isPaused = false;
    if (!this.isRunning) {
      this.start();
      return;
    }

    if (this.murmurGain && this.synth.getContext()) {
      try {
        const now = this.synth.getContext()!.currentTime;
        this.murmurGain.gain.linearRampToValueAtTime(0.07, now + 0.2);
      } catch {
        // Guard
      }
    }
  }

  private startMurmur(): void {
    try {
      const ctx = this.synth.getContext();
      const dest = this.synth.ambientGain;
      const buffer = this.synth.getBrownNoise() || this.synth.getWhiteNoise();
      if (!ctx || !dest || !buffer) return;

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      // Bandpass filter for room acoustics / muffled murmur
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(550, ctx.currentTime);
      filter.Q.setValueAtTime(1.4, ctx.currentTime);

      // Slow LFO to animate murmur presence
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(0.18, ctx.currentTime); // ~5.5s cycle
      lfoGain.gain.setValueAtTime(180, ctx.currentTime);    // modulates filter frequency ±180Hz

      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.07, ctx.currentTime + 0.5);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(dest);

      source.start();
      lfo.start();

      this.murmurSource = source;
      this.lfoOsc = lfo;
      this.murmurGain = gain;
    } catch {
      this.murmurSource = null;
      this.lfoOsc = null;
      this.murmurGain = null;
    }
  }

  private stopMurmur(): void {
    if (this.murmurSource) {
      try {
        this.murmurSource.stop();
        this.murmurSource.disconnect();
      } catch {
        // Guard
      }
      this.murmurSource = null;
    }

    if (this.lfoOsc) {
      try {
        this.lfoOsc.stop();
        this.lfoOsc.disconnect();
      } catch {
        // Guard
      }
      this.lfoOsc = null;
    }

    if (this.murmurGain) {
      try {
        this.murmurGain.disconnect();
      } catch {
        // Guard
      }
      this.murmurGain = null;
    }
  }

  private scheduleNextClink(): void {
    if (!this.isRunning) return;

    // Random interval between 3.5s and 8.0s
    const delayMs = 3500 + Math.random() * 4500;
    this.clinkTimer = setTimeout(() => {
      if (this.isRunning && !this.isPaused) {
        this.playCupClink();
      }
      this.scheduleNextClink();
    }, delayMs);
  }

  private playCupClink(): void {
    try {
      const ctx = this.synth.getContext();
      const dest = this.synth.ambientGain;
      if (!ctx || !dest) return;

      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      const dur = 0.055;

      if (!this.synth.registerVoice(osc1, dur)) return;

      // Realistic ceramic cup clink frequencies (~2600Hz & ~4300Hz)
      const baseFreq = 2500 + Math.random() * 300;
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(baseFreq, now);

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(baseFreq * 1.68, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.035, now + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(dest);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + dur);
      osc2.stop(now + dur);
    } catch {
      // Guard
    }
  }

  public dispose(): void {
    this.stop();
  }
}
