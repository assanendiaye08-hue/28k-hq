/**
 * Reminder Scheduler Engine
 *
 * Manages the lifecycle of scheduled reminders:
 * - One-shot reminders via setTimeout (with 32-bit overflow protection)
 * - Recurring reminders via node-cron with timezone support
 * - High-urgency repeat chains (3 repeats at 5-min intervals)
 * - Hourly sweep for far-future reminders outside setTimeout range
 * - Restart recovery from DB state
 *
 * All reminder firings are fire-and-forget: wrapped in try/catch,
 * failures are logged but never thrown. A failed delivery must not
 * block other reminders.
 */

import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import type { Client } from 'discord.js';
import type { ExtendedPrismaClient } from '../../db/client.js';
import { REMINDER_DEFAULTS, BUTTON_IDS } from './constants.js';
import {
  buildHighUrgencyButtons,
  buildRecurringButtons,
  buildRecurringHighUrgencyButtons,
} from './buttons.js';
import type { DiscordReminderDelivery } from './delivery.js';

// ─── Types ──────────────────────────────────────────────────────────────────────

interface ReminderRecord {
  id: string;
  memberId: string;
  content: string;
  urgency: 'LOW' | 'HIGH';
  fireAt: Date | null;
  cronExpression: string | null;
  status: string;
  skipUntil: Date | null;
  repeatCount: number;
  acknowledged: boolean;
  dmMessageId: string | null;
}

// ─── In-Memory State ────────────────────────────────────────────────────────────

/** Active one-shot reminder timeouts. */
const pendingTimeouts = new Map<string, NodeJS.Timeout>();

/** Active high-urgency repeat chains (multiple timeouts per reminder). */
const pendingRepeats = new Map<string, NodeJS.Timeout[]>();

/** Active recurring reminder cron tasks. */
const activeCronTasks = new Map<string, ScheduledTask>();

/** Sweep interval reference for cleanup. */
let sweepInterval: NodeJS.Timeout | null = null;

// ─── Fire Reminder ──────────────────────────────────────────────────────────────

/**
 * Fire a reminder: deliver to member, handle high-urgency repeats, update DB.
 * Fire-and-forget: all errors are caught and logged, never thrown.
 */
async function fireReminder(
  reminder: ReminderRecord,
  delivery: DiscordReminderDelivery,
  db: ExtendedPrismaClient,
  _client: Client,
  options?: { isDelayed?: boolean },
): Promise<void> {
  try {
    // Build appropriate buttons based on urgency and recurrence
    const isRecurring = !!reminder.cronExpression;
    let buttons;

    if (reminder.urgency === 'HIGH' && isRecurring) {
      buttons = buildRecurringHighUrgencyButtons();
    } else if (reminder.urgency === 'HIGH') {
      buttons = buildHighUrgencyButtons();
    } else if (isRecurring) {
      buttons = buildRecurringButtons();
    }

    // Deliver the reminder
    const result = await delivery.deliver(
      reminder.memberId,
      reminder.content,
      reminder.urgency,
      { buttons, isDelayed: options?.isDelayed },
    );

    // Update DB with message ID for button tracking
    if (result.messageId) {
      await db.reminder.update({
        where: { id: reminder.id },
        data: { dmMessageId: result.messageId },
      }).catch(() => {});
    }

    // For one-shot reminders: mark as FIRED
    if (!isRecurring) {
      await db.reminder.update({
        where: { id: reminder.id },
        data: { status: 'FIRED' },
      }).catch(() => {});

      // Clean up in-memory state
      pendingTimeouts.delete(reminder.id);
    }

    // High urgency: schedule repeat chain if not acknowledged
    if (reminder.urgency === 'HIGH' && !reminder.acknowledged) {
      scheduleRepeatChain(reminder, delivery, db, _client);
    }
  } catch (error) {
    console.error(`[Reminders] Failed to fire reminder ${reminder.id}:`, error);
  }
}

/**
 * Schedule a repeat chain for high-urgency reminders.
 * Sends up to maxRepeatCount repeats at repeatIntervalMs intervals.
 * Stops immediately if the reminder is acknowledged.
 */
