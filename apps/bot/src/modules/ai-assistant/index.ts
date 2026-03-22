/**
 * AI Assistant Module
 *
 * Personal AI assistant "Jarvis" -- an operator that knows
 * each member's goals, streak, interests, and recent activity.
 *
 * Features:
 * - DM conversations with context-aware AI responses
 * - Natural language reminder creation via DM ("remind me Tuesday at 3pm to call X")
 * - Goal decomposition via DM ("break down my yearly goal", "decompose Build a SaaS")
 * - Per-member processing lock prevents race conditions
 * - Daily 50-message cap to control API costs
 * - DeepSeek V3.2 primary, Qwen 3.5 Plus fallback
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
import { handleChat } from './chat.js';
import { activeSetupUsers } from '../onboarding/setup-flow.js';
import { isReminderRequest, parseReminder } from '../reminders/parser.js';
import { scheduleOneShot, scheduleRecurring } from '../reminders/scheduler.js';
import { DiscordReminderDelivery } from '../reminders/delivery.js';
import { isDecompositionRequest, extractDecompositionGoalName, runDecompositionFlow } from '../goals/decompose.js';
import { format } from 'date-fns';
import { TZDate } from '@date-fns/tz';

const aiAssistantModule: Module = {
  name: 'ai-assistant',

  register(ctx: ModuleContext): void {
    const db = ctx.db as ExtendedPrismaClient;
    const { client, logger } = ctx;

    // 1. Register slash commands
    ctx.commands.register('ask', buildAskCommand(), handleAsk);
    ctx.commands.register('wipe-history', buildWipeHistoryCommand(), handleWipeHistory);
    ctx.commands.register('accountability', buildAccountabilityCommand(), handleAccountability);

    // 2. Listen for DM and private channel messages
    client.on('messageCreate', async (message) => {
      try {
        // Skip bot messages
        if (message.author.bot) return;

        // Handle DMs directly; for server channels, only respond in private space channels
        if (!message.channel.isDMBased()) {
          const privateSpace = await db.privateSpace.findFirst({
            where: { channelId: message.channel.id, type: 'CHANNEL' },
            select: { memberId: true },
          });
          if (!privateSpace) return;

          // Verify author owns this private channel
          const authorCheck = await db.discordAccount.findUnique({
            where: { discordId: message.author.id },
          });
          if (!authorCheck || authorCheck.memberId !== privateSpace.memberId) return;
        }

        // Skip if user is currently in the setup flow
        if (activeSetupUsers.has(message.author.id)) return;

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

        // Check for reminder intent
        if (isReminderRequest(message.content)) {
          const schedule = await db.memberSchedule.findUnique({
            where: { memberId: account.memberId },
          });
          const timezone = schedule?.timezone || 'UTC';

          const parsed = parseReminder(message.content, timezone);
          if (parsed) {
            // Create reminder in DB
            const reminder = await db.reminder.create({
              data: {
                memberId: account.memberId,
                content: parsed.content,
                urgency: parsed.urgency,
                fireAt: parsed.fireAt,
                cronExpression: parsed.cronExpression,
                status: parsed.isRecurring ? 'ACTIVE' : 'PENDING',
              },
            });

            // Schedule it
            const delivery = new DiscordReminderDelivery(client, db);
            if (parsed.isRecurring) {
              await scheduleRecurring(reminder, delivery, db, client);
            } else {
              scheduleOneShot(reminder, delivery, db, client);
            }

            // Confirm to member
            if (parsed.fireAt) {
              const fireTime = new TZDate(parsed.fireAt, timezone);
              const timeDisplay = format(fireTime, "EEE, MMM d 'at' h:mm a");
              await message.reply(`Reminder set: "${parsed.content}" -- ${timeDisplay}`);
            } else {
              await message.reply(`Reminder set: "${parsed.content}"`);
            }

            // Timezone warning
            if (timezone === 'UTC' && !schedule?.timezone) {
              await message.reply('Tip: Set your timezone with /settings so reminders fire at your local time.');
            }
            return;
          }
          // Couldn't parse time -- fall through to regular chat
        }

        // Check for goal decomposition intent (after reminder, before regular chat)
        if (isDecompositionRequest(message.content)) {
          const goalNameHint = extractDecompositionGoalName(message.content);

          // Run decomposition flow -- it handles its own responses and errors
          try {
            await runDecompositionFlow(
              client,
              db,
              account.memberId,
              message.author.id,
              ctx.events,
              goalNameHint,
            );
          } catch (error) {
            logger.error(`[ai-assistant] Decomposition flow error: ${String(error)}`);
            await message.reply('Something went wrong with the decomposition. Try again or use /setgoal with the parent option.');
          }
          return; // Don't fall through to regular chat
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
