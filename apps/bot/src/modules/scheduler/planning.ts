/**
 * Sunday planning session -- conversational DM flow.
 *
 * Every Sunday at 10am member's local time, the bot opens a DM conversation
 * to review last week and plan the coming week. Follows the same awaitMessages
 * pattern as setup-flow.ts -- feels like sitting down with a coach, not
 * filling out a form.
 *
 * Flow:
 * 0. Weekly review summary (goals completed/stalled, commitments, activity stats)
 * 1. How did last week go? (1-5 or free text)
 * 2. What are your goals for this week? (AI extracts structured goals)
 * 3. When should I remind you to check in? (parse reminder times)
 * 4. Confirmation summary embed
 */

import {
  type Client,
  type DMChannel,
  type Message,
  type Collection,
  EmbedBuilder,
} from 'discord.js';
import { TZDate } from '@date-fns/tz';
import {
  startOfWeek,
  endOfWeek,
  subWeeks,
} from 'date-fns';
import type { ExtendedPrismaClient } from '@28k/db';
import { callAI } from '../../shared/ai-client.js';
import { BRAND_COLORS } from '@28k/shared';
import type { IEventBus } from '../../shared/types.js';
import { storeMessage } from '../ai-assistant/memory.js';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) =>
      `${timestamp as string} [planning] ${level}: ${message as string}`),
  ),
  transports: [new winston.transports.Console()],
});

/** Timeout for each response during planning session (5 minutes). */
const PLANNING_TIMEOUT_MS = 5 * 60 * 1000;

import { validateGoalDepth } from '../goals/hierarchy.js';

/** Higher-level goal info for planning context. */
interface HigherGoal {
  id: string;
  title: string;
  timeframe: string | null;
  depth: number;
}

/** Goal extracted from natural language by AI. */
interface ExtractedGoal {
  title: string;
  type: 'measurable' | 'freetext';
  target?: number;
  unit?: string;
  parentGoalIndex?: number | null;
}

/** Data collected for the weekly review summary. */
interface WeekReviewData {
  goalsCompleted: Array<{ title: string }>;
  goalsStalled: Array<{ title: string }>;
  goalsActive: number;
  commitmentsFulfilled: number;
  commitmentsMissed: number;
  commitmentsPending: number;
  totalCommitments: number;
  checkInCount: number;
  focusMinutes: number;
  streakDays: number;
  streakDirection: 'up' | 'down' | 'same';
}

/**
 * Build week review data by querying goals, commitments, check-ins, and
 * voice/timer sessions for the past Mon-Sun week.
 */
async function buildWeekReview(
  db: ExtendedPrismaClient,
  memberId: string,
  timezone: string,
): Promise<WeekReviewData> {
  const now = new TZDate(new Date(), timezone);
  const weekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });

  const [
    completedGoals,
    activeGoalsWithProgress,
    commitments,
    checkInCount,
    voiceSessions,
    member,
  ] = await Promise.all([
    // Goals completed this week
    db.goal.findMany({
      where: {
        memberId,
        status: 'COMPLETED',
        completedAt: { gte: weekStart, lte: weekEnd },
      },
      select: { title: true },
    }),
    // Active goals (for stalled detection: created before this week with no progress)
    db.goal.findMany({
      where: {
        memberId,
        status: { in: ['ACTIVE', 'EXTENDED'] },
      },
      select: { title: true, currentValue: true, targetValue: true, type: true, createdAt: true },
    }),
    // Commitments made this week
    db.commitment.findMany({
      where: {
        memberId,
        createdAt: { gte: weekStart, lte: weekEnd },
      },
      select: { status: true },
    }),
    // Check-in count
    db.checkIn.count({
      where: {
        memberId,
        createdAt: { gte: weekStart, lte: weekEnd },
      },
    }),
    // Voice sessions (focus time)
    db.voiceSession.findMany({
      where: {
        memberId,
        startedAt: { gte: weekStart, lte: weekEnd },
      },
      select: { durationMinutes: true },
    }),
    // Member for streak
    db.member.findUniqueOrThrow({
      where: { id: memberId },
      select: { currentStreak: true, longestStreak: true },
    }),
  ]);

  // Stalled goals: active goals created before this week with no progress
  // Measurable: currentValue still 0. Freetext: created before week and still active.
  const stalledGoals = activeGoalsWithProgress.filter((g) => {
    if (g.createdAt >= weekStart) return false; // Created this week -- too new to be stalled
    if (g.type === 'MEASURABLE') return g.currentValue === 0;
    return true; // Freetext goals older than this week and not completed
  });

  // Commitment status breakdown
  const fulfilled = commitments.filter((c) => c.status === 'COMPLETED').length;
  const missed = commitments.filter((c) => c.status === 'MISSED').length;
  const pending = commitments.filter((c) => c.status === 'ACTIVE').length;

  // Total focus minutes from voice sessions
  const focusMinutes = voiceSessions.reduce(
    (sum, s) => sum + (s.durationMinutes ?? 0),
    0,
  );

  // Streak direction heuristic: if current equals longest, it's growing
  const streakDirection: 'up' | 'down' | 'same' =
    member.currentStreak >= member.longestStreak && member.currentStreak > 0
      ? 'up'
      : member.currentStreak === 0
        ? 'down'
        : 'same';

  return {
    goalsCompleted: completedGoals,
    goalsStalled: stalledGoals.map((g) => ({ title: g.title })),
    goalsActive: activeGoalsWithProgress.length,
    commitmentsFulfilled: fulfilled,
    commitmentsMissed: missed,
    commitmentsPending: pending,
    totalCommitments: commitments.length,
    checkInCount,
    focusMinutes,
    streakDays: member.currentStreak,
    streakDirection,
  };
}

