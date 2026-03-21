/**
 * Monthly recap AI generator and delivery.
 *
 * Generates a Jarvis-narrated monthly progress recap using AI with
 * adaptive depth -- rich data gets detailed narrative + suggestions,
 * thin data gets brief encouragement. Falls back to a clean template
 * when AI is unavailable.
 *
 * Delivers the recap as a branded embed via DM. Stores sent message IDs
 * in pendingRecaps Map for reaction-based sharing to #wins.
 */

import { EmbedBuilder, type Client, type Message } from 'discord.js';
import { subMonths, startOfMonth, endOfMonth, format } from 'date-fns';
import type { ExtendedPrismaClient } from '../../db/client.js';
import { callAI } from '../../shared/ai-client.js';
import { BRAND_COLORS } from '../../shared/constants.js';
import { buildSystemPrompt } from '../ai-assistant/personality.js';
import { aggregateMonthlyData, type MonthlyRecapData } from './aggregator.js';
import { MIN_DATA_THRESHOLD, RECAP_EMOJI } from './constants.js';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) =>
      `${timestamp as string} [recap] ${level}: ${message as string}`),
  ),
  transports: [new winston.transports.Console()],
});

// ─── Types ──────────────────────────────────────────────────────────────────────

/** Result of AI recap generation. */
interface RecapResult {
  narrative: string;
  stats: MonthlyRecapData;
  jarvisQuote: string;
}

/** Pending recap entry for reaction tracking. */
export interface PendingRecapEntry {
  memberId: string;
  stats: MonthlyRecapData;
  jarvisQuote: string;
}

/**
 * In-memory map of Discord message IDs to pending recap data.
 * Populated when a recap DM is sent, consumed when member reacts with trophy.
 */
export const pendingRecaps = new Map<string, PendingRecapEntry>();

// ─── Recap Generation ───────────────────────────────────────────────────────────

/**
 * Generate a monthly progress recap for a member.
 *
 * Computes the previous month's date range, aggregates data across all
 * sources, then calls AI with adaptive depth instructions. Falls back
 * to a template if AI is unavailable.
 *
 * @param db - Extended Prisma client
 * @param memberId - The member to generate a recap for
 * @returns RecapResult with narrative, stats, and jarvisQuote
 */
export async function generateRecap(
  db: ExtendedPrismaClient,
  memberId: string,
): Promise<RecapResult> {
  // Compute previous month's date range
  const now = new Date();
  const prevMonth = subMonths(now, 1);
  const monthStart = startOfMonth(prevMonth);
  const monthEnd = endOfMonth(prevMonth);

  // Aggregate all data for the month
  const stats = await aggregateMonthlyData(db, memberId, monthStart, monthEnd);

  // Determine if data is rich or thin
  const isRichData = stats.checkIns.count >= MIN_DATA_THRESHOLD;

  // Try AI generation
  try {
    const systemPrompt = await buildSystemPrompt(db, memberId);

    const depthInstruction = isRichData
      ? 'Write a detailed monthly progress recap (4-8 sentences) with 1-2 forward-looking suggestions grounded in the data. Reference actual numbers.'
      : 'Write a brief, encouraging monthly recap (2-3 sentences). The data is thin -- do not make up patterns from insufficient data. No forced suggestions.';

    const recapAddendum = `\n\n${depthInstruction} Cover patterns, growth, and areas to improve. Be specific. End with a memorable one-liner that captures their month -- wrap it in quotes on its own line, prefixed with "Quote: ".`;

    const monthName = format(prevMonth, 'MMMM yyyy');
    const userMessage = `Monthly recap data for ${monthName}:\n${JSON.stringify(stats, null, 2)}`;

    const result = await callAI(db, {
      memberId,
      feature: 'recap',
      messages: [
        { role: 'system', content: systemPrompt + recapAddendum },
        { role: 'user', content: userMessage },
      ],
    });

    if (result.degraded || !result.content || result.content.length <= 10) {
      return buildTemplateFallback(stats, prevMonth);
    }

    // Extract the Jarvis quote from the AI response
    const jarvisQuote = extractQuote(result.content);

    logger.debug(`AI recap generated for ${memberId}`);

    return {
      narrative: result.content,
      stats,
      jarvisQuote,
    };
  } catch (error) {
    logger.warn(`AI recap generation failed for ${memberId}: ${String(error)}`);
    return buildTemplateFallback(stats, prevMonth);
  }
}

