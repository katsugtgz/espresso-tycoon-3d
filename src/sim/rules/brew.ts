// Layer 0: pure brew/serve target decisions — no EventBus, no mutation.
// Only: types. Operate on plain snap arrays.

import type { MachineSnap, OrderSnap } from '../../types';

/** Oldest pending order not yet claimed by a machine. */
export function oldestPendingOrder(orders: OrderSnap[]): OrderSnap | undefined {
  return orders.find((o) => o.status === 'pending' && o.machineId === null);
}

/** Oldest pending order of a specific drink. */
export function oldestPendingOrderFor(orders: OrderSnap[], drink: OrderSnap['drink']): OrderSnap | undefined {
  return orders.find((o) => o.status === 'pending' && o.drink === drink);
}

/** Any oldest pending order (claimed or not) — the one-click brew path. */
export function oldestPendingOrderAny(orders: OrderSnap[]): OrderSnap | undefined {
  return orders.find((o) => o.status === 'pending');
}

/** First idle machine (optionally restricted to ones a barista may claim). */
export function firstIdleMachine(
  machines: MachineSnap[],
  claimedBy?: number | null
): MachineSnap | undefined {
  return machines.find(
    (m) => m.status === 'idle' && (claimedBy === undefined || m.claimedBy === null || m.claimedBy === claimedBy)
  );
}

/** First ready machine (optionally restricted to ones a barista may claim). */
export function firstReadyMachine(
  machines: MachineSnap[],
  claimedBy?: number | null
): MachineSnap | undefined {
  return machines.find(
    (m) => m.status === 'ready' && (claimedBy === undefined || m.claimedBy === null || m.claimedBy === claimedBy)
  );
}
