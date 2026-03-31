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
import { startOfDay, format, isPast, formatDistanceToNow } from 'date-fns';
import * as chrono from 'chrono-node';
import { extractCategories } from '../checkin/ai-categories.js';
import { updateStreak } from '../checkin/streak.js';
import { awardXP, calculateCheckinXP } from '@28k/shared';
import { parseReminder } from '../reminders/parser.js';
import { scheduleOneShot, scheduleRecurring } from '../reminders/scheduler.js';
import { DiscordReminderDelivery } from '../reminders/delivery.js';
import { validateGoalDepth } from '../goals/hierarchy.js';
import { getDefaultChildTimeframe } from '../goals/decompose.js';
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
const CONFIRM_PATTERNS = /^(yes|yeah|yep|sure|ok|okay|do it|go ahead|confirm|sounds good|let's do it|let's go|let go|yup|absolutely|perfect|great|👍|✅|y)\b/i;

/** Denial patterns -- case insensitive, word boundary at start. */
const DENY_PATTERNS = /^(no|nah|nope|cancel|never mind|nevermind|stop|don't|dont|skip|ignore|n)\b/i;

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

// ─── Timeframe Inference ────────────────────────────────────────────────────────

/**
 * Infer timeframe from deadline text and parsed deadline when AI doesn't provide one.
 */
function inferTimeframe(deadlineText: string, deadline: Date): string | null {
  const lower = deadlineText.toLowerCase();

  // Explicit signals from text
  if (/this week|by friday|by sunday|this fri|next week/i.test(lower)) return 'WEEKLY';
  if (/this month|end of month|by end of \w+/i.test(lower)) return 'MONTHLY';
  if (/this quarter|end of q\d|by q\d|next quarter/i.test(lower)) return 'QUARTERLY';
  if (/this year|end of year|by december|by dec|next year/i.test(lower)) return 'YEARLY';

  // Heuristic from parsed deadline distance
  const daysAway = Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (daysAway <= 7) return 'WEEKLY';
  if (daysAway <= 31) return 'MONTHLY';
  if (daysAway <= 93) return 'QUARTERLY';
  if (daysAway <= 366) return 'YEARLY';
  return null;
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

    case 'create_goal': {
      const tfLabel = params.timeframe ? ` [${params.timeframe as string}]` : '';
      const parentLabel = params.parentGoalTitle ? ` (under: ${params.parentGoalTitle as string})` : '';
      return `Creating goal${tfLabel}: "${params.title as string}" due ${params.deadline as string}${parentLabel}. Confirm?`;
    }

    case 'track_commitment':
      return `Tracking: you'll "${params.what as string}" by ${params.by_when as string}. Got it?`;

    case 'set_reminder': {
      const recurring = params.recurring ? ` (${params.recurring as string})` : '';
      return `Reminder: "${params.content as string}" at ${params.time as string}${recurring}. Set it?`;
    }

    case 'start_brainstorm':
      return `Starting brainstorm on: "${params.topic as string}"`;

    case 'edit_goal': {
      const changes: string[] = [];
      if (params.newTitle) changes.push(`title -> "${params.newTitle as string}"`);
      if (params.newDeadline) changes.push(`deadline -> ${params.newDeadline as string}`);
      if (params.newTarget) changes.push(`target -> ${String(params.newTarget)}`);
      return `Editing "${params.goalTitle as string}": ${changes.join(', ')}. Confirm?`;
    }

    case 'delete_goal':
      return `Archiving goal: "${params.goalTitle as string}". This removes it and any sub-goals. Sure?`;

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
        await message.reply("Brainstorming mode isn't available yet.");
        break;

      case 'edit_goal':
        await executeEditGoal(db, memberId, action.params, message);
        break;

      case 'delete_goal':
        await executeDeleteGoal(db, memberId, action.params, message);
        break;

      case 'list_goals':
        await executeListGoals(db, memberId, action.params, message);
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
 * Create a goal with timeframe inference, parent linking, and decomposition offer.
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

  // Resolve timeframe: prefer AI-provided, fallback to inference
  const aiTimeframe = params.timeframe as string | undefined;
  const resolvedTimeframe = aiTimeframe ?? inferTimeframe(deadlineText, deadline);

  // Resolve parent goal if specified
  let parentId: string | undefined;
  let depth = 0;

  if (params.parentGoalTitle) {
    const parentHint = (params.parentGoalTitle as string).toLowerCase();
    const activeGoals = await db.goal.findMany({
      where: { memberId, status: { in: ['ACTIVE', 'EXTENDED'] } },
    });
    const match = activeGoals.find((g) => g.title.toLowerCase().includes(parentHint));
    if (match && validateGoalDepth(match.depth)) {
      parentId = match.id;
      depth = match.depth + 1;
    }
  }

  // Determine goal type
  const goalType = target && unit ? 'MEASURABLE' : 'FREETEXT';

  // Create goal
  const goal = await db.goal.create({
    data: {
      memberId,
      title,
      description: title,
      type: goalType,
      targetValue: target,
      unit,
      deadline,
      timeframe: resolvedTimeframe as 'YEARLY' | 'QUARTERLY' | 'MONTHLY' | 'WEEKLY' | undefined,
      parentId,
      depth,
    },
  });

  const formattedDeadline = format(deadline, "EEE, MMM d");
  const tfLabel = resolvedTimeframe ? ` [${resolvedTimeframe}]` : '';
  logger.info(`Goal created for ${memberId}: "${title}"${tfLabel} due ${formattedDeadline}`);

  await message.reply(`Goal set${tfLabel}: "${title}" -- due ${formattedDeadline}.`);

  // Offer decomposition for non-weekly goals
  if (resolvedTimeframe && resolvedTimeframe !== 'WEEKLY') {
    const childTimeframe = getDefaultChildTimeframe(resolvedTimeframe);
    const childLabel = childTimeframe.toLowerCase();

    // Store as a decompose offer pending action
    pendingActions.set(memberId, {
      tool: '_decompose_offer',
      params: { goalId: goal.id, childTimeframe },
      confirmMessage: '',
      createdAt: Date.now(),
    });

    await message.reply(
      `Want me to break "${title}" down into ${childLabel} steps?`,
    );
  }
}

/**
 * Edit an existing goal -- change title, deadline, or target.
 */
async function executeEditGoal(
  db: ExtendedPrismaClient,
  memberId: string,
  params: Record<string, unknown>,
  message: Message,
): Promise<void> {
  const goalTitle = (params.goalTitle as string).toLowerCase();

  // Find matching goal
  const goals = await db.goal.findMany({
    where: { memberId, status: { in: ['ACTIVE', 'EXTENDED'] } },
  });
  const match = goals.find((g) => g.title.toLowerCase().includes(goalTitle));

  if (!match) {
    await message.reply(`Couldn't find a goal matching "${params.goalTitle as string}". Say "show my goals" to see your active goals.`);
    return;
  }

  const updates: Record<string, unknown> = {};
  const changeDescriptions: string[] = [];

  if (params.newTitle) {
    updates.title = params.newTitle;
    updates.description = params.newTitle;
    changeDescriptions.push(`title -> "${params.newTitle as string}"`);
  }

  if (params.newDeadline) {
    const schedule = await db.memberSchedule.findUnique({ where: { memberId } });
    const timezone = schedule?.timezone ?? 'UTC';
    const parsedDeadline = chrono.parseDate(
      params.newDeadline as string,
      { instant: new Date(), timezone },
      { forwardDate: true },
    );
    if (parsedDeadline) {
      updates.deadline = parsedDeadline;
      changeDescriptions.push(`deadline -> ${format(parsedDeadline, 'EEE, MMM d')}`);
    }
  }

  if (params.newTarget != null) {
    updates.targetValue = Number(params.newTarget);
    changeDescriptions.push(`target -> ${String(params.newTarget)}`);
  }

  if (Object.keys(updates).length === 0) {
    await message.reply('No changes to make. Tell me what to change -- title, deadline, or target.');
    return;
  }

  await db.goal.update({ where: { id: match.id }, data: updates });

  logger.info(`Goal edited for ${memberId}: "${match.title}" -- ${changeDescriptions.join(', ')}`);
  await message.reply(`Updated "${match.title}": ${changeDescriptions.join(', ')}.`);
}

/**
 * Delete (archive) a goal by setting status to MISSED. Cascades to children.
 */
async function executeDeleteGoal(
  db: ExtendedPrismaClient,
  memberId: string,
  params: Record<string, unknown>,
  message: Message,
): Promise<void> {
  const goalTitle = (params.goalTitle as string).toLowerCase();

  const goals = await db.goal.findMany({
    where: { memberId, status: { in: ['ACTIVE', 'EXTENDED'] } },
  });
  const match = goals.find((g) => g.title.toLowerCase().includes(goalTitle));

  if (!match) {
    await message.reply(`Couldn't find a goal matching "${params.goalTitle as string}".`);
    return;
  }

  // Soft delete: set to MISSED
  await db.goal.update({
    where: { id: match.id },
    data: { status: 'MISSED' },
  });

  // Also archive children
  const archivedChildren = await db.goal.updateMany({
    where: { parentId: match.id, status: { in: ['ACTIVE', 'EXTENDED'] } },
    data: { status: 'MISSED' },
  });

  const childInfo = archivedChildren.count > 0 ? ` and ${archivedChildren.count} sub-goal(s)` : '';
  logger.info(`Goal archived for ${memberId}: "${match.title}"${childInfo}`);
  await message.reply(`Archived "${match.title}"${childInfo}.`);
}

/**
 * List goals grouped by timeframe. No confirmation needed.
 */
async function executeListGoals(
  db: ExtendedPrismaClient,
  memberId: string,
  params: Record<string, unknown>,
  message: Message,
): Promise<void> {
  const timeframeFilter = params.timeframe as string | undefined;

  const where: Record<string, unknown> = {
    memberId,
    status: { in: ['ACTIVE', 'EXTENDED'] },
    parentId: null, // Top-level only
  };

  if (timeframeFilter && timeframeFilter !== 'ALL') {
    where.timeframe = timeframeFilter;
  }

  const goals = await db.goal.findMany({
    where,
    orderBy: { deadline: 'asc' },
    include: {
      children: {
        where: { status: { in: ['ACTIVE', 'EXTENDED'] } },
        select: { id: true, title: true, status: true },
      },
    },
  });

  if (goals.length === 0) {
    await message.reply("No active goals. Tell me what you want to achieve and I'll set one up.");
    return;
  }

  // Group by timeframe
  const grouped = new Map<string, typeof goals>();
  for (const goal of goals) {
    const key = goal.timeframe ?? 'Unset';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(goal);
  }

  const lines: string[] = [];
  const timeframeOrder = ['YEARLY', 'QUARTERLY', 'MONTHLY', 'WEEKLY', 'Unset'];
  for (const tf of timeframeOrder) {
    const group = grouped.get(tf);
    if (!group) continue;
    lines.push(`**${tf === 'Unset' ? 'No timeframe' : tf}**`);
    for (const g of group) {
      const childInfo = g.children.length > 0 ? ` (${g.children.length} sub-goals)` : '';
      const progress =
        g.type === 'MEASURABLE' && g.targetValue
          ? ` [${g.currentValue}/${g.targetValue} ${g.unit ?? ''}]`
          : '';
      const deadlineStr = isPast(g.deadline)
        ? 'Overdue'
        : formatDistanceToNow(g.deadline, { addSuffix: true });
      lines.push(`  - ${g.title}${progress} | ${deadlineStr}${childInfo}`);
    }
  }

  await message.reply(lines.join('\n'));
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
  const parsedReminder = parseReminder(parseText, timezone);
  if (!parsedReminder) {
    // Fallback: try chrono directly
    const fireAt = chrono.parseDate(timeText, { instant: new Date(), timezone }, { forwardDate: true });
    if (!fireAt) {
      await message.reply("Couldn't parse that time. Try something like 'tomorrow at 9am', 'Friday 3pm', or 'in 2 hours'.");
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
  parsedReminder.content = content;

  // Create reminder in DB
  const reminder = await db.reminder.create({
    data: {
      memberId,
      content: parsedReminder.content,
      urgency: parsedReminder.urgency,
      fireAt: parsedReminder.fireAt,
      cronExpression: parsedReminder.cronExpression,
      status: parsedReminder.isRecurring ? 'ACTIVE' : 'PENDING',
    },
  });

  // Schedule it
  const delivery = new DiscordReminderDelivery(client, db);
  if (parsedReminder.isRecurring) {
    await scheduleRecurring(reminder, delivery, db, client);
  } else {
    scheduleOneShot(reminder, delivery, db, client);
  }

  // Reply with confirmation
  if (parsedReminder.fireAt) {
    const fireTime = new TZDate(parsedReminder.fireAt, timezone);
    const timeDisplay = format(fireTime, "EEE, MMM d 'at' h:mm a");
    if (parsedReminder.isRecurring) {
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
