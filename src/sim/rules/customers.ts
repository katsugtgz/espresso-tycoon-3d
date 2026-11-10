// Layer 0 — RULES (pure). No EventBus, no GameState, no sim imports.
// Only: types + config. Callers pass plain numbers, get facts back.

import type { CustomerState, Mood, Vec2 } from '../../types';
import { BALANCE } from '../../config/balance';
import { clamp01 } from './money';

export interface MoveResult {
  pos: Vec2;
  facing: number;
  reached: boolean;
}

/** One movement step toward a target at walk speed. Pure. */
export function stepToward(from: Vec2, to: Vec2, facing: number, speed: number, dt: number): MoveResult {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const dist = Math.hypot(dx, dz);
  const nextFacing = dist > 0.001 ? Math.atan2(dx, dz) : facing;
  const moveStep = speed * dt;
  if (dist <= moveStep) {
    return { pos: { ...to }, facing: nextFacing, reached: true };
  }
  return {
    pos: { x: from.x + (dx / dist) * moveStep, z: from.z + (dz / dist) * moveStep },
    facing: nextFacing,
    reached: false,
  };
}

/** Patience drain per second for a customer state (0 when not draining). */
export function drainRateFor(customerState: CustomerState, patienceMax: number): number {
  if (customerState === 'queueing') return 0.5 / patienceMax;
  if (customerState === 'ordering' || customerState === 'waiting') return 1.0 / patienceMax;
  return 0;
}

/** Mood bucket for a patience value. */
export function moodFor(patience: number): Mood {
  if (patience > 0.6) return 'happy';
  if (patience >= 0.35) return 'neutral';
  return 'angry';
}

export interface PatienceTick {
  patience: number;
  impatient: boolean;
  timedOut: boolean;
  mood: Mood;
}

/** Apply one patience tick. Pure. */
export function tickPatience(patience: number, drainRate: number, dt: number): PatienceTick {
  const prev = patience;
  const next = Math.max(0, patience - drainRate * dt);
  return {
    patience: next,
    impatient: prev >= 0.35 && next < 0.35,
    timedOut: drainRate > 0 && next <= 0,
    mood: moodFor(next),
  };
}

/** Seated dwell time for a customer id (deterministic hash over BALANCE.seatedTime). */
export function seatedDurationFor(customerId: number): number {
  const durationRange = BALANCE.seatedTime[1] - BALANCE.seatedTime[0];
  return BALANCE.seatedTime[0] + ((customerId * 17) % Math.max(1, durationRange));
}

/** Patience as a [0,1] fraction. */
export function patienceRatio(patience: number): number {
  return clamp01(patience);
}
