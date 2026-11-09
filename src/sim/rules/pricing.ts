// Layer 0: pure pricing rules — no EventBus, no GameState, no sim imports.
// Only: types + config + rules/money. All functions take plain inputs,
// return facts. (Moved verbatim out of economy.ts / stations.ts.)

import { DRINKS, UPGRADES, BALANCE, PRICE_MIN_MULT, PRICE_MAX_MULT } from '../../config/balance';
import type { CustomerKind, DrinkId, UpgradeId } from '../../types';
import { round2, clamp01 } from './money';

/** Cost to buy the next level of an upgrade given its current level. */
export function upgradeCostFor(id: UpgradeId, currentLevel: number): number {
  const def = UPGRADES[id];
  if (!def) return Infinity;
  if (currentLevel >= def.maxLevel) return Infinity;
  return Math.round(def.baseCost * Math.pow(def.costMult, currentLevel));
}

/** Clamp a player-entered price to [0.5x, 2x] base and round to cents. */
export function clampPriceFor(drink: DrinkId, price: number): number {
  const base = DRINKS[drink]?.basePrice ?? 3;
  const min = base * PRICE_MIN_MULT;
  const max = base * PRICE_MAX_MULT;
  return round2(Math.min(max, Math.max(min, price)));
}

/** Look up the effective shelf price for a drink. */
export function priceFor(drink: DrinkId, prices: Record<DrinkId, number>): number {
  return prices[drink] ?? DRINKS[drink]?.basePrice ?? 3;
}

/** Brew duration in seconds for a drink at a grinder level. */
export function brewTimeFor(drink: DrinkId, grinderLevel: number): number {
  const basePrep = DRINKS[drink]?.prepTime ?? 3;
  const grinderSpeed = BALANCE.grinderSpeedPerLevel * (grinderLevel ?? 0);
  const mult = Math.max(0.2, 1 - grinderSpeed);
  return Math.max(0.5, basePrep * mult);
}

export interface TipInputs {
  basePrice: number;
  patience: number;
  combo: number;
  kind: CustomerKind;
  hasSeating: boolean;
}

/** Tip in dollars for a served order. Pure: caller supplies snapshots. */
export function tipFor(t: TipInputs): number {
  const patienceRatio = clamp01(t.patience);
  const comboClamped = Math.min(BALANCE.comboCap, Math.max(0, t.combo));
  const comboBonus = comboClamped * BALANCE.comboTipBonus;

  // Base tip fraction
  let tipFraction = BALANCE.tipBase * patienceRatio + comboBonus;

  // Picky customers tip significantly more
  if (t.kind === 'picky') {
    tipFraction *= 1.6;
  }

  // VIP customers tip generously
  if (t.kind === 'vip') {
    tipFraction *= 1.4;
  }

  // Seated capable bonus (+15% tip)
  if (t.hasSeating) {
    tipFraction *= 1.15;
  }

  const tip = t.basePrice * tipFraction;
  return round2(Math.max(0, tip));
}

/** Shelf revenue for a sale (VIPs pay double). Rounded to cents. */
export function revenueFor(price: number, isVip: boolean): number {
  return round2(price * (isVip ? 2 : 1));
}

/** Total cash collected (revenue + tip), rounded to cents. */
export function totalFor(revenue: number, tip: number): number {
  return round2(revenue + tip);
}

/** Rating gain for a successful serve at a patience level. */
export function ratingDeltaFor(patience: number): number {
  return 0.02 + 0.03 * clamp01(patience);
}

/** Rating ceiling grows with decor level. */
export function ratingCeilingFor(decorLevel: number): number {
  return Math.min(5.0, 3.5 + decorLevel * 0.2);
}

/**
 * Apply a serve rating gain without exceeding the ceiling.
 * Returns the new rating plus the actual (rounded) delta for emits.
 */
export function applyRatingGain(
  rating: number,
  delta: number,
  ceiling: number
): { rating: number; actualDelta: number } {
  if (rating >= ceiling) return { rating, actualDelta: 0 };
  const next = Math.min(ceiling, round2(rating + delta));
  return { rating: next, actualDelta: round2(next - rating) };
}

/** Apply the fixed timeout rating penalty, floored at 1.0. */
export function applyRatingPenalty(
  rating: number,
  penalty: number = 0.08
): { rating: number; delta: number } {
  const next = Math.max(1.0, round2(rating - penalty));
  return { rating: next, delta: round2(next - rating) };
}
