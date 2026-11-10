// Layer 0: pure rules — no EventBus, no GameState, no sim imports.
// Single home for money rounding + rating clamps (deduped from
// economy/stations/progression/customers/Simulation/save).

/** Round to whole cents. Identical to the Math.round(x*100)/100 pattern it replaces. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Ratings live in [1, 5]. */
export function clampRating(r: number): number {
  return clamp(r, 1, 5);
}

/** Clamp to [0, 1]. */
export function clamp01(v: number): number {
  return clamp(v, 0, 1);
}