/**
 * Generate a week review text using AI, with template fallback.
 */
async function generateReviewText(
  db: ExtendedPrismaClient,
  memberId: string,
  review: WeekReviewData,
): Promise<string> {
  // Build context string for AI
  const completedList = review.goalsCompleted.length > 0
    ? review.goalsCompleted.map((g) => g.title).join(', ')
    : 'none';
  const stalledList = review.goalsStalled.length > 0
    ? review.goalsStalled.map((g) => g.title).join(', ')
    : 'none';

  const reviewContext = [
    `Goals completed: ${review.goalsCompleted.length} (${completedList})`,
    `Goals stalled (no progress): ${review.goalsStalled.length} (${stalledList})`,
    `Active goals: ${review.goalsActive}`,
    `Commitments: ${review.commitmentsFulfilled}/${review.totalCommitments} kept, ${review.commitmentsMissed} missed, ${review.commitmentsPending} pending`,
    `Check-ins: ${review.checkInCount}`,
    `Focus time: ${review.focusMinutes} minutes`,
    `Streak: ${review.streakDays} days (${review.streakDirection})`,
  ].join('\n');

  try {
    const result = await callAI(db, {
      memberId,
      feature: 'planning',
      messages: [
        {
          role: 'system',
          content:
            "Summarize this member's week in 4-6 sentences. Be factual and specific. " +
            "Reference actual goal names and numbers. Forward-looking: end with what carries forward to next week. " +
            "Keep a direct, concise coaching tone. No fluff.",
        },
        {
          role: 'user',
          content: reviewContext,
        },
      ],
    });

    if (!result.degraded && result.content) {
      return result.content;
    }
  } catch (error) {
    logger.warn(`AI review generation failed, using template: ${String(error)}`);
  }

  // Template fallback
  const lines: string[] = [];
  lines.push(`**Your Week in Review**`);
  lines.push(`${review.goalsCompleted.length} goal(s) completed, ${review.goalsStalled.length} stalled.`);
  if (review.totalCommitments > 0) {
    lines.push(`${review.commitmentsFulfilled}/${review.totalCommitments} commitments kept.`);
  }
  lines.push(`${review.checkInCount} check-in(s), ${review.focusMinutes} focused minutes.`);
  lines.push(`Streak: ${review.streakDays} days.`);

  // Stalled goal details
  for (const g of review.goalsStalled) {
    lines.push(`- ${g.title} -- no movement this week.`);
  }

  return lines.join('\n');
}

/**
 * Run the Sunday planning session as a conversational DM flow.
 *
 * @param client - Discord.js client
 * @param db - Extended Prisma client
 * @param memberId - The member to run the session with
 * @param events - Event bus for emitting scheduleUpdated
 */
