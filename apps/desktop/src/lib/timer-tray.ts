/**
 * Timer Tray Helper
 *
 * Updates the macOS menu bar tray icon title with a MM:SS countdown.
 * On Windows, setTitle is a no-op (silently caught).
 */

import { TrayIcon } from '@tauri-apps/api/tray';

let cachedTray: TrayIcon | null = null;

async function getTray(): Promise<TrayIcon | null> {
  if (cachedTray) return cachedTray;
  try {
    cachedTray = await TrayIcon.getById('main');
  } catch {
    cachedTray = null;
  }
  return cachedTray;
}

/**
 * Update the tray icon title with remaining time.
 * Pass null or <= 0 to clear the title.
 */
export async function updateTrayTitle(remainingMs: number | null): Promise<void> {
  try {
    const tray = await getTray();
    if (!tray) return;

    if (remainingMs === null || remainingMs <= 0) {
      await tray.setTitle(null);
      await tray.setTooltip('28K HQ');
      return;
    }

    const minutes = Math.floor(remainingMs / 60000);
    const seconds = Math.floor((remainingMs % 60000) / 1000)
      .toString()
      .padStart(2, '0');
    const display = `${minutes}:${seconds}`;

    await tray.setTitle(display);
    await tray.setTooltip('28K HQ - ' + display);
  } catch {
    // Windows will silently no-op setTitle
  }
}
