import type { ISim } from '../types';
import type { AppHooks } from '../appTypes';
import type { EventBus } from '../core/events';
import type { GameEvents } from '../types';
import { asset } from '../config/assets';

export interface MenuDelegate {
  openSettings(): void;
  openShop(): void;
}

export class MenuManager {
  private mainMenuEl: HTMLElement;
  private pauseModalEl: HTMLElement;
  private pauseCardEl: HTMLElement;
  private dayEndModalEl: HTMLElement;
  private dayEndCardEl: HTMLElement;
  private gameOverModalEl: HTMLElement;
  private gameOverCardEl: HTMLElement;
  private howToPlayModalEl: HTMLElement;
  private howToPlayCardEl: HTMLElement;

  private isPauseOpen = false;
  private isHowToPlayOpen = false;
  private lastPhase = '';
  private lastDayEndRendered = -1;
  private lastGameOverRendered = false;

  constructor(
    root: HTMLElement,
    private sim: ISim,
    private bus: EventBus<GameEvents>,
    private hooks: AppHooks,
    private delegate: MenuDelegate
  ) {
    // 1. Main Menu Screen
    this.mainMenuEl = document.createElement('div');
    this.mainMenuEl.id = 'main-menu-screen';
    root.appendChild(this.mainMenuEl);

    // 2. Pause Menu Modal
    this.pauseModalEl = document.createElement('div');
    this.pauseModalEl.className = 'modal-backdrop';
    this.pauseModalEl.style.display = 'none';

    this.pauseCardEl = document.createElement('div');
    this.pauseCardEl.className = 'modal-card';
    this.pauseCardEl.setAttribute('data-testid', 'pause-menu');
    this.pauseCardEl.style.maxWidth = '360px';
    this.pauseModalEl.appendChild(this.pauseCardEl);
    root.appendChild(this.pauseModalEl);

    // 3. Day-End Modal
    this.dayEndModalEl = document.createElement('div');
    this.dayEndModalEl.className = 'modal-backdrop';
    this.dayEndModalEl.style.display = 'none';

    this.dayEndCardEl = document.createElement('div');
    this.dayEndCardEl.className = 'modal-card';
    this.dayEndCardEl.setAttribute('data-testid', 'day-end-modal');
    this.dayEndCardEl.style.maxWidth = '560px';
    this.dayEndModalEl.appendChild(this.dayEndCardEl);
    root.appendChild(this.dayEndModalEl);

    // 4. Game Over Modal
    this.gameOverModalEl = document.createElement('div');
    this.gameOverModalEl.className = 'modal-backdrop';
    this.gameOverModalEl.style.display = 'none';

    this.gameOverCardEl = document.createElement('div');
    this.gameOverCardEl.className = 'modal-card';
    this.gameOverCardEl.style.maxWidth = '460px';
    this.gameOverModalEl.appendChild(this.gameOverCardEl);
    root.appendChild(this.gameOverModalEl);

    // 5. How To Play Modal
    this.howToPlayModalEl = document.createElement('div');
    this.howToPlayModalEl.className = 'modal-backdrop';
    this.howToPlayModalEl.style.display = 'none';

    this.howToPlayCardEl = document.createElement('div');
    this.howToPlayCardEl.className = 'modal-card';
    this.howToPlayCardEl.style.maxWidth = '600px';
    this.howToPlayModalEl.appendChild(this.howToPlayCardEl);
    root.appendChild(this.howToPlayModalEl);

    this.howToPlayModalEl.addEventListener('click', (e) => {
      if (e.target === this.howToPlayModalEl) this.closeHowToPlay();
    });

    this.pauseModalEl.addEventListener('click', (e) => {
      if (e.target === this.pauseModalEl) this.closePause();
    });

    this.buildPauseMenu();
    this.buildHowToPlay();
  }

