/**
 * Hybrid AI+template morning brief generation with full AI context.
 *
 * The morning brief is the daily hook -- a personalized message that shows
 * a member's goals, streak, rank, and today's agenda, delivered in Ace's
 * voice with references to ongoing conversations and community highlights.
 *
 * Approach:
 * 1. Build a structured template from real data
 * 2. Load conversation history and summary from memory service
 * 3. Gather community pulse (who's active, voice sessions, wins/lessons)
 * 4. Pass to DeepSeek V3.2 via OpenRouter with Ace personality
 * 5. Fall back to clean template formatting if AI fails
 */

import { EmbedBuilder, type Client } from 'discord.js';
import { TZDate } from '@date-fns/tz';
import { startOfDay } from 'date-fns';
import { OpenRouter } from '@openrouter/sdk';
import type { ExtendedPrismaClient } from '../../db/client.js';
import { config } from '../../core/config.js';
import { BRAND_COLORS } from '../../shared/constants.js';
import { deliverNotification } from '../notification-router/router.js';
import { getRankForXP, getNextRankInfo, calculateStreakMultiplier } from '../xp/engine.js';
import { getRecentMessages, getSummary } from '../ai-assistant/memory.js';
import { buildSystemPrompt, AI_NAME } from '../ai-assistant/personality.js';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) =>
      `${timestamp as string} [briefs] ${level}: ${message as string}`),
  ),
  transports: [new winston.transports.Console()],
});

/** In-memory brief cache: memberId -> { date, text }. Prevents regeneration cost. */
const briefCache = new Map<string, { date: string; text: string }>();

/** Lazy-initialized OpenRouter client. */
let openrouterClient: OpenRouter | null = null;

function getOpenRouterClient(): OpenRouter {
  if (!openrouterClient) {
    openrouterClient = new OpenRouter({
      apiKey: config.OPENROUTER_API_KEY,
    });
  }
  return openrouterClient;
}

// ─── Types ──────────────────────────────────────────────────────────────────────

/** Data assembled for brief generation. */
export interface MemberBriefData {
  displayName: string;
  timezone: string;
  briefTone: string;
  totalXp: number;
  currentStreak: number;
  streakMultiplier: number;
  currentRank: string;
  nextRankXp: string;
  activeGoals: { title: string; type: string; currentValue: number; targetValue: number | null; unit: string | null }[];
  todayCheckIns: number;
  reminderTimes: string[];
  lastCheckInCategories: string[];
}

/** Community pulse data for AI context. */
export interface CommunityPulse {
  todayCheckInCount: number;
  weeklyVoiceMinutes: number;
  recentWinsCount: number;
  recentLessonsCount: number;
}

/** Structured template data for AI or fallback rendering. */
interface BriefTemplate {
  greeting: string;
  streakStatus: string;
  rankProgress: string;
  goalsSummary: string[];
  todayReminders: string;
  milestoneApproaching: string | null;
}

// ─── Community Pulse ─────────────────────────────────────────────────────────────

/**
 * Gather community-wide activity metrics for the AI brief.
 *
 * - Count members who checked in today (across all members)
 * - Get total voice minutes this week across server
 * - Count wins and lessons posts in last 24 hours
 */
export async function getCommunityPulse(db: ExtendedPrismaClient): Promise<CommunityPulse> {
  const now = new Date();
  const todayStart = startOfDay(now);
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [todayCheckInCount, voiceAgg, recentWinsCount, recentLessonsCount] = await Promise.all([
    // Members who checked in today
    db.checkIn.groupBy({
      by: ['memberId'],
      where: { createdAt: { gte: todayStart } },
    }).then((groups) => groups.length),

    // Total voice minutes this week
    db.voiceSession.aggregate({
      _sum: { durationMinutes: true },
      where: { startedAt: { gte: weekStart }, durationMinutes: { not: null } },
    }),

    // Wins in last 24 hours
    db.xPTransaction.count({
      where: { source: 'WIN_POST', createdAt: { gte: dayAgo } },
    }),

    // Lessons in last 24 hours
    db.xPTransaction.count({
      where: { source: 'LESSON_POST', createdAt: { gte: dayAgo } },
    }),
  ]);

  return {
    todayCheckInCount,
    weeklyVoiceMinutes: voiceAgg._sum.durationMinutes ?? 0,
    recentWinsCount,
    recentLessonsCount,
  };
}

