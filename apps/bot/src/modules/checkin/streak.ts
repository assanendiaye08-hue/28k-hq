/**
 * Flexible streak tracking with two-day grace rule and consistency rate.
 *
 * Design philosophy: avoid the "what-the-hell effect" from rigid streak systems.
 * The two-day rule is simple and intuitive:
 * - Miss 1 day: streak maintained (within grace)
 * - Miss 2+ consecutive days: streak breaks to 1 (never zero)
 * - Comeback bonus XP for returning after a break
 * - Consistency rate (30-day window) provides a healthier metric than raw streak count
 *
 * All date math uses the member's local timezone via @date-fns/tz TZDate.
 */

import { TZDate } from '@date-fns/tz';
import {
  startOfDay,
  differenceInCalendarDays,
} from 'date-fns';
import type { ExtendedPrismaClient } from '@28k/db';
import { STREAK_CONFIG, XP_AWARDS } from '@28k/shared';
import { calculateStreakMultiplier } from '@28k/shared';

/** Result of updating a member's streak after a check-in. */
export interface StreakUpdateResult {
  currentStreak: number;
  multiplier: number;
  streakBonus: number;
  isComeback: boolean;
  milestoneBonus: number;
  milestoneDays?: number;
  consistencyRate: number;
}

/**
 * Update a member's streak after a check-in.
 *
 * Computes "today" and "last check-in day" in the member's local timezone,
 * then applies the two-day grace rule:
 *   0 days since last check-in -> same day, no change
 *   1 day  -> consecutive, increment streak
 *   2 days -> 1 missed day, streak maintained (within two-day rule)
 *   3+ days -> 2+ missed days, streak breaks to 1, comeback bonus
 *
 * @param db - Extended Prisma client
 * @param memberId - The member whose streak to update
 * @param timezone - IANA timezone string (e.g., "America/New_York")
 * @returns Streak update details including multiplier, bonuses, and consistency rate
 */
export async function updateStreak(
  db: ExtendedPrismaClient,
  memberId: string,
  timezone: string,
): Promise<StreakUpdateResult> {
  const member = await db.member.findUniqueOrThrow({
    where: { id: memberId },
  });

  const now = new TZDate(new Date(), timezone);
  const today = startOfDay(now);

  let currentStreak = member.currentStreak;
  let streakBonus = 0;
  let isComeback = false;
  let milestoneBonus = 0;
  let milestoneDays: number | undefined;

  if (member.lastCheckInAt) {
    const lastCheckIn = new TZDate(member.lastCheckInAt, timezone);
    const lastCheckInDay = startOfDay(lastCheckIn);

    const daysSinceLastCheckIn = differenceInCalendarDays(today, lastCheckInDay);

    if (daysSinceLastCheckIn === 0) {
      // Same day -- no streak change (additional check-in same day)
      const multiplier = calculateStreakMultiplier(currentStreak);
      const consistencyRate = await calculateConsistencyRate(db, memberId);
      return {
        currentStreak,
        multiplier,
        streakBonus: 0,
        isComeback: false,
        milestoneBonus: 0,
        consistencyRate,
      };
    }

    if (daysSinceLastCheckIn === 1) {
      // Consecutive day -- increment streak
      currentStreak += 1;
    } else if (daysSinceLastCheckIn === 2) {
      // 1 missed day -- streak maintained within two-day rule (no increment, no reset)
      // Streak count stays the same
    } else {
      // 3+ days since last check-in (2+ consecutive missed days) -- streak breaks
      currentStreak = 1;
      isComeback = true;
      streakBonus = STREAK_CONFIG.recoverBonus;
    }
  } else {
    // First ever check-in
    currentStreak = 1;
  }

  // Check for streak milestones (7, 14, 30, 60, 90 days)
  const milestones = XP_AWARDS.streak.milestoneBonus;
  if (milestones[currentStreak] !== undefined) {
    milestoneBonus = milestones[currentStreak];
    milestoneDays = currentStreak;
  }

  // Update Member record
  const longestStreak = Math.max(currentStreak, member.longestStreak);
  await db.member.update({
    where: { id: memberId },
    data: {
      currentStreak,
      longestStreak,
      lastCheckInAt: new Date(),
    },
  });

  const multiplier = calculateStreakMultiplier(currentStreak);
  const consistencyRate = await calculateConsistencyRate(db, memberId);

  return {
    currentStreak,
    multiplier,
    streakBonus,
    isComeback,
    milestoneBonus,
    milestoneDays,
    consistencyRate,
  };
}

/**
 * Calculate a member's check-in consistency rate over a rolling window.
 *
 * Counts distinct days with at least one check-in within the last `windowDays` days
 * and returns a percentage (0-100) rounded to the nearest integer.
 *
 * Example: 26 check-in days out of 30 = 87%
 *
 * @param db - Extended Prisma client
 * @param memberId - The member to calculate consistency for
 * @param windowDays - Rolling window size in days (default 30)
 * @returns Consistency percentage (0-100)
 */
export async function calculateConsistencyRate(
  db: ExtendedPrismaClient,
  memberId: string,
  windowDays: number = 30,
): Promise<number> {
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - windowDays);

  const checkIns = await db.checkIn.findMany({
    where: {
      memberId,
      createdAt: { gte: windowStart },
    },
    select: { createdAt: true },
  });

  // Count distinct days with at least one check-in (using UTC date strings)
  const uniqueDays = new Set<string>();
  for (const ci of checkIns) {
    const dateStr = ci.createdAt.toISOString().slice(0, 10);
    uniqueDays.add(dateStr);
  }

  const rate = (uniqueDays.size / windowDays) * 100;
  return Math.round(rate);
}
