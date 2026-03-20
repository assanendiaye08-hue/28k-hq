/**
 * Auto-Feed Module
 *
 * Orchestrates the auto-content feed pipeline:
 * 1. Fetches from RSS, YouTube, and Reddit sources (4x daily)
 * 2. Filters through DeepSeek V3.2 AI for quality (70+ threshold)
 * 3. Posts curated items as rich embeds to #auto-feed
 * 4. Collects member feedback via reactions (daily at 3 AM UTC)
 *
 * Pipeline: fetch -> filter -> post. Each stage is isolated.
 * If fetch returns empty, filter is skipped. If filter returns empty,
 * post is skipped. No cascading failures.
 *
 * Auto-discovered by the module loader (no manual wiring needed).
 */

import cron from 'node-cron';
import type { Module, ModuleContext } from '../../shared/types.js';
import type { ExtendedPrismaClient } from '../../db/client.js';
import { FEED_CRON_SCHEDULES } from './constants.js';
import { fetchAllSources } from './sources.js';
import { filterItems } from './filter.js';
import { postFeedItems } from './poster.js';
import { collectFeedback } from './feedback.js';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) =>
      `${timestamp as string} [auto-feed] ${level}: ${message as string}`),
  ),
  transports: [new winston.transports.Console()],
});

/**
 * Run the full feed pipeline: fetch -> filter -> post.
 * Each stage is isolated -- failures in one stage do not cascade.
 */
async function runFeedPipeline(
  db: ExtendedPrismaClient,
  client: import('discord.js').Client,
  guildId: string,
): Promise<void> {
  logger.info('Starting feed pipeline cycle');

  // Stage 1: Fetch from all sources
  const items = await fetchAllSources(db);
  if (items.length === 0) {
    logger.info('No items fetched, skipping filter and post stages');
    return;
  }

  // Stage 2: AI filter
  const filtered = await filterItems(items, db);
  if (filtered.length === 0) {
    logger.info('No items passed AI filter, skipping post stage');
    return;
  }

  // Stage 3: Post to Discord
  const posted = await postFeedItems(client, db, filtered, guildId);
  logger.info(`Feed pipeline complete: ${posted} items posted`);
}

const autoFeedModule: Module = {
  name: 'auto-feed',

  async register(ctx: ModuleContext): Promise<void> {
    const db = ctx.db as ExtendedPrismaClient;
    const { client } = ctx;

    client.once('ready', () => {
      const guildId = client.guilds.cache.first()?.id;
      if (!guildId) {
        logger.warn('No guild found, auto-feed cron jobs not registered');
        return;
      }

      // Register feed pipeline cron jobs (4x daily: 8am, 12pm, 4pm, 8pm UTC)
      for (const cronExpr of FEED_CRON_SCHEDULES) {
        cron.schedule(cronExpr, async () => {
          try {
            await runFeedPipeline(db, client, guildId);
          } catch (error) {
            logger.error(`Feed pipeline failed: ${String(error)}`);
          }
        }, {
          name: `auto-feed-${cronExpr.replace(/\s+/g, '-')}`,
        });
      }

      // Register daily feedback collection at 3 AM UTC
      cron.schedule('0 3 * * *', async () => {
        try {
          await collectFeedback(db, client, guildId);
        } catch (error) {
          logger.error(`Feedback collection failed: ${String(error)}`);
        }
      }, {
        name: 'auto-feed-feedback',
      });

      logger.info(`Auto-feed module loaded: ${FEED_CRON_SCHEDULES.length + 1} cron schedules registered`);
    });

    logger.info('Auto-feed module registered');
  },
};

export default autoFeedModule;
