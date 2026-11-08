import type { GameState, UpgradeId, DrinkId, ActionResult, OrderSnap, CustomerSnap } from '../types';
import type { EventBus } from '../core/events';
import type { GameEvents } from '../types';
import { UPGRADES, DRINKS, PRICE_MIN_MULT, PRICE_MAX_MULT, BALANCE, ACHIEVEMENTS } from '../config/balance';
import { LAYOUT, seatPositions } from '../config/layout';
import { createInitialDayStats } from './state';
import { generateGoals, evaluateDayEndGoals, checkAchievements } from './progression';
import { advanceTutorial } from './tutorial';
import { Rng } from '../core/rng';

export function getUpgradeCost(state: GameState, id: UpgradeId): number {
  const def = UPGRADES[id];
  if (!def) return Infinity;
  const currentLvl = state.upgrades[id] ?? 0;
  if (currentLvl >= def.maxLevel) return Infinity;
  return Math.round(def.baseCost * Math.pow(def.costMult, currentLvl));
}

export function buyUpgrade(state: GameState, bus: EventBus<GameEvents>, id: UpgradeId): ActionResult {
  const def = UPGRADES[id];
  if (!def) return { ok: false, reason: 'unknown_upgrade' };

  const currentLvl = state.upgrades[id] ?? 0;
  if (currentLvl >= def.maxLevel) return { ok: false, reason: 'max_level' };

  const cost = getUpgradeCost(state, id);
  if (state.money < cost) return { ok: false, reason: 'not_enough_money' };

  // Deduct cost
  state.money = Math.round((state.money - cost) * 100) / 100;
  state.dayStats.expenses = Math.round((state.dayStats.expenses + cost) * 100) / 100;
  state.upgrades[id] = currentLvl + 1;

  bus.emit('money:change', { money: state.money, delta: -cost, reason: 'upgrade' });

  // Apply upgrade effects
  switch (id) {
    case 'machine': {
      const slotIdx = state.machines.length;
      if (slotIdx < LAYOUT.machineSlots.length) {
        state.machines.push({
          id: slotIdx,
          status: 'idle',
          orderId: null,
          drink: null,
          progress: 0,
          brewTime: 0,
          claimedBy: null,
        });
      }
      break;
    }
    case 'tables': {
      // Each level adds 1 table (2 seats)
      const tableIdx = BALANCE.baseTables + state.upgrades.tables - 1;
      if (tableIdx < LAYOUT.tables.length) {
        const [p1, p2] = seatPositions(tableIdx);
        state.seats.push({
          id: state.seats.length,
          tableId: tableIdx,
          pos: { ...p1 },
          occupantId: null,
        });
        state.seats.push({
          id: state.seats.length,
          tableId: tableIdx,
          pos: { ...p2 },
          occupantId: null,
        });
      }
      break;
    }
    case 'queue': {
      state.queueCapacity = BALANCE.baseQueueCapacity + state.upgrades.queue * 2;
      break;
    }
    case 'barista': {
      const baristaId = state.baristas.length;
      const spot = LAYOUT.baristaSpots[baristaId % LAYOUT.baristaSpots.length];
      state.baristas.push({
        id: baristaId,
        pos: { ...spot },
        target: { ...spot },
        task: 'idle',
        machineId: null,
        cooldown: BALANCE.baristaReaction,
      });
      break;
    }
    case 'decor':
    case 'marketing':
    case 'grinder':
      // Effects applied dynamically in gameplay
      break;
  }

  bus.emit('upgrade:bought', { id, level: state.upgrades[id] });

  // Tutorial progression
  if (state.tutorial.active && state.tutorial.step === 4) {
    advanceTutorial(state, bus, 5);
  }

  checkAchievements(state, bus);

  return { ok: true };
}

export function unlockDrink(state: GameState, bus: EventBus<GameEvents>, drink: DrinkId): ActionResult {
  const def = DRINKS[drink];
  if (!def) return { ok: false, reason: 'unknown_drink' };
  if (state.unlockedDrinks.includes(drink)) return { ok: false, reason: 'already_unlocked' };
  if (state.money < def.unlockCost) return { ok: false, reason: 'not_enough_money' };

  state.money = Math.round((state.money - def.unlockCost) * 100) / 100;
  state.dayStats.expenses = Math.round((state.dayStats.expenses + def.unlockCost) * 100) / 100;
  state.unlockedDrinks.push(drink);

  bus.emit('money:change', { money: state.money, delta: -def.unlockCost, reason: 'drink_unlock' });
  bus.emit('drink:unlocked', { drink });

  checkAchievements(state, bus);

  return { ok: true };
}

export function setPrice(state: GameState, drink: DrinkId, price: number): ActionResult {
  const def = DRINKS[drink];
  if (!def) return { ok: false, reason: 'unknown_drink' };
  if (!Number.isFinite(price) || price <= 0) return { ok: false, reason: 'invalid_price' };

  const min = def.basePrice * PRICE_MIN_MULT;
  const max = def.basePrice * PRICE_MAX_MULT;
  const clamped = Math.min(max, Math.max(min, price));
  state.prices[drink] = Math.round(clamped * 100) / 100;

  return { ok: true };
}

