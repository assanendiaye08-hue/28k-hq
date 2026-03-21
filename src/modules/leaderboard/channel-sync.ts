/**
 * Leaderboard Channel Sync
 *
 * Manages 3 persistent messages in the #leaderboard channel.
 * Messages are edited silently (no notifications) on each refresh.
 *
 * - Auto-creates #leaderboard channel under "The Hub" category
 * - Bot-only send permissions (everyone can read)
 * - Stores message IDs in BotConfig for persistence across restarts
 * - Handles deleted messages gracefully (auto-recreate)
 */

import {
  ChannelType,
  PermissionFlagsBits,
  type Client,
  type Guild,
  type TextChannel,
  type Message,
  EmbedBuilder,
} from 'discord.js';
import type { ExtendedPrismaClient } from '../../db/client.js';
import {
  LEADERBOARD_CHANNEL_NAME,
  LEADERBOARD_CATEGORY_NAME,
  BOT_CONFIG_KEYS,
} from './constants.js';
import {
  getXPLeaderboard,
  getVoiceLeaderboard,
  getStreakLeaderboard,
} from './calculator.js';
import {
  buildXPLeaderboardEmbed,
  buildVoiceLeaderboardEmbed,
  buildStreakLeaderboardEmbed,
} from './renderer.js';

/** Stored message IDs for the three leaderboard embeds. */
interface LeaderboardMessageIds {
  xpMessageId: string | null;
  voiceMessageId: string | null;
  streakMessageId: string | null;
}

/**
 * Get a BotConfig value by key.
 */
async function getConfigValue(
  db: ExtendedPrismaClient,
  key: string,
): Promise<string | null> {
  const config = await db.botConfig.findUnique({ where: { key } });
  return config?.value ?? null;
}

/**
 * Set a BotConfig value by key (upsert).
 */
async function setConfigValue(
  db: ExtendedPrismaClient,
  key: string,
  value: string,
): Promise<void> {
  await db.botConfig.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

/**
 * Find or create the #leaderboard channel under "The Hub" category.
 *
 * Permissions:
 * - @everyone: ViewChannel (yes), SendMessages (no)
 * - Bot: SendMessages (yes), ManageMessages (yes)
 */
async function findOrCreateChannel(
  guild: Guild,
): Promise<TextChannel> {
  // Find THE GRIND category and Member role for gating
  const category = guild.channels.cache.find(
    (ch) =>
      ch.name === LEADERBOARD_CATEGORY_NAME &&
      ch.type === ChannelType.GuildCategory,
  );
  const memberRole = guild.roles.cache.find((r) => r.name === 'Member');

  // Look for existing channel
  const existing = guild.channels.cache.find(
    (ch) =>
      ch.name === LEADERBOARD_CHANNEL_NAME &&
      ch.type === ChannelType.GuildText,
  ) as TextChannel | undefined;

  if (existing) {
    // Fix permissions and parent if needed (migrate from ungated to gated)
    if (category && existing.parentId !== category.id) {
      await existing.setParent(category.id, { lockPermissions: true });
    }
    return existing;
  }

  // Create the channel gated behind Member role
  const overwrites: Array<{ id: string; deny?: bigint[]; allow?: bigint[] }> = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
    },
    {
      id: guild.client.user!.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageMessages,
      ],
    },
  ];
  if (memberRole) {
    overwrites.push({
      id: memberRole.id,
      allow: [PermissionFlagsBits.ViewChannel],
      deny: [PermissionFlagsBits.SendMessages],
    });
  }

  const channel = await guild.channels.create({
    name: LEADERBOARD_CHANNEL_NAME,
    type: ChannelType.GuildText,
    parent: category?.id,
    topic: 'Live leaderboards -- updated every 15 minutes',
    permissionOverwrites: overwrites,
  });

  return channel;
}

/**
 * Try to fetch a message by ID from a channel.
 * Returns null if the message was deleted or is not fetchable.
 */
async function tryFetchMessage(
  channel: TextChannel,
  messageId: string,
): Promise<Message | null> {
  try {
    return await channel.messages.fetch(messageId);
  } catch {
    // Message was deleted or is inaccessible
    return null;
  }
}

/**
 * Send a placeholder embed and store its message ID.
 */
async function sendAndStoreMessage(
  channel: TextChannel,
  db: ExtendedPrismaClient,
  embed: EmbedBuilder,
  configKey: string,
): Promise<Message> {
  const msg = await channel.send({ embeds: [embed] });
  await setConfigValue(db, configKey, msg.id);
  return msg;
}

/**
 * Initialize the leaderboard channel and ensure all 3 messages exist.
 *
 * For each message:
 * - If stored ID exists and message is fetchable: keep it
 * - If stored ID is missing or message was deleted: create new one
 *
 * Returns the channel for use in refresh.
 */
