import { DrinkId, CustomerOrder } from '../types';
import { events } from '../core/EventBus';
import { gameState } from '../core/GameState';
import { audio } from '../core/Audio';

export interface TipBreakdown {
  baseTip: number;
  patienceBonus: number;
  beanBonus: number;
  totalTip: number;
}

export interface PaymentReceipt {
  orderId: string;
  drinkId: DrinkId;
  price: number;
  tip: number;
  tipBreakdown: TipBreakdown;
  total: number;
  ratingDelta: number;
}

export interface ActiveOrderRecord {
  orderId: string;
  drinkId: DrinkId;
  placedTime: number;
  maxPatience: number;
  patienceRemaining: number;
}

export class EconomyManager {
  private activeOrders: Map<string, ActiveOrderRecord> = new Map();
  private unsubs: Array<() => void> = [];

  constructor() {
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    const unsubOrderPlaced = events.on('ORDER_PLACED', (payload: { order?: CustomerOrder }) => {
      if (payload?.order) {
        this.registerOrder(payload.order);
      }
    });

    const unsubOrderServed = events.on(
      'ORDER_SERVED',
      (payload: { orderId: string; drinkId: DrinkId; patiencePercent?: number }) => {
        if (payload?.orderId && payload?.drinkId) {
          this.processOrderServed(payload.orderId, payload.drinkId, payload.patiencePercent);
        }
      }
    );

    const unsubOrderExpired = events.on('ORDER_EXPIRED', (payload: { orderId: string; drinkId?: DrinkId }) => {
      if (payload?.orderId) {
        this.processOrderExpired(payload.orderId, payload.drinkId);
      }
    });

    const unsubCustomerLost = events.on(
      'CUSTOMER_LOST',
      (payload: { orderId?: string; drinkId?: DrinkId }) => {
        if (payload?.orderId) {
          this.processOrderExpired(payload.orderId, payload.drinkId);
        }
      }
    );

    this.unsubs.push(unsubOrderPlaced, unsubOrderServed, unsubOrderExpired, unsubCustomerLost);
  }

  public registerOrder(order: CustomerOrder): void {
    this.activeOrders.set(order.id, {
      orderId: order.id,
      drinkId: order.drinkId,
      placedTime: order.placedTime,
      maxPatience: order.maxPatience || 30,
      patienceRemaining: order.patienceRemaining ?? order.maxPatience ?? 30,
    });
  }

  public getDrinkPrice(drinkId: DrinkId): number {
    return gameState.drinks[drinkId]?.currentPrice ?? 4.0;
  }

  public getDrinkBasePrice(drinkId: DrinkId): number {
    return gameState.drinks[drinkId]?.basePrice ?? 4.0;
  }

  public getIngredientCost(drinkId: DrinkId): number {
    return gameState.drinks[drinkId]?.ingredientCost ?? 1.0;
  }

  /**
   * Deducts ingredient cost from cash balance when brewing begins.
   */
  public deductIngredientCost(drinkId: DrinkId): number {
    const cost = this.getIngredientCost(drinkId);
    gameState.addMoney(-cost, `ingredients_${drinkId}`);
    return cost;
  }

  /**
   * Tip calculation according to exact formula:
   * baseTip = drinkPrice * 0.15
   * patienceBonus = (remainingPatiencePercent > 0.6) ? drinkPrice * 0.25 : (remainingPatiencePercent > 0.3) ? drinkPrice * 0.10 : 0
   * beanBonus = gameState.getUpgradeLevel('bean_quality') * 0.50
   * totalTip = baseTip + patienceBonus + beanBonus
   */
  public calculateTip(drinkId: DrinkId, remainingPatiencePercent: number): TipBreakdown {
    const drinkPrice = this.getDrinkPrice(drinkId);
    const clampedPercent = Math.max(0, Math.min(1, remainingPatiencePercent));

    const baseTip = Math.round(drinkPrice * 0.15 * 100) / 100;

    let patienceBonus = 0;
    if (clampedPercent > 0.6) {
      patienceBonus = Math.round(drinkPrice * 0.25 * 100) / 100;
    } else if (clampedPercent > 0.3) {
      patienceBonus = Math.round(drinkPrice * 0.10 * 100) / 100;
    }

    const beanLvl = gameState.getUpgradeLevel('bean_quality');
    const beanBonus = Math.round(beanLvl * 0.5 * 100) / 100;

    const totalTip = Math.round((baseTip + patienceBonus + beanBonus) * 100) / 100;

    return {
      baseTip,
      patienceBonus,
      beanBonus,
      totalTip,
    };
  }

