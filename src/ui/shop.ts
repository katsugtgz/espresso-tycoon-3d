import type { ISim, UpgradeId, DrinkId } from '../types';
import type { EventBus } from '../core/events';
import type { GameEvents } from '../types';
import { UPGRADES, DRINKS, ACHIEVEMENTS, PRICE_MIN_MULT, PRICE_MAX_MULT } from '../config/balance';
import { asset } from '../config/assets';

type ShopTab = 'upgrades' | 'menu' | 'stats';

export class ShopPanel {
  private backdrop: HTMLElement;
  private card: HTMLElement;
  private currentTab: ShopTab = 'upgrades';
  private opened = false;

  private upgradesTabEl!: HTMLElement;
  private menuTabEl!: HTMLElement;
  private statsTabEl!: HTMLElement;

  private lastMoney = -9999;
  private lastUpgradesHash = '';
  private lastUnlockedHash = '';
  private lastStatsHash = '';

  constructor(
    root: HTMLElement,
    private sim: ISim,
    private bus: EventBus<GameEvents>
  ) {
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'modal-backdrop';
    this.backdrop.style.display = 'none';

    this.card = document.createElement('div');
    this.card.className = 'modal-card';
    this.card.id = 'shop-panel-modal';
    this.card.setAttribute('data-testid', 'shop-panel');

    this.backdrop.appendChild(this.card);
    root.appendChild(this.backdrop);

    this.backdrop.addEventListener('click', (e) => {
      if (e.target === this.backdrop) {
        this.close();
      }
    });

    this.buildSkeleton();
  }

  private buildSkeleton(): void {
    // Header
    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = `
      <h2>🛍️ Coffee Shop Management</h2>
      <button class="icon-btn" id="btn-close-shop" title="Close">✕</button>
    `;
    this.card.appendChild(header);

    header.querySelector('#btn-close-shop')?.addEventListener('click', () => {
      this.close();
      this.bus.emit('ui:click', {});
    });

    // Tabs Bar
    const tabsBar = document.createElement('div');
    tabsBar.className = 'shop-tabs';

    const tabs: { id: ShopTab; label: string }[] = [
      { id: 'upgrades', label: '⚡ Upgrades' },
      { id: 'menu', label: '☕ Menu & Pricing' },
      { id: 'stats', label: '📊 Statistics & Badges' },
    ];

    for (const t of tabs) {
      const btn = document.createElement('button');
      btn.className = `shop-tab-btn ${t.id === this.currentTab ? 'active' : ''}`;
      btn.textContent = t.label;
      btn.dataset.tab = t.id;
      btn.addEventListener('click', () => {
        this.setTab(t.id);
        this.bus.emit('ui:click', {});
      });
      tabsBar.appendChild(btn);
    }
    this.card.appendChild(tabsBar);

    // Tab contents
    this.upgradesTabEl = document.createElement('div');
    this.upgradesTabEl.className = 'shop-tab-content active';
    this.card.appendChild(this.upgradesTabEl);

    this.menuTabEl = document.createElement('div');
    this.menuTabEl.className = 'shop-tab-content';
    this.card.appendChild(this.menuTabEl);

    this.statsTabEl = document.createElement('div');
    this.statsTabEl.className = 'shop-tab-content';
    this.card.appendChild(this.statsTabEl);
  }

  public setTab(tab: ShopTab): void {
    this.currentTab = tab;
    const tabBtns = this.card.querySelectorAll<HTMLButtonElement>('.shop-tab-btn');
    tabBtns.forEach((b) => {
      if (b.dataset.tab === tab) b.classList.add('active');
      else b.classList.remove('active');
    });

    this.upgradesTabEl.classList.toggle('active', tab === 'upgrades');
    this.menuTabEl.classList.toggle('active', tab === 'menu');
    this.statsTabEl.classList.toggle('active', tab === 'stats');

    this.forceRenderCurrentTab();
  }

  public open(): void {
    this.opened = true;
    this.backdrop.style.display = 'flex';
    this.lastMoney = -9999;
    this.forceRenderCurrentTab();
    this.bus.emit('ui:open', { panel: 'shop' });
  }

