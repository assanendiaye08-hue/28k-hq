/**
 * Resources Module
 *
 * Detects messages in resource channels (tech-resources, business-resources,
 * growth-resources), reacts with link emoji, creates discussion threads,
 * and awards XP with a 4-hour cooldown.
 *
 * No slash commands -- purely reactive to messageCreate events.
 * AI tagging runs asynchronously to update thread names with extracted topics.
 */

import type { Module, ModuleContext } from '../../shared/types.js';
import type { ExtendedPrismaClient } from '../../db/client.js';
import { handleResourcePost } from './handler.js';

const resourcesModule: Module = {
  name: 'resources',

  register(ctx: ModuleContext): void {
    const db = ctx.db as ExtendedPrismaClient;

    ctx.client.on('messageCreate', async (message) => {
      try {
        await handleResourcePost(message, db, ctx.events);
      } catch (error) {
        ctx.logger.error('[resources] Error handling message:', error);
      }
    });

    ctx.logger.info('[resources] Module registered');
  },
};

export default resourcesModule;