  /**
   * Price satisfaction factor:
   * if currentPrice > basePrice * 1.4, customers lose patience 25% faster (multiplier = 1.25).
   * if currentPrice < basePrice * 0.9, patience decays 15% slower (multiplier = 0.85).
   */
  public getPricePatienceMultiplier(drinkId: DrinkId): number {
    const drink = gameState.drinks[drinkId];
    if (!drink) return 1.0;
    if (drink.currentPrice > drink.basePrice * 1.4) {
      return 1.25;
    }
    if (drink.currentPrice < drink.basePrice * 0.9) {
      return 0.85;
    }
    return 1.0;
  }

  /**
   * Bonus rating calculation when serving satisfied customers:
   * Underpriced drinks and high-quality beans delight customers.
   */
  public getRatingBonus(drinkId: DrinkId, remainingPatiencePercent: number): number {
    const drink = gameState.drinks[drinkId];
    let bonus = 0;

    if (drink && drink.currentPrice < drink.basePrice * 0.9) {
      bonus += 0.01; // generous price bonus
    }
    if (remainingPatiencePercent > 0.6) {
      bonus += 0.005; // speedy service bonus
    }

    const beanLvl = gameState.getUpgradeLevel('bean_quality');
    bonus += beanLvl * 0.005; // specialty beans bonus

    return Math.round(bonus * 1000) / 1000;
  }

  /**
   * Processes order completion: adds revenue + tip, updates rating, updates stats, plays cash sound.
   */
  public processOrderServed(
    orderId: string,
    drinkId: DrinkId,
    remainingPatiencePercent?: number
  ): PaymentReceipt {
    const registered = this.activeOrders.get(orderId);
    let patiencePercent = remainingPatiencePercent;

    if (patiencePercent === undefined) {
      if (registered && registered.maxPatience > 0) {
        patiencePercent = registered.patienceRemaining / registered.maxPatience;
      } else {
        patiencePercent = 0.7; // default favorable patience if not tracked
      }
    }
    patiencePercent = Math.max(0, Math.min(1, patiencePercent));

    const price = this.getDrinkPrice(drinkId);
    const tipBreakdown = this.calculateTip(drinkId, patiencePercent);
    const tip = tipBreakdown.totalTip;
    const total = Math.round((price + tip) * 100) / 100;

    // Award revenue and tip to player
    gameState.addMoney(total, `sale_${drinkId}`);
    gameState.dayStats.tipsEarned = Math.round((gameState.dayStats.tipsEarned + tip) * 100) / 100;
    gameState.lifetimeStats.totalTips = Math.round((gameState.lifetimeStats.totalTips + tip) * 100) / 100;
    gameState.dayStats.customersServed += 1;
    gameState.lifetimeStats.totalServed += 1;

    // Rating gain: 0.02 + bonus
    const bonus = this.getRatingBonus(drinkId, patiencePercent);
    const ratingDelta = Math.round((0.02 + bonus) * 1000) / 1000;
    gameState.modifyRating(ratingDelta);

    // Audio chime
    audio.playCash();

    // Cleanup active order record
    this.activeOrders.delete(orderId);

    const receipt: PaymentReceipt = {
      orderId,
      drinkId,
      price,
      tip,
      tipBreakdown,
      total,
      ratingDelta,
    };

    events.emit('ORDER_PAID', receipt);
    return receipt;
  }

  /**
   * On customer leaving or order expiring:
   * Decreases rating by 0.15, increments lost customer counter, plays angry sound.
   */
  public processOrderExpired(orderId: string, _drinkId?: DrinkId): void {
    if (this.activeOrders.has(orderId)) {
      this.activeOrders.delete(orderId);
    }

    gameState.modifyRating(-0.15);
    gameState.dayStats.customersLost += 1;
    audio.playAngry();

    events.emit('RATING_PENALTY_APPLIED', { orderId, delta: -0.15 });
  }

  public updateOrderPatience(orderId: string, remaining: number): void {
    const o = this.activeOrders.get(orderId);
    if (o) {
      o.patienceRemaining = remaining;
    }
  }

  public getActiveOrder(orderId: string): ActiveOrderRecord | undefined {
    return this.activeOrders.get(orderId);
  }

  public destroy(): void {
    this.unsubs.forEach((unsub) => unsub());
    this.unsubs = [];
    this.activeOrders.clear();
  }
}

export const economyManager = new EconomyManager();
