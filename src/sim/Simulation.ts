import type {
  ISim,
  GameState,
  GameAction,
  ActionResult,
  UpgradeId,
  GameEvents,
} from '../types';
import type { EventBus } from '../core/events';
import { Rng } from '../core/rng';
import { BALANCE } from '../config/balance';
import { createInitialState } from './state';
import { migrate } from './save';
import { getUpgradeCost, buyUpgrade, unlockDrink, setPrice, endDay, startNextDay } from './economy';
import { clickStation, brewDrink, serveMachine, updateMachines } from './stations';
import { updateBaristas } from './baristas';
import { spawnCustomer, updateCustomers } from './customers';
import {
  generateGoals,
  updateGoalsProgress,
  checkAchievements,
  calculateSpawnInterval,
} from './progression';
import { advanceTutorial, skipTutorial, handleTutorialAck } from './tutorial';

export class Simulation implements ISim {
  public state: GameState;
  private bus: EventBus<GameEvents>;
  private accumulator: number = 0;

  constructor(bus: EventBus<GameEvents>) {
    this.bus = bus;
    this.state = createInitialState(12345, true);
  }

  dispatch(action: GameAction): ActionResult {
    try {
      switch (action.type) {
        case 'newGame': {
          const rawSeed = action.seed !== undefined ? action.seed : (Date.now() & 0xffffffff);
          const seed = (rawSeed >>> 0) || 12345;
          const tutorialActive = action.tutorial !== undefined ? action.tutorial : true;

          this.state = createInitialState(seed, tutorialActive);
          this.state.phase = 'playing';
          this.accumulator = 0;

          const rng = new Rng(this.state.rngState);
          this.state.goals = generateGoals(this.state.day, rng);
          this.state.rngState = rng.state;

          this.bus.emit('game:new', { seed });
          this.bus.emit('day:start', { day: 1 });
          if (tutorialActive) {
            this.bus.emit('tutorial:step', { step: 0 });
          }
          return { ok: true };
        }

        case 'clickStation': {
          if (this.state.phase !== 'playing') return { ok: false, reason: 'not_playing' };
          return clickStation(this.state, this.bus, action.stationId);
        }

        case 'brew': {
          if (this.state.phase !== 'playing') return { ok: false, reason: 'not_playing' };
          return brewDrink(this.state, this.bus, action.drink);
        }

        case 'serve': {
          if (this.state.phase !== 'playing') return { ok: false, reason: 'not_playing' };
          let machineId = action.machineId;
          if (machineId === undefined) {
            const readyMachine = this.state.machines.find((m) => m.status === 'ready');
            if (!readyMachine) return { ok: false, reason: 'no_ready_machine' };
            machineId = readyMachine.id;
          }
          return serveMachine(this.state, this.bus, machineId, false);
        }

        case 'buyUpgrade': {
          return buyUpgrade(this.state, this.bus, action.id);
        }

        case 'unlockDrink': {
          return unlockDrink(this.state, this.bus, action.drink);
        }

        case 'setPrice': {
          return setPrice(this.state, action.drink, action.price);
        }

        case 'setSpeed': {
          if (![1, 2, 4, 10].includes(action.speed)) {
            return { ok: false, reason: 'invalid_speed' };
          }
          this.state.speed = action.speed;
          this.bus.emit('speed:change', { speed: action.speed });
          return { ok: true };
        }

        case 'pause': {
          this.state.paused = action.paused;
          this.bus.emit('game:paused', { paused: action.paused });
          return { ok: true };
        }

        case 'startNextDay': {
          const rng = new Rng(this.state.rngState);
          const res = startNextDay(this.state, this.bus, rng);
          this.state.rngState = rng.state;
          return res;
        }

        case 'skipTutorial': {
          skipTutorial(this.state, this.bus);
          return { ok: true };
        }

        case 'tutorialAck': {
          handleTutorialAck(this.state, this.bus);
          return { ok: true };
        }

        default:
          return { ok: false, reason: 'unknown_action' };
      }
    } catch (err) {
      console.error('[Simulation.dispatch] error', err);
      return { ok: false, reason: String(err) };
    }
  }

