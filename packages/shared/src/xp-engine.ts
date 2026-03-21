/**
 * XP Engine
 *
 * Core XP award logic with transaction logging, level-up detection,
 * streak multiplier calculation, and diminishing returns for check-ins.
 *
 * All XP operations use Prisma $transaction for atomicity:
 * 1. Create an XPTransaction record (immutable audit log)
 * 2. Increment Member.totalXp atomically
 * 3. Detect rank changes by comparing old vs new XP thresholds
 *
 * This prevents race conditions on simultaneous check-in + goal completion.
 */

import type { ExtendedPrismaClient } from '@28k/db';
import { RANK_PROGRESSION } from './constants.js';
import { XP_AWARDS, STREAK_CONFIG } from './xp-constants.js';

/** XP source enum values matching the Prisma XPSource enum. */
export type XPSource =
  | 'CHECKIN'
  | 'GOAL_COMPLETE'
  | 'STREAK_BONUS'
  | 'SETUP_BONUS'
  | 'VOICE_SESSION'
  | 'WIN_POST'
  | 'LESSON_POST'
  | 'RESOURCE_SHARE'
  | 'SESSION_HOST'
  | 'TIMER_SESSION'
  | 'REFLECTION';

/** Result of an XP award operation. */
export interface AwardXPResult {
  newTotal: number;
  leveledUp: boolean;
  newRank?: string;
  oldRank?: string;
}

/** A rank entry from the progression table. */
export type RankInfo = { name: string; xpThreshold: number; color: number };

/**
 * Get the rank for a given XP total.
 * Returns the highest rank whose xpThreshold <= xp.
 */
export function getRankForXP(xp: number): RankInfo {
  let rank: RankInfo = RANK_PROGRESSION[0];
  for (const r of RANK_PROGRESSION) {
    if (xp >= r.xpThreshold) {
      rank = r;
    }
  }
  return rank;
}

/**
 * Get info about the next rank relative to current XP.
 * Returns a human-readable string like "375 XP to Hustler" or "Max rank reached".
 */
export function getNextRankInfo(xp: number): string {
  const currentRank = getRankForXP(xp);

  // Find the index by matching on xpThreshold (avoids readonly tuple type mismatch)
  const currentIndex = RANK_PROGRESSION.findIndex(
    (r) => r.xpThreshold === currentRank.xpThreshold,
  );

  if (currentIndex < 0 || currentIndex >= RANK_PROGRESSION.length - 1) {
    return 'Max rank reached';
  }

  const nextRank = RANK_PROGRESSION[currentIndex + 1];
  const xpNeeded = nextRank.xpThreshold - xp;
  return `${xpNeeded.toLocaleString()} XP to ${nextRank.name}`;
}

/**
 * Award XP to a member atomically with transaction logging.
 *
 * Uses Prisma $transaction to guarantee:
 * - XPTransaction record is created
 * - Member.totalXp is incremented
 * - Level-up detection happens on the post-increment value
 *
 * @param db - Extended Prisma client
 * @param memberId - The member to award XP to
 * @param amount - XP amount (must be positive)
 * @param source - What triggered this award
 * @param description - Human-readable description for the audit log
 * @returns Award result with new total and level-up info
 */
export async function awardXP(
  db: ExtendedPrismaClient,
  memberId: string,
  amount: number,
  source: XPSource,
  description: string,
): Promise<AwardXPResult> {
  return db.$transaction(async (tx) => {
    // 1. Create immutable transaction record
    await tx.xPTransaction.create({
      data: { memberId, amount, source, description },
    });

    // 2. Atomically increment cached total
    const member = await tx.member.update({
      where: { id: memberId },
      data: { totalXp: { increment: amount } },
    });

    // 3. Detect rank change
    const oldRank = getRankForXP(member.totalXp - amount);
    const newRank = getRankForXP(member.totalXp);
    const leveledUp = oldRank.name !== newRank.name;

    return {
      newTotal: member.totalXp,
      leveledUp,
      newRank: leveledUp ? newRank.name : undefined,
      oldRank: leveledUp ? oldRank.name : undefined,
    };
  });
}

/**
 * Calculate XP for a check-in based on day index and streak multiplier.
 *
 * Diminishing returns prevent spam:
 * - 1st check-in: base * multiplier (25 * 1.x)
 * - 2nd check-in: base * secondMultiplier * multiplier (12 * 1.x)
 * - 3rd check-in: base * thirdMultiplier * multiplier (6 * 1.x)
 * - 4th+: base * diminishedMultiplier * multiplier (2 * 1.x)
 *
 * @param dayIndex - Which check-in this is today (1-based: 1st, 2nd, 3rd, etc.)
 * @param streakMultiplier - Current streak multiplier (1.0 to 3.0)
 * @returns XP to award (rounded to nearest integer)
 */
export function calculateCheckinXP(dayIndex: number, streakMultiplier: number): number {
  const { base, secondMultiplier, thirdMultiplier, diminishedMultiplier } = XP_AWARDS.checkin;

  let multiplier: number;
  if (dayIndex <= 1) {
    multiplier = 1;
  } else if (dayIndex === 2) {
    multiplier = secondMultiplier;
  } else if (dayIndex === 3) {
    multiplier = thirdMultiplier;
  } else {
    multiplier = diminishedMultiplier;
  }

  return Math.round(base * multiplier * streakMultiplier);
}

/**
 * Calculate the streak multiplier for a given streak length.
 *
 * Formula: 1.0 + (multiplierGrowth * currentStreak), capped at maxMultiplier.
 * Example: streak of 10 days = 1.0 + (0.1 * 10) = 2.0x
 *
 * @param currentStreak - Number of consecutive active days
 * @returns Multiplier between 1.0 and maxMultiplier (3.0)
 */
export function calculateStreakMultiplier(currentStreak: number): number {
  const raw = 1.0 + STREAK_CONFIG.multiplierGrowth * currentStreak;
  return Math.min(raw, STREAK_CONFIG.maxMultiplier);
}
