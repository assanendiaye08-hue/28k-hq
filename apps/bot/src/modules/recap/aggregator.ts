/**
 * Monthly data aggregator for progress recaps.
 *
 * Queries all 6 data sources (check-ins, goals, timer sessions,
 * voice sessions, XP transactions, reflections) for a given month
 * and returns a typed MonthlyRecapData object.
 *
 * Uses Promise.all for parallel queries (same pattern as getCommunityPulse
 * in briefs.ts).
 */

import type { ExtendedPrismaClient } from '@28k/db';

// ─── Types ──────────────────────────────────────────────────────────────────────

/** Aggregated monthly data for a single member's recap. */
export interface MonthlyRecapData {
  /** Check-in stats for the month. */
  checkIns: {
    count: number;
    currentStreak: number;
    longestStreak: number;
    categoryFrequency: Record<string, number>;
  };
  /** Goal progress for the month. */
  goals: {
    completedCount: number;
    activeCount: number;
    newCount: number;
  };
  /** Timer session stats for the month. */
  timers: {
    totalSessions: number;
    totalWorkedMs: number;
    totalBreakMs: number;
    averageSessionMs: number;
    topFocusAreas: Array<{ focus: string; count: number }>;
  };
  /** Voice co-working session stats for the month. */
  voice: {
    totalSessions: number;
    totalMinutes: number;
  };
  /** XP earned during the month. */
  xp: {
    totalEarned: number;
    bySource: Record<string, number>;
  };
  /** Reflection stats for the month. */
  reflections: {
    dailyCount: number;
    weeklyCount: number;
    monthlyCount: number;
    recentInsights: string[];
  };
}

// ─── Aggregator ─────────────────────────────────────────────────────────────────

/**
 * Aggregate all monthly data for a member across all tracked data sources.
 *
 * @param db - Extended Prisma client
 * @param memberId - The member to aggregate data for
 * @param monthStart - Start of the month (inclusive)
 * @param monthEnd - End of the month (inclusive)
 * @returns Aggregated MonthlyRecapData
 */
export async function aggregateMonthlyData(
  db: ExtendedPrismaClient,
  memberId: string,
  monthStart: Date,
  monthEnd: Date,
): Promise<MonthlyRecapData> {
  const dateRange = { gte: monthStart, lte: monthEnd };

  const [
    member,
    checkIns,
    completedGoals,
    activeGoals,
    newGoals,
    timerSessions,
    voiceSessions,
    xpTransactions,
    reflections,
  ] = await Promise.all([
    // Member streak info
    db.member.findUniqueOrThrow({
      where: { id: memberId },
      select: { currentStreak: true, longestStreak: true },
    }),

    // Check-ins in month
    db.checkIn.findMany({
      where: { memberId, createdAt: dateRange },
      select: { categories: true },
    }),

    // Goals completed in month
    db.goal.count({
      where: { memberId, status: 'COMPLETED', completedAt: dateRange },
    }),

    // Currently active goals
    db.goal.count({
      where: { memberId, status: { in: ['ACTIVE', 'EXTENDED'] } },
    }),

    // New goals created in month
    db.goal.count({
      where: { memberId, createdAt: dateRange },
    }),

    // Timer sessions in month
    db.timerSession.findMany({
      where: { memberId, startedAt: dateRange },
      select: { totalWorkedMs: true, totalBreakMs: true, focus: true },
    }),

    // Voice sessions in month
    db.voiceSession.aggregate({
      _count: { id: true },
      _sum: { durationMinutes: true },
      where: { memberId, startedAt: dateRange, durationMinutes: { not: null } },
    }),

    // XP transactions in month
    db.xPTransaction.findMany({
      where: { memberId, createdAt: dateRange },
      select: { amount: true, source: true },
    }),

    // Reflections in month
    db.reflection.findMany({
      where: { memberId, createdAt: dateRange },
      select: { type: true, insights: true },
    }),
  ]);

  // ── Process check-in categories ──
  const categoryFrequency: Record<string, number> = {};
  for (const ci of checkIns) {
    for (const cat of ci.categories) {
      categoryFrequency[cat] = (categoryFrequency[cat] ?? 0) + 1;
    }
  }

  // ── Process timer sessions ──
  const totalWorkedMs = timerSessions.reduce((sum, s) => sum + s.totalWorkedMs, 0);
  const totalBreakMs = timerSessions.reduce((sum, s) => sum + s.totalBreakMs, 0);
  const averageSessionMs = timerSessions.length > 0
    ? Math.round(totalWorkedMs / timerSessions.length)
    : 0;

  // Top focus areas
  const focusCounts: Record<string, number> = {};
  for (const s of timerSessions) {
    const focus = s.focus ?? 'General';
    focusCounts[focus] = (focusCounts[focus] ?? 0) + 1;
  }
  const topFocusAreas = Object.entries(focusCounts)
    .map(([focus, count]) => ({ focus, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // ── Process XP transactions ──
  const totalEarned = xpTransactions.reduce((sum, tx) => sum + tx.amount, 0);
  const bySource: Record<string, number> = {};
  for (const tx of xpTransactions) {
    bySource[tx.source] = (bySource[tx.source] ?? 0) + tx.amount;
  }

  // ── Process reflections ──
  let dailyCount = 0;
  let weeklyCount = 0;
  let monthlyCount = 0;
  const recentInsights: string[] = [];

  for (const ref of reflections) {
    if (ref.type === 'DAILY') dailyCount++;
    else if (ref.type === 'WEEKLY') weeklyCount++;
    else if (ref.type === 'MONTHLY') monthlyCount++;

    if (ref.insights) {
      recentInsights.push(ref.insights);
    }
  }

  // Keep only last 3 insights
  const trimmedInsights = recentInsights.slice(-3);

  return {
    checkIns: {
      count: checkIns.length,
      currentStreak: member.currentStreak,
      longestStreak: member.longestStreak,
      categoryFrequency,
    },
    goals: {
      completedCount: completedGoals,
      activeCount: activeGoals,
      newCount: newGoals,
    },
    timers: {
      totalSessions: timerSessions.length,
      totalWorkedMs,
      totalBreakMs,
      averageSessionMs,
      topFocusAreas,
    },
    voice: {
      totalSessions: voiceSessions._count.id,
      totalMinutes: voiceSessions._sum.durationMinutes ?? 0,
    },
    xp: {
      totalEarned,
      bySource,
    },
    reflections: {
      dailyCount,
      weeklyCount,
      monthlyCount,
      recentInsights: trimmedInsights,
    },
  };
}
