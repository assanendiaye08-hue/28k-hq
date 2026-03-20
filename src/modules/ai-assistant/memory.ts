/**
 * Conversation memory service for the AI assistant.
 *
 * Handles message storage, retrieval, context assembly, rolling
 * summarization, history export, and history deletion.
 *
 * Token budget management ensures we stay within DeepSeek V3.2's
 * 164K context window (~70% budget = 100K tokens).
 */

import { OpenRouter } from '@openrouter/sdk';
import { config } from '../../core/config.js';
import type { ExtendedPrismaClient } from '../../db/client.js';
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

/** Maximum recent messages to load. */
export const RECENT_MESSAGE_CAP = 50;

/** Token budget for full context (~70% of DeepSeek 164K window). */
export const CONTEXT_BUDGET = 100_000;

/** Tokens reserved for model output generation. */
export const OUTPUT_RESERVE = 4_000;

/** Tokens reserved for system prompt and member context. */
export const SYSTEM_PROMPT_RESERVE = 20_000;

// ─── Token Estimation ──────────────────────────────────────────────────────────

/** Simple token count approximation: ~4 chars per token. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ─── OpenRouter Client ─────────────────────────────────────────────────────────

let openrouterClient: OpenRouter | null = null;

function getOpenRouterClient(): OpenRouter {
  if (!openrouterClient) {
    openrouterClient = new OpenRouter({
      apiKey: config.OPENROUTER_API_KEY,
    });
  }
  return openrouterClient;
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

/** Assembled conversation context for the AI. */
export interface AssembledContext {
  summary: string | null;
  recentMessages: Array<{ role: string; content: string }>;
  memberContext: string;
}

/**
 * Assemble the full conversation context for a member.
 *
 * Loads member profile, goals, schedule, recent check-ins, voice sessions,
 * conversation summary, and recent messages. Applies token budget trimming.
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
    },
  });

  // 2. Build member context string
  const memberContext = buildMemberContext(member);

  // 3. Load conversation summary
  const summary = await getSummary(db, memberId);

  // 4. Load recent messages
  let recentMessages = await getRecentMessages(db, memberId, RECENT_MESSAGE_CAP);

  // 5. Estimate token count and trim if needed
  const availableBudget = CONTEXT_BUDGET - OUTPUT_RESERVE - SYSTEM_PROMPT_RESERVE;
  let totalTokens =
    estimateTokens(memberContext) +
    estimateTokens(summary ?? '') +
    recentMessages.reduce((sum, m) => sum + estimateTokens(m.content), 0);

  // Trim oldest recent messages first
  while (totalTokens > availableBudget && recentMessages.length > 10) {
    const removed = recentMessages.shift();
    if (removed) {
      totalTokens -= estimateTokens(removed.content);
    }
  }

  // 6. If still over budget after trimming to 10 messages, trigger compression
  if (totalTokens > availableBudget) {
    await compressSummary(db, memberId);
    // Reload summary after compression
    const newSummary = await getSummary(db, memberId);
    return {
      summary: newSummary,
      recentMessages: recentMessages.map(({ role, content }) => ({ role, content })),
      memberContext,
    };
  }

  return {
    summary,
    recentMessages: recentMessages.map(({ role, content }) => ({ role, content })),
    memberContext,
  };
}

// ─── Summary Compression ───────────────────────────────────────────────────────

/**
 * Compress older conversation messages into a rolling summary.
 *
 * 1. Load all messages NOT in the recent 50
 * 2. Prepend existing summary if any
 * 3. Call DeepSeek to compress into a concise summary
 * 4. Upsert the ConversationSummary record
 * 5. Delete the messages that were summarized
 */
export async function compressSummary(
  db: ExtendedPrismaClient,
  memberId: string,
): Promise<void> {
  try {
    // Load recent message IDs to exclude
    const recentMessages = await db.conversationMessage.findMany({
      where: { memberId },
      orderBy: { createdAt: 'desc' },
      take: RECENT_MESSAGE_CAP,
      select: { id: true },
    });
    const recentIds = new Set(recentMessages.map((m) => m.id));

    // Load all messages for this member
    const allMessages = await db.conversationMessage.findMany({
      where: { memberId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, role: true, content: true },
    });

    // Filter out recent messages -- only compress older ones
    const olderMessages = allMessages.filter((m) => !recentIds.has(m.id));
    if (olderMessages.length === 0) {
      logger.debug(`No older messages to compress for ${memberId}`);
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
      olderMessages.map((m) => `${m.role}: ${m.content}`).join('\n'),
    );

    const textToSummarize = parts.join('\n\n');

    // Call DeepSeek to compress
    const client = getOpenRouterClient();
    const completion = await client.chat.send({
      chatGenerationParams: {
        model: 'deepseek/deepseek-v3.2',
        messages: [
          {
            role: 'system' as const,
            content:
              'Compress this conversation history into a concise summary preserving key facts, commitments, preferences, and ongoing topics. Keep it under 2000 words.',
          },
          {
            role: 'user' as const,
            content: textToSummarize,
          },
        ],
        stream: false,
      },
    });

    const summaryText = completion.choices[0]?.message?.content;
    if (!summaryText || typeof summaryText !== 'string') {
      logger.warn(`Empty compression result for ${memberId}`);
      return;
    }

    // Count total summarized messages (existing + newly compressed)
    const existingRecord = await db.conversationSummary.findUnique({
      where: { memberId },
      select: { messageCount: true },
    });
    const newMessageCount = (existingRecord?.messageCount ?? 0) + olderMessages.length;

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

    // Delete the compressed messages
    const olderIds = olderMessages.map((m) => m.id);
    await db.conversationMessage.deleteMany({
      where: { id: { in: olderIds } },
    });

    logger.info(
      `Compressed ${olderMessages.length} messages for ${memberId} (total summarized: ${newMessageCount})`,
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
    lines.push('\nActive Goals:');
    for (const goal of member.goals) {
      if (goal.type === 'MEASURABLE' && goal.targetValue !== null) {
        lines.push(`  - ${goal.title}: ${goal.currentValue}/${goal.targetValue} ${goal.unit ?? ''}`);
      } else {
        lines.push(`  - ${goal.title} (${goal.status})`);
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

  return lines.join('\n');
}
