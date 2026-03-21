/**
 * Dashboard Route
 *
 * GET / - Returns aggregated dashboard data for the authenticated user:
 *   member stats, rank info, goals (today + weekly), active timer,
 *   today's check-in count, and daily quote.
 *
 * Requires JWT authentication.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import { getRankForXP, getNextRankInfo } from '@28k/shared';
import { getDailyQuote } from '../lib/quotes.js';

/** Reusable Prisma include for loading a goal tree 4 levels deep. */
const goalTreeInclude = {
  children: {
    include: {
      children: {
        include: {
          children: true,
        },
      },
    },
  },
};

export default async function dashboardRoutes(fastify: FastifyInstance) {
  // All routes in this plugin require authentication
  fastify.addHook('preHandler', authenticate);

  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);

    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setUTCDate(sevenDaysFromNow.getUTCDate() + 7);

    // Parallel queries for dashboard data
    const [member, goals, activeTimer, todayCheckins] = await Promise.all([
      fastify.db.member.findUnique({
        where: { id: request.memberId },
      }),
      fastify.db.goal.findMany({
        where: {
          memberId: request.memberId,
          status: 'ACTIVE',
          parentId: null,
        },
        include: goalTreeInclude,
        orderBy: { deadline: 'asc' },
      }),
      fastify.db.timerSession.findFirst({
        where: { memberId: request.memberId, status: 'ACTIVE' },
      }),
      fastify.db.checkIn.findMany({
        where: {
          memberId: request.memberId,
          createdAt: { gte: startOfToday },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    if (!member) {
      return reply.status(404).send({ error: 'Member not found' });
    }

    // Compute rank info
    const rank = getRankForXP(member.totalXp);
    const nextRank = getNextRankInfo(member.totalXp);

    // Filter goals into categories
    const todayGoals = goals.filter((g) => {
      // Weekly goals or goals with deadlines within 7 days
      return g.timeframe === 'WEEKLY' || (g.deadline && g.deadline <= sevenDaysFromNow);
    });

    const weeklyGoals = goals.filter((g) => g.timeframe === 'WEEKLY');

    return reply.status(200).send({
      member: {
        displayName: member.displayName,
        totalXp: member.totalXp,
        currentStreak: member.currentStreak,
        longestStreak: member.longestStreak,
        rank: rank.name,
        rankColor: rank.color,
        nextRank,
      },
      goals: {
        today: todayGoals,
        weekly: weeklyGoals,
      },
      timer: activeTimer ?? null,
      todayCheckins: todayCheckins.length,
      quote: getDailyQuote(),
    });
  });
}
