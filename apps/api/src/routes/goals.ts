/**
 * Goals Routes
 *
 * GET /      - List goal hierarchy (top-level goals with nested children)
 * POST /     - Create a goal (with optional parent for hierarchy)
 * PATCH /:id - Update progress or complete a goal
 * GET /:id   - Get single goal with children
 *
 * All routes require JWT authentication.
 * Goal completion awards XP using shared awardXP().
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { awardXP, XP_AWARDS } from '@28k/shared';

/** Maximum nesting depth (0-indexed). 4 levels total: 0, 1, 2, 3. */
const MAX_GOAL_DEPTH = 3;

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

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const listGoalsQuerySchema = z.object({
  timeframe: z.enum(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']).optional(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'MISSED', 'EXTENDED']).optional(),
});

const createGoalSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  type: z.enum(['MEASURABLE', 'FREETEXT']),
  targetValue: z.number().int().optional(),
  unit: z.string().optional(),
  deadline: z.string(), // ISO date string
  timeframe: z.enum(['YEARLY', 'QUARTERLY', 'MONTHLY', 'WEEKLY']).optional(),
  parentId: z.string().optional(),
});

const updateGoalSchema = z.object({
  currentValue: z.number().int().optional(),
  status: z.enum(['COMPLETED']).optional(),
});

// ─── Plugin ──────────────────────────────────────────────────────────────────

export default async function goalsRoutes(fastify: FastifyInstance) {
  // All routes in this plugin require authentication
  fastify.addHook('preHandler', authenticate);

  // ── GET / ── List goal hierarchy
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = listGoalsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid query parameters', details: parsed.error.flatten() });
    }

    const { timeframe, status } = parsed.data;

    const goals = await fastify.db.goal.findMany({
      where: {
        memberId: request.memberId,
        status: status || undefined,
        timeframe: timeframe || undefined,
        parentId: null, // Top-level only; children load through include
      },
      include: goalTreeInclude,
      orderBy: { deadline: 'asc' },
    });

    return reply.status(200).send(goals);
  });

  // ── POST / ── Create a goal
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createGoalSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request body', details: parsed.error.flatten() });
    }

    const { title, description, type, targetValue, unit, deadline, timeframe, parentId } = parsed.data;

    // Validate: MEASURABLE goals require targetValue
    if (type === 'MEASURABLE' && (targetValue === undefined || targetValue === null)) {
      return reply.status(400).send({ error: 'targetValue is required for MEASURABLE goals' });
    }

    let depth = 0;

    if (parentId) {
      const parent = await fastify.db.goal.findUnique({ where: { id: parentId } });
      if (!parent || parent.memberId !== request.memberId) {
        return reply.status(404).send({ error: 'Parent goal not found' });
      }

      depth = parent.depth + 1;
      if (depth > MAX_GOAL_DEPTH) {
        return reply.status(400).send({ error: 'Maximum goal depth exceeded' });
      }
    }

    const goal = await fastify.db.goal.create({
      data: {
        memberId: request.memberId,
        title,
        description: description ?? null,
        type,
        targetValue: targetValue ?? null,
        unit: unit ?? null,
        deadline: new Date(deadline),
        timeframe: timeframe ?? null,
        parentId: parentId ?? null,
        depth,
      },
    });

    return reply.status(201).send(goal);
  });

  // ── PATCH /:id ── Update progress or complete
  fastify.patch('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const parsed = updateGoalSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request body', details: parsed.error.flatten() });
    }

    const { currentValue, status } = parsed.data;
    const { id } = request.params;

    // Find goal and verify ownership
    const goal = await fastify.db.goal.findUnique({ where: { id } });
    if (!goal || goal.memberId !== request.memberId) {
      return reply.status(404).send({ error: 'Goal not found' });
    }
    if (goal.status !== 'ACTIVE') {
      return reply.status(400).send({ error: 'Goal is not active' });
    }

    // ── Completion ──
    if (status === 'COMPLETED') {
      const xpAmount = goal.type === 'MEASURABLE'
        ? XP_AWARDS.goal.measurableComplete
        : XP_AWARDS.goal.freetextComplete;

      const xpResult = await awardXP(
        fastify.db,
        request.memberId,
        xpAmount,
        'GOAL_COMPLETE',
        `Completed goal: ${goal.title}`,
      );

      const updated = await fastify.db.goal.update({
        where: { id },
        data: {
          currentValue: goal.targetValue || 100,
          status: 'COMPLETED',
          completedAt: new Date(),
          xpAwarded: xpAmount,
        },
      });

      return reply.status(200).send({ ...updated, xpResult });
    }

    // ── Progress update (not completion) ──
    if (currentValue !== undefined) {
      const xpResult = await awardXP(
        fastify.db,
        request.memberId,
        XP_AWARDS.goal.progressUpdate,
        'GOAL_COMPLETE',
        `Progress on: ${goal.title}`,
      );

      const updated = await fastify.db.goal.update({
        where: { id },
        data: { currentValue },
      });

      return reply.status(200).send({ ...updated, xpResult });
    }

    return reply.status(400).send({ error: 'No updates provided' });
  });

  // ── GET /:id ── Single goal with children
  fastify.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;

    const goal = await fastify.db.goal.findUnique({
      where: { id },
      include: goalTreeInclude,
    });

    if (!goal || goal.memberId !== request.memberId) {
      return reply.status(404).send({ error: 'Goal not found' });
    }

    return reply.status(200).send(goal);
  });
}
