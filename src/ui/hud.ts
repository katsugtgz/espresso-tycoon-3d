import type { ISim, OrderSnap, GameSpeed, DrinkId } from '../types';
import { DRINK_ORDER } from '../types';
import type { AppHooks } from '../appTypes';
import type { EventBus } from '../core/events';
import type { GameEvents } from '../types';
import { DRINKS } from '../config/balance';
import { asset } from '../config/assets';

const SHAPE_GLYPHS: Record<string, string> = {
  circle: '●',
  square: '■',
  triangle: '▲',
  diamond: '◆',
  star: '★',
  hexagon: '⬢',
};

export interface HudDelegate {
  openShop(): void;
  openSettings(): void;
}

export class HudOverlay {
  private container: HTMLElement;
  private moneyEl: HTMLElement;
  private dayNumEl: HTMLElement;
  private clockEl: HTMLElement;
  private dayProgressBar: HTMLElement;
  private ratingEl: HTMLElement;
  private comboEl: HTMLElement;
  private rushBannerEl: HTMLElement;
  private pausedBadgeEl: HTMLElement;
  private speed1Btn: HTMLButtonElement;
  private speed2Btn: HTMLButtonElement;
  private speed4Btn: HTMLButtonElement;
  private pauseBtn: HTMLButtonElement;
  private musicBtn: HTMLButtonElement;
  private ticketsRailEl: HTMLElement;
  private goalsPanelEl: HTMLElement;

  private displayedMoney = 0;
  private lastPhase = '';
  private lastClockMinutes = -1;
  private lastDay = -1;
  private lastRating = -1;
  private lastCombo = -1;
  private lastRush = false;
  private lastPaused = false;
  private lastMusicOn: boolean | null = null;
  private lastSpeed: GameSpeed = 1;
  private lastOrdersHash = '';
  private lastGoalsHash = '';
  private goalsCollapsed = false;
  private unsubs: (() => void)[] = [];

