/**
 * Timer CRUD Routes
 *
 * POST /       - Create a new timer session
 * PATCH /:id   - Update timer (pause/resume/stop)
 * GET /active  - Get current active timer
 * GET /history - Get completed session history
 *
 * All routes require JWT authentication.
 * Stop action awards XP using shared awardXP() with daily cap enforcement.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import {
  awardXP,
  XP_AWARDS,
  TIMER_DEFAULTS,
} from '@28k/shared';

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const createTimerSchema = z.object({
  mode: z.enum(['POMODORO', 'PROPORTIONAL']),
  workDuration: z
    .number()
    .min(TIMER_DEFAULTS.minWorkMinutes)
    .max(TIMER_DEFAULTS.maxWorkMinutes)
    .optional()
    .default(TIMER_DEFAULTS.defaultWorkMinutes),
  breakDuration: z
    .number()
    .min(TIMER_DEFAULTS.minBreakMinutes)
    .max(TIMER_DEFAULTS.maxBreakMinutes)
    .optional()
    .default(TIMER_DEFAULTS.defaultBreakMinutes),
  breakRatio: z.number().optional().default(TIMER_DEFAULTS.defaultBreakRatio),
  focus: z.string().max(200).optional(),
  goalId: z.string().optional(),
  targetSessions: z.number().int().min(1).max(12).nullish(),
  longBreakDuration: z.number().int().min(1).max(60).nullish(),
  longBreakInterval: z.number().int().min(1).max(12).nullish(),
});

const updateTimerSchema = z.object({
  action: z.enum(['pause', 'resume', 'stop']),
  focus: z.string().max(200).optional(),
  remainingMs: z.number().int().optional(),
  totalWorkedMs: z.number().int().optional(),
  totalBreakMs: z.number().int().optional(),
  pomodoroCount: z.number().int().optional(),
  timerState: z.string().optional(),
});

const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(10),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

// ─── Plugin ──────────────────────────────────────────────────────────────────

export default async function timerRoutes(fastify: FastifyInstance) {
  // All routes in this plugin require authentication
  fastify.addHook('preHandler', authenticate);

  // ── POST / ── Create timer session
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createTimerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request body', details: parsed.error.flatten() });
    }

    const { mode, workDuration, breakDuration, breakRatio, focus, goalId, targetSessions, longBreakDuration, longBreakInterval } = parsed.data;

    // Check for existing active timer (one-per-member enforcement)
    const existing = await fastify.db.timerSession.findFirst({
      where: { memberId: request.memberId, status: 'ACTIVE' },
    });

    if (existing) {
      // Auto-cancel stale session instead of rejecting
      await fastify.db.timerSession.update({
        where: { id: existing.id },
        data: { status: 'COMPLETED', endedAt: new Date() },
      });
    }

    // If goalId provided, verify it belongs to this member and is ACTIVE
    if (goalId) {
      const goal = await fastify.db.goal.findUnique({ where: { id: goalId } });
      if (!goal || goal.memberId !== request.memberId) {
        return reply.status(404).send({ error: 'Goal not found' });
      }
      if (goal.status !== 'ACTIVE') {
        return reply.status(400).send({ error: 'Goal is not active' });
      }
    }

    // Link to current active season if one exists
    const activeSeason = await fastify.db.season.findFirst({ where: { active: true } });

    const session = await fastify.db.timerSession.create({
      data: {
        memberId: request.memberId,
        mode,
        status: 'ACTIVE',
        focus: focus ?? null,
        goalId: goalId ?? null,
        workDuration,
        breakDuration,
        breakRatio,
        targetSessions: targetSessions ?? null,
        longBreakDuration: longBreakDuration ?? null,
        longBreakInterval: longBreakInterval ?? null,
        source: 'DESKTOP',
        timerState: 'working',
        lastStateChangeAt: new Date(),
        seasonId: activeSeason?.id ?? null,
      },
    });

    return reply.status(201).send(session);
  });

  // ── PATCH /:id ── Update timer (pause/resume/stop)
  fastify.patch('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const parsed = updateTimerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request body', details: parsed.error.flatten() });
    }

    const { action, focus, remainingMs, totalWorkedMs, totalBreakMs, pomodoroCount, timerState } = parsed.data;
    const { id } = request.params;

    // Find session
    const session = await fastify.db.timerSession.findUnique({ where: { id } });
    if (!session) {
      return reply.status(404).send({ error: 'Timer session not found' });
    }

    // Verify ownership
    if (session.memberId !== request.memberId) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    // Verify session is active
    if (session.status !== 'ACTIVE') {
      return reply.status(400).send({ error: 'Timer session is not active' });
    }

    // Optional focus update on any action
    const focusUpdate = focus !== undefined ? { focus } : {};

    if (action === 'pause') {
      const updated = await fastify.db.timerSession.update({
        where: { id },
        data: {
          timerState: 'paused',
          prePauseState: timerState || 'working',
          remainingMs: remainingMs ?? null,
          lastStateChangeAt: new Date(),
          totalWorkedMs: totalWorkedMs ?? session.totalWorkedMs,
          totalBreakMs: totalBreakMs ?? session.totalBreakMs,
          pomodoroCount: pomodoroCount ?? session.pomodoroCount,
          ...focusUpdate,
        },
      });
      return reply.status(200).send(updated);
    }

    if (action === 'resume') {
      const updated = await fastify.db.timerSession.update({
        where: { id },
        data: {
          timerState: session.prePauseState || 'working',
          prePauseState: null,
          remainingMs: null,
          lastStateChangeAt: new Date(),
          ...focusUpdate,
        },
      });
      return reply.status(200).send(updated);
    }

    if (action === 'stop') {
      const finalWorkedMs = totalWorkedMs ?? session.totalWorkedMs;
      const finalBreakMs = totalBreakMs ?? session.totalBreakMs;
      const finalPomodoroCount = pomodoroCount ?? session.pomodoroCount;

      // Update session to COMPLETED
      const updated = await fastify.db.timerSession.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          timerState: null,
          endedAt: new Date(),
          totalWorkedMs: finalWorkedMs,
          totalBreakMs: finalBreakMs,
          pomodoroCount: finalPomodoroCount,
          lastStateChangeAt: new Date(),
          ...focusUpdate,
        },
      });

      // Calculate XP: 1 XP per 5 minutes of work, minimum 5 min to earn any
      const minWorkMs = TIMER_DEFAULTS.minWorkMinutes * 60 * 1000;
      let xpAmount = 0;
      let xpResult = null;

      if (finalWorkedMs >= minWorkMs) {
        xpAmount = Math.floor(finalWorkedMs / (5 * 60 * 1000)) * XP_AWARDS.timer.xpPer5Minutes;

        // Daily cap enforcement: check today's existing timer XP
        const startOfToday = new Date();
        startOfToday.setUTCHours(0, 0, 0, 0);

        const todaySessions = await fastify.db.timerSession.findMany({
          where: {
            memberId: request.memberId,
            status: 'COMPLETED',
            endedAt: { gte: startOfToday },
            id: { not: id }, // exclude current session
          },
          select: { xpAwarded: true },
        });

        const todayXpUsed = todaySessions.reduce((sum, s) => sum + s.xpAwarded, 0);
        const remaining = Math.max(0, XP_AWARDS.timer.dailyCap - todayXpUsed);
        xpAmount = Math.min(xpAmount, remaining);

        if (xpAmount > 0) {
          xpResult = await awardXP(
            fastify.db,
            request.memberId,
            xpAmount,
            'TIMER_SESSION',
            `Desktop timer session: ${updated.focus || 'focused work'}`,
          );

          // Update session's xpAwarded field
          await fastify.db.timerSession.update({
            where: { id },
            data: { xpAwarded: xpAmount },
          });
        }
      }

      return reply.status(200).send({
        ...updated,
        xpAwarded: xpAmount,
        leveledUp: xpResult?.leveledUp ?? false,
        newRank: xpResult?.newRank ?? null,
      });
    }
  });

  // ── GET /active ── Get active timer
  fastify.get('/active', async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await fastify.db.timerSession.findFirst({
      where: { memberId: request.memberId, status: 'ACTIVE' },
    });

    return reply.status(200).send({ active: session ?? null });
  });

  // ── GET /history ── Recent completed sessions
  fastify.get('/history', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = historyQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid query parameters', details: parsed.error.flatten() });
    }

    const { limit, offset } = parsed.data;

    const [sessions, count] = await Promise.all([
      fastify.db.timerSession.findMany({
        where: { memberId: request.memberId, status: 'COMPLETED' },
        orderBy: { endedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      fastify.db.timerSession.count({
        where: { memberId: request.memberId, status: 'COMPLETED' },
      }),
    ]);

    return reply.status(200).send({ sessions, count });
  });
}
