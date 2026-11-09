// Typed station-intent seam tests (Candidate 2).
// Driven through the public sim module seam: Simulation.dispatch with typed
// GameAction inputs; assertions on ActionResult literals + public ISim state.
// Run: npx tsx --test tests/station-intent.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/Simulation';
import { EventBus } from '../src/core/events';
import type { DrinkId, GameEvents, OrderStatus, StationIntent } from '../src/types';

function setup(): Simulation {
  const bus = new EventBus<GameEvents>();
  const sim = new Simulation(bus);
  const started = sim.dispatch({ type: 'newGame', seed: 42, tutorial: false });
  assert.equal(started.ok, true);
  return sim;
}

function addOrder(
  sim: Simulation,
  opts: { drink?: DrinkId; status?: OrderStatus; machineId?: number | null } = {},
): { orderId: number; customerId: number } {
  const drink = opts.drink ?? 'espresso';
  const status = opts.status ?? 'pending';
  const machineId = opts.machineId ?? null;
  const orderId = sim.state.nextId++;
  const customerId = sim.state.nextId++;
  sim.state.customers.push({
    id: customerId,
    kind: 'regular',
    variant: 0,
    state: 'waiting',
    pos: { x: 0, z: 0 },
    target: { x: 0, z: 0 },
    facing: 0,
    orderId,
    patience: 1,
    patienceMax: 45,
    mood: 'happy',
    seatId: null,
    pickupSlot: null,
    stateTime: 0,
    angry: false,
  });
  sim.state.orders.push({
    id: orderId, customerId, drink, status, createdAt: 0, price: 3, machineId,
  });
  return { orderId, customerId };
}

function machineIntent(id: number): StationIntent {
  return { kind: 'machine', id };
}

test('slice 1: machine intent on idle machine with pending order starts brewing', () => {
  const sim = setup();
  const { orderId } = addOrder(sim);
  const res = sim.dispatch({ type: 'clickStationIntent', intent: machineIntent(0) });
  assert.equal(res.ok, true);
  assert.equal(sim.state.machines[0].status, 'brewing');
  assert.equal(sim.state.machines[0].orderId, orderId);
  assert.equal(sim.state.orders.find((o) => o.id === orderId)?.status, 'brewing');
});

test('slice 2: machine intent on brewing machine is busy', () => {
  const sim = setup();
  addOrder(sim);
  const first = sim.dispatch({ type: 'clickStationIntent', intent: machineIntent(0) });
  assert.equal(first.ok, true);
  const res = sim.dispatch({ type: 'clickStationIntent', intent: machineIntent(0) });
  assert.deepEqual(res, { ok: false, reason: 'busy' });
  assert.equal(sim.state.machines[0].status, 'brewing');
});

test('slice 3: machine intent on ready machine serves the order', () => {
  const sim = setup();
  const { customerId, orderId } = addOrder(sim);
  const first = sim.dispatch({ type: 'clickStationIntent', intent: machineIntent(0) });
  assert.equal(first.ok, true);
  const order = sim.state.orders.find((o) => o.id === orderId);
  assert.ok(order);
  // Emulate the brew finishing without advancing sim time (avoids spawns/day-end).
  const machine = sim.state.machines[0];
  machine.status = 'ready';
  machine.progress = 1;
  order.status = 'ready';
  machine.orderId = orderId;
  machine.drink = order.drink;
  order.machineId = machine.id;
  const moneyBefore = sim.state.money;
  const res = sim.dispatch({ type: 'clickStationIntent', intent: machineIntent(0) });
  assert.deepEqual(res, { ok: true });
  assert.equal(machine.status, 'idle');
  assert.equal(machine.orderId, null);
  assert.equal(sim.state.orders.find((o) => o.id === orderId), undefined);
  assert.ok(sim.state.money > moneyBefore);
  assert.equal(sim.state.customers.find((c) => c.id === customerId)?.orderId, orderId);
});

test('slice 4: register intent serves the first ready machine', () => {
  const sim = setup();
  const { orderId } = addOrder(sim);
  assert.equal(sim.dispatch({ type: 'clickStationIntent', intent: machineIntent(0) }).ok, true);
  const order = sim.state.orders.find((o) => o.id === orderId);
  assert.ok(order);
  const machine = sim.state.machines[0];
  machine.status = 'ready';
  machine.progress = 1;
  order.status = 'ready';
  machine.orderId = orderId;
  machine.drink = order.drink;
  order.machineId = machine.id;
  const res = sim.dispatch({ type: 'clickStationIntent', intent: { kind: 'register' } });
  assert.deepEqual(res, { ok: true });
  assert.equal(machine.status, 'idle');
  assert.equal(sim.state.orders.find((o) => o.id === orderId), undefined);
});