  constructor(
    root: HTMLElement,
    private sim: ISim,
    private bus: EventBus<GameEvents>,
    private hooks: AppHooks,
    private delegate: HudDelegate
  ) {
    this.container = document.createElement('div');
    this.container.id = 'hud-overlay';
    this.container.style.display = 'none';

    // Top Bar
    const topBar = document.createElement('div');
    topBar.className = 'hud-top-bar';

    // Stats panel (left)
    const statsPanel = document.createElement('div');
    statsPanel.className = 'hud-panel hud-stats-group';

    this.moneyEl = document.createElement('div');
    this.moneyEl.className = 'hud-money-badge';
    this.moneyEl.setAttribute('data-testid', 'money');
    this.moneyEl.textContent = '$0.00';

    const clockGroup = document.createElement('div');
    clockGroup.className = 'hud-clock-group';

    const clockRow = document.createElement('div');
    clockRow.className = 'hud-clock-row';
    this.dayNumEl = document.createElement('span');
    this.dayNumEl.textContent = 'Day 1';
    this.clockEl = document.createElement('span');
    this.clockEl.className = 'hud-clock-time';
    this.clockEl.textContent = '8:00 AM';
    clockRow.appendChild(this.dayNumEl);
    clockRow.appendChild(this.clockEl);

    const barContainer = document.createElement('div');
    barContainer.className = 'hud-day-bar-container';
    this.dayProgressBar = document.createElement('div');
    this.dayProgressBar.className = 'hud-day-bar-fill';
    barContainer.appendChild(this.dayProgressBar);

    clockGroup.appendChild(clockRow);
    clockGroup.appendChild(barContainer);

    this.ratingEl = document.createElement('div');
    this.ratingEl.className = 'hud-rating-badge';
    this.ratingEl.innerHTML = `<span>★</span><span>3.0</span>`;

    this.comboEl = document.createElement('div');
    this.comboEl.className = 'hud-combo-badge';
    this.comboEl.style.display = 'none';

    this.rushBannerEl = document.createElement('div');
    this.rushBannerEl.className = 'hud-rush-banner';
    this.rushBannerEl.innerHTML = `<span>🔥</span><span>RUSH HOUR</span>`;
    this.rushBannerEl.style.display = 'none';

    this.pausedBadgeEl = document.createElement('div');
    this.pausedBadgeEl.className = 'hud-combo-badge';
    this.pausedBadgeEl.style.borderColor = 'var(--gold-400)';
    this.pausedBadgeEl.innerHTML = `<span>⏸</span><span>PAUSED</span>`;
    this.pausedBadgeEl.style.display = 'none';

    statsPanel.appendChild(this.moneyEl);
    statsPanel.appendChild(clockGroup);
    statsPanel.appendChild(this.ratingEl);
    statsPanel.appendChild(this.comboEl);
    statsPanel.appendChild(this.rushBannerEl);
    statsPanel.appendChild(this.pausedBadgeEl);

    // Controls panel (right)
    const controlsPanel = document.createElement('div');
    controlsPanel.className = 'hud-panel hud-controls-group';

    // Speed button group
    const speedGroup = document.createElement('div');
    speedGroup.className = 'speed-btn-group';

    this.speed1Btn = document.createElement('button');
    this.speed1Btn.textContent = '1x';
    this.speed1Btn.className = 'active';
    this.speed1Btn.onclick = () => this.setSpeed(1);

    this.speed2Btn = document.createElement('button');
    this.speed2Btn.textContent = '2x';
    this.speed2Btn.onclick = () => this.setSpeed(2);

    this.speed4Btn = document.createElement('button');
    this.speed4Btn.textContent = '4x';
    this.speed4Btn.onclick = () => this.setSpeed(4);

    speedGroup.appendChild(this.speed1Btn);
    speedGroup.appendChild(this.speed2Btn);
    speedGroup.appendChild(this.speed4Btn);

    // Pause button
    this.pauseBtn = document.createElement('button');
    this.pauseBtn.setAttribute('data-testid', 'btn-pause');
    this.pauseBtn.className = 'icon-btn';
    this.pauseBtn.innerHTML = '⏸';
    this.pauseBtn.title = 'Pause (Space)';
    this.pauseBtn.onclick = () => {
      const nextPaused = !this.sim.state.paused;
      this.sim.dispatch({ type: 'pause', paused: nextPaused });
      this.bus.emit('ui:click', {});
    };

    // Quick Music/Lo-Fi toggle button
    this.musicBtn = document.createElement('button');
    this.musicBtn.className = 'icon-btn';
    this.musicBtn.innerHTML = '🎵';
    this.musicBtn.title = 'Toggle Lo-Fi Music (M)';
    this.musicBtn.onclick = () => {
      const cur = this.hooks.getSettings();
      this.hooks.applySettings({ musicOn: !cur.musicOn });
      this.bus.emit('ui:click', {});
    };

    // Shop button
    const shopBtn = document.createElement('button');
    shopBtn.setAttribute('data-testid', 'btn-shop');
    shopBtn.innerHTML = '🛍️ <span>Shop</span>';
    shopBtn.title = 'Shop & Upgrades (B)';
    shopBtn.onclick = () => {
      this.delegate.openShop();
      this.bus.emit('ui:click', {});
    };

    // Save button
    const saveBtn = document.createElement('button');
    saveBtn.innerHTML = '💾';
    saveBtn.title = 'Save Game (Ctrl+S)';
    saveBtn.className = 'icon-btn';
    saveBtn.onclick = () => {
      const ok = this.hooks.save();
      this.bus.emit('ui:click', {});
      if (ok) {
        this.bus.emit('toast', { text: '💾 Game Saved', kind: 'info' });
      }
    };

    // Camera reset button
    const camBtn = document.createElement('button');
    camBtn.innerHTML = '🎥';
    camBtn.title = 'Reset Camera (R)';
    camBtn.className = 'icon-btn';
    camBtn.onclick = () => {
      this.hooks.resetCamera();
      this.bus.emit('ui:click', {});
    };

    // Settings gear button
    const settingsBtn = document.createElement('button');
    settingsBtn.innerHTML = '⚙️';
    settingsBtn.title = 'Settings';
    settingsBtn.className = 'icon-btn';
    settingsBtn.onclick = () => {
      this.delegate.openSettings();
      this.bus.emit('ui:click', {});
    };

    controlsPanel.appendChild(speedGroup);
    controlsPanel.appendChild(this.pauseBtn);
    controlsPanel.appendChild(this.musicBtn);
    controlsPanel.appendChild(shopBtn);
    controlsPanel.appendChild(saveBtn);
    controlsPanel.appendChild(camBtn);
    controlsPanel.appendChild(settingsBtn);

    this.unsubs.push(
      this.bus.on('settings:change', () => {
        this.updateMusicBtn();
      })
    );
    this.updateMusicBtn();

    topBar.appendChild(statsPanel);
    topBar.appendChild(controlsPanel);
    this.container.appendChild(topBar);

    // Bottom Row: Orders rail (left) & Goals (right)
    const bottomRow = document.createElement('div');
    bottomRow.className = 'hud-bottom-row';

    this.ticketsRailEl = document.createElement('div');
    this.ticketsRailEl.className = 'order-tickets-rail';

    this.goalsPanelEl = document.createElement('div');
    this.goalsPanelEl.className = 'hud-goals-panel';

    bottomRow.appendChild(this.ticketsRailEl);
    bottomRow.appendChild(this.goalsPanelEl);
    this.container.appendChild(bottomRow);

    root.appendChild(this.container);
  }

