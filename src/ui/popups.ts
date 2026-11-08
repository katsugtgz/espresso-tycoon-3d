import type { EventBus } from '../core/events';
import type { GameEvents, ISim, Vec2 } from '../types';
import type { IRenderer } from '../appTypes';
import { DRINKS, UPGRADES } from '../config/balance';
import { LAYOUT } from '../config/layout';

const FAIL_REASONS: Record<string, string> = {
  no_order: 'No matching pending order',
  no_machine: 'All espresso machines are busy',
  no_ready_machine: 'No drink ready to serve yet',
  busy: 'Machine is still brewing',
  not_ready: 'Drink is still brewing',
  not_enough_money: 'Not enough cash',
  max_level: 'Already at maximum level',
  already_unlocked: 'Drink already unlocked',
  invalid_price: 'Invalid menu price',
  invalid_station: 'Click an espresso machine or counter',
  not_playing: 'Cafe is not currently open',
  not_day_end: 'Day has not ended yet',
};

function humanizeFailReason(reason?: string): string {
  if (!reason) return 'Action failed';
  if (FAIL_REASONS[reason]) return FAIL_REASONS[reason];
  const cleaned = reason.replace(/_/g, ' ').trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

interface FloatingItem {
  el: HTMLElement;
  worldPos: Vec2;
  heightY: number;
  ttl: number;
  maxTtl: number;
}

interface RecentToast {
  norm: string;
  time: number;
}

interface RecentNamedEvent {
  name: string;
  time: number;
}

export class PopupManager {
  private layer: HTMLElement;
  private toastContainer: HTMLElement;
  private activeItems: FloatingItem[] = [];
  private pool: HTMLElement[] = [];
  private unsubs: (() => void)[] = [];

  private recentToasts: RecentToast[] = [];
  private recentNamedEvents: RecentNamedEvent[] = [];

  constructor(
    root: HTMLElement,
    private sim: ISim,
    private bus: EventBus<GameEvents>,
    private renderer: IRenderer
  ) {
    this.layer = document.createElement('div');
    this.layer.id = 'floating-layer';
    root.appendChild(this.layer);

    this.toastContainer = document.createElement('div');
    this.toastContainer.id = 'toast-container';
    root.appendChild(this.toastContainer);

    this.bindEvents();
  }

  private normalizeText(str: string): string {
    return str.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private isDuplicateToast(text: string): boolean {
    const now = Date.now();
    const norm = this.normalizeText(text);

    // Prune entries older than 4s
    this.recentToasts = this.recentToasts.filter((t) => now - t.time < 4000);

    for (const r of this.recentToasts) {
      if (now - r.time < 3000) {
        if (r.norm === norm) return true;
        // Check near-identical (substring match if long enough)
        if (norm.length > 8 && r.norm.length > 8) {
          if (r.norm.includes(norm) || norm.includes(r.norm)) return true;
        }
      }
    }

    this.recentToasts.push({ norm, time: now });
    return false;
  }

  private recordNamedEvent(name: string): void {
    const now = Date.now();
    this.recentNamedEvents = this.recentNamedEvents.filter((e) => now - e.time < 3000);
    this.recentNamedEvents.push({ name: name.toLowerCase(), time: now });
  }

  private isDuplicateOfNamedEvent(toastText: string): boolean {
    const now = Date.now();
    const lower = toastText.toLowerCase();

    for (const ne of this.recentNamedEvents) {
      if (now - ne.time < 1200) {
        if (lower.includes(ne.name) || ne.name.includes(lower)) {
          return true;
        }
      }
    }
    return false;
  }

  private bindEvents(): void {
    // Money change
    this.unsubs.push(
      this.bus.on('money:change', (e) => {
        const pos = e.pos ?? LAYOUT.register;
        const isPositive = e.delta >= 0;
        const text = `${isPositive ? '+' : '-'}$${Math.abs(e.delta).toFixed(2)}`;
        this.spawnFloatingText(pos, 1.2, text, isPositive ? 'floating-money positive' : 'floating-money negative', 1.2);
      })
    );

    // Tip on served
    this.unsubs.push(
      this.bus.on('order:served', (e) => {
        if (e.tip > 0) {
          this.spawnFloatingText(e.pos, 1.6, `+$${e.tip.toFixed(2)} Tip! ☕`, 'floating-tip', 1.4);
        }
      })
    );

    // Customer emote
    this.unsubs.push(
      this.bus.on('customer:emote', (e) => {
        const cust = this.sim.state.customers.find((c) => c.id === e.id);
        const pos = cust ? cust.pos : LAYOUT.register;
        const icons: Record<string, string> = {
          happy: '😊',
          love: '😍',
          angry: '😡',
          impatient: '⏳',
          thinking: '🤔',
          wow: '🤩',
        };
        const icon = icons[e.emote] ?? '☕';
        this.spawnFloatingText(pos, 1.9, icon, 'customer-emote-bubble', 1.5);
      })
    );

    // Combo change
    this.unsubs.push(
      this.bus.on('combo:change', (e) => {
        if (e.combo >= 2) {
          // Spawn near register or counter center
          this.spawnFloatingText(LAYOUT.register, 2.0, `Combo x${e.combo}! 🔥`, 'floating-combo', 1.2);
        }
      })
    );

    // Standard Toasts (deduped against recent named events and identical text)
    this.unsubs.push(
      this.bus.on('toast', (e) => {
        if (this.isDuplicateOfNamedEvent(e.text)) return;
        this.showToast(e.text, e.kind);
      })
    );

    // Achievement
    this.unsubs.push(
      this.bus.on('achievement', (e) => {
        this.recordNamedEvent(e.name);
        this.showToast(`🏆 Achievement: ${e.name} — ${e.desc}`, 'unlock');
      })
    );

    // Goal Complete
    this.unsubs.push(
      this.bus.on('goal:complete', (e) => {
        this.recordNamedEvent(e.desc);
        this.showToast(`🎯 Goal Complete: ${e.desc} (+$${e.reward})`, 'good');
      })
    );

    // Drink unlocked
    this.unsubs.push(
      this.bus.on('drink:unlocked', (e) => {
        const name = DRINKS[e.drink]?.name ?? e.drink;
        this.recordNamedEvent(name);
        this.showToast(`✨ Drink Unlocked: ${name}!`, 'unlock');
      })
    );

    // Upgrade bought
    this.unsubs.push(
      this.bus.on('upgrade:bought', (e) => {
        const name = UPGRADES[e.id]?.name ?? e.id;
        this.recordNamedEvent(name);
        this.showToast(`⚡ Upgraded ${name} to Lv ${e.level}!`, 'good');
      })
    );

    // Rush hour start
    this.unsubs.push(
      this.bus.on('rush:start', () => {
        this.showToast('🔥 Rush Hour has begun! Fast orders incoming!', 'unlock');
      })
    );

    // Action fail shake hint
    this.unsubs.push(
      this.bus.on('action:fail', (e) => {
        this.showToast(`⚠️ ${humanizeFailReason(e.reason)}`, 'bad', true);
      })
    );

    // Clear floating popups across transitions so stale popups never linger
    this.unsubs.push(
      this.bus.on('game:new', () => this.clearFloating()),
      this.bus.on('game:loaded', () => this.clearFloating()),
      this.bus.on('day:start', () => this.clearFloating()),
      this.bus.on('day:end', () => this.clearFloating()),
      this.bus.on('game:over', () => this.clearFloating())
    );
  }

  private acquireElement(): HTMLElement {
    if (this.pool.length > 0) {
      const el = this.pool.pop()!;
      el.style.opacity = '1';
      return el;
    }
    const el = document.createElement('div');
    this.layer.appendChild(el);
    return el;
  }

  private releaseElement(el: HTMLElement): void {
    el.style.display = 'none';
    el.className = '';
    el.textContent = '';
    el.style.left = '-9999px';
    el.style.top = '-9999px';
    el.style.transform = '';
    this.pool.push(el);
  }

  private spawnFloatingText(pos: Vec2, heightY: number, text: string, className: string, ttl: number): void {
    if (this.sim.state.phase !== 'playing') return;
    const el = this.acquireElement();
    el.className = className;
    el.textContent = text;
    const worldPos = { x: pos.x, z: pos.z };
    const screen = this.renderer.worldToScreen(worldPos, heightY);
    el.style.left = `${Math.round(screen.x)}px`;
    el.style.top = `${Math.round(screen.y)}px`;
    el.style.display = screen.visible
      ? el.className === 'customer-emote-bubble'
        ? 'flex'
        : 'block'
      : 'none';

    this.activeItems.push({
      el,
      worldPos,
      heightY,
      ttl,
      maxTtl: ttl,
    });
  }

  public clearFloating(): void {
    for (let i = this.activeItems.length - 1; i >= 0; i--) {
      this.releaseElement(this.activeItems[i].el);
    }
    this.activeItems = [];
  }

  public showToast(text: string, kind: 'info' | 'good' | 'bad' | 'unlock' = 'info', shake = false): void {
    if (this.isDuplicateToast(text)) {
      return;
    }

    const toast = document.createElement('div');
    toast.className = `toast-item ${kind} ${shake ? 'action-fail-shake' : ''}`;
    toast.textContent = text;

    this.toastContainer.appendChild(toast);

    // Max 3 toasts visible: remove oldest
    while (this.toastContainer.children.length > 3) {
      const first = this.toastContainer.children[0];
      first.remove();
    }

    // Auto-dismiss 3.5s
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(20px)';
      setTimeout(() => {
        if (toast.parentElement) toast.remove();
      }, 300);
    }, 3500);
  }

  public update(dt: number): void {
    for (let i = this.activeItems.length - 1; i >= 0; i--) {
      const item = this.activeItems[i];
      item.ttl -= dt;

      if (item.ttl <= 0) {
        this.releaseElement(item.el);
        this.activeItems.splice(i, 1);
        continue;
      }

      // Project world to screen
      const screen = this.renderer.worldToScreen(item.worldPos, item.heightY);
      if (screen.visible) {
        item.el.style.display = item.el.className === 'customer-emote-bubble' ? 'flex' : 'block';
        item.el.style.left = `${Math.round(screen.x)}px`;
        item.el.style.top = `${Math.round(screen.y)}px`;
      } else {
        item.el.style.display = 'none';
      }
    }
  }

  public destroy(): void {
    this.unsubs.forEach((u) => u());
    this.clearFloating();
    this.layer.remove();
    this.toastContainer.remove();
    this.activeItems = [];
    this.pool = [];
  }
}
