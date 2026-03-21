/**
 * Conversation memory service for the AI assistant.
 *
 * Handles message storage, retrieval, tiered context assembly, rolling
 * summarization, history export, and history deletion.
 *
 * Context tiers:
 * - Hot (0-7 days): Messages included verbatim -- most valuable for continuity
 * - Warm (8-30 days): Weekly pattern summaries -- condensed but meaningful
 * - Cold (30+ days): Monthly compressed rolling summary via AI
 *
 * Protected data (never trimmed regardless of tier):
 * - Member display name, work style, current focus, timezone, accountability level
 * - All active goals at any level
 * - Inspirations (names and context of people the member admires)
 * - Personal details from profile (interests, learning areas)
 * - Reflection breakthroughs (when added in Phase 12)
 *
 * Token budget management ensures we stay within Grok 4.1 Fast's
 * 2M context window (~70% budget = 1.4M tokens).
 */

import { subDays, startOfWeek, format } from 'date-fns';
import type { ExtendedPrismaClient } from '../../db/client.js';
import { callAI } from '../../shared/ai-client.js';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) =>
      `${timestamp as string} [memory] ${level}: ${message as string}`),
  ),
  transports: [new winston.transports.Console()],
});

// ─── Constants ─────────────────────────────────────────────────────────────────

/** Maximum recent messages to load for hot tier. */
export const RECENT_MESSAGE_CAP = 50;

/** Token budget for full context (~70% of Grok 4.1 Fast 2M window). */
export const CONTEXT_BUDGET = 1_400_000;

/** Tokens reserved for model output generation. */
export const OUTPUT_RESERVE = 4_000;

/** Tokens reserved for system prompt and member context. */
export const SYSTEM_PROMPT_RESERVE = 50_000;

// ─── Tier Boundaries ──────────────────────────────────────────────────────────

/** Hot tier: last 7 days -- data included verbatim. */
export const HOT_WINDOW_DAYS = 7;

/** Warm tier: days 8-30 -- weekly summaries. */
export const WARM_WINDOW_DAYS = 30;

/** Cold tier: 30+ days -- monthly compressed summary. */
export const COLD_THRESHOLD_DAYS = 30;

// ─── Token Estimation ──────────────────────────────────────────────────────────

/** Simple token count approximation: ~4 chars per token. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ─── Message Storage ───────────────────────────────────────────────────────────

/**
 * Store a conversation message in the database.
 */
export async function storeMessage(
  db: ExtendedPrismaClient,
  memberId: string,
  role: string,
  content: string,
): Promise<void> {
  await db.conversationMessage.create({
    data: { memberId, role, content },
  });
}

/**
 * Load the last N messages for a member in chronological order.
 */
