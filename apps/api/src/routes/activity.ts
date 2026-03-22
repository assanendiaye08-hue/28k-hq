/**
 * Activity Routes
 *
 * GET /grinding - Get community members currently in focus sessions or active timers
 *
 * All routes require JWT authentication.
 * Returns other members who are actively working (excludes requesting member).
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';

export default async function activityRoutes(fastify: FastifyInstance) {
  // All routes in this plugin require authentication
  fastify.addHook('preHandler', authenticate);

  // ── GET /grinding ── Who's currently working
  fastify.get('/grinding', async (request: FastifyRequest, reply: FastifyReply) => {
    // Fetch members with inFocusSession=true
    const focusMembers = await fastify.db.member.findMany({
      where: { inFocusSession: true },
      select: { id: true, displayName: true },
    });

    // Fetch active timer sessions with member info
    const activeSessions = await fastify.db.timerSession.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        member: { select: { id: true, displayName: true } },
        focus: true,
        startedAt: true,
      },
    });

    // Build a deduplicated map by memberId
    const grinderMap = new Map<string, { displayName: string; focus: string | null; startedAt: string }>();

    // Add members with active timer sessions (they have focus + startedAt)
    for (const session of activeSessions) {
      if (session.member.id === request.memberId) continue; // Exclude self
      grinderMap.set(session.member.id, {
        displayName: session.member.displayName,
        focus: session.focus,
        startedAt: session.startedAt.toISOString(),
      });
    }

    // Add members with inFocusSession=true who aren't already in the map
    for (const member of focusMembers) {
      if (member.id === request.memberId) continue; // Exclude self
      if (!grinderMap.has(member.id)) {
        grinderMap.set(member.id, {
          displayName: member.displayName,
          focus: null,
          startedAt: new Date().toISOString(),
        });
      }
    }

    const grinders = Array.from(grinderMap.values());

    return reply.status(200).send({ grinders, count: grinders.length });
  });
}
