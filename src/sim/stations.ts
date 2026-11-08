import type { GameState, DrinkId, StationId, ActionResult, OrderSnap, MachineSnap } from '../types';
import type { EventBus } from '../core/events';
import type { GameEvents } from '../types';
import { DRINKS, BALANCE } from '../config/balance';
import { LAYOUT } from '../config/layout';
import { calculateTip } from './economy';
import { advanceTutorial } from './tutorial';
import { updateGoalsProgress, checkAchievements } from './progression';

export function getBrewTime(state: GameState, drink: DrinkId): number {
  const basePrep = DRINKS[drink]?.prepTime ?? 3;
  const grinderSpeed = BALANCE.grinderSpeedPerLevel * (state.upgrades.grinder ?? 0);
  const mult = Math.max(0.2, 1 - grinderSpeed);
  return Math.max(0.5, basePrep * mult);
}

export function startBrewingOrder(
  state: GameState,
  bus: EventBus<GameEvents>,
  machine: MachineSnap,
  order: OrderSnap,
  byBarista: boolean = false
): ActionResult {
  const drinkDef = DRINKS[order.drink];
  if (!drinkDef) return { ok: false, reason: 'unknown_drink' };

  // Deduct ingredient cost
  const cost = drinkDef.ingredientCost;
  state.money = Math.round((state.money - cost) * 100) / 100;
  state.dayStats.expenses = Math.round((state.dayStats.expenses + cost) * 100) / 100;

  const machinePos = LAYOUT.machineSlots[machine.id] ?? LAYOUT.counter;
  bus.emit('money:change', {
    money: state.money,
    delta: -cost,
    reason: 'ingredients',
    pos: { ...machinePos },
  });

  const brewTime = getBrewTime(state, order.drink);
  machine.status = 'brewing';
  machine.orderId = order.id;
  machine.drink = order.drink;
  machine.progress = 0;
  machine.brewTime = brewTime;

  order.status = 'brewing';
  order.machineId = machine.id;

  bus.emit('brew:start', {
    machineId: machine.id,
    drink: order.drink,
    orderId: order.id,
    byBarista,
  });

  // Tutorial progression
  if (state.tutorial.active && state.tutorial.step === 1) {
    advanceTutorial(state, bus, 2);
  }

  return { ok: true };
}

export function serveMachine(
  state: GameState,
  bus: EventBus<GameEvents>,
  machineId: number,
  byBarista: boolean = false
): ActionResult {
  const machine = state.machines.find((m) => m.id === machineId);
  if (!machine || machine.status !== 'ready' || machine.orderId === null) {
    return { ok: false, reason: 'not_ready' };
  }

  const orderIndex = state.orders.findIndex((o) => o.id === machine.orderId);
  if (orderIndex === -1) {
    // Stale order; reset machine
    machine.status = 'idle';
    machine.orderId = null;
    machine.drink = null;
    machine.progress = 0;
    machine.brewTime = 0;
    machine.claimedBy = null;
    return { ok: false, reason: 'order_not_found' };
  }
  const order = state.orders[orderIndex];

  const customer = state.customers.find((c) => c.id === order.customerId);
  if (!customer) {
    // Customer already left
    state.orders.splice(orderIndex, 1);
    machine.status = 'idle';
    machine.orderId = null;
    machine.drink = null;
    machine.progress = 0;
    machine.brewTime = 0;
    machine.claimedBy = null;
    return { ok: false, reason: 'customer_left' };
  }

  // Calculate pricing & tip
  const isVip = customer.kind === 'vip';
  const priceMult = isVip ? 2 : 1;
  const revenue = Math.round(order.price * priceMult * 100) / 100;
  const hasSeats = state.seats.length > 0;
  const tip = calculateTip(order, customer, state.combo, hasSeats);
  const totalPaid = Math.round((revenue + tip) * 100) / 100;

  state.money = Math.round((state.money + totalPaid) * 100) / 100;
  state.dayStats.revenue = Math.round((state.dayStats.revenue + revenue) * 100) / 100;
  state.dayStats.tips = Math.round((state.dayStats.tips + tip) * 100) / 100;
  state.dayStats.served++;

  state.stats.totalServed++;
  state.stats.totalRevenue = Math.round((state.stats.totalRevenue + revenue) * 100) / 100;
  state.stats.totalTips = Math.round((state.stats.totalTips + tip) * 100) / 100;

  if (state.dayStats.timeToFirstSale === null) {
    state.dayStats.timeToFirstSale = Math.round(state.dayTime * 100) / 100;
  }

  // Combo
  state.combo++;
  if (state.combo > state.dayStats.bestCombo) {
    state.dayStats.bestCombo = state.combo;
  }
  if (state.combo > state.stats.maxCombo) {
    state.stats.maxCombo = state.combo;
  }
  bus.emit('combo:change', { combo: state.combo });

  // Rating boost: +0.02..0.05
  const ratingDelta = 0.02 + 0.03 * Math.max(0, Math.min(1, customer.patience));
  const ratingCeiling = Math.min(5.0, 3.5 + state.upgrades.decor * 0.2);
  if (state.rating < ratingCeiling) {
    const oldRating = state.rating;
    state.rating = Math.min(ratingCeiling, Math.round((state.rating + ratingDelta) * 100) / 100);
    const actualDelta = Math.round((state.rating - oldRating) * 100) / 100;
    if (actualDelta > 0) {
      bus.emit('rating:change', { rating: state.rating, delta: actualDelta });
    }
  }

  // Emits
  bus.emit('money:change', {
    money: state.money,
    delta: totalPaid,
    reason: 'sale',
    pos: { ...customer.pos },
  });

  bus.emit('order:served', {
    orderId: order.id,
    customerId: customer.id,
    drink: order.drink,
    price: revenue,
    tip,
    combo: state.combo,
    pos: { ...customer.pos },
    byBarista,
  });

  // Machine reset
  machine.status = 'idle';
  machine.orderId = null;
  machine.drink = null;
  machine.progress = 0;
  machine.brewTime = 0;
  machine.claimedBy = null;

  // Order completed
  state.orders.splice(orderIndex, 1);

  // Free pickup slot
  customer.pickupSlot = null;

  // Customer next step: seat or door
  const freeSeat = state.seats.find((s) => s.occupantId === null);
  if (freeSeat) {
    freeSeat.occupantId = customer.id;
    customer.seatId = freeSeat.id;
    customer.state = 'to_seat';
    customer.target = { ...freeSeat.pos };
    customer.stateTime = 0;
    bus.emit('customer:emote', { id: customer.id, emote: 'love' });
  } else {
    customer.state = 'leaving';
    customer.target = { ...LAYOUT.door };
    customer.stateTime = 0;
    bus.emit('customer:emote', { id: customer.id, emote: 'happy' });
  }

  // Tutorial check
  if (state.tutorial.active && state.tutorial.step === 3) {
    advanceTutorial(state, bus, 4);
  }

  updateGoalsProgress(state, bus);
  checkAchievements(state, bus);

  return { ok: true };
}

