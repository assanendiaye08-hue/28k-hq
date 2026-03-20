/**
 * Data Privacy slash commands.
 *
 * /mydata  -- Export all stored member data as a JSON file via DM
 * /deletedata -- Permanently delete all member data with confirmation
 */

import {
  SlashCommandBuilder,
  AttachmentBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type TextChannel,
} from 'discord.js';
import type { ModuleContext } from '../../shared/types.js';
import type { ExtendedPrismaClient } from '../../db/client.js';
import { exportMemberData } from './exporter.js';
import { hardDeleteMember } from './deleter.js';
import { deliverToPrivateSpace } from '../../shared/delivery.js';
import {
  EXPORT_FILENAME_PREFIX,
  DELETE_CONFIRMATION_TIMEOUT_MS,
  DELETE_CONFIRMATION_WORD,
} from './constants.js';

// ─── /mydata Command ────────────────────────────────────────────────────────────

/**
 * Build the /mydata slash command definition.
 */
export function buildMydataCommand(): SlashCommandBuilder {
  return new SlashCommandBuilder()
    .setName('mydata')
    .setDescription('Get a copy of all your stored data as a JSON file');
}

/**
 * Handle the /mydata slash command.
 * Exports all member data and sends it via DM (with private space fallback).
 */
export async function handleMydata(
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
    const jsonBuffer = await exportMemberData(db, account.memberId);
    const timestamp = new Date().toISOString().split('T')[0];
    const member = await db.member.findUniqueOrThrow({
      where: { id: account.memberId },
      select: { displayName: true },
    });

    const attachment = new AttachmentBuilder(jsonBuffer, {
      name: `${EXPORT_FILENAME_PREFIX}-${member.displayName}-${timestamp}.json`,
    });

    // Try DM first
    let dmSent = false;
    try {
      await interaction.user.send({
        content: 'Here is all the data stored about you.',
        files: [attachment],
      });
      dmSent = true;
    } catch {
      // DMs closed -- try private space fallback
    }

    if (dmSent) {
      await interaction.editReply({
        content: 'Your data has been sent to your DMs. Check your messages!',
      });
      return;
    }

    // DM failed -- try private space channel fallback
    // Create a new attachment since the previous one may have been consumed
    const fallbackAttachment = new AttachmentBuilder(jsonBuffer, {
      name: `${EXPORT_FILENAME_PREFIX}-${member.displayName}-${timestamp}.json`,
    });

    const space = await db.privateSpace.findUnique({
      where: { memberId: account.memberId },
    });

    if (space?.channelId) {
      try {
        const channel = await ctx.client.channels.fetch(space.channelId);
        if (channel?.isTextBased()) {
          await (channel as TextChannel).send({
            content: 'Here is all the data stored about you.',
            files: [fallbackAttachment],
          });
          await interaction.editReply({
            content: 'Your data has been sent to your private channel. Check it out!',
          });
          return;
        }
      } catch {
        // Channel delivery failed too
      }
    }

    // Both DM and private space failed
    await interaction.editReply({
      content:
        "I couldn't send you the file. Please enable DMs from server members or switch to a private channel space.",
    });
  } catch (error) {
    ctx.logger.error(`[data-privacy] /mydata failed: ${String(error)}`);
    await interaction.editReply({
      content: 'Something went wrong while exporting your data. Try again.',
    });
  }
}

// ─── /deletedata Command ────────────────────────────────────────────────────────

/**
 * Build the /deletedata slash command definition.
 */
export function buildDeletedataCommand(): SlashCommandBuilder {
  return new SlashCommandBuilder()
    .setName('deletedata')
    .setDescription('Permanently delete ALL your data (cannot be undone)');
}

/**
 * Handle the /deletedata slash command.
 * Shows a serious warning and requires typing DELETE to confirm within 30 seconds.
 */
export async function handleDeletedata(
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

  // Show serious warning embed
  const warningEmbed = new EmbedBuilder()
    .setTitle('Permanent Data Deletion')
    .setDescription(
      'This will **PERMANENTLY** delete **ALL** your data:\n\n' +
        '- Profile and preferences\n' +
        '- Check-ins and goals\n' +
        '- XP and streak history\n' +
        '- Conversations with Jarvis\n' +
        '- Voice session records\n' +
        '- Schedule and settings\n' +
        '- Season snapshots\n' +
        '- Private space channel\n\n' +
        '**This cannot be undone.**\n\n' +
        `Type \`${DELETE_CONFIRMATION_WORD}\` in this channel within 30 seconds to confirm.`,
    )
    .setColor(0xff0000);

  await interaction.reply({
    embeds: [warningEmbed],
    ephemeral: true,
  });

  // Await confirmation message
  const channel = interaction.channel;
  if (!channel || !('awaitMessages' in channel)) {
    await interaction.followUp({
      content: 'Data deletion cancelled -- could not read messages in this channel.',
      ephemeral: true,
    });
    return;
  }

  try {
    const collected = await (channel as TextChannel).awaitMessages({
      filter: (m) => m.author.id === interaction.user.id,
      max: 1,
      time: DELETE_CONFIRMATION_TIMEOUT_MS,
    });

    const response = collected.first();

    if (!response || response.content !== DELETE_CONFIRMATION_WORD) {
      await interaction.followUp({
        content: 'Data deletion cancelled.',
        ephemeral: true,
      });
      // Clean up confirmation message if we can
      if (response) {
        await response.delete().catch(() => {});
      }
      return;
    }

    // Clean up the confirmation message
    await response.delete().catch(() => {});

    // Proceed with deletion
    await interaction.followUp({
      content: 'Deleting all your data...',
      ephemeral: true,
    });

    const guild = interaction.guild;
    if (!guild) {
      await interaction.followUp({
        content: 'Could not resolve server for cleanup. Please try again.',
        ephemeral: true,
      });
      return;
    }

    await hardDeleteMember(db, ctx.client, account.memberId, guild);

    await interaction.followUp({
      content:
        'All your data has been permanently deleted. Your roles have been removed. You can re-join anytime by running /setup.',
      ephemeral: true,
    });
  } catch (error) {
    // Timeout or other error
    const errorMsg = String(error);
    if (errorMsg.includes('time')) {
      await interaction.followUp({
        content: 'Data deletion cancelled -- confirmation timed out.',
        ephemeral: true,
      });
    } else {
      ctx.logger.error(`[data-privacy] /deletedata failed: ${errorMsg}`);
      await interaction.followUp({
        content: 'Something went wrong during deletion. Please try again.',
        ephemeral: true,
      });
    }
  }
}
