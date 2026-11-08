import type { BotContext, BotFn } from '../types';
import { getGameState, advanceSimTime, clickTestId } from './helpers';
import type { UpgradeId } from '../../src/types';

export const runUpgradeSpammer: BotFn = async (ctx: BotContext) => {
  const { page, seed, targetDays, log } = ctx;

  log(`Starting upgrade-spammer bot (seed: ${seed}, targetDays: ${targetDays})`);

  let state = await getGameState(page);
  if (state.phase === 'menu') {
    await page.evaluate((s) => (window as any).__game.actions.startGame({ seed: s, tutorial: false }), seed);
    state = await getGameState(page);
  }

  const allUpgrades: UpgradeId[] = ['machine', 'grinder', 'barista', 'tables', 'decor', 'queue', 'marketing'];
  let totalSimAdvanced = 0;
  const maxSimSeconds = targetDays * 165;

  const trySpamUpgrades = async () => {
    let boughtAny = true;
    while (boughtAny) {
      boughtAny = false;
      for (const u of allUpgrades) {
        const res = await page.evaluate((id) => (window as any).__game.actions.buyUpgrade(id), u);
        if (res && res.ok) {
          boughtAny = true;
          log(`Spammed upgrade: ${u}`);
        }
      }
    }
  };

  while (state.day <= targetDays && state.phase !== 'game_over' && totalSimAdvanced < maxSimSeconds) {
    if (state.phase === 'playing') {
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

      await advanceSimTime(page, 0.5);
      totalSimAdvanced += 0.5;

      // Periodically attempt to spam upgrades during the day
      if (Math.floor(totalSimAdvanced) % 5 === 0) {
        await trySpamUpgrades();
      }
    } else if (state.phase === 'day_end') {
      log(`Day ${state.day} ended. Spamming upgrades...`);
      await trySpamUpgrades();

      const clicked = await clickTestId(page, 'btn-next-day', 1000);
      if (!clicked) {
        await page.evaluate(() => (window as any).__game.actions.nextDay());
      }
    }

    state = await getGameState(page);
  }

  log(`Upgrade-spammer completed at day ${state.day}. Upgrades: ${JSON.stringify(state.upgrades)}`);
};
