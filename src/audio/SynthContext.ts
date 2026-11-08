import type { Settings } from '../types';

const MAX_POLYPHONY = 24;

export class SynthContext {
  private ctx: AudioContext | null = null;
  public masterGain: GainNode | null = null;
  public sfxGain: GainNode | null = null;
  public musicGain: GainNode | null = null;
  public ambientGain: GainNode | null = null;

  private activeVoices = 0;
  private whiteNoiseBuffer: AudioBuffer | null = null;
  private brownNoiseBuffer: AudioBuffer | null = null;
  private isUnlocked = false;
  private gestureCleanup: (() => void) | null = null;

  private currentSettings: Settings = {
    master: 0.8,
    sfx: 0.8,
    music: 0.5,
    ambient: 0.6,
    musicOn: true,
    quality: 'high',
    colorblind: false,
    uiScale: 1.0,
    reducedMotion: false,
    showFps: false,
  };

  private isDucked = false;

  constructor() {
    this.setupGestureUnlock();
  }

  private setupGestureUnlock(): void {
    if (typeof window === 'undefined') return;

    const onGesture = () => {
      this.unlock();
      cleanup();
    };

    const cleanup = () => {
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
      this.gestureCleanup = null;
    };

    try {
      window.addEventListener('pointerdown', onGesture, { once: true, passive: true });
      window.addEventListener('keydown', onGesture, { once: true, passive: true });
      this.gestureCleanup = cleanup;
    } catch {
      // Ignore headless / restricted environment errors
    }
  }

  public getContext(): AudioContext | null {
    if (!this.ctx) {
      this.init();
    }
    return this.ctx;
  }

  public init(): AudioContext | null {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && this.isUnlocked) {
        try {
          this.ctx.resume().catch(() => {});
        } catch {
          // Guard headless
        }
      }
      return this.ctx;
    }

    if (typeof window === 'undefined') return null;

    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return null;

      const ctx = new AudioCtxClass();
      const master = ctx.createGain();
      const sfx = ctx.createGain();
      const music = ctx.createGain();
      const ambient = ctx.createGain();

      sfx.connect(master);
      music.connect(master);
      ambient.connect(master);
      master.connect(ctx.destination);

      this.ctx = ctx;
      this.masterGain = master;
      this.sfxGain = sfx;
      this.musicGain = music;
      this.ambientGain = ambient;

      this.applyGains();
      this.generateNoiseBuffers(ctx);

      return ctx;
    } catch {
      this.ctx = null;
      return null;
    }
  }

  public unlock(): void {
    this.isUnlocked = true;
    const ctx = this.init();
    if (!ctx) return;

    try {
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    } catch {
      // Guard headless
    }
  }

  public applySettings(settings: Settings): void {
    this.currentSettings = { ...settings };
    this.applyGains();
  }

  private applyGains(): void {
    if (!this.ctx || !this.masterGain || !this.sfxGain || !this.musicGain || !this.ambientGain) return;

    try {
      const now = this.ctx.currentTime;
      const { master, sfx, music, ambient, musicOn } = this.currentSettings;

      const masterTarget = Math.max(0, Math.min(1, master));
      const sfxTarget = Math.max(0, Math.min(1, sfx));
      const musicTarget = musicOn && !this.isDucked ? Math.max(0, Math.min(1, music)) : 0;
      const ambientTarget = !this.isDucked ? Math.max(0, Math.min(1, ambient)) : Math.max(0, Math.min(1, ambient)) * 0.2;

      this.masterGain.gain.setValueAtTime(masterTarget, now);
      this.sfxGain.gain.setValueAtTime(sfxTarget, now);
      this.musicGain.gain.setValueAtTime(musicTarget, now);
      this.ambientGain.gain.setValueAtTime(ambientTarget, now);
    } catch {
      // Guard headless
    }
  }

  public setDucked(ducked: boolean): void {
    this.isDucked = ducked;
    this.applyGains();
  }

  public getSettings(): Settings {
    return this.currentSettings;
  }

  public acquireVoice(): boolean {
    if (this.activeVoices >= MAX_POLYPHONY) {
      return false;
    }
    this.activeVoices++;
    return true;
  }

  public releaseVoice(): void {
    this.activeVoices = Math.max(0, this.activeVoices - 1);
  }

  public registerVoice(source: AudioScheduledSourceNode, durationSec: number): boolean {
    if (!this.acquireVoice()) {
      return false;
    }

    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        this.releaseVoice();
      }
    };

    try {
      source.onended = release;
    } catch {
      // Fallback
    }

    // Safety timeout in case onended doesn't fire
    setTimeout(release, Math.max(50, Math.ceil((durationSec + 0.15) * 1000)));
    return true;
  }

  public getWhiteNoise(): AudioBuffer | null {
    return this.whiteNoiseBuffer;
  }

  public getBrownNoise(): AudioBuffer | null {
    return this.brownNoiseBuffer;
  }

  private generateNoiseBuffers(ctx: AudioContext): void {
    try {
      const sampleRate = ctx.sampleRate || 44100;

      // White noise buffer (2 seconds)
      const whiteLength = sampleRate * 2;
      const whiteBuffer = ctx.createBuffer(1, whiteLength, sampleRate);
      const whiteData = whiteBuffer.getChannelData(0);
      for (let i = 0; i < whiteLength; i++) {
        whiteData[i] = Math.random() * 2 - 1;
      }
      this.whiteNoiseBuffer = whiteBuffer;

      // Brown noise buffer (3 seconds)
      const brownLength = sampleRate * 3;
      const brownBuffer = ctx.createBuffer(1, brownLength, sampleRate);
      const brownData = brownBuffer.getChannelData(0);
      let lastOut = 0.0;
      for (let i = 0; i < brownLength; i++) {
        const white = Math.random() * 2 - 1;
        lastOut = (lastOut + 0.02 * white) / 1.02;
        brownData[i] = lastOut * 3.5;
      }
      this.brownNoiseBuffer = brownBuffer;
    } catch {
      this.whiteNoiseBuffer = null;
      this.brownNoiseBuffer = null;
    }
  }

  public dispose(): void {
    if (this.gestureCleanup) {
      this.gestureCleanup();
      this.gestureCleanup = null;
    }

    if (this.ctx) {
      try {
        if (this.ctx.state !== 'closed') {
          this.ctx.close().catch(() => {});
        }
      } catch {
        // Guard
      }
      this.ctx = null;
      this.masterGain = null;
      this.sfxGain = null;
      this.musicGain = null;
      this.ambientGain = null;
      this.whiteNoiseBuffer = null;
      this.brownNoiseBuffer = null;
      this.activeVoices = 0;
    }
  }
}
