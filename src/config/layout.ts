import type { Vec2 } from '../types';

/**
 * Shared world layout (sim + renderer agree on these). Units = meters.
 * Room interior x∈[-10,10], z∈[-8,8]. Front wall z=8 (cutaway, camera side), door gap at x≈5.
 * Counter runs along z=-3.5 from x=-8 to x=2. Staff area behind (z<-3.5).
 */
export const LAYOUT = {
  room: { minX: -10, maxX: 10, minZ: -8, maxZ: 8, wallHeight: 3.2 },
  /** entity bounds check (includes sidewalk outside door) */
  bounds: { minX: -10.5, maxX: 10.5, minZ: -8.5, maxZ: 11 },
  spawn: { x: 5, z: 10.5 } as Vec2,
  door: { x: 5, z: 8 } as Vec2,
  counter: { minX: -8, maxX: 2, z: -3.5, depth: 0.9, height: 1.05 },
  /** customer stands here to order (queue[0]) */
  register: { x: 1, z: -2.5 } as Vec2,
  /** register/cash object on counter */
  registerObj: { x: 1, z: -3.5 } as Vec2,
  /** queue slot i (i=0 is right behind register). length >= max queueCapacity (10) */
  queueSlots: Array.from({ length: 10 }, (_, i) => ({ x: 1 + (i >= 6 ? 1.2 : 0), z: -1.4 + (i >= 6 ? 6 - (i - 6) : i) * 1.1 })) as Vec2[],
  /** waiting-for-drink spots along counter front */
  pickupSlots: [-0.6, -1.8, -3.0, -4.2, -5.4, -6.6].map((x) => ({ x, z: -2.5 })) as Vec2[],
  /** espresso machine slots on back counter (machine id == slot index). max 4 machines */
  machineSlots: [-6.5, -4.5, -2.5, -0.5].map((x) => ({ x, z: -5.6 })) as Vec2[],
  backCounter: { minX: -8, maxX: 2, z: -5.6, depth: 0.8, height: 1.0 },
  grinder: { x: 1.2, z: -5.6 } as Vec2,
  /** service handoff point on counter (where drinks are placed) */
  servePoint: { x: -3, z: -3.5 } as Vec2,
  /** barista idle/home spots behind counter */
  baristaSpots: [-5.5, -3.5, -1.5].map((x) => ({ x, z: -4.6 })) as Vec2[],
  /** tables in unlock order. 2 seats each at x±0.75. tables level L => first (2 + L*2)?? see balance TABLES_BY_LEVEL */
  tables: [
    { x: 5, z: -1 }, { x: 8, z: -1 },
    { x: 5, z: 2.5 }, { x: 8, z: 2.5 },
    { x: -3, z: 1.5 }, { x: -6.5, z: 1.5 },
    { x: -3, z: 5 }, { x: -6.5, z: 5 },
  ] as Vec2[],
  seatOffset: 0.75,
  /** decor spots revealed progressively by decor level (renderer owns visuals) */
  decorSpots: [
    { x: -9.3, z: -7.3 }, { x: 9.3, z: -7.3 }, { x: 9.3, z: 6 }, { x: -9.3, z: 7 },
    { x: 3.2, z: -7.6 }, { x: -9.5, z: -1 }, { x: 9.5, z: 1 }, { x: 0, z: 7.4 },
  ] as Vec2[],
  walkSpeed: 2.2,       // customer m/s (sim)
  baristaSpeed: 2.8,
} as const;

export function seatPositions(tableIdx: number): [Vec2, Vec2] {
  const t = LAYOUT.tables[tableIdx];
  return [{ x: t.x - LAYOUT.seatOffset, z: t.z }, { x: t.x + LAYOUT.seatOffset, z: t.z }];
}
