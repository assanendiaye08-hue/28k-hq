/**
 * Wins/Lessons Module
 *
 * Detects messages in #wins and #lessons channels, reacts with emoji,
 * and awards XP with a 2-hour per-type cooldown.
 *
 * No slash commands -- purely reactive to messageCreate events.
 * Bot reacts with muscle emoji (wins) or brain emoji (lessons).
 * No bot reply messages -- just the emoji reaction to keep it clean.
 */

import type { Module, ModuleContext } from '../../shared/types.js';
import type { ExtendedPrismaClient } from '../../db/client.js';
import { handleWinsLessonsMessage } from './handler.js';

const winsLessonsModule: Module = {
  name: 'wins-lessons',

  register(ctx: ModuleContext): void {
    const db = ctx.db as ExtendedPrismaClient;

    ctx.client.on('messageCreate', async (message) => {
      try {
        await handleWinsLessonsMessage(message, db, ctx.events, ctx.client);
      } catch (error) {
        ctx.logger.error('[wins-lessons] Error handling message:', error);
      }
    });

    ctx.logger.info('[wins-lessons] Module registered');
  },
};

export default winsLessonsModule;
