/**
 * Goal hierarchy engine -- cascading progress, tree queries, depth validation.
 *
 * Supports optional parent-child relationships between goals:
 * - Top-level (parentId: null, depth: 0) = standalone goals (v1.0 behavior)
 * - Nested (depth 1-3) = sub-goals linked to a parent
 *
 * When a child goal completes, recalculateParentProgress walks up the tree,
 * updating each ancestor's currentValue to the percentage of completed
 * countable children. If all countable children are complete, the parent
 * auto-completes with reduced XP (50 vs 100/75 for manual completion).
 *
 * Countable children: status in [ACTIVE, EXTENDED, COMPLETED].
 * Excluded: MISSED children are excluded from the ratio entirely.
 */

import { endOfWeek, endOfMonth, endOfQuarter, endOfYear } from 'date-fns';
import type { ExtendedPrismaClient } from '../../db/client.js';
import type { IEventBus } from '../../shared/types.js';
import { awardXP } from '../xp/engine.js';
import { XP_AWARDS } from '../xp/constants.js';

// ─── Constants ──────────────────────────────────────────────────────────────────

/** Maximum nesting depth (0-indexed). 4 levels total: 0, 1, 2, 3. */
export const MAX_GOAL_DEPTH = 3;

/**
 * Reusable Prisma include for loading a goal tree 4 levels deep.
 * Use with db.goal.findUnique({ include: goalTreeInclude }) or spread into includes.
 */
export const goalTreeInclude = {
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

// ─── Validation ─────────────────────────────────────────────────────────────────

/**
 * Check whether a child can be added under a parent at the given depth.
 *
 * @param parentDepth - The depth of the parent goal (0 = top-level)
 * @returns true if a child can be added (parentDepth < MAX_GOAL_DEPTH)
 */
export function validateGoalDepth(parentDepth: number): boolean {
  return parentDepth < MAX_GOAL_DEPTH;
}

// ─── Timeframe Deadlines ────────────────────────────────────────────────────────

/**
 * Get the natural deadline for a timeframe level.
 *
 * @param timeframe - One of YEARLY, QUARTERLY, MONTHLY, WEEKLY
 * @returns End-of-period Date for the given timeframe
 */
export function getTimeframeDeadline(timeframe: string): Date {
  const now = new Date();
  switch (timeframe) {
    case 'YEARLY':
      return endOfYear(now);
    case 'QUARTERLY':
      return endOfQuarter(now);
    case 'MONTHLY':
      return endOfMonth(now);
    case 'WEEKLY':
      return endOfWeek(now, { weekStartsOn: 1 }); // Monday-based weeks, ends Sunday
    default:
      return endOfMonth(now); // Fallback to monthly
  }
}

// ─── Cascading Progress ─────────────────────────────────────────────────────────

/**
 * Recalculate a parent goal's progress based on its children's completion.
 *
 * Walks up the tree recursively -- if a parent has its own parent,
 * that ancestor is recalculated too.
 *
 * Countable statuses: ACTIVE, EXTENDED, COMPLETED.
 * Excluded: MISSED children are not counted in the ratio.
 *
 * When all countable children are complete (100%), the parent auto-completes
 * with reduced XP (parentAutoComplete = 50).
 *
 * @param db - Extended Prisma client
 * @param parentId - The parent goal ID to recalculate
 * @param events - Event bus for emitting goalCompleted
 */
export async function recalculateParentProgress(
  db: ExtendedPrismaClient,
  parentId: string,
  events: IEventBus,
): Promise<void> {
  // Load parent with its children
  const parent = await db.goal.findUnique({
    where: { id: parentId },
    include: { children: true },
  });

  if (!parent || parent.children.length === 0) return;

  // Filter countable children (exclude MISSED)
  const countable = parent.children.filter((c) =>
    ['ACTIVE', 'EXTENDED', 'COMPLETED'].includes(c.status),
  );

  // If no countable children, don't auto-fail parent
  if (countable.length === 0) return;

  const completedCount = countable.filter((c) => c.status === 'COMPLETED').length;
  const percentage = Math.round((completedCount / countable.length) * 100);

  // Update parent's currentValue to the percentage
  if (completedCount === countable.length) {
    // All countable children complete -- auto-complete parent
    await db.goal.update({
      where: { id: parentId },
      data: {
        currentValue: 100,
        status: 'COMPLETED',
        completedAt: new Date(),
        xpAwarded: XP_AWARDS.goal.parentAutoComplete,
      },
    });

    // Award reduced XP for auto-completed parent
    await awardXP(
      db,
      parent.memberId,
      XP_AWARDS.goal.parentAutoComplete,
      'GOAL_COMPLETE',
      `Auto-completed parent goal: ${parent.title}`,
    );

    // Emit goalCompleted event
    events.emit('goalCompleted', {
      memberId: parent.memberId,
      goalId: parent.id,
      title: parent.title,
      autoCompleted: true,
    });
  } else {
    // Partial progress -- update currentValue only
    await db.goal.update({
      where: { id: parentId },
      data: { currentValue: percentage },
    });
  }

  // Recurse up the tree if parent has its own parent
  if (parent.parentId) {
    await recalculateParentProgress(db, parent.parentId, events);
  }
}
