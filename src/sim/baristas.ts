import type { GameState } from '../types';
import type { EventBus } from '../core/events';
import type { GameEvents } from '../types';
import { LAYOUT } from '../config/layout';
import { BALANCE } from '../config/balance';
import { startBrewingOrder, serveMachine } from './stations';

export function updateBaristas(state: GameState, bus: EventBus<GameEvents>, dt: number): void {
  for (const barista of state.baristas) {
    // 1. Move toward target
    const dx = barista.target.x - barista.pos.x;
    const dz = barista.target.z - barista.pos.z;
    const dist = Math.hypot(dx, dz);
    const step = LAYOUT.baristaSpeed * dt;
    if (dist <= step) {
      barista.pos.x = barista.target.x;
      barista.pos.z = barista.target.z;
    } else {
      barista.pos.x += (dx / dist) * step;
      barista.pos.z += (dz / dist) * step;
    }

    // 2. Cooldown
    barista.cooldown -= dt;
    if (barista.cooldown > 0) continue;

    // 3. Action priority 1: Serve ready machines
    const readyMachine = state.machines.find(
      (m) => m.status === 'ready' && (m.claimedBy === null || m.claimedBy === barista.id)
    );

    if (readyMachine) {
      const machinePos = LAYOUT.machineSlots[readyMachine.id] ?? LAYOUT.counter;
      barista.target = { ...machinePos };
      barista.pos = { ...machinePos };
      barista.task = 'serving';
      barista.machineId = readyMachine.id;
      readyMachine.claimedBy = barista.id;

      serveMachine(state, bus, readyMachine.id, true);
      barista.cooldown = BALANCE.baristaReaction;
      continue;
    }

    // 4. Action priority 2: Start brewing pending orders on idle machines
    const idleMachine = state.machines.find(
      (m) => m.status === 'idle' && (m.claimedBy === null || m.claimedBy === barista.id)
    );

    if (idleMachine) {
      // Find oldest pending order not already claimed by a machine
      const pendingOrder = state.orders.find(
        (o) => o.status === 'pending' && o.machineId === null
      );

      if (pendingOrder) {
        const machinePos = LAYOUT.machineSlots[idleMachine.id] ?? LAYOUT.counter;
        barista.target = { ...machinePos };
        barista.pos = { ...machinePos };
        barista.task = 'brewing';
        barista.machineId = idleMachine.id;
        idleMachine.claimedBy = barista.id;

        startBrewingOrder(state, bus, idleMachine, pendingOrder, true);
        barista.cooldown = BALANCE.baristaReaction;
        continue;
      }
    }

    // 5. Idle: return home
    const homeSpot = LAYOUT.baristaSpots[barista.id % LAYOUT.baristaSpots.length];
    barista.target = { ...homeSpot };
    barista.task = 'idle';
    barista.machineId = null;
    barista.cooldown = 0.5; // check back soon
  }
}
