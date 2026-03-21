/**
 * Reminders Module
 *
 * Registers /remind and /reminders slash commands, handles button
 * interactions for acknowledge and skip-next, listens for reactions
 * on high-urgency reminder DMs, and recovers all reminders from DB
 * on bot restart.
 *
 * Key features:
 * - "Got it" button acknowledges high-urgency reminders (stops repeats)
 * - "Skip Next" button skips one occurrence of recurring reminders
 * - Emoji reaction also acknowledges high-urgency reminders
 * - Restart recovery re-schedules all pending one-shot and active recurring
 * - Hourly sweep catches far-future reminders as they enter setTimeout range
 */

import type { ButtonInteraction, Client } from 'discord.js';
import type { Module, ModuleContext } from '../../shared/types.js';
import type { ExtendedPrismaClient } from '@28k/db';
import {
  buildRemindCommand,
  handleRemind,
  buildRemindersCommand,
  handleReminders,
} from './commands.js';
import { BUTTON_IDS } from './constants.js';
import { DiscordReminderDelivery } from './delivery.js';
import {
  recoverReminders,
  startSweep,
  acknowledgeReminder,
  skipNextOccurrence,
} from './scheduler.js';

// ─── Reminders Module ───────────────────────────────────────────────────────────

const remindersModule: Module = {
  name: 'reminders',

  register(ctx: ModuleContext): void {
    const db = ctx.db as ExtendedPrismaClient;
    const { client, logger } = ctx;

    // 1. Register slash commands
    ctx.commands.register('remind', buildRemindCommand(), handleRemind);
    ctx.commands.register('reminders', buildRemindersCommand(), handleReminders);

    // 2. Create delivery instance
    const delivery = new DiscordReminderDelivery(client, db);

    // 3. Button interaction handler
    ctx.events.on('buttonInteraction', async (...args: unknown[]) => {
      const interaction = args[0] as ButtonInteraction;

      // Only handle reminder: prefixed buttons
      if (!interaction.customId.startsWith('reminder:')) return;

      try {
        await interaction.deferUpdate();
      } catch {
        return; // Interaction already expired
      }

      try {
        switch (interaction.customId) {
          case BUTTON_IDS.ACKNOWLEDGE:
            await handleAcknowledgeButton(interaction, db);
            break;
          case BUTTON_IDS.SKIP_NEXT:
            await handleSkipNextButton(interaction, db);
            break;
        }
      } catch (error) {
        logger.error(`[reminders] Button handler error for ${interaction.customId}:`, error);
        try {
          await interaction.followUp({
            content: 'Something went wrong. Try again.',
            ephemeral: true,
          });
        } catch {
          // Can't respond -- give up
        }
      }
    });

    // 4. Reaction listener for high-urgency acknowledgment
    client.on('messageReactionAdd', async (reaction, user) => {
      try {
        // Skip bot reactions
        if (user.bot) return;

        // Try to find a reminder with this message ID that hasn't been acknowledged
        const reminder = await db.reminder.findFirst({
          where: {
            dmMessageId: reaction.message.id,
            acknowledged: false,
            urgency: 'HIGH',
          },
        });

        if (!reminder) return;

        // Acknowledge the reminder
        await acknowledgeReminder(reminder.id, db);

        // Try to edit the message to note acknowledgment
        try {
          const message = reaction.message.partial
            ? await reaction.message.fetch()
            : reaction.message;

          await message.edit({
            content: 'Acknowledged via reaction.',
            components: [],
          });
        } catch {
          // Message edit failed -- non-critical
        }
      } catch (error) {
        logger.error('[reminders] Reaction handler error:', error);
      }
    });

    // 5. Restart recovery on client ready
    client.once('ready', async () => {
      try {
        const counts = await recoverReminders(db, client, delivery);
        startSweep(db, client, delivery);

        if (counts.oneShotCount > 0 || counts.recurringCount > 0) {
          logger.info(
            `[reminders] Recovered ${counts.oneShotCount} one-shot, ${counts.recurringCount} recurring reminders`,
          );
        }
      } catch (error) {
        logger.error('[reminders] Error during recovery:', error);
      }
    });

    logger.info('[reminders] Module registered');
  },
};

export default remindersModule;

// ─── Button Handlers ────────────────────────────────────────────────────────────

/**
 * Handle the "Got it" (acknowledge) button on high-urgency reminder DMs.
 * Clears pending repeat chain and updates DB.
 */
async function handleAcknowledgeButton(
  interaction: ButtonInteraction,
  db: ExtendedPrismaClient,
): Promise<void> {
  // Find the reminder by the message ID
  const reminder = await db.reminder.findFirst({
    where: {
      dmMessageId: interaction.message.id,
    },
  });

  if (!reminder) {
    await interaction.followUp({
      content: 'Reminder not found.',
      ephemeral: true,
    });
    return;
  }

  if (reminder.acknowledged) {
    await interaction.followUp({
      content: 'Already acknowledged.',
      ephemeral: true,
    });
    return;
  }

  // Acknowledge: clear repeats and update DB
  await acknowledgeReminder(reminder.id, db);

  // Disable the button on the original message
  try {
    await interaction.editReply({
      components: [],
    });
  } catch {
    // Message edit failed -- non-critical
  }

  await interaction.followUp({
    content: 'Acknowledged -- no more repeats.',
    ephemeral: true,
  });
}

/**
 * Handle the "Skip Next" button on recurring reminder DMs.
 * Skips the next occurrence without cancelling the series.
 */
async function handleSkipNextButton(
  interaction: ButtonInteraction,
  db: ExtendedPrismaClient,
): Promise<void> {
  // Resolve member ID from Discord account
  const account = await db.discordAccount.findUnique({
    where: { discordId: interaction.user.id },
  });

  if (!account) return;

  // Find an active recurring reminder for this member
  // that was delivered via this message
  const reminder = await db.reminder.findFirst({
    where: {
      memberId: account.memberId,
      status: 'ACTIVE',
      cronExpression: { not: null },
      dmMessageId: interaction.message.id,
    },
  });

  if (!reminder) {
    // Fallback: try finding any active recurring reminder for this member
    // (in case the dmMessageId wasn't stored)
    const fallbackReminder = await db.reminder.findFirst({
      where: {
        memberId: account.memberId,
        status: 'ACTIVE',
        cronExpression: { not: null },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!fallbackReminder) {
      await interaction.followUp({
        content: 'No recurring reminder found to skip.',
        ephemeral: true,
      });
      return;
    }

    await skipNextOccurrence(fallbackReminder.id, db, fallbackReminder.cronExpression);
    await interaction.followUp({
      content: 'Next occurrence skipped. The series will continue after that.',
      ephemeral: true,
    });
    return;
  }

  await skipNextOccurrence(reminder.id, db, reminder.cronExpression);
  await interaction.followUp({
    content: 'Next occurrence skipped. The series will continue after that.',
    ephemeral: true,
  });
}
