/**
 * Sunday planning session -- conversational DM flow.
 *
 * Every Sunday at 10am member's local time, the bot opens a DM conversation
 * to review last week and plan the coming week. Follows the same awaitMessages
 * pattern as setup-flow.ts -- feels like sitting down with a coach, not
 * filling out a form.
 *
 * Flow:
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
  startOfDay,
} from 'date-fns';
import type { ExtendedPrismaClient } from '../../db/client.js';
import { callAI } from '../../shared/ai-client.js';
import { BRAND_COLORS } from '../../shared/constants.js';
import type { IEventBus } from '../../shared/types.js';
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

/** Goal extracted from natural language by AI. */
interface ExtractedGoal {
  title: string;
  type: 'measurable' | 'freetext';
  target?: number;
  unit?: string;
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

    // Fetch last week's data
    const now = new TZDate(new Date(), timezone);
    const lastWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
    const lastWeekEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });

    const [lastWeekCheckins, lastWeekGoalsCompleted, activeGoals] = await Promise.all([
      db.checkIn.count({
        where: {
          memberId,
          createdAt: { gte: lastWeekStart, lte: lastWeekEnd },
        },
      }),
      db.goal.count({
        where: {
          memberId,
          status: 'COMPLETED',
          completedAt: { gte: lastWeekStart, lte: lastWeekEnd },
        },
      }),
      db.goal.count({
        where: {
          memberId,
          status: { in: ['ACTIVE', 'EXTENDED'] },
        },
      }),
    ]);

    // Step 1: How did last week go?
    try {
      await dm.send(
        `Hey ${member.displayName}, it's planning time! Quick check -- how did last week go?\n\n` +
        `Last week: ${lastWeekCheckins} check-in(s), ${lastWeekGoalsCompleted} goal(s) completed, ` +
        `${member.currentStreak}-day streak.\n\n` +
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

    // Step 2: Goals for this week
    await dm.send(
      "What are your goals for this week? You can set up to 5. Just tell me naturally, like " +
      "'send 10 cold emails, finish the landing page, read 2 chapters of that book'.",
    );

    const goalsResponse = await awaitResponse(dm, discordId);
    if (goalsResponse === null) {
      await sendTimeoutMessage(dm);
      return;
    }

    // Parse goals from natural language using AI
    const extractedGoals = await extractGoalsFromText(db, memberId, goalsResponse);

    // Calculate end of this week (Sunday 23:59 in member's timezone)
    const thisWeekEnd = endOfWeek(now, { weekStartsOn: 1 });

    // Create Goal records
    for (const goal of extractedGoals) {
      await db.goal.create({
        data: {
          memberId,
          title: goal.title,
          description: goal.title,
          type: goal.type === 'measurable' ? 'MEASURABLE' : 'FREETEXT',
          targetValue: goal.target ?? null,
          unit: goal.unit ?? null,
          deadline: thisWeekEnd,
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
        if (g.type === 'measurable' && g.target && g.unit) {
          return `- ${g.title} (0/${g.target} ${g.unit})`;
        }
        return `- ${g.title}`;
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
      .setFooter({ text: 'Use /goals to view, /progress to update, /completegoal to finish' })
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
 * Falls back to a single free-text goal on failure.
 */
async function extractGoalsFromText(
  db: ExtendedPrismaClient,
  memberId: string,
  text: string,
): Promise<ExtractedGoal[]> {
  try {
    const result = await callAI(db, {
      memberId,
      feature: 'planning',
      messages: [
        {
          role: 'system',
          content: `Extract goals from this text. For each goal, determine if it's measurable (has a number and unit) or free-text. Return as JSON array. Max 5 goals.`,
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
                  },
                  required: ['title', 'type', 'target', 'unit'],
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