export async function initLeaderboardChannel(
  client: Client,
  db: ExtendedPrismaClient,
): Promise<TextChannel | null> {
  const guild = client.guilds.cache.first();
  if (!guild) return null;

  const channel = await findOrCreateChannel(guild);

  // Fetch stored message IDs
  const stored: LeaderboardMessageIds = {
    xpMessageId: await getConfigValue(db, BOT_CONFIG_KEYS.xpMessageId),
    voiceMessageId: await getConfigValue(db, BOT_CONFIG_KEYS.voiceMessageId),
    streakMessageId: await getConfigValue(db, BOT_CONFIG_KEYS.streakMessageId),
  };

  // Initial placeholder embeds
  const xpPlaceholder = buildXPLeaderboardEmbed([]);
  const voicePlaceholder = buildVoiceLeaderboardEmbed([]);
  const streakPlaceholder = buildStreakLeaderboardEmbed([]);

  // Ensure XP message
  if (stored.xpMessageId) {
    const msg = await tryFetchMessage(channel, stored.xpMessageId);
    if (!msg) {
      await sendAndStoreMessage(channel, db, xpPlaceholder, BOT_CONFIG_KEYS.xpMessageId);
    }
  } else {
    await sendAndStoreMessage(channel, db, xpPlaceholder, BOT_CONFIG_KEYS.xpMessageId);
  }

  // Ensure voice message
  if (stored.voiceMessageId) {
    const msg = await tryFetchMessage(channel, stored.voiceMessageId);
    if (!msg) {
      await sendAndStoreMessage(channel, db, voicePlaceholder, BOT_CONFIG_KEYS.voiceMessageId);
    }
  } else {
    await sendAndStoreMessage(channel, db, voicePlaceholder, BOT_CONFIG_KEYS.voiceMessageId);
  }

  // Ensure streak message
  if (stored.streakMessageId) {
    const msg = await tryFetchMessage(channel, stored.streakMessageId);
    if (!msg) {
      await sendAndStoreMessage(channel, db, streakPlaceholder, BOT_CONFIG_KEYS.streakMessageId);
    }
  } else {
    await sendAndStoreMessage(channel, db, streakPlaceholder, BOT_CONFIG_KEYS.streakMessageId);
  }

  return channel;
}

/**
 * Refresh all 3 leaderboard messages with current data.
 *
 * Fetches active season for date range, queries all 3 dimensions,
 * builds embeds, and edits the stored messages.
 *
 * If a message is gone (admin cleared channel), re-creates it via
 * the init flow and stores the new ID.
 */
export async function refreshLeaderboardMessages(
  client: Client,
  db: ExtendedPrismaClient,
): Promise<void> {
  const guild = client.guilds.cache.first();
  if (!guild) return;

  // Find the leaderboard channel
  const channel = guild.channels.cache.find(
    (ch) =>
      ch.name === LEADERBOARD_CHANNEL_NAME &&
      ch.type === ChannelType.GuildText,
  ) as TextChannel | undefined;

  if (!channel) {
    // Channel doesn't exist -- init will create it
    await initLeaderboardChannel(client, db);
    return;
  }

  // Get active season for date range
  const activeSeason = await db.season.findFirst({
    where: { active: true },
  });

  const seasonOptions = activeSeason
    ? {
        seasonStart: activeSeason.startedAt,
        seasonEnd: activeSeason.endedAt ?? new Date(),
      }
    : undefined;

  const seasonLabel = activeSeason
    ? `Season ${activeSeason.number}`
    : undefined;

  // Query all 3 dimensions
  const [xpEntries, voiceEntries, streakEntries] = await Promise.all([
    getXPLeaderboard(db, seasonOptions),
    getVoiceLeaderboard(db, seasonOptions),
    getStreakLeaderboard(db),
  ]);

  // Build embeds
  const xpEmbed = buildXPLeaderboardEmbed(xpEntries, seasonLabel);
  const voiceEmbed = buildVoiceLeaderboardEmbed(voiceEntries, seasonLabel);
  const streakEmbed = buildStreakLeaderboardEmbed(streakEntries);

  // Fetch stored message IDs
  const stored: LeaderboardMessageIds = {
    xpMessageId: await getConfigValue(db, BOT_CONFIG_KEYS.xpMessageId),
    voiceMessageId: await getConfigValue(db, BOT_CONFIG_KEYS.voiceMessageId),
    streakMessageId: await getConfigValue(db, BOT_CONFIG_KEYS.streakMessageId),
  };

  // Edit or recreate each message
  await editOrRecreate(channel, db, stored.xpMessageId, xpEmbed, BOT_CONFIG_KEYS.xpMessageId);
  await editOrRecreate(channel, db, stored.voiceMessageId, voiceEmbed, BOT_CONFIG_KEYS.voiceMessageId);
  await editOrRecreate(channel, db, stored.streakMessageId, streakEmbed, BOT_CONFIG_KEYS.streakMessageId);

  console.log(
    `Leaderboard refreshed: ${xpEntries.length} XP entries, ${voiceEntries.length} voice entries, ${streakEntries.length} streak entries`,
  );
}

/**
 * Edit an existing message or recreate it if it was deleted.
 */
async function editOrRecreate(
  channel: TextChannel,
  db: ExtendedPrismaClient,
  messageId: string | null,
  embed: EmbedBuilder,
  configKey: string,
): Promise<void> {
  if (messageId) {
    const msg = await tryFetchMessage(channel, messageId);
    if (msg) {
      await msg.edit({ embeds: [embed] });
      return;
    }
  }

  // Message missing or deleted -- recreate
  await sendAndStoreMessage(channel, db, embed, configKey);
}
