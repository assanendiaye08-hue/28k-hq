/**
 * Hall of Fame
 *
 * Manages the #hall-of-fame channel with permanent pinned season summaries.
 * Each season gets a rich embed with champions and top 5 in each dimension.
 *
 * The channel is created on bot ready if it doesn't exist, with read-only
 * permissions (everyone can read, only bot can send).
 */

import {
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  type Client,
  type TextChannel,
} from 'discord.js';
import type { ExtendedPrismaClient } from '@28k/db';
import {
  HALL_OF_FAME_CHANNEL_NAME,
  HALL_OF_FAME_CATEGORY_NAME,
  CHAMPION_ROLE_COLOR,
  SEASON_DURATION_DAYS,
} from './constants.js';

/** Snapshot shape from Prisma query. */
interface Snapshot {
  id: string;
  seasonId: string;
  memberId: string;
  dimension: string;
  position: number;
  value: number;
}

/** Season shape from Prisma query. */
interface SeasonData {
  id: string;
  number: number;
  startedAt: Date;
  endedAt: Date | null;
  active: boolean;
}

/**
 * Initialize the #hall-of-fame channel.
 *
 * Finds or creates it under "The Hub" category with read-only permissions.
 * Returns the channel for future use.
 */
export async function initHallOfFame(
  client: Client,
): Promise<TextChannel | null> {
  const guild = client.guilds.cache.first();
  if (!guild) return null;

  // Find THE GRIND category and Member role for gating
  const category = guild.channels.cache.find(
    (ch) =>
      ch.name === HALL_OF_FAME_CATEGORY_NAME &&
      ch.type === ChannelType.GuildCategory,
  );
  const memberRole = guild.roles.cache.find((r) => r.name === 'Member');

  // Look for existing channel
  const existing = guild.channels.cache.find(
    (ch) =>
      ch.name === HALL_OF_FAME_CHANNEL_NAME &&
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
    name: HALL_OF_FAME_CHANNEL_NAME,
    type: ChannelType.GuildText,
    parent: category?.id,
    topic: 'Permanent season standings -- the legends live here',
    permissionOverwrites: overwrites,
  });

  return channel;
}

/**
 * Format minutes into human-readable "Xh Ym" format.
 */
function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/**
 * Post a season summary embed to #hall-of-fame and pin it.
 *
 * Builds a rich embed with:
 * - Champions for each dimension (XP, voice, streaks)
 * - Top 5 lists for each dimension
 * - Season date range in footer
 *
 * The message is pinned for permanent bragging rights.
 */
export async function postSeasonSummary(
  client: Client,
  _db: ExtendedPrismaClient,
  season: SeasonData,
  snapshots: Snapshot[],
): Promise<void> {
  const guild = client.guilds.cache.first();
  if (!guild) return;

  // Find the hall-of-fame channel
  let channel = guild.channels.cache.find(
    (ch) =>
      ch.name === HALL_OF_FAME_CHANNEL_NAME &&
      ch.type === ChannelType.GuildText,
  ) as TextChannel | undefined;

  // Create if it doesn't exist
  if (!channel) {
    channel = (await initHallOfFame(client)) ?? undefined;
    if (!channel) return;
  }

  // Group snapshots by dimension, sorted by position
  const xpSnapshots = snapshots
    .filter((s) => s.dimension === 'xp')
    .sort((a, b) => a.position - b.position);
  const voiceSnapshots = snapshots
    .filter((s) => s.dimension === 'voice')
    .sort((a, b) => a.position - b.position);
  const streakSnapshots = snapshots
    .filter((s) => s.dimension === 'streaks')
    .sort((a, b) => a.position - b.position);

  // Fetch display names for all members
  const memberIds = [...new Set(snapshots.map((s) => s.memberId))];
  const members = await _db.member.findMany({
    where: { id: { in: memberIds } },
    select: { id: true, displayName: true },
  });
  const nameMap = new Map(members.map((m) => [m.id, m.displayName]));
  const getName = (memberId: string) => nameMap.get(memberId) ?? 'Unknown';

  // Build the embed
  const embed = new EmbedBuilder()
    .setColor(CHAMPION_ROLE_COLOR)
    .setTitle(`Season ${season.number} -- Final Standings`)
    .setThumbnail(guild.iconURL() ?? null);

  // Champion fields (top 1 in each dimension)
  if (xpSnapshots.length > 0) {
    const champ = xpSnapshots[0];
    embed.addFields({
      name: '\u{1F3C6} XP Champion',
      value: `**${getName(champ.memberId)}** -- ${champ.value.toLocaleString()} XP`,
      inline: true,
    });
  }

  if (voiceSnapshots.length > 0) {
    const champ = voiceSnapshots[0];
    embed.addFields({
      name: '\u{1F3A7} Voice Champion',
      value: `**${getName(champ.memberId)}** -- ${formatDuration(champ.value)}`,
      inline: true,
    });
  }

  if (streakSnapshots.length > 0) {
    const champ = streakSnapshots[0];
    embed.addFields({
      name: '\u{1F525} Streak Champion',
      value: `**${getName(champ.memberId)}** -- ${champ.value} days`,
      inline: true,
    });
  }

  // Top 5 lists
  const top5XP = xpSnapshots.slice(0, 5);
  if (top5XP.length > 0) {
    embed.addFields({
      name: 'Top 5 XP',
      value: top5XP
        .map(
          (s, i) =>
            `${i + 1}. ${getName(s.memberId)} -- ${s.value.toLocaleString()} XP`,
        )
        .join('\n'),
      inline: false,
    });
  }

  const top5Voice = voiceSnapshots.slice(0, 5);
  if (top5Voice.length > 0) {
    embed.addFields({
      name: 'Top 5 Voice Hours',
      value: top5Voice
        .map(
          (s, i) =>
            `${i + 1}. ${getName(s.memberId)} -- ${formatDuration(s.value)}`,
        )
        .join('\n'),
      inline: false,
    });
  }

  const top5Streaks = streakSnapshots.slice(0, 5);
  if (top5Streaks.length > 0) {
    embed.addFields({
      name: 'Top 5 Streaks',
      value: top5Streaks
        .map(
          (s, i) =>
            `${i + 1}. ${getName(s.memberId)} -- ${s.value} days`,
        )
        .join('\n'),
      inline: false,
    });
  }

  // Footer with season date range
  const startDate = season.startedAt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const endDate = season.endedAt
    ? season.endedAt.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Present';

  embed.setFooter({
    text: `Season ran: ${startDate} -- ${endDate} (${SEASON_DURATION_DAYS} days)`,
  });

  // Send and pin the message
  const message = await channel.send({ embeds: [embed] });

  try {
    await message.pin();
  } catch {
    // Pinning might fail if channel has 50 pins (Discord limit) -- not critical
  }
}