export async function runPlanningSession(
  client: Client,
  db: ExtendedPrismaClient,
  memberId: string,
  events: IEventBus,
): Promise<void> {
  try {
    // Fetch member with Discord account
    const member = await db.member.findUniqueOrThrow({
      where: { id: memberId },
      include: {
        accounts: { take: 1 },
        schedule: true,
      },
    });

    if (member.accounts.length === 0) {
      logger.warn(`No Discord accounts for member ${memberId}, skipping planning`);
      return;
    }

    const discordId = member.accounts[0].discordId;
    const timezone = member.schedule?.timezone ?? 'UTC';
    const briefTone = member.schedule?.briefTone ?? 'coach';

    // Open DM channel
    let dm: DMChannel;
    try {
      const user = await client.users.fetch(discordId);
      dm = await user.createDM();
    } catch {
      logger.warn(`Could not open DM with ${discordId} -- DMs may be closed`);
      return;
    }

    // Build weekly review data
    const now = new TZDate(new Date(), timezone);
    const review = await buildWeekReview(db, memberId, timezone);

    // Step 0: Weekly review summary (opening act before asking for rating)
    const reviewText = await generateReviewText(db, memberId, review);

    // Store review as conversation message for Jarvis context
    await storeMessage(db, memberId, 'assistant', reviewText, 'planning');

    try {
      await dm.send(`Hey ${member.displayName}, it's planning time! Here's your week in review:\n\n${reviewText}`);
    } catch {
      logger.warn(`Could not send DM to ${discordId} -- DMs likely closed`);
      return;
    }

    // Step 1: How did last week go? (member now has review context to rate accurately)
    try {
      await dm.send(
        `With all that in mind -- how did last week go?\n\n` +
        `Rate it 1-5, or just tell me how you feel about it.`,
      );
    } catch {
      logger.warn(`Could not send DM to ${discordId} -- DMs likely closed`);
      return;
    }

    const weekRatingResponse = await awaitResponse(dm, discordId);
    if (weekRatingResponse === null) {
      await sendTimeoutMessage(dm);
      return;
    }

    // Acknowledge the rating
    const ratingNum = parseInt(weekRatingResponse, 10);
    if (ratingNum >= 1 && ratingNum <= 5) {
      const ratingAcks = ['Rough week, we move.', 'Not bad, room to grow.', 'Solid.', 'Nice week!', 'Crushed it.'];
      await dm.send(ratingAcks[ratingNum - 1]);
    } else {
      await dm.send('Got it, appreciate the honesty.');
    }

    // Step 1.5: Show existing higher-level goals and suggest weekly focus
    const higherGoals = await db.goal.findMany({
      where: {
        memberId,
        status: { in: ['ACTIVE', 'EXTENDED'] },
        timeframe: { in: ['YEARLY', 'QUARTERLY', 'MONTHLY'] },
      },
      orderBy: { deadline: 'asc' },
    });

    const higherGoalContext: HigherGoal[] = higherGoals.map((g) => ({
      id: g.id,
      title: g.title,
      timeframe: g.timeframe,
      depth: g.depth,
    }));

    // Step 2: Goals for this week (with higher-goal context if available)
    if (higherGoalContext.length > 0) {
      const goalList = higherGoalContext
        .map((g, i) => `${i + 1}. [${g.timeframe}] ${g.title}`)
        .join('\n');

      // AI suggests weekly actions based on higher-level goals
      let suggestions = '';
      try {
        const suggestResult = await callAI(db, {
          memberId,
          feature: 'planning',
          messages: [
            {
              role: 'system',
              content:
                "Based on the member's higher-level goals, suggest 2-3 specific weekly actions " +
                'they could take this week. Keep suggestions concrete and achievable in one week. ' +
                'Format as a short numbered list. Be brief -- one line each.',
            },
            {
              role: 'user',
              content: `My active goals:\n${goalList}`,
            },
          ],
        });
        if (!suggestResult.degraded && suggestResult.content) {
          suggestions = suggestResult.content;
        }
      } catch {
        logger.warn('AI weekly suggestion generation failed, skipping suggestions');
      }

      await dm.send(
        `Here are your bigger-picture goals:\n\n${goalList}\n\n` +
        (suggestions ? `Based on these, here's what I'd suggest this week:\n${suggestions}\n\n` : '') +
        'What are your goals for this week? You can adopt my suggestions, modify them, or set your own.',
      );
    } else {
      await dm.send(
        "What are your goals for this week? You can set up to 5. Just tell me naturally, like " +
        "'send 10 cold emails, finish the landing page, read 2 chapters of that book'.",
      );
    }

    const goalsResponse = await awaitResponse(dm, discordId);
    if (goalsResponse === null) {
      await sendTimeoutMessage(dm);
      return;
    }

    // Parse goals from natural language using AI (with higher-goal context)
    const extractedGoals = await extractGoalsFromText(db, memberId, goalsResponse, higherGoalContext);

    // Calculate end of this week (Sunday 23:59 in member's timezone)
    const thisWeekEnd = endOfWeek(now, { weekStartsOn: 1 });

    // Create Goal records with timeframe and parent linking
    for (const goal of extractedGoals) {
      let parentId: string | undefined;
      let depth = 0;

      // Link to parent if AI identified one
      if (goal.parentGoalIndex != null && higherGoalContext[goal.parentGoalIndex]) {
        const parent = higherGoalContext[goal.parentGoalIndex];
        if (validateGoalDepth(parent.depth)) {
          parentId = parent.id;
          depth = parent.depth + 1;
        }
      }

      await db.goal.create({
        data: {
          memberId,
          title: goal.title,
          description: goal.title,
          type: goal.type === 'measurable' ? 'MEASURABLE' : 'FREETEXT',
          targetValue: goal.target ?? null,
          unit: goal.unit ?? null,
          deadline: thisWeekEnd,
          timeframe: 'WEEKLY',
          parentId,
          depth,
        },
      });
    }

    // Acknowledge
    await dm.send(`Nice, ${extractedGoals.length} goal(s) set for this week.`);

    // Step 3: Reminder times
    await dm.send(
      "When should I remind you to check in this week? Give me times like '9am, 3pm' " +
      "or 'keep the same as last week'.",
    );

    const reminderResponse = await awaitResponse(dm, discordId);
    if (reminderResponse === null) {
      await sendTimeoutMessage(dm);
      return;
    }

    // Parse reminder times
    const existingReminders = member.schedule?.reminderTimes ?? [];
    const keepExisting = /keep|same|no change/i.test(reminderResponse);
    const newReminderTimes = keepExisting
      ? existingReminders
      : parseReminderTimes(reminderResponse);

    // Update MemberSchedule with new reminder times
    if (member.schedule) {
      await db.memberSchedule.update({
        where: { memberId },
        data: { reminderTimes: newReminderTimes },
      });
    } else {
      await db.memberSchedule.create({
        data: {
          memberId,
          timezone,
          reminderTimes: newReminderTimes,
        },
      });
    }

    // Emit scheduleUpdated so SchedulerManager rebuilds tasks
    events.emit('scheduleUpdated', memberId);

    // Step 4: Confirmation embed
    const goalsList = extractedGoals
      .map((g) => {
        const parentLabel =
          g.parentGoalIndex != null && higherGoalContext[g.parentGoalIndex]
            ? ` -> ${higherGoalContext[g.parentGoalIndex].title}`
            : '';
        if (g.type === 'measurable' && g.target && g.unit) {
          return `- ${g.title} (0/${g.target} ${g.unit})${parentLabel}`;
        }
        return `- ${g.title}${parentLabel}`;
      })
      .join('\n');

    const reminderDisplay = newReminderTimes.length > 0
      ? newReminderTimes.join(', ')
      : 'None set';

    const toneClosers: Record<string, string> = {
      coach: "Let's get after it this week.",
      chill: 'You got this, no pressure.',
      'data-first': `Target: ${extractedGoals.length} goals by Sunday.`,
    };
    const closer = toneClosers[briefTone] ?? toneClosers.coach;

    const confirmEmbed = new EmbedBuilder()
      .setColor(BRAND_COLORS.primary)
      .setTitle('Week Planned')
      .setDescription(`${closer}`)
      .addFields(
        { name: 'Goals', value: goalsList || 'None set', inline: false },
        { name: 'Reminders', value: reminderDisplay, inline: true },
        { name: 'Streak', value: `${member.currentStreak} days`, inline: true },
      )
      .setFooter({ text: 'Use /goals to view, or tell me in a DM to update anything' })
      .setTimestamp();

    await dm.send({ embeds: [confirmEmbed] });

    logger.info(
      `Planning session complete for ${memberId}: ` +
      `${extractedGoals.length} goals, ${newReminderTimes.length} reminders`,
    );
  } catch (error) {
    logger.error(`Planning session failed for ${memberId}: ${String(error)}`);
  }
}

