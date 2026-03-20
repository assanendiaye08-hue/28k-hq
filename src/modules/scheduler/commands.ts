/**
 * /settings slash command for schedule preferences.
 *
 * Lets members configure:
 * - timezone (IANA string)
 * - brief-time (HH:mm)
 * - brief-tone (coach, chill, data-first)
 * - reminders (comma-separated HH:mm or am/pm times)
 * - sunday-planning (on/off toggle)
 *
 * This is the timezone collection mechanism -- not during initial setup
 * (which already has 6 questions) but via a dedicated settings command.
 */

import {
  SlashCommandBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { ModuleContext } from '../../shared/types.js';
import type { ExtendedPrismaClient } from '../../db/client.js';
import { successEmbed, errorEmbed } from '../../shared/embeds.js';

/** Common IANA timezones for error message suggestions. */
const COMMON_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Kolkata',
  'Australia/Sydney',
  'Pacific/Auckland',
];

/**
 * Build the /settings slash command definition.
 */
export function buildSettingsCommand(): SlashCommandBuilder {
  const cmd = new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Configure your schedule preferences');

  cmd.addStringOption((opt) =>
    opt
      .setName('timezone')
      .setDescription('Your timezone (e.g., America/New_York, Europe/London)')
      .setRequired(false),
  );

  cmd.addStringOption((opt) =>
    opt
      .setName('brief-time')
      .setDescription("When to receive your morning brief (e.g., '8:00' or '08:30')")
      .setRequired(false),
  );

  cmd.addStringOption((opt) =>
    opt
      .setName('brief-tone')
      .setDescription('Morning brief style')
      .setRequired(false)
      .addChoices(
        { name: 'Coach (motivational, direct)', value: 'coach' },
        { name: 'Chill (casual, supportive)', value: 'chill' },
        { name: 'Data-first (stats-forward, minimal fluff)', value: 'data-first' },
      ),
  );

  cmd.addStringOption((opt) =>
    opt
      .setName('reminders')
      .setDescription("Check-in reminder times, comma-separated (e.g., '9:00, 15:00' or '9am, 3pm')")
      .setRequired(false),
  );

  cmd.addBooleanOption((opt) =>
    opt
      .setName('sunday-planning')
      .setDescription('Receive Sunday planning session?')
      .setRequired(false),
  );

  return cmd;
}

/**
 * Register the /settings command with the module context.
 */
export function registerSchedulerCommands(ctx: ModuleContext): void {
  ctx.commands.register('settings', buildSettingsCommand(), handleSettings);
}

/**
 * Handle the /settings interaction.
 */
