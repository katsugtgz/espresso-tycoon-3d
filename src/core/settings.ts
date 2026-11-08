import { SETTINGS_KEY } from '../config/balance';
import type { Settings } from '../types';

export const DEFAULT_SETTINGS: Settings = {
  master: 0.8, sfx: 0.8, music: 0.5, ambient: 0.4, musicOn: true,
  quality: 'high', colorblind: false, uiScale: 1, reducedMotion: false, showFps: false,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...(typeof parsed === 'object' && parsed ? parsed : {}) };
  } catch { return { ...DEFAULT_SETTINGS }; }
}

export function saveSettings(s: Settings): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* quota/private mode */ }
}
