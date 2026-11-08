import type { DrinkDef, DrinkId, UpgradeDef, UpgradeId } from '../types';

/**
 * Balance data. Initial values by foreman; SIM worker owns tuning of numbers here
 * (keep exports/shape stable — UI & tests import these).
 */
export const SAVE_VERSION = 2;
export const SAVE_KEY = 'espresso-tycoon-save';
export const SETTINGS_KEY = 'espresso-tycoon-settings';

/** Okabe-Ito palette: colorblind-safe */
export const DRINKS: Record<DrinkId, DrinkDef> = {
  espresso:   { id: 'espresso',   name: 'Espresso',   icon: '☕', color: '#E69F00', shape: 'circle',   basePrice: 3, ingredientCost: 0.5, prepTime: 3,   unlockCost: 0 },
  americano:  { id: 'americano',  name: 'Americano',  icon: '🫖', color: '#56B4E9', shape: 'square',   basePrice: 4, ingredientCost: 0.6, prepTime: 4,   unlockCost: 0 },
  cappuccino: { id: 'cappuccino', name: 'Cappuccino', icon: '🥛', color: '#009E73', shape: 'triangle', basePrice: 5, ingredientCost: 0.9, prepTime: 5.5, unlockCost: 0 },
  latte:      { id: 'latte',      name: 'Latte',      icon: '🍶', color: '#CC79A7', shape: 'diamond',  basePrice: 5.5, ingredientCost: 1.0, prepTime: 6, unlockCost: 0 },
  mocha:      { id: 'mocha',      name: 'Mocha',      icon: '🍫', color: '#D55E00', shape: 'star',     basePrice: 7, ingredientCost: 1.4, prepTime: 7,   unlockCost: 250 },
  cold_brew:  { id: 'cold_brew',  name: 'Cold Brew',  icon: '🧊', color: '#0072B2', shape: 'hexagon',  basePrice: 8, ingredientCost: 1.2, prepTime: 5,   unlockCost: 450 },
};
/** drinks available at new game (day 1 tutorial restricts to espresso for first order) */
export const STARTING_DRINKS: DrinkId[] = ['espresso', 'americano', 'cappuccino', 'latte'];
export const PRICE_MIN_MULT = 0.5;
export const PRICE_MAX_MULT = 2.0;

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  machine:   { id: 'machine',   name: 'Espresso Machine', desc: '+1 espresso machine (max 4).',           icon: '☕', category: 'equipment', maxLevel: 3, baseCost: 150, costMult: 2.2 },
  grinder:   { id: 'grinder',   name: 'Pro Grinder',      desc: 'Brew time -12% per level.',             icon: '⚙️', category: 'equipment', maxLevel: 4, baseCost: 100, costMult: 1.9 },
  tables:    { id: 'tables',    name: 'More Tables',      desc: '+1 table (2 seats). Seated guests tip more.', icon: '🪑', category: 'cafe', maxLevel: 6, baseCost: 80, costMult: 1.5 },
  barista:   { id: 'barista',   name: 'Hire Barista',     desc: 'Auto brews & serves. Wage $30/day each.', icon: '🧑‍🍳', category: 'staff', maxLevel: 3, baseCost: 300, costMult: 2.0 },
  decor:     { id: 'decor',     name: 'Decor',            desc: 'Raises rating ceiling & patience.',      icon: '🪴', category: 'cafe', maxLevel: 8, baseCost: 60, costMult: 1.6 },
  queue:     { id: 'queue',     name: 'Bigger Queue',     desc: '+2 queue capacity.',                     icon: '🧍', category: 'cafe', maxLevel: 3, baseCost: 90, costMult: 1.8 },
  marketing: { id: 'marketing', name: 'Marketing',        desc: '+15% customer arrivals.',                icon: '📣', category: 'cafe', maxLevel: 4, baseCost: 120, costMult: 1.9 },
};

export const BALANCE = {
  startMoney: 60,
  startRating: 3.0,
  dayLengthSec: 150,          // sim seconds per day (08:00 -> 20:00)
  fixedStep: 1 / 30,          // sim tick
  baseQueueCapacity: 4,
  baseTables: 2,              // tables at level 0
  baseMachines: 1,
  baseSpawnInterval: 9,       // seconds between arrivals at rating 3, no marketing
  minSpawnInterval: 2.2,
  rushHours: [[10.5, 11.5], [15, 16]] as [number, number][], // clock hours; spawn x1.8
  basePatience: 45,           // seconds full bar (queue+wait)
  orderDelay: 1.2,            // seconds at register before order placed
  seatedTime: [8, 16] as [number, number],
  rentBase: 25,               // rent(day) = rentBase + rentPerDay*(day-1)
  rentPerDay: 6,
  baristaWage: 30,
  baristaReaction: 1.2,       // seconds between barista actions
  grinderSpeedPerLevel: 0.12,
  bankruptStrikesToLose: 2,
  lowRatingThreshold: 1.5,
  lowRatingStrikesToLose: 4,
  tipBase: 0.1,               // fraction of price, scaled by patience left & combo
  comboTipBonus: 0.03,        // per combo step, capped
  comboCap: 10,
  vipChance: 0.08, pickyChance: 0.12, // after day 2
  maxCustomers: 40,
};

export const ACHIEVEMENTS: { id: string; name: string; desc: string }[] = [
  { id: 'first_sale', name: 'First Shot', desc: 'Serve your first drink.' },
  { id: 'combo_5', name: 'In The Zone', desc: 'Reach a 5x combo.' },
  { id: 'combo_10', name: 'Barista Legend', desc: 'Reach a 10x combo.' },
  { id: 'served_50', name: 'Regulars', desc: 'Serve 50 drinks total.' },
  { id: 'served_250', name: 'Coffee Empire', desc: 'Serve 250 drinks total.' },
  { id: 'money_1000', name: 'Grand', desc: 'Hold $1000 at once.' },
  { id: 'rating_45', name: 'Five Bean Review', desc: 'Reach 4.5 rating.' },
  { id: 'all_drinks', name: 'Full Menu', desc: 'Unlock every drink.' },
  { id: 'first_hire', name: 'Team Player', desc: 'Hire your first barista.' },
  { id: 'perfect_day', name: 'Flawless', desc: 'Finish a day with no lost customers (≥10 served).' },
  { id: 'day_7', name: 'One Week Strong', desc: 'Reach day 7.' },
];
