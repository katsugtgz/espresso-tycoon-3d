import { Customer, CustomerOrder, CustomerStatus, DrinkId, StationData } from '../types';
import { gameState } from '../core/GameState';
import { events } from '../core/EventBus';
import { InvariantChecker, InvariantViolation, invariantChecker } from './InvariantChecker';

export function createMulberry32(seed: number): () => number {
  let s = seed | 0;
  return function mulberry32() {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface GameStateSnapshot {
  money: number;
  day: number;
  gameMinutes: number;
  clock: string;
  rating: number;
  queue: Array<{ customerId: string; drinkId: DrinkId; patience: number }>;
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
  invariantsViolated: InvariantViolation[];
  logs: string[];
  errors: string[];
}

export interface GameActions {
  startGame: () => void;
  clickStation: (stationId: string) => void;
  serve: (orderId: string) => void;
  buyUpgrade: (upgradeId: string) => boolean;
  setSpeed: (speed: number) => void;
  advanceTime: (seconds: number) => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
}

export class GameTestAPI {
  public invariantChecker: InvariantChecker;
  private logs: string[] = [];
  private errors: string[] = [];
  private currentFps: number = 60;
  private lastRafTime: number = 0;
  private frameCount: number = 0;
  private originalMathRandom: (() => number) | null = null;
  private prng: (() => number) | null = null;
  private currentSeed: number | null = null;

  // Providers registered by game modules
  private customerProvider: (() => Customer[]) | null = null;
  private queueProvider: (() => Array<{ customerId: string; drinkId: DrinkId; patience: number }>) | null = null;
  private ordersProvider: (() => CustomerOrder[]) | null = null;
  private stationsProvider: (() => Record<string, StationData>) | null = null;

  // Action handlers registered by game modules
  private clickStationHandler: ((stationId: string) => void) | null = null;
  private serveHandler: ((orderId: string) => void) | null = null;
  private startGameHandler: (() => void) | null = null;
  private timeAdvanceHandler: ((seconds: number) => void) | null = null;

  // Fallback internal stores when running standalone or before submodules hook in
  private internalCustomers: Map<string, Customer> = new Map();
  private internalOrders: CustomerOrder[] = [];
  private internalStations: Record<string, StationData> = {};
  private internalQueue: Array<{ customerId: string; drinkId: DrinkId; patience: number }> = [];

  constructor(checker: InvariantChecker = invariantChecker) {
    this.invariantChecker = checker;
    this.initErrorCapture();
    this.initSeedFromEnvironment();
    this.initFpsMonitoring();
    this.initEventBusHooks();
    this.invariantChecker.start(() => this.getSnapshotForChecker(), 500);
  }

  // --- Seed & Determinism ---

  public setSeed(seed: number): void {
    this.currentSeed = seed;
    if (!this.originalMathRandom) {
      this.originalMathRandom = Math.random;
    }
    this.prng = createMulberry32(seed);
    Math.random = this.prng;
    this.log(`[GameTestAPI] PRNG initialized with seed=${seed}`);
  }

  public getSeed(): number | null {
    return this.currentSeed;
  }

  public restoreMathRandom(): void {
    if (this.originalMathRandom) {
      Math.random = this.originalMathRandom;
      this.originalMathRandom = null;
      this.prng = null;
      this.currentSeed = null;
    }
  }

  private initSeedFromEnvironment(): void {
    if (typeof window !== 'undefined' && window.location) {
      const params = new URLSearchParams(window.location.search);
      const seedParam = params.get('seed');
      if (seedParam !== null && !isNaN(parseInt(seedParam, 10))) {
        this.setSeed(parseInt(seedParam, 10));
      }
    }
  }

  // --- Error & Log Capture ---

  private initErrorCapture(): void {
    if (typeof window === 'undefined') return;

    // Capture console.error
    const originalConsoleError = console.error;
    console.error = (...args: any[]) => {
      const msg = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
      this.errors.push(`[console.error] ${msg}`);
      originalConsoleError.apply(console, args);
    };

    // Capture console.warn to logs
    const originalConsoleWarn = console.warn;
    console.warn = (...args: any[]) => {
      const msg = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
      this.logs.push(`[console.warn] ${msg}`);
      originalConsoleWarn.apply(console, args);
    };

    // Capture unhandled errors and promise rejections
    window.addEventListener('error', (event: ErrorEvent) => {
      const errStr = `[window.error] ${event.message} at ${event.filename}:${event.lineno}:${event.colno}`;
      this.errors.push(errStr);
    });

    window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const reasonStr =
        reason instanceof Error
          ? reason.stack || reason.message
          : typeof reason === 'object'
            ? JSON.stringify(reason)
            : String(reason);
      this.errors.push(`[unhandledrejection] ${reasonStr}`);
    });
  }

  public log(msg: string): void {
    const timestamp = new Date().toISOString();
    const entry = `[${timestamp}] ${msg}`;
    this.logs.push(entry);
    if (this.logs.length > 500) {
      this.logs.shift();
    }
  }

  // --- FPS Monitoring ---

  private initFpsMonitoring(): void {
    if (typeof window === 'undefined') return;
    this.lastRafTime = performance.now();
    this.frameCount = 0;

    const onRaf = (now: number) => {
      this.frameCount++;
      const elapsed = now - this.lastRafTime;
      if (elapsed >= 500) {
        this.currentFps = (this.frameCount * 1000) / elapsed;
        this.frameCount = 0;
        this.lastRafTime = now;
        this.invariantChecker.recordFps(this.currentFps);
      }
      requestAnimationFrame(onRaf);
    };

    requestAnimationFrame(onRaf);
  }

  // --- EventBus Bridge ---

  private initEventBusHooks(): void {
    events.on('CUSTOMER_SPAWNED', (cust: Customer) => {
      if (cust && cust.id) {
        this.internalCustomers.set(cust.id, cust);
      }
    });

    events.on('CUSTOMER_DESPAWNED', (data: { id: string } | string) => {
      const id = typeof data === 'string' ? data : data?.id;
      if (id) {
        this.internalCustomers.delete(id);
      }
    });

    events.on('ORDER_CREATED', (order: CustomerOrder) => {
      if (order && order.id) {
        const idx = this.internalOrders.findIndex((o) => o.id === order.id);
        if (idx >= 0) {
          this.internalOrders[idx] = order;
        } else {
          this.internalOrders.push(order);
        }
      }
    });

    events.on('ORDER_SERVED', (data: { orderId: string }) => {
      if (data?.orderId) {
        this.internalOrders = this.internalOrders.filter((o) => o.id !== data.orderId);
      }
    });

    events.on('STATION_UPDATED', (station: StationData) => {
      if (station && station.id) {
        this.internalStations[station.id] = station;
      }
    });

    events.on('QUEUE_UPDATED', (queue: Array<{ customerId: string; drinkId: DrinkId; patience: number }>) => {
      if (Array.isArray(queue)) {
        this.internalQueue = queue;
      }
    });
  }

  // --- Provider Registration ---

  public registerCustomerProvider(fn: () => Customer[]): void {
    this.customerProvider = fn;
  }

  public registerQueueProvider(fn: () => Array<{ customerId: string; drinkId: DrinkId; patience: number }>): void {
    this.queueProvider = fn;
  }

  public registerOrdersProvider(fn: () => CustomerOrder[]): void {
    this.ordersProvider = fn;
  }

  public registerStationsProvider(fn: () => Record<string, StationData>): void {
    this.stationsProvider = fn;
  }

  public registerStationClickHandler(fn: (stationId: string) => void): void {
    this.clickStationHandler = fn;
  }

  public registerServeHandler(fn: (orderId: string) => void): void {
    this.serveHandler = fn;
  }

  public registerStartGameHandler(fn: () => void): void {
    this.startGameHandler = fn;
  }

  public registerTimeAdvancer(fn: (seconds: number) => void): void {
    this.timeAdvanceHandler = fn;
  }

  // --- Snapshot & State Access ---

  private getSnapshotForChecker() {
    const rawCustomers = this.customerProvider ? this.customerProvider() : Array.from(this.internalCustomers.values());
    const customers = rawCustomers.map((c) => ({
      id: c.id,
      status: c.status,
      patience: c.patience,
      order: c.order,
      position: c.position || [0, 0, 0],
    }));

    const queue = this.queueProvider ? this.queueProvider() : this.internalQueue;
    const orders = this.ordersProvider ? this.ordersProvider() : this.internalOrders;
    const stations = this.stationsProvider ? this.stationsProvider() : this.internalStations;

    return {
      money: gameState.money,
      day: gameState.currentDay,
      gameMinutes: gameState.gameMinutes,
      clock: gameState.getClockString(),
      rating: gameState.rating,
      queue,
      customers,
      orders,
      stations,
      upgrades: { ...gameState.upgradeLevels },
      fps: this.currentFps,
    };
  }

  public getState(): GameStateSnapshot {
    const snapshot = this.getSnapshotForChecker();
    return {
      ...snapshot,
      invariantsViolated: this.invariantChecker.getViolations(),
      logs: [...this.logs],
      errors: [...this.errors],
    };
  }

  // --- Actions ---

  public actions: GameActions = {
    startGame: (): void => {
      this.log('[Action] startGame()');
      gameState.isPaused = false;
      gameState.isDayActive = true;
      if (this.startGameHandler) {
        this.startGameHandler();
      }
      events.emit('GAME_STARTED');
    },

    clickStation: (stationId: string): void => {
      this.log(`[Action] clickStation("${stationId}")`);
      if (this.clickStationHandler) {
        this.clickStationHandler(stationId);
      }
      events.emit('STATION_CLICKED', { stationId });
      events.emit('INTERACTION', { type: 'clickStation', stationId });
    },

    serve: (orderId: string): void => {
      this.log(`[Action] serve("${orderId}")`);
      if (this.serveHandler) {
        this.serveHandler(orderId);
      }
      events.emit('SERVE_ORDER', { orderId });
      events.emit('ORDER_SERVED', { orderId });
    },

    buyUpgrade: (upgradeId: string): boolean => {
      this.log(`[Action] buyUpgrade("${upgradeId}")`);
      const success = gameState.buyUpgrade(upgradeId);
      this.log(`[Action] buyUpgrade result: ${success}`);
      return success;
    },

    setSpeed: (speed: number): void => {
      this.log(`[Action] setSpeed(${speed})`);
      gameState.gameSpeed = Math.max(0.1, speed);
      events.emit('SPEED_CHANGED', { speed: gameState.gameSpeed });
    },

    advanceTime: (seconds: number): void => {
      this.log(`[Action] advanceTime(${seconds}s)`);
      gameState.updateTime(seconds);
      if (this.timeAdvanceHandler) {
        this.timeAdvanceHandler(seconds);
      }
      events.emit('TIME_ADVANCED', { seconds });
    },

    pause: (): void => {
      this.log('[Action] pause()');
      gameState.isPaused = true;
      events.emit('GAME_PAUSED');
    },

    resume: (): void => {
      this.log('[Action] resume()');
      gameState.isPaused = false;
      events.emit('GAME_RESUMED');
    },

    reset: (): void => {
      this.log('[Action] reset()');
      gameState.resetSave();
      this.invariantChecker.reset();
      this.internalCustomers.clear();
      this.internalOrders = [];
      this.internalStations = {};
      this.internalQueue = [];
      this.logs = [];
      this.errors = [];
      events.emit('GAME_RESET');
    },
  };
}

// Global Singleton
export const gameTestAPI = new GameTestAPI();

// Auto-attach to window.__game when in browser environment
export function attachTestApiToWindow(): void {
  if (typeof window !== 'undefined') {
    const hasTestQuery = window.location && (
      window.location.search.includes('test=1') ||
      window.location.search.includes('eval=1') ||
      (window as any).__ENABLE_TEST_API__ === true
    );

    // We attach __game to window so tests and browser automation can drive the engine
    (window as any).__game = gameTestAPI;
    if (hasTestQuery) {
      console.log('[GameTestAPI] Test mode active. Attached to window.__game');
    }
  }
}

attachTestApiToWindow();
