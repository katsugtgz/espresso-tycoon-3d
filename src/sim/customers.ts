// Layer 1 — CUSTOMER ACTIONS (mutate state + emit).
// Pure math lives in rules/spawn.ts + rules/customers.ts + rules/tutorial.ts
// + rules/money.ts + rules/pricing.ts.
// Direction: customers -> rules/*, tutorial, state (snap reset). Never economy/stations/progression.

import type { GameState, GameEvents, CustomerSnap, DrinkId, OrderSnap } from '../types';
import type { EventBus } from '../core/events';
import type { Rng } from '../core/rng';
import { LAYOUT } from '../config/layout';
import { BALANCE } from '../config/balance';
import { forcedTutorialDrink, isPatiencePaused } from './rules/tutorial';
import { selectCustomerKind, patienceMaxFor, pickDrinkForOrder } from './rules/spawn';
import { stepToward, drainRateFor, tickPatience, seatedDurationFor } from './rules/customers';
import { priceFor, applyRatingPenalty } from './rules/pricing';
import { clampRating } from './rules/money';
import { reportTutorialEvent } from './tutorial';
import { resetMachine } from './state';

export function spawnCustomer(state: GameState, bus: EventBus<GameEvents>, rng: Rng): void {
  const id = state.nextId++;
  const kind = selectCustomerKind(state.day, rng);
  const variant = rng.int(0, 5);

  const patienceMax = patienceMaxFor(kind, state.upgrades.decor);

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
          resetMachine(machine);
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

  // Rating penalty (pure rule; clamp to rating floor)
  const applied = applyRatingPenalty(state.rating);
  state.rating = clampRating(applied.rating);
  bus.emit('rating:change', { rating: state.rating, delta: applied.delta });

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
  const isTutorialPatiencePaused = isPatiencePaused(state.tutorial.active, state.tutorial.step);
  const toRemoveIds = new Set<number>();

  for (let cIdx = 0; cIdx < state.customers.length; cIdx++) {
    const customer = state.customers[cIdx];
    customer.stateTime += dt;

    // Safety timeout: no customer stuck in non-seated state > 120s
    if (customer.state !== 'seated' && customer.state !== 'leaving' && customer.stateTime > 120) {
      handleCustomerTimeout(customer, state, bus);
    }

    // 1. Move toward target (pure motion rule)
    const moved = stepToward(customer.pos, customer.target, customer.facing, LAYOUT.walkSpeed, dt);
    customer.pos = moved.pos;
    customer.facing = moved.facing;
    const reached = moved.reached;

    // 2. Patience update (pure drain rule)
    if (!isTutorialPatiencePaused) {
      const drainRate = drainRateFor(customer.state, customer.patienceMax);

      if (drainRate > 0) {
        const tick = tickPatience(customer.patience, drainRate, dt);
        customer.patience = tick.patience;
        customer.mood = tick.mood;

        // Impatient emote trigger
        if (tick.impatient) {
          bus.emit('customer:emote', { id: customer.id, emote: 'impatient' });
        }

        // Timeout
        if (tick.timedOut) {
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
            const tutorialDrink = forcedTutorialDrink(
              state.tutorial.active,
              state.tutorial.step,
              state.stats.totalServed
            );
            if (tutorialDrink !== null) {
              drink = tutorialDrink;
            } else {
              drink = pickDrinkForOrder(state.unlockedDrinks, rng);
            }

            const price = priceFor(drink, state.prices);
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

            // Tutorial progression (event-driven: only step 0 advances on order_placed)
            reportTutorialEvent(state, bus, 'order_placed');
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
        // Seated duration based on customer id (pure rule)
        const seatedDuration = seatedDurationFor(customer.id);

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
