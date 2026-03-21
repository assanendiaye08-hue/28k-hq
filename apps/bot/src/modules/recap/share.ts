/**
 * Monthly recap share-to-#wins functionality.
 *
 * Builds a condensed public version of the monthly recap for posting
 * to #wins. Shows key stats + one Jarvis quote -- no personal insights,
 * reflection details, or suggestions. Social proof that motivates others.
 */

import { EmbedBuilder, ChannelType, type Client } from 'discord.js';
import type { ExtendedPrismaClient } from '@28k/db';
import { BRAND_COLORS } from '@28k/shared';
import type { MonthlyRecapData } from './aggregator.js';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) =>
      `${timestamp as string} [recap-share] ${level}: ${message as string}`),
  ),
  transports: [new winston.transports.Console()],
});

/** Channel name for wins (matches SERVER_CATEGORIES.general.channels). */
const WINS_CHANNEL = 'wins';

// ─── Public Recap Builder ───────────────────────────────────────────────────────

/**
 * Build a condensed public recap embed for posting to #wins.
 *
 * Shows only key stats + the Jarvis quote. No personal insights,
 * reflection details, or suggestions -- just social proof.
 *
 * @param stats - The member's monthly data
 * @param jarvisQuote - One-liner from the AI recap
 * @param displayName - Member's display name
 * @returns EmbedBuilder ready to send to #wins
 */
export function buildPublicRecap(
  stats: MonthlyRecapData,
  jarvisQuote: string,
  displayName: string,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(BRAND_COLORS.primary)
    .setTitle(`${displayName}'s Month in Review`)
    .setDescription(`*"${jarvisQuote}"*`)
    .setFooter({ text: 'Monthly Recap | Keep grinding' })
    .setTimestamp();

  // Only show non-zero stat fields
  const fields: Array<{ name: string; value: string; inline: boolean }> = [];

  if (stats.xp.totalEarned > 0) {
    fields.push({ name: 'XP Earned', value: stats.xp.totalEarned.toLocaleString(), inline: true });
  }
  if (stats.checkIns.count > 0) {
    fields.push({ name: 'Check-ins', value: `${stats.checkIns.count}`, inline: true });
  }
  if (stats.goals.completedCount > 0) {
    fields.push({ name: 'Goals Completed', value: `${stats.goals.completedCount}`, inline: true });
  }
  if (stats.timers.totalWorkedMs > 0) {
    const hours = (stats.timers.totalWorkedMs / 3_600_000).toFixed(1);
    fields.push({ name: 'Focus Hours', value: hours, inline: true });
  }
  if (stats.voice.totalMinutes > 0) {
    const hours = (stats.voice.totalMinutes / 60).toFixed(1);
    fields.push({ name: 'Voice Hours', value: hours, inline: true });
  }

  if (fields.length > 0) {
    embed.addFields(...fields);
  }

  return embed;
}

// ─── Share to #wins ─────────────────────────────────────────────────────────────

/**
 * Share a condensed monthly recap to the #wins channel.
 *
 * Looks up the member's display name, builds the public recap embed,
 * finds the #wins channel in the guild, and posts it.
 *
 * @param client - Discord.js client
 * @param db - Extended Prisma client
 * @param memberId - The member whose recap to share
 * @param stats - The member's monthly data
 * @param jarvisQuote - One-liner from the AI recap
 */
export async function shareToWins(
  client: Client,
  db: ExtendedPrismaClient,
  memberId: string,
  stats: MonthlyRecapData,
  jarvisQuote: string,
): Promise<void> {
  try {
    // Look up member's display name
    const member = await db.member.findUniqueOrThrow({
      where: { id: memberId },
      select: { displayName: true },
    });

    // Build condensed public embed
    const embed = buildPublicRecap(stats, jarvisQuote, member.displayName);

    // Find #wins channel in the guild
    const guild = client.guilds.cache.first();
    if (!guild) {
      logger.warn('No guild available to post recap to #wins');
      return;
    }

    const winsChannel = guild.channels.cache.find(
      (ch) => ch.name === WINS_CHANNEL && ch.type === ChannelType.GuildText,
    );

    if (!winsChannel || winsChannel.type !== ChannelType.GuildText) {
      logger.warn('Could not find #wins text channel');
      return;
    }

    await winsChannel.send({ embeds: [embed] });
    logger.info(`Shared monthly recap for ${memberId} (${member.displayName}) to #wins`);
  } catch (error) {
    logger.error(`Failed to share recap to #wins for ${memberId}: ${String(error)}`);
  }
}
