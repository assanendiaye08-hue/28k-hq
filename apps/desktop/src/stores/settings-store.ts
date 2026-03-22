import { create } from 'zustand';
import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart';
import { loadSettings, saveSettings, type AppSettings } from '../lib/settings-persistence';
import { checkForUpdate, downloadAndInstallUpdate } from '../lib/updater';

interface SettingsState {
  autoUpdateEnabled: boolean;
  autoStartEnabled: boolean;
  updateAvailable: { version: string } | null;
  isCheckingUpdate: boolean;
  isLoaded: boolean;

  loadFromDisk: () => Promise<void>;
  setAutoUpdate: (enabled: boolean) => Promise<void>;
  setAutoStart: (enabled: boolean) => Promise<void>;
  checkUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  autoUpdateEnabled: false,
  autoStartEnabled: false,
  updateAvailable: null,
  isCheckingUpdate: false,
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
      autoUpdateEnabled: saved.autoUpdateEnabled,
      autoStartEnabled: osAutoStart,
      isLoaded: true,
    });
  },

  setAutoUpdate: async (enabled: boolean) => {
    set({ autoUpdateEnabled: enabled });
    const state = get();
    const settings: AppSettings = {
      autoUpdateEnabled: enabled,
      autoStartEnabled: state.autoStartEnabled,
    };
    await saveSettings(settings);
    if (enabled) {
      const result = await checkForUpdate();
      if (result.available && result.version) {
        set({ updateAvailable: { version: result.version } });
      }
    }
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
    const state = get();
    const settings: AppSettings = {
      autoUpdateEnabled: state.autoUpdateEnabled,
      autoStartEnabled: enabled,
    };
    await saveSettings(settings);
  },

  checkUpdate: async () => {
    set({ isCheckingUpdate: true });
    try {
      const result = await checkForUpdate();
      if (result.available && result.version) {
        set({ updateAvailable: { version: result.version } });
      } else {
        set({ updateAvailable: null });
      }
    } finally {
      set({ isCheckingUpdate: false });
    }
  },

  installUpdate: async () => {
    await downloadAndInstallUpdate();
  },
}));
