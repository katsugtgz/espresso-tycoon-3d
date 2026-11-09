// Layer 1 — TUTORIAL ACTIONS. Owns the step table application + emits.
// Callers report gameplay EVENTS, never step numbers. Step numbers live only
// in rules/tutorial.ts. Gameplay code must use reportTutorialEvent.

import type { GameState } from '../types';
import type { EventBus } from '../core/events';
import type { GameEvents } from '../types';
import { advanceOn, isCompleteStep } from './rules/tutorial';
import type { TutorialEvent } from './rules/tutorial';

export type { TutorialEvent };

/** Low-level step setter + emit. Prefer reportTutorialEvent (event-driven). */
function advanceTutorial(state: GameState, bus: EventBus<GameEvents>, toStep: number): void {
  if (!state.tutorial.active) return;
  state.tutorial.step = toStep;
  if (isCompleteStep(toStep)) {
    state.tutorial.active = false;
    state.tutorial.done = true;
  }
  bus.emit('tutorial:step', { step: toStep });
}

/**
 * Report a gameplay event (order_placed, brew_started, brew_done,
 * order_served, upgrade_bought) or UI ack. Advances only when the event
 * matches the current step's expected trigger; otherwise a no-op.
 */
export function reportTutorialEvent(
  state: GameState,
  bus: EventBus<GameEvents>,
  event: TutorialEvent
): void {
  if (!state.tutorial.active) return;
  const toStep = advanceOn(event, state.tutorial.step);
  if (toStep !== null) {
    advanceTutorial(state, bus, toStep);
  }
}

export function skipTutorial(state: GameState, bus: EventBus<GameEvents>): void {
  state.tutorial.active = false;
  state.tutorial.done = true;
  state.tutorial.step = 5;
  bus.emit('tutorial:step', { step: 5 });
}

export function handleTutorialAck(state: GameState, bus: EventBus<GameEvents>): void {
  reportTutorialEvent(state, bus, 'ack');
}
