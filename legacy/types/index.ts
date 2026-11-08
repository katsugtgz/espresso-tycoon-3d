export type DrinkId = 'espresso' | 'americano' | 'cappuccino' | 'latte' | 'mocha' | 'cold_brew';

export interface DrinkRecipe {
  id: DrinkId;
  name: string;
  icon: string;
  unlocked: boolean;
  unlockCost: number;
  basePrice: number;
  currentPrice: number;
  ingredientCost: number;
  prepTime: number; // in seconds
  description: string;
}

export type StationType = 'grinder' | 'espresso_machine' | 'milk_station' | 'service_counter';

export interface StationData {
  id: string;
  type: StationType;
  name: string;
  level: number;
  isUnlocked: boolean;
  status: 'idle' | 'working' | 'ready';
  currentDrinkId?: DrinkId;
  currentOrderId?: string;
  progress: number; // 0 to 1
  totalTime: number; // seconds
  position: [number, number, number];
}

export type CustomerStatus =
  | 'entering'
  | 'queueing'
  | 'ordering'
  | 'waiting_order'
  | 'finding_seat'
  | 'drinking'
  | 'leaving_happy'
  | 'leaving_angry';

export interface CustomerOrder {
  id: string;
  drinkId: DrinkId;
  placedTime: number;
  patienceRemaining: number; // seconds
  maxPatience: number;
  status: 'pending' | 'in_prep' | 'ready' | 'served' | 'expired';
}

export interface Customer {
  id: string;
  name: string;
  modelVariant: number; // 0, 1, 2, 3
  status: CustomerStatus;
  order?: CustomerOrder;
  patience: number; // 0 to 1
  maxPatienceTime: number;
  timeInState: number;
  assignedTableId?: string;
  tipAmount: number;
  position: [number, number, number];
  targetPosition: [number, number, number];
}

export interface UpgradeDef {
  id: string;
  name: string;
  category: 'equipment' | 'staff' | 'cafe' | 'menu';
  description: string;
  level: number;
  maxLevel: number;
  baseCost: number;
  costMultiplier: number;
  currentEffectDescription: string;
  nextEffectDescription?: string;
}

export interface DayStats {
  dayNumber: number;
  revenue: number;
  expenses: number;
  customersServed: number;
  customersLost: number;
  tipsEarned: number;
  ratingAverage: number;
}

export interface GameSaveData {
  money: number;
  rating: number; // 1.0 to 5.0
  currentDay: number;
  gameTimeMinutes: number; // minutes from 08:00 (e.g. 0 to 720 for 8am-8pm)
  isDayActive: boolean;
  unlockedDrinks: DrinkId[];
  drinkPrices: Record<DrinkId, number>;
  upgrades: Record<string, number>;
  lifetimeStats: {
    totalRevenue: number;
    totalServed: number;
    totalTips: number;
    daysPlayed: number;
  };
}

export interface CafeTable {
  id: string;
  position: [number, number, number];
  rotation: number;
  isOccupied: boolean;
  occupantId?: string;
}
