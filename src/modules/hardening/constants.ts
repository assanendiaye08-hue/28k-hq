/**
 * Hardening module constants.
 */

/** Name of the admin-only bot log channel. */
export const BOT_LOG_CHANNEL = 'bot-log';

/** Name of the owner-only category for bot operations. */
export const BOT_OPS_CATEGORY = 'BOT OPS';

/**
 * Pending sessions older than this many hours during downtime
 * are auto-cancelled on recovery.
 */
export const RECOVERY_STALE_SESSION_HOURS = 24;
