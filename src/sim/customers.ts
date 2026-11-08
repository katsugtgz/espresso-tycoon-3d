import type { GameState, CustomerSnap, CustomerKind, DrinkId, OrderSnap } from '../types';
import type { EventBus } from '../core/events';
import type { GameEvents } from '../types';
import { Rng } from '../core/rng';
import { LAYOUT } from '../config/layout';
import { BALANCE, DRINKS } from '../config/balance';
import { selectCustomerKind } from './progression';
import { advanceTutorial } from './tutorial';

function pickDrinkForOrder(unlocked: DrinkId[], rng: Rng): DrinkId {
  if (unlocked.length === 1) return unlocked[0];
  let totalWeight = 0;
  const weights: number[] = [];
  for (const d of unlocked) {
    const price = DRINKS[d]?.basePrice ?? 3;
    const w = 10 / Math.sqrt(price);
    weights.push(w);
    totalWeight += w;
  }
  let roll = rng.next() * totalWeight;
  for (let i = 0; i < unlocked.length; i++) {
    if (roll < weights[i]) return unlocked[i];
    roll -= weights[i];
  }
  return unlocked[0];
}

export function spawnCustomer(state: GameState, bus: EventBus<GameEvents>, rng: Rng): void {
  const id = state.nextId++;
  const kind = selectCustomerKind(state.day, rng);
  const variant = rng.int(0, 5);

  let patienceMax = BALANCE.basePatience * (1 + state.upgrades.decor * 0.05);
  if (kind === 'vip') patienceMax *= 0.7;
  else if (kind === 'picky') patienceMax *= 0.8;

  const customer: CustomerSnap = {
    id,
    kind,
    variant,
    state: 'entering',
    pos: { ...LAYOUT.spawn },
    target: { ...LAYOUT.door },
    facing: Math.PI,
    orderId: null,
    patience: 1.0,
    patienceMax,
    mood: 'happy',
    seatId: null,
    pickupSlot: null,
    stateTime: 0,
    angry: false,
  };

  state.customers.push(customer);
  bus.emit('customer:spawn', { id: customer.id, kind: customer.kind });
}

function handleCustomerTimeout(
  customer: CustomerSnap,
  state: GameState,
  bus: EventBus<GameEvents>
): void {
  // If order was placed, expire it and free machine if brewing
  if (customer.orderId !== null) {
    const orderIndex = state.orders.findIndex((o) => o.id === customer.orderId);
    if (orderIndex !== -1) {
      const order = state.orders[orderIndex];
      if (order.machineId !== null) {
        const machine = state.machines.find((m) => m.id === order.machineId);
        if (machine) {
          machine.status = 'idle';
          machine.orderId = null;
          machine.drink = null;
          machine.progress = 0;
          machine.brewTime = 0;
          machine.claimedBy = null;
        }
      }
      bus.emit('order:expired', {
        orderId: order.id,
        customerId: customer.id,
        drink: order.drink,
      });
      state.orders.splice(orderIndex, 1);
    }
    customer.orderId = null;
  }

  // Remove from queue if waiting in line
  const qIdx = state.queue.indexOf(customer.id);
  if (qIdx !== -1) {
    state.queue.splice(qIdx, 1);
  }

  // Free pickup slot
  customer.pickupSlot = null;

  // Free seat if somehow seated
  if (customer.seatId !== null) {
    const seat = state.seats.find((s) => s.id === customer.seatId);
    if (seat) seat.occupantId = null;
    customer.seatId = null;
  }

  customer.angry = true;
  customer.state = 'leaving';
  customer.target = { ...LAYOUT.door };
  customer.stateTime = 0;

  bus.emit('customer:emote', { id: customer.id, emote: 'angry' });

  // Rating penalty
  const newRating = Math.max(1.0, Math.round((state.rating - 0.08) * 100) / 100);
  const delta = Math.round((newRating - state.rating) * 100) / 100;
  state.rating = newRating;
  bus.emit('rating:change', { rating: state.rating, delta });

  // Combo break
  if (state.combo > 0) {
    bus.emit('combo:break', { lost: state.combo });
    state.combo = 0;
    bus.emit('combo:change', { combo: 0 });
  }

  state.dayStats.lost++;
  state.stats.totalLost++;
}

