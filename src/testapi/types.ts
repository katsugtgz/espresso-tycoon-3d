import type {
  ActionResult,
  CustomerKind,
  CustomerState,
  DayStats,
  DrinkId,
  GameAction,
  GamePhase,
  GameSpeed,
  GameState,
  Goal,
  MachineSnap,
  Mood,
  OrderSnap,
  StationId,
  TutorialState,
  UpgradeId,
  Vec2,
} from '../types';
import type { AppContext } from '../appTypes';
import type { Violation } from './invariants';

export interface CustomerSummary {
  id: number;
  state: CustomerState;
  pos: Vec2;
  patience: number;
  kind: CustomerKind;
  orderId: number | null;
  mood: Mood;
  seatId: number | null;
  pickupSlot: number | null;
  angry: boolean;
  stateTime: number;
}

export interface SeatSummary {
  id: number;
  tableId: number;
  pos: Vec2;
  occupantId: number | null;
}

export interface GameSummaryState {
  phase: GamePhase;
  paused: boolean;
  speed: GameSpeed;
  money: number;
  day: number;
  clock: string;
  clockMinutes: number;
  time: number;
  dayTime: number;
  rating: number;
  combo: number;
  rush: boolean;
  queue: number[];
  queueCapacity: number;
  customers: CustomerSummary[];
  orders: OrderSnap[];
  machines: MachineSnap[];
  seats: SeatSummary[];
  baristas: any[];
  upgrades: Record<UpgradeId, number>;
  unlockedDrinks: DrinkId[];
  prices: Record<DrinkId, number>;
  tutorial: TutorialState;
  dayStats: DayStats;
  history: DayStats[];
  goals: Goal[];
  achievements: string[];
  fps: number;
  minFps: number;
  entityCounts: {
    customers: number;
    orders: number;
    queue: number;
    machines: number;
    baristas: number;
  };
  renderStats: {
    drawCalls: number;
    triangles: number;
    geometries: number;
    textures: number;
    meshes: number;
  };
}

export interface EventLogEntry {
  t: number;
  name: string;
  payload: any;
}

export interface CapturedError {
  message: string;
  source: string;
  time: number;
}

export interface TestGameActions {
  startGame(opts?: { seed?: number; tutorial?: boolean }): ActionResult;
  clickStation(id: StationId): ActionResult;
  brew(drink: DrinkId): ActionResult;
  serve(machineId?: number): ActionResult;
  buyUpgrade(id: UpgradeId): ActionResult;
  unlockDrink(drink: DrinkId): ActionResult;
  setPrice(drink: DrinkId, price: number): ActionResult;
  setSpeed(speed: GameSpeed): ActionResult;
  advanceTime(simSeconds: number): ActionResult;
  pause(bool: boolean): ActionResult;
  nextDay(): ActionResult;
  skipTutorial(): ActionResult;
  tutorialAck(): ActionResult;
  save(): ActionResult;
  load(): ActionResult;
  resetSave(): ActionResult;
  quitToMenu(): ActionResult;
  dispatch(action: GameAction): ActionResult;
}

export interface TestGameAPI {
  getState(): GameSummaryState;
  getRawState(): GameState;
  actions: TestGameActions;
  events: {
    getEvents(sinceIdx?: number): EventLogEntry[];
    clearEvents(): void;
  };
  errors(): CapturedError[];
  invariants: {
    check(): Violation[];
    violations(): Violation[];
    clear(): void;
  };
  stationScreenPos(id: string): { x: number; y: number } | null;
  version: string;
}

declare global {
  interface Window {
    __game?: TestGameAPI;
    __gameReady?: boolean;
    __errors?: CapturedError[];
    __app?: AppContext;
  }
}
