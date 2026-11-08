import type { BotContext, BotFn } from '../types';
import { getGameState, advanceSimTime, clickTestId } from './helpers';

export const runGreedy: BotFn = async (ctx: BotContext) => {
  const { page, seed, targetDays, log, recordFailure } = ctx;

  log(`Starting greedy bot (seed: ${seed}, targetDays: ${targetDays})`);

  let state = await getGameState(page);
  if (state.phase === 'menu') {
    await page.evaluate((s) => (window as any).__game.actions.startGame({ seed: s, tutorial: false }), seed);
    state = await getGameState(page);
  }

  let totalSimAdvanced = 0;
  const maxSimSeconds = targetDays * 165;
  let idleSamples = 0;
  let totalSamples = 0;

  const upgradePriority = ['machine', 'grinder', 'barista', 'tables', 'decor', 'queue', 'marketing'] as const;
  const drinkPriority = ['mocha', 'cold_brew'] as const;

  while (state.day <= targetDays && state.phase !== 'game_over' && totalSimAdvanced < maxSimSeconds) {
    if (state.phase === 'playing') {
      totalSamples++;

      // Check if idle: pending order with no machine brewing, or 0 customers
      const hasPending = state.orders.some((o) => o.status === 'pending');
      const isBrewing = state.machines.some((m) => m.status === 'brewing');
      if ((hasPending && !isBrewing) || state.customers.length === 0) {
        idleSamples++;
      }

      // Serve ready machines
      const readyMachine = state.machines.find((m) => m.status === 'ready');
      if (readyMachine) {
        await page.evaluate((mid) => (window as any).__game.actions.serve(mid), readyMachine.id);
      }

      // Brew pending orders on idle machines
      const idleMachine = state.machines.find((m) => m.status === 'idle');
      const pendingOrder = state.orders.find((o) => o.status === 'pending');
      if (idleMachine && pendingOrder) {
        await page.evaluate((d) => (window as any).__game.actions.brew(d), pendingOrder.drink);
      }

      await advanceSimTime(page, 0.5);
      totalSimAdvanced += 0.5;
    } else if (state.phase === 'day_end') {
      log(`Day ${state.day} ended. Money: $${state.money.toFixed(2)}, Served: ${state.dayStats.served}`);

      // Try unlocking drinks
      for (const drink of drinkPriority) {
        if (!state.unlockedDrinks.includes(drink)) {
          const cost = drink === 'mocha' ? 250 : 450;
          if (state.money >= cost + 40) {
            await page.evaluate((d) => (window as any).__game.actions.unlockDrink(d), drink);
            state = await getGameState(page);
          }
        }
      }

      // Try purchasing best affordable upgrade
      for (const upId of upgradePriority) {
        const res = await page.evaluate((id) => (window as any).__game.actions.buyUpgrade(id), upId);
        if (res && res.ok) {
          log(`Greedy bot bought upgrade: ${upId}`);
          break; // buy one upgrade per day end to save money buffer
        }
      }

      // Proceed to next day via DOM button or action
      const clickedBtn = await clickTestId(page, 'btn-next-day', 1000);
      if (!clickedBtn) {
        await page.evaluate(() => (window as any).__game.actions.nextDay());
      }
    }

    state = await getGameState(page);
  }

  if (state.phase === 'game_over') {
    recordFailure(`Greedy bot went bankrupt: ${state.dayStats ? 'strikes exceeded' : 'game over'}`);
  }

  if (ctx.metrics) {
    ctx.metrics.idlePercent = totalSamples > 0 ? (idleSamples / totalSamples) * 100 : 0;
  }

  log(`Greedy bot completed. Day: ${state.day}, Final Money: $${state.money.toFixed(2)}`);
};