export function updateCustomers(
  state: GameState,
  bus: EventBus<GameEvents>,
  rng: Rng,
  dt: number
): void {
  const isTutorialPatiencePaused = state.tutorial.active && state.tutorial.step <= 3;
  const toRemoveIds = new Set<number>();

  for (let cIdx = 0; cIdx < state.customers.length; cIdx++) {
    const customer = state.customers[cIdx];
    customer.stateTime += dt;

    // Safety timeout: no customer stuck in non-seated state > 120s
    if (customer.state !== 'seated' && customer.state !== 'leaving' && customer.stateTime > 120) {
      handleCustomerTimeout(customer, state, bus);
    }

    // 1. Move toward target
    const dx = customer.target.x - customer.pos.x;
    const dz = customer.target.z - customer.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.001) {
      customer.facing = Math.atan2(dx, dz);
    }
    const moveStep = LAYOUT.walkSpeed * dt;
    const reached = dist <= moveStep;

    if (reached) {
      customer.pos.x = customer.target.x;
      customer.pos.z = customer.target.z;
    } else {
      customer.pos.x += (dx / dist) * moveStep;
      customer.pos.z += (dz / dist) * moveStep;
    }

    // 2. Patience update
    if (!isTutorialPatiencePaused) {
      let drainRate = 0;
      if (customer.state === 'queueing') {
        drainRate = 0.5 / customer.patienceMax;
      } else if (customer.state === 'ordering' || customer.state === 'waiting') {
        drainRate = 1.0 / customer.patienceMax;
      }

      if (drainRate > 0) {
        const prevPatience = customer.patience;
        customer.patience = Math.max(0, customer.patience - drainRate * dt);

        // Mood
        if (customer.patience > 0.6) customer.mood = 'happy';
        else if (customer.patience >= 0.35) customer.mood = 'neutral';
        else customer.mood = 'angry';

        // Impatient emote trigger
        if (prevPatience >= 0.35 && customer.patience < 0.35) {
          bus.emit('customer:emote', { id: customer.id, emote: 'impatient' });
        }

        // Timeout
        if (customer.patience <= 0) {
          handleCustomerTimeout(customer, state, bus);
          continue;
        }
      }
    }

    // 3. State machine transitions
    switch (customer.state) {
      case 'entering': {
        if (reached) {
          // Reached door -> check queue capacity
          if (state.queue.length < state.queueCapacity) {
            state.queue.push(customer.id);
            const qIdx = state.queue.length - 1;
            customer.state = 'queueing';
            customer.target = qIdx === 0
              ? { ...LAYOUT.register }
              : { ...(LAYOUT.queueSlots[qIdx] ?? LAYOUT.register) };
            customer.stateTime = 0;
          } else {
            // Queue full: leaves without penalty
            customer.state = 'leaving';
            customer.target = { ...LAYOUT.spawn };
            customer.angry = false;
            customer.stateTime = 0;
          }
        }
        break;
      }

      case 'queueing': {
        const qIdx = state.queue.indexOf(customer.id);
        if (qIdx === -1) {
          // Fallback if somehow lost from queue
          customer.state = 'leaving';
          customer.target = { ...LAYOUT.door };
          customer.stateTime = 0;
          break;
        }

        // Update target slot in queue
        const expectedTarget = qIdx === 0
          ? LAYOUT.register
          : (LAYOUT.queueSlots[qIdx] ?? LAYOUT.register);
        customer.target.x = expectedTarget.x;
        customer.target.z = expectedTarget.z;

        if (qIdx === 0 && reached) {
          customer.state = 'ordering';
          customer.stateTime = 0;
        }
        break;
      }

      case 'ordering': {
        // At register
        if (customer.orderId === null) {
          // Need to place order after orderDelay
          if (customer.stateTime >= BALANCE.orderDelay) {
            let drink: DrinkId;
            if (state.tutorial.active && state.tutorial.step <= 1 && state.stats.totalServed === 0) {
              drink = 'espresso';
            } else {
              drink = pickDrinkForOrder(state.unlockedDrinks, rng);
            }

            const price = state.prices[drink] ?? DRINKS[drink]?.basePrice ?? 3;
            const order: OrderSnap = {
              id: state.nextId++,
              customerId: customer.id,
              drink,
              status: 'pending',
              createdAt: state.time,
              price,
              machineId: null,
            };

            state.orders.push(order);
            customer.orderId = order.id;

            bus.emit('order:placed', {
              orderId: order.id,
              customerId: customer.id,
              drink,
            });

            // Tutorial progression
            if (state.tutorial.active && state.tutorial.step === 0) {
              advanceTutorial(state, bus, 1);
            }
          }
        } else {
          // Order placed; wait for an available pickup slot
          const occupiedSlots = new Set<number>();
          for (const c of state.customers) {
            if (c.pickupSlot !== null) occupiedSlots.add(c.pickupSlot);
          }

          let freeSlot = -1;
          for (let s = 0; s < LAYOUT.pickupSlots.length; s++) {
            if (!occupiedSlots.has(s)) {
              freeSlot = s;
              break;
            }
          }

          if (freeSlot !== -1) {
            customer.pickupSlot = freeSlot;
            customer.state = 'waiting';
            customer.target = { ...LAYOUT.pickupSlots[freeSlot] };
            customer.stateTime = 0;

            // Remove from queue line so next customer can step up
            const qIdx = state.queue.indexOf(customer.id);
            if (qIdx !== -1) {
              state.queue.splice(qIdx, 1);
            }
          }
        }
        break;
      }

      case 'waiting': {
        // Customer stands at pickup slot until served or patience runs out
        if (customer.pickupSlot !== null) {
          const slotPos = LAYOUT.pickupSlots[customer.pickupSlot];
          if (slotPos) {
            customer.target.x = slotPos.x;
            customer.target.z = slotPos.z;
          }
        }
        break;
      }

      case 'to_seat': {
        if (reached) {
          customer.state = 'seated';
          customer.stateTime = 0;
        }
        break;
      }

      case 'seated': {
        // Seated duration based on customer id
        const durationRange = BALANCE.seatedTime[1] - BALANCE.seatedTime[0];
        const seatedDuration = BALANCE.seatedTime[0] + ((customer.id * 17) % Math.max(1, durationRange));

        if (customer.stateTime >= seatedDuration) {
          if (customer.seatId !== null) {
            const seat = state.seats.find((s) => s.id === customer.seatId);
            if (seat) seat.occupantId = null;
            customer.seatId = null;
          }
          customer.state = 'leaving';
          customer.target = { ...LAYOUT.door };
          customer.stateTime = 0;
        }
        break;
      }

      case 'leaving': {
        if (reached) {
          const isAtDoor = Math.hypot(customer.pos.x - LAYOUT.door.x, customer.pos.z - LAYOUT.door.z) < 0.1;
          if (isAtDoor) {
            customer.target = { ...LAYOUT.spawn };
          } else {
            toRemoveIds.add(customer.id);
            bus.emit('customer:leave', { id: customer.id, angry: customer.angry });
          }
        }
        break;
      }
    }
  }

  // Remove departed customers
  if (toRemoveIds.size > 0) {
    state.customers = state.customers.filter((c) => !toRemoveIds.has(c.id));
  }
}
