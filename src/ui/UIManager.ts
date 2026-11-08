import type { EventBus } from '../core/events';
import type { GameEvents, ISim } from '../types';
import type { AppHooks, IRenderer } from '../appTypes';
import { KeyboardManager, type KeyboardDelegate } from './keyboard';
import { HudOverlay, type HudDelegate } from './hud';
import { ShopPanel } from './shop';
import { MenuManager, type MenuDelegate } from './menus';
import { SettingsModal } from './settings';
import { TutorialManager } from './tutorial';
import { PopupManager } from './popups';

export class UIManager implements KeyboardDelegate, HudDelegate, MenuDelegate {
  private scalableRoot: HTMLElement;
  private hud: HudOverlay;
  private shop: ShopPanel;
  private menus: MenuManager;
  private settings: SettingsModal;
  private tutorial: TutorialManager;
  private popups: PopupManager;
  private keyboard: KeyboardManager;

  private fpsEl: HTMLElement | null = null;
  private fpsFrames = 0;
  private fpsAcc = 0;
  private currentFps = 60;

  constructor(
    private root: HTMLElement,
    private sim: ISim,
    private bus: EventBus<GameEvents>,
    private renderer: IRenderer,
    private hooks: AppHooks
  ) {
    // Ensure root styles
    this.root.style.pointerEvents = 'none';

    this.scalableRoot = document.createElement('div');
    this.scalableRoot.className = 'ui-scalable-wrapper';
    this.root.appendChild(this.scalableRoot);

    // Scalable submodules attached to scalableRoot
    this.settings = new SettingsModal(this.scalableRoot, this.hooks, this.bus);
    this.shop = new ShopPanel(this.scalableRoot, this.sim, this.bus);
    this.menus = new MenuManager(this.scalableRoot, this.sim, this.bus, this.hooks, this);
    this.hud = new HudOverlay(this.scalableRoot, this.sim, this.bus, this.hooks, this);
    this.tutorial = new TutorialManager(this.scalableRoot, this.sim, this.bus, this.renderer, this.root);

    // Unscaled popups attached directly to root
    this.popups = new PopupManager(this.root, this.sim, this.bus, this.renderer);

    this.keyboard = new KeyboardManager(this.sim, this.bus, this.hooks, this);

    this.initFpsCounter();
    this.initGlobalClickListener();
  }

  // --- Keyboard & Navigation Delegate ---

  public hasOpenModal(): boolean {
    return (
      this.settings.isOpen() ||
      this.menus.isHowToPlayModalOpen() ||
      this.shop.isOpen() ||
      this.menus.isPauseMenuOpen()
    );
  }

  public closeTopModal(): void {
    if (this.settings.isOpen()) {
      this.settings.close();
      return;
    }
    if (this.menus.isHowToPlayModalOpen()) {
      this.menus.closeHowToPlay();
      return;
    }
    if (this.shop.isOpen()) {
      this.shop.close();
      return;
    }
    if (this.menus.isPauseMenuOpen()) {
      this.menus.closePause();
      return;
    }
  }

  public togglePauseMenu(): void {
    this.menus.togglePause();
  }

  public toggleShop(): void {
    this.shop.toggle();
  }

  public openShop(): void {
    this.shop.open();
  }

  public openSettings(): void {
    this.settings.open();
  }

  // --- FPS Counter ---

  private initFpsCounter(): void {
    this.fpsEl = document.createElement('div');
    this.fpsEl.id = 'fps-counter';
    this.fpsEl.style.display = 'none';
    this.fpsEl.textContent = '60 FPS';
    this.root.appendChild(this.fpsEl);
  }

  private updateFps(dt: number): void {
    const s = this.hooks.getSettings();
    if (!s.showFps) {
      if (this.fpsEl && this.fpsEl.style.display !== 'none') {
        this.fpsEl.style.display = 'none';
      }
      return;
    }

    if (this.fpsEl && this.fpsEl.style.display === 'none') {
      this.fpsEl.style.display = 'block';
    }

    // Try reading from app perf stats first
    const appPerf = (window as any).__app?.perf;
    if (appPerf && typeof appPerf.fps === 'number') {
      if (this.fpsEl) {
        this.fpsEl.textContent = `${Math.round(appPerf.fps)} FPS`;
      }
      return;
    }

    // Fallback: compute own FPS
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      this.currentFps = Math.round(this.fpsFrames / this.fpsAcc);
      this.fpsAcc = 0;
      this.fpsFrames = 0;
      if (this.fpsEl) {
        this.fpsEl.textContent = `${this.currentFps} FPS`;
      }
    }
  }

  // --- Global click listener for audio / juice ---
  private initGlobalClickListener(): void {
    this.root.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'BUTTON' || target.closest('button'))) {
        this.bus.emit('ui:click', {});
      }
    });
  }

  // --- Frame update ---

  public update(dt: number): void {
    this.hud.update(dt);
    this.shop.update();
    this.menus.update();
    this.tutorial.update();
    this.popups.update(dt);
    this.updateFps(dt);
  }

  public destroy(): void {
    this.keyboard.destroy();
    this.hud.destroy();
    this.shop.destroy();
    this.menus.destroy();
    this.settings.destroy();
    this.tutorial.destroy();
    this.popups.destroy();
    if (this.fpsEl) this.fpsEl.remove();
    this.scalableRoot.remove();
  }
}
