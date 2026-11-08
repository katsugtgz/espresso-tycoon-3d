import type { BotContext, BotFn } from '../types';
import { createMulberry32, getGameState, advanceSimTime } from './helpers';

export const runRandomClicker: BotFn = async (ctx: BotContext) => {
  const { page, seed, targetDays, log } = ctx;
  const rng = createMulberry32(seed);

  log(`Starting random-clicker bot (seed: ${seed}, targetDays: ${targetDays})`);

  // Start new game if in menu
  let state = await getGameState(page);
  if (state.phase === 'menu') {
    await page.evaluate((s) => (window as any).__game.actions.startGame({ seed: s, tutorial: false }), seed);
    state = await getGameState(page);
  }

  // Get canvas box for real mouse clicks
  const canvas = page.locator('#webgl-canvas');
  const box = await canvas.boundingBox().catch(() => null);

  const keys = ['1', '2', '3', '4', 'Space', 'f', 'b', 'Escape'];

  let totalSimAdvanced = 0;
  const maxSimSeconds = targetDays * 175; // 150s per day + buffer

  let iteration = 0;
  while (state.day <= targetDays && state.phase !== 'game_over' && totalSimAdvanced < maxSimSeconds) {
    iteration++;

    // If accidentally in menu, restart game
    if (state.phase === 'menu') {
      await page.evaluate((s) => (window as any).__game.actions.startGame({ seed: s, tutorial: false }), seed);
      state = await getGameState(page);
    }

    // Close any open modal overlays and unpause so the game loop keeps progressing
    const hasModal = await page.locator('.modal-backdrop:visible').count().catch(() => 0);
    if (hasModal > 0) {
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(20);
    }
    state = await getGameState(page);
    if (state.paused) {
      await page.evaluate(() => (window as any).__game.actions.pause(false)).catch(() => {});
      state = await getGameState(page);
    }

    // 1. Advance sim time by a small chunk (0.5 to 1.5s)
    const dt = 0.5 + rng() * 1.0;
    await advanceSimTime(page, dt);
    totalSimAdvanced += dt;

    // 2. Perform a random action: click canvas, click button, or press key
    const choice = rng();
    if (choice < 0.4 && box) {
      // Random click on canvas
      const cx = box.x + rng() * box.width;
      const cy = box.y + rng() * box.height;
      await page.mouse.click(cx, cy).catch(() => {});
    } else if (choice < 0.7) {
      // Random DOM button or ticket click if visible & enabled, avoiding quit buttons
      const buttons = await page.$$(
        'button:visible:not([disabled]):not(#btn-pause-quit):not([data-testid="btn-pause-quit"]), .order-ticket:visible'
      );
      if (buttons.length > 0) {
        const idx = Math.floor(rng() * buttons.length);
        await buttons[idx].click({ timeout: 250 }).catch(() => {});
      }
    } else {
      // Random key press
      const key = keys[Math.floor(rng() * keys.length)];
      await page.keyboard.press(key).catch(() => {});
    }

    state = await getGameState(page);

    // If day ended, click next day
    if (state.phase === 'day_end') {
      await page.evaluate(() => (window as any).__game.actions.nextDay());
      state = await getGameState(page);
    }
  }

  log(`Random-clicker completed. Final day: ${state.day}, money: ${state.money}`);
};
