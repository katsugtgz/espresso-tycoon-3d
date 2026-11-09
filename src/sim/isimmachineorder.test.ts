import { Simulation } from './Simulation';
import { EventBus } from '../core/events';
import { SAVE_VERSION } from '../config/balance';
import type { GameEvents, GameState } from '../types';

// Tracer: the ISim module owns machine_order_missing at its load seam.
// A dangling machine.orderId must not survive load(); it is repaired to
// idle so dispatch/advanceTime can never observe machine_order_missing.
function check(cond: boolean, message: string): void {
  if (!cond) {
    throw new Error(`isimmachineorder: ${message}`);
  }
}

function dirtyState(): GameState {
  const setup = new Simulation(new EventBus<GameEvents>());
  setup.dispatch({ type: 'newGame', seed: 42, tutorial: false });
  const s = setup.serialize();
  s.orders = [];
  s.customers = [];
  s.queue = [];
  s.machines[0].status = 'brewing';
  s.machines[0].orderId = 9999; // no such order
  s.machines[0].drink = 'espresso';
  s.machines[0].progress = 0.3;
  s.machines[0].brewTime = 3;
  s.machines[0].claimedBy = null;
  s.version = SAVE_VERSION;
  return s;
}

function hasDanglingMachineOrder(s: GameState): boolean {
  const orderIds = new Set(s.orders.map((o) => o.id));
  return s.machines.some((m) => m.orderId !== null && !orderIds.has(m.orderId));
}

const dirty = dirtyState();
check(dirty.orders.length === 0, 'fixture needs zero orders');
check(hasDanglingMachineOrder(dirty), 'fixture needs a dangling machine.orderId (orderId 9999, orders [])');

const sim = new Simulation(new EventBus<GameEvents>());
check(sim.load(dirty), 'load accepts versioned save');

const s = sim.serialize();
check(!hasDanglingMachineOrder(s), 'machine_order_missing visible through ISim after load');
check(s.machines[0].status === 'idle', 'dangling machine repaired to idle');
check(s.machines[0].orderId === null, 'dangling machine orderId cleared');
check(s.machines[0].drink === null, 'dangling machine drink cleared');
check(s.machines[0].progress === 0, 'dangling machine progress cleared');
check(s.machines[0].brewTime === 0, 'dangling machine brewTime cleared');

sim.dispatch({ type: 'brew', drink: 'espresso' }); // no orders -> no_order, must not crash
sim.advanceTime(5);
check(!hasDanglingMachineOrder(sim.serialize()), 'machine_order_missing visible through ISim after advanceTime');

// Missing orders: the load seam must still repair dangling machines —
// a missing orders list means every machine.orderId dangles.
const missingOrders = dirtyState() as unknown as Record<string, unknown>;
delete missingOrders.orders;
const simMissing = new Simulation(new EventBus<GameEvents>());
check(simMissing.load(missingOrders), 'load accepts save with missing orders');
const sm = simMissing.serialize();
check(sm.machines[0].status === 'idle', 'missing orders: dangling machine repaired to idle');
check(sm.machines[0].orderId === null, 'missing orders: dangling machine orderId cleared');

// Malformed orders: same repair, treating the list as empty.
const malformedOrders = dirtyState() as unknown as Record<string, unknown>;
malformedOrders.orders = 'nope';
const simMalformed = new Simulation(new EventBus<GameEvents>());
check(simMalformed.load(malformedOrders), 'load accepts save with malformed orders');
const sw = simMalformed.serialize();
check(sw.machines[0].status === 'idle', 'malformed orders: dangling machine repaired to idle');
check(sw.machines[0].orderId === null, 'malformed orders: dangling machine orderId cleared');

// Malformed machine entry: machines [null] must not throw. A non-object
// machine snap cannot be repaired without inventing a slot-indexed snap,
// so the seam-consistent behavior is to reject the save (load -> false),
// matching how corrupted data is rejected elsewhere at this seam.
const nullMachine = dirtyState() as unknown as Record<string, unknown>;
nullMachine.machines = [null];
const simNullMachine = new Simulation(new EventBus<GameEvents>());
let nullMachineThrew = false;
let nullMachineLoaded = true;
try {
  nullMachineLoaded = simNullMachine.load(nullMachine);
} catch {
  nullMachineThrew = true;
}
check(!nullMachineThrew, 'machines [null]: load must not throw');
check(nullMachineLoaded === false, 'machines [null]: load rejects non-object machine entries');

// P1: non-object order entries are rejected at the load seam — a null entry
// would crash sim/HUD next frame, and silently dropping it would rewrite
// order indexing, so migrate() returns null (load -> false) like other
// corrupted data at this seam.
const nullOrderEntry = dirtyState() as unknown as Record<string, unknown>;
nullOrderEntry.orders = [null];
const simNullOrder = new Simulation(new EventBus<GameEvents>());
let nullOrderThrew = false;
let nullOrderLoaded = true;
try {
  nullOrderLoaded = simNullOrder.load(nullOrderEntry);
} catch {
  nullOrderThrew = true;
}
check(!nullOrderThrew, 'orders [null]: load must not throw');
check(nullOrderLoaded === false, 'orders [null]: load rejects non-object order entries');

// P2: an order object without a numeric id confers no membership — a machine
// with a missing orderId must still be repaired to idle, not stay brewing
// on an undefined === undefined match.
const noIdOrder = dirtyState() as unknown as Record<string, unknown>;
noIdOrder.orders = [{}];
const noIdMachines = noIdOrder.machines as Array<Record<string, unknown>>;
noIdMachines[0].status = 'brewing';
noIdMachines[0].orderId = undefined;
const simNoId = new Simulation(new EventBus<GameEvents>());
check(simNoId.load(noIdOrder), 'load accepts save with id-less order object');
const si = simNoId.serialize();
check(si.machines[0].status === 'idle', 'id-less order: machine with missing orderId repaired to idle');
check(si.machines[0].orderId === null, 'id-less order: missing orderId cleared to null');

console.log('ok: ISim load owns machine_order_missing');