  // --- Main Menu ---
  private renderMainMenu(): void {
    const hasSave = this.hooks.hasSave();
    this.mainMenuEl.innerHTML = `
      <div class="main-menu-logo-container">
        <img class="main-menu-logo" src="${asset('logo.svg')}" alt="Espresso Tycoon 3D Logo" />
        <h1 class="main-menu-title">Espresso <span>Tycoon</span> 3D</h1>
        <p class="main-menu-subtitle">Cozy Coffee Shop Management</p>
      </div>

      <div class="main-menu-actions">
        <button class="primary" data-testid="btn-new-game" id="btn-main-new-game">
          ✨ New Game
        </button>
        <button data-testid="btn-continue" id="btn-main-continue" ${!hasSave ? 'disabled' : ''}>
          ▶ Continue
        </button>
        <button id="btn-main-how-to-play">
          📖 How to Play
        </button>
        <button id="btn-main-settings">
          ⚙️ Settings
        </button>
        ${
          hasSave
            ? `<button id="btn-main-reset-save" style="margin-top:4px;">
          🗑 Reset Save
        </button>`
            : ''
        }
      </div>
    `;

    // New Game button
    const newBtn = this.mainMenuEl.querySelector('#btn-main-new-game') as HTMLButtonElement;
    newBtn.onclick = () => {
      this.bus.emit('ui:click', {});
      if (!this.hooks.hasSave()) {
        this.hooks.newGame({ tutorial: true });
        return;
      }

      // In-DOM confirm modal if save exists
      if (this.mainMenuEl.querySelector('#new-game-confirm-modal')) return;

      const confirmModal = document.createElement('div');
      confirmModal.id = 'new-game-confirm-modal';
      confirmModal.className = 'modal-backdrop';
      confirmModal.style.position = 'absolute';
      confirmModal.style.inset = '0';
      confirmModal.style.zIndex = '100';
      confirmModal.style.display = 'flex';
      confirmModal.style.alignItems = 'center';
      confirmModal.style.justifyContent = 'center';

      confirmModal.innerHTML = `
        <div class="modal-card" style="max-width:380px; padding:20px; text-align:center;">
          <h3 style="color:var(--gold-400); margin-bottom:12px; font-size:18px;">Overwrite Saved Cafe?</h3>
          <p style="color:var(--cream-300); font-size:14px; margin-bottom:20px; line-height:1.4;">
            A saved game already exists. Starting a new game will overwrite your current progress. Continue?
          </p>
          <div style="display:flex; gap:12px; justify-content:center;">
            <button class="danger" id="btn-confirm-new-game" style="flex:1;">Yes, Start New Game</button>
            <button id="btn-cancel-new-game" style="flex:1;">Cancel</button>
          </div>
        </div>
      `;

      confirmModal.addEventListener('click', (e) => {
        if (e.target === confirmModal) {
          confirmModal.remove();
          this.bus.emit('ui:click', {});
        }
      });

      confirmModal.querySelector('#btn-confirm-new-game')?.addEventListener('click', () => {
        confirmModal.remove();
        this.bus.emit('ui:click', {});
        this.hooks.newGame({ tutorial: true });
      });

      confirmModal.querySelector('#btn-cancel-new-game')?.addEventListener('click', () => {
        confirmModal.remove();
        this.bus.emit('ui:click', {});
      });

      this.mainMenuEl.appendChild(confirmModal);
    };

    // Reset Save button (when save exists)
    const resetSaveBtn = this.mainMenuEl.querySelector('#btn-main-reset-save') as HTMLButtonElement | null;
    if (resetSaveBtn) {
      let confirmPending = false;
      let timer: number | null = null;
      resetSaveBtn.onclick = () => {
        this.bus.emit('ui:click', {});
        if (!confirmPending) {
          confirmPending = true;
          resetSaveBtn.textContent = '⚠️ Confirm Delete Save?';
          resetSaveBtn.classList.add('danger');
          timer = window.setTimeout(() => {
            confirmPending = false;
            resetSaveBtn.textContent = '🗑 Reset Save';
            resetSaveBtn.classList.remove('danger');
          }, 4000);
        } else {
          if (timer) clearTimeout(timer);
          this.hooks.resetSave();
          this.bus.emit('toast', { text: 'Save data deleted', kind: 'info' });
          this.renderMainMenu();
        }
      };
    }

    // Continue button
    const contBtn = this.mainMenuEl.querySelector('#btn-main-continue') as HTMLButtonElement;
    contBtn.onclick = () => {
      this.bus.emit('ui:click', {});
      this.hooks.continueGame();
    };

    // How to play button
    const howBtn = this.mainMenuEl.querySelector('#btn-main-how-to-play') as HTMLButtonElement;
    howBtn.onclick = () => {
      this.bus.emit('ui:click', {});
      this.openHowToPlay();
    };

    // Settings button
    const setBtn = this.mainMenuEl.querySelector('#btn-main-settings') as HTMLButtonElement;
    setBtn.onclick = () => {
      this.bus.emit('ui:click', {});
      this.delegate.openSettings();
    };
  }

