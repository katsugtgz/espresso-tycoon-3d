import { Customer, CustomerOrder, CustomerStatus, StationData } from '../types';

export interface InvariantViolation {
  id: string;
  name: string;
  description: string;
  timestamp: number;
  gameMinutes: number;
  day: number;
  snapshot: Record<string, any>;
}

export interface InvariantCheckSnapshot {
  money: number;
  day: number;
  gameMinutes: number;
  clock: string;
  rating: number;
  queue: Array<{ customerId: string; drinkId: string; patience: number }>;
  customers: Array<{
    id: string;
    status: CustomerStatus;
    patience: number;
    order?: CustomerOrder;
    position: [number, number, number];
  }>;
  orders: CustomerOrder[];
  stations: Record<string, StationData>;
  upgrades: Record<string, number>;
  fps: number;
}

export class InvariantChecker {
  private violations: InvariantViolation[] = [];
  private customerTracking: Map<string, { status: CustomerStatus; enteredAt: number }> = new Map();
  private fpsHistory: number[] = [];
  private maxFpsSamples: number = 60;
  private startTime: number = Date.now();
  private checkIntervalTimer: any = null;

  constructor() {
    this.startTime = Date.now();
  }

  public recordFps(fps: number): void {
    if (!isNaN(fps) && isFinite(fps) && fps > 0) {
      this.fpsHistory.push(fps);
      if (this.fpsHistory.length > this.maxFpsSamples) {
        this.fpsHistory.shift();
      }
    }
  }

  public getAverageFps(): number {
    if (this.fpsHistory.length === 0) return 60;
    const sum = this.fpsHistory.reduce((acc, v) => acc + v, 0);
    return sum / this.fpsHistory.length;
  }

