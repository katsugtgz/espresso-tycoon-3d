import type { GameState, UpgradeId, DrinkId, ActionResult } from '../types';
import type { EventBus } from '../core/events';
import type { GameEvents } from '../types';
import { UPGRADES, DRINKS, BALANCE, ACHIEVEMENTS } from '../config/balance';
import { LAYOUT, seatPositions } from '../config/layout';
import { createInitialDayStats, resetMachine } from './state';
import { evaluateDayEndGoals, checkAchievements } from './progression';
import { generateGoals, rentFor, wagesFor, profitFor } from './rules/goals';
import { upgradeCostFor, clampPriceFor } from './rules/pricing';
import { round2 } from './rules/money';
import { reportTutorialEvent } from './tutorial';
import { Rng } from '../core/rng';

export function getUpgradeCost(state: GameState, id: UpgradeId): number {
  return upgradeCostFor(id, state.upgrades[id] ?? 0);
}

export function buyUpgrade(state: GameState, bus: EventBus<GameEvents>, id: UpgradeId): ActionResult {
  const def = UPGRADES[id];
  if (!def) return { ok: false, reason: 'unknown_upgrade' };

  const currentLvl = state.upgrades[id] ?? 0;
  if (currentLvl >= def.maxLevel) return { ok: false, reason: 'max_level' };

  const cost = getUpgradeCost(state, id);
  if (state.money < cost) return { ok: false, reason: 'not_enough_money' };

  // Deduct cost
  state.money = round2(state.money - cost);
  state.dayStats.expenses = round2(state.dayStats.expenses + cost);
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

  // Tutorial progression (event-driven: only step 4 advances on upgrade_bought)
  reportTutorialEvent(state, bus, 'upgrade_bought');

  checkAchievements(state, bus);

  return { ok: true };
}

export function unlockDrink(state: GameState, bus: EventBus<GameEvents>, drink: DrinkId): ActionResult {
  const def = DRINKS[drink];
  if (!def) return { ok: false, reason: 'unknown_drink' };
  if (state.unlockedDrinks.includes(drink)) return { ok: false, reason: 'already_unlocked' };
  if (state.money < def.unlockCost) return { ok: false, reason: 'not_enough_money' };

  state.money = round2(state.money - def.unlockCost);
  state.dayStats.expenses = round2(state.dayStats.expenses + def.unlockCost);
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

  state.prices[drink] = clampPriceFor(drink, price);

  return { ok: true };
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
    resetMachine(m);
  }
  for (const b of state.baristas) {
    b.task = 'idle';
    b.machineId = null;
    b.cooldown = BALANCE.baristaReaction;
  }

  // Rent & Wages
  const rent = rentFor(state.day);
  const wages = wagesFor(state.upgrades.barista);

  state.dayStats.rent = rent;
  state.dayStats.wages = wages;

  const totalDeductions = rent + wages;
  state.money = round2(state.money - totalDeductions);
  bus.emit('money:change', {
    money: state.money,
    delta: -totalDeductions,
    reason: 'rent_and_wages',
  });

  state.dayStats.profit = round2(profitFor(
    state.dayStats.revenue,
    state.dayStats.tips,
    state.dayStats.expenses,
    rent,
    wages
  ));

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
