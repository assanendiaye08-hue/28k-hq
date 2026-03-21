/**
 * Reminder Slash Commands
 *
 * /remind message time [urgency] [repeat] -- Set a reminder
 * /reminders list -- View pending and recurring reminders
 * /reminders cancel id -- Cancel a reminder by short ID
 *
 * Reminders are created in DB then scheduled via scheduler engine.
 * Member timezone from MemberSchedule is used for time display and parsing.
 */

import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { format } from 'date-fns';
import { TZDate } from '@date-fns/tz';
import type { ModuleContext } from '../../shared/types.js';
import type { ExtendedPrismaClient } from '@28k/db';
import { parseReminder } from './parser.js';
import { scheduleOneShot, scheduleRecurring } from './scheduler.js';
import { DiscordReminderDelivery } from './delivery.js';

// ─── Command Builders ───────────────────────────────────────────────────────────

/**
 * Build the /remind slash command definition.
 */
export function buildRemindCommand(): SlashCommandBuilder {
  return new SlashCommandBuilder()
    .setName('remind')
    .setDescription('Set a reminder')
    .addStringOption((opt) =>
      opt
        .setName('message')
        .setDescription('What to remind you about')
        .setRequired(true)
        .setMaxLength(500),
    )
    .addStringOption((opt) =>
      opt
        .setName('time')
        .setDescription("When to remind you (e.g. 'Tuesday at 3pm', 'in 2 hours')")
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName('urgency')
        .setDescription('Urgency level (default: low)')
        .setRequired(false)
        .addChoices(
          { name: 'Low', value: 'LOW' },
          { name: 'High', value: 'HIGH' },
        ),
    )
    .addStringOption((opt) =>
      opt
        .setName('repeat')
        .setDescription("Recurring schedule (e.g. 'every Monday', 'every day', 'every weekday')")
        .setRequired(false),
    ) as SlashCommandBuilder;
}

/**
 * Build the /reminders slash command definition with list and cancel subcommands.
 */
export function buildRemindersCommand(): SlashCommandBuilder {
  return new SlashCommandBuilder()
    .setName('reminders')
    .setDescription('Manage your reminders')
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('View your pending and recurring reminders'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('cancel')
        .setDescription('Cancel a reminder')
        .addStringOption((opt) =>
          opt
            .setName('id')
            .setDescription('Reminder ID (from /reminders list)')
            .setRequired(true),
        ),
    ) as SlashCommandBuilder;
}

// ─── /remind Handler ────────────────────────────────────────────────────────────

/**
 * Handle the /remind command: parse time, create reminder, schedule it.
 */
export async function handleRemind(
  interaction: ChatInputCommandInteraction,
  ctx: ModuleContext,
): Promise<void> {
  const db = ctx.db as ExtendedPrismaClient;
  await interaction.deferReply({ ephemeral: true });

  // Resolve internal member ID
  const account = await db.discordAccount.findUnique({
    where: { discordId: interaction.user.id },
  });

  if (!account) {
    await interaction.editReply('You need to run /setup first.');
    return;
  }

  const memberId = account.memberId;

  // Get member timezone
  const schedule = await db.memberSchedule.findUnique({
    where: { memberId },
  });
  const timezone = schedule?.timezone || 'UTC';

  // Read options
  const messageContent = interaction.options.getString('message', true);
  const timeText = interaction.options.getString('time', true);
  const urgencyOption = interaction.options.getString('urgency') as 'LOW' | 'HIGH' | null;
  const repeatText = interaction.options.getString('repeat');

  // Build text for parser: combine repeat + time + message
  let parseText = '';
  if (repeatText) {
    parseText += `${repeatText} `;
  }
  parseText += `${timeText} to ${messageContent}`;

  // Parse the reminder
  const parsed = parseReminder(parseText, timezone);

  if (!parsed) {
    await interaction.editReply(
      "Couldn't parse that time. Try something like 'Tuesday at 3pm' or 'in 2 hours'.",
    );
    return;
  }

  // Override urgency if explicitly provided via option
  if (urgencyOption) {
    parsed.urgency = urgencyOption;
  }

  // Override content with the message option (more reliable than parser extraction for slash commands)
  parsed.content = messageContent;

  // Create reminder in DB
  const reminder = await db.reminder.create({
    data: {
      memberId,
      content: parsed.content,
      urgency: parsed.urgency,
      fireAt: parsed.fireAt,
      cronExpression: parsed.cronExpression,
      status: parsed.isRecurring ? 'ACTIVE' : 'PENDING',
    },
  });

  // Schedule it
  const delivery = new DiscordReminderDelivery(ctx.client, db);

  if (parsed.isRecurring) {
    await scheduleRecurring(reminder, delivery, db, ctx.client);
  } else {
    scheduleOneShot(reminder, delivery, db, ctx.client);
  }

  // Build confirmation message
  if (parsed.isRecurring && parsed.fireAt) {
    const nextTime = new TZDate(parsed.fireAt, timezone);
    const formattedNext = format(nextTime, "EEE, MMM d 'at' h:mm a");
    await interaction.editReply(
      `Recurring reminder set: "${parsed.content}" (${repeatText || 'recurring'}). Next: ${formattedNext}`,
    );
  } else if (parsed.fireAt) {
    const fireTime = new TZDate(parsed.fireAt, timezone);
    const formattedTime = format(fireTime, "EEE, MMM d 'at' h:mm a");
    await interaction.editReply(
      `Reminder set: "${parsed.content}" at ${formattedTime}`,
    );
  }

  // Warn about timezone if not set
  if (!schedule?.timezone || schedule.timezone === 'UTC') {
    await interaction.followUp({
      content: "Tip: Set your timezone with /settings so reminders fire at your local time.",
      ephemeral: true,
    });
  }
}