// ─── Template Building ──────────────────────────────────────────────────────────

/**
 * Build a structured brief template from member data.
 * This is the "truth layer" -- real data, no AI.
 */
export function buildBriefTemplate(data: MemberBriefData): BriefTemplate {
  // Greeting
  const greeting = `Good morning, ${data.displayName}!`;

  // Streak status
  const streakStatus = data.currentStreak > 0
    ? `${data.currentStreak}-day streak (${data.streakMultiplier.toFixed(1)}x multiplier)`
    : 'No active streak -- check in today to start one!';

  // Rank progress
  const rank = data.currentRank;
  const nextRank = data.nextRankXp;
  const rankProgress = `${rank} -- ${nextRank}`;

  // Goals summary
  const goalsSummary = data.activeGoals.map((g) => {
    if (g.type === 'MEASURABLE' && g.targetValue !== null) {
      return `${g.title}: ${g.currentValue}/${g.targetValue} ${g.unit ?? ''}`.trim();
    }
    return g.title;
  });

  // Today's reminders
  const todayReminders = data.reminderTimes.length > 0
    ? `Check-in reminders at: ${data.reminderTimes.join(', ')}`
    : 'No reminders set -- use /settings to configure';

  // Milestone approaching (within 20% of next rank)
  let milestoneApproaching: string | null = null;
  const nextRankMatch = data.nextRankXp.match(/^(\d[\d,]*)\s*XP/);
  if (nextRankMatch) {
    const xpToNext = parseInt(nextRankMatch[1].replace(',', ''), 10);
    if (xpToNext <= data.totalXp * 0.2) {
      milestoneApproaching = `Almost there -- only ${xpToNext} XP to next rank!`;
    }
  }

  return {
    greeting,
    streakStatus,
    rankProgress,
    goalsSummary,
    todayReminders,
    milestoneApproaching,
  };
}

// ─── Brief Generation ───────────────────────────────────────────────────────────

/**
 * Generate a morning brief using hybrid AI+template approach with full AI context.
 *
 * 1. Check cache -- if already generated today, return cached
 * 2. Build template from real data
 * 3. Load conversation history and community pulse
 * 4. Try AI generation with Ace personality
 * 5. Fall back to template formatting if AI fails
 */