  public checkInvariants(snapshot: InvariantCheckSnapshot): InvariantViolation[] {
    const now = Date.now();
    const currentViolations: InvariantViolation[] = [];

    const recordViolation = (name: string, description: string, extraData: Record<string, any> = {}) => {
      const violation: InvariantViolation = {
        id: `inv_${now}_${Math.random().toString(36).slice(2, 7)}`,
        name,
        description,
        timestamp: now,
        gameMinutes: snapshot.gameMinutes,
        day: snapshot.day,
        snapshot: {
          money: snapshot.money,
          rating: snapshot.rating,
          clock: snapshot.clock,
          customerCount: snapshot.customers.length,
          queueCount: snapshot.queue.length,
          ordersCount: snapshot.orders.length,
          fps: snapshot.fps,
          ...extraData,
        },
      };
      this.violations.push(violation);
      currentViolations.push(violation);
      console.warn(`[InvariantChecker] VIOLATION: [${name}] ${description}`, violation);
    };

    // 1. Money invariant: !isNaN(money) and money >= -500
    if (isNaN(snapshot.money) || !isFinite(snapshot.money)) {
      recordViolation('MoneyInvariantNaN', `Money is NaN or not finite: ${snapshot.money}`);
    } else if (snapshot.money < -500) {
      recordViolation('MoneyInvariantNegativeFloor', `Money dropped below -500 floor: $${snapshot.money.toFixed(2)}`);
    }

    // 2. Rating invariant: rating >= 1.0 && rating <= 5.0 && !isNaN(rating)
    if (isNaN(snapshot.rating) || !isFinite(snapshot.rating)) {
      recordViolation('RatingInvariantNaN', `Rating is NaN or not finite: ${snapshot.rating}`);
    } else if (snapshot.rating < 1.0 || snapshot.rating > 5.0) {
      recordViolation('RatingInvariantBounds', `Rating outside valid [1.0, 5.0] range: ${snapshot.rating.toFixed(2)}`);
    }

    // 3. Customer progress: No customer remains in state 'queueing', 'ordering', 'waiting_order' for > 60 real seconds
    // without either state transition or patience expiration
    const activeCustomerIds = new Set<string>();
    const stuckEligibleStates: CustomerStatus[] = ['queueing', 'ordering', 'waiting_order'];

    for (const cust of snapshot.customers) {
      activeCustomerIds.add(cust.id);
      const tracked = this.customerTracking.get(cust.id);

      if (!tracked || tracked.status !== cust.status) {
        // State changed or new customer
        this.customerTracking.set(cust.id, {
          status: cust.status,
          enteredAt: now,
        });
      } else {
        // Customer stayed in the same state
        const timeInStateMs = now - tracked.enteredAt;
        if (stuckEligibleStates.includes(cust.status)) {
          // If stuck for > 60 seconds (60,000ms) and patience hasn't expired (patience > 0)
          if (timeInStateMs > 60000 && cust.patience > 0) {
            recordViolation(
              'CustomerProgressStuck',
              `Customer ${cust.id} stuck in status "${cust.status}" for ${(timeInStateMs / 1000).toFixed(1)}s without state change or patience expiration`,
              { customerId: cust.id, status: cust.status, timeInStateMs, patience: cust.patience }
            );
            // reset timer to avoid spamming the exact same violation every 500ms
            tracked.enteredAt = now;
          }
        }
      }
    }

    // Clean up tracking for customers that left
    for (const id of Array.from(this.customerTracking.keys())) {
      if (!activeCustomerIds.has(id)) {
        this.customerTracking.delete(id);
      }
    }

    // 4. Queue capacity invariant: Queue count <= 6
    if (snapshot.queue.length > 6) {
      recordViolation(
        'QueueCapacityExceeded',
        `Queue length ${snapshot.queue.length} exceeded max capacity 6`,
        { queueLength: snapshot.queue.length }
      );
    }

    // 5. No orphan orders: Every pending order belongs to an active customer currently in the cafe
    const activeOrderIds = new Set<string>();
    for (const cust of snapshot.customers) {
      if (cust.order && cust.order.id) {
        activeOrderIds.add(cust.order.id);
      }
    }

    for (const order of snapshot.orders) {
      if (order.status === 'pending' || order.status === 'in_prep') {
        const hasOwner = activeOrderIds.has(order.id) || snapshot.customers.some((c) => (c as any).orderId === order.id || (order as any).customerId === c.id);
        if (!hasOwner) {
          recordViolation(
            'OrphanOrderDetected',
            `Pending/in_prep order ${order.id} for drink "${order.drinkId}" has no active customer in cafe`,
            { orderId: order.id, drinkId: order.drinkId, status: order.status }
          );
        }
      }
    }

    // 6. Cafe bounds: Customer positions within bounds x: [-15, 15], z: [-15, 15]
    for (const cust of snapshot.customers) {
      if (cust.position && Array.isArray(cust.position) && cust.position.length >= 3) {
        const [x, , z] = cust.position;
        if (x < -15 || x > 15 || z < -15 || z > 15) {
          recordViolation(
            'CafeBoundsExceeded',
            `Customer ${cust.id} out of cafe bounds at position [${x.toFixed(2)}, ${cust.position[1].toFixed(2)}, ${z.toFixed(2)}]`,
            { customerId: cust.id, position: cust.position }
          );
        }
      }
    }

    // 7. Entity leak: No unbounded customer array growth (> 20 total customer entities alive at once)
    if (snapshot.customers.length > 20) {
      recordViolation(
        'EntityLeakCustomerCount',
        `Customer entity count (${snapshot.customers.length}) exceeded limit of 20`,
        { customerCount: snapshot.customers.length }
      );
    }

    // 8. FPS floor check: average FPS >= 15
    this.recordFps(snapshot.fps);
    const uptimeMs = now - this.startTime;
    // Allow 4 seconds grace period at start for scene loading / shader compilation
    if (uptimeMs > 4000 && this.fpsHistory.length >= 10) {
      const avgFps = this.getAverageFps();
      if (avgFps < 15) {
        recordViolation(
          'FpsFloorViolated',
          `Average FPS (${avgFps.toFixed(1)}) dropped below floor threshold of 15 FPS`,
          { avgFps, instantFps: snapshot.fps }
        );
      }
    }

    return currentViolations;
  }

  public start(getSnapshot: () => InvariantCheckSnapshot, intervalMs: number = 500): () => void {
    this.stop();
    this.checkIntervalTimer = setInterval(() => {
      try {
        const snapshot = getSnapshot();
        this.checkInvariants(snapshot);
      } catch (err) {
        console.error('[InvariantChecker] Error checking invariants:', err);
      }
    }, intervalMs);

    return () => this.stop();
  }

  public stop(): void {
    if (this.checkIntervalTimer !== null) {
      clearInterval(this.checkIntervalTimer);
      this.checkIntervalTimer = null;
    }
  }

  public getViolations(): InvariantViolation[] {
    return [...this.violations];
  }

  public clearViolations(): void {
    this.violations = [];
    this.customerTracking.clear();
  }

  public reset(): void {
    this.clearViolations();
    this.fpsHistory = [];
    this.startTime = Date.now();
  }
}

export const invariantChecker = new InvariantChecker();
