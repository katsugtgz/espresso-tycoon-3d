// ============================================================================
// SHARED CONTRACTS — Espresso Tycoon 3D
// Owned by foreman. Workers: DO NOT change existing fields/semantics.
// Additive optional fields allowed only if coordinated via foreman.
// ============================================================================

export type DrinkId = 'espresso' | 'americano' | 'cappuccino' | 'latte' | 'mocha' | 'cold_brew';
/** Hotkey order 1..6 */
export const DRINK_ORDER: DrinkId[] = ['espresso', 'americano', 'cappuccino', 'latte', 'mocha', 'cold_brew'];

/** Floor-plane position. Three.js world: x right, z toward camera/door, y up. */
export interface Vec2 { x: number; z: number }

export type GamePhase = 'menu' | 'playing' | 'day_end' | 'game_over';
export type GameSpeed = 1 | 2 | 4 | 10;

export interface DrinkDef {
  id: DrinkId;
  name: string;
  icon: string;            // emoji glyph for UI
  color: string;           // hex, Okabe-Ito colorblind-safe palette
  shape: 'circle' | 'square' | 'triangle' | 'diamond' | 'star' | 'hexagon'; // secondary cue for colorblind mode
  basePrice: number;       // default sell price $
  ingredientCost: number;  // $ deducted per drink brewed
  prepTime: number;        // base brew seconds (sim time)
  unlockCost: number;      // 0 = unlocked at start
}

export type UpgradeId = 'machine' | 'grinder' | 'tables' | 'barista' | 'decor' | 'queue' | 'marketing';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  desc: string;
  icon: string;            // emoji
  category: 'equipment' | 'staff' | 'cafe';
  maxLevel: number;
  baseCost: number;
  costMult: number;        // cost(level) = round(baseCost * costMult^level)
}

export type CustomerKind = 'regular' | 'vip' | 'picky';
export type CustomerState =
  | 'entering'   // walking door -> queue slot
  | 'queueing'   // in queue line (state.queue), shuffling forward
  | 'ordering'   // at register (queue[0]), order placed after short delay
  | 'waiting'    // at pickup spot, has order, patience ticking
  | 'to_seat'    // served, walking to seat
  | 'seated'     // drinking at seat
  | 'leaving';   // walking to door, then removed
export type Mood = 'happy' | 'neutral' | 'angry';

export interface CustomerSnap {
  id: number;
  kind: CustomerKind;
  variant: number;          // 0..5 visual variant
  state: CustomerState;
  pos: Vec2;
  target: Vec2;
  facing: number;           // radians around Y
  orderId: number | null;
  patience: number;         // 0..1 (1 = full). Ticks down while queueing/ordering/waiting.
  patienceMax: number;      // seconds for full bar
  mood: Mood;
  seatId: number | null;
  pickupSlot: number | null;
  stateTime: number;        // seconds in current state
  angry: boolean;           // leaving due to timeout
}

export type OrderStatus = 'pending' | 'brewing' | 'ready' | 'served' | 'expired';
export interface OrderSnap {
  id: number;
  customerId: number;
  drink: DrinkId;
  status: OrderStatus;
  createdAt: number;        // state.time when placed
  price: number;            // locked price at order time
  machineId: number | null; // set while brewing/ready
}

export type MachineStatus = 'idle' | 'brewing' | 'ready';
export interface MachineSnap {
  id: number;               // == slot index into LAYOUT.machineSlots
  status: MachineStatus;
  orderId: number | null;
  drink: DrinkId | null;
  progress: number;         // 0..1
  brewTime: number;         // seconds for current brew
  claimedBy: number | null; // barista id if barista is handling it
}

export interface SeatSnap { id: number; tableId: number; pos: Vec2; occupantId: number | null }

export interface BaristaSnap {
  id: number;
  pos: Vec2;
  target: Vec2;
  task: 'idle' | 'walking' | 'brewing' | 'serving';
  machineId: number | null;
  cooldown: number;         // seconds until next action
}

export interface DayStats {
  day: number;
  revenue: number;          // drink sales
  tips: number;
  expenses: number;         // ingredients + upgrades purchases this day
  rent: number;             // charged at day end
  wages: number;            // barista wages at day end
  served: number;
  lost: number;             // left angry / timed out
  bestCombo: number;
  ratingStart: number;
  ratingEnd: number;
  timeToFirstSale: number | null; // sim seconds from day start
  profit: number;           // revenue + tips - expenses - rent - wages
}

export interface Goal {
  id: string;
  desc: string;
  metric: 'served' | 'revenue' | 'combo' | 'noLost' | 'tips';
  target: number;
  progress: number;
  reward: number;
  done: boolean;
}

export interface TutorialState {
  active: boolean;
  /** 0 welcome/wait first customer, 1 click machine to brew, 2 wait brew, 3 click machine to serve, 4 open shop & buy, 5 done */
  step: number;
  done: boolean;
}

export interface GameState {
  version: number;          // SAVE_VERSION
  seed: number;
  rngState: number;
  phase: GamePhase;
  paused: boolean;
  speed: GameSpeed;
  time: number;             // total sim seconds since new game
  day: number;              // 1-based
  dayTime: number;          // sim seconds elapsed in current day
  dayLength: number;        // sim seconds per day
  clockMinutes: number;     // 480 (08:00) .. 1200 (20:00), derived from dayTime
  money: number;
  rating: number;           // 1..5
  combo: number;
  rush: boolean;            // rush hour active
  unlockedDrinks: DrinkId[];
  prices: Record<DrinkId, number>;
  upgrades: Record<UpgradeId, number>;
  customers: CustomerSnap[];
  queue: number[];          // customer ids; queue[0] is at register
  queueCapacity: number;
  orders: OrderSnap[];      // active orders only (pending/brewing/ready); served/expired removed
  machines: MachineSnap[];
  seats: SeatSnap[];
  baristas: BaristaSnap[];
  dayStats: DayStats;
  history: DayStats[];
  goals: Goal[];
  achievements: string[];   // unlocked achievement ids
  tutorial: TutorialState;
  bankruptStrikes: number;  // consecutive day-ends with money < 0
  lowRatingStrikes?: number; // consecutive day-ends with rating < 1.5
  gameOverReason: string | null;
  nextId: number;
  spawnTimer: number;
  stats: { totalServed: number; totalRevenue: number; totalTips: number; totalLost: number; maxCombo: number };
}