async function handleSettings(
  interaction: ChatInputCommandInteraction,
  ctx: ModuleContext,
): Promise<void> {
  const db = ctx.db as ExtendedPrismaClient;
  const { events, logger } = ctx;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // Look up member
  const discordId = interaction.user.id;
  const account = await db.discordAccount.findUnique({
    where: { discordId },
  });

  if (!account) {
    await interaction.editReply({
      embeds: [errorEmbed('Not set up', 'Run /setup first to create your profile.')],
    });
    return;
  }

  const memberId = account.memberId;

  // Get provided options
  const timezoneInput = interaction.options.getString('timezone');
  const briefTimeInput = interaction.options.getString('brief-time');
  const briefToneInput = interaction.options.getString('brief-tone');
  const remindersInput = interaction.options.getString('reminders');
  const sundayPlanningInput = interaction.options.getBoolean('sunday-planning');

  // Check if any option was provided
  if (
    timezoneInput === null &&
    briefTimeInput === null &&
    briefToneInput === null &&
    remindersInput === null &&
    sundayPlanningInput === null
  ) {
    // Show current settings
    const schedule = await db.memberSchedule.findUnique({
      where: { memberId },
    });

    if (!schedule) {
      await interaction.editReply({
        embeds: [
          successEmbed('Settings', 'No schedule configured yet. Use /settings with options to set up.'),
        ],
      });
      return;
    }

    const embed = successEmbed('Current Settings');
    embed.addFields(
      { name: 'Timezone', value: schedule.timezone, inline: true },
      { name: 'Brief Time', value: schedule.briefTime ?? 'Not set', inline: true },
      { name: 'Brief Tone', value: schedule.briefTone, inline: true },
      { name: 'Reminders', value: schedule.reminderTimes.length > 0 ? schedule.reminderTimes.join(', ') : 'None', inline: true },
      { name: 'Sunday Planning', value: schedule.sundayPlanning ? 'On' : 'Off', inline: true },
    );

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // Validate timezone if provided
  if (timezoneInput) {
    if (!isValidTimezone(timezoneInput)) {
      const suggestions = COMMON_TIMEZONES.join(', ');
      await interaction.editReply({
        embeds: [
          errorEmbed(
            'Invalid timezone',
            `"${timezoneInput}" is not a valid IANA timezone.\n\nCommon timezones: ${suggestions}`,
          ),
        ],
      });
      return;
    }
  }

  // Parse brief time if provided
  let parsedBriefTime: string | undefined;
  if (briefTimeInput) {
    parsedBriefTime = parseHHmm(briefTimeInput) ?? undefined;
    if (!parsedBriefTime) {
      await interaction.editReply({
        embeds: [
          errorEmbed(
            'Invalid time',
            `"${briefTimeInput}" is not a valid time. Use HH:mm format (e.g., "08:30", "9:00").`,
          ),
        ],
      });
      return;
    }
  }

  // Parse reminder times if provided
  let parsedReminders: string[] | undefined;
  if (remindersInput) {
    parsedReminders = parseReminderTimesFromInput(remindersInput);
    if (parsedReminders.length === 0) {
      await interaction.editReply({
        embeds: [
          errorEmbed(
            'Invalid reminder times',
            `Could not parse times from "${remindersInput}". Use comma-separated HH:mm format (e.g., "9:00, 15:00") or am/pm (e.g., "9am, 3pm").`,
          ),
        ],
      });
      return;
    }
  }

  // Build update data (only include fields that were provided)
  const updateData: Record<string, unknown> = {};
  if (timezoneInput) updateData.timezone = timezoneInput;
  if (parsedBriefTime !== undefined) updateData.briefTime = parsedBriefTime;
  if (briefToneInput) updateData.briefTone = briefToneInput;
  if (parsedReminders !== undefined) updateData.reminderTimes = parsedReminders;
  if (sundayPlanningInput !== null) updateData.sundayPlanning = sundayPlanningInput;

  // Upsert MemberSchedule
  const schedule = await db.memberSchedule.upsert({
    where: { memberId },
    update: updateData,
    create: {
      memberId,
      timezone: timezoneInput ?? 'UTC',
      briefTime: parsedBriefTime ?? null,
      briefTone: briefToneInput ?? 'coach',
      reminderTimes: parsedReminders ?? [],
      sundayPlanning: sundayPlanningInput ?? true,
    },
  });

  // Emit scheduleUpdated event so SchedulerManager rebuilds tasks
  events.emit('scheduleUpdated', memberId);

  // Build confirmation embed
  const embed = successEmbed('Settings updated');
  embed.addFields(
    { name: 'Timezone', value: schedule.timezone, inline: true },
    { name: 'Brief Time', value: schedule.briefTime ?? 'Not set', inline: true },
    { name: 'Brief Tone', value: schedule.briefTone, inline: true },
    { name: 'Reminders', value: schedule.reminderTimes.length > 0 ? schedule.reminderTimes.join(', ') : 'None', inline: true },
    { name: 'Sunday Planning', value: schedule.sundayPlanning ? 'On' : 'Off', inline: true },
  );

  await interaction.editReply({ embeds: [embed] });
  logger.info(`Settings updated for ${memberId}: ${JSON.stringify(updateData)}`);
}

// ─── Utility Functions ──────────────────────────────────────────────────────────

/**
 * Validate an IANA timezone string.
 * Uses Intl.DateTimeFormat which supports all IANA timezone identifiers.
 */
function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse a time string into HH:mm format.
 * Supports: "8:00", "08:30", "9:00", "15:30"
 */
function parseHHmm(input: string): string | null {
  const trimmed = input.trim();

  // Match HH:mm or H:mm
  const match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
  }

  // Match "9am", "3pm" style
  const ampmMatch = trimmed.match(/^(\d{1,2})\s*(am|pm)$/i);
  if (ampmMatch) {
    let h = parseInt(ampmMatch[1], 10);
    const period = ampmMatch[2].toLowerCase();
    if (period === 'pm' && h < 12) h += 12;
    if (period === 'am' && h === 12) h = 0;
    if (h >= 0 && h <= 23) {
      return `${String(h).padStart(2, '0')}:00`;
    }
  }

  return null;
}

/**
 * Parse comma-separated reminder times from user input.
 * Supports HH:mm and am/pm formats.
 */
function parseReminderTimesFromInput(input: string): string[] {
  const parts = input.split(',').map((s) => s.trim()).filter(Boolean);
  const times: string[] = [];

  for (const part of parts) {
    const parsed = parseHHmm(part);
    if (parsed && !times.includes(parsed)) {
      times.push(parsed);
    }
  }

  return times.sort();
}