test('slice 4b: counter intent serves the first ready machine', () => {
  const sim = setup();
  const { orderId } = addOrder(sim);
  assert.equal(sim.dispatch({ type: 'clickStationIntent', intent: machineIntent(0) }).ok, true);
  const order = sim.state.orders.find((o) => o.id === orderId);
  assert.ok(order);
  const machine = sim.state.machines[0];
  machine.status = 'ready';
  machine.progress = 1;
  order.status = 'ready';
  machine.orderId = orderId;
  machine.drink = order.drink;
  order.machineId = machine.id;
  const res = sim.dispatch({ type: 'clickStationIntent', intent: { kind: 'counter' } });
  assert.deepEqual(res, { ok: true });
  assert.equal(machine.status, 'idle');
  assert.equal(sim.state.orders.find((o) => o.id === orderId), undefined);
});

test('slice 5: unknown machine id is invalid_station', () => {
  const sim = setup();
  addOrder(sim);
  const res = sim.dispatch({ type: 'clickStationIntent', intent: machineIntent(99) });
  assert.deepEqual(res, { ok: false, reason: 'invalid_station' });
});

test('slice 5b: idle machine with no pending order is no_order', () => {
  const sim = setup();
  const res = sim.dispatch({ type: 'clickStationIntent', intent: machineIntent(0) });
  assert.deepEqual(res, { ok: false, reason: 'no_order' });
  assert.equal(sim.state.machines[0].status, 'idle');
});

test('slice 5c: counter with nothing ready is no_ready_machine', () => {
  const sim = setup();
  addOrder(sim);
  const res = sim.dispatch({ type: 'clickStationIntent', intent: { kind: 'counter' } });
  assert.deepEqual(res, { ok: false, reason: 'no_ready_machine' });
});

test('slice 5d: grinder intent is a no-op ok', () => {
  const sim = setup();
  const before = sim.serialize();
  const res = sim.dispatch({ type: 'clickStationIntent', intent: { kind: 'grinder' } });
  assert.deepEqual(res, { ok: true });
  assert.deepEqual(sim.serialize(), before);
});

test('slice 5e: table intent validates the table index', () => {
  const sim = setup();
  const tableCount = Math.floor(sim.state.seats.length / 2);
  assert.ok(tableCount > 0);
  assert.deepEqual(sim.dispatch({ type: 'clickStationIntent', intent: { kind: 'table', index: 0 } }), { ok: true });
  assert.deepEqual(
    sim.dispatch({ type: 'clickStationIntent', intent: { kind: 'table', index: tableCount } }),
    { ok: false, reason: 'invalid_station' },
  );
});

test('adapter: string edge delegates to the same ordering as intents', () => {
  const viaString = setup();
  const viaIntent = setup();
  addOrder(viaString);
  addOrder(viaIntent);
  // idle -> brew
  assert.deepEqual(
    viaString.dispatch({ type: 'clickStation', stationId: 'machine:0' }),
    viaIntent.dispatch({ type: 'clickStationIntent', intent: machineIntent(0) }),
  );
  assert.equal(viaString.state.machines[0].status, viaIntent.state.machines[0].status);
  // brewing -> busy
  assert.deepEqual(
    viaString.dispatch({ type: 'clickStation', stationId: 'machine:0' }),
    viaIntent.dispatch({ type: 'clickStationIntent', intent: machineIntent(0) }),
  );
  // unknown string -> invalid_station
  assert.deepEqual(
    viaString.dispatch({ type: 'clickStation', stationId: 'nonexistent' }),
    { ok: false, reason: 'invalid_station' },
  );
  assert.deepEqual(
    viaString.dispatch({ type: 'clickStation', stationId: 'machine:99' }),
    { ok: false, reason: 'invalid_station' },
  );
});

test('adapter: legacy odd strings keep legacy parse results', () => {
  const sim = setup();
  addOrder(sim);
  // parseInt prefix tolerance preserved: 'machine:1x' parses to 1 -> unknown id
  assert.deepEqual(
    sim.dispatch({ type: 'clickStation', stationId: 'machine:1x' }),
    { ok: false, reason: 'invalid_station' },
  );
  // garbage after prefix with idle machine 0 present: NaN id -> invalid_station
  assert.deepEqual(
    sim.dispatch({ type: 'clickStation', stationId: 'machine:' }),
    { ok: false, reason: 'invalid_station' },
  );
});
