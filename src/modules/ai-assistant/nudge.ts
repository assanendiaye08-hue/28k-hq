/**
 * Accountability nudge system.
 *
 * Sends evening nudge messages when members miss check-ins, with
 * intensity configurable per member (light/medium/heavy). Extended
 * silence triggers a genuine check-in conversation, not nagging.
 *
 * All nudges are DM-only via deliverNotification. Multi-account
 * members can route nudges to a specific linked account via
 * /notifications set, with fallback to the primary account.
 */

import { OpenRouter } from '@openrouter/sdk';
import { TZDate } from '@date-fns/tz';
import { startOfDay, differenceInDays } from 'date-fns';
import type { Client } from 'discord.js';
import type { ExtendedPrismaClient } from '../../db/client.js';
import { config } from '../../core/config.js';
import { deliverNotification } from '../notification-router/router.js';
import { buildSystemPrompt, AI_NAME } from './personality.js';
import { storeMessage } from './memory.js';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) =>
      `${timestamp as string} [nudge] ${level}: ${message as string}`),
  ),
  transports: [new winston.transports.Console()],
});

// ─── Constants ──────────────────────────────────────────────────────────────────

/** Nudge marker prefix stored in conversation messages for counting. */
const NUDGE_MARKER = '[NUDGE]';

/** Accountability level configuration. */
export const ACCOUNTABILITY_LEVELS: Record<string, {
  maxNudgesPerDay: number;
  triggerAfterMissedDays: number;
  silenceThresholdDays: number;
  tone: string;
}> = {
  light: {
    maxNudgesPerDay: 1,
    triggerAfterMissedDays: 2,
    silenceThresholdDays: 7,
    tone: 'gentle reminder',
  },
  medium: {
    maxNudgesPerDay: 2,
    triggerAfterMissedDays: 1,
    silenceThresholdDays: 5,
    tone: 'direct check-in',
  },
  heavy: {
    maxNudgesPerDay: 3,
    triggerAfterMissedDays: 0,
    silenceThresholdDays: 3,
    tone: 'accountability partner',
  },
};

// ─── OpenRouter Client ──────────────────────────────────────────────────────────

let openrouterClient: OpenRouter | null = null;

function getOpenRouterClient(): OpenRouter {
  if (!openrouterClient) {
    openrouterClient = new OpenRouter({
      apiKey: config.OPENROUTER_API_KEY,
    });
  }
  return openrouterClient;
}

// ─── Should Nudge Check ─────────────────────────────────────────────────────────

/**
 * Determine whether a member should receive a nudge right now.
 *
 * Returns false if:
 * - Member checked in today (in their timezone)
 * - Already nudged today (lastNudgeAt is today)
 * - Already at max nudges for the day
 * - Not enough days since last check-in to trigger
 */
export async function shouldNudge(
  db: ExtendedPrismaClient,
  memberId: string,
  accountabilityLevel: string,
): Promise<boolean> {
  const levelConfig = ACCOUNTABILITY_LEVELS[accountabilityLevel] ?? ACCOUNTABILITY_LEVELS.medium;

  // Load member with schedule
  const member = await db.member.findUniqueOrThrow({
    where: { id: memberId },
    include: { schedule: true },
  });

  const schedule = member.schedule;
  if (!schedule) return false;

  const timezone = schedule.timezone;
  const now = new TZDate(new Date(), timezone);
  const todayStart = startOfDay(now);

  // 1. Check if member checked in today -- if yes, no nudge needed
  const todayCheckIns = await db.checkIn.count({
    where: {
      memberId,
      createdAt: { gte: todayStart },
    },
  });
  if (todayCheckIns > 0) return false;

  // 2. Check if already nudged today (lastNudgeAt)
  if (schedule.lastNudgeAt) {
    const lastNudgeDate = new TZDate(schedule.lastNudgeAt, timezone);
    const lastNudgeDayStart = startOfDay(lastNudgeDate);
    if (lastNudgeDayStart.getTime() >= todayStart.getTime()) {
      // Already nudged today -- check count against max
      const todayNudgeCount = await db.conversationMessage.count({
        where: {
          memberId,
          role: 'assistant',
          content: { startsWith: NUDGE_MARKER },
          createdAt: { gte: todayStart },
        },
      });
      if (todayNudgeCount >= levelConfig.maxNudgesPerDay) return false;
    }
  }

  // 3. Calculate days since last check-in
  if (member.lastCheckInAt) {
    const daysSinceCheckIn = differenceInDays(now, member.lastCheckInAt);
    if (daysSinceCheckIn < levelConfig.triggerAfterMissedDays) return false;
  }
  // If no lastCheckInAt at all, member has never checked in -- nudge is appropriate

  return true;
}

// ─── Send Nudge ─────────────────────────────────────────────────────────────────

/**
 * Send an accountability nudge to a member.
 *
 * Checks shouldNudge first. If eligible, generates an AI-powered nudge
 * message using Ace's personality, delivers via DM, and records it.
 *
 * Extended silence (days >= silenceThresholdDays) triggers a genuine
 * check-in conversation instead of a productivity nudge.
 */
