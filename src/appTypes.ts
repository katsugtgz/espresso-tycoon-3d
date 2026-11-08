import type { EventBus } from './core/events';
import type { GameEvents, ISim, Settings, Vec2 } from './types';

/** Renderer surface used by UI / test API. Implemented by render/GameRenderer.ts */
export interface IRenderer {
  update(dt: number): void;
  resize(): void;
  setQuality(q: Settings['quality']): void;
  resetCamera(): void;
  /** project floor pos (+height y) to CSS pixels relative to canvas/viewport */
  worldToScreen(pos: Vec2, y?: number): { x: number; y: number; visible: boolean };
  /** screen-space center of a station (for tutorial arrows); null if unknown */
  stationScreenPos(stationId: string): { x: number; y: number } | null;
  getHoveredStation(): string | null;
  getStats(): { drawCalls: number; triangles: number; geometries: number; textures: number; meshes: number };
  /** set by main: called when user clicks a station in 3D (main forwards to sim.dispatch) */
  onStationClick: ((stationId: string) => void) | null;
}

/** App-level hooks given to UI (menus) & test API */
export interface AppHooks {
  newGame(opts?: { seed?: number; tutorial?: boolean }): void;
  continueGame(): boolean;   // load save -> playing. false if none/invalid
  hasSave(): boolean;
  save(): boolean;           // manual save
  resetSave(): void;         // wipe save
  quitToMenu(): void;        // save + phase 'menu'
  getSettings(): Settings;
  applySettings(patch: Partial<Settings>): void; // persists + emits settings:change
  resetCamera(): void;
}

export interface PerfStats { fps: number; frameMs: number; minFps: number; frames: number }

export interface AppContext {
  sim: ISim;
  bus: EventBus<GameEvents>;
  renderer: IRenderer;
  hooks: AppHooks;
  perf: PerfStats;
  testMode: boolean;
  seed: number | null;
}
