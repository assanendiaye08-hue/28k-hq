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

    if (remainingMs === null || !Number.isFinite(remainingMs) || remainingMs <= 0) {
      await tray.setTitle('');
      await tray.setTooltip('28K HQ');
      return;
    }

    const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60)
      .toString()
      .padStart(2, '0');
    const seconds = (totalSeconds % 60)
      .toString()
      .padStart(2, '0');
    const display = hours > 0
      ? ` ${hours}:${minutes}:${seconds}`
      : ` ${minutes}:${seconds}`;

    await tray.setTitle(display);
    await tray.setTooltip('28K HQ - ' + display);
  } catch {
    // Windows will silently no-op setTitle
  }
}