export function calculateTip(
  order: OrderSnap,
  customer: CustomerSnap,
  combo: number,
  hasSeatingCapable: boolean
): number {
  const basePrice = order.price;
  const patienceRatio = Math.max(0, Math.min(1, customer.patience));
  const comboClamped = Math.min(BALANCE.comboCap, Math.max(0, combo));
  const comboBonus = comboClamped * BALANCE.comboTipBonus;

  // Base tip fraction
  let tipFraction = BALANCE.tipBase * patienceRatio + comboBonus;

  // Picky customers tip significantly more
  if (customer.kind === 'picky') {
    tipFraction *= 1.6;
  }

  // VIP customers tip generously
  if (customer.kind === 'vip') {
    tipFraction *= 1.4;
  }

  // Seated capable bonus (+15% tip)
  if (hasSeatingCapable) {
    tipFraction *= 1.15;
  }

  const tip = basePrice * tipFraction;
  return Math.round(Math.max(0, tip) * 100) / 100;
}

export function endDay(state: GameState, bus: EventBus<GameEvents>): void {
  // Clear any remaining customers / queues without penalty
  state.customers = [];
  state.queue = [];
  state.orders = [];
  for (const s of state.seats) {
    s.occupantId = null;
  }
  for (const m of state.machines) {
    m.status = 'idle';
    m.orderId = null;
    m.drink = null;
    m.progress = 0;
    m.brewTime = 0;
    m.claimedBy = null;
  }
  for (const b of state.baristas) {
    b.task = 'idle';
    b.machineId = null;
    b.cooldown = BALANCE.baristaReaction;
  }

  // Rent & Wages
  const rent = BALANCE.rentBase + BALANCE.rentPerDay * (state.day - 1);
  const wages = state.upgrades.barista * BALANCE.baristaWage;

  state.dayStats.rent = rent;
  state.dayStats.wages = wages;

  const totalDeductions = rent + wages;
  state.money = Math.round((state.money - totalDeductions) * 100) / 100;
  bus.emit('money:change', {
    money: state.money,
    delta: -totalDeductions,
    reason: 'rent_and_wages',
  });

  state.dayStats.profit = Math.round((
    state.dayStats.revenue +
    state.dayStats.tips -
    state.dayStats.expenses -
    rent -
    wages
  ) * 100) / 100;

  state.dayStats.ratingEnd = state.rating;

  // Evaluate day end goals
  evaluateDayEndGoals(state, bus);

  // Check achievements (e.g. perfect_day)
  if (state.dayStats.lost === 0 && state.dayStats.served >= 10) {
    if (!state.achievements.includes('perfect_day')) {
      const ach = ACHIEVEMENTS.find((a) => a.id === 'perfect_day');
      if (ach) {
        state.achievements.push(ach.id);
        bus.emit('achievement', { id: ach.id, name: ach.name, desc: ach.desc });
      }
    }
  }

  // Save history
  state.history.push(JSON.parse(JSON.stringify(state.dayStats)));

  // Bankrupt strikes check
  if (state.money < 0) {
    state.bankruptStrikes++;
    if (state.bankruptStrikes >= BALANCE.bankruptStrikesToLose) {
      state.phase = 'game_over';
      state.gameOverReason = `Bankrupt: negative balance for ${BALANCE.bankruptStrikesToLose} consecutive days.`;
      bus.emit('game:over', { reason: state.gameOverReason });
      return;
    } else {
      bus.emit('toast', {
        text: `Warning: Negative balance ($${state.money.toFixed(2)})! One more day of debt leads to closure.`,
        kind: 'bad',
      });
    }
  } else {
    state.bankruptStrikes = 0;
  }

  // Low rating strikes check
  if (state.rating < BALANCE.lowRatingThreshold) {
    state.lowRatingStrikes = (state.lowRatingStrikes ?? 0) + 1;
    if (state.lowRatingStrikes >= BALANCE.lowRatingStrikesToLose) {
      state.phase = 'game_over';
      state.gameOverReason = `Health & reputation closure: rating remained below ${BALANCE.lowRatingThreshold.toFixed(1)}★ for ${BALANCE.lowRatingStrikesToLose} consecutive days.`;
      bus.emit('game:over', { reason: state.gameOverReason });
      return;
    }
    bus.emit('toast', {
      text: `Critical rating (${state.rating.toFixed(1)}★)! Strike ${state.lowRatingStrikes}/${BALANCE.lowRatingStrikesToLose} before closure.`,
      kind: 'bad',
    });
  } else {
    state.lowRatingStrikes = 0;
    if (state.rating < 2.0) {
      bus.emit('toast', { text: 'Rating critically low (<2.0)! Customers avoiding cafe.', kind: 'bad' });
    }
  }

  state.phase = 'day_end';
  bus.emit('day:end', { stats: JSON.parse(JSON.stringify(state.dayStats)) });
}

export function startNextDay(state: GameState, bus: EventBus<GameEvents>, rng: Rng): ActionResult {
  if (state.phase !== 'day_end') return { ok: false, reason: 'not_day_end' };

  state.day++;
  state.dayTime = 0;
  state.clockMinutes = 480;
  state.rush = false;
  state.spawnTimer = 1.0;

  state.dayStats = createInitialDayStats(state.day, state.rating);
  state.goals = generateGoals(state.day, rng);

  state.phase = 'playing';
  bus.emit('day:start', { day: state.day });

  return { ok: true };
}