export async function getRecentMessages(
  db: ExtendedPrismaClient,
  memberId: string,
  limit: number = RECENT_MESSAGE_CAP,
): Promise<Array<{ role: string; content: string; createdAt: Date }>> {
  const messages = await db.conversationMessage.findMany({
    where: { memberId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { role: true, content: true, createdAt: true },
  });
  return messages.reverse(); // Chronological order
}

/**
 * Load the conversation summary for a member, if it exists.
 */
export async function getSummary(
  db: ExtendedPrismaClient,
  memberId: string,
): Promise<string | null> {
  const summary = await db.conversationSummary.findUnique({
    where: { memberId },
    select: { summary: true },
  });
  return summary?.summary ?? null;
}

// ─── Context Assembly ──────────────────────────────────────────────────────────

/** Assembled conversation context for the AI with tiered data. */
export interface AssembledContext {
  /** Cold tier: monthly compressed rolling summary (30+ days). */
  summary: string | null;
  /** Warm tier: weekly pattern summaries (days 8-30). */
  weeklySummaries: string[];
  /** Hot tier: recent messages included verbatim (last 7 days). */
  recentMessages: Array<{ role: string; content: string }>;
  /** Protected: always verbatim, never trimmed. */
  memberContext: string;
}

/**
 * Assemble the full tiered conversation context for a member.
 *
 * Loads member profile, goals, schedule, recent check-ins, voice sessions,
 * and conversation data organized into hot/warm/cold tiers.
 * Protected data (memberContext) is never trimmed.
 *
 * Trimming priority (when over token budget):
 * 1. Warm tier weekly summaries are trimmed first (lower priority)
 * 2. Hot tier messages trimmed next (oldest first, keep min 10)
 * 3. If still over budget, trigger compressSummary()
 */
export async function assembleContext(
  db: ExtendedPrismaClient,
  memberId: string,
): Promise<AssembledContext> {
  // 1. Load member with profile, active goals, schedule, recent check-ins, voice sessions
  const member = await db.member.findUniqueOrThrow({
    where: { id: memberId },
    include: {
      profile: true,
      goals: {
        where: { status: { in: ['ACTIVE', 'EXTENDED'] } },
        orderBy: { deadline: 'asc' },
        include: {
          children: {
            where: { status: { in: ['ACTIVE', 'EXTENDED', 'COMPLETED'] } },
            select: { title: true, status: true },
          },
        },
      },
      schedule: true,
      checkIns: {
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { content: true, categories: true, createdAt: true },
      },
      voiceSessions: {
        orderBy: { startedAt: 'desc' },
        take: 3,
        select: { durationMinutes: true, channelId: true, startedAt: true },
      },
      inspirations: {
        orderBy: { createdAt: 'asc' },
        select: { name: true, context: true },
      },
    },
  });

  // 2. Build protected member context string (never trimmed)
  const memberContext = buildMemberContext(member);

  // 3. Load cold tier: existing rolling summary (30+ days compressed)
  const summary = await getSummary(db, memberId);

  // 4. Load hot tier: messages from the last HOT_WINDOW_DAYS (verbatim)
  const now = new Date();
  const hotCutoff = subDays(now, HOT_WINDOW_DAYS);
  const warmCutoff = subDays(now, WARM_WINDOW_DAYS);

  let hotMessages = await db.conversationMessage.findMany({
    where: {
      memberId,
      createdAt: { gte: hotCutoff },
    },
    orderBy: { createdAt: 'asc' },
    select: { role: true, content: true, createdAt: true },
  });

  // 5. Load warm tier: messages from days HOT_WINDOW_DAYS+1 to WARM_WINDOW_DAYS
  const warmMessages = await db.conversationMessage.findMany({
    where: {
      memberId,
      createdAt: {
        gte: warmCutoff,
        lt: hotCutoff,
      },
    },
    orderBy: { createdAt: 'asc' },
    select: { role: true, content: true, createdAt: true },
  });

  // 6. Build warm tier weekly summaries (no AI calls -- simple text heuristic)
  let weeklySummaries = buildWeeklySummaries(warmMessages);

  // 7. Token budget trimming
  const availableBudget = CONTEXT_BUDGET - OUTPUT_RESERVE - SYSTEM_PROMPT_RESERVE;

  // memberContext is protected -- count but never trim
  const protectedTokens = estimateTokens(memberContext);
  const coldTokens = estimateTokens(summary ?? '');

  let warmTokens = weeklySummaries.reduce((sum, s) => sum + estimateTokens(s), 0);
  let hotTokens = hotMessages.reduce((sum, m) => sum + estimateTokens(m.content), 0);

  let totalTokens = protectedTokens + coldTokens + warmTokens + hotTokens;

  // Step 1: Trim warm summaries first (lower priority than hot messages)
  while (totalTokens > availableBudget && weeklySummaries.length > 0) {
    const removed = weeklySummaries.shift();
    if (removed) {
      warmTokens -= estimateTokens(removed);
      totalTokens = protectedTokens + coldTokens + warmTokens + hotTokens;
    }
  }

  // Step 2: Trim oldest hot messages (keep minimum 10)
  while (totalTokens > availableBudget && hotMessages.length > 10) {
    const removed = hotMessages.shift();
    if (removed) {
      hotTokens -= estimateTokens(removed.content);
      totalTokens = protectedTokens + coldTokens + warmTokens + hotTokens;
    }
  }

  // Step 3: If still over budget, trigger compression and reload summary
  if (totalTokens > availableBudget) {
    await compressSummary(db, memberId);
    const newSummary = await getSummary(db, memberId);
    return {
      summary: newSummary,
      weeklySummaries,
      recentMessages: hotMessages.map(({ role, content }) => ({ role, content })),
      memberContext,
    };
  }

  return {
    summary,
    weeklySummaries,
    recentMessages: hotMessages.map(({ role, content }) => ({ role, content })),
    memberContext,
  };
}

// ─── Warm Tier: Weekly Summaries ────────────────────────────────────────────────

/**
 * Build weekly summary strings from warm-tier messages.
 *
 * Groups messages by ISO week and creates a short heuristic summary
 * for each week. Uses text truncation -- no AI calls (avoids expense
 * and recursion).
 */
function buildWeeklySummaries(
  messages: Array<{ role: string; content: string; createdAt: Date }>,
): string[] {
  if (messages.length === 0) return [];

  // Group messages by week
  const weekBuckets = new Map<string, Array<{ role: string; content: string }>>();

  for (const msg of messages) {
    const weekStart = startOfWeek(msg.createdAt, { weekStartsOn: 1 }); // Monday
    const weekKey = format(weekStart, 'yyyy-MM-dd');
    if (!weekBuckets.has(weekKey)) {
      weekBuckets.set(weekKey, []);
    }
    weekBuckets.get(weekKey)!.push({ role: msg.role, content: msg.content });
  }

  // Build summaries per week
  const summaries: string[] = [];
  for (const [weekKey, msgs] of weekBuckets) {
    const concatenated = msgs.map((m) => m.content).join(' ');
    const preview = concatenated.slice(0, 200) + (concatenated.length > 200 ? '...' : '');
    summaries.push(`Week of ${weekKey}: ${msgs.length} exchanges -- ${preview}`);
  }

  return summaries;
}

// ─── Summary Compression ───────────────────────────────────────────────────────

/**
 * Compress conversation messages older than WARM_WINDOW_DAYS into a rolling summary.
 *
 * Only compresses cold-tier messages (30+ days old). Messages within the warm
 * window (8-30 days) stay as messages for warm-tier assembly.
 *
 * 1. Load messages older than WARM_WINDOW_DAYS
 * 2. Prepend existing summary if any
 * 3. Call centralized AI client to compress into a concise summary
 * 4. Upsert the ConversationSummary record
 * 5. Delete the compressed messages
 */
export async function compressSummary(
  db: ExtendedPrismaClient,
  memberId: string,
): Promise<void> {
  try {
    const warmCutoff = subDays(new Date(), WARM_WINDOW_DAYS);

    // Load only messages older than the warm window (cold tier)
    const coldMessages = await db.conversationMessage.findMany({
      where: {
        memberId,
        createdAt: { lt: warmCutoff },
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, role: true, content: true },
    });

    if (coldMessages.length === 0) {
      logger.debug(`No cold-tier messages to compress for ${memberId}`);
      return;
    }

    // Build text to summarize
    const existingSummary = await getSummary(db, memberId);
    const parts: string[] = [];
    if (existingSummary) {
      parts.push(`Previous summary:\n${existingSummary}`);
    }
    parts.push(
      'Messages to summarize:\n' +
      coldMessages.map((m) => `${m.role}: ${m.content}`).join('\n'),
    );

    const textToSummarize = parts.join('\n\n');

    // Call centralized AI client to compress
    const result = await callAI(db, {
      memberId,
      feature: 'summary',
      messages: [
        {
          role: 'system',
          content:
            'Compress this conversation history into a concise summary preserving key facts, commitments, preferences, and ongoing topics. Keep it under 2000 words.',
        },
        {
          role: 'user',
          content: textToSummarize,
        },
      ],
    });

    if (result.degraded || !result.content) {
      logger.warn(`Summary compression skipped for ${memberId} -- AI degraded or unavailable`);
      return;
    }

    const summaryText = result.content;

    // Count total summarized messages (existing + newly compressed)
    const existingRecord = await db.conversationSummary.findUnique({
      where: { memberId },
      select: { messageCount: true },
    });
    const newMessageCount = (existingRecord?.messageCount ?? 0) + coldMessages.length;

    // Upsert the summary
    await db.conversationSummary.upsert({
      where: { memberId },
      create: {
        memberId,
        summary: summaryText,
        messageCount: newMessageCount,
      },
      update: {
        summary: summaryText,
        messageCount: newMessageCount,
      },
    });

    // Delete the compressed cold-tier messages
    const coldIds = coldMessages.map((m) => m.id);
    await db.conversationMessage.deleteMany({
      where: { id: { in: coldIds } },
    });

    logger.info(
      `Compressed ${coldMessages.length} cold-tier messages for ${memberId} (total summarized: ${newMessageCount})`,
    );
  } catch (error) {
    logger.error(`Failed to compress summary for ${memberId}: ${String(error)}`);
  }
}

// ─── History Export & Wipe ─────────────────────────────────────────────────────

/**
 * Export all conversation messages and summary as a JSON array.
 */
export async function exportHistory(
  db: ExtendedPrismaClient,
  memberId: string,
): Promise<Array<{ role: string; content: string; timestamp: string }>> {
  const messages = await db.conversationMessage.findMany({
    where: { memberId },
    orderBy: { createdAt: 'asc' },
    select: { role: true, content: true, createdAt: true },
  });

  const summary = await db.conversationSummary.findUnique({
    where: { memberId },
    select: { summary: true, updatedAt: true },
  });

  const result: Array<{ role: string; content: string; timestamp: string }> = [];

  // Include summary as a system entry at the beginning
  if (summary) {
    result.push({
      role: 'system-summary',
      content: summary.summary,
      timestamp: summary.updatedAt.toISOString(),
    });
  }

  // Include all messages
  for (const msg of messages) {
    result.push({
      role: msg.role,
      content: msg.content,
      timestamp: msg.createdAt.toISOString(),
    });
  }

  return result;
}

/**
 * Delete all conversation messages and summary for a member.
 */
export async function wipeHistory(
  db: ExtendedPrismaClient,
  memberId: string,
): Promise<void> {
  await db.conversationMessage.deleteMany({ where: { memberId } });
  await db.conversationSummary.deleteMany({ where: { memberId } });
  logger.info(`Wiped conversation history for ${memberId}`);
}

// ─── Member Context Builder ────────────────────────────────────────────────────

/**
 * Build a readable member context string for the system prompt.
 *
 * This is PROTECTED DATA -- included verbatim regardless of tier,
 * never compressed or trimmed by the token budget loop.
 */
function buildMemberContext(member: {
  displayName: string;
  totalXp: number;
  currentStreak: number;
  profile: {
    interests: string[];
    currentFocus: string | null;
    goals: string[];
    workStyle: string | null;
  } | null;
  goals: Array<{
    title: string;
    type: string;
    currentValue: number;
    targetValue: number | null;
    unit: string | null;
    status: string;
    parentId: string | null;
    timeframe: string | null;
    children?: Array<{ title: string; status: string }>;
  }>;
  schedule: {
    timezone: string;
    accountabilityLevel: string;
  } | null;
  checkIns: Array<{
    content: string;
    categories: string[];
    createdAt: Date;
  }>;
  voiceSessions: Array<{
    durationMinutes: number | null;
    channelId: string;
    startedAt: Date;
  }>;
  inspirations: Array<{ name: string; context: string | null }>;
}): string {
  const lines: string[] = [];

  lines.push(`Name: ${member.displayName}`);
  lines.push(`Total XP: ${member.totalXp}`);
  lines.push(`Current Streak: ${member.currentStreak} days`);

  if (member.profile) {
    if (member.profile.interests.length > 0) {
      lines.push(`Interests: ${member.profile.interests.join(', ')}`);
    }
    if (member.profile.currentFocus) {
      lines.push(`Current Focus: ${member.profile.currentFocus}`);
    }
    if (member.profile.goals.length > 0) {
      lines.push(`Profile Goals: ${member.profile.goals.join(', ')}`);
    }
    if (member.profile.workStyle) {
      lines.push(`Work Style: ${member.profile.workStyle}`);
    }
  }

  if (member.schedule) {
    lines.push(`Timezone: ${member.schedule.timezone}`);
    lines.push(`Accountability Level: ${member.schedule.accountabilityLevel}`);
  }

  if (member.goals.length > 0) {
    // Show only top-level goals (parentId === null) to avoid duplicate child entries.
    // Children are shown indented under their parent.
    const topLevelGoals = member.goals.filter((g) => g.parentId === null);
    if (topLevelGoals.length > 0) {
      lines.push('\nActive Goals:');
      for (const goal of topLevelGoals) {
        const tag = goal.timeframe ? `[${goal.timeframe}] ` : '';
        if (goal.children && goal.children.length > 0) {
          const completedChildren = goal.children.filter((c) => c.status === 'COMPLETED').length;
          lines.push(`  - ${tag}${goal.title}: ${completedChildren}/${goal.children.length} sub-goals`);
          for (const child of goal.children) {
            lines.push(`    > ${child.title}: ${child.status}`);
          }
        } else if (goal.type === 'MEASURABLE' && goal.targetValue !== null) {
          lines.push(`  - ${tag}${goal.title}: ${goal.currentValue}/${goal.targetValue} ${goal.unit ?? ''}`);
        } else {
          lines.push(`  - ${tag}${goal.title} (${goal.status})`);
        }
      }
    }
  }

  if (member.checkIns.length > 0) {
    lines.push('\nRecent Check-ins:');
    for (const ci of member.checkIns) {
      const date = ci.createdAt.toISOString().split('T')[0];
      lines.push(`  - ${date}: ${ci.categories.join(', ') || 'general'}`);
    }
  }

  if (member.voiceSessions.length > 0) {
    lines.push('\nRecent Voice Sessions:');
    for (const vs of member.voiceSessions) {
      const date = vs.startedAt.toISOString().split('T')[0];
      const duration = vs.durationMinutes ?? 0;
      lines.push(`  - ${date}: ${duration} min`);
    }
  }

  if (member.inspirations.length > 0) {
    lines.push('\nInspirations:');
    for (const insp of member.inspirations) {
      if (insp.context) {
        lines.push(`  - ${insp.name}: ${insp.context}`);
      } else {
        lines.push(`  - ${insp.name}`);
      }
    }
  }

  return lines.join('\n');
}
