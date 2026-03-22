import { create } from 'zustand';
import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart';
import { loadSettings, saveSettings, type AppSettings } from '../lib/settings-persistence';

interface SettingsState {
  autoStartEnabled: boolean;
  isLoaded: boolean;

  loadFromDisk: () => Promise<void>;
  setAutoStart: (enabled: boolean) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  autoStartEnabled: false,
  isLoaded: false,

  loadFromDisk: async () => {
    const saved = await loadSettings();
    let osAutoStart = false;
    try {
      osAutoStart = await isEnabled();
    } catch {
      // Autostart query may fail on some platforms
    }
    set({
      autoStartEnabled: osAutoStart,
      isLoaded: true,
    });
  },

  setAutoStart: async (enabled: boolean) => {
    try {
      if (enabled) {
        await enable();
      } else {
        await disable();
      }
    } catch {
      // Autostart toggle may fail on some platforms
    }
    set({ autoStartEnabled: enabled });
    const settings: AppSettings = {
      autoStartEnabled: enabled,
    };
    await saveSettings(settings);
  },
}));
