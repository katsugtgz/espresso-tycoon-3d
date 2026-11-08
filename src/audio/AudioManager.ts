import type { EventBus } from '../core/events';
import type { GameEvents, Settings } from '../types';
import { SynthContext } from './SynthContext';
import { SoundEffects } from './SoundEffects';
import { AmbientGenerator } from './AmbientGenerator';
import { LofiMusicGenerator } from './LofiMusicGenerator';
import type { SfxName } from './types';

export class AudioManager {
  private bus: EventBus<GameEvents>;
  private synth: SynthContext;
  private sfx: SoundEffects;
  private ambient: AmbientGenerator;
  private music: LofiMusicGenerator;

  private unsubs: (() => void)[] = [];
  private lastHoverTime = 0;
  private isGameActive = false;

  constructor(bus: EventBus<GameEvents>) {
    this.bus = bus;
    this.synth = new SynthContext();
    this.sfx = new SoundEffects();
    this.ambient = new AmbientGenerator(this.synth);
    this.music = new LofiMusicGenerator(this.synth);

    this.bindEvents();
  }

  private bindEvents(): void {
    try {
      // Game state transitions
      this.unsubs.push(
        this.bus.on('game:new', () => {
          this.onGameStart();
        })
      );

      this.unsubs.push(
        this.bus.on('game:loaded', () => {
          this.onGameStart();
        })
      );

      this.unsubs.push(
        this.bus.on('day:start', () => {
          this.onGameStart();
        })
      );

      this.unsubs.push(
        this.bus.on('game:paused', ({ paused }) => {
          this.onPauseChange(paused);
        })
      );

      this.unsubs.push(
        this.bus.on('game:over', () => {
          this.onGameOver();
        })
      );

      // SFX Events
      this.unsubs.push(
        this.bus.on('ui:click', () => {
          this.sfx.play('ui:click', this.synth);
        })
      );

      this.unsubs.push(
        this.bus.on('ui:hover', ({ stationId }) => {
          if (stationId !== null && stationId !== undefined) {
            const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
            if (now - this.lastHoverTime >= 80) {
              this.lastHoverTime = now;
              this.sfx.play('ui:hover', this.synth);
            }
          }
        })
      );

      this.unsubs.push(
        this.bus.on('brew:start', () => {
          this.sfx.play('brew:start', this.synth);
        })
      );

      this.unsubs.push(
        this.bus.on('brew:done', () => {
          this.sfx.play('brew:done', this.synth);
        })
      );

      this.unsubs.push(
        this.bus.on('order:served', () => {
          this.sfx.play('order:served', this.synth);
        })
      );

      this.unsubs.push(
        this.bus.on('combo:change', ({ combo }) => {
          if (combo >= 3) {
            this.sfx.play('combo:change', this.synth, combo);
          }
        })
      );

      this.unsubs.push(
        this.bus.on('customer:spawn', () => {
          this.sfx.play('customer:spawn', this.synth);
        })
      );

      this.unsubs.push(
        this.bus.on('customer:leave', ({ angry }) => {
          if (angry) {
            this.sfx.play('customer:leave', this.synth);
          }
        })
      );

      this.unsubs.push(
        this.bus.on('order:expired', () => {
          this.sfx.play('order:expired', this.synth);
        })
      );

      this.unsubs.push(
        this.bus.on('upgrade:bought', () => {
          this.sfx.play('upgrade:bought', this.synth);
        })
      );

      this.unsubs.push(
        this.bus.on('drink:unlocked', () => {
          this.sfx.play('drink:unlocked', this.synth);
        })
      );

      this.unsubs.push(
        this.bus.on('achievement', () => {
          this.sfx.play('achievement', this.synth);
        })
      );

      this.unsubs.push(
        this.bus.on('goal:complete', () => {
          this.sfx.play('goal:complete', this.synth);
        })
      );

      this.unsubs.push(
        this.bus.on('day:end', () => {
          this.sfx.play('day:end', this.synth);
        })
      );

      this.unsubs.push(
        this.bus.on('rush:start', () => {
          this.sfx.play('rush:start', this.synth);
        })
      );

      this.unsubs.push(
        this.bus.on('action:fail', () => {
          this.sfx.play('action:fail', this.synth);
        })
      );

      // Note: 'toast' event -> explicitly none.
    } catch {
      // Guard all listener registrations
    }
  }

  private onGameStart(): void {
    try {
      this.isGameActive = true;
      this.synth.setDucked(false);
      this.ambient.start();
      if (this.synth.getSettings().musicOn) {
        this.music.start();
      }
    } catch {
      // Guard
    }
  }

  private onPauseChange(paused: boolean): void {
    try {
      this.synth.setDucked(paused);
      if (paused) {
        this.ambient.pause();
        this.music.pause();
      } else if (this.isGameActive) {
        this.ambient.resume();
        if (this.synth.getSettings().musicOn) {
          this.music.resume();
        }
      }
    } catch {
      // Guard
    }
  }

  private onGameOver(): void {
    try {
      this.isGameActive = false;
      this.ambient.stop();
      this.music.stop();
      this.sfx.play('game:over', this.synth);
    } catch {
      // Guard
    }
  }

  public applySettings(settings: Settings): void {
    try {
      const prevMusicOn = this.synth.getSettings().musicOn;
      this.synth.applySettings(settings);

      if (settings.musicOn !== prevMusicOn) {
        if (settings.musicOn && this.isGameActive) {
          this.music.start();
        } else if (!settings.musicOn) {
          this.music.stop();
        }
      }
    } catch {
      // Guard
    }
  }

  public setMusicOn(musicOn: boolean): void {
    try {
      const current = this.synth.getSettings();
      this.applySettings({ ...current, musicOn });
    } catch {
      // Guard
    }
  }

  public playSfx(name: SfxName, extra?: any): void {
    try {
      this.sfx.play(name, this.synth, extra);
    } catch {
      // Guard
    }
  }

  public dispose(): void {
    try {
      this.unsubs.forEach((unsub) => {
        try {
          unsub();
        } catch {
          // Guard
        }
      });
      this.unsubs = [];

      this.ambient.dispose();
      this.music.dispose();
      this.synth.dispose();
      this.isGameActive = false;
    } catch {
      // Guard
    }
  }
}
