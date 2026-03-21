/**
 * Timer Audio
 *
 * Preload and play alarm sounds via HTML5 Audio.
 * Handles missing sound file and autoplay restrictions gracefully.
 */

let alarmAudio: HTMLAudioElement | null = null;

/**
 * Preload the alarm sound. Call once on app init.
 * Plays at volume 0 to warm up the audio context.
 */
export function preloadAlarm(): void {
  try {
    alarmAudio = new Audio('/sounds/alarm-chime.mp3');
    alarmAudio.preload = 'auto';
    alarmAudio.volume = 0;
    alarmAudio.play().catch(() => {
      // Autoplay blocked or file missing -- that's fine
    });
  } catch {
    // Audio API not available
  }
}

/**
 * Play the alarm sound at full volume.
 */
export function playAlarm(): void {
  if (!alarmAudio) return;
  try {
    alarmAudio.volume = 1;
    alarmAudio.currentTime = 0;
    alarmAudio.play().catch(() => {
      // Autoplay blocked
    });
  } catch {
    // Audio API error
  }
}
