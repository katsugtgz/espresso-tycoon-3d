import { EventBus } from './core/events';
import { loadSettings, saveSettings } from './core/settings';
import { Simulation } from './sim/Simulation';
import { saveGame, loadGame, hasSave, clearSave } from './sim/save';
import { parseStationId } from './sim/stations';
import { GameRenderer } from './render/GameRenderer';
import { UIManager } from './ui/UIManager';
import { AudioManager } from './audio/AudioManager';
import type { AppContext, AppHooks, PerfStats } from './appTypes';
import type { GameEvents, Settings } from './types';

const params = new URLSearchParams(location.search);
const testMode = params.get('test') === '1';
const seedParam = params.get('seed');
const seed = seedParam !== null && !isNaN(Number(seedParam)) ? Number(seedParam) : null;

// Early error capture (test API reads window.__errors)
const errors: { message: string; source: string; time: number }[] = ((window as any).__errors = []);
window.addEventListener('error', (e) => errors.push({ message: String(e.message), source: 'window.error', time: Date.now() }));
window.addEventListener('unhandledrejection', (e) => errors.push({ message: String((e as PromiseRejectionEvent).reason), source: 'unhandledrejection', time: Date.now() }));

const bus = new EventBus<GameEvents>();
bus.on('error', (e) => errors.push({ message: e.message, source: e.source ?? 'bus', time: Date.now() }));

let settings: Settings = loadSettings();
const sim = new Simulation(bus);
const canvas = document.getElementById('webgl-canvas') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui-root') as HTMLElement;
const renderer = new GameRenderer(canvas, sim, bus);
renderer.setQuality(settings.quality);
renderer.onStationClick = (stationId) => {
  // Render speaks strings (picking domain); the sim module owns parsing, so
  // convert at this edge to a typed intent and dispatch that. Unparseable
  // strings fall back to the legacy edge, which reports invalid_station.
  const intent = parseStationId(stationId);
  const r = intent
    ? sim.dispatch({ type: 'clickStationIntent', intent })
    : sim.dispatch({ type: 'clickStation', stationId });
  bus.emit('ui:click', {});
  if (!r.ok && r.reason) bus.emit('action:fail', { action: 'clickStation', reason: r.reason });
};
const audio = new AudioManager(bus);
audio.applySettings(settings);

const hooks: AppHooks = {
  newGame(opts) {
    sim.dispatch({ type: 'newGame', seed: opts?.seed ?? seed ?? undefined, tutorial: opts?.tutorial ?? true });
  },
  continueGame() {
    const data = loadGame();
    if (!data || !sim.load(data)) return false;
    bus.emit('game:loaded', { day: sim.state.day });
    return true;
  },
  hasSave,
  save() {
    if (sim.state.phase === 'menu') return false;
    return saveGame(sim.serialize());
  },
  resetSave() { clearSave(); },
  quitToMenu() {
    if (sim.state.phase === 'playing' || sim.state.phase === 'day_end') saveGame(sim.serialize());
    (sim.state as any).phase = 'menu';
    sim.dispatch({ type: 'pause', paused: false });
  },
  getSettings: () => ({ ...settings }),
  applySettings(patch) {
    settings = { ...settings, ...patch };
    saveSettings(settings);
    renderer.setQuality(settings.quality);
    audio.applySettings(settings);
    bus.emit('settings:change', { settings: { ...settings } });
  },
  resetCamera() { renderer.resetCamera(); },
};

// Autosave at day end
bus.on('day:end', () => { saveGame(sim.serialize()); });

const ui = new UIManager(uiRoot, sim, bus, renderer, hooks);

const perf: PerfStats = { fps: 60, frameMs: 16.7, minFps: 60, frames: 0 };
const ctx: AppContext = { sim, bus, renderer, hooks, perf, testMode, seed };
(window as any).__app = testMode ? ctx : undefined;

if (testMode) {
  import('./testapi/install').then((m) => m.installTestAPI(ctx)).catch((e) => errors.push({ message: String(e), source: 'testapi', time: Date.now() }));
}

// Auto-pause on tab blur
document.addEventListener('visibilitychange', () => {
  if (document.hidden && sim.state.phase === 'playing' && !sim.state.paused) {
    sim.dispatch({ type: 'pause', paused: true });
    bus.emit('toast', { text: 'Paused (tab hidden)', kind: 'info' });
  }
});
window.addEventListener('blur', () => {
  if (sim.state.phase === 'playing' && !sim.state.paused && !testMode) sim.dispatch({ type: 'pause', paused: true });
});
window.addEventListener('resize', () => renderer.resize());

// Main loop
let last = performance.now();
let fpsAcc = 0, fpsFrames = 0, warm = 0;
function frame(now: number) {
  const rawDt = (now - last) / 1000;
  last = now;
  const dt = Math.min(rawDt, 0.1);
  try {
    sim.advance(dt);
    renderer.update(dt);
    ui.update(dt);
  } catch (e) {
    console.error(e);
    errors.push({ message: String((e as Error)?.stack ?? e), source: 'loop', time: Date.now() });
  }
  fpsAcc += rawDt; fpsFrames++; perf.frames++;
  if (fpsAcc >= 0.5) {
    perf.fps = fpsFrames / fpsAcc;
    perf.frameMs = (fpsAcc / fpsFrames) * 1000;
    warm++;
    if (warm > 4 && !document.hidden) perf.minFps = Math.min(perf.minFps, perf.fps);
    fpsAcc = 0; fpsFrames = 0;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
