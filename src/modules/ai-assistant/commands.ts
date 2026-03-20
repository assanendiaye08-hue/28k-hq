/**
 * AI assistant slash commands.
 *
 * /ask [message] -- Chat with Ace from any channel (ephemeral response)
 * /wipe-history  -- Export conversation history as JSON file, then wipe it
 */

import {
  SlashCommandBuilder,
  AttachmentBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { ModuleContext } from '../../shared/types.js';
import type { ExtendedPrismaClient } from '../../db/client.js';
import { handleChat } from './chat.js';
import { exportHistory, wipeHistory } from './memory.js';
import { AI_NAME } from './personality.js';

// ─── /ask Command ──────────────────────────────────────────────────────────────

/**
 * Build the /ask slash command definition.
 */
export function buildAskCommand(): SlashCommandBuilder {
  return new SlashCommandBuilder()
    .setName('ask')
    .setDescription(`Ask ${AI_NAME} anything`)
    .addStringOption((opt) =>
      opt
        .setName('message')
        .setDescription('Your message to Ace')
        .setRequired(true),
    ) as SlashCommandBuilder;
}

/**
 * Handle the /ask slash command.
 */
export async function handleAsk(
  interaction: ChatInputCommandInteraction,
  ctx: ModuleContext,
): Promise<void> {
  const db = ctx.db as ExtendedPrismaClient;
  const userMessage = interaction.options.getString('message', true);

  // Resolve Discord ID to member
  const account = await db.discordAccount.findUnique({
    where: { discordId: interaction.user.id },
  });

  if (!account) {
    await interaction.reply({
      content: 'You need to run /setup first before chatting with Ace.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const response = await handleChat(db, account.memberId, userMessage);
    // Split response if over 2000 chars
    const chunks = splitMessage(response);
    await interaction.editReply({ content: chunks[0] });

    // Send additional chunks as follow-ups
    for (let i = 1; i < chunks.length; i++) {
      await interaction.followUp({ content: chunks[i], ephemeral: true });
    }
  } catch (error) {
    ctx.logger.error(`[ai-assistant] /ask failed: ${String(error)}`);
    await interaction.editReply({
      content: "Something went wrong. Try again in a sec.",
    });
  }
}

// ─── /wipe-history Command ─────────────────────────────────────────────────────

/**
 * Build the /wipe-history slash command definition.
 */
export function buildWipeHistoryCommand(): SlashCommandBuilder {
  return new SlashCommandBuilder()
    .setName('wipe-history')
    .setDescription('Export and clear your conversation history with Ace') as SlashCommandBuilder;
}

/**
 * Handle the /wipe-history slash command.
 */
export async function handleWipeHistory(
  interaction: ChatInputCommandInteraction,
  ctx: ModuleContext,
): Promise<void> {
  const db = ctx.db as ExtendedPrismaClient;

  // Resolve Discord ID to member
  const account = await db.discordAccount.findUnique({
    where: { discordId: interaction.user.id },
  });

  if (!account) {
    await interaction.reply({
      content: 'You need to run /setup first.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    // Export history as JSON
    const history = await exportHistory(db, account.memberId);

    if (history.length > 0) {
      // Create JSON file attachment
      const jsonContent = JSON.stringify(history, null, 2);
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `ace-history-${account.memberId}-${dateStr}.json`;

      const attachment = new AttachmentBuilder(Buffer.from(jsonContent, 'utf-8'), {
        name: filename,
        description: `Conversation history with ${AI_NAME}`,
      });

      // Wipe the history
      await wipeHistory(db, account.memberId);

      await interaction.editReply({
        content: 'Your conversation history has been exported and wiped. Your profile and goals are untouched.',
        files: [attachment],
      });
    } else {
      await interaction.editReply({
        content: "You don't have any conversation history to wipe.",
      });
    }
  } catch (error) {
    ctx.logger.error(`[ai-assistant] /wipe-history failed: ${String(error)}`);
    await interaction.editReply({
      content: "Something went wrong while exporting your history. Try again.",
    });
  }
}

// ─── /accountability Command ─────────────────────────────────────────────────────

/** Level descriptions for user confirmation messages. */
const ACCOUNTABILITY_DESCRIPTIONS: Record<string, string> = {
  light: "Chill mode -- I'll nudge you if you miss 2+ days. Max 1 nudge/day.",
  medium: "Standard mode -- I'll check in if you miss a day. Max 2 nudges/day.",
  heavy: "Full accountability -- I'm on you same-day if you skip. Max 3 nudges/day.",
};

/**
 * Build the /accountability slash command definition.
 */
export function buildAccountabilityCommand(): SlashCommandBuilder {
  return new SlashCommandBuilder()
    .setName('accountability')
    .setDescription('Set your accountability nudge intensity')
    .addStringOption((opt) =>
      opt
        .setName('level')
        .setDescription('How hard should Ace push you?')
        .setRequired(true)
        .addChoices(
          { name: 'Light (gentle, miss 2+ days)', value: 'light' },
          { name: 'Medium (direct, miss 1 day)', value: 'medium' },
          { name: 'Heavy (full accountability, same-day)', value: 'heavy' },
        ),
    ) as SlashCommandBuilder;
}

/**
 * Handle the /accountability slash command.
 */
export async function handleAccountability(
  interaction: ChatInputCommandInteraction,
  ctx: ModuleContext,
): Promise<void> {
  const db = ctx.db as ExtendedPrismaClient;
  const { events } = ctx;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // Resolve Discord ID to member
  const account = await db.discordAccount.findUnique({
    where: { discordId: interaction.user.id },
  });

  if (!account) {
    await interaction.editReply({
      content: 'You need to run /setup first.',
    });
    return;
  }

  const memberId = account.memberId;
  const level = interaction.options.getString('level', true);

  // Upsert MemberSchedule with new accountability level
  // Also set default nudge time if not already set
  await db.memberSchedule.upsert({
    where: { memberId },
    update: {
      accountabilityLevel: level,
      // Set default nudge time on first /accountability usage if not set
      nudgeTime: undefined, // Keep existing nudgeTime; set below if null
    },
    create: {
      memberId,
      timezone: 'UTC',
      accountabilityLevel: level,
      nudgeTime: '21:00', // Default evening nudge time
    },
  });

  // Ensure nudgeTime is set for existing schedules that had none
  const schedule = await db.memberSchedule.findUnique({ where: { memberId } });
  if (schedule && !schedule.nudgeTime) {
    await db.memberSchedule.update({
      where: { memberId },
      data: { nudgeTime: '21:00' },
    });
  }

  // Emit scheduleUpdated so scheduler rebuilds with new nudge settings
  events.emit('scheduleUpdated', memberId);

  const description = ACCOUNTABILITY_DESCRIPTIONS[level] ?? ACCOUNTABILITY_DESCRIPTIONS.medium;
  await interaction.editReply({
    content: `Accountability set to **${level}**. ${description}\n\nUse \`/settings nudge-time\` to change when I send nudges (default: 9:00 PM).`,
  });

  ctx.logger.info(`[ai-assistant] Accountability set to ${level} for ${memberId}`);
}

// ─── Utilities ─────────────────────────────────────────────────────────────────

/**
 * Split a message into chunks of max 2000 characters (Discord's limit).
 * Tries to split at newlines for readability.
 */
export function splitMessage(text: string, maxLength: number = 2000): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Try to split at the last newline within the limit
    let splitIndex = remaining.lastIndexOf('\n', maxLength);
    if (splitIndex === -1 || splitIndex < maxLength * 0.5) {
      // No good newline split point -- split at space
      splitIndex = remaining.lastIndexOf(' ', maxLength);
    }
    if (splitIndex === -1 || splitIndex < maxLength * 0.5) {
      // No good split point at all -- hard split
      splitIndex = maxLength;
    }

    chunks.push(remaining.slice(0, splitIndex));
    remaining = remaining.slice(splitIndex).trimStart();
  }

  return chunks;
}