  advance(realDt: number): void {
    if (this.state.phase !== 'playing' || this.state.paused) return;
    if (!Number.isFinite(realDt) || realDt <= 0) return;

    this.accumulator += realDt * this.state.speed;
    const dt = BALANCE.fixedStep;
    const maxSteps = 400;
    let steps = 0;

    while (this.accumulator >= dt && steps < maxSteps) {
      this.step(dt);
      this.accumulator -= dt;
      steps++;
      if (this.state.phase !== 'playing') {
        this.accumulator = 0;
        break;
      }
    }

    if (steps >= maxSteps) {
      this.accumulator = 0; // prevent spiral
    }
  }

  advanceTime(simSeconds: number): void {
    if (this.state.phase !== 'playing') return;
    if (!Number.isFinite(simSeconds) || simSeconds <= 0) return;

    const dt = BALANCE.fixedStep;
    let remaining = simSeconds;

    while (remaining >= dt && this.state.phase === 'playing') {
      this.step(dt);
      remaining -= dt;
    }

    if (remaining > 0 && this.state.phase === 'playing') {
      this.step(remaining);
    }
  }

  upgradeCost(id: UpgradeId): number {
    return getUpgradeCost(this.state, id);
  }

  serialize(): GameState {
    return JSON.parse(JSON.stringify(this.state));
  }

  load(data: unknown): boolean {
    const migrated = migrate(data);
    if (!migrated) return false;
    this.state = migrated;
    this.accumulator = 0;
    return true;
  }

  private step(dt: number): void {
    const rng = new Rng(this.state.rngState);

    // 1. Advance sim time
    this.state.time += dt;
    this.state.dayTime += dt;
    const clockFrac = Math.min(1.0, this.state.dayTime / this.state.dayLength);
    this.state.clockMinutes = Math.min(1200, Math.round((480 + 720 * clockFrac) * 10) / 10);

    // 2. Check rush hour
    const currentHour = this.state.clockMinutes / 60;
    const isRush = BALANCE.rushHours.some(([start, end]) => currentHour >= start && currentHour < end);
    if (isRush !== this.state.rush) {
      this.state.rush = isRush;
      if (isRush) {
        this.bus.emit('rush:start', {});
        this.bus.emit('toast', { text: 'Rush hour started! Customers pouring in.', kind: 'info' });
      } else {
        this.bus.emit('rush:end', {});
      }
    }

    // 3. Customer arrivals (stops at 19:30 = 1170 clock minutes)
    const canSpawn =
      this.state.dayTime < this.state.dayLength &&
      this.state.clockMinutes < 1170 &&
      this.state.customers.length < BALANCE.maxCustomers;

    const tutorialBlock =
      this.state.tutorial.active &&
      this.state.tutorial.step <= 3 &&
      this.state.customers.length >= 1;

    if (canSpawn && !tutorialBlock) {
      this.state.spawnTimer -= dt;
      if (this.state.spawnTimer <= 0) {
        // In rush hour, spawn bursts (2-3 at once)
        const burstCount = this.state.rush ? rng.int(2, 3) : 1;
        for (let b = 0; b < burstCount; b++) {
          if (this.state.customers.length < BALANCE.maxCustomers) {
            spawnCustomer(this.state, this.bus, rng);
          }
        }
        const interval = calculateSpawnInterval(this.state);
        this.state.spawnTimer = interval * rng.range(0.85, 1.15);
      }
    }

    // 4. Update core simulation entities
    updateCustomers(this.state, this.bus, rng, dt);
    updateMachines(this.state, this.bus, dt);
    updateBaristas(this.state, this.bus, dt);
    updateGoalsProgress(this.state, this.bus);
    checkAchievements(this.state, this.bus);

    // 5. Check day end
    if (this.state.dayTime >= this.state.dayLength) {
      const gracePassed = this.state.dayTime >= this.state.dayLength + 20;
      const noCustomers = this.state.customers.length === 0;
      if (noCustomers || gracePassed) {
        endDay(this.state, this.bus);
      }
    }

    // Guard all stats and critical numbers against NaN
    this.state.money = Number.isFinite(this.state.money) ? this.state.money : 0;
    this.state.rating = Number.isFinite(this.state.rating) ? Math.max(1, Math.min(5, this.state.rating)) : 3;

    // Sync RNG state back
    this.state.rngState = rng.state;
  }
}
