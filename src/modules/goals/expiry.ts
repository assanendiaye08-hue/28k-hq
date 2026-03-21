/**
 * Goal expiry checker with extend option.
 *
 * Called periodically (will be wired to scheduler in Plan 03):
 * 1. Finds goals with status ACTIVE and deadline in the past
 * 2. Sends extend prompt to member's private space
 * 3. Sets status to EXTENDED (24-hour window to respond)
 * 4. On next run: goals still EXTENDED after 24 hours -> MISSED
 *
 * Also provides handleGoalExtension for when a member chooses to extend.
 */

import type { Client } from 'discord.js';
import type { ExtendedPrismaClient } from '../../db/client.js';
import type { IEventBus } from '../../shared/types.js';
import { deliverNotification } from '../notification-router/router.js';
import { infoEmbed } from '../../shared/embeds.js';
import { recalculateParentProgress } from './hierarchy.js';

/**
 * Check for expired goals and handle the extend/miss flow.
 *
 * Two passes:
 * 1. ACTIVE goals past deadline -> send extend prompt, set EXTENDED
 * 2. EXTENDED goals past extendedAt + 24 hours -> set MISSED
 *
 * @param db - Extended Prisma client
 * @param client - Discord.js client for sending messages
 */
export async function checkExpiredGoals(
  db: ExtendedPrismaClient,
  client: Client,
  events?: IEventBus,
): Promise<void> {
  const now = new Date();

  // Pass 1: ACTIVE leaf/standalone goals past deadline -> EXTENDED with extend prompt
  // Parent goals with children are excluded -- their status follows children via cascading.
  const expiredActive = await db.goal.findMany({
    where: {
      status: 'ACTIVE',
      deadline: { lt: now },
      children: { none: {} },
    },
    include: { member: true },
  });

  for (const goal of expiredActive) {
    try {
      // Send extend prompt to private space
      const embed = infoEmbed(
        'Goal expired',
        `Your goal **"${goal.title}"** has passed its deadline.\n\nWould you like to extend it? Use \`/setgoal\` to create a new goal or check \`/goals\` for your active goals.`,
      );

      await deliverNotification(client, db, goal.memberId, 'general', {
        embeds: [embed],
      });

      // Set to EXTENDED with 24-hour window
      await db.goal.update({
        where: { id: goal.id },
        data: {
          status: 'EXTENDED',
          extendedAt: now,
        },
      });
    } catch {
      // If delivery fails, still mark as extended so it gets cleaned up
      await db.goal.update({
        where: { id: goal.id },
        data: {
          status: 'EXTENDED',
          extendedAt: now,
        },
      });
    }
  }

  // Pass 2: EXTENDED leaf/standalone goals past 24-hour window -> MISSED
  // Parent goals excluded -- their status follows children via cascading.
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const expiredExtended = await db.goal.findMany({
    where: {
      status: 'EXTENDED',
      extendedAt: { lt: twentyFourHoursAgo },
      children: { none: {} },
    },
  });

  for (const goal of expiredExtended) {
    await db.goal.update({
      where: { id: goal.id },
      data: { status: 'MISSED' },
    });

    // Recalculate parent progress when a leaf goal is marked MISSED
    // (MISSED children are excluded from countable ratio)
    if (goal.parentId && events) {
      await recalculateParentProgress(db, goal.parentId, events);
    }
  }
}

/**
 * Extend a goal with a new deadline.
 *
 * Resets status to ACTIVE, updates deadline, records extendedAt.
 *
 * @param db - Extended Prisma client
 * @param goalId - The goal to extend
 * @param newDeadline - New deadline date
 * @returns The updated goal
 */
export async function handleGoalExtension(
  db: ExtendedPrismaClient,
  goalId: string,
  newDeadline: Date,
) {
  return db.goal.update({
    where: { id: goalId },
    data: {
      deadline: newDeadline,
      extendedAt: new Date(),
      status: 'ACTIVE',
    },
  });
}
