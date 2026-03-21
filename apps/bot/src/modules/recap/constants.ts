/**
 * Monthly Progress Recap -- Constants
 *
 * Configuration for the monthly recap module including cron schedule,
 * emoji trigger for sharing, and data thresholds.
 */

/** Unicode trophy emoji -- react to recap DM to share highlights to #wins. */
export const RECAP_EMOJI = '\uD83C\uDFC6';

/** Cron expression: 10:00 AM UTC on the 1st of each month. */
export const RECAP_CRON = '0 10 1 * *';

/**
 * Minimum number of check-ins in a month to warrant a detailed recap.
 * Below this threshold, the recap is brief encouragement rather than
 * a deep narrative with suggestions.
 */
export const MIN_DATA_THRESHOLD = 3;