// ─── /reminders Handler ─────────────────────────────────────────────────────────

/**
 * Handle the /reminders command: list or cancel subcommands.
 */
export async function handleReminders(
  interaction: ChatInputCommandInteraction,
  ctx: ModuleContext,
): Promise<void> {
  const db = ctx.db as ExtendedPrismaClient;
  await interaction.deferReply({ ephemeral: true });

  // Resolve internal member ID
  const account = await db.discordAccount.findUnique({
    where: { discordId: interaction.user.id },
  });

  if (!account) {
    await interaction.editReply('You need to run /setup first.');
    return;
  }

  const memberId = account.memberId;
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'list':
      await handleList(interaction, db, memberId);
      break;
    case 'cancel':
      await handleCancel(interaction, db, memberId);
      break;
  }
}

// ─── List Subcommand ────────────────────────────────────────────────────────────

async function handleList(
  interaction: ChatInputCommandInteraction,
  db: ExtendedPrismaClient,
  memberId: string,
): Promise<void> {
  // Get member timezone for display
  const schedule = await db.memberSchedule.findUnique({
    where: { memberId },
  });
  const timezone = schedule?.timezone || 'UTC';

  // Query all pending and active reminders
  const reminders = await db.reminder.findMany({
    where: {
      memberId,
      status: { in: ['PENDING', 'ACTIVE'] },
    },
    orderBy: { fireAt: 'asc' },
  });

  if (reminders.length === 0) {
    await interaction.editReply('No pending reminders.');
    return;
  }

  // Build list display
  const lines: string[] = ['**Your Reminders:**\n'];

  for (const r of reminders) {
    const shortId = r.id.slice(-6);
    const content = r.content.length > 50 ? r.content.slice(0, 47) + '...' : r.content;
    const urgencyBadge = r.urgency === 'HIGH' ? ' :red_circle:' : '';
    const recurringIndicator = r.cronExpression ? ' :repeat:' : '';

    let timeDisplay = 'Unknown';
    if (r.fireAt) {
      const fireTime = new TZDate(r.fireAt, timezone);
      timeDisplay = format(fireTime, "EEE, MMM d 'at' h:mm a");
    } else if (r.cronExpression) {
      timeDisplay = `Cron: ${r.cronExpression}`;
    }

    lines.push(
      `\`${shortId}\` ${content}${urgencyBadge}${recurringIndicator}\n  Next: ${timeDisplay}`,
    );
  }

  await interaction.editReply(lines.join('\n'));
}

// ─── Cancel Subcommand ──────────────────────────────────────────────────────────

async function handleCancel(
  interaction: ChatInputCommandInteraction,
  db: ExtendedPrismaClient,
  memberId: string,
): Promise<void> {
  const idSuffix = interaction.options.getString('id', true).toLowerCase();

  // Find reminders matching the ID suffix
  const candidates = await db.reminder.findMany({
    where: {
      memberId,
      status: { in: ['PENDING', 'ACTIVE'] },
    },
  });

  const matches = candidates.filter((r) =>
    r.id.toLowerCase().endsWith(idSuffix),
  );

  if (matches.length === 0) {
    await interaction.editReply(
      'Reminder not found. Use /reminders list to see your reminders.',
    );
    return;
  }

  if (matches.length > 1) {
    await interaction.editReply(
      'Multiple matches. Use more characters from the ID.',
    );
    return;
  }

  const reminder = matches[0];

  // Cancel in-memory scheduling
  const { cancelReminder } = await import('./scheduler.js');
  cancelReminder(reminder.id);

  // Update DB status
  await db.reminder.update({
    where: { id: reminder.id },
    data: { status: 'CANCELLED' },
  });

  await interaction.editReply(`Reminder cancelled: "${reminder.content}"`);
}
