import type { BotContext, BotFn } from '../types';
import { getGameState, waitForTestId } from './helpers';

export const runKeyboard: BotFn = async (ctx: BotContext) => {
  const { page, seed, log, recordFailure } = ctx;

  log(`Starting keyboard bot (seed: ${seed})`);

  let state = await getGameState(page);
  if (state.phase === 'menu') {
    await page.evaluate((s) => (window as any).__game.actions.startGame({ seed: s, tutorial: false }), seed);
    state = await getGameState(page);
  }

  // 1. Space: toggle pause
  const initialPaused = state.paused;
  await page.keyboard.press('Space');
  await page.waitForTimeout(100);
  state = await getGameState(page);
  if (state.paused === initialPaused) {
    recordFailure(`Space bar did not toggle pause state (expected ${!initialPaused}, got ${state.paused})`);
  }
  // Toggle back
  await page.keyboard.press('Space');
  await page.waitForTimeout(100);
  state = await getGameState(page);

  // 2. 'f': cycle speed
  const initialSpeed = state.speed;
  await page.keyboard.press('f');
  await page.waitForTimeout(100);
  state = await getGameState(page);
  if (state.speed === initialSpeed) {
    recordFailure(`Key 'f' did not cycle game speed (remained ${initialSpeed})`);
  }
  log(`Speed cycled from ${initialSpeed} to ${state.speed}`);

  // 3. 'Escape': toggle pause menu
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const pauseMenuVisible = await waitForTestId(page, 'pause-menu', 2000);
  if (!pauseMenuVisible) {
    recordFailure("Pressing 'Escape' did not open pause menu [data-testid=\"pause-menu\"]");
  } else {
    log("Pause menu opened via 'Escape'");
  }
  // Close pause menu
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // 4. 'b': toggle shop panel
  await page.keyboard.press('b');
  await page.waitForTimeout(200);
  const shopPanelVisible = await waitForTestId(page, 'shop-panel', 2000);
  if (!shopPanelVisible) {
    recordFailure("Pressing 'b' did not open shop panel [data-testid=\"shop-panel\"]");
  } else {
    log("Shop panel opened via 'b'");
  }
  // Close shop panel
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // 5. '1': trigger brew espresso
  await page.keyboard.press('1');
  await page.waitForTimeout(100);

  log('Keyboard hotkey validation completed');
};
