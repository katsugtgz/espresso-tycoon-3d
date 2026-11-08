import type { AppHooks } from '../appTypes';
import type { EventBus } from '../core/events';
import type { GameEvents, Settings } from '../types';

export class SettingsModal {
  private backdrop: HTMLElement;
  private card: HTMLElement;
  private opened = false;

  constructor(
    root: HTMLElement,
    private hooks: AppHooks,
    private bus: EventBus<GameEvents>
  ) {
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'modal-backdrop';
    this.backdrop.style.display = 'none';

    this.card = document.createElement('div');
    this.card.className = 'modal-card';
    this.card.setAttribute('data-testid', 'settings-modal');

    this.backdrop.appendChild(this.card);
    root.appendChild(this.backdrop);

    // Close when clicking backdrop
    this.backdrop.addEventListener('click', (e) => {
      if (e.target === this.backdrop) {
        this.close();
      }
    });

    // Sync settings on initial load
    this.applyVisualSettings(this.hooks.getSettings());
  }

  public open(): void {
    this.opened = true;
    this.render();
    this.backdrop.style.display = 'flex';
    this.bus.emit('ui:open', { panel: 'settings' });
  }

  public close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.backdrop.style.display = 'none';
  }

  public isOpen(): boolean {
    return this.opened;
  }

  public applyVisualSettings(s: Settings): void {
    const root = document.getElementById('ui-root');
    if (!root) return;

    // UI scale
    root.style.setProperty('--ui-scale', String(s.uiScale ?? 1));

    // Colorblind class
    if (s.colorblind) {
      root.classList.add('colorblind-mode');
    } else {
      root.classList.remove('colorblind-mode');
    }

    // Reduced motion class
    if (s.reducedMotion) {
      root.classList.add('reduced-motion');
    } else {
      root.classList.remove('reduced-motion');
    }
  }

  private render(): void {
    const s = this.hooks.getSettings();
    this.card.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = `
      <h2>⚙️ Settings</h2>
      <button class="icon-btn" id="btn-close-settings" title="Close">✕</button>
    `;
    this.card.appendChild(header);

    header.querySelector('#btn-close-settings')?.addEventListener('click', () => {
      this.close();
      this.bus.emit('ui:click', {});
    });

    // Body
    const body = document.createElement('div');
    body.className = 'modal-body';

    // 1. Audio Section
    const audioGroup = document.createElement('div');
    audioGroup.className = 'settings-group';
    audioGroup.innerHTML = `<h3>Audio</h3>`;

    audioGroup.appendChild(
      this.createSliderRow('Master Volume', s.master, (v) => this.updateSetting({ master: v }))
    );
    audioGroup.appendChild(
      this.createSliderRow('SFX Volume', s.sfx, (v) => this.updateSetting({ sfx: v }))
    );
    audioGroup.appendChild(
      this.createSliderRow('Music Volume', s.music, (v) => this.updateSetting({ music: v }))
    );
    audioGroup.appendChild(
      this.createSliderRow('Ambient Volume', s.ambient, (v) => this.updateSetting({ ambient: v }))
    );
    audioGroup.appendChild(
      this.createToggleRow('Music Enabled', s.musicOn, (v) => this.updateSetting({ musicOn: v }))
    );

    // 2. Video & Accessibility Section
    const videoGroup = document.createElement('div');
    videoGroup.className = 'settings-group';
    videoGroup.innerHTML = `<h3>Display & Accessibility</h3>`;

    // Quality dropdown
    const qualRow = document.createElement('div');
    qualRow.className = 'settings-row';
    qualRow.innerHTML = `
      <label>Graphics Quality</label>
      <select id="select-quality">
        <option value="low" ${s.quality === 'low' ? 'selected' : ''}>Low (Fastest)</option>
        <option value="medium" ${s.quality === 'medium' ? 'selected' : ''}>Medium</option>
        <option value="high" ${s.quality === 'high' ? 'selected' : ''}>High (Best)</option>
      </select>
    `;
    const qualSelect = qualRow.querySelector('#select-quality') as HTMLSelectElement;
    qualSelect.addEventListener('change', () => {
      this.updateSetting({ quality: qualSelect.value as Settings['quality'] });
    });
    videoGroup.appendChild(qualRow);

    // Colorblind toggle
    videoGroup.appendChild(
      this.createToggleRow('Colorblind Mode (High Contrast & Shapes)', s.colorblind, (v) =>
        this.updateSetting({ colorblind: v })
      )
    );

    // UI Scale slider (0.8 .. 1.4)
    videoGroup.appendChild(
      this.createSliderRow(
        'UI Scale',
        s.uiScale,
        (v) => this.updateSetting({ uiScale: Math.round(v * 100) / 100 }),
        0.8,
        1.4,
        0.05
      )
    );

    // Reduced motion toggle
    videoGroup.appendChild(
      this.createToggleRow('Reduced Motion', s.reducedMotion, (v) =>
        this.updateSetting({ reducedMotion: v })
      )
    );

    // Show FPS toggle
    videoGroup.appendChild(
      this.createToggleRow('Show FPS Counter', s.showFps, (v) =>
        this.updateSetting({ showFps: v })
      )
    );

    // 3. Save Data Section
    const saveGroup = document.createElement('div');
    saveGroup.className = 'settings-group';
    saveGroup.innerHTML = `<h3>Save Data</h3>`;

    const saveRow = document.createElement('div');
    saveRow.className = 'settings-row';
    const hasSave = this.hooks.hasSave();
    saveRow.innerHTML = `
      <div>
        <label style="display:block;">Saved Game Progress</label>
        <span style="font-size:12px; color:var(--cream-400);">Delete saved cafe progress and start fresh</span>
      </div>
      <button class="danger" id="btn-reset-save" ${!hasSave ? 'disabled' : ''}>
        🗑 Reset Save
      </button>
    `;

    const resetBtn = saveRow.querySelector('#btn-reset-save') as HTMLButtonElement;
    let confirmPending = false;
    let resetTimer: number | null = null;

    const refreshSaveRow = () => {
      confirmPending = false;
      if (resetTimer) {
        clearTimeout(resetTimer);
        resetTimer = null;
      }
      resetBtn.textContent = '🗑 Reset Save';
      resetBtn.disabled = !this.hooks.hasSave();
    };

    resetBtn.addEventListener('click', () => {
      this.bus.emit('ui:click', {});
      if (!this.hooks.hasSave()) return;

      if (!confirmPending) {
        confirmPending = true;
        resetBtn.textContent = '⚠️ Click Again to Confirm Reset';
        resetTimer = window.setTimeout(() => {
          refreshSaveRow();
        }, 4000);
      } else {
        if (resetTimer) clearTimeout(resetTimer);
        this.hooks.resetSave();
        this.bus.emit('toast', { text: 'Save data reset', kind: 'info' });
        refreshSaveRow();
      }
    });

    saveGroup.appendChild(saveRow);

    body.appendChild(audioGroup);
    body.appendChild(videoGroup);
    body.appendChild(saveGroup);
    this.card.appendChild(body);

    // Footer
    const footer = document.createElement('div');
    footer.className = 'modal-footer';
    footer.innerHTML = `
      <button class="primary" id="btn-save-settings">Done</button>
    `;
    footer.querySelector('#btn-save-settings')?.addEventListener('click', () => {
      this.close();
      this.bus.emit('ui:click', {});
    });
    this.card.appendChild(footer);
  }

  private createSliderRow(
    label: string,
    val: number,
    onChange: (val: number) => void,
    min = 0,
    max = 1,
    step = 0.05
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'settings-row';

    const lbl = document.createElement('label');
    lbl.textContent = label;

    const wrapper = document.createElement('div');
    wrapper.className = 'settings-slider-wrapper';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(val);

    const valDisplay = document.createElement('span');
    valDisplay.className = 'settings-slider-val';
    valDisplay.textContent = `${Math.round(val * 100)}%`;

    slider.addEventListener('input', () => {
      const num = parseFloat(slider.value);
      valDisplay.textContent = `${Math.round(num * 100)}%`;
      onChange(num);
    });

    wrapper.appendChild(slider);
    wrapper.appendChild(valDisplay);
    row.appendChild(lbl);
    row.appendChild(wrapper);
    return row;
  }

  private createToggleRow(
    label: string,
    checked: boolean,
    onChange: (checked: boolean) => void
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'settings-row';

    const lbl = document.createElement('label');
    lbl.textContent = label;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = checked;
    checkbox.style.width = '20px';
    checkbox.style.height = '20px';
    checkbox.style.cursor = 'pointer';

    checkbox.addEventListener('change', () => {
      onChange(checkbox.checked);
      this.bus.emit('ui:click', {});
    });

    row.appendChild(lbl);
    row.appendChild(checkbox);
    return row;
  }

  private updateSetting(patch: Partial<Settings>): void {
    this.hooks.applySettings(patch);
    const updated = this.hooks.getSettings();
    this.applyVisualSettings(updated);
  }

  public destroy(): void {
    this.backdrop.remove();
  }
}
