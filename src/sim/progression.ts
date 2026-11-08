import type { GameState, Goal, CustomerKind } from '../types';
import { DRINK_ORDER } from '../types';
import type { EventBus } from '../core/events';
import type { GameEvents } from '../types';
import { Rng } from '../core/rng';
import { BALANCE, ACHIEVEMENTS, DRINKS } from '../config/balance';

export function generateGoals(day: number, rng: Rng): Goal[] {
  const allMetrics: Array<{
    metric: Goal['metric'];
    gen: () => { desc: string; target: number; reward: number };
  }> = [
    {
      metric: 'served',
      gen: () => {
        const target = Math.max(5, Math.floor(8 + day * 3 + rng.int(-2, 2)));
        const reward = Math.round(12 + day * 6);
        return { desc: `Serve ${target} drinks today`, target, reward };
      },
    },
    {
      metric: 'revenue',
      gen: () => {
        const target = Math.max(25, Math.floor(40 + day * 20 + rng.int(-5, 5)));
        const reward = Math.round(15 + day * 7);
        return { desc: `Earn $${target} in drink sales today`, target, reward };
      },
    },
    {
      metric: 'combo',
      gen: () => {
        const target = Math.min(BALANCE.comboCap, Math.max(3, 3 + Math.floor(day / 2)));
        const reward = Math.round(15 + target * 4);
        return { desc: `Reach a ${target}x combo`, target, reward };
      },
    },
    {
      metric: 'tips',
      gen: () => {
        const target = Math.max(6, Math.floor(6 + day * 4 + rng.int(-1, 3)));
        const reward = Math.round(10 + day * 5);
        return { desc: `Collect $${target} in tips today`, target, reward };
      },
    },
    {
      metric: 'noLost',
      gen: () => {
        const reward = Math.round(18 + day * 8);
        return { desc: `Finish the day with zero lost customers (min 8 served)`, target: 1, reward };
      },
    },
  ];

  // Pick 3 unique metrics
  const pool = [...allMetrics];
  const chosen: Goal[] = [];

  for (let i = 0; i < 3 && pool.length > 0; i++) {
    const idx = Math.floor(rng.next() * pool.length);
    const item = pool.splice(idx, 1)[0];
    const { desc, target, reward } = item.gen();
    chosen.push({
      id: `d${day}_g${i}_${item.metric}`,
      desc,
      metric: item.metric,
      target,
      progress: 0,
      reward,
      done: false,
    });
  }

  return chosen;
}

export function updateGoalsProgress(state: GameState, bus: EventBus<GameEvents>): void {
  for (const goal of state.goals) {
    if (goal.done) continue;

    let currentVal = 0;
    switch (goal.metric) {
      case 'served':
        currentVal = state.dayStats.served;
        break;
      case 'revenue':
        currentVal = state.dayStats.revenue;
        break;
      case 'combo':
        currentVal = state.dayStats.bestCombo;
        break;
      case 'tips':
        currentVal = state.dayStats.tips;
        break;
      case 'noLost':
        // Evaluated at day end
        continue;
    }

    goal.progress = Math.min(goal.target, currentVal);
    if (goal.progress >= goal.target) {
      goal.done = true;
      state.money = Math.round((state.money + goal.reward) * 100) / 100;
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
      if (state.dayStats.lost === 0 && state.dayStats.served >= 8) {
        goal.progress = 1;
        goal.done = true;
        state.money = Math.round((state.money + goal.reward) * 100) / 100;
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

export function selectCustomerKind(day: number, rng: Rng): CustomerKind {
  if (day >= 3) {
    const roll = rng.next();
    if (roll < BALANCE.vipChance) return 'vip';
    if (roll < BALANCE.vipChance + BALANCE.pickyChance) return 'picky';
  }
  return 'regular';
}

export function calculateSpawnInterval(state: GameState): number {
  // Base arrival interval
  let interval = BALANCE.baseSpawnInterval;

  // 1. Day ramp: +12% arrivals per day
  const dayMult = Math.pow(1.12, Math.max(0, state.day - 1));

  // 2. Rating factor: 3.0 is baseline 1.0. Lower rating slows down, higher speeds up.
  // Rating < 2.0 severely slows down arrivals
  let ratingMult = 1.0;
  if (state.rating < 2.0) {
    ratingMult = 0.5 * (state.rating / 2.0); // e.g. 1.0 rating -> 0.25x arrival rate
  } else {
    ratingMult = 1.0 + (state.rating - 3.0) * 0.25;
  }
  ratingMult = Math.max(0.2, ratingMult);

  // 3. Marketing upgrade (+15% arrivals per level)
  const marketingMult = 1.0 + state.upgrades.marketing * 0.15;

  // 4. Price elasticity
  // Average ratio of current price to base price
  let priceRatioSum = 0;
  let count = 0;
  for (const d of state.unlockedDrinks) {
    const base = DRINKS[d].basePrice;
    const cur = state.prices[d] ?? base;
    priceRatioSum += cur / base;
    count++;
  }
  const avgPriceRatio = count > 0 ? priceRatioSum / count : 1.0;
  // High prices reduce arrival rate, lower prices increase arrival rate
  const priceMult = 1.0 / Math.max(0.5, Math.pow(avgPriceRatio, 0.8));

  // Combine multipliers into divisor (rush burst volume handled in Simulation.step)
  const totalMult = dayMult * ratingMult * marketingMult * priceMult;
  interval = interval / Math.max(0.1, totalMult);

  return Math.max(BALANCE.minSpawnInterval, interval);
}