// ---------------------------------------------------------------------------
// Actions (UI / renderer / test API -> sim). sim.dispatch(action) -> ActionResult
// ---------------------------------------------------------------------------
/** Station ids: 'machine:<id>' | 'grinder' | 'counter' | 'register' | 'table:<id>' */
export type StationId = string;
/**
 * Typed station intent: what a click means, without the string encoding.
 * The sim module owns string parsing (StationId -> StationIntent) plus branch
 * ordering from here inward, so callers pass an intent they cannot misspell
 * instead of a formatted string.
 */
export type StationIntent =
  | { kind: 'machine'; id: number }
  | { kind: 'counter' }
  | { kind: 'register' }
  | { kind: 'grinder' }
  | { kind: 'table'; index: number };

export type GameAction =
  | { type: 'newGame'; seed?: number; tutorial?: boolean }
  | { type: 'clickStation'; stationId: StationId }   // one-click flow: idle machine -> brew oldest pending order; ready machine -> serve (string edge: parsed to intent inside sim)
  | { type: 'clickStationIntent'; intent: StationIntent }  // typed intent: parsing + ordering owned inside sim module; preferred for new callers
  | { type: 'brew'; drink: DrinkId }                   // hotkey: start brewing oldest pending order of this drink on first idle machine
  | { type: 'serve'; machineId?: number }              // serve a ready machine (default: first ready)
  | { type: 'buyUpgrade'; id: UpgradeId }
  | { type: 'unlockDrink'; drink: DrinkId }
  | { type: 'setPrice'; drink: DrinkId; price: number }
  | { type: 'setSpeed'; speed: GameSpeed }
  | { type: 'pause'; paused: boolean }
  | { type: 'startNextDay' }
  | { type: 'skipTutorial' }
  | { type: 'tutorialAck' };                           // UI "Next"/"Got it" for message-only tutorial steps (0 and 4)

export interface ActionResult { ok: boolean; reason?: string }

/** Minimal sim surface used by renderer/UI/test API (decouples from impl). */
export interface ISim {
  readonly state: GameState;
  dispatch(action: GameAction): ActionResult;
  /** real-time advance: applies speed, fixed steps; no-op unless phase==='playing' && !paused */
  advance(realDt: number): void;
  /** synchronous sim-time advance for tests (ignores pause, respects phase) */
  advanceTime(simSeconds: number): void;
  serialize(): GameState;
  load(data: unknown): boolean;
  upgradeCost(id: UpgradeId): number;   // Infinity if maxed
}

// ---------------------------------------------------------------------------
// Settings (persisted separately: localStorage 'espresso-tycoon-settings')
// ---------------------------------------------------------------------------
export interface Settings {
  master: number;   // 0..1
  sfx: number;
  music: number;
  ambient: number;
  musicOn: boolean;
  quality: 'low' | 'medium' | 'high';
  colorblind: boolean;
  uiScale: number;  // 0.8..1.4
  reducedMotion: boolean;
  showFps: boolean;
}

// ---------------------------------------------------------------------------
// Events (EventBus<GameEvents>). Sim emits gameplay events; UI/renderer emit ui:*.
// ---------------------------------------------------------------------------
export interface GameEvents {
  'game:new': { seed: number };
  'game:loaded': { day: number };
  'game:over': { reason: string };
  'game:paused': { paused: boolean };
  'speed:change': { speed: GameSpeed };
  'day:start': { day: number };
  'day:end': { stats: DayStats };
  'rush:start': {};
  'rush:end': {};
  'customer:spawn': { id: number; kind: CustomerKind };
  'customer:emote': { id: number; emote: 'happy' | 'love' | 'angry' | 'impatient' | 'thinking' | 'wow' };
  'customer:leave': { id: number; angry: boolean };
  'order:placed': { orderId: number; customerId: number; drink: DrinkId };
  'order:expired': { orderId: number; customerId: number; drink: DrinkId };
  'brew:start': { machineId: number; drink: DrinkId; orderId: number; byBarista: boolean };
  'brew:done': { machineId: number; drink: DrinkId; orderId: number };
  'order:served': { orderId: number; customerId: number; drink: DrinkId; price: number; tip: number; combo: number; pos: Vec2; byBarista: boolean };
  'money:change': { money: number; delta: number; reason: string; pos?: Vec2 };
  'rating:change': { rating: number; delta: number };
  'combo:change': { combo: number };
  'combo:break': { lost: number };
  'upgrade:bought': { id: UpgradeId; level: number };
  'drink:unlocked': { drink: DrinkId };
  'achievement': { id: string; name: string; desc: string };
  'goal:complete': { id: string; desc: string; reward: number };
  'tutorial:step': { step: number };
  'action:fail': { action: GameAction['type']; reason: string };
  'toast': { text: string; kind: 'info' | 'good' | 'bad' | 'unlock' };
  'ui:click': {};
  'ui:hover': { stationId: StationId | null };
  'ui:open': { panel: string };
  'settings:change': { settings: Settings };
  'error': { message: string; source?: string };
}