export async function generateBrief(
  memberData: MemberBriefData,
  memberId: string,
  db: ExtendedPrismaClient,
): Promise<string> {
  // Check cache
  const todayKey = new TZDate(new Date(), memberData.timezone)
    .toISOString()
    .split('T')[0];
  const cached = briefCache.get(memberId);
  if (cached && cached.date === todayKey) {
    logger.debug(`Returning cached brief for ${memberId}`);
    return cached.text;
  }

  // Build template
  const template = buildBriefTemplate(memberData);

  // Try AI generation
  let briefText: string;
  try {
    const client = getOpenRouterClient();

    // Load conversation context for continuity
    const recentMessages = await getRecentMessages(db, memberId, 5);
    const summary = await getSummary(db, memberId);
    const summarySnippet = summary ? summary.slice(0, 500) : null;

    // Get community pulse
    const pulse = await getCommunityPulse(db);

    // Build Ace system prompt layered with brief-specific addendum
    const aceSystemPrompt = await buildSystemPrompt(db, memberId);
    const briefAddendum = `\n\nWrite a morning brief for this member. Keep it 3-6 sentences. Include their personal stats, reference any ongoing conversations or commitments they mentioned, add a community highlight if something interesting happened. Make it feel like their personal operator catching them up.`;

    // Build user message with full context
    const userParts: string[] = [
      `Member data:\n${JSON.stringify(template)}`,
    ];

    if (summarySnippet) {
      userParts.push(`Conversation summary:\n${summarySnippet}`);
    }

    if (recentMessages.length > 0) {
      const msgText = recentMessages
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n');
      userParts.push(`Recent conversation:\n${msgText}`);
    }

    userParts.push(
      `Community pulse: ${pulse.todayCheckInCount} members checked in today, ${pulse.weeklyVoiceMinutes} voice minutes this week, ${pulse.recentWinsCount} wins and ${pulse.recentLessonsCount} lessons posted in last 24h.`,
    );

    // Empty state nudge
    if (memberData.activeGoals.length === 0) {
      userParts.push(
        `IMPORTANT: This member has no goals set. Include a nudge: "You don't have any goals locked in yet. Use /setgoal to set one -- even something small gets the ball rolling."`,
      );
    }

    const completion = await client.chat.send({
      chatGenerationParams: {
        model: 'deepseek/deepseek-v3.2',
        messages: [
          {
            role: 'system' as const,
            content: aceSystemPrompt + briefAddendum,
          },
          {
            role: 'user' as const,
            content: userParts.join('\n\n'),
          },
        ],
        stream: false,
      },
    });

    const content = completion.choices[0]?.message?.content;
    if (content && typeof content === 'string' && content.length > 10) {
      briefText = content;
      logger.debug(`AI brief generated for ${memberId} with full context`);
    } else {
      briefText = formatTemplateFallback(template);
      logger.warn(`Empty AI response for ${memberId}, using template fallback`);
    }
  } catch (error) {
    briefText = formatTemplateFallback(template);
    logger.warn(`AI brief generation failed for ${memberId}: ${String(error)}`);
  }

  // Cache the result
  briefCache.set(memberId, { date: todayKey, text: briefText });

  return briefText;
}

/**
 * Format the brief template as clean text without AI personality.
 * This is the fallback when AI is unavailable.
 */
function formatTemplateFallback(template: BriefTemplate): string {
  const lines: string[] = [template.greeting];

  lines.push(`Streak: ${template.streakStatus}. Rank: ${template.rankProgress}.`);

  if (template.goalsSummary.length > 0) {
    lines.push(`Active goals: ${template.goalsSummary.join('; ')}.`);
  } else {
    lines.push("No active goals -- use /setgoal to set one. Even something small gets the ball rolling.");
  }

  lines.push(template.todayReminders);

  if (template.milestoneApproaching) {
    lines.push(template.milestoneApproaching);
  }

  return lines.join(' ');
}

// ─── Brief Delivery ─────────────────────────────────────────────────────────────

/**
 * Full morning brief flow: fetch data, generate, build embed, deliver.
 *
 * @param client - Discord.js client
 * @param db - Extended Prisma client
 * @param memberId - The member to send the brief to
 */
