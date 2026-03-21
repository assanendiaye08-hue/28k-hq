/**
 * Monthly Progress Recap module.
 *
 * Provides AI-generated monthly summary DMs with share-to-#wins via
 * trophy reaction. The recap covers check-ins, goals, timer sessions,
 * voice hours, reflections, XP, and streaks.
 *
 * Module responsibilities:
 * - Listen for messageReactionAdd to detect trophy reactions on recap DMs
 * - Map reaction to pendingRecaps entry and trigger shareToWins
 * - The monthly cron job lives in scheduler/index.ts (following established pattern)
 *
 * Auto-discovered by the module loader (default Module export).
 */

import type { Module, ModuleContext } from '../../shared/types.js';
import type { ExtendedPrismaClient } from '@28k/db';
import { pendingRecaps } from './generator.js';
import { shareToWins } from './share.js';
import { RECAP_EMOJI } from './constants.js';

const recapModule: Module = {
  name: 'recap',

  async register(ctx: ModuleContext): Promise<void> {
    const db = ctx.db as ExtendedPrismaClient;
    const { client } = ctx;

    // Listen for reactions on recap DMs to trigger share-to-#wins
    client.on('messageReactionAdd', async (reaction, user) => {
      // Ignore bot reactions
      if (user.bot) return;

      // Handle partial reactions (uncached messages)
      if (reaction.partial) {
        try {
          await reaction.fetch();
        } catch {
          return; // Could not fetch -- ignore
        }
      }

      // Handle partial users
      if (user.partial) {
        try {
          await user.fetch();
        } catch {
          return;
        }
      }

      // Check if this is the trophy emoji
      const emojiName = reaction.emoji.name;
      if (emojiName !== '\uD83C\uDFC6' && emojiName !== 'trophy') return;

      // Check if this message is a pending recap
      const messageId = reaction.message.id;
      const entry = pendingRecaps.get(messageId);
      if (!entry) return;

      // Share to #wins
      try {
        await shareToWins(client, db, entry.memberId, entry.stats, entry.jarvisQuote);
        // Remove from pending after sharing (one-time share)
        pendingRecaps.delete(messageId);
        ctx.logger.info(`[recap] Member ${entry.memberId} shared recap to #wins`);
      } catch (error) {
        ctx.logger.error(`[recap] Failed to share recap for ${entry.memberId}: ${String(error)}`);
      }
    });

    ctx.logger.info('[recap] Module registered (reaction listener active)');
  },
};

export default recapModule;
