/**
 * Flexible streak tracking with grace days and decay.
 *
 * Design philosophy: avoid the "what-the-hell effect" from rigid streak systems.
 * Missing a day does NOT reset the streak to zero. Instead:
 * - 2 grace days per Mon-Sun week maintain streak + multiplier
 * - Missing beyond grace days decays the multiplier (not reset)
 * - Only 7+ consecutive missed days resets the streak counter
 * - Comeback bonus XP for returning after missed days
 *
 * All date math uses the member's local timezone via @date-fns/tz TZDate.
 */

import { TZDate } from '@date-fns/tz';
import {
  startOfDay,
  startOfWeek,
  differenceInCalendarDays,
  isEqual,
} from 'date-fns';
import type { ExtendedPrismaClient } from '../../db/client.js';
import { STREAK_CONFIG, XP_AWARDS } from '../xp/constants.js';
import { calculateStreakMultiplier } from '../xp/engine.js';

/** Result of updating a member's streak after a check-in. */
export interface StreakUpdateResult {
  currentStreak: number;
  multiplier: number;
  streakBonus: number;
  isComeback: boolean;
  milestoneBonus: number;
  milestoneDays?: number;
}

/**
 * Update a member's streak after a check-in.
 *
 * Computes "today" and "last check-in day" in the member's local timezone,
 * then applies flexible streak rules (grace days, decay, comeback bonus).
 *
 * @param db - Extended Prisma client
 * @param memberId - The member whose streak to update
 * @param timezone - IANA timezone string (e.g., "America/New_York")
 * @returns Streak update details including multiplier and bonuses
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
      return {
        currentStreak,
        multiplier,
        streakBonus: 0,
        isComeback: false,
        milestoneBonus: 0,
      };
    }

    if (daysSinceLastCheckIn === 1) {
      // Consecutive day -- increment streak
      currentStreak += 1;
    } else if (daysSinceLastCheckIn >= 7) {
      // 7+ days missed -- reset streak
      currentStreak = 1;
      isComeback = true;
      streakBonus = STREAK_CONFIG.recoverBonus;
    } else {
      // 2-6 days missed -- check grace days
      const missedDays = daysSinceLastCheckIn - 1; // days with no check-in
      const { remaining } = await calculateGraceDays(db, memberId, timezone);

      if (missedDays <= remaining) {
        // Within grace days -- streak maintained, multiplier doesn't increase
        // Streak stays the same (no increment, no reset)
      } else {
        // Beyond grace days -- streak maintained but multiplier decays
        // We don't modify currentStreak here, the multiplier handles the penalty
        // The decay is applied in calculateStreakMultiplier via reduced streak count
        const excessDays = missedDays - remaining;
        // Reduce effective streak by excess days to simulate decay
        currentStreak = Math.max(1, currentStreak - excessDays);
      }

      // Comeback bonus for returning after 2+ missed days
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

  return {
    currentStreak,
    multiplier,
    streakBonus,
    isComeback,
    milestoneBonus,
    milestoneDays,
  };
}

/**
 * Calculate how many grace days have been used this Mon-Sun week.
 *
 * Counts check-in-free days within the current Mon-Sun week that were
 * "covered" by grace days (i.e., days where the member didn't check in
 * but their streak was maintained).
 *
 * @param db - Extended Prisma client
 * @param memberId - The member to check
 * @param timezone - IANA timezone string
 * @returns Grace days used and remaining this week
 */
export async function calculateGraceDays(
  db: ExtendedPrismaClient,
  memberId: string,
  timezone: string,
): Promise<{ used: number; remaining: number }> {
  const now = new TZDate(new Date(), timezone);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday

  // Count distinct days with check-ins this week
  const checkIns = await db.checkIn.findMany({
    where: {
      memberId,
      createdAt: { gte: weekStart },
    },
    select: { createdAt: true },
  });

  // Count unique check-in days this week (in member's timezone)
  const checkInDays = new Set<string>();
  for (const ci of checkIns) {
    const ciDate = new TZDate(ci.createdAt, timezone);
    const dayStr = startOfDay(ciDate).toISOString();
    checkInDays.add(dayStr);
  }

  // How many days have passed this week (up to today)
  const today = startOfDay(now);
  const daysPassed = differenceInCalendarDays(today, startOfDay(weekStart)) + 1;

  // Days without check-ins = days passed - days with check-ins
  const daysWithoutCheckin = Math.max(0, daysPassed - checkInDays.size);

  // Grace days used = missed days (capped at graceDaysPerWeek)
  const used = Math.min(daysWithoutCheckin, STREAK_CONFIG.graceDaysPerWeek);
  const remaining = Math.max(0, STREAK_CONFIG.graceDaysPerWeek - used);

  return { used, remaining };
}
