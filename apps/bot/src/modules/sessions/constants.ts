/**
 * Lock-In Session Constants
 *
 * Configuration for member-initiated co-working sessions.
 */

/** Text channel name for public session announcements. */
export const SESSION_CHANNEL_NAME = 'sessions';

/** Opt-in role name for public session pings. */
export const LOCKIN_ROLE_NAME = 'LockInSessions';

/** Maximum active sessions per creator at a time. */
export const MAX_ACTIVE_SESSIONS_PER_MEMBER = 1;

/** Delay (ms) before deleting voice channel after session ends. */
export const SESSION_CLEANUP_DELAY_MS = 60 * 1000;

/** Prefix for temporary voice channel names. */
export const SESSION_CHANNEL_PREFIX = 'lockin';

/** Maximum session title length. */
export const MAX_SESSION_TITLE_LENGTH = 50;

/** DM participants this many minutes before scheduled start. */
export const SCHEDULED_SESSION_REMINDER_MINUTES = 5;

/** Reusable voice co-working promotion line for embeds and briefs. */
export const VOICE_PROMO_LINE = 'Working alongside others increases focus by 143%. No talking required -- just lock in.';
