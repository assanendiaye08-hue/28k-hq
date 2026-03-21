/**
 * Leaderboard Renderer
 *
 * Embed builders for each leaderboard dimension.
 * Clean, compact "gym scoreboard" aesthetic -- glanceable data.
 *
 * Medal emojis for top 3, numbered list for the rest.
 * Footer shows refresh interval and timestamp.
 */

import { EmbedBuilder } from 'discord.js';
import { BRAND_COLORS } from '@28k/shared';
import type { LeaderboardEntry } from './calculator.js';

/**
 * Get medal emoji for a leaderboard position.
 * Top 3 get gold/silver/bronze medals; rest get their number.
 */
function getMedalEmoji(position: number): string {
  switch (position) {
    case 1: return '\u{1F947}'; // gold medal
    case 2: return '\u{1F948}'; // silver medal
    case 3: return '\u{1F949}'; // bronze medal
    default: return `${position}.`;
  }
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
 * Build the XP leaderboard embed.
 *
 * Color: amber/gold (brand primary).
 * Shows XP values with locale-formatted numbers.
 */
export function buildXPLeaderboardEmbed(
  entries: LeaderboardEntry[],
  seasonLabel?: string,
): EmbedBuilder {
  const title = seasonLabel
    ? `XP Leaderboard -- ${seasonLabel}`
    : 'XP Leaderboard';

  const description = entries.length > 0
    ? entries
        .map(
          (e) =>
            `${getMedalEmoji(e.position)} **${e.position}. ${e.displayName}** -- ${e.value.toLocaleString()} XP`,
        )
        .join('\n')
    : '*No XP data yet. Start checking in!*';

  return new EmbedBuilder()
    .setColor(BRAND_COLORS.primary)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: 'Updated every 15 minutes' })
    .setTimestamp();
}

/**
 * Build the voice hours leaderboard embed.
 *
 * Color: blue (info).
 * Shows duration in human-readable "Xh Ym" format.
 */
export function buildVoiceLeaderboardEmbed(
  entries: LeaderboardEntry[],
  seasonLabel?: string,
): EmbedBuilder {
  const title = seasonLabel
    ? `Voice Hours Leaderboard -- ${seasonLabel}`
    : 'Voice Hours Leaderboard';

  const description = entries.length > 0
    ? entries
        .map(
          (e) =>
            `${getMedalEmoji(e.position)} **${e.position}. ${e.displayName}** -- ${formatDuration(e.value)}`,
        )
        .join('\n')
    : '*No voice sessions yet. Join a Lock In channel!*';

  return new EmbedBuilder()
    .setColor(BRAND_COLORS.info)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: 'Updated every 15 minutes' })
    .setTimestamp();
}

/**
 * Build the streak leaderboard embed.
 *
 * Color: green (success).
 * Shows streak in days with fire emoji for streaks >= 7.
 */
export function buildStreakLeaderboardEmbed(
  entries: LeaderboardEntry[],
): EmbedBuilder {
  const description = entries.length > 0
    ? entries
        .map((e) => {
          const fire = e.value >= 7 ? ' \u{1F525}' : '';
          return `${getMedalEmoji(e.position)} **${e.position}. ${e.displayName}** -- ${e.value} days${fire}`;
        })
        .join('\n')
    : '*No active streaks yet. Check in daily to start yours!*';

  return new EmbedBuilder()
    .setColor(BRAND_COLORS.success)
    .setTitle('Streak Leaderboard')
    .setDescription(description)
    .setFooter({ text: 'Updated every 15 minutes' })
    .setTimestamp();
}
