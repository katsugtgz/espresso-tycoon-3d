import type { AppContext } from '../appTypes';
import { parseStationId } from '../sim/stations';
import type { DrinkId, GameAction, GameSpeed, UpgradeId } from '../types';
import { InvariantChecker, type Violation } from './invariants';
import type {
  CapturedError,
  CustomerSummary,
  EventLogEntry,
  GameSummaryState,
  SeatSummary,
  TestGameAPI,
} from './types';

export * from './types';
export * from './invariants';

export function installTestAPI(ctx: AppContext): TestGameAPI {
  const checker = new InvariantChecker();
  const ringBuffer: EventLogEntry[] = [];
  const maxEvents = 2000;
  const capturedErrors: CapturedError[] = [];

  // Capture console.error & console.warn
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;
  let inConsolePatch = false;

  console.error = (...args: any[]) => {
    if (!inConsolePatch) {
      inConsolePatch = true;
      try {
        const msg = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
        capturedErrors.push({ message: msg, source: 'console.error', time: Date.now() });
      } catch {
        // ignore JSON errors
      } finally {
        inConsolePatch = false;
      }
    }
    originalConsoleError.apply(console, args);
  };

  console.warn = (...args: any[]) => {
    if (!inConsolePatch) {
      inConsolePatch = true;
      try {
        const msg = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
        capturedErrors.push({ message: msg, source: 'console.warn', time: Date.now() });
      } catch {
        // ignore JSON errors
      } finally {
        inConsolePatch = false;
      }
    }
    originalConsoleWarn.apply(console, args);
  };

  // Ring buffer for events
  ctx.bus.onAny((name, payload) => {
    const t = ctx.sim.state ? ctx.sim.state.time : 0;
    let clonedPayload: any = payload;
    try {
      clonedPayload = JSON.parse(JSON.stringify(payload));
    } catch {
      clonedPayload = payload;
    }
    ringBuffer.push({ t, name: String(name), payload: clonedPayload });
    if (ringBuffer.length > maxEvents) {
      ringBuffer.shift();
    }
  });

  // Track day:end for resource leak checks
  ctx.bus.on('day:end', () => {
    checker.recordDayEnd(ctx);
  });

  // Wrap ctx.sim.advance & advanceTime with 0.25 sim s throttle
  let lastCheckSimTime = -1;
  const origAdvance = ctx.sim.advance.bind(ctx.sim);
  ctx.sim.advance = (realDt: number) => {
    origAdvance(realDt);
    const currentTime = ctx.sim.state.time;
    if (lastCheckSimTime < 0 || currentTime - lastCheckSimTime >= 0.25) {
      checker.check(ctx);
      lastCheckSimTime = currentTime;
    }
  };

  const origAdvanceTime = ctx.sim.advanceTime.bind(ctx.sim);
  ctx.sim.advanceTime = (simSeconds: number) => {
    origAdvanceTime(simSeconds);
    const currentTime = ctx.sim.state.time;
    if (lastCheckSimTime < 0 || currentTime - lastCheckSimTime >= 0.25) {
      checker.check(ctx);
      lastCheckSimTime = currentTime;
    }
  };

  const api: TestGameAPI = {
    version: '1.0.0',

    getState(): GameSummaryState {
      const s = ctx.sim.state;
      const mins = Math.max(0, Math.floor(s.clockMinutes ?? 480));
      const hh = Math.floor(mins / 60).toString().padStart(2, '0');
      const mm = Math.floor(mins % 60).toString().padStart(2, '0');
      const clock = `${hh}:${mm}`;

      const customers: CustomerSummary[] = (s.customers || []).map((c) => ({
        id: c.id,
        state: c.state,
        pos: { x: c.pos.x, z: c.pos.z },
        patience: c.patience,
        kind: c.kind,
        orderId: c.orderId,
        mood: c.mood,
        seatId: c.seatId,
        pickupSlot: c.pickupSlot,
        angry: c.angry,
        stateTime: c.stateTime,
      }));

      const seats: SeatSummary[] = (s.seats || []).map((st) => ({
        id: st.id,
        tableId: st.tableId,
        pos: { x: st.pos.x, z: st.pos.z },
        occupantId: st.occupantId,
      }));

      const renderStats = ctx.renderer
        ? ctx.renderer.getStats()
        : { drawCalls: 0, triangles: 0, geometries: 0, textures: 0, meshes: 0 };

      return {
        phase: s.phase,
        paused: s.paused,
        speed: s.speed,
        money: s.money,
        day: s.day,
        clock,
        clockMinutes: s.clockMinutes,
        time: s.time,
        dayTime: s.dayTime,
        rating: s.rating,
        combo: s.combo,
        rush: s.rush,
        queue: [...(s.queue || [])],
        queueCapacity: s.queueCapacity,
        customers,
        orders: JSON.parse(JSON.stringify(s.orders || [])),
        machines: JSON.parse(JSON.stringify(s.machines || [])),
        seats,
        baristas: JSON.parse(JSON.stringify(s.baristas || [])),
        upgrades: { ...(s.upgrades || {}) },
        unlockedDrinks: [...(s.unlockedDrinks || [])],
        prices: { ...(s.prices || {}) },
        tutorial: { ...(s.tutorial || { active: false, step: 0, done: true }) },
        dayStats: JSON.parse(JSON.stringify(s.dayStats || {})),
        history: JSON.parse(JSON.stringify(s.history || [])),
        goals: JSON.parse(JSON.stringify(s.goals || [])),
        achievements: [...(s.achievements || [])],
        fps: ctx.perf ? ctx.perf.fps : 60,
        minFps: ctx.perf ? ctx.perf.minFps : 60,
        entityCounts: {
          customers: (s.customers || []).length,
          orders: (s.orders || []).length,
          queue: (s.queue || []).length,
          machines: (s.machines || []).length,
          baristas: (s.baristas || []).length,
        },
        renderStats,
      };
    },

    getRawState() {
      return ctx.sim.serialize();
    },

    actions: {
      startGame(opts) {
        ctx.hooks.newGame(opts);
        return { ok: true };
      },
      clickStation(id: string) {
        const intent = parseStationId(id);
        return intent
          ? ctx.sim.dispatch({ type: 'clickStationIntent', intent })
          : ctx.sim.dispatch({ type: 'clickStation', stationId: id });
      },
      brew(drink: DrinkId) {
        return ctx.sim.dispatch({ type: 'brew', drink });
      },
      serve(machineId?: number) {
        return ctx.sim.dispatch({ type: 'serve', machineId });
      },
      buyUpgrade(id: UpgradeId) {
        return ctx.sim.dispatch({ type: 'buyUpgrade', id });
      },
      unlockDrink(drink: DrinkId) {
        return ctx.sim.dispatch({ type: 'unlockDrink', drink });
      },
      setPrice(drink: DrinkId, price: number) {
        return ctx.sim.dispatch({ type: 'setPrice', drink, price });
      },
      setSpeed(speed: GameSpeed) {
        return ctx.sim.dispatch({ type: 'setSpeed', speed });
      },
      advanceTime(simSeconds: number) {
        let remaining = Math.max(0, simSeconds);
        while (remaining > 0) {
          const chunk = Math.min(1.0, remaining);
          origAdvanceTime(chunk);
          checker.check(ctx);
          remaining -= chunk;
        }
        lastCheckSimTime = ctx.sim.state.time;
        return { ok: true };
      },
      pause(bool: boolean) {
        return ctx.sim.dispatch({ type: 'pause', paused: bool });
      },
      nextDay() {
        return ctx.sim.dispatch({ type: 'startNextDay' });
      },
      skipTutorial() {
        return ctx.sim.dispatch({ type: 'skipTutorial' });
      },
      tutorialAck() {
        return ctx.sim.dispatch({ type: 'tutorialAck' });
      },
      save() {
        const ok = ctx.hooks.save();
        return { ok, reason: ok ? undefined : 'Save failed' };
      },
      load() {
        const ok = ctx.hooks.continueGame();
        return { ok, reason: ok ? undefined : 'Load failed' };
      },
      resetSave() {
        ctx.hooks.resetSave();
        return { ok: true };
      },
      quitToMenu() {
        ctx.hooks.quitToMenu();
        return { ok: true };
      },
      dispatch(action: GameAction) {
        return ctx.sim.dispatch(action);
      },
    },

    events: {
      getEvents(sinceIdx?: number): EventLogEntry[] {
        if (typeof sinceIdx === 'number' && sinceIdx >= 0) {
          return ringBuffer.slice(sinceIdx);
        }
        return [...ringBuffer];
      },
      clearEvents() {
        ringBuffer.length = 0;
      },
    },

    errors(): CapturedError[] {
      const winErrors = (window as any).__errors || [];
      return [...winErrors, ...capturedErrors];
    },

    invariants: {
      check(): Violation[] {
        return checker.check(ctx);
      },
      violations(): Violation[] {
        return checker.violations();
      },
      clear() {
        checker.clear();
      },
    },

    stationScreenPos(id: string) {
      return ctx.renderer ? ctx.renderer.stationScreenPos(id) : null;
    },
  };

  if (typeof window !== 'undefined') {
    window.__game = api;
    window.__gameReady = true;
  }

  return api;
}
