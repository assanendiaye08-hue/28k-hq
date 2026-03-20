/**
 * Leaderboard Module
 *
 * Provides three-dimensional rankings (XP, voice hours, streaks)
 * via a #leaderboard channel with auto-updating silent embeds and
 * a /leaderboard command for on-demand checks.
 *
 * Refresh cycle:
 * - Cron: every 15 minutes (REFRESH_CRON)
 * - Event-driven: on xpAwarded / voiceSessionEnded (debounced to max once per 2 min)
 *
 * On bot ready: initializes #leaderboard channel and persistent messages.
 */

import cron from 'node-cron';
import type { Module, ModuleContext } from '../../shared/types.js';
import type { ExtendedPrismaClient } from '../../db/client.js';
import { REFRESH_CRON, MIN_REFRESH_INTERVAL_MS } from './constants.js';
import { initLeaderboardChannel, refreshLeaderboardMessages } from './channel-sync.js';
import { buildLeaderboardCommand, handleLeaderboard } from './commands.js';

const leaderboardModule: Module = {
  name: 'leaderboard',

  register(ctx: ModuleContext): void {
    const db = ctx.db as ExtendedPrismaClient;
    const { client, events, logger } = ctx;

    // 1. Register /leaderboard command
    ctx.commands.register('leaderboard', buildLeaderboardCommand(), handleLeaderboard);

    // 2. On ready: init channel and persistent messages
    client.once('ready', async () => {
      try {
        const channel = await initLeaderboardChannel(client, db);
        if (channel) {
          logger.info(`[leaderboard] Channel #${channel.name} initialized`);
          // Do an initial refresh with real data
          await refreshLeaderboardMessages(client, db);
        } else {
          logger.warn('[leaderboard] No guild found -- skipping channel init');
        }
      } catch (error) {
        logger.error('[leaderboard] Error initializing channel:', error);
      }
    });

    // 3. Schedule cron job for periodic refresh
    cron.schedule(REFRESH_CRON, async () => {
      try {
        await refreshLeaderboardMessages(client, db);
        logger.debug('[leaderboard] Cron refresh completed');
      } catch (error) {
        logger.error('[leaderboard] Cron refresh failed:', error);
      }
    }, {
      name: 'leaderboard-refresh',
    });

    // 4. Event-driven refresh (debounced)
    let lastRefreshTime = 0;

    const debouncedRefresh = async () => {
      const now = Date.now();
      if (now - lastRefreshTime < MIN_REFRESH_INTERVAL_MS) return;
      lastRefreshTime = now;

      try {
        await refreshLeaderboardMessages(client, db);
        logger.debug('[leaderboard] Event-driven refresh completed');
      } catch (error) {
        logger.error('[leaderboard] Event-driven refresh failed:', error);
      }
    };

    events.on('xpAwarded', () => {
      void debouncedRefresh();
    });

    events.on('voiceSessionEnded', () => {
      void debouncedRefresh();
    });

    logger.info('[leaderboard] Module registered');
  },
};

export default leaderboardModule;
