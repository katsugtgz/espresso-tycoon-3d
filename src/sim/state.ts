import type { GameState, DayStats, SeatSnap, MachineSnap, UpgradeId, DrinkId } from '../types';
import { DRINKS, STARTING_DRINKS, BALANCE, SAVE_VERSION, UPGRADES } from '../config/balance';
import { LAYOUT, seatPositions } from '../config/layout';

export function createInitialDayStats(day: number, rating: number): DayStats {
  return {
    day,
    revenue: 0,
    tips: 0,
    expenses: 0,
    rent: 0,
    wages: 0,
    served: 0,
    lost: 0,
    bestCombo: 0,
    ratingStart: rating,
    ratingEnd: rating,
    timeToFirstSale: null,
    profit: 0,
  };
}

export function createInitialSeats(tableCount: number = BALANCE.baseTables): SeatSnap[] {
  const seats: SeatSnap[] = [];
  let seatId = 0;
  for (let t = 0; t < tableCount; t++) {
    const [p1, p2] = seatPositions(t);
    seats.push({ id: seatId++, tableId: t, pos: { ...p1 }, occupantId: null });
    seats.push({ id: seatId++, tableId: t, pos: { ...p2 }, occupantId: null });
  }
  return seats;
}

export function createInitialMachines(machineCount: number = BALANCE.baseMachines): MachineSnap[] {
  const machines: MachineSnap[] = [];
  for (let i = 0; i < machineCount; i++) {
    machines.push({
      id: i,
      status: 'idle',
      orderId: null,
      drink: null,
      progress: 0,
      brewTime: 0,
      claimedBy: null,
    });
  }
  return machines;
}

/** Restore a machine snap to its initial idle shape (no order, no progress). */
export function resetMachine(machine: MachineSnap): void {
  machine.status = 'idle';
  machine.orderId = null;
  machine.drink = null;
  machine.progress = 0;
  machine.brewTime = 0;
  machine.claimedBy = null;
}

export function createInitialPrices(): Record<DrinkId, number> {
  const prices = {} as Record<DrinkId, number>;
  for (const id of Object.keys(DRINKS) as DrinkId[]) {
    prices[id] = DRINKS[id].basePrice;
  }
  return prices;
}

export function createInitialUpgrades(): Record<UpgradeId, number> {
  return {
    machine: 0,
    grinder: 0,
    tables: 0,
    barista: 0,
    decor: 0,
    queue: 0,
    marketing: 0,
  };
}

export function createInitialState(seed: number = 12345, tutorial: boolean = true): GameState {
  const normalizedSeed = (seed >>> 0) || 12345;
  return {
    version: SAVE_VERSION,
    seed: normalizedSeed,
    rngState: normalizedSeed,
    phase: 'menu',
    paused: false,
    speed: 1,
    time: 0,
    day: 1,
    dayTime: 0,
    dayLength: BALANCE.dayLengthSec,
    clockMinutes: 480,
    money: BALANCE.startMoney,
    rating: BALANCE.startRating,
    combo: 0,
    rush: false,
    unlockedDrinks: [...STARTING_DRINKS],
    prices: createInitialPrices(),
    upgrades: createInitialUpgrades(),
    customers: [],
    queue: [],
    queueCapacity: BALANCE.baseQueueCapacity,
    orders: [],
    machines: createInitialMachines(BALANCE.baseMachines),
    seats: createInitialSeats(BALANCE.baseTables),
    baristas: [],
    dayStats: createInitialDayStats(1, BALANCE.startRating),
    history: [],
    goals: [],
    achievements: [],
    tutorial: {
      active: tutorial,
      step: 0,
      done: !tutorial,
    },
    bankruptStrikes: 0,
    lowRatingStrikes: 0,
    gameOverReason: null,
    nextId: 1,
    spawnTimer: 1.0,
    stats: {
      totalServed: 0,
      totalRevenue: 0,
      totalTips: 0,
      totalLost: 0,
      maxCombo: 0,
    },
  };
}
