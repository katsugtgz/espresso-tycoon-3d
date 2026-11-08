import type { AppContext } from '../appTypes';
import type { CustomerState, GameState } from '../types';
import { LAYOUT } from '../config/layout';
import { BALANCE } from '../config/balance';

export interface Violation {
  rule: string;
  message: string;
  simTime: number;
  day: number;
  snapshot: Record<string, any>;
  isWarning?: boolean;
}

export interface InvariantCheckerConfig {
  fpsWarnThreshold?: number;
  tolerance?: number;
}

export class InvariantChecker {
  private _violations: Violation[] = [];
  private _warnings: Violation[] = [];
  private customerTracking = new Map<number, { state: CustomerState; enteredSimTime: number }>();
  private reportedStuck = new Set<string>();
  private dayRendererStats = new Map<number, { geometries: number; meshes: number; upgradesCount: number }>();
  private config: InvariantCheckerConfig;

  constructor(config: InvariantCheckerConfig = {}) {
    this.config = {
      fpsWarnThreshold: 20,
      tolerance: 0.5,
      ...config,
    };
  }

  public check(ctx: AppContext): Violation[] {
    const state = ctx.sim.state;
    const newViolations: Violation[] = [];
    const simTime = state.time;
    const day = state.day;

    const createSnapshot = (extra: Record<string, any> = {}) => ({
      simTime,
      day,
      phase: state.phase,
      money: state.money,
      rating: state.rating,
      customerCount: state.customers.length,
      orderCount: state.orders.length,
      queueCount: state.queue.length,
      ...extra,
    });

    const report = (rule: string, message: string, extra: Record<string, any> = {}, isWarning = false) => {
      const v: Violation = {
        rule,
        message,
        simTime,
        day,
        snapshot: createSnapshot(extra),
        isWarning,
      };
      if (isWarning) {
        this._warnings.push(v);
      } else {
        this._violations.push(v);
        newViolations.push(v);
      }
    };

    // 1. Money finite & not NaN
    if (typeof state.money !== 'number' || isNaN(state.money) || !isFinite(state.money)) {
      report('money_finite', `Money is NaN or non-finite: ${state.money}`);
    }

    // 2. Rating finite in [1, 5]
    if (typeof state.rating !== 'number' || isNaN(state.rating) || !isFinite(state.rating)) {
      report('rating_bounds', `Rating is NaN or non-finite: ${state.rating}`);
    } else if (state.rating < 1.0 - 1e-3 || state.rating > 5.0 + 1e-3) {
      report('rating_bounds', `Rating outside [1, 5] bounds: ${state.rating.toFixed(3)}`);
    }

    // 3. Customer stuck check: same state > 90s sim and not 'seated', or seated > 60s
    const activeCustomerIds = new Set<number>();
    for (const c of state.customers) {
      activeCustomerIds.add(c.id);
      const tracked = this.customerTracking.get(c.id);
      if (!tracked || tracked.state !== c.state) {
        this.customerTracking.set(c.id, { state: c.state, enteredSimTime: simTime });
      } else {
        const timeInState = Math.max(c.stateTime ?? 0, simTime - tracked.enteredSimTime);
        const stuckKey = `${c.id}:${c.state}`;
        if (c.state === 'seated') {
          if (timeInState > 60 && !this.reportedStuck.has(stuckKey)) {
            report('customer_stuck', `Customer ${c.id} stuck seated for ${timeInState.toFixed(1)}s (> 60s)`, {
              customerId: c.id,
              state: c.state,
              timeInState,
            });
            this.reportedStuck.add(stuckKey);
          }
        } else {
          if (timeInState > 90 && !this.reportedStuck.has(stuckKey)) {
            report('customer_stuck', `Customer ${c.id} stuck in state '${c.state}' for ${timeInState.toFixed(1)}s (> 90s)`, {
              customerId: c.id,
              state: c.state,
              timeInState,
            });
            this.reportedStuck.add(stuckKey);
          }
        }
      }
    }
    // Cleanup removed customers
    for (const id of Array.from(this.customerTracking.keys())) {
      if (!activeCustomerIds.has(id)) {
        this.customerTracking.delete(id);
      }
    }

    // 4. Every active order references existing customer whose orderId matches
    const customerMap = new Map<number, (typeof state.customers)[0]>();
    for (const c of state.customers) {
      customerMap.set(c.id, c);
    }
    for (const o of state.orders) {
      const c = customerMap.get(o.customerId);
      if (!c) {
        report('order_customer_mismatch', `Order ${o.id} references non-existent customer ${o.customerId}`, {
          orderId: o.id,
          customerId: o.customerId,
          drink: o.drink,
          status: o.status,
        });
      } else if (c.orderId !== o.id && c.state !== 'to_seat' && c.state !== 'seated' && c.state !== 'leaving') {
        report(
          'order_customer_mismatch',
          `Customer ${c.id} orderId (${c.orderId}) does not match order ${o.id} (status: ${o.status}, customer state: ${c.state})`,
          { orderId: o.id, customerId: c.id, customerOrderId: c.orderId, customerState: c.state }
        );
      }
    }

    // 5. Every customer.orderId references existing order unless served state
    const orderIds = new Set(state.orders.map((o) => o.id));
    for (const c of state.customers) {
      if (c.orderId !== null && c.state !== 'to_seat' && c.state !== 'seated' && c.state !== 'leaving') {
        if (!orderIds.has(c.orderId)) {
          report(
            'customer_order_missing',
            `Customer ${c.id} in state '${c.state}' references missing order ${c.orderId}`,
            { customerId: c.id, orderId: c.orderId, state: c.state }
          );
        }
      }
    }

    // 6. Machines with orderId reference active order
    for (const m of state.machines) {
      if (m.orderId !== null && !orderIds.has(m.orderId)) {
        report(
          'machine_order_missing',
          `Machine ${m.id} references missing order ${m.orderId}`,
          { machineId: m.id, orderId: m.orderId, status: m.status }
        );
      }
    }

    // 7. Queue capacity: queue.length <= queueCapacity
    if (state.queue.length > state.queueCapacity) {
      report(
        'queue_capacity',
        `Queue length ${state.queue.length} exceeds capacity ${state.queueCapacity}`,
        { queueLength: state.queue.length, queueCapacity: state.queueCapacity }
      );
    }

    // 8. Queue IDs unique & exist & are in queueing/ordering state
    const seenQueueIds = new Set<number>();
    for (const qId of state.queue) {
      if (seenQueueIds.has(qId)) {
        report('queue_ids_valid', `Duplicate customer ID ${qId} in queue`, { customerId: qId });
      }
      seenQueueIds.add(qId);

      const c = customerMap.get(qId);
      if (!c) {
        report('queue_ids_valid', `Queue customer ID ${qId} not found in customers list`, { customerId: qId });
      } else if (c.state !== 'queueing' && c.state !== 'ordering') {
        report(
          'queue_ids_valid',
          `Queue customer ${qId} is in invalid state '${c.state}' (expected queueing or ordering)`,
          { customerId: qId, state: c.state }
        );
      }
    }

    // 9. Seat occupant exists & consistent
    for (const s of state.seats) {
      if (s.occupantId !== null) {
        const c = customerMap.get(s.occupantId);
        if (!c) {
          report('seat_occupant_consistent', `Seat ${s.id} occupant ${s.occupantId} not found in customers`, {
            seatId: s.id,
            occupantId: s.occupantId,
          });
        } else {
          if (c.seatId !== s.id) {
            report(
              'seat_occupant_consistent',
              `Seat ${s.id} occupant ${c.id} has mismatched customer.seatId ${c.seatId}`,
              { seatId: s.id, customerId: c.id, customerSeatId: c.seatId }
            );
          }
          if (c.state !== 'to_seat' && c.state !== 'seated') {
            report(
              'seat_occupant_consistent',
              `Seat ${s.id} occupant ${c.id} is in state '${c.state}' (expected to_seat or seated)`,
              { seatId: s.id, customerId: c.id, state: c.state }
            );
          }
        }
      }
    }

    // 10. Bounds check: LAYOUT.bounds (+0.5 tolerance) and finite positions
    const tol = this.config.tolerance ?? 0.5;
    const minX = LAYOUT.bounds.minX - tol;
    const maxX = LAYOUT.bounds.maxX + tol;
    const minZ = LAYOUT.bounds.minZ - tol;
    const maxZ = LAYOUT.bounds.maxZ + tol;

    for (const c of state.customers) {
      if (!isFinite(c.pos.x) || !isFinite(c.pos.z)) {
        report('entity_bounds', `Customer ${c.id} has non-finite position (${c.pos.x}, ${c.pos.z})`, {
          customerId: c.id,
          pos: c.pos,
        });
      } else if (c.pos.x < minX || c.pos.x > maxX || c.pos.z < minZ || c.pos.z > maxZ) {
        report(
          'entity_bounds',
          `Customer ${c.id} position (${c.pos.x.toFixed(2)}, ${c.pos.z.toFixed(2)}) outside bounds [${minX}, ${maxX}] x [${minZ}, ${maxZ}]`,
          { customerId: c.id, pos: c.pos }
        );
      }
    }

    for (const b of state.baristas) {
      if (!isFinite(b.pos.x) || !isFinite(b.pos.z)) {
        report('entity_bounds', `Barista ${b.id} has non-finite position (${b.pos.x}, ${b.pos.z})`, {
          baristaId: b.id,
          pos: b.pos,
        });
      } else if (b.pos.x < minX || b.pos.x > maxX || b.pos.z < minZ || b.pos.z > maxZ) {
        report(
          'entity_bounds',
          `Barista ${b.id} position (${b.pos.x.toFixed(2)}, ${b.pos.z.toFixed(2)}) outside bounds [${minX}, ${maxX}] x [${minZ}, ${maxZ}]`,
          { baristaId: b.id, pos: b.pos }
        );
      }
    }

    // 11. Customer count <= BALANCE.maxCustomers
    if (state.customers.length > BALANCE.maxCustomers) {
      report(
        'customer_count_max',
        `Customer count ${state.customers.length} exceeds maximum ${BALANCE.maxCustomers}`,
        { customerCount: state.customers.length, max: BALANCE.maxCustomers }
      );
    }

    // 12. Leak check: at day_end
    if (state.phase === 'day_end') {
      if (state.customers.length !== 0 || state.orders.length !== 0) {
        report(
          'day_transition_leak',
          `Day end reached but customers (${state.customers.length}) or orders (${state.orders.length}) remain active`,
          { customerCount: state.customers.length, orderCount: state.orders.length }
        );
      }
    }

    // 13. FPS floor warning
    const fpsThreshold = this.config.fpsWarnThreshold ?? 20;
    if (ctx.perf.frames > 60 && ctx.perf.fps < fpsThreshold && ctx.perf.fps > 0) {
      report(
        'fps_floor',
        `Current FPS (${ctx.perf.fps.toFixed(1)}) below warning threshold (${fpsThreshold})`,
        { fps: ctx.perf.fps, minFps: ctx.perf.minFps },
        true
      );
    }

    return newViolations;
  }

