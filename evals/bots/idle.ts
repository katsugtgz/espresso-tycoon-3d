import type { BotContext, BotFn } from '../types';
import { getGameState, advanceSimTime, clickTestId } from './helpers';

export const runIdle: BotFn = async (ctx: BotContext) => {
  const { page, seed, targetDays, log } = ctx;

  log(`Starting idle bot (seed: ${seed}, targetDays: ${targetDays})`);

  let state = await getGameState(page);
  if (state.phase === 'menu') {
    await page.evaluate((s) => (window as any).__game.actions.startGame({ seed: s, tutorial: false }), seed);
    state = await getGameState(page);
  }

  let totalSimAdvanced = 0;
  const maxSimSeconds = targetDays * 175;

  while (state.day <= targetDays && state.phase !== 'game_over' && totalSimAdvanced < maxSimSeconds) {
    if (state.phase === 'playing') {
      // Step through time without interacting
      await advanceSimTime(page, 1.0);
      totalSimAdvanced += 1.0;
    } else if (state.phase === 'day_end') {
      log(`Idle day ${state.day} ended. Money: $${state.money.toFixed(2)}`);
      const clicked = await clickTestId(page, 'btn-next-day', 1000);
      if (!clicked) {
        await page.evaluate(() => (window as any).__game.actions.nextDay());
      }
    }

    state = await getGameState(page);
  }

  log(`Idle bot finished at day ${state.day}. Phase: ${state.phase}, Money: $${state.money.toFixed(2)}`);
};
