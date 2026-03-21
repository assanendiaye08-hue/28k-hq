/**
 * Timer Notifications
 *
 * Handles phase completion events: plays alarm, brings window
 * to foreground, and sends OS notification.
 */

import { getCurrentWindow } from '@tauri-apps/api/window';
import { playAlarm } from './timer-audio';
import {
  sendNotification,
  isPermissionGranted,
  requestPermission,
} from '@tauri-apps/plugin-notification';

/**
 * Bring the main window to foreground and request user attention.
 */
async function bringToForeground(): Promise<void> {
  try {
    const win = getCurrentWindow();
    await win.show();
    await win.unminimize();
    await win.setFocus();
    await win.requestUserAttention(2); // Critical attention type
  } catch {
    // Window API not available (e.g. during tests)
  }
}

/**
 * Send an OS notification if permission is granted.
 */
async function notify(title: string, body: string): Promise<void> {
  try {
    let permitted = await isPermissionGranted();
    if (!permitted) {
      permitted = (await requestPermission()) === 'granted';
    }
    if (permitted) {
      sendNotification({ title, body });
    }
  } catch {
    // Notification API not available
  }
}

/**
 * Called when a work or break phase completes.
 * Plays alarm, brings window to foreground, sends OS notification.
 */
export async function onPhaseComplete(
  completedPhase: 'working' | 'on_break',
  focus: string,
): Promise<void> {
  playAlarm();
  await bringToForeground();

  const title = completedPhase === 'working' ? 'Work Complete!' : 'Break Over!';
  const body =
    completedPhase === 'working'
      ? `Nice work on "${focus}". Time for a break.`
      : 'Ready to get back to work?';

  await notify(title, body);
}

/**
 * Called when all target sessions are complete.
 * Plays alarm, brings window to foreground, sends OS notification with XP.
 */
export async function onSessionComplete(
  focus: string,
  xpAwarded: number,
): Promise<void> {
  playAlarm();
  await bringToForeground();

  await notify(
    'Session Complete!',
    `"${focus}" -- ${xpAwarded} XP earned!`,
  );
}
