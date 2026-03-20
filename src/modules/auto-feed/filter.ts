/**
 * AI Content Filter
 *
 * Classifies feed items using DeepSeek V3.2 via OpenRouter with
 * structured JSON output. Only items scoring 70+ on relevance get posted.
 *
 * Fail-safe: if all AI calls fail (OpenRouter down), returns empty array.
 * Never posts unfiltered content.
 *
 * Includes per-source feedback stats in classification prompts so the
 * AI can learn from member upvote/downvote reactions over time.
 */

import { OpenRouter } from '@openrouter/sdk';
import { config } from '../../core/config.js';
import type { ExtendedPrismaClient } from '../../db/client.js';
import {
  MIN_RELEVANCE_SCORE,
  MAX_POSTS_PER_CYCLE,
  type FeedItem,
  type FilterResult,
} from './constants.js';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) =>
      `${timestamp as string} [auto-feed-filter] ${level}: ${message as string}`),
  ),
  transports: [new winston.transports.Console()],
});

/** Lazy-initialized OpenRouter client. */
let openrouterClient: OpenRouter | null = null;

function getOpenRouterClient(): OpenRouter {
  if (!openrouterClient) {
    openrouterClient = new OpenRouter({
      apiKey: config.OPENROUTER_API_KEY,
    });
  }
  return openrouterClient;
}

/**
 * Build per-source feedback context for the AI prompt.
 * Queries aggregate upvote/downvote stats from past FeedPosts.
 */
async function getSourceFeedback(
  db: ExtendedPrismaClient,
  sourceName: string,
): Promise<string> {
  try {
    const posts = await db.feedPost.findMany({
      where: {
        source: { name: sourceName },
        upvotes: { gt: 0 },
      },
      select: { upvotes: true, downvotes: true },
    });

    if (posts.length === 0) return '';

    const totalUp = posts.reduce((sum, p) => sum + p.upvotes, 0);
    const totalDown = posts.reduce((sum, p) => sum + p.downvotes, 0);
    const total = totalUp + totalDown;

    if (total === 0) return '';

    const approvalRate = Math.round((totalUp / total) * 100);
    return `This source has a ${approvalRate}% approval rate from members (${totalUp} upvotes, ${totalDown} downvotes across ${posts.length} posts).`;
  } catch {
    return '';
  }
}

/**
 * Filter feed items through AI classification.
 *
 * Pipeline:
 * 1. Deduplicate against already-posted items (by link)
 * 2. Classify each remaining item via DeepSeek V3.2
 * 3. Keep only items with keep=true AND relevanceScore >= 70
 * 4. Sort by relevanceScore descending
 * 5. Return top MAX_POSTS_PER_CYCLE items
 *
 * @param items - Raw feed items from sources
 * @param db - Prisma client for deduplication and feedback stats
 * @returns Filtered items with their classification results
 */
export async function filterItems(
  items: FeedItem[],
  db: ExtendedPrismaClient,
): Promise<Array<FeedItem & { filter: FilterResult }>> {
  if (items.length === 0) return [];

  // Step 1: Deduplicate against already-posted items
  const newItems: FeedItem[] = [];
  for (const item of items) {
    const existing = await db.feedPost.findFirst({
      where: { link: item.link },
    });
    if (!existing) {
      newItems.push(item);
    }
  }

  if (newItems.length === 0) {
    logger.debug('All items already posted, nothing to filter');
    return [];
  }

  logger.debug(`Filtering ${newItems.length} new items (${items.length - newItems.length} duplicates skipped)`);

  // Step 2: Classify each item via AI (sequential to respect rate limits)
  const client = getOpenRouterClient();
  const classified: Array<FeedItem & { filter: FilterResult }> = [];
  let aiFailures = 0;

  for (const item of newItems) {
    try {
      // Get per-source feedback for prompt context
      const feedbackContext = await getSourceFeedback(db, item.sourceName);

      const completion = await client.chat.send({
        chatGenerationParams: {
          model: 'deepseek/deepseek-v3.2',
          messages: [
            {
              role: 'system' as const,
              content: `You are a content curator for a productivity Discord server. Members are diverse: FAANG engineers, small business owners, students, ecom operators, content creators, designers. Classify each content item. A "keep" item must be: ACTIONABLE (provides a concrete technique, tool, strategy, or resource), RELEVANT (useful to at least one member type), NOT garbage (no clickbait, no fluff, no obvious self-promotion). Return a JSON classification.${feedbackContext ? `\n\n${feedbackContext}` : ''}`,
            },
            {
              role: 'user' as const,
              content: `Classify this content:\nTitle: ${item.title}\nSource: ${item.sourceName}\nSummary: ${item.content.slice(0, 500)}`,
            },
          ],
          responseFormat: {
            type: 'json_schema' as const,
            jsonSchema: {
              name: 'content_filter',
              strict: true,
              schema: {
                type: 'object',
                properties: {
                  keep: { type: 'boolean' },
                  relevanceScore: { type: 'number' },
                  category: { type: 'string' },
                  reason: { type: 'string' },
                },
                required: ['keep', 'relevanceScore', 'category', 'reason'],
                additionalProperties: false,
              },
            },
          },
          stream: false,
        },
      });

      const content = completion.choices[0]?.message?.content;
      if (!content || typeof content !== 'string') {
        logger.warn(`Empty AI response for "${item.title}", skipping`);
        aiFailures++;
        continue;
      }

      const filter = JSON.parse(content) as FilterResult;

      // Step 3: Only keep items that pass the quality threshold
      if (filter.keep && filter.relevanceScore >= MIN_RELEVANCE_SCORE) {
        classified.push({ ...item, filter });
        logger.debug(`KEEP: "${item.title}" (score: ${filter.relevanceScore}, category: ${filter.category})`);
      } else {
        logger.debug(`SKIP: "${item.title}" (keep: ${filter.keep}, score: ${filter.relevanceScore}, reason: ${filter.reason})`);
      }
    } catch (error) {
      logger.error(`AI classification failed for "${item.title}": ${String(error)}`);
      aiFailures++;
    }
  }

  // Step 4: If ALL AI calls failed, return empty (fail-safe)
  if (aiFailures === newItems.length) {
    logger.warn('All AI classification calls failed -- posting nothing (fail-safe)');
    return [];
  }

  // Step 5: Sort by relevance and return top items
  classified.sort((a, b) => b.filter.relevanceScore - a.filter.relevanceScore);
  const result = classified.slice(0, MAX_POSTS_PER_CYCLE);

  logger.info(`Filter result: ${result.length} items kept out of ${newItems.length} new items`);
  return result;
}
