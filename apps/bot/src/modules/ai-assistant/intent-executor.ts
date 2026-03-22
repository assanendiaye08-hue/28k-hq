/**
 * Intent executor with confirmation flow.
 *
 * Manages the confirmation-before-mutation pattern:
 * 1. LLM detects intent and calls a tool
 * 2. System presents a confirmation prompt to the user
 * 3. User confirms (yes) or denies (no)
 * 4. On confirm: execute the DB mutation and reply with result
 * 5. On deny: cancel and reply
 *
 * Pending actions expire after 5 minutes to prevent stale confirmations.
 */

import type { Message, Client } from 'discord.js';
import type { ExtendedPrismaClient } from '@28k/db';
import { TZDate } from '@date-fns/tz';
import { startOfDay, format } from 'date-fns';
import * as chrono from 'chrono-node';
import { extractCategories } from '../checkin/ai-categories.js';
import { updateStreak } from '../checkin/streak.js';
import { awardXP, calculateCheckinXP } from '@28k/shared';
import { parseReminder } from '../reminders/parser.js';
import { scheduleOneShot, scheduleRecurring } from '../reminders/scheduler.js';
import { DiscordReminderDelivery } from '../reminders/delivery.js';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) =>
      `${timestamp as string} [intent-executor] ${level}: ${message as string}`),
  ),
  transports: [new winston.transports.Console()],
});

// ─── Types ──────────────────────────────────────────────────────────────────────

/** A pending action awaiting user confirmation. */
export interface PendingAction {
  tool: string;
  params: Record<string, unknown>;
  confirmMessage: string;
  createdAt: number;
}

// ─── State ──────────────────────────────────────────────────────────────────────

/** Map of memberId to their pending action. Only one pending action per member. */
export const pendingActions = new Map<string, PendingAction>();

/** Time-to-live for pending actions (5 minutes). */
export const PENDING_ACTION_TTL = 5 * 60 * 1000;

// ─── Confirmation Detection ─────────────────────────────────────────────────────

/** Affirmative patterns -- case insensitive, word boundary at start. */
const CONFIRM_PATTERNS = /^(yes|yeah|yep|sure|ok|do it|go ahead|confirm|y)\b/i;

/** Denial patterns -- case insensitive, word boundary at start. */
const DENY_PATTERNS = /^(no|nah|nope|cancel|never mind|nevermind|n)\b/i;

/**
 * Check if text is a confirmation (yes, yeah, yep, sure, etc.).
 */
export function isConfirmation(text: string): boolean {
  return CONFIRM_PATTERNS.test(text.trim());
}

/**
 * Check if text is a denial (no, nah, cancel, etc.).
 */
export function isDenial(text: string): boolean {
  return DENY_PATTERNS.test(text.trim());
}

// ─── Confirmation Message Builder ───────────────────────────────────────────────

/**
 * Build a natural confirmation message for each tool type.
 * These are presented to the user before executing the action.
 */
export function buildConfirmation(toolName: string, params: Record<string, unknown>): string {
  switch (toolName) {
    case 'log_checkin':
      return `Logging check-in: "${params.activity as string}". Sound right?`;

    case 'create_goal':
      return `Creating goal: "${params.title as string}" due ${params.deadline as string}. Confirm?`;

    case 'track_commitment':
      return `Tracking: you'll "${params.what as string}" by ${params.by_when as string}. Got it?`;

    case 'set_reminder': {
      const recurring = params.recurring ? ` (${params.recurring as string})` : '';
      return `Reminder: "${params.content as string}" at ${params.time as string}${recurring}. Set it?`;
    }

    case 'start_brainstorm':
      // Brainstorm doesn't need confirmation
      return `Starting brainstorm on: "${params.topic as string}"`;

    default:
      return `Execute action "${toolName}"? (yes/no)`;
  }
}

// ─── Action Executor ────────────────────────────────────────────────────────────

/**
 * Execute a confirmed pending action.
 *
 * Each tool handler reuses existing business logic from their respective modules
 * to maintain consistency with slash command behavior.
 */
