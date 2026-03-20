/**
 * XP Economy Constants
 *
 * Centralized XP amounts, streak mechanics, and multiplier tables.
 * All values are tuned from gaming psychology research:
 * - Early levels come fast (Duolingo "hook" pattern)
 * - Diminishing returns prevent spam incentive
 * - Flexible streak scoring avoids binary collapse anxiety
 *
 * Rank thresholds are in shared/constants.ts (RANK_PROGRESSION).
 */

/**
 * XP awarded per activity type.
 * Goal completion intentionally > check-in to reward outcomes over attendance.
 */
export const XP_AWARDS = {
  checkin: {
    base: 25, // First check-in of the day
    secondMultiplier: 0.5, // 2nd check-in = 12 XP
    thirdMultiplier: 0.25, // 3rd check-in = 6 XP
    diminishedMultiplier: 0.1, // 4th+ = 2 XP (anti-spam)
  },
  goal: {
    measurableComplete: 100, // Completing a measurable goal
    freetextComplete: 75, // Completing a free-text goal
    progressUpdate: 10, // Each progress increment on measurable goal
  },
  streak: {
    dailyBonus: 5, // Bonus XP per day of current streak (5, 10, 15...)
    milestoneBonus: {
      7: 50, // 1 week
      14: 100, // 2 weeks
      30: 250, // 1 month
      60: 500, // 2 months
      90: 1000, // 3 months
    } as Record<number, number>,
  },
  setupBonus: 50, // One-time bonus for completing /setup

  // Phase 3: Voice sessions and wins/lessons
  voice: {
    xpPer3Minutes: 1, // 1 XP per 3 minutes in voice co-work
    dailyCap: 200, // Maximum voice XP per day
    minSessionMinutes: 5, // Sessions shorter than this don't count
  },
  win: 30, // XP for posting in #wins
  lesson: 35, // XP for posting in #lessons (slightly higher to encourage vulnerability)
  winsLessonsCooldownMs: 2 * 60 * 60 * 1000, // 2-hour cooldown per type per member
} as const;

/**
 * Streak mechanics -- flexible scoring, not binary pass/fail.
 * Designed to avoid "what-the-hell effect" from rigid streak systems.
 */
export const STREAK_CONFIG = {
  graceDaysPerWeek: 2, // Can miss 2 days per week without breaking streak
  decayRate: 0.5, // Missing beyond grace days halves streak multiplier (not reset)
  recoverBonus: 15, // XP bonus for "coming back" after missing days
  maxMultiplier: 3.0, // Streak multiplier caps at 3x
  multiplierGrowth: 0.1, // +0.1x per consecutive day (1.0 -> 1.1 -> 1.2 ... -> 3.0)
} as const;
