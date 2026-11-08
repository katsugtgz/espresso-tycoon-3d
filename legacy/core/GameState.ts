import { DrinkId, DrinkRecipe, UpgradeDef, DayStats, GameSaveData } from '../types';
import { events } from './EventBus';
import { audio } from './Audio';

export const DRINK_RECIPES: Record<DrinkId, DrinkRecipe> = {
  espresso: {
    id: 'espresso',
    name: 'Espresso',
    icon: '☕',
    unlocked: true,
    unlockCost: 0,
    basePrice: 4.0,
    currentPrice: 4.0,
    ingredientCost: 1.0,
    prepTime: 2.5,
    description: 'Rich, concentrated shot with thick golden crema.',
  },
  americano: {
    id: 'americano',
    name: 'Americano',
    icon: '🍵',
    unlocked: true,
    unlockCost: 0,
    basePrice: 5.0,
    currentPrice: 5.0,
    ingredientCost: 1.2,
    prepTime: 3.0,
    description: 'Espresso diluted with piping hot water.',
  },
  cappuccino: {
    id: 'cappuccino',
    name: 'Cappuccino',
    icon: '🥛',
    unlocked: true,
    unlockCost: 0,
    basePrice: 6.5,
    currentPrice: 6.5,
    ingredientCost: 2.0,
    prepTime: 4.0,
    description: 'Equal parts espresso, steamed milk, and dense foam.',
  },
  latte: {
    id: 'latte',
    name: 'Caffè Latte',
    icon: '🍶',
    unlocked: false,
    unlockCost: 75,
    basePrice: 7.0,
    currentPrice: 7.0,
    ingredientCost: 2.2,
    prepTime: 4.5,
    description: 'Silky steamed milk poured over espresso with latte art.',
  },
  mocha: {
    id: 'mocha',
    name: 'Mocha',
    icon: '🍫',
    unlocked: false,
    unlockCost: 150,
    basePrice: 8.5,
    currentPrice: 8.5,
    ingredientCost: 2.8,
    prepTime: 5.0,
    description: 'Decadent chocolate syrup, espresso, and creamy froth.',
  },
  cold_brew: {
    id: 'cold_brew',
    name: 'Cold Brew',
    icon: '🧊',
    unlocked: false,
    unlockCost: 250,
    basePrice: 7.5,
    currentPrice: 7.5,
    ingredientCost: 2.0,
    prepTime: 3.2,
    description: 'Slow-steeped smooth iced coffee on tap.',
  },
};

export const UPGRADE_DEFINITIONS: UpgradeDef[] = [
  {
    id: 'grinder_speed',
    name: 'Commercial Burr Grinder',
    category: 'equipment',
    description: 'High-speed precision conical burrs grind beans faster.',
    level: 1,
    maxLevel: 5,
    baseCost: 50,
    costMultiplier: 1.6,
    currentEffectDescription: '-15% grinding time',
    nextEffectDescription: '-30% grinding time',
  },
  {
    id: 'espresso_speed',
    name: 'Dual-Boiler Steam Tech',
    category: 'equipment',
    description: 'Higher temperature stability and pump pressure speed up brewing.',
    level: 1,
    maxLevel: 5,
    baseCost: 80,
    costMultiplier: 1.8,
    currentEffectDescription: '-15% brew time',
    nextEffectDescription: '-30% brew time',
  },
  {
    id: 'extra_machine',
    name: 'Second Espresso Machine',
    category: 'equipment',
    description: 'Install another espresso machine to brew multiple drinks simultaneously.',
    level: 0,
    maxLevel: 2,
    baseCost: 200,
    costMultiplier: 2.5,
    currentEffectDescription: 'No extra machine',
    nextEffectDescription: '+1 extra espresso machine',
  },
  {
    id: 'tables_count',
    name: 'Artisan Cafe Tables',
    category: 'cafe',
    description: 'Add more stylish seating. Customers can sit and relax, leaving bigger tips.',
    level: 1,
    maxLevel: 4,
    baseCost: 60,
    costMultiplier: 1.7,
    currentEffectDescription: '1 seating table (2 chairs)',
    nextEffectDescription: '+1 cafe table & chairs',
  },
  {
    id: 'cafe_decor',
    name: 'Aesthetic Cafe Decor',
    category: 'cafe',
    description: 'Monstera plants, warm pendant lights, and neon cafe sign.',
    level: 0,
    maxLevel: 5,
    baseCost: 45,
    costMultiplier: 1.5,
    currentEffectDescription: 'Standard look',
    nextEffectDescription: '+15% customer patience and +0.3 rating bonus',
  },
  {
    id: 'barista_staff',
    name: 'Hire Barista Apprentice',
    category: 'staff',
    description: 'Automates coffee brewing & serving when tickets come in.',
    level: 0,
    maxLevel: 2,
    baseCost: 150,
    costMultiplier: 2.2,
    currentEffectDescription: 'Manual barista only',
    nextEffectDescription: '1 automated barista assistant ($20/day wage)',
  },
  {
    id: 'bean_quality',
    name: 'Single-Origin Specialty Beans',
    category: 'menu',
    description: 'Award-winning Ethiopian & Colombian beans boost tips and rating.',
    level: 1,
    maxLevel: 4,
    baseCost: 70,
    costMultiplier: 1.75,
    currentEffectDescription: 'House blend beans',
    nextEffectDescription: '+25% customer tips & faster rating gains',
  },
];

