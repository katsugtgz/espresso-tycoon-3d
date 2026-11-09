// Layer 0 — RULES (pure). No EventBus, no GameState, no sim imports.
// Only: types + config + core/rng. All functions take plain inputs, return facts.

import type { Rng } from '../../core/rng';
import type { DayStats, Goal } from '../../types';
import { BALANCE } from '../../config/balance';

/** Minimum served count for the noLost day-end goal (shared with progression.ts). */
export const NO_LOST_MIN_SERVED = 8;

/** Pick 3 unique daily goals. Pure in (day, rng draws) — same sequence as before. */
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
        return { desc: `Finish the day with zero lost customers (min ${NO_LOST_MIN_SERVED} served)`, target: 1, reward };
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

/** Current progress value of a goal metric from day stats (null = day-end only). */
export function goalValueFor(metric: Goal['metric'], dayStats: DayStats): number | null {
  switch (metric) {
    case 'served':
      return dayStats.served;
    case 'revenue':
      return dayStats.revenue;
    case 'combo':
      return dayStats.bestCombo;
    case 'tips':
      return dayStats.tips;
    case 'noLost':
      return null; // evaluated at day end
  }
}

/** Rent owed for a day number. */
export function rentFor(day: number): number {
  return BALANCE.rentBase + BALANCE.rentPerDay * (day - 1);
}

/** Wages owed for a barista headcount. */
export function wagesFor(baristaCount: number): number {
  return baristaCount * BALANCE.baristaWage;
}

/** Day profit from ledger inputs (caller rounds to cents). */
export function profitFor(
  revenue: number,
  tips: number,
  expenses: number,
  rent: number,
  wages: number
): number {
  return revenue + tips - expenses - rent - wages;
}
