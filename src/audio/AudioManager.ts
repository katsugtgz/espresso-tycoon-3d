import type { EventBus } from '../core/events';
import type { GameEvents, Settings } from '../types';
import { SynthContext } from './SynthContext';
import { SoundEffects } from './SoundEffects';
import { AmbientGenerator } from './AmbientGenerator';
import { LofiMusicGenerator } from './LofiMusicGenerator';
import type { SfxName } from './types';
/** One bus->sfx pairing the audio module honors. Names/guards live here only. */
export type AudioSfxSubscription =
  | { event: 'ui:click'; sfx: 'ui:click'; shouldPlay?: (payload: GameEvents['ui:click']) => boolean }
  | { event: 'ui:hover'; sfx: 'ui:hover'; shouldPlay?: (payload: GameEvents['ui:hover']) => boolean }
  | { event: 'brew:start'; sfx: 'brew:start'; shouldPlay?: (payload: GameEvents['brew:start']) => boolean }
  | { event: 'brew:done'; sfx: 'brew:done'; shouldPlay?: (payload: GameEvents['brew:done']) => boolean }
  | { event: 'order:served'; sfx: 'order:served'; shouldPlay?: (payload: GameEvents['order:served']) => boolean }
  | { event: 'combo:change'; sfx: 'combo:change'; shouldPlay?: (payload: GameEvents['combo:change']) => boolean }
  | { event: 'customer:spawn'; sfx: 'customer:spawn'; shouldPlay?: (payload: GameEvents['customer:spawn']) => boolean }
  | { event: 'customer:leave'; sfx: 'customer:leave'; shouldPlay?: (payload: GameEvents['customer:leave']) => boolean }
  | { event: 'order:expired'; sfx: 'order:expired'; shouldPlay?: (payload: GameEvents['order:expired']) => boolean }
  | { event: 'upgrade:bought'; sfx: 'upgrade:bought'; shouldPlay?: (payload: GameEvents['upgrade:bought']) => boolean }
  | { event: 'drink:unlocked'; sfx: 'drink:unlocked'; shouldPlay?: (payload: GameEvents['drink:unlocked']) => boolean }
  | { event: 'achievement'; sfx: 'achievement'; shouldPlay?: (payload: GameEvents['achievement']) => boolean }
  | { event: 'goal:complete'; sfx: 'goal:complete'; shouldPlay?: (payload: GameEvents['goal:complete']) => boolean }
  | { event: 'day:end'; sfx: 'day:end'; shouldPlay?: (payload: GameEvents['day:end']) => boolean }
  | { event: 'rush:start'; sfx: 'rush:start'; shouldPlay?: (payload: GameEvents['rush:start']) => boolean }
  | { event: 'action:fail'; sfx: 'action:fail'; shouldPlay?: (payload: GameEvents['action:fail']) => boolean };

/**
 * Single subscription table: the one module-owned list pairing each honored
 * bus event with its canonical sfx name. Guards stay here so bindEvents is
 * only iteration, not a second list of names.
 */
export const AUDIO_SFX_TABLE: AudioSfxSubscription[] = [
  { event: 'ui:click', sfx: 'ui:click' },
  {
    event: 'ui:hover',
    sfx: 'ui:hover',
    shouldPlay: ({ stationId }): boolean => stationId !== null && stationId !== undefined,
  },
  { event: 'brew:start', sfx: 'brew:start' },
  { event: 'brew:done', sfx: 'brew:done' },
  { event: 'order:served', sfx: 'order:served' },
  {
    event: 'combo:change',
    sfx: 'combo:change',
    shouldPlay: ({ combo }): boolean => combo >= 3,
  },
  { event: 'customer:spawn', sfx: 'customer:spawn' },
  {
    event: 'customer:leave',
    sfx: 'customer:leave',
    shouldPlay: ({ angry }): boolean => angry,
  },
  { event: 'order:expired', sfx: 'order:expired' },
  { event: 'upgrade:bought', sfx: 'upgrade:bought' },
  { event: 'drink:unlocked', sfx: 'drink:unlocked' },
  { event: 'achievement', sfx: 'achievement' },
  { event: 'goal:complete', sfx: 'goal:complete' },
  { event: 'day:end', sfx: 'day:end' },
  { event: 'rush:start', sfx: 'rush:start' },
  { event: 'action:fail', sfx: 'action:fail' },
];

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

      // SFX events: single subscription point; names/guards live in AUDIO_SFX_TABLE.
      // The table literal is checked against AudioSfxSubscription at definition;
      // here the module re-reads each row through one widened guard shape so the
      // table stays the single list instead of a per-event switch that can miss rows.
      for (const row of AUDIO_SFX_TABLE) {
        this.subscribeRow(
          row.event,
          row.sfx,
          row.shouldPlay as ((payload: GameEvents[keyof GameEvents]) => boolean) | undefined
        );
      }

      // Note: 'toast' event -> explicitly none.
    } catch {
      // Guard all listener registrations
    }
  }

  private subscribeRow(
    event: keyof GameEvents,
    sfx: SfxName,
    shouldPlay?: (payload: GameEvents[keyof GameEvents]) => boolean
  ): void {
    this.unsubs.push(
      this.bus.on(event, (payload) => {
        if (shouldPlay !== undefined && !shouldPlay(payload)) return;
        if (event === 'ui:hover') {
          const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
          if (now - this.lastHoverTime < 80) return;
          this.lastHoverTime = now;
        }
        // combo:change carries { combo }; playCombo needs the rising number.
        const extra = event === 'combo:change' ? (payload as GameEvents['combo:change']).combo : payload;
        this.sfx.play(sfx, this.synth, extra);
      })
    );
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
