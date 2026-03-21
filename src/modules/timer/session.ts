/**
 * Timer Session Persistence
 *
 * Handles DB operations for timer sessions:
 * - Creating ACTIVE records for restart recovery
 * - Updating records on state transitions
 * - Persisting completed sessions with XP awarding
 * - Daily timer XP cap checking
 *
 * Follows the voice-tracker/tracker.ts pattern for XP awarding:
 * - 1 XP per 5 minutes worked
 * - 200 XP daily cap (independent of voice cap)
 * - 5 minute minimum session to earn XP
 */

import type { ExtendedPrismaClient } from '../../db/client.js';
import { awardXP } from '../xp/engine.js';
import { XP_AWARDS } from '../xp/constants.js';
import type { ActiveTimer } from './engine.js';

/** Result returned after persisting a completed session. */
export interface SessionPersistResult {
  xpAwarded: number;
  durationMinutes: number;
  leveledUp: boolean;
  newRank?: string;
  oldRank?: string;
}

/**
 * Get total timer XP earned today (UTC) for daily cap check.
 * Follows the exact getTodayVoiceXP pattern from voice-tracker/tracker.ts.
 */
export async function getTodayTimerXP(
  db: ExtendedPrismaClient,
  memberId: string,
): Promise<number> {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const result = await db.xPTransaction.aggregate({
    where: {
      memberId,
      source: 'TIMER_SESSION',
      createdAt: { gte: todayStart },
    },
    _sum: { amount: true },
  });

  return result._sum.amount ?? 0;
}

/**
 * Persist a completed timer session to DB and award XP.
 *
 * XP calculation:
 * - Cancelled or sessions shorter than minSessionMinutes: 0 XP
 * - Otherwise: 1 XP per 5 min worked, capped at daily remaining
 *
 * @param db - Extended Prisma client
 * @param timer - The completed ActiveTimer snapshot (from stopTimer)
 * @param status - COMPLETED or CANCELLED
 * @returns Persistence result with XP info
 */
export async function persistTimerSession(
  db: ExtendedPrismaClient,
  timer: ActiveTimer,
  status: 'COMPLETED' | 'CANCELLED',
): Promise<SessionPersistResult> {
  // Find active season
  const activeSeason = await db.season.findFirst({ where: { active: true } });

  // Calculate XP to award
  let xpToAward = 0;
  const durationMinutes = Math.floor(timer.totalWorkedMs / 60_000);

  if (
    status !== 'CANCELLED' &&
    timer.totalWorkedMs >= XP_AWARDS.timer.minSessionMinutes * 60_000
  ) {
    const rawXP =
      Math.floor(timer.totalWorkedMs / 300_000) * XP_AWARDS.timer.xpPer5Minutes;
    const todayUsed = await getTodayTimerXP(db, timer.memberId);
    const remaining = Math.max(0, XP_AWARDS.timer.dailyCap - todayUsed);
    xpToAward = Math.min(rawXP, remaining);
  }

  // Create TimerSession record
  await db.timerSession.create({
    data: {
      memberId: timer.memberId,
      mode: timer.mode === 'pomodoro' ? 'POMODORO' : 'PROPORTIONAL',
      status,
      focus: timer.focus,
      goalId: timer.goalId,
      workDuration: timer.workDuration,
      breakDuration: timer.breakDuration,
      breakRatio: timer.breakRatio,
      totalWorkedMs: timer.totalWorkedMs,
      totalBreakMs: timer.totalBreakMs,
      pomodoroCount: timer.pomodoroCount,
      xpAwarded: xpToAward,
      startedAt: timer.startedAt,
      endedAt: new Date(),
      lastStateChangeAt: new Date(),
      dmMessageId: timer.dmMessageId,
      dmChannelId: timer.dmChannelId,
      seasonId: activeSeason?.id ?? null,
    },
  });

  // Award XP if earned
  let leveledUp = false;
  let newRank: string | undefined;
  let oldRank: string | undefined;

  if (xpToAward > 0) {
    const result = await awardXP(
      db,
      timer.memberId,
      xpToAward,
      'TIMER_SESSION',
      `Timer session: ${durationMinutes} min`,
    );
    leveledUp = result.leveledUp;
    newRank = result.newRank;
    oldRank = result.oldRank;
  }

  return { xpAwarded: xpToAward, durationMinutes, leveledUp, newRank, oldRank };
}

/**
 * Create an ACTIVE TimerSession in DB for restart recovery.
 * Called when a timer starts. Maps ActiveTimer fields to Prisma model.
 */
export async function createActiveTimerRecord(
  db: ExtendedPrismaClient,
  timer: ActiveTimer,
): Promise<void> {
  // Find active season
  const activeSeason = await db.season.findFirst({ where: { active: true } });

  await db.timerSession.create({
    data: {
      memberId: timer.memberId,
      mode: timer.mode === 'pomodoro' ? 'POMODORO' : 'PROPORTIONAL',
      status: 'ACTIVE',
      focus: timer.focus,
      goalId: timer.goalId,
      workDuration: timer.workDuration,
      breakDuration: timer.breakDuration,
      breakRatio: timer.breakRatio,
      totalWorkedMs: timer.totalWorkedMs,
      totalBreakMs: timer.totalBreakMs,
      pomodoroCount: timer.pomodoroCount,
      xpAwarded: 0,
      startedAt: timer.startedAt,
      lastStateChangeAt: new Date(),
      dmMessageId: timer.dmMessageId,
      dmChannelId: timer.dmChannelId,
      seasonId: activeSeason?.id ?? null,
    },
  });
}

/**
 * Update the ACTIVE TimerSession for a member.
 * Called on state transitions for restart recovery.
 */
export async function updateTimerRecord(
  db: ExtendedPrismaClient,
  memberId: string,
  updates: {
    totalWorkedMs?: number;
    totalBreakMs?: number;
    pomodoroCount?: number;
    dmMessageId?: string;
    dmChannelId?: string;
    breakDuration?: number;
  },
): Promise<void> {
  await db.timerSession.updateMany({
    where: { memberId, status: 'ACTIVE' },
    data: {
      ...updates,
      lastStateChangeAt: new Date(),
    },
  });
}

/**
 * Delete ACTIVE TimerSession records for a member.
 * Called when a session is properly ended via persistTimerSession.
 */
export async function deleteActiveTimerRecord(
  db: ExtendedPrismaClient,
  memberId: string,
): Promise<void> {
  await db.timerSession.deleteMany({
    where: { memberId, status: 'ACTIVE' },
  });
}
