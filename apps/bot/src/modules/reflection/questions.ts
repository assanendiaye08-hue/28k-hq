/**
 * AI-personalized reflection question generation.
 *
 * Fetches member activity data (goals, check-ins, timer sessions,
 * voice sessions, streak, previous reflections) and uses AI to
 * generate a single, specific, thought-provoking question that
 * references concrete things the member did (or didn't do).
 *
 * Also provides buildEveningClosingPrompt for the DAILY reflection
 * open-loop-closing routine: queries today's commitments, check-ins,
 * and goals to assemble a structured context string for the AI.
 *
 * Falls back to type-appropriate template questions if AI degrades.
 */

import type { ExtendedPrismaClient } from '@28k/db';
import { startOfDay } from 'date-fns';
import { TZDate } from '@date-fns/tz';
import { callAI } from '../../shared/ai-client.js';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) =>
      `${timestamp as string} [reflection-questions] ${level}: ${message as string}`),
  ),
  transports: [new winston.transports.Console()],
});

/** Result of generating a reflection question. */
export interface GeneratedQuestion {
  question: string;
  activitySummary: string;
}

/** Fallback questions for each reflection type. */
const FALLBACK_QUESTIONS: Record<string, string> = {
  DAILY: 'What was the most meaningful thing you worked on today?',
  WEEKLY: 'Looking at this week, what pattern do you notice in how you spent your time?',
  MONTHLY: "What's one thing you'd do differently next month based on what you learned this month?",
};

/**
 * Generate a personalized reflection question based on member activity data.
 *
 * @param db - Extended Prisma client
 * @param memberId - The member to generate a question for
 * @param reflectionType - DAILY, WEEKLY, or MONTHLY
 * @returns Generated question and the activity summary used to produce it
 */
