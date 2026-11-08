import type { GameState, DrinkId, UpgradeId } from '../types';
import { SAVE_KEY, SAVE_VERSION, BALANCE, STARTING_DRINKS, DRINKS } from '../config/balance';
import { createInitialState, createInitialPrices, createInitialUpgrades, createInitialSeats, createInitialMachines } from './state';

interface SaveEnvelope {
  version: number;
  savedAt: number;
  state: GameState;
}

export function saveGame(state: GameState): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    const envelope: SaveEnvelope = {
      version: SAVE_VERSION,
      savedAt: Date.now(),
      state: JSON.parse(JSON.stringify(state)),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(envelope));
    return true;
  } catch (err) {
    console.error('[saveGame] failed', err);
    return false;
  }
}

export function loadGame(): unknown | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.error('[loadGame] failed', err);
    return null;
  }
}

export function hasSave(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

export function clearSave(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (err) {
    console.error('[clearSave] failed', err);
  }
}

export function migrate(data: unknown): GameState | null {
  if (!data || typeof data !== 'object') return null;

  const raw = data as Record<string, any>;
  const payload = raw.state && typeof raw.state === 'object' ? raw.state : raw;

  // Case 1: Version 2 save
  if (raw.version === SAVE_VERSION || payload.version === SAVE_VERSION) {
    if (typeof payload.money === 'number' && typeof payload.day === 'number' && Array.isArray(payload.unlockedDrinks)) {
      const state = JSON.parse(JSON.stringify(payload)) as GameState;
      // Guard all critical numerical fields
      state.money = Number.isFinite(state.money) ? state.money : BALANCE.startMoney;
      state.rating = Number.isFinite(state.rating) ? Math.max(1, Math.min(5, state.rating)) : BALANCE.startRating;
      state.combo = Number.isFinite(state.combo) ? Math.max(0, state.combo) : 0;
      state.dayTime = Number.isFinite(state.dayTime) ? Math.max(0, state.dayTime) : 0;
      state.clockMinutes = Number.isFinite(state.clockMinutes) ? state.clockMinutes : 480;
      state.lowRatingStrikes = Number.isFinite(state.lowRatingStrikes) ? Math.max(0, state.lowRatingStrikes!) : 0;
      return state;
    }
  }

  // Case 2: Legacy v1 save
  // v1 shape must have at least valid currentDay/day and (if provided) valid numbers for money/rating
  if (payload.money !== undefined && (typeof payload.money !== 'number' || !Number.isFinite(payload.money))) {
    return null;
  }
  if (payload.rating !== undefined && (typeof payload.rating !== 'number' || !Number.isFinite(payload.rating))) {
    return null;
  }

  const rawDay = payload.currentDay ?? payload.day;
  if (typeof rawDay !== 'number' || !Number.isFinite(rawDay) || rawDay < 1) {
    return null;
  }

  const day = Math.floor(rawDay);
  const money = typeof payload.money === 'number' ? payload.money : BALANCE.startMoney;
  const rating = typeof payload.rating === 'number' ? Math.max(1, Math.min(5, payload.rating)) : BALANCE.startRating;

  const fresh = createInitialState(Date.now() & 0xffffffff, false);
  fresh.day = Math.floor(day);
  fresh.money = money;
  fresh.rating = rating;
  fresh.phase = 'playing';
  fresh.lowRatingStrikes = Number.isFinite(payload.lowRatingStrikes) ? Math.max(0, payload.lowRatingStrikes) : 0;

  // Restore upgrades if present
  if (payload.upgrades && typeof payload.upgrades === 'object') {
    for (const key of Object.keys(fresh.upgrades) as UpgradeId[]) {
      if (typeof payload.upgrades[key] === 'number' && Number.isFinite(payload.upgrades[key])) {
        fresh.upgrades[key] = Math.max(0, payload.upgrades[key]);
      }
    }
  }

  // Restore drinks
  if (Array.isArray(payload.unlockedDrinks)) {
    const validDrinks = payload.unlockedDrinks.filter((d: any) => typeof d === 'string' && d in DRINKS) as DrinkId[];
    if (validDrinks.length > 0) {
      fresh.unlockedDrinks = validDrinks;
    }
  }

  // Restore prices
  const legacyPrices = payload.drinkPrices ?? payload.prices;
  if (legacyPrices && typeof legacyPrices === 'object') {
    for (const key of Object.keys(fresh.prices) as DrinkId[]) {
      if (typeof legacyPrices[key] === 'number' && Number.isFinite(legacyPrices[key])) {
        fresh.prices[key] = legacyPrices[key];
      }
    }
  }

  // Re-derive structure from upgrades
  fresh.queueCapacity = BALANCE.baseQueueCapacity + fresh.upgrades.queue * 2;
  const tableCount = BALANCE.baseTables + fresh.upgrades.tables;
  fresh.seats = createInitialSeats(tableCount);
  const machineCount = BALANCE.baseMachines + fresh.upgrades.machine;
  fresh.machines = createInitialMachines(machineCount);

  return fresh;
}
