/**
 * Updater
 *
 * Check for updates and install via @tauri-apps/plugin-updater.
 */

import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export async function checkForUpdate(): Promise<{ available: boolean; version?: string }> {
  try {
    const update = await check();
    if (!update) return { available: false };
    return { available: true, version: update.version };
  } catch {
    return { available: false };
  }
}

export async function downloadAndInstallUpdate(): Promise<void> {
  const update = await check();
  if (!update) return;
  await update.downloadAndInstall();
  await relaunch();
}
