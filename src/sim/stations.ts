// Layer 1 — STATION ACTIONS (mutate state + emit).
// Pure math lives in rules/pricing.ts + rules/brew.ts + rules/money.ts.
// Direction: stations -> rules/*, progression, tutorial. Never economy/customers.
import type { GameState, DrinkId, StationId, StationIntent, ActionResult, OrderSnap, MachineSnap } from '../types';

import type { EventBus } from '../core/events';
import type { GameEvents } from '../types';
import { DRINKS } from '../config/balance';
import { LAYOUT } from '../config/layout';
import { updateGoalsProgress, checkAchievements } from './progression';
import {
  brewTimeFor,
  tipFor,
  revenueFor,
  totalFor,
  ratingDeltaFor,
  ratingCeilingFor,
  applyRatingGain,
} from './rules/pricing';
import { oldestPendingOrderAny, oldestPendingOrderFor, firstIdleMachine } from './rules/brew';
import { round2 } from './rules/money';
import { reportTutorialEvent } from './tutorial';

export function getBrewTime(state: GameState, drink: DrinkId): number {
  return brewTimeFor(drink, state.upgrades.grinder ?? 0);
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
  state.money = round2(state.money - cost);
  state.dayStats.expenses = round2(state.dayStats.expenses + cost);

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

  // Tutorial progression (event-driven: only step 1 advances on brew_started)
  reportTutorialEvent(state, bus, 'brew_started');

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

  // Calculate pricing & tip (pure rules)
  const isVip = customer.kind === 'vip';
  const revenue = revenueFor(order.price, isVip);
  const hasSeats = state.seats.length > 0;
  const tip = tipFor({
    basePrice: order.price,
    patience: customer.patience,
    combo: state.combo,
    kind: customer.kind,
    hasSeating: hasSeats,
  });
  const totalPaid = totalFor(revenue, tip);

  state.money = round2(state.money + totalPaid);
  state.dayStats.revenue = round2(state.dayStats.revenue + revenue);
  state.dayStats.tips = round2(state.dayStats.tips + tip);
  state.dayStats.served++;

  state.stats.totalServed++;
  state.stats.totalRevenue = round2(state.stats.totalRevenue + revenue);
  state.stats.totalTips = round2(state.stats.totalTips + tip);

  if (state.dayStats.timeToFirstSale === null) {
    state.dayStats.timeToFirstSale = round2(state.dayTime);
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

  // Rating boost
  const ratingDelta = ratingDeltaFor(customer.patience);
  const ratingCeiling = ratingCeilingFor(state.upgrades.decor);
  const applied = applyRatingGain(state.rating, ratingDelta, ratingCeiling);
  state.rating = applied.rating;
  if (applied.actualDelta > 0) {
    bus.emit('rating:change', { rating: state.rating, delta: applied.actualDelta });
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

  // Tutorial progression (event-driven: only step 3 advances on order_served)
  reportTutorialEvent(state, bus, 'order_served');

  updateGoalsProgress(state, bus);
  checkAchievements(state, bus);

  return { ok: true };
}
/**
 * Parse a StationId string into a typed intent. Null means "not a
 * well-formed station shape" (unknown prefix or non-string input).
 * Existence/range checks (unknown machine id, out-of-range table index)
 * stay in clickStationIntent, next to the branch ordering they belong to.
 */
export function parseStationId(stationId: StationId): StationIntent | null {
  if (typeof stationId !== 'string') return null;
  if (stationId === 'counter') return { kind: 'counter' };
  if (stationId === 'register') return { kind: 'register' };
  if (stationId === 'grinder') return { kind: 'grinder' };
  if (stationId.startsWith('machine:')) {
    return { kind: 'machine', id: parseInt(stationId.split(':')[1], 10) };
  }
  if (stationId.startsWith('table:')) {
    return { kind: 'table', index: parseInt(stationId.split(':')[1], 10) };
  }
  return null;
}

/**
 * Typed station intent: ordering over intents lives here, inside the sim
 * module. String StationId parsing moves inward via parseStationId (above);
 * the string-accepting clickStation edge delegates here so every click site
 * flows through one ordering.
 */
export function clickStationIntent(
  state: GameState,
  bus: EventBus<GameEvents>,
  intent: StationIntent,
): ActionResult {
  if (intent.kind === 'machine') {
    const machine = state.machines.find((m) => m.id === intent.id);
    if (!machine) return { ok: false, reason: 'invalid_station' };
    if (machine.status === 'idle') {
      const pendingOrder = oldestPendingOrderAny(state.orders);
      if (!pendingOrder) return { ok: false, reason: 'no_order' };
      return startBrewingOrder(state, bus, machine, pendingOrder, false);
    }
    if (machine.status === 'brewing') {
      return { ok: false, reason: 'busy' };
    }
    if (machine.status === 'ready') {
      return serveMachine(state, bus, machine.id, false);
    }
    return { ok: false, reason: 'unhandled_intent' };
  }
  if (intent.kind === 'counter' || intent.kind === 'register') {
    const readyMachine = state.machines.find((m) => m.status === 'ready');
    if (!readyMachine) return { ok: false, reason: 'no_ready_machine' };
    return serveMachine(state, bus, readyMachine.id, false);
  }
  if (intent.kind === 'grinder') {
    return { ok: true };
  }
  if (intent.kind === 'table') {
    if (Number.isInteger(intent.index) && intent.index >= 0 && intent.index < Math.floor(state.seats.length / 2)) {
      return { ok: true };
    }
    return { ok: false, reason: 'invalid_station' };
  }
  return { ok: false, reason: 'unhandled_intent' };
}


export function clickStation(
  state: GameState,
  bus: EventBus<GameEvents>,
  stationId: StationId
): ActionResult {
  // Thin string edge: parsing + ordering live in parseStationId /
  // clickStationIntent above. This keeps every existing caller working
  // while the parsing depth moves inside the sim module.
  const intent = parseStationId(stationId);
  if (!intent) return { ok: false, reason: 'invalid_station' };
  return clickStationIntent(state, bus, intent);
}

export function brewDrink(state: GameState, bus: EventBus<GameEvents>, drink: DrinkId): ActionResult {
  const pendingOrder = oldestPendingOrderFor(state.orders, drink);
  if (!pendingOrder) return { ok: false, reason: 'no_order' };

  const idleMachine = firstIdleMachine(state.machines);
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

        // Tutorial progression (event-driven: only step 2 advances on brew_done)
        reportTutorialEvent(state, bus, 'brew_done');
      }
    }
  }
}