export async function sendBrief(
  client: Client,
  db: ExtendedPrismaClient,
  memberId: string,
): Promise<void> {
  try {
    // Fetch member with schedule and active goals
    const member = await db.member.findUniqueOrThrow({
      where: { id: memberId },
      include: {
        schedule: true,
        goals: {
          where: { status: { in: ['ACTIVE', 'EXTENDED'] } },
          orderBy: { deadline: 'asc' },
        },
      },
    });

    const schedule = member.schedule;
    if (!schedule) {
      logger.warn(`No schedule found for member ${memberId}, skipping brief`);
      return;
    }

    const timezone = schedule.timezone;
    const now = new TZDate(new Date(), timezone);
    const todayStart = startOfDay(now);

    // Count today's check-ins
    const todayCheckIns = await db.checkIn.count({
      where: {
        memberId,
        createdAt: { gte: todayStart },
      },
    });

    // Get last check-in categories
    const lastCheckIn = await db.checkIn.findFirst({
      where: { memberId },
      orderBy: { createdAt: 'desc' },
      select: { categories: true },
    });

    // Build member brief data
    const currentRank = getRankForXP(member.totalXp);
    const nextRankInfo = getNextRankInfo(member.totalXp);
    const streakMultiplier = calculateStreakMultiplier(member.currentStreak);

    const memberData: MemberBriefData = {
      displayName: member.displayName,
      timezone,
      briefTone: schedule.briefTone,
      totalXp: member.totalXp,
      currentStreak: member.currentStreak,
      streakMultiplier,
      currentRank: currentRank.name,
      nextRankXp: nextRankInfo,
      activeGoals: member.goals.map((g) => ({
        title: g.title,
        type: g.type,
        currentValue: g.currentValue,
        targetValue: g.targetValue,
        unit: g.unit,
      })),
      todayCheckIns,
      reminderTimes: schedule.reminderTimes,
      lastCheckInCategories: lastCheckIn?.categories ?? [],
    };

    // Generate brief with full AI context
    const briefText = await generateBrief(memberData, memberId, db);

    // Build branded embed (amber/gold)
    const embed = new EmbedBuilder()
      .setColor(BRAND_COLORS.primary)
      .setTitle('Morning Brief')
      .setDescription(briefText)
      .addFields(
        { name: 'XP', value: `${member.totalXp.toLocaleString()}`, inline: true },
        { name: 'Streak', value: `${member.currentStreak} days`, inline: true },
        { name: 'Active Goals', value: `${member.goals.length}`, inline: true },
      )
      .setFooter({ text: `${currentRank.name} | Use /settings to customize` })
      .setTimestamp();

    // Deliver to private space
    const delivered = await deliverNotification(client, db, memberId, 'brief', {
      embeds: [embed],
    });

    if (delivered) {
      logger.info(`Morning brief delivered to ${memberId}`);
    } else {
      logger.warn(`Could not deliver morning brief to ${memberId}`);
    }
  } catch (error) {
    logger.error(`Failed to send brief to ${memberId}: ${String(error)}`);
  }
}

// ─── Check-in Reminder ──────────────────────────────────────────────────────────

/**
 * Send a check-in reminder to a member.
 *
 * Skips if the member has already checked in today (in their timezone).
 * Feels like a personal assistant, not a nagging app.
 *
 * @param client - Discord.js client
 * @param db - Extended Prisma client
 * @param memberId - The member to remind
 */
export async function sendCheckinReminder(
  client: Client,
  db: ExtendedPrismaClient,
  memberId: string,
): Promise<void> {
  try {
    // Fetch member with schedule
    const member = await db.member.findUniqueOrThrow({
      where: { id: memberId },
      include: { schedule: true },
    });

    const schedule = member.schedule;
    if (!schedule) return;

    const timezone = schedule.timezone;
    const now = new TZDate(new Date(), timezone);
    const todayStart = startOfDay(now);

    // Check if member already checked in today -- if yes, skip (no nagging)
    const todayCheckIns = await db.checkIn.count({
      where: {
        memberId,
        createdAt: { gte: todayStart },
      },
    });

    if (todayCheckIns > 0) {
      logger.debug(`Skipping reminder for ${memberId} -- already checked in today`);
      return;
    }

    // Build a friendly, personal assistant-style reminder
    const reminderText = `Hey ${member.displayName}, you said you'd check in around now. How's it going? Use \`/checkin\` when you're ready.`;

    const delivered = await deliverNotification(client, db, memberId, 'brief', {
      content: reminderText,
    });

    if (delivered) {
      logger.info(`Check-in reminder sent to ${memberId}`);
    } else {
      logger.warn(`Could not deliver reminder to ${memberId}`);
    }
  } catch (error) {
    logger.error(`Failed to send reminder to ${memberId}: ${String(error)}`);
  }
}