  // --- Pause Menu ---
  private buildPauseMenu(): void {
    this.pauseCardEl.innerHTML = `
      <div class="modal-header">
        <h2>⏸ Game Paused</h2>
        <button class="icon-btn" id="btn-close-pause">✕</button>
      </div>
      <div class="modal-body" style="display:flex; flex-direction:column; gap:12px;">
        <button class="primary" id="btn-pause-resume" style="padding:14px;">▶ Resume</button>
        <button id="btn-pause-save">💾 Save Game</button>
        <button id="btn-pause-settings">⚙️ Settings</button>
        <button class="danger" id="btn-pause-quit">🚪 Quit to Menu</button>
      </div>
    `;

    this.pauseCardEl.querySelector('#btn-close-pause')?.addEventListener('click', () => {
      this.closePause();
      this.bus.emit('ui:click', {});
    });

    this.pauseCardEl.querySelector('#btn-pause-resume')?.addEventListener('click', () => {
      this.closePause();
      this.bus.emit('ui:click', {});
    });

    this.pauseCardEl.querySelector('#btn-pause-save')?.addEventListener('click', () => {
      const ok = this.hooks.save();
      this.bus.emit('ui:click', {});
      if (ok) this.bus.emit('toast', { text: '💾 Game Saved', kind: 'info' });
    });

    this.pauseCardEl.querySelector('#btn-pause-settings')?.addEventListener('click', () => {
      this.delegate.openSettings();
      this.bus.emit('ui:click', {});
    });

    this.pauseCardEl.querySelector('#btn-pause-quit')?.addEventListener('click', () => {
      this.closePause();
      this.bus.emit('ui:click', {});
      this.hooks.quitToMenu();
    });
  }

  public openPause(): void {
    this.isPauseOpen = true;
    this.pauseModalEl.style.display = 'flex';
    this.sim.dispatch({ type: 'pause', paused: true });
    this.bus.emit('ui:open', { panel: 'pause' });
  }

  public closePause(): void {
    if (!this.isPauseOpen) return;
    this.isPauseOpen = false;
    this.pauseModalEl.style.display = 'none';
    this.sim.dispatch({ type: 'pause', paused: false });
  }

  public togglePause(): void {
    if (this.isPauseOpen) this.closePause();
    else this.openPause();
  }

  public isPauseMenuOpen(): boolean {
    return this.isPauseOpen;
  }

