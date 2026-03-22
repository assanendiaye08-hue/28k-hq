/**
 * Focus Session Routes
 *
 * POST /start  - Set inFocusSession = true (desktop timer started)
 * POST /end    - Set inFocusSession = false (desktop timer stopped)
 * GET  /       - Get current focus status
 *
 * All routes require JWT authentication.
 * Focus state is used by the bot to hold non-critical messages during deep work.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';

export default async function focusRoutes(fastify: FastifyInstance) {
  // All routes in this plugin require authentication
  fastify.addHook('preHandler', authenticate);

  // ── POST /start ── Enter focus mode
  fastify.post('/start', async (request: FastifyRequest, reply: FastifyReply) => {
    await fastify.db.member.update({
      where: { id: request.memberId },
      data: { inFocusSession: true },
    });

    return reply.status(200).send({ inFocusSession: true });
  });

  // ── POST /end ── Exit focus mode
  fastify.post('/end', async (request: FastifyRequest, reply: FastifyReply) => {
    await fastify.db.member.update({
      where: { id: request.memberId },
      data: { inFocusSession: false },
    });

    return reply.status(200).send({ inFocusSession: false });
  });

  // ── GET / ── Get current focus status
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const member = await fastify.db.member.findUnique({
      where: { id: request.memberId },
      select: { inFocusSession: true },
    });

    return reply.status(200).send({ inFocusSession: member?.inFocusSession ?? false });
  });
}
