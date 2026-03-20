/**
 * Auto-Feed Constants
 *
 * Configuration, interfaces, and scheduling constants for the
 * auto-content feed pipeline. Controls posting frequency, quality
 * thresholds, and reaction emojis for member feedback.
 */

/** Channel name for auto-feed posts (created under RESOURCES category by Plan 01). */
export const FEED_CHANNEL_NAME = 'auto-feed';

/** Maximum items to post per fetch cycle (across 4 daily cycles = up to 4 items/day). */
export const MAX_POSTS_PER_CYCLE = 4;

/** Minimum AI relevance score (0-100) required for posting. */
export const MIN_RELEVANCE_SCORE = 70;

/** Timeout in milliseconds for each feed source fetch. */
export const FETCH_TIMEOUT_MS = 10_000;

/** User-Agent string for Reddit API requests. */
export const REDDIT_USER_AGENT = 'DiscordHustlerBot/1.0';

/** Upvote reaction emoji for member feedback. */
export const UPVOTE_EMOJI = '\u{1F44D}';

/** Downvote reaction emoji for member feedback. */
export const DOWNVOTE_EMOJI = '\u{1F44E}';

/** A content item fetched from an external source before AI filtering. */
export interface FeedItem {
  title: string;
  link: string;
  source: 'rss' | 'youtube' | 'reddit';
  sourceName: string;
  content: string;
  publishedAt: Date;
  author?: string;
}

/** Result of AI content classification for a feed item. */
export interface FilterResult {
  keep: boolean;
  relevanceScore: number;
  category: string;
  reason: string;
}

/**
 * Cron schedules for feed fetch cycles.
 * Runs at 8am, 12pm, 4pm, 8pm UTC -- each cycle posts the top 1 item,
 * so across 4 cycles the bot posts 2-4 items/day (some cycles may find nothing).
 */
export const FEED_CRON_SCHEDULES = [
  '0 8 * * *',
  '0 12 * * *',
  '0 16 * * *',
  '0 20 * * *',
];
