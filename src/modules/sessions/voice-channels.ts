/**
 * Voice Channel Lifecycle for Lock-In Sessions
 *
 * Creates and deletes temporary voice channels under the "Lock In" category.
 * Channels created here are automatically tracked by the voice-tracker module
 * for time-based XP (the session module does NOT handle voice XP).
 *
 * Private sessions use permission overwrites to restrict access.
 * Public sessions are open to everyone.
 */

import {
  type Guild,
  type VoiceChannel,
  ChannelType,
  PermissionFlagsBits,
  type OverwriteResolvable,
} from 'discord.js';
import { VOICE_CATEGORY_NAME } from '../voice-tracker/constants.js';
import { SESSION_CHANNEL_PREFIX } from './constants.js';

/**
 * Create a temporary voice channel for a lock-in session.
 *
 * The channel is placed under the "Lock In" category so voice-tracker
 * automatically tracks XP for all members in it.
 *
 * @param guild - The Discord guild
 * @param sessionTitle - Title of the session (used in channel name for scheduled)
 * @param creatorDiscordId - Discord ID of the session creator
 * @param inviteeDiscordIds - Discord IDs of invited members
 * @param isPublic - Whether the session is public (everyone can join)
 * @param botId - The bot's Discord user ID
 * @param creatorUsername - Creator's Discord username (for channel naming)
 * @returns The created voice channel
 */
export async function createSessionVoiceChannel(
  guild: Guild,
  sessionTitle: string,
  creatorDiscordId: string,
  inviteeDiscordIds: string[],
  isPublic: boolean,
  botId: string,
  creatorUsername?: string,
): Promise<VoiceChannel> {
  // Find the "Lock In" voice category
  const category = guild.channels.cache.find(
    (ch) => ch.type === ChannelType.GuildCategory && ch.name === VOICE_CATEGORY_NAME,
  );

  if (!category) {
    throw new Error(`"${VOICE_CATEGORY_NAME}" category not found -- server setup must run first`);
  }

  // Channel name: lockin-{username} for instant, lockin-{sanitized-title} for scheduled
  const suffix = creatorUsername
    ? creatorUsername.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20)
    : sanitizeTitle(sessionTitle).slice(0, 20);
  const channelName = `${SESSION_CHANNEL_PREFIX}-${suffix}`;

  // Build permission overwrites
  const permissionOverwrites: OverwriteResolvable[] = [];

  if (!isPublic) {
    // Private: deny @everyone, allow bot + creator + each invitee
    permissionOverwrites.push({
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
    });

    permissionOverwrites.push({
      id: botId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.MoveMembers,
      ],
    });

    permissionOverwrites.push({
      id: creatorDiscordId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.MoveMembers,
      ],
    });

    for (const inviteeId of inviteeDiscordIds) {
      permissionOverwrites.push({
        id: inviteeId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.Connect,
        ],
      });
    }
  } else {
    // Public: everyone can see/join, bot gets management perms
    permissionOverwrites.push({
      id: botId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.MoveMembers,
      ],
    });
  }

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildVoice,
    parent: category.id,
    permissionOverwrites,
    reason: `Lock-in session: ${sessionTitle}`,
  });

  return channel as VoiceChannel;
}

/**
 * Delete a session voice channel. Silent if already gone.
 */
export async function deleteSessionVoiceChannel(
  guild: Guild,
  channelId: string,
): Promise<void> {
  try {
    const channel = guild.channels.cache.get(channelId);
    if (channel) {
      await channel.delete('Lock-in session ended');
    }
  } catch {
    // Channel already deleted or permissions issue -- silent
  }
}

/**
 * Add permission overwrite for a new participant mid-session (private sessions).
 */
export async function addParticipantPermission(
  guild: Guild,
  channelId: string,
  discordId: string,
): Promise<void> {
  try {
    const channel = guild.channels.cache.get(channelId);
    if (channel && channel.isVoiceBased()) {
      await (channel as VoiceChannel).permissionOverwrites.edit(discordId, {
        ViewChannel: true,
        Connect: true,
      });
    }
  } catch {
    // Permission update failed -- silent
  }
}

/**
 * Sanitize a title for use in a channel name.
 * Discord channel names: lowercase, alphanumeric + hyphens only.
 */
function sanitizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