  // --- Day-End Modal ---
  private renderDayEnd(): void {
    const state = this.sim.state;
    const stats = state.dayStats;
    const isDebt = state.money < 0;

    let warningHtml = '';
    if (isDebt) {
      warningHtml += `
        <div class="day-end-strike-warning">
          <span>⚠️ Strike ${state.bankruptStrikes}/2: Cafe balance is negative! Reach 2 consecutive strikes and your cafe goes bankrupt!</span>
        </div>
      `;
    }

    if (state.rating < 1.5) {
      warningHtml += `
        <div class="day-end-strike-warning">
          <span>⚠️ Reputation Strike ${state.lowRatingStrikes ?? 0}/4: Rating below 1.5★! Keep rating ≥1.5★ to avoid closure!</span>
        </div>
      `;
    } else if (state.rating < 2.2) {
      warningHtml += `
        <div class="day-end-strike-warning" style="border-color:var(--gold-400); background:rgba(212,175,55,0.15); color:var(--gold-300);">
          <span>⚠️ Low rating (<2.2★) slows customer arrivals. Upgrade machines/decor!</span>
        </div>
      `;
    }

    let managerTip = '';
    if (stats.lost >= 3) {
      managerTip = 'High customer turnover! Consider buying another Espresso Machine, upgrading Pro Grinder, or hiring a Barista to cut wait times.';
    } else if (stats.profit < 0) {
      managerTip = 'Negative profit today! Consider adjusting drink prices in Shop or keeping expenses and barista wages balanced.';
    } else if (state.day <= 2) {
      managerTip = 'Great start! Buy Decor & Tables in the Shop to raise your cafe rating ceiling & boost tips!';
    }

    const profitColor = stats.profit >= 0 ? 'var(--success-400)' : 'var(--danger-400)';

    this.dayEndCardEl.innerHTML = `
      <div class="modal-header">
        <h2>🌙 Day ${stats.day || state.day} Summary</h2>
      </div>
      <div class="modal-body">
        ${warningHtml}

        <div class="day-end-stats-grid">
          <!-- Financials -->
          <div class="day-end-section">
            <h3>💵 Financials</h3>
            <div class="day-end-line">
              <span>Drink Revenue:</span>
              <span style="color:var(--success-400)">+$${stats.revenue.toFixed(2)}</span>
            </div>
            <div class="day-end-line">
              <span>Customer Tips:</span>
              <span style="color:var(--gold-300)">+$${stats.tips.toFixed(2)}</span>
            </div>
            <div class="day-end-line">
              <span>Daily Expenses:</span>
              <span style="color:var(--danger-400)">-$${stats.expenses.toFixed(2)}</span>
            </div>
            <div class="day-end-line">
              <span>Shop Rent:</span>
              <span style="color:var(--danger-400)">-$${stats.rent.toFixed(2)}</span>
            </div>
            <div class="day-end-line">
              <span>Barista Wages:</span>
              <span style="color:var(--danger-400)">-$${stats.wages.toFixed(2)}</span>
            </div>
            <div class="day-end-line total">
              <span>Net Profit:</span>
              <span style="color:${profitColor}">$${stats.profit.toFixed(2)}</span>
            </div>
            <div class="day-end-line" style="font-weight:700; margin-top:6px;">
              <span>Total Balance:</span>
              <span style="color:var(--gold-400)">$${state.money.toFixed(2)}</span>
            </div>
          </div>

          <!-- Performance -->
          <div class="day-end-section">
            <h3>📈 Operations</h3>
            <div class="day-end-line">
              <span>Customers Served:</span>
              <span>${stats.served}</span>
            </div>
            <div class="day-end-line">
              <span>Customers Lost:</span>
              <span style="color:${stats.lost > 0 ? 'var(--danger-400)' : 'inherit'}">${stats.lost}</span>
            </div>
            <div class="day-end-line">
              <span>Best Combo:</span>
              <span style="color:var(--gold-300)">x${stats.bestCombo}</span>
            </div>
            <div class="day-end-line">
              <span>Rating:</span>
              <span>${stats.ratingStart.toFixed(1)} ★ ➔ ${stats.ratingEnd.toFixed(1)} ★</span>
            </div>
          </div>
        </div>

        <!-- Goals -->
        ${
          state.goals && state.goals.length > 0
            ? `
            <div class="day-end-section" style="margin-bottom:14px;">
              <h3>🎯 Daily Goals Completed</h3>
              ${state.goals
                .map(
                  (g) => `
                <div class="day-end-line">
                  <span>${g.done ? '✅' : '❌'} ${g.desc}</span>
                  <span style="color:${g.done ? 'var(--gold-300)' : 'inherit'}">${g.done ? `+$${g.reward}` : 'Incomplete'}</span>
                </div>
              `
                )
                .join('')}
            </div>
          `
            : ''
        }

        <!-- Manager Tip -->
        ${
          managerTip
            ? `
            <div class="day-end-section" style="margin-bottom:14px; border-color:var(--teal-500); background:rgba(42, 157, 143, 0.12);">
              <h3 style="color:var(--teal-400); margin-bottom:4px;">💡 Manager Tip</h3>
              <p style="font-size:13px; color:var(--cream-200); line-height:1.4;">${managerTip}</p>
            </div>
          `
            : ''
        }
      </div>
      <div class="modal-footer">
        <button id="btn-day-end-shop">🛍️ Shop</button>
        <button id="btn-day-end-menu">💾 Save & Menu</button>
        <button class="primary" data-testid="btn-next-day" id="btn-day-end-next">
          Start Next Day ➔
        </button>
      </div>
    `;

    this.dayEndCardEl.querySelector('#btn-day-end-shop')?.addEventListener('click', () => {
      this.delegate.openShop();
      this.bus.emit('ui:click', {});
    });

    this.dayEndCardEl.querySelector('#btn-day-end-menu')?.addEventListener('click', () => {
      this.dayEndModalEl.style.display = 'none';
      this.bus.emit('ui:click', {});
      this.hooks.quitToMenu();
    });

    this.dayEndCardEl.querySelector('#btn-day-end-next')?.addEventListener('click', () => {
      this.dayEndModalEl.style.display = 'none';
      this.bus.emit('ui:click', {});
      this.sim.dispatch({ type: 'startNextDay' });
    });
  }

