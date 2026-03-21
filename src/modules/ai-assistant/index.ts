/**
 * AI Assistant Module
 *
 * Personal AI assistant "Jarvis" -- an operator that knows
 * each member's goals, streak, interests, and recent activity.
 *
 * Features:
 * - DM conversations with context-aware AI responses
 * - Natural language timer starts via DM ("start a 45 min focus session on coding")
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
  buildAccountabilityCommand,
  handleAccountability,
  splitMessage,
} from './commands.js';
import { handleChat } from './chat.js';
import { isTimerRequest, parseTimerRequest } from '../timer/natural-language.js';
import { getActiveTimer } from '../timer/engine.js';
import { startTimerForMember } from '../timer/index.js';
import { TIMER_DEFAULTS } from '../timer/constants.js';

const aiAssistantModule: Module = {
  name: 'ai-assistant',

  register(ctx: ModuleContext): void {
    const db = ctx.db as ExtendedPrismaClient;
    const { client, logger } = ctx;

    // 1. Register slash commands
    ctx.commands.register('ask', buildAskCommand(), handleAsk);
    ctx.commands.register('wipe-history', buildWipeHistoryCommand(), handleWipeHistory);
    ctx.commands.register('accountability', buildAccountabilityCommand(), handleAccountability);

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

        // Check for timer intent before regular chat processing
        if (isTimerRequest(message.content)) {
          // Already has an active timer -- tell them
          if (getActiveTimer(account.memberId)) {
            await message.reply(
              "You already have a timer running. Say 'stop timer' or use /timer stop first.",
            );
            return;
          }

          const parsed = await parseTimerRequest(db, account.memberId, message.content);
          if (parsed.isTimerRequest) {
            const timer = await startTimerForMember(
              client,
              db,
              ctx.events,
              account.memberId,
              message.author.id,
              {
                mode: parsed.mode ?? 'pomodoro',
                workDuration: parsed.workMinutes ?? TIMER_DEFAULTS.defaultWorkMinutes,
                breakDuration: parsed.breakMinutes ?? TIMER_DEFAULTS.defaultBreakMinutes,
                focus: parsed.focus,
                goalId: null,
              },
            );

            if (!timer) {
              await message.reply(
                'Could not start the timer. Please enable DMs from this server and try again.',
              );
            }
            // Timer started successfully -- DM with embed+buttons already sent by startTimerForMember
            return;
          }
          // AI says it's not actually a timer request -- fall through to regular chat
        }

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
