/**
 * Leaderboard Calculator
 *
 * Query functions for three leaderboard dimensions:
 * 1. XP -- lifetime (Member.totalXp) or seasonal (XPTransaction sum)
 * 2. Voice Hours -- seasonal (VoiceSession.durationMinutes sum)
 * 3. Streaks -- lifetime (Member.currentStreak)
 *
 * All functions accept the extended Prisma client and return
 * a uniform { position, memberId, displayName, value } shape.
 */

import type { ExtendedPrismaClient } from '../../db/client.js';
import { TOP_N } from './constants.js';

/** Shape of a single leaderboard entry. */
export interface LeaderboardEntry {
  position: number;
  memberId: string;
  displayName: string;
  value: number;
}

/** Options for date-scoped queries. */
export interface SeasonOptions {
  seasonStart?: Date;
  seasonEnd?: Date;
  limit?: number;
}

/**
 * Get XP leaderboard.
 *
 * - With season dates: sums XPTransaction amounts within the range.
 * - Without season dates: uses cached Member.totalXp (lifetime).
 */
export async function getXPLeaderboard(
  db: ExtendedPrismaClient,
  options?: SeasonOptions,
): Promise<LeaderboardEntry[]> {
  const limit = options?.limit ?? TOP_N;

  if (options?.seasonStart && options?.seasonEnd) {
    // Seasonal: aggregate XPTransaction within date range
    const grouped = await db.xPTransaction.groupBy({
      by: ['memberId'],
      where: {
        createdAt: {
          gte: options.seasonStart,
          lte: options.seasonEnd,
        },
      },
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
      take: limit,
    });

    // Fetch display names for the grouped members
    const memberIds = grouped.map((g) => g.memberId);
    const members = await db.member.findMany({
      where: { id: { in: memberIds } },
      select: { id: true, displayName: true },
    });
    const nameMap = new Map(members.map((m) => [m.id, m.displayName]));

    return grouped.map((g, i) => ({
      position: i + 1,
      memberId: g.memberId,
      displayName: nameMap.get(g.memberId) ?? 'Unknown',
      value: g._sum.amount ?? 0,
    }));
  }

  // Lifetime: use cached totalXp
  const topMembers = await db.member.findMany({
    orderBy: { totalXp: 'desc' },
    take: limit,
    select: { id: true, displayName: true, totalXp: true },
  });

  return topMembers.map((m, i) => ({
    position: i + 1,
    memberId: m.id,
    displayName: m.displayName,
    value: m.totalXp,
  }));
}

/**
 * Get voice hours leaderboard.
 *
 * Aggregates VoiceSession.durationMinutes for completed sessions.
 * Always seasonal (or all-time if no dates provided).
 */
export async function getVoiceLeaderboard(
  db: ExtendedPrismaClient,
  options?: SeasonOptions,
): Promise<LeaderboardEntry[]> {
  const limit = options?.limit ?? TOP_N;

  const whereClause: Record<string, unknown> = {
    endedAt: { not: null },
    durationMinutes: { not: null },
  };

  if (options?.seasonStart) {
    whereClause.startedAt = { gte: options.seasonStart };
  }
  if (options?.seasonEnd) {
    whereClause.endedAt = {
      ...(whereClause.endedAt as Record<string, unknown>),
      lte: options.seasonEnd,
    };
  }

  const grouped = await db.voiceSession.groupBy({
    by: ['memberId'],
    where: whereClause,
    _sum: { durationMinutes: true },
    orderBy: { _sum: { durationMinutes: 'desc' } },
    take: limit,
  });

  // Fetch display names
  const memberIds = grouped.map((g) => g.memberId);
  const members = await db.member.findMany({
    where: { id: { in: memberIds } },
    select: { id: true, displayName: true },
  });
  const nameMap = new Map(members.map((m) => [m.id, m.displayName]));

  return grouped.map((g, i) => ({
    position: i + 1,
    memberId: g.memberId,
    displayName: nameMap.get(g.memberId) ?? 'Unknown',
    value: g._sum.durationMinutes ?? 0,
  }));
}

