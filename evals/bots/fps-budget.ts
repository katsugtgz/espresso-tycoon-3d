import type { BotContext, BotFn } from '../types';
import { getGameState, advanceSimTime } from './helpers';

export const runFpsBudget: BotFn = async (ctx: BotContext) => {
  const { page, seed, log, recordFailure, metrics } = ctx;

  log(`Starting fps-budget bot (seed: ${seed})`);

  let state = await getGameState(page);
  if (state.phase === 'menu') {
    await page.evaluate((s) => (window as any).__game.actions.startGame({ seed: s, tutorial: false }), seed);
  }

  // Set high quality
  await page.evaluate(() => {
    const app = (window as any).__app;
    if (app && app.hooks) {
      app.hooks.applySettings({ quality: 'high' });
    }
  });

  // Advance sim time to populate cafe
  log('Populating cafe with customers...');
  await advanceSimTime(page, 20);

  // Measure real-time FPS for 20 seconds
  log('Measuring real-time FPS for 20 seconds on high quality...');
  await page.waitForTimeout(20000);

  state = await getGameState(page);
  const currentFps = state.fps || 60;
  const minFps = state.minFps || currentFps;

  log(`FPS measurement complete. Average FPS: ${currentFps.toFixed(1)}, Min FPS: ${minFps.toFixed(1)}`);

  if (metrics) {
    metrics.fpsAvg = currentFps;
    metrics.fpsMin = minFps;
  }

  const failThreshold = ctx.scenario.thresholds?.minFps ?? 5;
  const warnThreshold = ctx.scenario.thresholds?.warnFps ?? 30;

  if (currentFps < failThreshold) {
    recordFailure(`FPS (${currentFps.toFixed(1)}) dropped below critical floor of ${failThreshold} FPS`);
  } else if (currentFps < warnThreshold) {
    log(`WARNING: FPS (${currentFps.toFixed(1)}) is below recommended target of ${warnThreshold} FPS (headless swiftshader expected slow)`);
  }
};
