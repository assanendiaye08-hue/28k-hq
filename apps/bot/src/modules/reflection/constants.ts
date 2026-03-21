/**
 * Reflection System Constants
 *
 * Intensity configuration, timing, and XP amounts for the
 * self-evaluation and reflection system (Phase 12).
 *
 * Intensity levels:
 * - off: No reflections
 * - light: Weekly only (Sunday with planning)
 * - medium: 3 days/week daily + weekly + monthly
 * - heavy: Daily + weekly + monthly
 */

export const REFLECTION_CONFIG = {
  // Intensity -> which reflection types fire
  intensities: {
    off: { daily: false, weekly: false, monthly: false },
    light: { daily: false, weekly: true, monthly: false },
    medium: { daily: true, weekly: true, monthly: true, dailyDaysPerWeek: 3 },
    heavy: { daily: true, weekly: true, monthly: true, dailyDaysPerWeek: 7 },
  },
  // Timing
  dailyCronHour: 20,       // 8 PM member local time for daily
  dailyCronMinute: 0,
  weeklyCronExpr: '0 10 * * 0', // Sunday 10 AM (integrated with planning)
  monthlyCronDay: 28,      // 28th of each month
  monthlyCronHour: 18,     // 6 PM member local time
  // DM flow
  timeoutMs: 5 * 60 * 1000, // 5 min per response
  maxFollowUps: 1,          // 1 follow-up question max
} as const;

export const REFLECTION_XP = {
  daily: 15,
  weekly: 30,
  monthly: 50,
} as const;