  private setSpeed(speed: GameSpeed): void {
    this.sim.dispatch({ type: 'setSpeed', speed });
    this.bus.emit('ui:click', {});
  }

  public update(dt: number): void {
    const state = this.sim.state;
    const isPlaying = state.phase === 'playing';

    if (this.lastPhase !== state.phase) {
      this.lastPhase = state.phase;
      this.container.style.display = isPlaying ? 'flex' : 'none';
    }

    if (!isPlaying) return;

    // 1. Money count-up animation
    const targetMoney = state.money;
    if (Math.abs(this.displayedMoney - targetMoney) > 0.05) {
      this.displayedMoney += (targetMoney - this.displayedMoney) * Math.min(1, dt * 10);
      const isNeg = this.displayedMoney < 0;
      this.moneyEl.textContent = `${isNeg ? '-' : ''}$${Math.abs(this.displayedMoney).toFixed(2)}`;
      this.moneyEl.classList.toggle('negative', isNeg);
    } else if (this.displayedMoney !== targetMoney) {
      this.displayedMoney = targetMoney;
      const isNeg = this.displayedMoney < 0;
      this.moneyEl.textContent = `${isNeg ? '-' : ''}$${Math.abs(this.displayedMoney).toFixed(2)}`;
      this.moneyEl.classList.toggle('negative', isNeg);
    }

    // 2. Day & Clock
    if (this.lastDay !== state.day) {
      this.lastDay = state.day;
      this.dayNumEl.textContent = `Day ${state.day}`;
    }

    if (this.lastClockMinutes !== state.clockMinutes) {
      this.lastClockMinutes = state.clockMinutes;
      this.clockEl.textContent = this.formatClock(state.clockMinutes);
    }

    // Day progress bar
    const progressPct = Math.min(100, Math.max(0, (state.dayTime / (state.dayLength || 150)) * 100));
    this.dayProgressBar.style.width = `${progressPct.toFixed(1)}%`;

    // 3. Rating
    if (this.lastRating !== state.rating) {
      this.lastRating = state.rating;
      this.ratingEl.innerHTML = `<span>★</span><span>${state.rating.toFixed(1)}</span>`;
    }

    // 4. Combo
    if (this.lastCombo !== state.combo) {
      this.lastCombo = state.combo;
      if (state.combo > 1) {
        this.comboEl.style.display = 'flex';
        this.comboEl.innerHTML = `<span>🔥</span><span>Combo x${state.combo}</span>`;
      } else {
        this.comboEl.style.display = 'none';
      }
    }

    // 5. Rush banner
    if (this.lastRush !== state.rush) {
      this.lastRush = state.rush;
      this.rushBannerEl.style.display = state.rush ? 'flex' : 'none';
    }

    // 6. Paused state & Speed buttons
    if (this.lastPaused !== state.paused) {
      this.lastPaused = state.paused;
      this.pauseBtn.innerHTML = state.paused ? '▶' : '⏸';
      this.pausedBadgeEl.style.display = state.paused ? 'flex' : 'none';
    }

    if (this.lastSpeed !== state.speed) {
      this.lastSpeed = state.speed;
      this.speed1Btn.className = state.speed === 1 ? 'active' : '';
      this.speed2Btn.className = state.speed === 2 ? 'active' : '';
      this.speed4Btn.className = state.speed === 4 ? 'active' : '';
    }

    // 7. Lo-Fi Music button
    this.updateMusicBtn();

    // 8. Orders rail diff
    this.updateOrdersRail();

    // 9. Goals panel diff
    this.updateGoalsPanel();
  }

