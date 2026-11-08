import type { Page } from 'playwright';
import type { GameSummaryState, TestGameAPI } from '../../src/testapi/types';

export function createMulberry32(seed: number): () => number {
  let s = seed | 0;
  return function mulberry32() {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function getGameState(page: Page): Promise<GameSummaryState> {
  return page.evaluate(() => {
    const game = (window as any).__game as TestGameAPI | undefined;
    if (!game) throw new Error('window.__game not installed');
    return game.getState();
  });
}

export async function advanceSimTime(page: Page, seconds: number): Promise<void> {
  await page.evaluate((s) => {
    const game = (window as any).__game as TestGameAPI | undefined;
    if (!game) throw new Error('window.__game not installed');
    game.actions.advanceTime(s);
  }, seconds);
}

export async function waitForTestId(page: Page, testId: string, timeout = 4000): Promise<boolean> {
  try {
    await page.waitForSelector(`[data-testid="${testId}"]`, { timeout, state: 'visible' });
    return true;
  } catch {
    return false;
  }
}

export async function clickTestId(page: Page, testId: string, timeout = 4000): Promise<boolean> {
  try {
    const selector = `[data-testid="${testId}"]`;
    await page.waitForSelector(selector, { timeout, state: 'visible' });
    await page.click(selector);
    return true;
  } catch {
    return false;
  }
}
