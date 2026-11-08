import type { BotContext, BotFn } from '../types';
import { getGameState, advanceSimTime, clickTestId } from './helpers';

export const runSaveLoad: BotFn = async (ctx: BotContext) => {
  const { page, seed, log, recordFailure } = ctx;

  log(`Starting save-load bot (seed: ${seed})`);

  let state = await getGameState(page);
  if (state.phase === 'menu') {
    await page.evaluate((s) => (window as any).__game.actions.startGame({ seed: s, tutorial: false }), seed);
    state = await getGameState(page);
  }

  // Play 1 day
  let simTime = 0;
  while (state.day === 1 && state.phase !== 'game_over' && simTime < 165) {
    // Serve ready
    const readyMachine = state.machines.find((m) => m.status === 'ready');
    if (readyMachine) {
      await page.evaluate((mid) => (window as any).__game.actions.serve(mid), readyMachine.id);
    }
    // Brew pending
    const idleMachine = state.machines.find((m) => m.status === 'idle');
    const pendingOrder = state.orders.find((o) => o.status === 'pending');
    if (idleMachine && pendingOrder) {
      await page.evaluate((d) => (window as any).__game.actions.brew(d), pendingOrder.drink);
    }

    await advanceSimTime(page, 1.0);
    simTime += 1.0;
    state = await getGameState(page);
  }

  // If in day_end, proceed to day 2 or save now
  if (state.phase === 'day_end') {
    await page.evaluate(() => (window as any).__game.actions.nextDay());
    state = await getGameState(page);
  }

  // Explicitly call save
  log('Saving game state...');
  const saveRes = await page.evaluate(() => (window as any).__game.actions.save());
  if (!saveRes || !saveRes.ok) {
    recordFailure(`actions.save() failed: ${saveRes?.reason}`);
  }

  const savedState = {
    money: state.money,
    day: state.day,
    upgrades: { ...state.upgrades },
    unlockedDrinks: [...state.unlockedDrinks],
  };

  log(`Saved state: Day ${savedState.day}, Money: $${savedState.money.toFixed(2)}`);

  // Reload page
  log('Reloading page...');
  await page.reload();
  await page.waitForFunction(() => (window as any).__gameReady === true, { timeout: 10000 });

  // Continue game via DOM button or load action
  const clickedContinue = await clickTestId(page, 'btn-continue', 2000);
  if (!clickedContinue) {
    const loadRes = await page.evaluate(() => (window as any).__game.actions.load());
    if (!loadRes || !loadRes.ok) {
      recordFailure(`actions.load() failed: ${loadRes?.reason}`);
    }
  }

  const loadedState = await getGameState(page);
  log(`Loaded state: Day ${loadedState.day}, Money: $${loadedState.money.toFixed(2)}`);

  // Assertions
  if (loadedState.day !== savedState.day) {
    recordFailure(`Save/load day mismatch: saved Day ${savedState.day}, loaded Day ${loadedState.day}`);
  }
  if (Math.abs(loadedState.money - savedState.money) > 0.05) {
    recordFailure(`Save/load money mismatch: saved $${savedState.money.toFixed(2)}, loaded $${loadedState.money.toFixed(2)}`);
  }
  if (JSON.stringify(loadedState.upgrades) !== JSON.stringify(savedState.upgrades)) {
    recordFailure(`Save/load upgrades mismatch: saved ${JSON.stringify(savedState.upgrades)}, loaded ${JSON.stringify(loadedState.upgrades)}`);
  }

  log('Save/load validation passed');
};
