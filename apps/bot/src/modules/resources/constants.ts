/**
 * Resources Module Constants
 *
 * Channel names, reaction emoji, and thread welcome message
 * for resource sharing detection and processing.
 */

/** Channel names that trigger resource post handling. */
export const RESOURCE_CHANNELS = [
  'tech-resources',
  'business-resources',
  'growth-resources',
] as const;

/** Emoji reaction for acknowledged resource posts (link emoji). */
export const RESOURCE_EMOJI = '\uD83D\uDD17';

/** Welcome message sent inside auto-created discussion threads. */
export const THREAD_WELCOME =
  'Thread created for discussion. Share your thoughts on this resource!';
