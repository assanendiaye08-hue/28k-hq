/**
 * Voice Tracker Embeds
 *
 * Encouraging embed for noteworthy voice sessions (>= 90 minutes).
 * Brief, one-liner energy -- not a wall of text.
 */

import { EmbedBuilder } from 'discord.js';
import { BRAND_COLORS } from '@28k/shared';

/**
 * Build an encouraging summary embed for a noteworthy voice session.
 * Kept brief and energizing -- "locked in" vibes.
 */
export function buildSessionSummaryEmbed(
  displayName: string,
  durationMinutes: number,
  xpAwarded: number,
): EmbedBuilder {
  const hours = Math.floor(durationMinutes / 60);
  const mins = durationMinutes % 60;
  const timeStr = hours > 0
    ? `${hours}h ${mins}m`
    : `${mins}m`;

  return new EmbedBuilder()
    .setColor(BRAND_COLORS.success)
    .setTitle(`${timeStr} locked in.`)
    .setDescription(`That's how you do it, ${displayName}. +${xpAwarded} XP earned.`)
    .setTimestamp();
}