export async function executePendingAction(
  db: ExtendedPrismaClient,
  memberId: string,
  action: PendingAction,
  message: Message,
  client: Client,
): Promise<void> {
  try {
    switch (action.tool) {
      case 'log_checkin':
        await executeCheckin(db, memberId, action.params, message);
        break;

      case 'create_goal':
        await executeCreateGoal(db, memberId, action.params, message);
        break;

      case 'set_reminder':
        await executeSetReminder(db, memberId, action.params, message, client);
        break;

      case 'track_commitment':
        await executeTrackCommitment(db, memberId, action.params, message);
        break;

      case 'start_brainstorm':
        // Brainstorm is handled separately (Plan 03)
        await message.reply("Brainstorming mode isn't available yet.");
        break;

      default:
        await message.reply(`Unknown action: ${action.tool}`);
    }
  } catch (error) {
    logger.error(`Failed to execute ${action.tool} for ${memberId}: ${String(error)}`);
    await message.reply('Something went wrong executing that action. Try again.');
  }
}

// ─── Individual Action Handlers ─────────────────────────────────────────────────

/**
 * Log a check-in. Reuses extractCategories, updateStreak, calculateCheckinXP, awardXP
 * from checkin module for consistency with /checkin slash command.
 */
async function executeCheckin(
  db: ExtendedPrismaClient,
  memberId: string,
  params: Record<string, unknown>,
  message: Message,
): Promise<void> {
  const activity = params.activity as string;
  const effort = params.effort != null ? Number(params.effort) : null;

  // Get timezone
  const schedule = await db.memberSchedule.findUnique({ where: { memberId } });
  const timezone = schedule?.timezone ?? 'UTC';

  // AI category extraction
  const { categories } = await extractCategories(db, memberId, activity);

  // Count today's check-ins
  const now = new TZDate(new Date(), timezone);
  const todayStart = startOfDay(now);
  const todayCheckIns = await db.checkIn.count({
    where: { memberId, createdAt: { gte: todayStart } },
  });
  const dayIndex = todayCheckIns + 1;

  // Create CheckIn record
  const checkIn = await db.checkIn.create({
    data: {
      memberId,
      content: activity,
      effortRating: effort,
      categories,
      dayIndex,
    },
  });

  // Update streak
  const streakResult = await updateStreak(db, memberId, timezone);

  // Calculate and award XP
  const xp = calculateCheckinXP(dayIndex, streakResult.multiplier);
  await awardXP(db, memberId, xp, 'CHECKIN', `Check-in #${dayIndex} (${categories.join(', ')})`);

  // Update CheckIn with XP awarded
  await db.checkIn.update({
    where: { id: checkIn.id },
    data: { xpAwarded: xp },
  });

  logger.info(`Check-in logged for ${memberId}: "${activity}" [${categories.join(', ')}] +${xp} XP`);

  await message.reply(
    `Logged: "${activity}" [${categories.join(', ')}]. +${xp} XP. Streak: ${streakResult.currentStreak} days.`,
  );
}

/**
 * Create a goal. Parses deadline with chrono-node, creates Goal record.
 */
async function executeCreateGoal(
  db: ExtendedPrismaClient,
  memberId: string,
  params: Record<string, unknown>,
  message: Message,
): Promise<void> {
  const title = params.title as string;
  const deadlineText = params.deadline as string;
  const target = params.target != null ? Number(params.target) : null;
  const unit = (params.unit as string) ?? null;

  // Get timezone for parsing
  const schedule = await db.memberSchedule.findUnique({ where: { memberId } });
  const timezone = schedule?.timezone ?? 'UTC';

  // Parse deadline with chrono-node
  const parsed = chrono.parseDate(deadlineText, { instant: new Date(), timezone }, { forwardDate: true });
  const deadline = parsed ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // fallback: 7 days

  // Determine goal type
  const goalType = target && unit ? 'MEASURABLE' : 'FREETEXT';

  // Create goal
  await db.goal.create({
    data: {
      memberId,
      title,
      description: title,
      type: goalType,
      targetValue: target,
      unit,
      deadline,
    },
  });

  const formattedDeadline = format(deadline, "EEE, MMM d");
  logger.info(`Goal created for ${memberId}: "${title}" due ${formattedDeadline}`);

  await message.reply(`Goal set: "${title}" -- due ${formattedDeadline}.`);
}