/**
 * Get streak leaderboard.
 *
 * Streaks are NOT seasonal -- they represent lifetime consistency.
 * Uses Member.currentStreak ordered desc.
 */
export async function getStreakLeaderboard(
  db: ExtendedPrismaClient,
  limit: number = TOP_N,
): Promise<LeaderboardEntry[]> {
  const topMembers = await db.member.findMany({
    orderBy: { currentStreak: 'desc' },
    take: limit,
    where: { currentStreak: { gt: 0 } },
    select: { id: true, displayName: true, currentStreak: true },
  });

  return topMembers.map((m, i) => ({
    position: i + 1,
    memberId: m.id,
    displayName: m.displayName,
    value: m.currentStreak,
  }));
}

/**
 * Get a member's position in a given leaderboard dimension.
 *
 * Counts how many members rank higher, then returns position (1-based).
 * Used by /leaderboard to show "Your position: #X" when not in top 10.
 */
export async function getMemberPosition(
  db: ExtendedPrismaClient,
  memberId: string,
  dimension: 'xp' | 'voice' | 'streaks',
  options?: SeasonOptions,
): Promise<number> {
  if (dimension === 'xp') {
    if (options?.seasonStart && options?.seasonEnd) {
      // Seasonal XP: count members with higher seasonal XP sum
      const memberSum = await db.xPTransaction.aggregate({
        where: {
          memberId,
          createdAt: { gte: options.seasonStart, lte: options.seasonEnd },
        },
        _sum: { amount: true },
      });
      const myValue = memberSum._sum.amount ?? 0;

      // Count members with a higher seasonal sum using raw aggregation
      // We need to get all member sums and count those above ours
      const allSums = await db.xPTransaction.groupBy({
        by: ['memberId'],
        where: {
          createdAt: { gte: options.seasonStart, lte: options.seasonEnd },
        },
        _sum: { amount: true },
      });

      const higherCount = allSums.filter(
        (s) => (s._sum.amount ?? 0) > myValue,
      ).length;
      return higherCount + 1;
    }

    // Lifetime XP
    const member = await db.member.findUnique({
      where: { id: memberId },
      select: { totalXp: true },
    });
    if (!member) return 0;

    const higherCount = await db.member.count({
      where: { totalXp: { gt: member.totalXp } },
    });
    return higherCount + 1;
  }

  if (dimension === 'voice') {
    const whereClause: Record<string, unknown> = {
      memberId,
      endedAt: { not: null },
      durationMinutes: { not: null },
    };
    if (options?.seasonStart) {
      whereClause.startedAt = { gte: options.seasonStart };
    }
    if (options?.seasonEnd) {
      whereClause.endedAt = { not: null, lte: options.seasonEnd };
    }

    const memberSum = await db.voiceSession.aggregate({
      where: whereClause,
      _sum: { durationMinutes: true },
    });
    const myValue = memberSum._sum.durationMinutes ?? 0;

    // Get all member voice sums
    const allWhereClause: Record<string, unknown> = {
      endedAt: { not: null },
      durationMinutes: { not: null },
    };
    if (options?.seasonStart) {
      allWhereClause.startedAt = { gte: options.seasonStart };
    }
    if (options?.seasonEnd) {
      allWhereClause.endedAt = { not: null, lte: options.seasonEnd };
    }

    const allSums = await db.voiceSession.groupBy({
      by: ['memberId'],
      where: allWhereClause,
      _sum: { durationMinutes: true },
    });

    const higherCount = allSums.filter(
      (s) => (s._sum.durationMinutes ?? 0) > myValue,
    ).length;
    return higherCount + 1;
  }

  // Streaks (lifetime only)
  const member = await db.member.findUnique({
    where: { id: memberId },
    select: { currentStreak: true },
  });
  if (!member) return 0;

  const higherCount = await db.member.count({
    where: { currentStreak: { gt: member.currentStreak } },
  });
  return higherCount + 1;
}
