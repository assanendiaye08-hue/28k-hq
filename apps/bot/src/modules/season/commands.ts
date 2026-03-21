/**
 * /season Slash Command
 *
 * View season standings and history.
 *
 * - No argument or current season number: Shows live standings (in progress)
 * - Past season number: Shows archived snapshots (final standings)
 *
 * All replies are ephemeral -- personal query, doesn't clutter chat.
 */

import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { ModuleContext } from '../../shared/types.js';
import type { ExtendedPrismaClient } from '@28k/db';
import { BRAND_COLORS } from '@28k/shared';
import {
  getActiveSeason,
  getSeasonSummary,
} from './manager.js';
import {
  getXPLeaderboard,
  getVoiceLeaderboard,
  getStreakLeaderboard,
} from '../leaderboard/calculator.js';
import { CHAMPION_ROLE_COLOR, SEASON_DURATION_DAYS } from './constants.js';

/**
 * Build the /season slash command definition.
 *
 * Optional integer "number" parameter: view a specific season.
 * Defaults to the current active season.
 */
export function buildSeasonCommand(): SlashCommandBuilder {
  const cmd = new SlashCommandBuilder()
    .setName('season')
    .setDescription('View season standings and history');

  cmd.addIntegerOption((opt) =>
    opt
      .setName('number')
      .setDescription('Season number to view (defaults to current)')
      .setRequired(false)
      .setMinValue(1),
  );

  return cmd;
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
 * Handle the /season interaction.
 */
export async function handleSeason(
  interaction: ChatInputCommandInteraction,
  ctx: ModuleContext,
): Promise<void> {
  const db = ctx.db as ExtendedPrismaClient;

  await interaction.deferReply({ ephemeral: true });

  const requestedNumber = interaction.options.getInteger('number');

  // Determine which season to show
  const activeSeason = await getActiveSeason(db);

  if (!requestedNumber && !activeSeason) {
    await interaction.editReply({ content: 'No seasons have started yet.' });
    return;
  }

  const seasonNumber = requestedNumber ?? activeSeason!.number;
  const isCurrentSeason = activeSeason && seasonNumber === activeSeason.number;

  if (isCurrentSeason) {
    // Show live standings for the active season
    await showActiveSeason(interaction, db, activeSeason!);
  } else {
    // Show archived standings from snapshots
    await showArchivedSeason(interaction, db, seasonNumber);
  }
}

/**
 * Show live standings for the currently active season.
 * Queries calculator functions directly (not from snapshots).
 */
async function showActiveSeason(
  interaction: ChatInputCommandInteraction,
  db: ExtendedPrismaClient,
  season: { id: string; number: number; startedAt: Date; endedAt: Date | null },
): Promise<void> {
  const now = new Date();
  const seasonOptions = {
    seasonStart: season.startedAt,
    seasonEnd: now,
  };

  // Query live data
  const [xpEntries, voiceEntries, streakEntries] = await Promise.all([
    getXPLeaderboard(db, seasonOptions),
    getVoiceLeaderboard(db, seasonOptions),
    getStreakLeaderboard(db),
  ]);

  // Calculate time remaining
  const elapsed = now.getTime() - season.startedAt.getTime();
  const daysElapsed = Math.floor(elapsed / (1000 * 60 * 60 * 24));
  const daysRemaining = Math.max(0, SEASON_DURATION_DAYS - daysElapsed);

  const embed = new EmbedBuilder()
    .setColor(BRAND_COLORS.primary)
    .setTitle(`Season ${season.number} -- In Progress`)
    .setDescription(`${daysRemaining} days remaining`);

  // Top 5 XP
  if (xpEntries.length > 0) {
    embed.addFields({
      name: '\u{1F3C6} XP Rankings',
      value: xpEntries
        .slice(0, 5)
        .map(
          (e) =>
            `${e.position}. **${e.displayName}** -- ${e.value.toLocaleString()} XP`,
        )
        .join('\n'),
      inline: false,
    });
  }

  // Top 5 Voice
  if (voiceEntries.length > 0) {
    embed.addFields({
      name: '\u{1F3A7} Voice Hours',
      value: voiceEntries
        .slice(0, 5)
        .map(
          (e) =>
            `${e.position}. **${e.displayName}** -- ${formatDuration(e.value)}`,
        )
        .join('\n'),
      inline: false,
    });
  }

  // Top 5 Streaks
  if (streakEntries.length > 0) {
    embed.addFields({
      name: '\u{1F525} Streaks (Lifetime)',
      value: streakEntries
        .slice(0, 5)
        .map(
          (e) =>
            `${e.position}. **${e.displayName}** -- ${e.value} days`,
        )
        .join('\n'),
      inline: false,
    });
  }

  const startDate = season.startedAt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  embed.setFooter({
    text: `Started: ${startDate} | ${SEASON_DURATION_DAYS}-day season`,
  });

  embed.setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

/**
 * Show archived standings for a past season from snapshots.
 */
async function showArchivedSeason(
  interaction: ChatInputCommandInteraction,
  db: ExtendedPrismaClient,
  seasonNumber: number,
): Promise<void> {
  const summary = await getSeasonSummary(db, seasonNumber);

  if (!summary) {
    await interaction.editReply({
      content: `Season ${seasonNumber} not found.`,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(CHAMPION_ROLE_COLOR)
    .setTitle(`Season ${seasonNumber} -- Final Standings`);

  // Champions
  if (summary.xpRankings.length > 0) {
    const champ = summary.xpRankings[0];
    embed.addFields({
      name: '\u{1F3C6} XP Champion',
      value: `**${champ.displayName}** -- ${champ.value.toLocaleString()} XP`,
      inline: true,
    });
  }

  if (summary.voiceRankings.length > 0) {
    const champ = summary.voiceRankings[0];
    embed.addFields({
      name: '\u{1F3A7} Voice Champion',
      value: `**${champ.displayName}** -- ${formatDuration(champ.value)}`,
      inline: true,
    });
  }

  if (summary.streakRankings.length > 0) {
    const champ = summary.streakRankings[0];
    embed.addFields({
      name: '\u{1F525} Streak Champion',
      value: `**${champ.displayName}** -- ${champ.value} days`,
      inline: true,
    });
  }

  // Top 5 lists
  if (summary.xpRankings.length > 0) {
    embed.addFields({
      name: 'Top 5 XP',
      value: summary.xpRankings
        .slice(0, 5)
        .map(
          (e) =>
            `${e.position}. ${e.displayName} -- ${e.value.toLocaleString()} XP`,
        )
        .join('\n'),
      inline: false,
    });
  }

  if (summary.voiceRankings.length > 0) {
    embed.addFields({
      name: 'Top 5 Voice Hours',
      value: summary.voiceRankings
        .slice(0, 5)
        .map(
          (e) =>
            `${e.position}. ${e.displayName} -- ${formatDuration(e.value)}`,
        )
        .join('\n'),
      inline: false,
    });
  }

  if (summary.streakRankings.length > 0) {
    embed.addFields({
      name: 'Top 5 Streaks',
      value: summary.streakRankings
        .slice(0, 5)
        .map(
          (e) =>
            `${e.position}. ${e.displayName} -- ${e.value} days`,
        )
        .join('\n'),
      inline: false,
    });
  }

  // Footer with season date range
  const startDate = summary.season.startedAt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const endDate = summary.season.endedAt
    ? summary.season.endedAt.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Present';

  embed.setFooter({
    text: `Season ran: ${startDate} -- ${endDate} (${SEASON_DURATION_DAYS} days)`,
  });

  await interaction.editReply({ embeds: [embed] });
}
