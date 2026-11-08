import type { BotContext, BotFn } from '../types';
import { getGameState } from './helpers';

export const runResizeBlur: BotFn = async (ctx: BotContext) => {
  const { page, seed, log, recordFailure } = ctx;

  log(`Starting resize-blur bot (seed: ${seed})`);

  let state = await getGameState(page);
  if (state.phase === 'menu') {
    await page.evaluate((s) => (window as any).__game.actions.startGame({ seed: s, tutorial: false }), seed);
    state = await getGameState(page);
  }

  // 1. Multiple viewport resizes
  const viewports = [
    { width: 800, height: 600 },
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
    { width: 375, height: 667 }, // mobile portrait
  ];

  for (const vp of viewports) {
    log(`Testing viewport resize: ${vp.width}x${vp.height}`);
    await page.setViewportSize(vp);
    await page.waitForTimeout(150);

    const canvasBox = await page.locator('#webgl-canvas').boundingBox();
    if (!canvasBox || canvasBox.width <= 0 || canvasBox.height <= 0) {
      recordFailure(`Canvas invalid or zero dimension after resize to ${vp.width}x${vp.height}`);
    }

    const errors = await page.evaluate(() => (window as any).__game.errors());
    if (errors && errors.length > 0) {
      recordFailure(`Errors captured during resize to ${vp.width}x${vp.height}: ${JSON.stringify(errors[0])}`);
    }
  }

  // Restore standard viewport
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(100);

  // 2. Tab hidden / visibilitychange auto-pause
  log('Testing visibilitychange hidden auto-pause...');
  await page.evaluate(() => (window as any).__game.actions.pause(false));
  state = await getGameState(page);

  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(150);

  state = await getGameState(page);
  if (!state.paused) {
    recordFailure('Game did not automatically pause when tab became hidden (visibilitychange)');
  } else {
    log('Game successfully auto-paused on visibilitychange hidden');
  }

  // Restore visibility
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(100);

  log('Resize-blur validation passed');
};
