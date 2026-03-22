/**
 * AI Assistant Module
 *
 * Personal AI assistant "Jarvis" -- an operator that knows
 * each member's goals, streak, interests, and recent activity.
 *
 * Architecture:
 * - DM messages are processed via LLM tool calling (handleChatWithTools)
 * - When the LLM detects an actionable intent, it invokes a tool
 * - Tool calls produce a confirmation prompt before executing DB mutations
 * - Regular conversation flows through unchanged
 * - /ask slash command uses handleChat (no tools, plain conversation)
 * - Per-member processing lock prevents race conditions
 * - Daily 50-message cap to control API costs
 */

import type { Module, ModuleContext } from '../../shared/types.js';
import type { ExtendedPrismaClient } from '@28k/db';
import {
  buildAskCommand,
  handleAsk,
  buildWipeHistoryCommand,
  handleWipeHistory,
  buildAccountabilityCommand,
  handleAccountability,
  splitMessage,
} from './commands.js';
import { handleChatWithTools } from './chat.js';
import { activeSetupUsers, activeCoachingUsers, runCoachingOnboarding } from '../onboarding/setup-flow.js';
import {
  pendingActions,
  isConfirmation,
  isDenial,
  buildConfirmation,
  executePendingAction,
  PENDING_ACTION_TTL,
} from './intent-executor.js';
import { BrainstormManager } from './brainstorm.js';

const brainstormManager = new BrainstormManager();

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

        // DM-only after Phase 20 -- ignore server channel messages
        if (!message.channel.isDMBased()) return;

        // Skip if user is currently in the setup flow or coaching onboarding
        if (activeSetupUsers.has(message.author.id)) return;
        if (activeCoachingUsers.has(message.author.id)) return;

        // Resolve Discord ID to memberId
        const account = await db.discordAccount.findUnique({
          where: { discordId: message.author.id },
        });

        // Guide unregistered users to /setup
        if (!account) {
          await message.reply(
            "Hey! I don't recognize you yet. Run `/setup` in the server first to create your profile, then we can talk.",
          );
          return;
        }

        // First-time DM: trigger coaching onboarding if no MemberSchedule exists
        const schedule = await db.memberSchedule.findUnique({
          where: { memberId: account.memberId },
        });
        if (!schedule) {
          await runCoachingOnboarding(client, db, account.memberId, message.author.id, ctx.events);
          return;
        }

        // Check for active brainstorm session (before pending actions or LLM calls)
        if (brainstormManager.hasActiveSession(account.memberId)) {
          await message.channel.sendTyping();
          // Check if user wants to end
          if (/^(done|end|stop|exit|quit)\b/i.test(message.content.trim())) {
            brainstormManager.endSession(account.memberId);
            await message.reply('Brainstorm wrapped. Good session.');
            return;
          }
          const brainstormResponse = await brainstormManager.handleMessage(db, account.memberId, message.content);
          const chunks = splitMessage(brainstormResponse);
          for (const chunk of chunks) {
            await message.reply(chunk);
          }
          return;
        }

        // Check for pending confirmation FIRST (before any LLM call)
        const pending = pendingActions.get(account.memberId);
        if (pending) {
          // Check TTL -- expired pending actions are discarded
          if (Date.now() - pending.createdAt > PENDING_ACTION_TTL) {
            pendingActions.delete(account.memberId);
            // Fall through to normal processing
          } else if (isConfirmation(message.content)) {
            await executePendingAction(db, account.memberId, pending, message, client);
            pendingActions.delete(account.memberId);
            return;
          } else if (isDenial(message.content)) {
            pendingActions.delete(account.memberId);
            await message.reply('No worries, cancelled.');
            return;
          } else {
            // Neither yes nor no -- clear pending, process as new message
            pendingActions.delete(account.memberId);
          }
        }

        // Show typing indicator
        await message.channel.sendTyping();

        // Process via tool-calling chat handler
        const result = await handleChatWithTools(db, account.memberId, message.content);

        if (result.toolCall) {
          // Tool was called -- present confirmation
          if (result.toolCall.name === 'start_brainstorm') {
            const topic = result.toolCall.params.topic as string;
            const openingMessage = brainstormManager.startSession(account.memberId, topic);
            const response = result.response
              ? `${result.response}\n\n${openingMessage}`
              : openingMessage;
            await message.reply(response);
            return;
          }

          const confirmation = buildConfirmation(result.toolCall.name, result.toolCall.params);
          pendingActions.set(account.memberId, {
            tool: result.toolCall.name,
            params: result.toolCall.params,
            confirmMessage: confirmation,
            createdAt: Date.now(),
          });

          // Combine LLM's conversational response with confirmation prompt
          const response = result.response
            ? `${result.response}\n\n${confirmation}`
            : confirmation;
          await message.reply(response);
        } else {
          // Regular conversation -- no tool called
          const chunks = splitMessage(result.response);
          for (const chunk of chunks) {
            await message.reply(chunk);
          }
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
