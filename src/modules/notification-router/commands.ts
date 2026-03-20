/**
 * /notifications slash command handler.
 *
 * Allows members to configure per-notification-type account routing.
 * Members with multiple linked Discord accounts can choose which
 * account receives each type of notification.
 *
 * Subcommands:
 *   /notifications view   -- Show current routing preferences
 *   /notifications set    -- Route a notification type to a specific account
 *   /notifications reset  -- Reset a notification type to default (primary account)
 */

import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { ModuleContext } from '../../shared/types.js';
import type { ExtendedPrismaClient } from '../../db/client.js';
import { BRAND_COLORS } from '../../shared/constants.js';
import {
  NOTIFICATION_TYPE_LABELS,
  ROUTABLE_TYPES,
  type NotificationType,
} from './constants.js';

/**
 * Build the /notifications slash command definition.
 */
export function buildNotificationsCommand(): SlashCommandBuilder {
  const cmd = new SlashCommandBuilder()
    .setName('notifications')
    .setDescription('Choose which account gets each notification type');

  cmd.addSubcommand((sub) =>
    sub
      .setName('view')
      .setDescription('View your current notification routing'),
  );

  cmd.addSubcommand((sub) =>
    sub
      .setName('set')
      .setDescription('Route a notification type to a specific account')
      .addStringOption((opt) =>
        opt
          .setName('type')
          .setDescription('Which notification type to route')
          .setRequired(true)
          .addChoices(
            ...ROUTABLE_TYPES.map((t) => ({
              name: NOTIFICATION_TYPE_LABELS[t],
              value: t,
            })),
          ),
      )
      .addUserOption((opt) =>
        opt
          .setName('account')
          .setDescription('The Discord account to send this notification type to')
          .setRequired(true),
      ),
  );

  cmd.addSubcommand((sub) =>
    sub
      .setName('reset')
      .setDescription('Reset a notification type to default (primary account)')
      .addStringOption((opt) =>
        opt
          .setName('type')
          .setDescription('Which notification type to reset')
          .setRequired(true)
          .addChoices(
            ...ROUTABLE_TYPES.map((t) => ({
              name: NOTIFICATION_TYPE_LABELS[t],
              value: t,
            })),
          ),
      ),
  );

  return cmd;
}

/** Map notification type to the DB field name. */
const TYPE_TO_FIELD: Record<string, string> = {
  brief: 'briefAccountId',
  nudge: 'nudgeAccountId',
  session_alert: 'sessionAlertAccountId',
  level_up: 'levelUpAccountId',
};

/**
 * Register the /notifications command with the module context.
 */
export function registerNotificationsCommands(ctx: ModuleContext): void {
  ctx.commands.register('notifications', buildNotificationsCommand(), handleNotifications);
}

/**
 * Handle the /notifications interaction.
 */
async function handleNotifications(
  interaction: ChatInputCommandInteraction,
  ctx: ModuleContext,
): Promise<void> {
  const db = ctx.db as ExtendedPrismaClient;
  const subcommand = interaction.options.getSubcommand(true);

  // Look up member from Discord account
  const discordId = interaction.user.id;
  const account = await db.discordAccount.findUnique({
    where: { discordId },
    include: { member: true },
  });

  if (!account) {
    await interaction.reply({
      content: 'Run /setup first to create your profile.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const memberId = account.memberId;

  switch (subcommand) {
    case 'view':
      await handleView(interaction, db, memberId);
      break;
    case 'set':
      await handleSet(interaction, db, memberId);
      break;
    case 'reset':
      await handleReset(interaction, db, memberId);
      break;
  }
}

/**
 * /notifications view -- show current routing preferences.
 */
async function handleView(
  interaction: ChatInputCommandInteraction,
  db: ExtendedPrismaClient,
  memberId: string,
): Promise<void> {
  const prefs = await db.notificationPreference.findUnique({
    where: { memberId },
  });

  const embed = new EmbedBuilder()
    .setColor(BRAND_COLORS.info)
    .setTitle('Notification Routing')
    .setDescription(
      'Which Discord account receives each notification type.\n' +
      'Use `/notifications set` to change routing.',
    );

  for (const type of ROUTABLE_TYPES) {
    const fieldName = TYPE_TO_FIELD[type];
    const accountId = prefs
      ? (prefs as Record<string, unknown>)[fieldName] as string | null
      : null;

    const value = accountId
      ? `<@${accountId}>`
      : 'Default (primary account)';

    embed.addFields({
      name: NOTIFICATION_TYPE_LABELS[type],
      value,
      inline: true,
    });
  }

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

/**
 * /notifications set -- route a type to a specific linked account.
 */
async function handleSet(
  interaction: ChatInputCommandInteraction,
  db: ExtendedPrismaClient,
  memberId: string,
): Promise<void> {
  const type = interaction.options.getString('type', true) as NotificationType;
  const targetUser = interaction.options.getUser('account', true);
  const targetDiscordId = targetUser.id;

  // Verify the target account is linked to the same member
  const linkedAccount = await db.discordAccount.findUnique({
    where: { discordId: targetDiscordId },
  });

  if (!linkedAccount || linkedAccount.memberId !== memberId) {
    await interaction.reply({
      content: "That account isn't linked to your profile. Use `/link` to connect accounts first.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Upsert notification preference
  const fieldName = TYPE_TO_FIELD[type];
  await db.notificationPreference.upsert({
    where: { memberId },
    create: {
      memberId,
      [fieldName]: targetDiscordId,
    },
    update: {
      [fieldName]: targetDiscordId,
    },
  });

  const label = NOTIFICATION_TYPE_LABELS[type];
  await interaction.reply({
    content: `**${label}** will now be sent to <@${targetDiscordId}>.`,
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * /notifications reset -- clear routing for a type (back to default).
 */
async function handleReset(
  interaction: ChatInputCommandInteraction,
  db: ExtendedPrismaClient,
  memberId: string,
): Promise<void> {
  const type = interaction.options.getString('type', true) as NotificationType;
  const fieldName = TYPE_TO_FIELD[type];

  // Only update if preference exists
  const existing = await db.notificationPreference.findUnique({
    where: { memberId },
  });

  if (existing) {
    await db.notificationPreference.update({
      where: { memberId },
      data: { [fieldName]: null },
    });
  }

  const label = NOTIFICATION_TYPE_LABELS[type];
  await interaction.reply({
    content: `**${label}** reset to default (primary account).`,
    flags: MessageFlags.Ephemeral,
  });
}
