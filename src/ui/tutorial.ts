import type { ISim } from '../types';
import type { IRenderer } from '../appTypes';
import type { EventBus } from '../core/events';
import type { GameEvents } from '../types';

export class TutorialManager {
  private container: HTMLElement;
  private card: HTMLElement;
  private headerEl: HTMLElement;
  private textEl: HTMLElement;
  private actionsEl: HTMLElement;
  private arrowEl: HTMLElement;
  private lastStep = -1;
  private lastActive = false;

  constructor(
    root: HTMLElement,
    private sim: ISim,
    private bus: EventBus<GameEvents>,
    private renderer: IRenderer,
    arrowRoot: HTMLElement = root
  ) {
    this.container = document.createElement('div');
    this.container.id = 'tutorial-overlay';
    this.container.style.display = 'none';

    this.card = document.createElement('div');
    this.card.className = 'tutorial-card';
    this.card.setAttribute('data-testid', 'tutorial-card');

    this.headerEl = document.createElement('div');
    this.headerEl.className = 'tutorial-card-header';
    this.headerEl.innerHTML = '<span>☕ TUTORIAL</span>';

    this.textEl = document.createElement('div');
    this.textEl.className = 'tutorial-card-text';

    this.actionsEl = document.createElement('div');
    this.actionsEl.className = 'tutorial-actions';

    this.card.appendChild(this.headerEl);
    this.card.appendChild(this.textEl);
    this.card.appendChild(this.actionsEl);
    this.container.appendChild(this.card);

    // Arrow element
    this.arrowEl = document.createElement('div');
    this.arrowEl.className = 'tutorial-station-arrow';
    this.arrowEl.style.display = 'none';
    this.arrowEl.innerHTML = `
      <svg viewBox="0 0 24 24">
        <path d="M12 21l-8-8h5V3h6v10h5z"/>
      </svg>
    `;

    root.appendChild(this.container);
    arrowRoot.appendChild(this.arrowEl);
  }

  public update(): void {
    const state = this.sim.state;
    const tut = state.tutorial;
    const shouldShow = tut && tut.active && !tut.done && state.phase === 'playing';

    if (!shouldShow) {
      if (this.lastActive) {
        this.container.style.display = 'none';
        this.arrowEl.style.display = 'none';
        this.lastActive = false;
      }
      return;
    }

    if (!this.lastActive) {
      this.container.style.display = 'flex';
      this.lastActive = true;
    }

    // Step change diff
    if (this.lastStep !== tut.step) {
      this.lastStep = tut.step;
      this.renderStep(tut.step);
    }

    // Update pulsing arrow position for steps 1 and 3
    if (tut.step === 1 || tut.step === 3) {
      const screenPos = this.renderer.stationScreenPos('machine:0');
      if (screenPos) {
        this.arrowEl.style.display = 'block';
        this.arrowEl.style.left = `${Math.round(screenPos.x)}px`;
        this.arrowEl.style.top = `${Math.round(screenPos.y)}px`;
      } else {
        this.arrowEl.style.display = 'none';
      }
    } else {
      this.arrowEl.style.display = 'none';
    }
  }

  private renderStep(step: number): void {
    this.actionsEl.innerHTML = '';

    const skipBtn = document.createElement('button');
    skipBtn.setAttribute('data-testid', 'btn-skip-tutorial');
    skipBtn.textContent = 'Skip';
    skipBtn.onclick = () => {
      this.sim.dispatch({ type: 'skipTutorial' });
      this.bus.emit('ui:click', {});
    };

    switch (step) {
      case 0:
        this.textEl.textContent =
          "Welcome to Espresso Tycoon 3D! Run your coffee shop, brew delicious drinks, and keep customers happy. Let's make some coffee!";
        {
          const nextBtn = document.createElement('button');
          nextBtn.className = 'primary';
          nextBtn.setAttribute('data-testid', 'btn-tutorial-next');
          nextBtn.textContent = 'Next ➔';
          nextBtn.onclick = () => {
            this.sim.dispatch({ type: 'tutorialAck' });
            this.bus.emit('ui:click', {});
          };
          this.actionsEl.appendChild(nextBtn);
        }
        break;

      case 1:
        this.textEl.textContent =
          'A customer ordered! Click the espresso machine (or press 1) to start brewing.';
        break;

      case 2:
        this.textEl.textContent =
          'Brewing… watch the progress bar on the machine or the ticket below.';
        break;

      case 3:
        this.textEl.textContent =
          'Drink is ready! Click the machine (or the ready ticket) to serve the customer.';
        break;

      case 4:
        this.textEl.textContent =
          'Nice work! Open the Shop (press B or tap Shop) and buy an upgrade to expand your café.';
        {
          const gotItBtn = document.createElement('button');
          gotItBtn.className = 'primary';
          gotItBtn.setAttribute('data-testid', 'btn-tutorial-next');
          gotItBtn.textContent = 'Got it! ✓';
          gotItBtn.onclick = () => {
            this.sim.dispatch({ type: 'tutorialAck' });
            this.bus.emit('ui:click', {});
          };
          this.actionsEl.appendChild(gotItBtn);
        }
        break;

      default:
        this.container.style.display = 'none';
        this.arrowEl.style.display = 'none';
        return;
    }

    this.actionsEl.appendChild(skipBtn);
  }

  public destroy(): void {
    this.container.remove();
    this.arrowEl.remove();
  }
}
