/**
 * Permission helper utilities for Discord channel access control.
 *
 * These functions apply permission overwrites to channels for:
 * - Gating channels behind a role (e.g., Member role gates all non-welcome channels)
 * - Making channels read-only (e.g., #welcome for @everyone)
 * - Creating private channel overwrites (e.g., private member spaces)
 */

import {
  type GuildChannel,
  type Guild,
  type Role,
  PermissionFlagsBits,
} from 'discord.js';

/**
 * Gate a channel behind a role by denying @everyone ViewChannel
 * and allowing the specified role ViewChannel.
 *
 * @param channel - The channel to gate
 * @param role - The role required to view the channel
 */
export async function gateChannelBehindRole(
  channel: GuildChannel,
  role: Role,
): Promise<void> {
  // Deny @everyone view access
  await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
    ViewChannel: false,
  });

  // Allow specified role view access
  await channel.permissionOverwrites.edit(role, {
    ViewChannel: true,
  });
}

/**
 * Make a channel read-only for @everyone: they can view and read history,
 * but cannot send messages. Optionally allow a specific role to send messages.
 *
 * @param channel - The channel to make read-only
 * @param guild - The guild the channel belongs to
 * @param allowSendRole - Optional role that can still send messages (e.g., bot role)
 */
export async function makeChannelReadOnly(
  channel: GuildChannel,
  guild: Guild,
  allowSendRole?: Role,
): Promise<void> {
  // @everyone can view but not send
  await channel.permissionOverwrites.edit(guild.roles.everyone, {
    ViewChannel: true,
    ReadMessageHistory: true,
    SendMessages: false,
  });

  // Allow specified role to send messages
  if (allowSendRole) {
    await channel.permissionOverwrites.edit(allowSendRole, {
      ViewChannel: true,
      SendMessages: true,
      EmbedLinks: true,
    });
  }
}

/**
 * Create permission overwrites for a private member channel.
 * Only the member and the bot can see the channel; @everyone is denied.
 *
 * @param channel - The private channel
 * @param memberId - The Discord user ID of the member
 * @param botId - The Discord user ID of the bot
 */
export async function createPrivateOverwrite(
  channel: GuildChannel,
  memberId: string,
  botId: string,
): Promise<void> {
  // Deny @everyone
  await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
    ViewChannel: false,
  });

  // Allow the member
  await channel.permissionOverwrites.edit(memberId, {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
    AttachFiles: true,
    EmbedLinks: true,
  });

  // Allow the bot
  await channel.permissionOverwrites.edit(botId, {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
    ManageMessages: true,
  });
}
