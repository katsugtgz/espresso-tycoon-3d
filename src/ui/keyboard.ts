import { DRINK_ORDER } from '../types';
import type { ISim, GameSpeed } from '../types';
import type { AppHooks } from '../appTypes';
import type { EventBus } from '../core/events';
import type { GameEvents } from '../types';

export interface KeyboardDelegate {
  hasOpenModal(): boolean;
  closeTopModal(): void;
  togglePauseMenu(): void;
  toggleShop(): void;
}

export class KeyboardManager {
  private keyHandler: (e: KeyboardEvent) => void;

  constructor(
    private sim: ISim,
    private bus: EventBus<GameEvents>,
    private hooks: AppHooks,
    private delegate: KeyboardDelegate
  ) {
    this.keyHandler = this.onKeyDown.bind(this);
    window.addEventListener('keydown', this.keyHandler);
  }

  private onKeyDown(e: KeyboardEvent): void {
    // Ignore when typing in inputs or text areas
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable)
    ) {
      return;
    }

    const state = this.sim.state;

    // Ctrl+S / Cmd+S -> save
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      const saved = this.hooks.save();
      if (saved) {
        this.bus.emit('toast', { text: '💾 Game Saved', kind: 'info' });
      }
      return;
    }

    // Esc: close top panel else toggle pause menu
    if (e.key === 'Escape') {
      e.preventDefault();
      if (this.delegate.hasOpenModal()) {
        this.delegate.closeTopModal();
      } else if (state.phase === 'playing') {
        this.delegate.togglePauseMenu();
      }
      return;
    }

    // Space: toggle pause
    if (e.code === 'Space') {
      e.preventDefault();
      if (state.phase === 'playing') {
        const nextPaused = !state.paused;
        this.sim.dispatch({ type: 'pause', paused: nextPaused });
        this.bus.emit('ui:click', {});
      }
      return;
    }

    // F: cycle speed 1 -> 2 -> 4 -> 1
    if (e.key === 'f' || e.key === 'F') {
      if (state.phase === 'playing') {
        const speeds: GameSpeed[] = [1, 2, 4];
        const curIdx = speeds.indexOf(state.speed);
        const nextSpeed = curIdx >= 0 && curIdx < speeds.length - 1 ? speeds[curIdx + 1] : speeds[0];
        this.sim.dispatch({ type: 'setSpeed', speed: nextSpeed });
        this.bus.emit('ui:click', {});
      }
      return;
    }

    // B: toggle shop
    if (e.key === 'b' || e.key === 'B') {
      if (state.phase === 'playing' || state.phase === 'day_end') {
        this.delegate.toggleShop();
        this.bus.emit('ui:click', {});
      }
      return;
    }

    // R: reset camera
    if (e.key === 'r' || e.key === 'R') {
      this.hooks.resetCamera();
      this.bus.emit('ui:click', {});
      return;
    }

    // M: toggle Lo-Fi music
    if (e.key === 'm' || e.key === 'M') {
      const cur = this.hooks.getSettings();
      this.hooks.applySettings({ musicOn: !cur.musicOn });
      this.bus.emit('ui:click', {});
      return;
    }

    // 1-6: brew DRINK_ORDER[i]
    if (state.phase === 'playing') {
      const num = parseInt(e.key, 10);
      if (!isNaN(num) && num >= 1 && num <= 6) {
        const drinkId = DRINK_ORDER[num - 1];
        if (drinkId) {
          const res = this.sim.dispatch({ type: 'brew', drink: drinkId });
          this.bus.emit('ui:click', {});
          if (!res.ok && res.reason) {
            this.bus.emit('action:fail', { action: 'brew', reason: res.reason });
          }
        }
      }
    }
  }

  destroy(): void {
    window.removeEventListener('keydown', this.keyHandler);
  }
}
