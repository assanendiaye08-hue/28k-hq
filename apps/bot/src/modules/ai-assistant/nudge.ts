/**
 * Accountability nudge system.
 *
 * Sends evening nudge messages when members miss check-ins, with
 * intensity configurable per member (light/medium/heavy). Extended
 * silence triggers a genuine check-in conversation, not nagging.
 *
 * Features:
 * - Stale goal detection: goals with no activity for 5+ days get mentioned
 * - Graduated pullback: disengaged members receive FEWER messages, not more
 *   1-3 days silent: normal nudge behavior
 *   4-7 days: max 1 nudge/day, lighter tone
 *   8-14 days: max 1 nudge per 3 days, door-open tone
 *   15+ days: no nudging at all (respond only if member initiates)
 *
 * All nudges are DM-only via deliverNotification. Multi-account
 * members can route nudges to a specific linked account via
 * /notifications set, with fallback to the primary account.
 */

import { TZDate } from '@date-fns/tz';
import { startOfDay, differenceInDays } from 'date-fns';
import type { Client } from 'discord.js';
import type { ExtendedPrismaClient } from '@28k/db';
import { callAI } from '../../shared/ai-client.js';
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

// ─── Stale Goal Detection ────────────────────────────────────────────────────────

/** A goal that has had no activity for a configurable threshold of days. */
export interface StaleGoal {
  id: string;
  title: string;
  daysSinceUpdate: number;
}

/**
 * Find active goals that have had no progress for `thresholdDays` or more.
 *
 * Staleness heuristic (Goal model has no updatedAt, check-in content is encrypted):
 * - Query active top-level goals created more than thresholdDays ago
 * - Check if the member has any check-ins within the threshold period
 * - If member checked in recently, assume all goals are being worked on (not stale)
 * - If no recent check-ins, all qualifying goals are stale
 * - Exception: measurable goals with currentValue > 0 are excluded (progress was made)
 *
 * @param db - Extended Prisma client
 * @param memberId - The member whose goals to check
 * @param thresholdDays - Days of inactivity before a goal is considered stale (default 5)
 * @returns Array of stale goals with days since last activity
 */
export async function findStaleGoals(
  db: ExtendedPrismaClient,
  memberId: string,
  thresholdDays = 5,
): Promise<StaleGoal[]> {
  const cutoff = new Date(Date.now() - thresholdDays * 24 * 60 * 60 * 1000);

  // Check if member has checked in recently -- if so, goals are presumably active
  const recentCheckInCount = await db.checkIn.count({
    where: {
      memberId,
      createdAt: { gte: cutoff },
    },
  });

  if (recentCheckInCount > 0) {
    // Member is active -- no stale goals
    return [];
  }

  // No recent check-ins -- find goals that have been sitting idle
  const activeGoals = await db.goal.findMany({
    where: {
      memberId,
      status: { in: ['ACTIVE', 'EXTENDED'] },
      parentId: null, // Top-level only
      createdAt: { lt: cutoff }, // Created before threshold
    },
    select: { id: true, title: true, createdAt: true, currentValue: true, type: true },
  });

  const staleGoals: StaleGoal[] = [];
  const now = new Date();

  for (const goal of activeGoals) {
    // Measurable goals with progress > 0 have been worked on at some point
    if (goal.type === 'MEASURABLE' && goal.currentValue > 0) continue;

    const daysSinceUpdate = differenceInDays(now, goal.createdAt);
    staleGoals.push({
      id: goal.id,
      title: goal.title,
      daysSinceUpdate,
    });
  }

  return staleGoals;
}

// ─── Graduated Pullback ──────────────────────────────────────────────────────────

/**
 * Graduated pullback tiers based on days of silence.
 *
 * Returns null if the member should not be nudged at all (15+ days).
 * Otherwise returns the max nudges per day and tone guidance.
 */
export interface PullbackTier {
  maxNudgesPerDay: number;
  minDaysBetweenNudges: number;
  tone: string;
}

/**
 * Determine the graduated pullback tier for a member based on days since
 * their last check-in.
 *
 * @returns PullbackTier or null if member is in quiet zone (15+ days)
 */