  private updateMusicBtn(): void {
    const s = this.hooks.getSettings();
    if (this.lastMusicOn !== s.musicOn) {
      this.lastMusicOn = s.musicOn;
      this.musicBtn.innerHTML = s.musicOn ? '🎵' : '🔇';
      this.musicBtn.title = s.musicOn ? 'Lo-Fi Music: ON' : 'Lo-Fi Music: OFF';
      this.musicBtn.classList.toggle('muted', !s.musicOn);
    }
  }

  private updateOrdersRail(): void {
    const orders = this.sim.state.orders;
    const machines = this.sim.state.machines;
    const customers = this.sim.state.customers;

    // Create a signature to check if we can skip full DOM re-generation
    const signature = orders
      .map((o) => {
        const m = machines.find((mac) => mac.orderId === o.id);
        const c = customers.find((cust) => cust.id === o.customerId);
        const prog = m ? Math.round(m.progress * 10) : 0;
        const pat = c ? Math.round(c.patience * 10) : 0;
        return `${o.id}:${o.status}:${prog}:${pat}`;
      })
      .join('|');

    if (signature === this.lastOrdersHash) return;
    this.lastOrdersHash = signature;

    this.ticketsRailEl.innerHTML = '';

    for (let i = 0; i < orders.length; i++) {
      const order = orders[i];
      const drink = DRINKS[order.drink];
      const customer = customers.find((c) => c.id === order.customerId);
      const machine = machines.find((m) => m.orderId === order.id);

      const ticket = document.createElement('div');
      ticket.className = 'order-ticket';
      ticket.setAttribute('data-testid', `ticket-${order.id}`);
      if (drink) {
        ticket.style.setProperty('--ticket-color', drink.color);
      }

      // Hotkey hint chip (index 1..6 if matches DRINK_ORDER)
      const drinkOrderIdx = DRINK_ORDER.indexOf(order.drink);
      const hotkeyHint = drinkOrderIdx >= 0 ? `${drinkOrderIdx + 1}` : '';

      // Status info
      let statusHtml = '';
      if (order.status === 'pending') {
        statusHtml = `<div class="order-status-badge pending">Pending</div>`;
      } else if (order.status === 'brewing') {
        const pct = machine ? Math.round(machine.progress * 100) : 0;
        statusHtml = `<div class="order-status-badge brewing">Brewing ${pct}%</div>`;
      } else if (order.status === 'ready') {
        statusHtml = `<div class="order-status-badge ready">✓ Ready! Serve</div>`;
      }

      // Patience bar
      const patienceVal = customer ? customer.patience : 1;
      const patiencePct = Math.round(patienceVal * 100);
      const patienceClass =
        patienceVal > 0.5 ? 'patience-high' : patienceVal > 0.25 ? 'patience-med' : 'patience-low';

      const shapeGlyph = drink ? (SHAPE_GLYPHS[drink.shape] ?? '●') : '●';

      ticket.innerHTML = `
        <div class="order-ticket-header">
          <div class="order-drink-title">
            <img class="order-drink-svg" src="${asset(`${order.drink}.svg`)}" alt="" />
            <span>${drink?.name ?? order.drink}</span>
            <span class="order-shape-glyph" style="color:${drink?.color ?? '#fff'}">${shapeGlyph}</span>
          </div>
          ${hotkeyHint ? `<span class="order-hotkey-chip">${hotkeyHint}</span>` : ''}
        </div>
        ${statusHtml}
        <div class="order-patience-bar">
          <div class="order-patience-fill ${patienceClass}" style="width: ${patiencePct}%"></div>
        </div>
      `;

      ticket.onclick = () => {
        if (order.status === 'pending') {
          const res = this.sim.dispatch({ type: 'brew', drink: order.drink });
          this.bus.emit('ui:click', {});
          if (!res.ok && res.reason) {
            this.bus.emit('action:fail', { action: 'brew', reason: res.reason });
          }
        } else if (order.status === 'ready') {
          const res = this.sim.dispatch({ type: 'serve', machineId: order.machineId ?? undefined });
          this.bus.emit('ui:click', {});
          if (!res.ok && res.reason) {
            this.bus.emit('action:fail', { action: 'serve', reason: res.reason });
          }
        }
      };

      this.ticketsRailEl.appendChild(ticket);
    }
  }

