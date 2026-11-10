// Layer 0 — RULES (pure). No EventBus, no GameState, no sim imports.
// Only: types + config + rules/money + tutorial table inputs.
// Tutorial callers report EVENTS, never step numbers; the table owns steps.

export type TutorialEvent =
  | 'order_placed'
  | 'brew_started'
  | 'brew_done'
  | 'order_served'
  | 'upgrade_bought'
  | 'ack';

interface Transition {
  from: number;
  to: number;
}

/** Gameplay-event transitions: each fires only from its expected step. */
const TRANSITIONS: Record<Exclude<TutorialEvent, 'ack'>, Transition> = {
  order_placed: { from: 0, to: 1 },
  brew_started: { from: 1, to: 2 },
  brew_done: { from: 2, to: 3 },
  order_served: { from: 3, to: 4 },
  upgrade_bought: { from: 4, to: 5 },
};

/** UI ack ("Next"/"Got it") advances message-only steps 0 and 4. */
const ACK_TRANSITIONS: Record<number, number> = {
  0: 1,
  4: 5,
};

/** Step the event advances to, or null when the event is not relevant now. */
export function advanceOn(event: TutorialEvent, step: number): number | null {
  if (event === 'ack') {
    return ACK_TRANSITIONS[step] ?? null;
  }
  const t = TRANSITIONS[event];
  return step === t.from ? t.to : null;
}

/** Step 5 completes the tutorial. */
export function isCompleteStep(step: number): boolean {
  return step >= 5;
}

/** Player-count gate: hold new spawns while onboarding the first customer. */
export function shouldBlockSpawns(active: boolean, step: number, customerCount: number): boolean {
  return active && step <= 3 && customerCount >= 1;
}

/** Patience frozen while the tutorial walks through steps 0..3. */
export function isPatiencePaused(active: boolean, step: number): boolean {
  return active && step <= 3;
}

/** First-ever order is forced to espresso during onboarding. */
export function forcedTutorialDrink(
  active: boolean,
  step: number,
  totalServed: number
): 'espresso' | null {
  return active && step <= 1 && totalServed === 0 ? 'espresso' : null;
}

/** Human-readable step table. */
export const TUTORIAL_STEPS: ReadonlyArray<{ step: number; trigger: string; description: string }> = [
  { step: 0, trigger: 'new game', description: 'Welcome card (Next button)' },
  { step: 1, trigger: 'order_placed', description: 'First customer orders (click idle machine to brew)' },
  { step: 2, trigger: 'brew_started', description: 'Espresso brewing (wait for ready)' },
  { step: 3, trigger: 'brew_done', description: 'Drink ready (serve it)' },
  { step: 4, trigger: 'order_served', description: 'First serve done (buy any upgrade; Got it also works)' },
  { step: 5, trigger: 'upgrade_bought', description: 'Tutorial complete' },
];
