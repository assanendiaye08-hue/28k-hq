/**
 * Feed Poster
 *
 * Builds rich Discord embeds for filtered feed items and posts them
 * to the #auto-feed channel. Seeds upvote/downvote reactions for
 * member feedback and creates FeedPost records for deduplication.
 */

import type { Client } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import type { ExtendedPrismaClient } from '@28k/db';
import {
  FEED_CHANNEL_NAME,
  UPVOTE_EMOJI,
  DOWNVOTE_EMOJI,
  type FeedItem,
  type FilterResult,
} from './constants.js';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) =>
      `${timestamp as string} [auto-feed-poster] ${level}: ${message as string}`),
  ),
  transports: [new winston.transports.Console()],
});

/** Embed colors by source type. */
const SOURCE_COLORS: Record<string, number> = {
  rss: 0x3b82f6,      // Blue
  youtube: 0xff0000,   // Red
  reddit: 0xff4500,    // Orange-red
};

/**
 * Post filtered feed items to the #auto-feed channel as rich embeds.
 *
 * For each item:
 * 1. Check deduplication (skip if link already posted)
 * 2. Build and send a rich embed
 * 3. Add upvote/downvote reactions for member feedback
 * 4. Create FeedPost record in database
 *
 * @param client - Discord client
 * @param db - Prisma client
 * @param items - Filtered items with classification results
 * @param guildId - Discord guild ID
 * @returns Number of successfully posted items
 */
export async function postFeedItems(
  client: Client,
  db: ExtendedPrismaClient,
  items: Array<FeedItem & { filter: FilterResult }>,
  guildId: string,
): Promise<number> {
  if (items.length === 0) return 0;

  // Find the #auto-feed channel under the RESOURCES category
  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    logger.warn(`Guild ${guildId} not found`);
    return 0;
  }

  // Find RESOURCES category, then the auto-feed channel within it
  const resourcesCategory = guild.channels.cache.find(
    (ch) => ch.name === 'RESOURCES' && ch.type === 4, // CategoryChannel
  );

  if (!resourcesCategory) {
    logger.warn(`RESOURCES category not found in guild ${guildId}, skipping feed posting`);
    return 0;
  }

  const feedChannel = guild.channels.cache.find(
    (ch) =>
      ch.name === FEED_CHANNEL_NAME &&
      ch.type === 0 && // TextChannel
      ch.parentId === resourcesCategory.id,
  );

  if (!feedChannel || !('send' in feedChannel)) {
    logger.warn(`Channel #${FEED_CHANNEL_NAME} not found in guild`);
    return 0;
  }

  let posted = 0;

  for (const item of items) {
    try {
      // Deduplication check
      const existing = await db.feedPost.findFirst({
        where: { link: item.link },
      });
      if (existing) {
        logger.debug(`Skipping duplicate: "${item.title}"`);
        continue;
      }

      // Build rich embed
      const embed = new EmbedBuilder()
        .setColor(SOURCE_COLORS[item.source] ?? 0x3b82f6)
        .setTitle(item.title.slice(0, 256))
        .setURL(item.link)
        .setDescription(
          `${item.content.slice(0, 200)}${item.content.length > 200 ? '...' : ''}\n\n` +
          `Category: ${item.filter.category} | Score: ${item.filter.relevanceScore}/100`,
        )
        .setFooter({
          text: `via ${item.sourceName}`,
        })
        .setTimestamp(item.publishedAt);

      if (item.author) {
        embed.setAuthor({ name: item.author });
      }

      // Send embed to channel
      const message = await feedChannel.send({ embeds: [embed] });

      // Seed upvote/downvote reactions
      await message.react(UPVOTE_EMOJI);
      await message.react(DOWNVOTE_EMOJI);

      // Find the FeedSource record to link the post
      const source = await db.feedSource.findFirst({
        where: { name: item.sourceName },
      });

      if (source) {
        // Create FeedPost record for deduplication and feedback tracking
        await db.feedPost.create({
          data: {
            sourceId: source.id,
            externalId: item.link,
            title: item.title,
            link: item.link,
            category: item.filter.category,
            relevanceScore: item.filter.relevanceScore,
            messageId: message.id,
          },
        });
      }

      posted++;
      logger.info(`Posted: "${item.title}" (score: ${item.filter.relevanceScore})`);
    } catch (error) {
      logger.error(`Failed to post "${item.title}": ${String(error)}`);
    }
  }

  logger.info(`Posted ${posted}/${items.length} feed items to #${FEED_CHANNEL_NAME}`);
  return posted;
}
