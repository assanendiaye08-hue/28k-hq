/**
 * /leaderboard Slash Command
 *
 * On-demand leaderboard view with the viewer's own position.
 * Public replies (not ephemeral) -- leaderboard checks are social.
 *
 * Options:
 * - type (required): xp | voice | streaks
 *
 * Shows the top 10 for the selected dimension. If the invoking
 * member is not in the top 10, appends a "Your Position" field.
 */

import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { ModuleContext } from '../../shared/types.js';
import type { ExtendedPrismaClient } from '@28k/db';
import {
  getXPLeaderboard,
  getVoiceLeaderboard,
  getStreakLeaderboard,
  getMemberPosition,
} from './calculator.js';
import {
  buildXPLeaderboardEmbed,
  buildVoiceLeaderboardEmbed,
  buildStreakLeaderboardEmbed,
} from './renderer.js';

/**
 * Build the /leaderboard slash command definition.
 */
export function buildLeaderboardCommand(): SlashCommandBuilder {
  const cmd = new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View the server leaderboard');

  cmd.addStringOption((opt) =>
    opt
      .setName('type')
      .setDescription('Which leaderboard to view')
      .setRequired(true)
      .addChoices(
        { name: 'XP', value: 'xp' },
        { name: 'Voice Hours', value: 'voice' },
        { name: 'Streaks', value: 'streaks' },
      ),
  );

  return cmd;
}

/**
 * Handle the /leaderboard interaction.
 */
export async function handleLeaderboard(
  interaction: ChatInputCommandInteraction,
  ctx: ModuleContext,
): Promise<void> {
  const db = ctx.db as ExtendedPrismaClient;

  await interaction.deferReply();

  const type = interaction.options.getString('type', true) as 'xp' | 'voice' | 'streaks';

  // Resolve the invoking member
  const account = await db.discordAccount.findUnique({
    where: { discordId: interaction.user.id },
    include: { member: { select: { id: true, displayName: true } } },
  });

  // Get active season
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

  // Query and build the appropriate leaderboard
  let embed;
  let entries;

  switch (type) {
    case 'xp': {
      entries = await getXPLeaderboard(db, seasonOptions);
      embed = buildXPLeaderboardEmbed(entries, seasonLabel);
      break;
    }
    case 'voice': {
      entries = await getVoiceLeaderboard(db, seasonOptions);
      embed = buildVoiceLeaderboardEmbed(entries, seasonLabel);
      break;
    }
    case 'streaks': {
      entries = await getStreakLeaderboard(db);
      embed = buildStreakLeaderboardEmbed(entries);
      break;
    }
  }

  // If the member is registered and not in the top 10, show their position
  if (account?.member) {
    const memberId = account.member.id;
    const isInTop = entries.some((e) => e.memberId === memberId);

    if (!isInTop) {
      const position = await getMemberPosition(db, memberId, type, seasonOptions);

      // Get the member's own value for context
      let valueLabel: string;
      if (type === 'xp') {
        const member = await db.member.findUnique({
          where: { id: memberId },
          select: { totalXp: true },
        });
        valueLabel = `${(member?.totalXp ?? 0).toLocaleString()} XP`;
      } else if (type === 'voice') {
        const voiceSum = await db.voiceSession.aggregate({
          where: {
            memberId,
            endedAt: { not: null },
            durationMinutes: { not: null },
            ...(seasonOptions?.seasonStart
              ? { startedAt: { gte: seasonOptions.seasonStart } }
              : {}),
          },
          _sum: { durationMinutes: true },
        });
        const mins = voiceSum._sum.durationMinutes ?? 0;
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        valueLabel = h > 0 ? `${h}h ${m}m` : `${m}m`;
      } else {
        const member = await db.member.findUnique({
          where: { id: memberId },
          select: { currentStreak: true },
        });
        valueLabel = `${member?.currentStreak ?? 0} days`;
      }

      embed.addFields({
        name: 'Your Position',
        value: `#${position} with ${valueLabel}`,
      });
    }
  }

  await interaction.editReply({ embeds: [embed] });
}
