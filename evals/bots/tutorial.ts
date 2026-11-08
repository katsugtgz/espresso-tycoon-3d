import type { BotContext, BotFn } from '../types';
import { getGameState, clickTestId, waitForTestId, advanceSimTime } from './helpers';

export const runTutorial: BotFn = async (ctx: BotContext) => {
  const { page, seed, log, recordFailure } = ctx;

  log(`Starting tutorial bot (seed: ${seed})`);

  // Start new game with tutorial enabled
  await page.evaluate((s) => (window as any).__game.actions.startGame({ seed: s, tutorial: true }), seed);

  let state = await getGameState(page);
  const cardVisible = await waitForTestId(page, 'tutorial-card', 5000);
  if (!cardVisible) {
    recordFailure('Missing required DOM element with data-testid="tutorial-card"');
  }

  // Step 0: Welcome / wait customer order
  log(`Tutorial step: ${state.tutorial.step}`);
  let waitCustomerCount = 0;
  while (state.tutorial.step === 0 && waitCustomerCount < 30) {
    await advanceSimTime(page, 0.5);
    state = await getGameState(page);
    waitCustomerCount++;
    if (state.orders.length > 0) {
      // Order placed, acknowledge tutorial step 0
      const nextClicked = await clickTestId(page, 'btn-tutorial-next', 1000);
      if (!nextClicked) {
        await page.evaluate(() => (window as any).__game.actions.tutorialAck());
      }
      break;
    }
  }

  state = await getGameState(page);
  log(`After step 0 -> current step: ${state.tutorial.step}`);

  // Step 1: Click machine to brew using stationScreenPos('machine:0')
  if (state.tutorial.step === 1) {
    const pos = await page.evaluate(() => (window as any).__game.stationScreenPos('machine:0'));
    if (pos && pos.x > 0 && pos.y > 0) {
      log(`Real click on machine:0 at (${pos.x}, ${pos.y})`);
      await page.mouse.click(pos.x, pos.y);
    } else {
      log('stationScreenPos returned null or invalid, falling back to clickStation action');
      await page.evaluate(() => (window as any).__game.actions.clickStation('machine:0'));
    }
  }

  // Step 2: Wait for brewing
  let brewWait = 0;
  while (brewWait < 20) {
    await advanceSimTime(page, 0.5);
    state = await getGameState(page);
    brewWait++;
    if (state.tutorial.step === 3 || state.machines.some((m) => m.status === 'ready')) {
      break;
    }
  }

  state = await getGameState(page);
  log(`After step 2 -> current step: ${state.tutorial.step}`);

  // Step 3: Click machine to serve
  if (state.tutorial.step === 3 || state.machines.some((m) => m.status === 'ready')) {
    const pos = await page.evaluate(() => (window as any).__game.stationScreenPos('machine:0'));
    if (pos && pos.x > 0 && pos.y > 0) {
      log(`Real click on machine:0 to serve at (${pos.x}, ${pos.y})`);
      await page.mouse.click(pos.x, pos.y);
    } else {
      await page.evaluate(() => (window as any).__game.actions.serve(0));
    }
  }

  // Step 4: Open shop & buy
  await advanceSimTime(page, 0.5);
  state = await getGameState(page);
  log(`After step 3 -> current step: ${state.tutorial.step}`);

  if (state.tutorial.step === 4) {
    const shopClicked = await clickTestId(page, 'btn-shop', 2000);
    if (!shopClicked) {
      recordFailure('Failed to click btn-shop during tutorial step 4');
    }
    await waitForTestId(page, 'shop-panel', 2000);

    // Try clicking an upgrade or ack
    const ackClicked = await clickTestId(page, 'btn-tutorial-next', 1000);
    if (!ackClicked) {
      await page.evaluate(() => (window as any).__game.actions.tutorialAck());
    }
  }

  await advanceSimTime(page, 0.5);
  state = await getGameState(page);
  log(`Final tutorial state: step=${state.tutorial.step}, done=${state.tutorial.done}`);

  if (!state.tutorial.done) {
    recordFailure(`Tutorial did not complete (step: ${state.tutorial.step}, done: ${state.tutorial.done})`);
  }
};