export function clickStation(
  state: GameState,
  bus: EventBus<GameEvents>,
  stationId: StationId
): ActionResult {
  if (stationId.startsWith('machine:')) {
    const rawId = stationId.split(':')[1];
    const machineId = parseInt(rawId, 10);
    const machine = state.machines.find((m) => m.id === machineId);
    if (!machine) return { ok: false, reason: 'invalid_station' };

    if (machine.status === 'idle') {
      // Find oldest pending order
      const pendingOrder = state.orders.find((o) => o.status === 'pending');
      if (!pendingOrder) return { ok: false, reason: 'no_order' };
      return startBrewingOrder(state, bus, machine, pendingOrder, false);
    }

    if (machine.status === 'brewing') {
      return { ok: false, reason: 'busy' };
    }

    if (machine.status === 'ready') {
      return serveMachine(state, bus, machine.id, false);
    }
  }

  if (stationId === 'counter' || stationId === 'register') {
    // Serve first ready machine
    const readyMachine = state.machines.find((m) => m.status === 'ready');
    if (!readyMachine) return { ok: false, reason: 'no_ready_machine' };
    return serveMachine(state, bus, readyMachine.id, false);
  }

  if (stationId === 'grinder') {
    return { ok: true };
  }

  if (stationId.startsWith('table:')) {
    const rawIdx = stationId.split(':')[1];
    const tIdx = parseInt(rawIdx, 10);
    if (Number.isInteger(tIdx) && tIdx >= 0 && tIdx < Math.floor(state.seats.length / 2)) {
      return { ok: true };
    }
  }

  return { ok: false, reason: 'invalid_station' };
}

export function brewDrink(state: GameState, bus: EventBus<GameEvents>, drink: DrinkId): ActionResult {
  const pendingOrder = state.orders.find((o) => o.status === 'pending' && o.drink === drink);
  if (!pendingOrder) return { ok: false, reason: 'no_order' };

  const idleMachine = state.machines.find((m) => m.status === 'idle');
  if (!idleMachine) return { ok: false, reason: 'no_machine' };

  return startBrewingOrder(state, bus, idleMachine, pendingOrder, false);
}

export function updateMachines(state: GameState, bus: EventBus<GameEvents>, dt: number): void {
  for (const machine of state.machines) {
    if (machine.status === 'brewing') {
      machine.progress += dt / Math.max(0.1, machine.brewTime);
      if (machine.progress >= 1) {
        machine.progress = 1;
        machine.status = 'ready';

        const order = state.orders.find((o) => o.id === machine.orderId);
        if (order) {
          order.status = 'ready';
        }

        bus.emit('brew:done', {
          machineId: machine.id,
          drink: machine.drink!,
          orderId: machine.orderId!,
        });

        // Tutorial check
        if (state.tutorial.active && state.tutorial.step === 2) {
          advanceTutorial(state, bus, 3);
        }
      }
    }
  }
}