export function getGraduatedPullback(daysSinceCheckIn: number | null): PullbackTier | null {
  // Never checked in -- treat as new member, normal nudge
  if (daysSinceCheckIn === null) {
    return { maxNudgesPerDay: 2, minDaysBetweenNudges: 0, tone: 'encouraging onboarding' };
  }

  if (daysSinceCheckIn >= 15) {
    // 15+ days: stop nudging entirely
    return null;
  }

  if (daysSinceCheckIn >= 8) {
    // 8-14 days: max 1 nudge per 3 days, door-open tone
    return {
      maxNudgesPerDay: 1,
      minDaysBetweenNudges: 3,
      tone: 'door-open, no pressure',
    };
  }

  if (daysSinceCheckIn >= 4) {
    // 4-7 days: max 1 nudge/day, lighter observation
    return {
      maxNudgesPerDay: 1,
      minDaysBetweenNudges: 0,
      tone: 'light observation, not push',
    };
  }

  // 1-3 days: normal behavior (use accountability level config)
  return { maxNudgesPerDay: 3, minDaysBetweenNudges: 0, tone: 'normal' };
}

/**
 * Calculate days since last check-in for a member.
 * Exported for use by the scheduler evening sweep.
 */
export async function getDaysSinceLastCheckIn(
  db: ExtendedPrismaClient,
  memberId: string,
): Promise<number | null> {
  const member = await db.member.findUnique({
    where: { id: memberId },
    select: { lastCheckInAt: true },
  });

  if (!member?.lastCheckInAt) return null;
  return differenceInDays(new Date(), member.lastCheckInAt);
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
 * Checks shouldNudge first. Then applies graduated pullback based on days
 * of silence. If eligible, detects stale goals and generates an AI-powered
 * nudge message using Jarvis's personality, delivers via DM, and records it.
 *
 * Graduated pullback curve:
 * - 1-3 days: normal nudge behavior
 * - 4-7 days: max 1 nudge/day, lighter observation tone
 * - 8-14 days: max 1 nudge per 3 days, door-open tone
 * - 15+ days: stop nudging entirely
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
    const timezone = schedule.timezone;
    const now = new TZDate(new Date(), timezone);

    // Calculate days since last check-in
    const daysSinceCheckIn = member.lastCheckInAt
      ? differenceInDays(now, member.lastCheckInAt)
      : null;

    // ── Graduated pullback check ──────────────────────────────────────────
    const pullback = getGraduatedPullback(daysSinceCheckIn);

    if (pullback === null) {
      // 15+ days silent -- stop nudging entirely
      logger.debug(`Skipping nudge for ${memberId} -- graduated pullback (${daysSinceCheckIn}+ days silent)`);
      return;
    }

    // Check minDaysBetweenNudges for sparse nudging (8-14 day tier)
    if (pullback.minDaysBetweenNudges > 0 && schedule.lastNudgeAt) {
      const daysSinceLastNudge = differenceInDays(now, schedule.lastNudgeAt);
      if (daysSinceLastNudge < pullback.minDaysBetweenNudges) {
        logger.debug(`Skipping nudge for ${memberId} -- pullback spacing (${daysSinceLastNudge}/${pullback.minDaysBetweenNudges} days)`);
        return;
      }
    }

    // Check if we should nudge (existing eligibility: checked-in today, max nudges, etc.)
    const eligible = await shouldNudge(db, memberId, accountabilityLevel);
    if (!eligible) {
      logger.debug(`Skipping nudge for ${memberId} -- not eligible`);
      return;
    }

    // Apply pullback max nudges cap (overrides accountability level if stricter)
    const levelConfig = ACCOUNTABILITY_LEVELS[accountabilityLevel] ?? ACCOUNTABILITY_LEVELS.medium;
    const effectiveMaxNudges = Math.min(levelConfig.maxNudgesPerDay, pullback.maxNudgesPerDay);

    // Re-check today's nudge count against the effective cap
    const todayStart = startOfDay(now);
    const todayNudgeCount = await db.conversationMessage.count({
      where: {
        memberId,
        role: 'assistant',
        content: { startsWith: NUDGE_MARKER },
        createdAt: { gte: todayStart },
      },
    });
    if (todayNudgeCount >= effectiveMaxNudges) {
      logger.debug(`Skipping nudge for ${memberId} -- effective cap reached (${todayNudgeCount}/${effectiveMaxNudges})`);
      return;
    }

    // ── Stale goal detection ──────────────────────────────────────────────
    const staleGoals = await findStaleGoals(db, memberId);

    // ── Build nudge instruction ───────────────────────────────────────────
    const aceSystemPrompt = await buildSystemPrompt(db, memberId);

    let nudgeInstruction: string;

    if (daysSinceCheckIn !== null && daysSinceCheckIn >= 8) {
      // 8-14 days -- door-open tone
      nudgeInstruction = `This member has been quiet for ${daysSinceCheckIn} days. Send a short, warm, no-pressure check-in. Tone: door-open. Something like: "Still here when you need me. Your goals are waiting." ONE sentence max. No guilt, no urgency.`;
    } else if (daysSinceCheckIn !== null && daysSinceCheckIn >= 4) {
      // 4-7 days -- lighter observation
      const staleInfo = staleGoals.length > 0
        ? ` Stale goals (mention as observation, not accusation): ${staleGoals.map((g) => `${g.title} (${g.daysSinceUpdate} days)`).join(', ')}.`
        : '';
      nudgeInstruction = `This member has been quiet for ${daysSinceCheckIn} days. Send a light observation, not a push. Tone: casual, acknowledging priorities shift.${staleInfo} Something like: "Your [goal] hasn't moved in ${daysSinceCheckIn} days. Priorities shift -- want to adjust or recommit?" Keep it to 1-2 sentences.`;
    } else {
      // 1-3 days or extended silence handled by existing logic
      const isExtendedSilence = daysSinceCheckIn !== null &&
        daysSinceCheckIn >= levelConfig.silenceThresholdDays;

      if (isExtendedSilence) {
        const goalNames = member.goals.map((g) => g.title).join(', ') || 'their goals';
        nudgeInstruction = `This member has been quiet for ${daysSinceCheckIn} days. Send a genuine check-in -- not a productivity nag. Something like: "Hey ${member.displayName}, it's been ${daysSinceCheckIn} days. No pressure, but I want to check in -- are you still locked in on ${goalNames}, or do you want to adjust? You can always use /accountability light or just tell me to back off." Keep it real and human. 2-3 sentences max.`;
      } else {
        // Normal nudge
        const streakInfo = member.currentStreak > 0
          ? `Their ${member.currentStreak}-day streak is at risk.`
          : 'They have no active streak.';
        const goalInfo = member.goals.length > 0
          ? `Active goals: ${member.goals.map((g) => g.title).join(', ')}.`
          : 'No active goals set.';

        // Include stale goals as observations
        const staleInfo = staleGoals.length > 0
          ? ` Stale goals to mention as observation (not accusation): ${staleGoals.map((g) => `"${g.title}" hasn't seen movement in ${g.daysSinceUpdate} days`).join('; ')}.`
          : '';

        nudgeInstruction = `Send a ${levelConfig.tone} accountability nudge. ${streakInfo} ${goalInfo}${staleInfo} Days since last check-in: ${daysSinceCheckIn ?? 'never'}. Keep it to 1-3 sentences. Remind them to use /checkin.`;
      }
    }

    // Build nudge message via AI
    let nudgeText: string;

    const result = await callAI(db, {
      memberId,
      feature: 'nudge',
      messages: [
        {
          role: 'system',
          content: aceSystemPrompt + '\n\nYou are sending an accountability nudge via DM.',
        },
        {
          role: 'user',
          content: nudgeInstruction,
        },
      ],
    });

    if (result.degraded || !result.content || result.content.length <= 5) {
      // Fallback text based on pullback tier
      if (daysSinceCheckIn !== null && daysSinceCheckIn >= 8) {
        nudgeText = `Still here when you need me. Your goals are waiting.`;
      } else if (daysSinceCheckIn !== null && daysSinceCheckIn >= 4) {
        nudgeText = `Hey ${member.displayName}, it's been ${daysSinceCheckIn} days. Priorities shift -- want to adjust your goals or recommit? Use \`/checkin\` when ready.`;
      } else {
        nudgeText = `Hey ${member.displayName}, you haven't checked in today. Use \`/checkin\` to log your progress and keep your streak alive.`;
      }
    } else {
      nudgeText = result.content;
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

    // Store the nudge as a conversation message with marker for counting and topic for context
    await storeMessage(db, memberId, 'assistant', `${NUDGE_MARKER} ${nudgeText}`, 'nudge');

    const pullbackTier = daysSinceCheckIn !== null && daysSinceCheckIn >= 8 ? 'sparse'
      : daysSinceCheckIn !== null && daysSinceCheckIn >= 4 ? 'reduced'
      : 'normal';

    logger.info(
      `Nudge delivered to ${memberId} (level: ${accountabilityLevel}, pullback: ${pullbackTier}, stale-goals: ${staleGoals.length})`,
    );
  } catch (error) {
    logger.error(`Failed to send nudge to ${memberId}: ${String(error)}`);
  }
}
