/**
 * Season Module
 *
 * Valorant-style seasonal system with:
 * - Auto-bootstrapping Season 1 on first bot startup
 * - 60-day season cycles with daily midnight UTC expiry check
 * - End-of-season flow: snapshots, champion role, hall-of-fame, new season
 * - /season command for viewing current or past season standings
 * - Champion role auto-cleanup after 7 days
 *
 * Must load AFTER leaderboard module (imports calculator functions).
 */

import cron from 'node-cron';
import type { Module, ModuleContext } from '../../shared/types.js';
import type { ExtendedPrismaClient } from '../../db/client.js';
import { SEASON_CHECK_CRON } from './constants.js';
import {
  getActiveSeason,
  bootstrapSeason,
  checkSeasonExpiry,
} from './manager.js';
import { initHallOfFame } from './hall-of-fame.js';
import { buildSeasonCommand, handleSeason } from './commands.js';

const seasonModule: Module = {
  name: 'season',

  register(ctx: ModuleContext): void {
    const db = ctx.db as ExtendedPrismaClient;
    const { client, events, logger } = ctx;

    // 1. Register /season command
    ctx.commands.register('season', buildSeasonCommand(), handleSeason);

    // 2. On ready: bootstrap season and init hall-of-fame
    client.once('ready', async () => {
      try {
        // Check for active season -- bootstrap if none exists
        const active = await getActiveSeason(db);
        if (!active) {
          await bootstrapSeason(db, logger);
        }

        // Ensure #hall-of-fame channel exists
        const channel = await initHallOfFame(client);
        if (channel) {
          logger.info(`[season] Hall of fame channel #${channel.name} initialized`);
        }
      } catch (error) {
        logger.error('[season] Error during ready initialization:', error);
      }
    });

    // 3. Schedule daily cron for season expiry check (midnight UTC)
    cron.schedule(SEASON_CHECK_CRON, async () => {
      try {
        await checkSeasonExpiry(db, client, events, logger);
        logger.debug('[season] Daily expiry check completed');
      } catch (error) {
        logger.error('[season] Daily expiry check failed:', error);
      }
    }, {
      name: 'season-expiry-check',
    });

    // 4. Listen for seasonEnded to trigger leaderboard awareness
    events.on('seasonEnded', (_seasonNumber: unknown) => {
      // The leaderboard module will pick up the new season on its next
      // refresh cycle (15-min cron or event-driven). No direct coupling needed.
      logger.info(`[season] Season ended event received. Leaderboard will update on next refresh.`);
    });

    logger.info('[season] Module registered');
  },
};

export default seasonModule;
