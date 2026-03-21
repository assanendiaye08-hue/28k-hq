/**
 * Feed Source Fetchers
 *
 * Fetches content from RSS, YouTube RSS, and Reddit JSON endpoints.
 * Each fetcher maps raw responses to the unified FeedItem interface.
 *
 * Error isolation: each source fetch is wrapped in try/catch and returns
 * an empty array on failure. One broken source never blocks others.
 */

import Parser from 'rss-parser';
import type { ExtendedPrismaClient } from '@28k/db';
import {
  FETCH_TIMEOUT_MS,
  REDDIT_USER_AGENT,
  type FeedItem,
} from './constants.js';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) =>
      `${timestamp as string} [auto-feed-sources] ${level}: ${message as string}`),
  ),
  transports: [new winston.transports.Console()],
});

/** Shared rss-parser instance with project-wide timeout and redirect limits. */
const parser = new Parser({
  timeout: FETCH_TIMEOUT_MS,
  maxRedirects: 3,
});

/**
 * Fetch items from a standard RSS/Atom feed.
 *
 * @param url - Full URL of the RSS feed
 * @param sourceName - Human-readable source name for FeedItem tagging
 * @returns Array of FeedItems (empty on failure)
 */
export async function fetchRSS(
  url: string,
  sourceName: string,
): Promise<FeedItem[]> {
  try {
    const feed = await parser.parseURL(url);
    return (feed.items ?? []).map((item) => ({
      title: item.title ?? 'Untitled',
      link: item.link ?? url,
      source: 'rss' as const,
      sourceName,
      content: item.contentSnippet ?? item.content ?? '',
      publishedAt: item.isoDate ? new Date(item.isoDate) : new Date(),
      author: item.creator ?? item.author ?? undefined,
    }));
  } catch (error) {
    logger.error(`RSS fetch failed for ${sourceName} (${url}): ${String(error)}`);
    return [];
  }
}

/**
 * Fetch items from a YouTube channel's RSS feed.
 * YouTube provides RSS at https://www.youtube.com/feeds/videos.xml?channel_id=X
 *
 * @param channelId - YouTube channel ID
 * @param sourceName - Human-readable source name
 * @returns Array of FeedItems with source: 'youtube' (empty on failure)
 */
export async function fetchYouTube(
  channelId: string,
  sourceName: string,
): Promise<FeedItem[]> {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  try {
    const feed = await parser.parseURL(url);
    return (feed.items ?? []).map((item) => ({
      title: item.title ?? 'Untitled',
      link: item.link ?? url,
      source: 'youtube' as const,
      sourceName,
      content: item.contentSnippet ?? item.content ?? '',
      publishedAt: item.isoDate ? new Date(item.isoDate) : new Date(),
      author: item.author ?? undefined,
    }));
  } catch (error) {
    logger.error(`YouTube fetch failed for ${sourceName} (${channelId}): ${String(error)}`);
    return [];
  }
}

/**
 * Fetch items from a Reddit subreddit using the public JSON endpoint.
 * Filters out stickied posts and posts with score < 10.
 *
 * @param subreddit - Subreddit name (without r/ prefix)
 * @param sort - Sort order: 'hot', 'new', 'top' (default: 'hot')
 * @param limit - Maximum posts to fetch (default: 10)
 * @returns Array of FeedItems with source: 'reddit' (empty on failure)
 */
export async function fetchReddit(
  subreddit: string,
  sort: string = 'hot',
  limit: number = 10,
): Promise<FeedItem[]> {
  const url = `https://www.reddit.com/r/${subreddit}/${sort}.json?limit=${limit}`;
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': REDDIT_USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Reddit API returned ${response.status}`);
    }

    const data = (await response.json()) as {
      data: {
        children: Array<{
          data: {
            title: string;
            url: string;
            selftext: string;
            score: number;
            created_utc: number;
            permalink: string;
            author: string;
            stickied: boolean;
          };
        }>;
      };
    };

    return data.data.children
      .filter((child) => !child.data.stickied && child.data.score >= 10)
      .map((child) => ({
        title: child.data.title,
        link: child.data.url.startsWith('http')
          ? child.data.url
          : `https://www.reddit.com${child.data.permalink}`,
        source: 'reddit' as const,
        sourceName: `r/${subreddit}`,
        content: child.data.selftext.slice(0, 500),
        publishedAt: new Date(child.data.created_utc * 1000),
        author: child.data.author,
      }));
  } catch (error) {
    logger.error(`Reddit fetch failed for r/${subreddit}: ${String(error)}`);
    return [];
  }
}

/**
 * Fetch items from all active FeedSource records in the database.
 * Dispatches to the appropriate fetcher based on FeedType.
 *
 * Adds a 500ms delay between Reddit fetches to respect rate limits.
 *
 * @param db - Prisma client with extensions
 * @returns Combined array of FeedItems from all active sources
 */
export async function fetchAllSources(
  db: ExtendedPrismaClient,
): Promise<FeedItem[]> {
  const sources = await db.feedSource.findMany({
    where: { active: true },
  });

  if (sources.length === 0) {
    logger.debug('No active feed sources configured');
    return [];
  }

  const allItems: FeedItem[] = [];
  let redditFetchCount = 0;

  for (const source of sources) {
    let items: FeedItem[] = [];

    switch (source.type) {
      case 'RSS':
        items = await fetchRSS(source.url, source.name);
        break;
      case 'YOUTUBE':
        items = await fetchYouTube(source.url, source.name);
        break;
      case 'REDDIT':
        // Add 500ms delay between Reddit fetches to respect rate limits
        if (redditFetchCount > 0) {
          await new Promise((r) => setTimeout(r, 500));
        }
        items = await fetchReddit(source.url, 'hot', 10);
        redditFetchCount++;
        break;
    }

    allItems.push(...items);
    logger.debug(`Fetched ${items.length} items from ${source.name} (${source.type})`);
  }

  logger.info(`Total items fetched from ${sources.length} sources: ${allItems.length}`);
  return allItems;
}