/**
 * Set a reminder. Uses parseReminder from reminders module, creates Reminder record,
 * and schedules via scheduleOneShot/scheduleRecurring.
 */
async function executeSetReminder(
  db: ExtendedPrismaClient,
  memberId: string,
  params: Record<string, unknown>,
  message: Message,
  client: Client,
): Promise<void> {
  const content = params.content as string;
  const timeText = params.time as string;
  const recurring = params.recurring as string | undefined;

  // Get timezone
  const schedule = await db.memberSchedule.findUnique({ where: { memberId } });
  const timezone = schedule?.timezone ?? 'UTC';

  // Build text for parser
  let parseText = '';
  if (recurring) {
    parseText += `${recurring} `;
  }
  parseText += `${timeText} to ${content}`;

  // Parse reminder
  const parsed = parseReminder(parseText, timezone);
  if (!parsed) {
    // Fallback: try chrono directly
    const fireAt = chrono.parseDate(timeText, { instant: new Date(), timezone }, { forwardDate: true });
    if (!fireAt) {
      await message.reply("Couldn't parse that time. Try something more specific like 'tomorrow at 9am'.");
      return;
    }

    // Create reminder with chrono-parsed time
    const reminder = await db.reminder.create({
      data: {
        memberId,
        content,
        urgency: 'LOW',
        fireAt,
        status: 'PENDING',
      },
    });

    const delivery = new DiscordReminderDelivery(client, db);
    scheduleOneShot(reminder, delivery, db, client);

    const fireTime = new TZDate(fireAt, timezone);
    const timeDisplay = format(fireTime, "EEE, MMM d 'at' h:mm a");
    await message.reply(`Reminder set: "${content}" -- ${timeDisplay}`);
    return;
  }

  // Override content with the tool-extracted content (more reliable)
  parsed.content = content;

  // Create reminder in DB
  const reminder = await db.reminder.create({
    data: {
      memberId,
      content: parsed.content,
      urgency: parsed.urgency,
      fireAt: parsed.fireAt,
      cronExpression: parsed.cronExpression,
      status: parsed.isRecurring ? 'ACTIVE' : 'PENDING',
    },
  });

  // Schedule it
  const delivery = new DiscordReminderDelivery(client, db);
  if (parsed.isRecurring) {
    await scheduleRecurring(reminder, delivery, db, client);
  } else {
    scheduleOneShot(reminder, delivery, db, client);
  }

  // Reply with confirmation
  if (parsed.fireAt) {
    const fireTime = new TZDate(parsed.fireAt, timezone);
    const timeDisplay = format(fireTime, "EEE, MMM d 'at' h:mm a");
    if (parsed.isRecurring) {
      await message.reply(`Recurring reminder set: "${content}" (${recurring ?? 'recurring'}). Next: ${timeDisplay}`);
    } else {
      await message.reply(`Reminder set: "${content}" -- ${timeDisplay}`);
    }
  } else {
    await message.reply(`Reminder set: "${content}"`);
  }

  logger.info(`Reminder created for ${memberId}: "${content}"`);
}

/**
 * Track a commitment. Parses deadline with chrono-node, creates Commitment record.
 */
async function executeTrackCommitment(
  db: ExtendedPrismaClient,
  memberId: string,
  params: Record<string, unknown>,
  message: Message,
): Promise<void> {
  const what = params.what as string;
  const byWhen = params.by_when as string;

  // Get timezone
  const schedule = await db.memberSchedule.findUnique({ where: { memberId } });
  const timezone = schedule?.timezone ?? 'UTC';

  // Parse deadline with chrono-node
  const parsed = chrono.parseDate(byWhen, { instant: new Date(), timezone }, { forwardDate: true });
  const deadline = parsed ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // fallback: 7 days

  // Create Commitment record
  await db.commitment.create({
    data: {
      memberId,
      title: what,
      deadline,
    },
  });

  const formattedDeadline = format(deadline, "EEE, MMM d");
  logger.info(`Commitment tracked for ${memberId}: "${what}" by ${formattedDeadline}`);

  await message.reply(`Tracked: "${what}" by ${formattedDeadline}.`);
}
