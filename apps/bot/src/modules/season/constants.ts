/**
 * Season Module Constants
 *
 * Configuration for the Valorant-style seasonal system:
 * 2-month seasons, temporary champion roles, daily expiry checks.
 */

/** Season length in days (2 months -- based on Valorant Act length for small groups). */
export const SEASON_DURATION_DAYS = 60;

/** How many days the champion role lasts into the next season. */
export const CHAMPION_ROLE_DURATION_DAYS = 7;

/** Gold color for the champion role -- stands out above rank roles. */
export const CHAMPION_ROLE_COLOR = 0xffd700;

/** Prefix for champion role names. Format: "Season X Champion". */
export const CHAMPION_ROLE_PREFIX = 'Season';

/** Cron schedule for daily season expiry check (midnight UTC). */
export const SEASON_CHECK_CRON = '0 0 * * *';

/** Name of the hall-of-fame channel. */
export const HALL_OF_FAME_CHANNEL_NAME = 'hall-of-fame';

/** Category under which the hall-of-fame channel is placed. */
export const HALL_OF_FAME_CATEGORY_NAME = 'THE GRIND';