/**
 * Extract the one-liner quote from the AI response.
 * Looks for a line starting with "Quote:" and extracts the quoted text.
 * Falls back to a generic quote if not found.
 */
function extractQuote(content: string): string {
  const lines = content.split('\n');
  for (const line of lines) {
    const match = line.match(/^Quote:\s*[""]?(.+?)[""]?\s*$/i);
    if (match) return match[1];
  }
  // Fallback: look for any quoted text on its own line
  for (const line of lines) {
    const match = line.match(/^[""](.+?)[""]$/);
    if (match) return match[1];
  }
  return 'Another month in the books. Keep building.';
}

/**
 * Build a template fallback when AI is unavailable.
 * Formats stats as clean text without AI personality.
 */
function buildTemplateFallback(stats: MonthlyRecapData, month: Date): RecapResult {
  const monthName = format(month, 'MMMM yyyy');
  const parts: string[] = [`Here's your ${monthName} recap.`];

  if (stats.checkIns.count > 0) {
    parts.push(`You checked in ${stats.checkIns.count} times.`);
  }
  if (stats.goals.completedCount > 0) {
    parts.push(`Completed ${stats.goals.completedCount} goals.`);
  }
  if (stats.timers.totalWorkedMs > 0) {
    const hours = (stats.timers.totalWorkedMs / 3_600_000).toFixed(1);
    parts.push(`Logged ${hours} focus hours across ${stats.timers.totalSessions} sessions.`);
  }
  if (stats.xp.totalEarned > 0) {
    parts.push(`Earned ${stats.xp.totalEarned} XP.`);
  }

  if (parts.length === 1) {
    parts.push('Quiet month -- but you showed up. That counts.');
  }

  const narrative = parts.join(' ');
  const jarvisQuote = 'Another month in the books. Keep building.';

  return { narrative, stats, jarvisQuote };
}

// ─── Recap Delivery ─────────────────────────────────────────────────────────────

/**
 * Generate and deliver a monthly recap DM to a member.
 *
 * Sends a branded embed with stat fields (only non-zero values shown)
 * and a footer prompting the member to react with trophy to share.
 * Stores the message ID in pendingRecaps for reaction tracking.
 *
 * @param client - Discord.js client
 * @param db - Extended Prisma client
 * @param memberId - The member to send the recap to
 */
export async function sendRecap(
  client: Client,
  db: ExtendedPrismaClient,
  memberId: string,
): Promise<void> {
  try {
    const { narrative, stats, jarvisQuote } = await generateRecap(db, memberId);

    // Compute month name for the title
    const prevMonth = subMonths(new Date(), 1);
    const monthLabel = format(prevMonth, 'MMMM yyyy');

    // Build embed with adaptive fields (only non-zero values)
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
    const totalReflections = stats.reflections.dailyCount + stats.reflections.weeklyCount + stats.reflections.monthlyCount;
    if (totalReflections > 0) {
      fields.push({ name: 'Reflections', value: `${totalReflections}`, inline: true });
    }

    const embed = new EmbedBuilder()
      .setColor(BRAND_COLORS.primary)
      .setTitle(`Monthly Recap -- ${monthLabel}`)
      .setDescription(narrative)
      .setFooter({ text: `React with ${RECAP_EMOJI} to share highlights to #wins` })
      .setTimestamp();

    if (fields.length > 0) {
      embed.addFields(...fields);
    }

    // Deliver via DM to the member's first linked Discord account
    const account = await db.discordAccount.findFirst({
      where: { memberId },
    });

    if (!account) {
      logger.warn(`No linked account for ${memberId}, cannot deliver recap`);
      return;
    }

    let sentMessage: Message | undefined;
    try {
      const user = await client.users.fetch(account.discordId);
      sentMessage = await user.send({ embeds: [embed] });
    } catch {
      logger.warn(`Could not DM recap to ${memberId} (DMs may be closed)`);
      return;
    }

    // Store in pendingRecaps for reaction tracking
    if (sentMessage) {
      pendingRecaps.set(sentMessage.id, {
        memberId,
        stats,
        jarvisQuote,
      });
      logger.info(`Monthly recap delivered to ${memberId}, message ${sentMessage.id} tracked for sharing`);
    }
  } catch (error) {
    logger.error(`Failed to send recap to ${memberId}: ${String(error)}`);
  }
}