  public close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.backdrop.style.display = 'none';
  }

  public toggle(): void {
    if (this.opened) this.close();
    else this.open();
  }

  public isOpen(): boolean {
    return this.opened;
  }

  public update(): void {
    if (!this.opened) return;

    if (this.currentTab === 'upgrades') this.renderUpgrades();
    else if (this.currentTab === 'menu') this.renderMenu();
    else if (this.currentTab === 'stats') this.renderStats();
  }

  private forceRenderCurrentTab(): void {
    if (this.currentTab === 'upgrades') {
      this.lastUpgradesHash = '';
      this.renderUpgrades();
    } else if (this.currentTab === 'menu') {
      this.lastUnlockedHash = '';
      this.renderMenu();
    } else if (this.currentTab === 'stats') {
      this.lastStatsHash = '';
      this.renderStats();
    }
  }

  private renderUpgrades(): void {
    const state = this.sim.state;
    const upgradesList = Object.values(UPGRADES);

    const hash = upgradesList
      .map((u) => `${u.id}:${state.upgrades[u.id] ?? 0}`)
      .join('|') + `|m:${state.money}`;
    if (hash === this.lastUpgradesHash) return;
    this.lastUpgradesHash = hash;

    this.upgradesTabEl.innerHTML = '';

    for (const u of upgradesList) {
      const curLevel = state.upgrades[u.id] ?? 0;
      const cost = this.sim.upgradeCost(u.id);
      const isMax = curLevel >= u.maxLevel;
      const canAfford = !isMax && cost !== Infinity && state.money >= cost;

      const card = document.createElement('div');
      card.className = 'upgrade-card';

      let dotsHtml = '';
      for (let i = 0; i < u.maxLevel; i++) {
        dotsHtml += `<div class="upgrade-dot ${i < curLevel ? 'filled' : ''}"></div>`;
      }

      const iconHtml =
        u.id === 'machine'
          ? `<img class="asset-svg-icon" src="${asset('machine.svg')}" style="width:36px;height:36px;object-fit:contain;" alt="${u.name}" />`
          : u.id === 'grinder'
          ? `<img class="asset-svg-icon" src="${asset('grinder.svg')}" style="width:36px;height:36px;object-fit:contain;" alt="${u.name}" />`
          : u.icon;

      card.innerHTML = `
        <div class="upgrade-info">
          <div class="upgrade-icon">${iconHtml}</div>
          <div class="upgrade-details">
            <h4>${u.name} <span style="font-size:12px; font-weight:normal; color:var(--gold-400)">Lv ${curLevel}/${u.maxLevel}</span></h4>
            <p>${u.desc}</p>
            <div class="upgrade-level-dots">${dotsHtml}</div>
          </div>
        </div>
        <div class="upgrade-action">
          <button class="primary" data-testid="btn-buy-${u.id}" ${!canAfford ? 'disabled' : ''}>
            ${isMax ? 'MAX' : `Upgrade $${cost}`}
          </button>
        </div>
      `;

      const buyBtn = card.querySelector(`[data-testid="btn-buy-${u.id}"]`) as HTMLButtonElement;
      if (buyBtn && !isMax) {
        buyBtn.onclick = () => {
          const res = this.sim.dispatch({ type: 'buyUpgrade', id: u.id });
          this.bus.emit('ui:click', {});
          if (!res.ok && res.reason) {
            this.bus.emit('action:fail', { action: 'buyUpgrade', reason: res.reason });
          } else {
            this.lastUpgradesHash = '';
            this.renderUpgrades();
          }
        };
      }

      this.upgradesTabEl.appendChild(card);
    }
  }

  private renderMenu(): void {
    const state = this.sim.state;
    const drinksList = Object.values(DRINKS);

    const hash =
      drinksList
        .map((d) => {
          const unlocked = state.unlockedDrinks.includes(d.id);
          const price = state.prices[d.id] ?? d.basePrice;
          return `${d.id}:${unlocked}:${price}`;
        })
        .join('|') + `|m:${state.money}`;

    if (hash === this.lastUnlockedHash) return;
    this.lastUnlockedHash = hash;

    this.menuTabEl.innerHTML = '';

    for (const d of drinksList) {
      const isUnlocked = state.unlockedDrinks.includes(d.id);
      const curPrice = state.prices[d.id] ?? d.basePrice;
      const minPrice = d.basePrice * PRICE_MIN_MULT;
      const maxPrice = d.basePrice * PRICE_MAX_MULT;
      const canUnlock = state.money >= d.unlockCost;

      const card = document.createElement('div');
      card.className = 'menu-item-card';

      if (!isUnlocked) {
        card.innerHTML = `
          <div class="menu-item-info">
            <div class="menu-item-icon" style="opacity: 0.65; filter: grayscale(70%); display:flex; align-items:center; justify-content:center;">
              <img class="asset-svg-icon" src="${asset(`${d.id}.svg`)}" style="width:36px;height:36px;object-fit:contain;" alt="${d.name}" />
            </div>
            <div class="menu-item-details">
              <h4>${d.name} <span style="font-size:12px; color:var(--text-secondary);">(Locked)</span></h4>
              <p style="font-size:12px; color:var(--cream-400)">Base Prep: ${d.prepTime}s • Ingr Cost: $${d.ingredientCost.toFixed(2)}</p>
            </div>
          </div>
          <div>
            <button class="primary" id="btn-unlock-${d.id}" ${!canUnlock ? 'disabled' : ''}>
              Unlock $${d.unlockCost}
            </button>
          </div>
        `;

        const unlockBtn = card.querySelector(`#btn-unlock-${d.id}`) as HTMLButtonElement;
        unlockBtn.onclick = () => {
          const res = this.sim.dispatch({ type: 'unlockDrink', drink: d.id });
          this.bus.emit('ui:click', {});
          if (!res.ok && res.reason) {
            this.bus.emit('action:fail', { action: 'unlockDrink', reason: res.reason });
          } else {
            this.lastUnlockedHash = '';
            this.renderMenu();
          }
        };
      } else {
        card.innerHTML = `
          <div class="menu-item-info">
            <div class="menu-item-icon" style="display:flex; align-items:center; justify-content:center;">
              <img class="asset-svg-icon" src="${asset(`${d.id}.svg`)}" style="width:36px;height:36px;object-fit:contain;" alt="${d.name}" />
            </div>
            <div class="menu-item-details">
              <h4>${d.name}</h4>
              <p style="font-size:12px; color:var(--cream-400)">Base: $${d.basePrice.toFixed(2)} • Ingr Cost: $${d.ingredientCost.toFixed(2)} • Margin: <span style="color:var(--success-400)">+$${(curPrice - d.ingredientCost).toFixed(2)}</span></p>
            </div>
          </div>
          <div class="menu-item-price-control">
            <label style="font-size:12px; color:var(--cream-400)">Price:</label>
            <input type="range" class="price-slider" min="${minPrice}" max="${maxPrice}" step="0.25" value="${curPrice}">
            <div class="price-slider-label">$${curPrice.toFixed(2)}</div>
          </div>
        `;

        const slider = card.querySelector('.price-slider') as HTMLInputElement;
        const priceLabel = card.querySelector('.price-slider-label') as HTMLElement;

        slider.addEventListener('input', () => {
          const newPrice = parseFloat(slider.value);
          priceLabel.textContent = `$${newPrice.toFixed(2)}`;
          this.sim.dispatch({ type: 'setPrice', drink: d.id, price: newPrice });
        });
      }

      this.menuTabEl.appendChild(card);
    }
  }

  private renderStats(): void {
    const state = this.sim.state;
    const stats = state.stats;

    const hash = `${stats.totalServed}|${stats.totalRevenue}|${stats.totalTips}|${stats.totalLost}|${stats.maxCombo}|${state.achievements.length}`;
    if (hash === this.lastStatsHash) return;
    this.lastStatsHash = hash;

    this.statsTabEl.innerHTML = `
      <div class="stats-grid">
        <div class="stat-box">
          <div class="stat-label">Total Served</div>
          <div class="stat-val">${stats.totalServed}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Total Revenue</div>
          <div class="stat-val">$${stats.totalRevenue.toFixed(2)}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Total Tips</div>
          <div class="stat-val">$${stats.totalTips.toFixed(2)}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Lost Customers</div>
          <div class="stat-val">${stats.totalLost}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Max Combo</div>
          <div class="stat-val">x${stats.maxCombo}</div>
        </div>
      </div>

      <h3 style="font-size:14px; color:var(--gold-400); margin-bottom:10px;">🏆 Lifetime Achievements</h3>
      <div class="achievements-list">
        ${ACHIEVEMENTS.map((ach) => {
          const unlocked = state.achievements.includes(ach.id);
          return `
            <div class="achievement-card ${unlocked ? 'unlocked' : ''}">
              <div class="achievement-icon">${unlocked ? '🏆' : '🔒'}</div>
              <div class="achievement-info">
                <div style="font-weight:700; font-size:13px; color:${unlocked ? 'var(--gold-400)' : 'var(--text-secondary)'}">
                  ${ach.name} ${unlocked ? '✓' : ''}
                </div>
                <div style="font-size:12px; color:var(--cream-400)">${ach.desc}</div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  public destroy(): void {
    this.backdrop.remove();
  }
}
