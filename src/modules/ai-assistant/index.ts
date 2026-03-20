/**
 * AI Assistant Module
 *
 * Personal AI assistant "Ace" -- a Jarvis-inspired operator that knows
 * each member's goals, streak, interests, and recent activity.
 *
 * Features:
 * - DM conversations with context-aware AI responses
 * - /ask command for chatting from any channel (ephemeral)
 * - /wipe-history to export and clear conversation data
 * - Per-member processing lock prevents race conditions
 * - Daily 50-message cap to control API costs
 * - DeepSeek V3.2 primary, Qwen 3.5 Plus fallback
 */

import type { Module, ModuleContext } from '../../shared/types.js';
import type { ExtendedPrismaClient } from '../../db/client.js';
import {
  buildAskCommand,
  handleAsk,
  buildWipeHistoryCommand,
  handleWipeHistory,
  splitMessage,
} from './commands.js';
import { handleChat } from './chat.js';

const aiAssistantModule: Module = {
  name: 'ai-assistant',

  register(ctx: ModuleContext): void {
    const db = ctx.db as ExtendedPrismaClient;
    const { client, logger } = ctx;

    // 1. Register slash commands
    ctx.commands.register('ask', buildAskCommand(), handleAsk);
    ctx.commands.register('wipe-history', buildWipeHistoryCommand(), handleWipeHistory);

    // 2. Listen for DM messages
    client.on('messageCreate', async (message) => {
      try {
        // Skip bot messages
        if (message.author.bot) return;

        // Only handle DM-based messages
        if (!message.channel.isDMBased()) return;

        // Resolve Discord ID to memberId
        const account = await db.discordAccount.findUnique({
          where: { discordId: message.author.id },
        });

        // Ignore DMs from non-registered users
        if (!account) return;

        // Show typing indicator
        await message.channel.sendTyping();

        // Process via chat handler (includes per-member lock)
        const response = await handleChat(db, account.memberId, message.content);

        // Split response if over 2000 chars (Discord limit)
        const chunks = splitMessage(response);
        for (const chunk of chunks) {
          await message.reply(chunk);
        }
      } catch (error) {
        logger.error(`[ai-assistant] DM handler error: ${String(error)}`);
        try {
          await message.reply("Something went wrong on my end. Try again in a sec.");
        } catch {
          // Reply failed too -- nothing we can do
        }
      }
    });

    logger.info('[ai-assistant] Module registered');
  },
};

export default aiAssistantModule;
