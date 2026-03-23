/**
 * Announce-update slash command.
 *
 * /announce-update version download_url [notes] -- Post an update announcement
 */

import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  ChannelType,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { ModuleContext } from '../../shared/types.js';
import { isOwner } from '../../shared/permissions.js';

// ─── Command Builder ────────────────────────────────────────────────────────────

/**
 * Build the /announce-update slash command definition.
 */
export function buildAnnounceUpdateCommand(): SlashCommandBuilder {
  return new SlashCommandBuilder()
    .setName('announce-update')
    .setDescription('Post a desktop app update announcement')
    .addStringOption((opt) =>
      opt
        .setName('version')
        .setDescription('Version number (e.g. 1.2.0)')
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName('download_url')
        .setDescription('Download URL for the new version')
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName('notes')
        .setDescription('Release notes / what\'s new')
        .setRequired(false),
    ) as SlashCommandBuilder;
}

// ─── Command Handler ────────────────────────────────────────────────────────────

/**
 * Handle the /announce-update slash command.
 */
export async function handleAnnounceUpdateCommand(
  interaction: ChatInputCommandInteraction,
  ctx: ModuleContext,
): Promise<void> {
  // Owner-only gate (supports linked multi-accounts)
  if (!(await isOwner(interaction.user.id, ctx.db))) {
    await interaction.reply({
      content: 'Only the owner can use this command.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const version = interaction.options.getString('version', true).trim();
  const downloadUrl = interaction.options.getString('download_url', true).trim();
  const notes = interaction.options.getString('notes')?.trim() || null;

  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({
      content: 'This command can only be used in a server.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Find an announcements or general channel
  const targetChannel = guild.channels.cache.find(
    (ch) =>
      ch.type === ChannelType.GuildText &&
      (ch.name === 'announcements' || ch.name === 'general'),
  );

  if (!targetChannel || !targetChannel.isTextBased()) {
    await interaction.reply({
      content: 'Could not find an #announcements or #general channel in this server.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Build the embed
  const embed = new EmbedBuilder()
    .setColor(0xf59e0b)
    .setTitle(`🔔 28K HQ Desktop v${version}`)
    .setDescription('New version of the desktop app. Download and install below.');

  if (notes) {
    embed.addFields({ name: "What's New", value: notes });
  }

  embed.addFields(
    {
      name: 'Download',
      value: `**[Download here](${downloadUrl})**\nMac M-chip: \`aarch64.dmg\` · Mac Intel: \`x64.dmg\` · Windows: \`x64_en-US.msi\``,
    },
    {
      name: 'Mac Install',
      value: '1. Open `.dmg`, drag to Applications\n2. Open **Terminal**, paste: `xattr -cr /Applications/28K\\ HQ.app`\n3. Launch from Applications',
    },
    {
      name: 'Windows Install',
      value: '1. Open `.msi` file\n2. SmartScreen? Click **More info** then **Run anyway**\n3. Launch from Start menu',
    },
    {
      name: 'First Launch',
      value: 'Click **Login with Discord** and authorize. Timer lives in your menu bar.',
    },
  );

  embed.setFooter({ text: 'Questions? DM me (the bot) — I\'ll help.' });

  try {
    if (targetChannel.isTextBased() && 'send' in targetChannel) {
      await (targetChannel as { send: (opts: { embeds: EmbedBuilder[] }) => Promise<unknown> }).send({ embeds: [embed] });
    }

    await interaction.reply({
      content: 'Update announcement posted!',
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    ctx.logger.error(`[announce-update] Failed to send announcement: ${String(error)}`);
    await interaction.reply({
      content: 'Failed to post the announcement. Check bot permissions.',
      flags: MessageFlags.Ephemeral,
    });
  }
}