function scheduleRepeatChain(
  reminder: ReminderRecord,
  delivery: DiscordReminderDelivery,
  db: ExtendedPrismaClient,
  client: Client,
): void {
  const timeouts: NodeJS.Timeout[] = [];

  for (let i = 1; i <= REMINDER_DEFAULTS.maxRepeatCount; i++) {
    const timeout = setTimeout(async () => {
      try {
        // Check if already acknowledged before repeating
        const current = await db.reminder.findUnique({
          where: { id: reminder.id },
        });

        if (!current || current.acknowledged) {
          // Already acknowledged -- clear remaining repeats
          clearRepeatChain(reminder.id);
          return;
        }

        // Build buttons for repeat
        const isRecurring = !!reminder.cronExpression;
        let buttons;
        if (reminder.urgency === 'HIGH' && isRecurring) {
          buttons = buildRecurringHighUrgencyButtons();
        } else {
          buttons = buildHighUrgencyButtons();
        }

        // Deliver repeat
        const result = await delivery.deliver(
          reminder.memberId,
          reminder.content,
          'HIGH',
          { buttons },
        );

        // Update DB with new message ID and repeat count
        await db.reminder.update({
          where: { id: reminder.id },
          data: {
            repeatCount: { increment: 1 },
            ...(result.messageId ? { dmMessageId: result.messageId } : {}),
          },
        }).catch(() => {});
      } catch (error) {
        console.error(`[Reminders] Failed to send repeat ${i} for reminder ${reminder.id}:`, error);
      }
    }, REMINDER_DEFAULTS.repeatIntervalMs * i);

    timeouts.push(timeout);
  }

  pendingRepeats.set(reminder.id, timeouts);
}

/**
 * Clear all pending repeat timeouts for a reminder.
 */
function clearRepeatChain(reminderId: string): void {
  const timeouts = pendingRepeats.get(reminderId);
  if (timeouts) {
    for (const timeout of timeouts) {
      clearTimeout(timeout);
    }
    pendingRepeats.delete(reminderId);
  }
}

// ─── Schedule Functions ─────────────────────────────────────────────────────────

/**
 * Schedule a one-shot reminder via setTimeout.
 *
 * - If fireAt is in the past: fire immediately (delayed/missed reminder)
 * - If delay exceeds 32-bit limit (~24.8 days): skip -- hourly sweep picks it up
 * - Otherwise: schedule via setTimeout
 */
export function scheduleOneShot(
  reminder: ReminderRecord,
  delivery: DiscordReminderDelivery,
  db: ExtendedPrismaClient,
  client: Client,
): void {
  if (!reminder.fireAt) return;

  const delayMs = reminder.fireAt.getTime() - Date.now();

  if (delayMs <= 0) {
    // Missed reminder -- fire immediately with delayed flag
    void fireReminder(reminder, delivery, db, client, { isDelayed: true });
    return;
  }

  if (delayMs > REMINDER_DEFAULTS.maxTimeoutMs) {
    // Too far out for setTimeout -- the hourly sweep will pick it up
    return;
  }

  const timeout = setTimeout(() => {
    void fireReminder(reminder, delivery, db, client);
  }, delayMs);

  pendingTimeouts.set(reminder.id, timeout);
}

/**
 * Schedule a recurring reminder via node-cron with timezone support.
 * On each cron fire, checks skipUntil to honor skip-next-occurrence.
 */
export async function scheduleRecurring(
  reminder: ReminderRecord,
  delivery: DiscordReminderDelivery,
  db: ExtendedPrismaClient,
  client: Client,
): Promise<void> {
  if (!reminder.cronExpression) return;

  // Get member timezone from DB
  let timezone = 'UTC';
  try {
    const schedule = await db.memberSchedule.findUnique({
      where: { memberId: reminder.memberId },
    });
    if (schedule?.timezone) {
      timezone = schedule.timezone;
    }
  } catch {
    // Default to UTC
  }

  const task = cron.schedule(reminder.cronExpression, async () => {
    try {
      // Check skipUntil
      const current = await db.reminder.findUnique({
        where: { id: reminder.id },
      });

      if (!current || current.status !== 'ACTIVE') {
        // Reminder was cancelled or removed -- stop the cron task
        cancelReminder(reminder.id);
        return;
      }

      if (current.skipUntil && current.skipUntil > new Date()) {
        // Skip this occurrence and clear skipUntil
        await db.reminder.update({
          where: { id: reminder.id },
          data: { skipUntil: null },
        }).catch(() => {});
        return;
      }

      // Fire the reminder
      await fireReminder(current as ReminderRecord, delivery, db, client);
    } catch (error) {
      console.error(`[Reminders] Recurring reminder error for ${reminder.id}:`, error);
    }
  }, {
    timezone,
    name: `reminder-${reminder.id}`,
  });

  activeCronTasks.set(reminder.id, task);
}

// ─── Cancel / Acknowledge / Skip ────────────────────────────────────────────────

/**
 * Cancel a reminder: clear all in-memory scheduling state.
 * Does NOT update DB -- caller is responsible for DB status update.
 */
