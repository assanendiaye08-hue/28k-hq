/**
 * Voice Tracker Constants
 *
 * Configuration for voice session tracking in co-working channels.
 */

/** Minimum session duration (minutes) to count for XP and DB persistence. */
export const MIN_SESSION_MINUTES = 5;

/** Sessions >= this many minutes get an encouraging embed in private space. */
export const NOTEWORTHY_THRESHOLD_MINUTES = 90;

/** Voice category name to track -- matches SERVER_CATEGORIES.voice.name. */
export const VOICE_CATEGORY_NAME = 'Lock In';

/** Interval (ms) for periodic flush of active session durations (safety net). */
export const PERIODIC_FLUSH_INTERVAL_MS = 10 * 60 * 1000;
