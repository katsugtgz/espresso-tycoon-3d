import type { GameState } from '../types';
import type { EventBus } from '../core/events';
import type { GameEvents } from '../types';

export function advanceTutorial(state: GameState, bus: EventBus<GameEvents>, toStep: number): void {
  if (!state.tutorial.active) return;
  state.tutorial.step = toStep;
  if (toStep >= 5) {
    state.tutorial.active = false;
    state.tutorial.done = true;
  }
  bus.emit('tutorial:step', { step: toStep });
}

export function skipTutorial(state: GameState, bus: EventBus<GameEvents>): void {
  state.tutorial.active = false;
  state.tutorial.done = true;
  state.tutorial.step = 5;
  bus.emit('tutorial:step', { step: 5 });
}

export function handleTutorialAck(state: GameState, bus: EventBus<GameEvents>): void {
  if (!state.tutorial.active) return;
  if (state.tutorial.step === 0) {
    advanceTutorial(state, bus, 1);
  } else if (state.tutorial.step === 4) {
    advanceTutorial(state, bus, 5);
  }
}