  // --- Game Over Modal ---
  private renderGameOver(): void {
    const state = this.sim.state;
    const reason = state.gameOverReason || 'Your cafe could not sustain the debt.';

    this.gameOverCardEl.innerHTML = `
      <div class="modal-header">
        <h2 style="color:var(--danger-400)">☠️ Game Over</h2>
      </div>
      <div class="modal-body" style="text-align:center;">
        <p style="font-size:16px; color:var(--cream-200); margin-bottom:16px;">
          ${reason}
        </p>
        <div class="day-end-section" style="text-align:left; margin-bottom:16px;">
          <div class="day-end-line"><span>Days Survived:</span><span>${state.day}</span></div>
          <div class="day-end-line"><span>Final Rating:</span><span>${state.rating.toFixed(1)} ★</span></div>
          <div class="day-end-line"><span>Final Balance:</span><span>$${state.money.toFixed(2)}</span></div>
          <div class="day-end-line"><span>Total Customers Served:</span><span>${state.stats.totalServed}</span></div>
          <div class="day-end-line"><span>Total Revenue:</span><span>$${state.stats.totalRevenue.toFixed(2)}</span></div>
          <div class="day-end-line"><span>Max Combo:</span><span>x${state.stats.maxCombo}</span></div>
        </div>
      </div>
      <div class="modal-footer" style="justify-content:center;">
        <button class="primary" id="btn-gameover-new">Try Again</button>
        <button id="btn-gameover-menu">Main Menu</button>
      </div>
    `;

    this.gameOverCardEl.querySelector('#btn-gameover-new')?.addEventListener('click', () => {
      this.gameOverModalEl.style.display = 'none';
      this.bus.emit('ui:click', {});
      this.hooks.newGame({ tutorial: false });
    });

    this.gameOverCardEl.querySelector('#btn-gameover-menu')?.addEventListener('click', () => {
      this.gameOverModalEl.style.display = 'none';
      this.bus.emit('ui:click', {});
      this.hooks.quitToMenu();
    });
  }