const STORAGE_KEY = 'espresso_tycoon_3d_save_v1';

export class GameStateManager {
  public money: number = 150; // starting cash
  public rating: number = 3.5; // starting rating 1.0 - 5.0
  public currentDay: number = 1;
  public gameMinutes: number = 0; // 0 = 08:00 AM, 720 = 20:00 (8:00 PM)
  public isDayActive: boolean = true;
  public isPaused: boolean = false;
  public gameSpeed: number = 1; // 1x or 2x

  public drinks: Record<DrinkId, DrinkRecipe> = JSON.parse(JSON.stringify(DRINK_RECIPES));
  public upgradeLevels: Record<string, number> = {};

  // Current day statistics
  public dayStats: DayStats = {
    dayNumber: 1,
    revenue: 0,
    expenses: 0,
    customersServed: 0,
    customersLost: 0,
    tipsEarned: 0,
    ratingAverage: 3.5,
  };

  public lifetimeStats = {
    totalRevenue: 0,
    totalServed: 0,
    totalTips: 0,
    daysPlayed: 1,
  };

  constructor() {
    // initialize upgrade levels
    UPGRADE_DEFINITIONS.forEach((u) => {
      this.upgradeLevels[u.id] = u.level;
    });
    this.loadState();
  }

  public saveState(): void {
    const saveData: GameSaveData = {
      money: this.money,
      rating: this.rating,
      currentDay: this.currentDay,
      gameTimeMinutes: this.gameMinutes,
      isDayActive: this.isDayActive,
      unlockedDrinks: (Object.keys(this.drinks) as DrinkId[]).filter((id) => this.drinks[id].unlocked),
      drinkPrices: (Object.keys(this.drinks) as DrinkId[]).reduce((acc, id) => {
        acc[id] = this.drinks[id].currentPrice;
        return acc;
      }, {} as Record<DrinkId, number>),
      upgrades: { ...this.upgradeLevels },
      lifetimeStats: { ...this.lifetimeStats },
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saveData));
    } catch (e) {
      console.warn('Failed to save to localStorage', e);
    }
  }

  public loadState(): boolean {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const data: GameSaveData = JSON.parse(raw);
      if (typeof data.money === 'number') this.money = data.money;
      if (typeof data.rating === 'number') this.rating = data.rating;
      if (typeof data.currentDay === 'number') this.currentDay = data.currentDay;
      if (typeof data.gameTimeMinutes === 'number') this.gameMinutes = data.gameTimeMinutes;
      if (typeof data.isDayActive === 'boolean') this.isDayActive = data.isDayActive;

      if (data.unlockedDrinks) {
        data.unlockedDrinks.forEach((id) => {
          if (this.drinks[id]) this.drinks[id].unlocked = true;
        });
      }
      if (data.drinkPrices) {
        Object.entries(data.drinkPrices).forEach(([id, price]) => {
          if (this.drinks[id as DrinkId]) this.drinks[id as DrinkId].currentPrice = price;
        });
      }
      if (data.upgrades) {
        Object.entries(data.upgrades).forEach(([id, lvl]) => {
          this.upgradeLevels[id] = lvl;
        });
      }
      if (data.lifetimeStats) {
        this.lifetimeStats = data.lifetimeStats;
      }
      return true;
    } catch (e) {
      console.warn('Failed to load save', e);
      return false;
    }
  }

  public resetSave(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.money = 150;
    this.rating = 3.5;
    this.currentDay = 1;
    this.gameMinutes = 0;
    this.isDayActive = true;
    this.drinks = JSON.parse(JSON.stringify(DRINK_RECIPES));
    UPGRADE_DEFINITIONS.forEach((u) => {
      this.upgradeLevels[u.id] = u.level;
    });
    this.dayStats = {
      dayNumber: 1,
      revenue: 0,
      expenses: 0,
      customersServed: 0,
      customersLost: 0,
      tipsEarned: 0,
      ratingAverage: 3.5,
    };
    this.lifetimeStats = {
      totalRevenue: 0,
      totalServed: 0,
      totalTips: 0,
      daysPlayed: 1,
    };
    events.emit('STATE_RESET');
  }

  public addMoney(amount: number, reason: string = 'revenue'): void {
    this.money += amount;
    if (amount > 0) {
      this.dayStats.revenue += amount;
      this.lifetimeStats.totalRevenue += amount;
    } else {
      this.dayStats.expenses += Math.abs(amount);
    }
    events.emit('MONEY_CHANGED', { money: this.money, delta: amount, reason });
    this.saveState();
  }

  public modifyRating(delta: number): void {
    const prev = this.rating;
    this.rating = Math.max(1.0, Math.min(5.0, this.rating + delta));
    events.emit('RATING_CHANGED', { rating: this.rating, delta: this.rating - prev });
    this.saveState();
  }

  public getUpgradeLevel(id: string): number {
    return this.upgradeLevels[id] ?? 0;
  }

  public getUpgradeCost(id: string): number {
    const def = UPGRADE_DEFINITIONS.find((u) => u.id === id);
    if (!def) return Infinity;
    const current = this.getUpgradeLevel(id);
    if (current >= def.maxLevel) return Infinity;
    return Math.round(def.baseCost * Math.pow(def.costMultiplier, current));
  }

  public canBuyUpgrade(id: string): boolean {
    const cost = this.getUpgradeCost(id);
    return this.money >= cost && isFinite(cost);
  }

  public buyUpgrade(id: string): boolean {
    if (!this.canBuyUpgrade(id)) return false;
    const cost = this.getUpgradeCost(id);
    this.addMoney(-cost, `upgrade_${id}`);
    this.upgradeLevels[id] = (this.upgradeLevels[id] ?? 0) + 1;
    audio.playUpgrade();
    events.emit('UPGRADE_PURCHASED', { id, level: this.upgradeLevels[id] });
    this.saveState();
    return true;
  }

  public canUnlockDrink(id: DrinkId): boolean {
    const drink = this.drinks[id];
    return !drink.unlocked && this.money >= drink.unlockCost;
  }

  public unlockDrink(id: DrinkId): boolean {
    if (!this.canUnlockDrink(id)) return false;
    const drink = this.drinks[id];
    this.addMoney(-drink.unlockCost, `unlock_${id}`);
    drink.unlocked = true;
    audio.playUpgrade();
    events.emit('DRINK_UNLOCKED', { drinkId: id });
    this.saveState();
    return true;
  }

  public setDrinkPrice(id: DrinkId, price: number): void {
    if (!this.drinks[id]) return;
    this.drinks[id].currentPrice = Math.max(1, Math.min(25, price));
    events.emit('DRINK_PRICE_CHANGED', { drinkId: id, price: this.drinks[id].currentPrice });
    this.saveState();
  }

  public updateTime(deltaSeconds: number): void {
    if (!this.isDayActive || this.isPaused) return;

    // Day length: 720 game minutes (08:00 to 20:00 = 12 hours)
    // Real time for full day: 90 seconds -> 720 minutes / 90s = 8 game minutes per real second
    const minutesPerSecond = 8 * this.gameSpeed;
    this.gameMinutes += deltaSeconds * minutesPerSecond;

    events.emit('TIME_TICK', {
      minutes: this.gameMinutes,
      clockString: this.getClockString(),
      progress: Math.min(1, this.gameMinutes / 720),
    });

    if (this.gameMinutes >= 720) {
      this.endDay();
    }
  }

  public getClockString(): string {
    const totalMinutes = 8 * 60 + Math.floor(this.gameMinutes);
    const hours = Math.floor(totalMinutes / 60);
    const mins = Math.floor(totalMinutes % 60);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
    const formattedMins = mins < 10 ? `0${mins}` : `${mins}`;
    return `${displayHours}:${formattedMins} ${period}`;
  }

  public endDay(): void {
    if (!this.isDayActive) return;
    this.isDayActive = false;

    // Daily expenses: Barista staff wages ($25 per barista level)
    const baristaLvl = this.getUpgradeLevel('barista_staff');
    const baristaWage = baristaLvl * 25;
    if (baristaWage > 0) {
      this.addMoney(-baristaWage, 'barista_wages');
    }

    this.lifetimeStats.daysPlayed = this.currentDay;
    events.emit('DAY_ENDED', { ...this.dayStats });
    this.saveState();
  }

  public startNextDay(): void {
    this.currentDay += 1;
    this.gameMinutes = 0;
    this.isDayActive = true;
    this.dayStats = {
      dayNumber: this.currentDay,
      revenue: 0,
      expenses: 0,
      customersServed: 0,
      customersLost: 0,
      tipsEarned: 0,
      ratingAverage: this.rating,
    };
    events.emit('DAY_STARTED', { dayNumber: this.currentDay });
    this.saveState();
  }
}

export const gameState = new GameStateManager();