export function cancelReminder(reminderId: string): void {
  // Clear one-shot timeout
  const timeout = pendingTimeouts.get(reminderId);
  if (timeout) {
    clearTimeout(timeout);
    pendingTimeouts.delete(reminderId);
  }

  // Clear repeat chain
  clearRepeatChain(reminderId);

  // Stop and destroy cron task
  const cronTask = activeCronTasks.get(reminderId);
  if (cronTask) {
    cronTask.stop();
    activeCronTasks.delete(reminderId);
  }
}

/**
 * Acknowledge a high-urgency reminder: stop all pending repeats.
 */
export async function acknowledgeReminder(
  reminderId: string,
  db: ExtendedPrismaClient,
): Promise<void> {
  // Clear repeat chain immediately
  clearRepeatChain(reminderId);

  // Update DB
  await db.reminder.update({
    where: { id: reminderId },
    data: { acknowledged: true },
  }).catch(() => {});
}

/**
 * Skip the next occurrence of a recurring reminder.
 * Sets skipUntil so the cron callback silently skips once.
 *
 * Duration is cron-aware: daily reminders (day-of-week = *) skip ~23 hours,
 * weekly reminders (specific day-of-week) skip ~6 days 23 hours.
 */
export async function skipNextOccurrence(
  reminderId: string,
  db: ExtendedPrismaClient,
  cronExpression?: string | null,
): Promise<void> {
  // Determine skip duration based on cron expression.
  // Cron format: minute hour * * dayOfWeek
  // If day-of-week is '*' (or no cron), it's daily -> skip 23 hours.
  // If day-of-week is specific (e.g., '1' for Monday), it's weekly -> skip ~6d 23h.
  const isWeekly = cronExpression ? cronExpression.split(' ')[4] !== '*' : false;
  const skipMs = isWeekly
    ? (6 * 24 + 23) * 3600_000    // ~6 days 23 hours for weekly
    : 23 * 3600_000;               // ~23 hours for daily

  const skipUntil = new Date(Date.now() + skipMs);

  await db.reminder.update({
    where: { id: reminderId },
    data: { skipUntil },
  }).catch(() => {});
}

// ─── Recovery & Sweep ───────────────────────────────────────────────────────────

/**
 * Recover all pending reminders from DB on bot restart.
 * - One-shot: re-schedule (fires immediately if missed during downtime)
 * - Recurring: re-create cron tasks
 *
 * @returns Object with counts of recovered reminders
 */
export async function recoverReminders(
  db: ExtendedPrismaClient,
  client: Client,
  delivery: DiscordReminderDelivery,
): Promise<{ oneShotCount: number; recurringCount: number }> {
  let oneShotCount = 0;
  let recurringCount = 0;

  try {
    // Recover one-shot reminders
    const pendingOneShot = await db.reminder.findMany({
      where: {
        status: 'PENDING',
        cronExpression: null,
      },
    });

    for (const reminder of pendingOneShot) {
      scheduleOneShot(reminder as ReminderRecord, delivery, db, client);
      oneShotCount++;
    }

    // Recover recurring reminders
    const activeRecurring = await db.reminder.findMany({
      where: {
        status: 'ACTIVE',
        cronExpression: { not: null },
      },
    });

    for (const reminder of activeRecurring) {
      await scheduleRecurring(reminder as ReminderRecord, delivery, db, client);
      recurringCount++;
    }
  } catch (error) {
    console.error('[Reminders] Error during recovery:', error);
  }

  return { oneShotCount, recurringCount };
}

/**
 * Start the hourly sweep for far-future reminders.
 * Picks up reminders whose fireAt is within the next 2 hours
 * but not yet scheduled via setTimeout.
 */
export function startSweep(
  db: ExtendedPrismaClient,
  client: Client,
  delivery: DiscordReminderDelivery,
): void {
  sweepInterval = setInterval(async () => {
    try {
      const now = new Date();
      const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);

      // Find pending one-shot reminders within the next 2 hours
      // that are not already scheduled
      const upcoming = await db.reminder.findMany({
        where: {
          status: 'PENDING',
          cronExpression: null,
          fireAt: {
            gte: now,
            lte: twoHoursFromNow,
          },
        },
      });

      for (const reminder of upcoming) {
        // Skip if already scheduled
        if (pendingTimeouts.has(reminder.id)) continue;

        scheduleOneShot(reminder as ReminderRecord, delivery, db, client);
      }
    } catch (error) {
      console.error('[Reminders] Sweep error:', error);
    }
  }, REMINDER_DEFAULTS.sweepIntervalMs);
}