  // --- How To Play Modal ---
  private buildHowToPlay(): void {
    this.howToPlayCardEl.innerHTML = `
      <div class="modal-header">
        <h2>📖 How to Play Espresso Tycoon 3D</h2>
        <button class="icon-btn" id="btn-close-how">✕</button>
      </div>
      <div class="modal-body">
        <div class="how-to-play-grid">
          <div class="how-card">
            <div class="how-icon">🧍</div>
            <div class="how-content">
              <h4>1. Customer Orders</h4>
              <p>Customers arrive at the door and queue up at the register to order. Each customer has a patience bar!</p>
            </div>
          </div>
          <div class="how-card">
            <div class="how-icon">☕</div>
            <div class="how-content">
              <h4>2. Brewing</h4>
              <p>Click an idle espresso machine or click the order ticket (or press hotkeys 1-6) to start brewing the drink.</p>
            </div>
          </div>
          <div class="how-card">
            <div class="how-icon">✨</div>
            <div class="how-content">
              <h4>3. Serving & Combos</h4>
              <p>When the brew finishes, click the ready machine (or ready ticket) to serve! Fast service builds combos and earns big tips.</p>
            </div>
          </div>
          <div class="how-card">
            <div class="how-icon">⚡</div>
            <div class="how-content">
              <h4>4. Upgrades & Expansion</h4>
              <p>Press <b>B</b> or tap <b>Shop</b> to upgrade espresso machines, faster grinders, more tables, hire baristas, and unlock high-margin specialty drinks.</p>
            </div>
          </div>
          <div class="how-card">
            <div class="how-icon">💰</div>
            <div class="how-content">
              <h4>5. Economy & Rent</h4>
              <p>Rent and barista wages are deducted at the end of each day. Avoid staying in debt or your café will go bankrupt!</p>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="primary" id="btn-done-how">Got it!</button>
      </div>
    `;

    this.howToPlayCardEl.querySelector('#btn-close-how')?.addEventListener('click', () => {
      this.closeHowToPlay();
      this.bus.emit('ui:click', {});
    });

    this.howToPlayCardEl.querySelector('#btn-done-how')?.addEventListener('click', () => {
      this.closeHowToPlay();
      this.bus.emit('ui:click', {});
    });
  }

  public openHowToPlay(): void {
    this.isHowToPlayOpen = true;
    this.howToPlayModalEl.style.display = 'flex';
    this.bus.emit('ui:open', { panel: 'how_to_play' });
  }

  public closeHowToPlay(): void {
    if (!this.isHowToPlayOpen) return;
    this.isHowToPlayOpen = false;
    this.howToPlayModalEl.style.display = 'none';
  }

  public isHowToPlayModalOpen(): boolean {
    return this.isHowToPlayOpen;
  }

  public update(): void {
    const phase = this.sim.state.phase;

    if (this.lastPhase !== phase) {
      this.lastPhase = phase;

      // Main Menu toggle
      if (phase === 'menu') {
        this.renderMainMenu();
        this.mainMenuEl.style.display = 'flex';
      } else {
        this.mainMenuEl.style.display = 'none';
      }

      // Day End toggle
      if (phase === 'day_end') {
        this.renderDayEnd();
        this.dayEndModalEl.style.display = 'flex';
        this.bus.emit('ui:open', { panel: 'day_end' });
      } else {
        this.dayEndModalEl.style.display = 'none';
      }

      // Game Over toggle
      if (phase === 'game_over') {
        this.renderGameOver();
        this.gameOverModalEl.style.display = 'flex';
        this.bus.emit('ui:open', { panel: 'game_over' });
      } else {
        this.gameOverModalEl.style.display = 'none';
      }

      // Close pause menu if leaving playing
      if (phase !== 'playing' && this.isPauseOpen) {
        this.closePause();
      }
    }
  }

  public destroy(): void {
    this.mainMenuEl.remove();
    this.pauseModalEl.remove();
    this.dayEndModalEl.remove();
    this.gameOverModalEl.remove();
    this.howToPlayModalEl.remove();
  }
}
