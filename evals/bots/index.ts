import type { BotFn } from '../types';
import { runRandomClicker } from './random-clicker';
import { runGreedy } from './greedy';
import { runIdle } from './idle';
import { runUpgradeSpammer } from './upgrade-spammer';
import { runSpeedrun } from './speedrun';
import { runTutorial } from './tutorial';
import { runKeyboard } from './keyboard';
import { runSaveLoad } from './save-load';
import { runResizeBlur } from './resize-blur';
import { runFpsBudget } from './fps-budget';

export const BOTS: Record<string, BotFn> = {
  'random-clicker': runRandomClicker,
  'greedy': runGreedy,
  'idle': runIdle,
  'upgrade-spammer': runUpgradeSpammer,
  'speedrun': runSpeedrun,
  'tutorial': runTutorial,
  'keyboard': runKeyboard,
  'save-load': runSaveLoad,
  'resize-blur': runResizeBlur,
  'fps-budget': runFpsBudget,
};