  private updateGoalsPanel(): void {
    const goals = this.sim.state.goals;
    if (!goals || goals.length === 0) {
      this.goalsPanelEl.style.display = 'none';
      return;
    }
    this.goalsPanelEl.style.display = 'block';

    const doneCount = goals.filter((g) => g.done).length;
    const signature = `${goals.map((g) => `${g.id}:${g.progress}:${g.done}`).join('|')}|c:${this.goalsCollapsed}`;
    if (signature === this.lastGoalsHash) return;
    this.lastGoalsHash = signature;

    this.goalsPanelEl.innerHTML = `
      <div class="hud-goals-header" title="Click to toggle goals">
        <span>🎯 Goals (${doneCount}/${goals.length})</span>
        <span class="hud-goals-toggle">${this.goalsCollapsed ? '▲' : '▼'}</span>
      </div>
    `;

    const header = this.goalsPanelEl.querySelector('.hud-goals-header') as HTMLElement;
    header.onclick = () => {
      this.goalsCollapsed = !this.goalsCollapsed;
      this.lastGoalsHash = '';
      this.updateGoalsPanel();
      this.bus.emit('ui:click', {});
    };

    if (this.goalsCollapsed) return;

    for (const g of goals) {
      const pct = Math.min(100, Math.round((g.progress / g.target) * 100));
      const goalEl = document.createElement('div');
      goalEl.className = `goal-item ${g.done ? 'done' : ''}`;
      goalEl.innerHTML = `
        <div class="goal-item-top">
          <span class="goal-desc">${g.done ? '✓ ' : ''}${g.desc}</span>
          <span class="goal-reward">+$${g.reward}</span>
        </div>
        <div class="goal-progress-bar">
          <div class="goal-progress-fill" style="width: ${pct}%"></div>
        </div>
      `;
      this.goalsPanelEl.appendChild(goalEl);
    }
  }

  private formatClock(minutes: number): string {
    const hrs = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);
    const period = hrs >= 12 ? 'PM' : 'AM';
    const h = hrs % 12 === 0 ? 12 : hrs % 12;
    const m = mins < 10 ? `0${mins}` : mins;
    return `${h}:${m} ${period}`;
  }

  public destroy(): void {
    this.unsubs.forEach((u) => u());
    this.container.remove();
  }
}
