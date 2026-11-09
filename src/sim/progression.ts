// Layer 1 — PROGRESSION ACTIONS (mutate state + emit).
// Pure math lives in rules/goals.ts + rules/money.ts.
// Direction: progression -> rules/* only; never sibling sim action modules.

import type { GameState } from '../types';
import { DRINK_ORDER } from '../types';
import type { EventBus } from '../core/events';
import type { GameEvents } from '../types';
import { ACHIEVEMENTS } from '../config/balance';
import { goalValueFor, NO_LOST_MIN_SERVED } from './rules/goals';
import { round2 } from './rules/money';

export function updateGoalsProgress(state: GameState, bus: EventBus<GameEvents>): void {
  for (const goal of state.goals) {
    if (goal.done) continue;

    const currentVal = goalValueFor(goal.metric, state.dayStats);
    // 'noLost' is evaluated at day end
    if (currentVal === null) continue;

    goal.progress = Math.min(goal.target, currentVal);
    if (goal.progress >= goal.target) {
      goal.done = true;
      state.money = round2(state.money + goal.reward);
      bus.emit('money:change', {
        money: state.money,
        delta: goal.reward,
        reason: 'goal_reward',
      });
      bus.emit('goal:complete', {
        id: goal.id,
        desc: goal.desc,
        reward: goal.reward,
      });
    }
  }
}

export function evaluateDayEndGoals(state: GameState, bus: EventBus<GameEvents>): void {
  for (const goal of state.goals) {
    if (goal.done) continue;
    if (goal.metric === 'noLost') {
      if (state.dayStats.lost === 0 && state.dayStats.served >= NO_LOST_MIN_SERVED) {
        goal.progress = 1;
        goal.done = true;
        state.money = round2(state.money + goal.reward);
        bus.emit('money:change', {
          money: state.money,
          delta: goal.reward,
          reason: 'goal_reward',
        });
        bus.emit('goal:complete', {
          id: goal.id,
          desc: goal.desc,
          reward: goal.reward,
        });
      }
    }
  }
}

export function checkAchievements(state: GameState, bus: EventBus<GameEvents>): void {
  const existing = new Set(state.achievements);

  const check = (id: string, condition: boolean) => {
    if (!existing.has(id) && condition) {
      const ach = ACHIEVEMENTS.find((a) => a.id === id);
      if (ach) {
        state.achievements.push(id);
        bus.emit('achievement', { id: ach.id, name: ach.name, desc: ach.desc });
      }
    }
  };

  check('first_sale', state.stats.totalServed >= 1);
  check('combo_5', state.stats.maxCombo >= 5);
  check('combo_10', state.stats.maxCombo >= 10);
  check('served_50', state.stats.totalServed >= 50);
  check('served_250', state.stats.totalServed >= 250);
  check('money_1000', state.money >= 1000);
  check('rating_45', state.rating >= 4.5);
  check('all_drinks', state.unlockedDrinks.length >= DRINK_ORDER.length);
  check('first_hire', state.upgrades.barista >= 1);
  check('day_7', state.day >= 7);
  // 'perfect_day' checked at day end
}
