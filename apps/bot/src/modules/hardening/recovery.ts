/**
 * Bot restart recovery checks.
 *
 * Runs on every bot start (via the 'ready' event) to handle edge cases
 * that may have occurred during downtime:
 *
 * 1. Resolves expired goals (ACTIVE past deadline -> MISSED)
 * 2. Cancels stale pending sessions (scheduled 24+ hours ago)
 * 3. Checks season status for anomalies
 * 4. Posts a recovery summary embed to #bot-log (owner-only)
 *
 * All operations are best-effort -- failures are logged but never
 * prevent the bot from starting.
 */

import { type Client, type TextChannel, ChannelType, EmbedBuilder } from 'discord.js';
import type { ExtendedPrismaClient } from '@28k/db';
import type { Logger } from 'winston';
import { BRAND_COLORS } from '@28k/shared';
import { BOT_LOG_CHANNEL, BOT_OPS_CATEGORY, RECOVERY_STALE_SESSION_HOURS } from './constants.js';

/**
 * Find the #bot-log text channel under the BOT OPS category.
 * Returns null if not found (server setup may not have run yet).
 */
function findBotLogChannel(client: Client): TextChannel | null {
  for (const guild of client.guilds.cache.values()) {
    const category = guild.channels.cache.find(
      (ch) => ch.type === ChannelType.GuildCategory && ch.name === BOT_OPS_CATEGORY,
    );

    if (!category) continue;

    const channel = guild.channels.cache.find(
      (ch) =>
        ch.type === ChannelType.GuildText &&
        ch.name === BOT_LOG_CHANNEL &&
        ch.parentId === category.id,
    );

    if (channel) return channel as TextChannel;
  }

  return null;
}

/**
 * Run all recovery checks after a bot restart.
 *
 * @param client - Discord.js client (must be ready)
 * @param db - Extended Prisma client
 * @param logger - Winston logger for stdout/PM2 logging
 */
export async function runRecoveryChecks(
  client: Client,
  db: ExtendedPrismaClient,
  logger: Logger,
): Promise<void> {
  const now = new Date();
  logger.info('[hardening] Running post-restart recovery checks...');

  // 1. Find #bot-log channel
  const botLog = findBotLogChannel(client);
  if (!botLog) {
    logger.warn('[hardening] #bot-log channel not found -- recovery will log to stdout only');
  }

  // 2. Resolve expired goals (ACTIVE past deadline -> MISSED)
  // Only leaf/standalone goals -- parent goals' status follows children via cascading.
  let expiredGoalCount = 0;
  try {
    const expiredGoals = await db.goal.findMany({
      where: {
        status: 'ACTIVE',
        deadline: { lt: now },
        children: { none: {} },
      },
    });

    if (expiredGoals.length > 0) {
      await db.goal.updateMany({
        where: {
          id: { in: expiredGoals.map((g) => g.id) },
        },
        data: { status: 'MISSED' },
      });
      expiredGoalCount = expiredGoals.length;
      logger.info(`[hardening] Resolved ${expiredGoalCount} expired goal(s) to MISSED`);
    }
  } catch (error) {
    logger.error(`[hardening] Failed to check expired goals: ${String(error)}`);
  }

  // 3. Check expired seasons
  let seasonStatus = 'none';
  try {
    const activeSeason = await db.season.findFirst({
      where: { active: true },
      orderBy: { number: 'desc' },
    });

    if (activeSeason) {
      seasonStatus = `Season ${activeSeason.number}`;

      // Check for anomalous state: active=true but endedAt is in the past
      if (activeSeason.endedAt && activeSeason.endedAt < now) {
        logger.warn(
          `[hardening] Season ${activeSeason.number} has endedAt in the past but is still active. ` +
          'Season module will handle transition on its next daily check.',
        );
        seasonStatus = `Season ${activeSeason.number} (needs transition)`;
      }
    }
  } catch (error) {
    logger.error(`[hardening] Failed to check season status: ${String(error)}`);
  }

  // 4. Cancel stale pending sessions
  let staleSessions = 0;
  try {
    const staleThreshold = new Date(
      now.getTime() - RECOVERY_STALE_SESSION_HOURS * 60 * 60 * 1000,
    );

    const staleResult = await db.lockInSession.updateMany({
      where: {
        status: 'PENDING',
        scheduledFor: { lt: staleThreshold },
      },
      data: { status: 'CANCELLED' },
    });

    staleSessions = staleResult.count;
    if (staleSessions > 0) {
      logger.info(`[hardening] Cancelled ${staleSessions} stale pending session(s)`);
    }
  } catch (error) {
    logger.error(`[hardening] Failed to check stale sessions: ${String(error)}`);
  }

  // 5. Log recovery completion
  logger.info(
    `[hardening] Recovery complete: ${expiredGoalCount} goals resolved, ` +
    `${staleSessions} sessions cancelled, season: ${seasonStatus}`,
  );

  // 6. Post recovery summary to #bot-log
  if (botLog) {
    try {
      const embed = new EmbedBuilder()
        .setTitle('Bot Restarted')
        .setColor(BRAND_COLORS.info)
        .addFields(
          { name: 'Timestamp', value: now.toISOString(), inline: true },
          { name: 'Expired goals resolved', value: String(expiredGoalCount), inline: true },
          { name: 'Stale sessions cancelled', value: String(staleSessions), inline: true },
          { name: 'Season status', value: seasonStatus, inline: true },
        )
        .setFooter({ text: 'Silent recovery -- members not notified' })
        .setTimestamp();

      await botLog.send({ embeds: [embed] });
      logger.info('[hardening] Recovery summary posted to #bot-log');
    } catch (error) {
      logger.error(`[hardening] Failed to post recovery summary to #bot-log: ${String(error)}`);
    }
  }
}
