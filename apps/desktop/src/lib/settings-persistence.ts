/**
 * Settings Persistence
 *
 * Save/load app settings to @tauri-apps/plugin-store.
 * Uses settings.json for cross-restart persistence.
 */

import { load } from '@tauri-apps/plugin-store';

export interface AppSettings {
  autoUpdateEnabled: boolean;
  autoStartEnabled: boolean;
}

const DEFAULTS: AppSettings = {
  autoUpdateEnabled: false,
  autoStartEnabled: false,
};

export async function loadSettings(): Promise<AppSettings> {
  const store = await load('settings.json', { defaults: {} });
  const saved = await store.get<AppSettings>('settings');
  return saved ?? DEFAULTS;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const store = await load('settings.json', { defaults: {} });
  await store.set('settings', settings);
  await store.save();
}
