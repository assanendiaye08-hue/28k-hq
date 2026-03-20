/**
 * Session Slash Commands
 *
 * /lockin         -- Start an instant co-working session
 * /schedule-session -- Schedule a future session
 * /endsession     -- End your active session
 * /invite-session -- Invite someone to your active session
 */

import {
  SlashCommandBuilder,
  channelMention,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { ModuleContext } from '../../shared/types.js';
import type { ExtendedPrismaClient } from '../../db/client.js';
import {
  startInstantSession,
  scheduleSession,
  endSession,
  inviteMidSession,
  findActiveSessionByCreator,
} from './manager.js';
import { MAX_SESSION_TITLE_LENGTH } from './constants.js';

// ─── /lockin Command ────────────────────────────────────────────────────────

/**
 * Build the /lockin slash command definition.
 */
export function buildLockinCommand(): SlashCommandBuilder {
  return new SlashCommandBuilder()
    .setName('lockin')
    .setDescription('Start an instant lock-in session')
    .addStringOption((opt) =>
      opt
        .setName('title')
        .setDescription('What are you working on?')
        .setMaxLength(MAX_SESSION_TITLE_LENGTH)
        .setRequired(false),
    )
    .addStringOption((opt) =>
      opt
        .setName('visibility')
        .setDescription('Who can join? (default: public)')
        .addChoices(
          { name: 'Public (anyone can join)', value: 'public' },
          { name: 'Private (invite only)', value: 'private' },
        )
        .setRequired(false),
    )
    .addUserOption((opt) =>
      opt
        .setName('invite')
        .setDescription('Invite someone to your session')
        .setRequired(false),
    ) as SlashCommandBuilder;
}

/**
 * Handle the /lockin slash command.
 */
export async function handleLockin(
  interaction: ChatInputCommandInteraction,
  ctx: ModuleContext,
): Promise<void> {
  const db = ctx.db as ExtendedPrismaClient;

  // Resolve member
  const account = await db.discordAccount.findUnique({
    where: { discordId: interaction.user.id },
  });
  if (!account) {
    await interaction.reply({ content: 'Run /setup first.', ephemeral: true });
    return;
  }

  if (!interaction.guild) {
    await interaction.reply({ content: 'This command must be used in a server.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const title = interaction.options.getString('title') ?? '';
  const visibilityChoice = interaction.options.getString('visibility') ?? 'public';
  const visibility = visibilityChoice === 'private' ? 'PRIVATE' as const : 'PUBLIC' as const;
  const invitedUser = interaction.options.getUser('invite');
  const inviteeIds = invitedUser ? [invitedUser.id] : [];

  try {
    const result = await startInstantSession(
      interaction.guild,
      db,
      ctx.events,
      account.memberId,
      interaction.user.id,
      title,
      visibility,
      inviteeIds,
    );

    await interaction.editReply({
      content: `Session started! Join: ${channelMention(result.voiceChannelId)}`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to start session.';
    await interaction.editReply({ content: msg });
  }
}

// ─── /schedule-session Command ──────────────────────────────────────────────

/**
 * Build the /schedule-session slash command definition.
 */
export function buildScheduleSessionCommand(): SlashCommandBuilder {
  return new SlashCommandBuilder()
    .setName('schedule-session')
    .setDescription('Schedule a future lock-in session')
    .addStringOption((opt) =>
      opt
        .setName('title')
        .setDescription('What the session is about')
        .setMaxLength(MAX_SESSION_TITLE_LENGTH)
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName('time')
        .setDescription('When to start (e.g. "in 2 hours", "tomorrow at 2pm")')
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName('visibility')
        .setDescription('Who can join? (default: public)')
        .addChoices(
          { name: 'Public (anyone can join)', value: 'public' },
          { name: 'Private (invite only)', value: 'private' },
        )
        .setRequired(false),
    )
    .addUserOption((opt) =>
      opt
        .setName('invite')
        .setDescription('Invite someone to the session')
        .setRequired(false),
    ) as SlashCommandBuilder;
}

/**
 * Handle the /schedule-session slash command.
 */
export async function handleScheduleSession(
  interaction: ChatInputCommandInteraction,
  ctx: ModuleContext,
): Promise<void> {
  const db = ctx.db as ExtendedPrismaClient;

  const account = await db.discordAccount.findUnique({
    where: { discordId: interaction.user.id },
  });
  if (!account) {
    await interaction.reply({ content: 'Run /setup first.', ephemeral: true });
    return;
  }

  if (!interaction.guild) {
    await interaction.reply({ content: 'This command must be used in a server.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const title = interaction.options.getString('title', true);
  const timeStr = interaction.options.getString('time', true);
  const visibilityChoice = interaction.options.getString('visibility') ?? 'public';
  const visibility = visibilityChoice === 'private' ? 'PRIVATE' as const : 'PUBLIC' as const;
  const invitedUser = interaction.options.getUser('invite');
  const inviteeIds = invitedUser ? [invitedUser.id] : [];

  // Parse time string to Date
  const scheduledFor = parseTimeString(timeStr);
  if (!scheduledFor || scheduledFor.getTime() <= Date.now()) {
    await interaction.editReply({
      content: 'Could not parse that time, or it is in the past. Try something like "in 2 hours" or "tomorrow at 3pm".',
    });
    return;
  }

  try {
    await scheduleSession(
      interaction.guild,
      db,
      account.memberId,
      title,
      visibility,
      scheduledFor,
      inviteeIds,
    );

    const timestamp = Math.floor(scheduledFor.getTime() / 1000);
    await interaction.editReply({
      content: `Session **${title}** scheduled for <t:${timestamp}:F> (<t:${timestamp}:R>).`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to schedule session.';
    await interaction.editReply({ content: msg });
  }
}

// ─── /endsession Command ────────────────────────────────────────────────────

/**
 * Build the /endsession slash command definition.
 */
export function buildEndsessionCommand(): SlashCommandBuilder {
  return new SlashCommandBuilder()
    .setName('endsession')
    .setDescription('End your active lock-in session') as SlashCommandBuilder;
}

/**
 * Handle the /endsession slash command.
 */
export async function handleEndsession(
  interaction: ChatInputCommandInteraction,
  ctx: ModuleContext,
): Promise<void> {
  const db = ctx.db as ExtendedPrismaClient;

  const account = await db.discordAccount.findUnique({
    where: { discordId: interaction.user.id },
  });
  if (!account) {
    await interaction.reply({ content: 'Run /setup first.', ephemeral: true });
    return;
  }

  if (!interaction.guild) {
    await interaction.reply({ content: 'This command must be used in a server.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  // Find caller's active session
  const activeSession = await findActiveSessionByCreator(db, account.memberId);
  if (!activeSession) {
    await interaction.editReply({ content: "You don't have an active session." });
    return;
  }

  try {
    const result = await endSession(
      interaction.guild,
      db,
      ctx.events,
      ctx.client,
      activeSession.id,
    );

    if (result) {
      const hours = Math.floor(result.durationMinutes / 60);
      const mins = result.durationMinutes % 60;
      const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
      await interaction.editReply({
        content: `Session ended. **${timeStr}** with **${result.participantCount}** participant(s). Summary posted in #sessions.`,
      });
    } else {
      await interaction.editReply({ content: 'Session was already ended.' });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to end session.';
    await interaction.editReply({ content: msg });
  }
}

// ─── /invite-session Command ────────────────────────────────────────────────

/**
 * Build the /invite-session slash command definition.
 */
export function buildInviteSessionCommand(): SlashCommandBuilder {
  return new SlashCommandBuilder()
    .setName('invite-session')
    .setDescription('Invite someone to your active session')
    .addUserOption((opt) =>
      opt
        .setName('user')
        .setDescription('Who to invite')
        .setRequired(true),
    ) as SlashCommandBuilder;
}

/**
 * Handle the /invite-session slash command.
 */
export async function handleInviteSession(
  interaction: ChatInputCommandInteraction,
  ctx: ModuleContext,
): Promise<void> {
  const db = ctx.db as ExtendedPrismaClient;

  const account = await db.discordAccount.findUnique({
    where: { discordId: interaction.user.id },
  });
  if (!account) {
    await interaction.reply({ content: 'Run /setup first.', ephemeral: true });
    return;
  }

  if (!interaction.guild) {
    await interaction.reply({ content: 'This command must be used in a server.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const activeSession = await findActiveSessionByCreator(db, account.memberId);
  if (!activeSession) {
    await interaction.editReply({ content: "You don't have an active session." });
    return;
  }

  const targetUser = interaction.options.getUser('user', true);

  try {
    await inviteMidSession(interaction.guild, db, activeSession.id, targetUser.id);
    await interaction.editReply({
      content: `Invited **${targetUser.displayName}** to your session.`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to invite user.';
    await interaction.editReply({ content: msg });
  }
}

// ─── Time Parsing ───────────────────────────────────────────────────────────

/**
 * Parse a natural language time string into a Date.
 *
 * Supports patterns like:
 * - "in 30 minutes", "in 2 hours"
 * - "tomorrow at 2pm", "today at 5pm"
 *
 * Falls back to ISO date string parsing.
 */
function parseTimeString(input: string): Date | null {
  const now = new Date();
  const lower = input.toLowerCase().trim();

  // "in X minutes/hours"
  const relativeMatch = lower.match(/^in\s+(\d+)\s*(min(?:ute)?s?|hours?|h|m)\s*$/);
  if (relativeMatch) {
    const amount = parseInt(relativeMatch[1], 10);
    const unit = relativeMatch[2];
    const ms = unit.startsWith('h')
      ? amount * 60 * 60 * 1000
      : amount * 60 * 1000;
    return new Date(now.getTime() + ms);
  }

  // "tomorrow at Xpm/am"
  const tomorrowMatch = lower.match(/^tomorrow\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*$/);
  if (tomorrowMatch) {
    const date = new Date(now);
    date.setDate(date.getDate() + 1);
    let hours = parseInt(tomorrowMatch[1], 10);
    const minutes = tomorrowMatch[2] ? parseInt(tomorrowMatch[2], 10) : 0;
    const ampm = tomorrowMatch[3];
    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;
    date.setHours(hours, minutes, 0, 0);
    return date;
  }

  // "today at Xpm/am"
  const todayMatch = lower.match(/^today\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*$/);
  if (todayMatch) {
    const date = new Date(now);
    let hours = parseInt(todayMatch[1], 10);
    const minutes = todayMatch[2] ? parseInt(todayMatch[2], 10) : 0;
    const ampm = todayMatch[3];
    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;
    date.setHours(hours, minutes, 0, 0);
    return date;
  }

  // Fallback: try native Date parse
  const parsed = new Date(input);
  if (!isNaN(parsed.getTime())) return parsed;

  return null;
}
