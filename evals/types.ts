import type { Page } from 'playwright';
import type { Violation } from '../src/testapi/invariants';

export interface ScenarioConfig {
  name: string;
  bot: string;
  seeds: number[];
  days: number;
  speed: number;
  checks: string[];
  thresholds: Record<string, any>;
}

export interface RunMetrics {
  scenario: string;
  seed: number;
  pass: boolean;
  failureReasons: string[];
  timeToFirstSale: number | null;
  idlePercent: number;
  moneyCurve: number[];
  servedPerDay: number[];
  lostPerDay: number[];
  finalMoney: number;
  finalDay: number;
  impossibleWin: boolean;
  impossibleLose: boolean;
  consoleErrors: number;
  violationsCount: number;
  violations: Violation[];
  fpsAvg: number;
  fpsMin: number;
  durationSec: number;
  screenshotPath?: string;
}

export interface BotContext {
  page: Page;
  scenario: ScenarioConfig;
  seed: number;
  targetDays: number;
  isQuick: boolean;
  log: (msg: string) => void;
  recordFailure: (reason: string) => void;
  metrics: Partial<RunMetrics>;
}

export type BotFn = (ctx: BotContext) => Promise<void>;