export async function sendNudge(
  client: Client,
  db: ExtendedPrismaClient,
  memberId: string,
): Promise<void> {
  try {
    // Load member with schedule, profile, goals, last check-in
    const member = await db.member.findUniqueOrThrow({
      where: { id: memberId },
      include: {
        schedule: true,
        profile: true,
        goals: {
          where: { status: { in: ['ACTIVE', 'EXTENDED'] } },
          orderBy: { deadline: 'asc' },
        },
      },
    });

    const schedule = member.schedule;
    if (!schedule) return;

    const accountabilityLevel = schedule.accountabilityLevel || 'medium';

    // Check if we should nudge
    const eligible = await shouldNudge(db, memberId, accountabilityLevel);
    if (!eligible) {
      logger.debug(`Skipping nudge for ${memberId} -- not eligible`);
      return;
    }

    const levelConfig = ACCOUNTABILITY_LEVELS[accountabilityLevel] ?? ACCOUNTABILITY_LEVELS.medium;
    const timezone = schedule.timezone;
    const now = new TZDate(new Date(), timezone);

    // Calculate days since last check-in
    const daysSinceCheckIn = member.lastCheckInAt
      ? differenceInDays(now, member.lastCheckInAt)
      : null;

    // Determine if this is an extended silence situation
    const isExtendedSilence = daysSinceCheckIn !== null &&
      daysSinceCheckIn >= levelConfig.silenceThresholdDays;

    // Build nudge message via AI
    let nudgeText: string;
    try {
      const aiClient = getOpenRouterClient();
      const aceSystemPrompt = await buildSystemPrompt(db, memberId);

      let nudgeInstruction: string;
      if (isExtendedSilence) {
        // Extended silence -- genuine check-in, not nagging
        const goalNames = member.goals.map((g) => g.title).join(', ') || 'their goals';
        nudgeInstruction = `This member has been quiet for ${daysSinceCheckIn} days. Send a genuine check-in -- not a productivity nag. Something like: "Hey ${member.displayName}, it's been ${daysSinceCheckIn} days. No pressure, but I want to check in -- are you still locked in on ${goalNames}, or do you want to adjust? You can always use /accountability light or just tell me to back off." Keep it real and human. 2-3 sentences max.`;
      } else {
        // Normal nudge based on level tone
        const streakInfo = member.currentStreak > 0
          ? `Their ${member.currentStreak}-day streak is at risk.`
          : 'They have no active streak.';
        const goalInfo = member.goals.length > 0
          ? `Active goals: ${member.goals.map((g) => g.title).join(', ')}.`
          : 'No active goals set.';
        nudgeInstruction = `Send a ${levelConfig.tone} accountability nudge. ${streakInfo} ${goalInfo} Days since last check-in: ${daysSinceCheckIn ?? 'never'}. Keep it to 1-3 sentences. Remind them to use /checkin.`;
      }

      const completion = await aiClient.chat.send({
        chatGenerationParams: {
          model: 'deepseek/deepseek-v3.2',
          messages: [
            {
              role: 'system' as const,
              content: aceSystemPrompt + '\n\nYou are sending an accountability nudge via DM.',
            },
            {
              role: 'user' as const,
              content: nudgeInstruction,
            },
          ],
          stream: false,
        },
      });

      const content = completion.choices[0]?.message?.content;
      if (content && typeof content === 'string' && content.length > 5) {
        nudgeText = content;
      } else {
        // Fallback text
        nudgeText = isExtendedSilence
          ? `Hey ${member.displayName}, it's been a while. No pressure -- just checking in. Use \`/checkin\` when you're ready, or \`/accountability light\` if you want me to ease up.`
          : `Hey ${member.displayName}, you haven't checked in today. Use \`/checkin\` to log your progress and keep your streak alive.`;
      }
    } catch (error) {
      logger.warn(`AI nudge generation failed for ${memberId}: ${String(error)}`);
      nudgeText = `Hey ${member.displayName}, quick nudge -- you haven't checked in today. Use \`/checkin\` when you get a chance.`;
    }

    // Deliver via notification router (respects per-type account preferences)
    const delivered = await deliverNotification(client, db, memberId, 'nudge', {
      content: nudgeText,
    });

    if (!delivered) {
      logger.warn(`Could not deliver nudge to ${memberId}`);
      return;
    }

    // Update lastNudgeAt to prevent duplicate nudges
    await db.memberSchedule.update({
      where: { memberId },
      data: { lastNudgeAt: new Date() },
    });

    // Store the nudge as a conversation message with marker for counting
    await storeMessage(db, memberId, 'assistant', `${NUDGE_MARKER} ${nudgeText}`);

    logger.info(
      `Nudge delivered to ${memberId} (level: ${accountabilityLevel}, silence: ${isExtendedSilence ? 'extended' : 'normal'})`,
    );
  } catch (error) {
    logger.error(`Failed to send nudge to ${memberId}: ${String(error)}`);
  }
}
