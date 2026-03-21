/**
 * Core chat handler for the AI assistant.
 *
 * Processes messages through the AI pipeline with:
 * - Per-member processing lock (prevents race conditions from rapid messages)
 * - Daily message cap (50 messages per member per day)
 * - Centralized AI client with budget enforcement and model routing
 * - Context assembly with token budget management
 */

import { TZDate } from '@date-fns/tz';
import { startOfDay } from 'date-fns';
import type { ExtendedPrismaClient } from '@28k/db';
import { callAI } from '../../shared/ai-client.js';
import { storeMessage, assembleContext } from './memory.js';
import { buildSystemPrompt } from './personality.js';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) =>
      `${timestamp as string} [chat] ${level}: ${message as string}`),
  ),
  transports: [new winston.transports.Console()],
});

// ─── Constants ─────────────────────────────────────────────────────────────────

/** Maximum messages a member can send per day. */
const DAILY_MESSAGE_CAP = 50;

// ─── Per-Member Processing Lock ────────────────────────────────────────────────

/**
 * Per-member processing lock using promise chaining.
 * Ensures messages from the same member are processed sequentially.
 */
const processingLocks = new Map<string, Promise<void>>();

/**
 * Execute a function with a per-member lock.
 * Multiple rapid messages from the same member are queued and processed in order.
 */
async function withMemberLock<T>(memberId: string, fn: () => Promise<T>): Promise<T> {
  const existing = processingLocks.get(memberId) ?? Promise.resolve();

  let resolve: () => void;
  const newLock = new Promise<void>((r) => { resolve = r; });
  processingLocks.set(memberId, newLock);

  // Wait for any existing processing to complete
  await existing;

  try {
    return await fn();
  } finally {
    resolve!();
    // Clean up if this is still the latest lock
    if (processingLocks.get(memberId) === newLock) {
      processingLocks.delete(memberId);
    }
  }
}

// ─── Chat Handler ──────────────────────────────────────────────────────────────

/**
 * Handle an incoming chat message from a member.
 *
 * 1. Check daily message cap
 * 2. Store the user message
 * 3. Assemble context (member data, summary, recent messages)
 * 4. Build messages array for the AI
 * 5. Call centralized AI client (handles model routing + budget)
 * 6. Store and return the assistant response
 *
 * Uses per-member lock to prevent race conditions.
 */
export async function handleChat(
  db: ExtendedPrismaClient,
  memberId: string,
  userMessage: string,
): Promise<string> {
  return withMemberLock(memberId, async () => {
    // 1. Check daily message cap
    const member = await db.member.findUniqueOrThrow({
      where: { id: memberId },
      include: { schedule: true },
    });

    const timezone = member.schedule?.timezone ?? 'UTC';
    const now = new TZDate(new Date(), timezone);
    const todayStart = startOfDay(now);

    const todayMessageCount = await db.conversationMessage.count({
      where: {
        memberId,
        role: 'user',
        createdAt: { gte: todayStart },
      },
    });

    if (todayMessageCount >= DAILY_MESSAGE_CAP) {
      return "You've hit the daily limit (50 messages). Resets at midnight your time. Use /checkin or /setgoal for those workflows.";
    }

    // 2. Store the user message
    await storeMessage(db, memberId, 'user', userMessage);

    // 3. Assemble context
    const context = await assembleContext(db, memberId);

    // 4. Build system prompt
    const systemPrompt = await buildSystemPrompt(db, memberId);

    // 5. Build messages array
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    // Add cold tier: conversation summary as historical context
    if (context.summary) {
      messages.push({
        role: 'system',
        content: `Historical context: ${context.summary}`,
      });
    }

    // Add warm tier: weekly summaries from days 8-30
    if (context.weeklySummaries.length > 0) {
      messages.push({
        role: 'system',
        content: `Recent weeks: ${context.weeklySummaries.join('\n')}`,
      });
    }

    // Add hot tier: recent messages (last 7 days verbatim)
    for (const msg of context.recentMessages) {
      messages.push({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      });
    }

    // 6. Call AI via centralized client
    const result = await callAI(db, {
      memberId,
      feature: 'chat',
      messages,
    });

    if (result.degraded || !result.content) {
      return "My circuits are a bit fried right now. Try again in a sec.";
    }

    const responseText = result.content;
    logger.debug(`AI response for ${memberId} (${responseText.length} chars, model: ${result.model})`);

    // 7. Store the assistant response
    await storeMessage(db, memberId, 'assistant', responseText);

    return responseText;
  });
}
