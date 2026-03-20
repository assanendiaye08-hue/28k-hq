/**
 * Feedback Collector
 *
 * Periodically sweeps recent feed posts to update upvote/downvote
 * counts from Discord message reactions. These stats are used by the
 * AI filter to learn which sources and categories members prefer.
 *
 * Runs once daily at 3 AM UTC via cron schedule in index.ts.
 */

import type { Client } from 'discord.js';
import type { ExtendedPrismaClient } from '../../db/client.js';
import { FEED_CHANNEL_NAME, UPVOTE_EMOJI, DOWNVOTE_EMOJI } from './constants.js';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) =>
      `${timestamp as string} [auto-feed-feedback] ${level}: ${message as string}`),
  ),
  transports: [new winston.transports.Console()],
});

/**
 * Collect member feedback from Discord reactions on recent feed posts.
 *
 * For each FeedPost from the last 7 days with a messageId:
 * 1. Fetch the Discord message from #auto-feed
 * 2. Count upvote and downvote reactions (subtract 1 for bot's own reaction)
 * 3. Update the FeedPost record with vote counts
 *
 * @param db - Prisma client
 * @param client - Discord client
 * @param guildId - Discord guild ID
 */
export async function collectFeedback(
  db: ExtendedPrismaClient,
  client: Client,
  guildId: string,
): Promise<void> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Query recent feed posts that have a Discord message ID
  const recentPosts = await db.feedPost.findMany({
    where: {
      postedAt: { gte: sevenDaysAgo },
      messageId: { not: null },
    },
  });

  if (recentPosts.length === 0) {
    logger.debug('No recent feed posts to collect feedback for');
    return;
  }

  // Find the #auto-feed channel
  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    logger.warn(`Guild ${guildId} not found`);
    return;
  }

  const feedChannel = guild.channels.cache.find(
    (ch) => ch.name === FEED_CHANNEL_NAME && ch.type === 0,
  );

  if (!feedChannel || !('messages' in feedChannel)) {
    logger.warn(`Channel #${FEED_CHANNEL_NAME} not found`);
    return;
  }

  let updated = 0;

  for (const post of recentPosts) {
    if (!post.messageId) continue;

    try {
      const message = await feedChannel.messages.fetch(post.messageId);

      // Count reactions (subtract 1 from each for the bot's own seed reactions)
      const upvoteReaction = message.reactions.cache.find(
        (r) => r.emoji.name === UPVOTE_EMOJI,
      );
      const downvoteReaction = message.reactions.cache.find(
        (r) => r.emoji.name === DOWNVOTE_EMOJI,
      );

      const upvotes = Math.max(0, (upvoteReaction?.count ?? 0) - 1);
      const downvotes = Math.max(0, (downvoteReaction?.count ?? 0) - 1);

      // Update the FeedPost record with current vote counts
      await db.feedPost.update({
        where: { id: post.id },
        data: { upvotes, downvotes },
      });

      updated++;
    } catch {
      // Message may have been deleted -- skip silently
      logger.debug(`Could not fetch message ${post.messageId} for feedback (may be deleted)`);
    }
  }

  logger.info(`Feedback collected: ${updated}/${recentPosts.length} posts updated`);
}