export async function generateReflectionQuestion(
  db: ExtendedPrismaClient,
  memberId: string,
  reflectionType: string,
): Promise<GeneratedQuestion> {
  // Fetch member activity data
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [member, recentCheckins, timerSessions, voiceSessions, previousReflections] =
    await Promise.all([
      db.member.findUniqueOrThrow({
        where: { id: memberId },
        include: {
          goals: {
            where: { status: { in: ['ACTIVE', 'EXTENDED', 'COMPLETED'] } },
            orderBy: { createdAt: 'desc' },
            take: 10,
            include: {
              children: {
                select: { title: true, status: true },
                take: 5,
              },
            },
          },
        },
      }),
      db.checkIn.findMany({
        where: { memberId, createdAt: { gte: sevenDaysAgo } },
        orderBy: { createdAt: 'desc' },
        select: { categories: true, createdAt: true },
      }),
      db.timerSession.findMany({
        where: { memberId, startedAt: { gte: sevenDaysAgo } },
        orderBy: { startedAt: 'desc' },
        select: { totalWorkedMs: true, focus: true, startedAt: true },
      }),
      db.voiceSession.findMany({
        where: { memberId, startedAt: { gte: sevenDaysAgo } },
        orderBy: { startedAt: 'desc' },
        select: { durationMinutes: true, startedAt: true },
      }),
      db.reflection.findMany({
        where: { memberId },
        orderBy: { createdAt: 'desc' },
        take: 3,
        select: { question: true, type: true, insights: true, createdAt: true },
      }),
    ]);

  // Build activity summary string
  const summaryParts: string[] = [];

  // Goals
  const activeGoals = member.goals.filter((g) => g.status === 'ACTIVE' || g.status === 'EXTENDED');
  const completedGoals = member.goals.filter(
    (g) => g.status === 'COMPLETED' && g.completedAt && g.completedAt >= (reflectionType === 'MONTHLY' ? thirtyDaysAgo : sevenDaysAgo),
  );

  if (activeGoals.length > 0) {
    summaryParts.push(
      `Active goals (${activeGoals.length}): ${activeGoals.map((g) => {
        const tf = g.timeframe ? `[${g.timeframe}] ` : '';
        const childInfo = g.children.length > 0 ? ` (${g.children.filter((c) => c.status === 'COMPLETED').length}/${g.children.length} sub-goals done)` : '';
        return `${tf}${g.title}${childInfo}`;
      }).join(', ')}`,
    );
  }
  if (completedGoals.length > 0) {
    summaryParts.push(`Recently completed goals: ${completedGoals.map((g) => g.title).join(', ')}`);
  }

  // Check-ins
  if (recentCheckins.length > 0) {
    const categories = [...new Set(recentCheckins.flatMap((c) => c.categories))];
    summaryParts.push(
      `Check-ins last 7 days: ${recentCheckins.length} total. Categories: ${categories.join(', ') || 'general'}`,
    );
  } else {
    summaryParts.push('Check-ins last 7 days: none');
  }

  // Timer sessions
  if (timerSessions.length > 0) {
    const totalMinutes = Math.round(
      timerSessions.reduce((sum, s) => sum + (s.totalWorkedMs ?? 0), 0) / 60000,
    );
    const focusAreas = [...new Set(timerSessions.map((s) => s.focus).filter(Boolean))];
    summaryParts.push(
      `Timer sessions last 7 days: ${timerSessions.length} sessions, ${totalMinutes} minutes total.${focusAreas.length > 0 ? ` Focus areas: ${focusAreas.join(', ')}` : ''}`,
    );
  }

  // Voice sessions
  if (voiceSessions.length > 0) {
    const totalVoiceMinutes = voiceSessions.reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0);
    summaryParts.push(
      `Voice sessions last 7 days: ${voiceSessions.length} sessions, ${totalVoiceMinutes} minutes total`,
    );
  }

  // Streak
  summaryParts.push(`Current streak: ${member.currentStreak} days`);

  // Previous reflections (to avoid repeating themes)
  if (previousReflections.length > 0) {
    summaryParts.push(
      `Previous reflections (avoid repeating these themes): ${previousReflections.map((r) => `"${r.question}" (${r.type})`).join('; ')}`,
    );
  }

  const activitySummary = summaryParts.join('\n');

  // Call AI to generate personalized question
  try {
    const result = await callAI(db, {
      memberId,
      feature: 'reflection',
      messages: [
        {
          role: 'system',
          content:
            "You are generating a reflection question for a member. Based on their actual activity data, ask ONE specific, thought-provoking question. The question should reference concrete things they did (or didn't do). Never ask generic questions like 'how was your week?' -- reference their data. For DAILY type: focus on today's work and energy. For WEEKLY type: focus on patterns, alignment between goals and actions, what worked and what didn't. For MONTHLY type: focus on bigger picture, growth trajectory, and strategic alignment. Return a JSON object with 'question' (string).",
        },
        {
          role: 'user',
          content: `Reflection type: ${reflectionType}\n\nMember activity:\n${activitySummary}`,
        },
      ],
      responseFormat: {
        type: 'json_schema' as const,
        jsonSchema: {
          name: 'reflection_question',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              question: { type: 'string' },
            },
            required: ['question'],
            additionalProperties: false,
          },
        },
      },
    });

    if (result.degraded || !result.content) {
      logger.warn(`AI degraded for reflection question generation, using fallback`);
      return {
        question: FALLBACK_QUESTIONS[reflectionType] ?? FALLBACK_QUESTIONS.DAILY,
        activitySummary,
      };
    }

    const parsed = JSON.parse(result.content) as { question: string };
    if (!parsed.question || parsed.question.trim().length === 0) {
      return {
        question: FALLBACK_QUESTIONS[reflectionType] ?? FALLBACK_QUESTIONS.DAILY,
        activitySummary,
      };
    }

    logger.debug(`Generated ${reflectionType} reflection question for ${memberId}`);
    return { question: parsed.question, activitySummary };
  } catch (error) {
    logger.warn(`Reflection question generation failed, using fallback: ${String(error)}`);
    return {
      question: FALLBACK_QUESTIONS[reflectionType] ?? FALLBACK_QUESTIONS.DAILY,
      activitySummary,
    };
  }
}

