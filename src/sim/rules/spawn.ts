// Layer 0 — RULES (pure). No EventBus, no GameState, no sim imports.
// Only: types + config + core/rng. All functions take plain inputs, return facts.

import type { Rng } from '../../core/rng';
import type { CustomerKind, DrinkId } from '../../types';
import { BALANCE, DRINKS } from '../../config/balance';

/** Customer kind roll. Consumes one rng draw only on day >= 3 (as before). */
export function selectCustomerKind(day: number, rng: Rng): CustomerKind {
  if (day >= 3) {
    const roll = rng.next();
    if (roll < BALANCE.vipChance) return 'vip';
    if (roll < BALANCE.vipChance + BALANCE.pickyChance) return 'picky';
  }
  return 'regular';
}

/** Full patience bar (seconds) for a kind at a decor level. */
export function patienceMaxFor(kind: CustomerKind, decorLevel: number): number {
  let patienceMax = BALANCE.basePatience * (1 + decorLevel * 0.05);
  if (kind === 'vip') patienceMax *= 0.7;
  else if (kind === 'picky') patienceMax *= 0.8;
  return patienceMax;
}

/** Weighted drink pick: cheaper base price => higher weight. Consumes one draw. */
export function pickDrinkForOrder(unlocked: DrinkId[], rng: Rng): DrinkId {
  if (unlocked.length === 1) return unlocked[0];
  let totalWeight = 0;
  const weights: number[] = [];
  for (const d of unlocked) {
    const price = DRINKS[d]?.basePrice ?? 3;
    const w = 10 / Math.sqrt(price);
    weights.push(w);
    totalWeight += w;
  }
  let roll = rng.next() * totalWeight;
  for (let i = 0; i < unlocked.length; i++) {
    if (roll < weights[i]) return unlocked[i];
    roll -= weights[i];
  }
  return unlocked[0];
}

export interface SpawnInputs {
  day: number;
  rating: number;
  marketingLevel: number;
  unlocked: DrinkId[];
  prices: Record<DrinkId, number>;
}

/** Seconds between arrivals before jitter. Pure function of shop-state facts. */
export function spawnIntervalFor(s: SpawnInputs): number {
  let interval = BALANCE.baseSpawnInterval;

  // 1. Day ramp: +12% arrivals per day
  const dayMult = Math.pow(1.12, Math.max(0, s.day - 1));

  // 2. Rating factor: 3.0 is baseline 1.0. Lower rating slows down, higher speeds up.
  // Rating < 2.0 severely slows down arrivals
  let ratingMult = 1.0;
  if (s.rating < 2.0) {
    ratingMult = 0.5 * (s.rating / 2.0); // e.g. 1.0 rating -> 0.25x arrival rate
  } else {
    ratingMult = 1.0 + (s.rating - 3.0) * 0.25;
  }
  ratingMult = Math.max(0.2, ratingMult);

  // 3. Marketing upgrade (+15% arrivals per level)
  const marketingMult = 1.0 + s.marketingLevel * 0.15;

  // 4. Price elasticity: average ratio of current price to base price
  let priceRatioSum = 0;
  let count = 0;
  for (const d of s.unlocked) {
    const base = DRINKS[d].basePrice;
    const cur = s.prices[d] ?? base;
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
