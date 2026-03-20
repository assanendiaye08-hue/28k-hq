/**
 * Leaderboard Module Constants
 *
 * Configuration for leaderboard refresh, display, and channel management.
 */

/** Cron schedule for automatic leaderboard refresh (every 15 minutes). */
export const REFRESH_CRON = '*/15 * * * *';

/** Number of entries shown on each leaderboard. */
export const TOP_N = 10;

/** Name of the leaderboard channel (auto-created if missing). */
export const LEADERBOARD_CHANNEL_NAME = 'leaderboard';

/** Category under which the leaderboard channel is placed. */
export const LEADERBOARD_CATEGORY_NAME = 'The Hub';

/** BotConfig keys for storing persistent leaderboard message IDs. */
export const BOT_CONFIG_KEYS = {
  xpMessageId: 'leaderboard_xp_msg_id',
  voiceMessageId: 'leaderboard_voice_msg_id',
  streakMessageId: 'leaderboard_streak_msg_id',
} as const;

/** Minimum interval (ms) between event-driven leaderboard refreshes. */
export const MIN_REFRESH_INTERVAL_MS = 2 * 60 * 1000;