  /** Called at day:end or startNextDay to record renderer growth */
  public recordDayEnd(ctx: AppContext): Violation[] {
    const state = ctx.sim.state;
    const day = state.day;
    const rStats = ctx.renderer ? ctx.renderer.getStats() : { geometries: 0, meshes: 0 };
    const upgradesCount = Object.values(state.upgrades || {}).reduce((acc, v) => acc + (v || 0), 0);

    const prevDay = this.dayRendererStats.get(day - 1);
    this.dayRendererStats.set(day, {
      geometries: rStats.geometries,
      meshes: rStats.meshes,
      upgradesCount,
    });

    const newViolations: Violation[] = [];
    // If after day 3 and no upgrades bought since yesterday, check mesh/geometry growth > 20%
    if (day > 3 && prevDay) {
      const upgradePurchased = upgradesCount > prevDay.upgradesCount;
      if (!upgradePurchased) {
        const geomGrowth = (rStats.geometries - prevDay.geometries) / Math.max(1, prevDay.geometries);
        const meshGrowth = (rStats.meshes - prevDay.meshes) / Math.max(1, prevDay.meshes);
        if (geomGrowth > 0.2 || meshGrowth > 0.2) {
          const v: Violation = {
            rule: 'renderer_resource_leak',
            message: `Renderer resources grew abnormally across day ${day - 1} -> ${day} (geometries: +${(geomGrowth * 100).toFixed(1)}%, meshes: +${(meshGrowth * 100).toFixed(1)}%) without upgrades`,
            simTime: state.time,
            day,
            snapshot: {
              prevGeometries: prevDay.geometries,
              curGeometries: rStats.geometries,
              prevMeshes: prevDay.meshes,
              curMeshes: rStats.meshes,
            },
          };
          this._violations.push(v);
          newViolations.push(v);
        }
      }
    }

    return newViolations;
  }

  public violations(): Violation[] {
    return [...this._violations];
  }

  public warnings(): Violation[] {
    return [...this._warnings];
  }

  public clear(): void {
    this._violations = [];
    this._warnings = [];
    this.reportedStuck.clear();
  }

  public reset(): void {
    this.clear();
    this.customerTracking.clear();
    this.dayRendererStats.clear();
  }
}
