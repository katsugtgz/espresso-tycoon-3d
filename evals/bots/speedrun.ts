import type { BotContext, BotFn } from '../types';
import { getGameState, clickTestId } from './helpers';

export const runSpeedrun: BotFn = async (ctx: BotContext) => {
  const { page, seed, targetDays, log } = ctx;

  log(`Starting speedrun-10x bot (seed: ${seed}, targetDays: ${targetDays})`);

  let state = await getGameState(page);
  if (state.phase === 'menu') {
    await page.evaluate((s) => (window as any).__game.actions.startGame({ seed: s, tutorial: false }), seed);
  }

  // Set speed to 10x
  await page.evaluate(() => (window as any).__game.actions.setSpeed(10));
  state = await getGameState(page);

  const startTime = Date.now();
  const maxRealTimeMs = targetDays * 35000; // under SwiftShader 10x can run ~35-50s per 3 days
  let lastBrewAttemptOrderId: number | null = null;

  while (state.day <= targetDays && state.phase !== 'game_over' && Date.now() - startTime < maxRealTimeMs) {
    if (state.phase === 'playing') {
      // Check ready machines to serve
      const readyMachine = state.machines.find((m) => m.status === 'ready');
      if (readyMachine) {
        await page.evaluate((mid) => (window as any).__game.actions.serve(mid), readyMachine.id);
      }

      // Check pending orders to brew
      const idleMachine = state.machines.find((m) => m.status === 'idle');
      const pendingOrder = state.orders.find((o) => o.status === 'pending');
      if (idleMachine && pendingOrder) {
        // Try clicking ticket testid with low timeout (25ms) once per order id to avoid stalling frame loop
        if (lastBrewAttemptOrderId !== pendingOrder.id) {
          lastBrewAttemptOrderId = pendingOrder.id;
          const ticketId = `ticket-${pendingOrder.id}`;
          const clickedTicket = await clickTestId(page, ticketId, 25);
          if (!clickedTicket) {
            await page.evaluate((d) => (window as any).__game.actions.brew(d), pendingOrder.drink);
          }
        } else {
          await page.evaluate((d) => (window as any).__game.actions.brew(d), pendingOrder.drink);
        }
      }

      // Sleep a tiny real-time slice for browser animation frames
      await page.waitForTimeout(50);
    } else if (state.phase === 'day_end') {
      log(`Speedrun day ${state.day} ended. Advancing... (elapsed: ${((Date.now() - startTime) / 1000).toFixed(1)}s, money: $${state.money.toFixed(2)}, served: ${state.dayStats?.served ?? 0})`);
      const clicked = await clickTestId(page, 'btn-next-day', 1000);
      if (!clicked) {
        await page.evaluate(() => (window as any).__game.actions.nextDay());
      }
      await page.waitForTimeout(100);
    }

    state = await getGameState(page);
  }

  log(`Speedrun bot completed at day ${state.day}. Real-time elapsed: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
};