// ─── Evening Closing Prompt (Open Loop Closure) ──────────────────────────────

/** Data assembled for the evening closing routine. */
export interface EveningClosingContext {
  /** Structured summary for the AI prompt. */
  prompt: string;
  /** Pending commitments found today. */
  pendingCommitments: Array<{ id: string; title: string }>;
  /** Active goals with no check-in today. */
  untouchedGoals: Array<{ id: string; title: string }>;
  /** Number of check-ins logged today. */
  checkInCount: number;
}

/**
 * Build the evening closing prompt for the DAILY reflection open-loop routine.
 *
 * Queries today's commitments, check-ins, and active goals to assemble a
 * structured context string. The AI uses this to:
 * 1. Show the member what open loops exist
 * 2. Ask what got done
 * 3. Capture tomorrow's top priority
 *
 * @param db - Extended Prisma client
 * @param memberId - The member to build context for
 * @returns Evening closing context with prompt and data
 */
export async function buildEveningClosingPrompt(
  db: ExtendedPrismaClient,
  memberId: string,
): Promise<EveningClosingContext> {
  // Get member's timezone for "today" calculation
  const schedule = await db.memberSchedule.findUnique({
    where: { memberId },
    select: { timezone: true },
  });
  const tz = schedule?.timezone ?? 'UTC';
  const nowInTz = new TZDate(new Date(), tz);
  const todayStart = startOfDay(nowInTz);

  // Fetch today's data in parallel
  const [pendingCommitments, todayCheckIns, activeGoals] = await Promise.all([
    // Commitments that are ACTIVE (pending) -- created today or with deadline today/past
    db.commitment.findMany({
      where: {
        memberId,
        status: 'ACTIVE',
        OR: [
          { createdAt: { gte: todayStart } },
          { deadline: { lte: new Date() } },
        ],
      },
      select: { id: true, title: true },
    }),
    // Today's check-ins
    db.checkIn.findMany({
      where: {
        memberId,
        createdAt: { gte: todayStart },
      },
      select: { id: true, categories: true, content: true },
    }),
    // Active goals
    db.goal.findMany({
      where: {
        memberId,
        status: { in: ['ACTIVE', 'EXTENDED'] },
        parentId: null, // Top-level only
      },
      select: { id: true, title: true },
    }),
  ]);

  // Determine which active goals had no check-in today referencing them
  // Simple heuristic: if there are check-ins today, goals are "touched";
  // if zero check-ins, all goals are untouched
  const untouchedGoals = todayCheckIns.length === 0
    ? activeGoals
    : []; // If member checked in today, we assume goals were addressed

  // Build structured prompt parts
  const parts: string[] = [];
  parts.push("Here's your day:");

  if (pendingCommitments.length > 0) {
    parts.push(`\nCommitments still open: ${pendingCommitments.map((c) => c.title).join(', ')}`);
  } else {
    parts.push('\nNo pending commitments.');
  }

  if (todayCheckIns.length > 0) {
    const categories = [...new Set(todayCheckIns.flatMap((ci) => ci.categories))];
    parts.push(`Check-ins today: ${todayCheckIns.length} (${categories.join(', ') || 'general'})`);
  } else {
    parts.push('No check-ins logged today.');
  }

  if (activeGoals.length > 0) {
    parts.push(`Active goals: ${activeGoals.map((g) => g.title).join(', ')}`);
    if (untouchedGoals.length > 0) {
      parts.push(`Goals with no activity today: ${untouchedGoals.map((g) => g.title).join(', ')}`);
    }
  }

  const prompt = parts.join('\n');

  return {
    prompt,
    pendingCommitments,
    untouchedGoals,
    checkInCount: todayCheckIns.length,
  };
}
