/**
 * Private channel creation for members who choose CHANNEL as their space type.
 *
 * Creates a text channel named `space-{username}` under the PRIVATE SPACES category.
 * Permission overwrites ensure only the member and the bot can see the channel.
 */

import {
  type Guild,
  type GuildMember,
  type TextChannel,
  type CategoryChannel,
  ChannelType,
  PermissionFlagsBits,
} from 'discord.js';

/**
 * Create a private channel for a member under the PRIVATE SPACES category.
 *
 * @param guild - The Discord guild
 * @param member - The guild member who will own this channel
 * @param botId - The bot's Discord user ID
 * @returns The created text channel
 */
export async function createPrivateChannel(
  guild: Guild,
  member: GuildMember,
  botId: string,
): Promise<TextChannel> {
  // Find the PRIVATE SPACES category
  const category = guild.channels.cache.find(
    (ch) => ch.type === ChannelType.GuildCategory && ch.name === 'PRIVATE SPACES',
  ) as CategoryChannel | undefined;

  if (!category) {
    throw new Error('PRIVATE SPACES category not found -- server setup must run first');
  }

  // Create the private channel with permission overwrites
  const channelName = `space-${member.user.username.toLowerCase().replace(/[^a-z0-9-]/g, '')}`;

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: category,
    reason: `Private space for ${member.user.tag}`,
    permissionOverwrites: [
      {
        // Deny @everyone
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        // Allow the member
        id: member.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks,
        ],
      },
      {
        // Allow the bot
        id: botId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageMessages,
        ],
      },
    ],
  });

  // Send initial message
  await channel.send(
    "This is your private space. Your goals, progress, and AI conversations live here. " +
    "Only you and I can see this channel.",
  );

  return channel;
}