// ─── Helper Functions ───────────────────────────────────────────────────────────

/**
 * Wait for a single message response in a DM channel.
 */
async function awaitResponse(
  dm: DMChannel,
  authorId: string,
): Promise<string | null> {
  try {
    const collected: Collection<string, Message> = await dm.awaitMessages({
      filter: (msg: Message) => msg.author.id === authorId,
      max: 1,
      time: PLANNING_TIMEOUT_MS,
      errors: ['time'],
    });

    const response = collected.first();
    return response?.content ?? null;
  } catch {
    return null;
  }
}

/**
 * Send timeout message when member doesn't respond.
 */
async function sendTimeoutMessage(dm: DMChannel): Promise<void> {
  try {
    await dm.send(
      "No worries, we can plan later. Your existing goals and reminders are still active.",
    );
  } catch {
    // DM may be closed
  }
}

/**
 * Extract structured goals from natural language using AI.
 * When higher-level goals are provided, AI attempts to match weekly goals to parents.
 * Falls back to a single free-text goal on failure.
 */
async function extractGoalsFromText(
  db: ExtendedPrismaClient,
  memberId: string,
  text: string,
  existingHigherGoals?: HigherGoal[],
): Promise<ExtractedGoal[]> {
  try {
    const parentContext =
      existingHigherGoals && existingHigherGoals.length > 0
        ? `\n\nThe member has these higher-level goals:\n${existingHigherGoals.map((g, i) => `${i}: [${g.timeframe}] ${g.title}`).join('\n')}\n\nFor each extracted weekly goal, if it clearly contributes to one of these higher-level goals, set parentGoalIndex to the matching index number. Otherwise set it to null.`
        : '';

    const result = await callAI(db, {
      memberId,
      feature: 'planning',
      messages: [
        {
          role: 'system',
          content: `Extract goals from this text. For each goal, determine if it's measurable (has a number and unit) or free-text. Return as JSON array. Max 5 goals.${parentContext}`,
        },
        {
          role: 'user',
          content: text,
        },
      ],
      responseFormat: {
        type: 'json_schema' as const,
        jsonSchema: {
          name: 'extracted_goals',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              goals: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    type: { type: 'string', enum: ['measurable', 'freetext'] },
                    target: { anyOf: [{ type: 'number' }, { type: 'null' }] },
                    unit: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                    parentGoalIndex: { anyOf: [{ type: 'number' }, { type: 'null' }] },
                  },
                  required: ['title', 'type', 'target', 'unit', 'parentGoalIndex'],
                  additionalProperties: false,
                },
              },
            },
            required: ['goals'],
            additionalProperties: false,
          },
        },
      },
    });

    if (result.degraded || !result.content) {
      return [{ title: text, type: 'freetext' }];
    }

    const parsed = JSON.parse(result.content) as { goals: ExtractedGoal[] };

    // Limit to 5 goals
    const goals = parsed.goals.slice(0, 5);
    if (goals.length === 0) {
      return [{ title: text, type: 'freetext' }];
    }

    // Validate and normalize goal types + parent index bounds
    for (const goal of goals) {
      const normalizedType = String(goal.type).toLowerCase();
      goal.type = (normalizedType === 'measurable' ? 'measurable' : 'freetext') as 'measurable' | 'freetext';

      // Validate parentGoalIndex bounds
      if (
        goal.parentGoalIndex != null &&
        (!existingHigherGoals || goal.parentGoalIndex < 0 || goal.parentGoalIndex >= existingHigherGoals.length)
      ) {
        goal.parentGoalIndex = null;
      }
    }

    logger.debug(`Extracted ${goals.length} goals from planning text`);
    return goals;
  } catch (error) {
    logger.warn(`Goal extraction failed, using text as single goal: ${String(error)}`);
    return [{ title: text, type: 'freetext' }];
  }
}

/**
 * Parse reminder times from natural language.
 * Extracts HH:mm patterns or converts "9am", "3pm" style times.
 *
 * @returns Array of HH:mm strings
 */
function parseReminderTimes(text: string): string[] {
  const times: string[] = [];

  // Match HH:mm format
  const hhmmMatches = text.matchAll(/\b(\d{1,2}):(\d{2})\b/g);
  for (const match of hhmmMatches) {
    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      times.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }

  // Match "Xam" or "Xpm" style (e.g., "9am", "3pm", "11am")
  const ampmMatches = text.matchAll(/\b(\d{1,2})\s*(am|pm)\b/gi);
  for (const match of ampmMatches) {
    let h = parseInt(match[1], 10);
    const period = match[2].toLowerCase();

    if (period === 'pm' && h < 12) h += 12;
    if (period === 'am' && h === 12) h = 0;

    if (h >= 0 && h <= 23) {
      const timeStr = `${String(h).padStart(2, '0')}:00`;
      // Avoid duplicates if HH:mm already captured this
      if (!times.includes(timeStr)) {
        times.push(timeStr);
      }
    }
  }

  return times.sort();
}
