/**
 * Core chat handler for the AI assistant.
 *
 * Two modes of operation:
 * - handleChat: Plain conversation (used by /ask slash command)
 * - handleChatWithTools: Tool-calling conversation (used by DM handler)
 *
 * Both share the same pipeline:
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
import { intentTools } from './intent-tools.js';
import winston from 'winston';

// ─── Topic Classification ────────────────────────────────────────────────────

/**
 * Classify a message into a topic using keyword heuristics.
 *
 * Lightweight -- no LLM call. Handles the 80% case. The LLM's own topic
 * awareness (from TOOL_AWARENESS_PROMPT) naturally avoids bleeding for
 * the remaining 20%.
 */
export function classifyTopic(message: string): string {
  const lower = message.toLowerCase();
  if (/\b(code|coding|programming|api|bug|deploy|git|pr|frontend|backend|database|app)\b/.test(lower)) return 'coding';
  if (/\b(gym|workout|fitness|run|exercise|diet|weight|muscle|cardio)\b/.test(lower)) return 'fitness';
  if (/\b(business|revenue|sales|marketing|launch|startup|customers|pricing)\b/.test(lower)) return 'business';
  if (/\b(read|book|course|learn|study|tutorial)\b/.test(lower)) return 'learning';
  if (/\b(design|figma|ui|ux|wireframe|mockup|layout)\b/.test(lower)) return 'design';
  if (/\b(content|write|blog|newsletter|video|youtube|social media|twitter|post)\b/.test(lower)) return 'content';
  return 'general';
}

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

// ─── Types ──────────────────────────────────────────────────────────────────────

/** Result from handleChatWithTools, indicating whether a tool was called. */
export interface ChatWithToolsResult {
  response: string;
  toolCall?: { name: string; params: Record<string, unknown> } | null;
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

    // 2. Classify topic from user message
    const topic = classifyTopic(userMessage);

    // 3. Store the user message with topic
    await storeMessage(db, memberId, 'user', userMessage, topic);

    // 4. Assemble context with topic filtering
    const context = await assembleContext(db, memberId, topic);

    // 5. Build system prompt
    const systemPrompt = await buildSystemPrompt(db, memberId);

    // 6. Build messages array
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

    // 7. Call AI via centralized client
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

    // 8. Store the assistant response with same topic
    await storeMessage(db, memberId, 'assistant', responseText, topic);

    return responseText;
  });
}

// ─── Tool-Calling Chat Handler ──────────────────────────────────────────────────

/**
 * Handle a DM message with tool-calling support.
 *
 * Same pipeline as handleChat (daily cap, member lock, context assembly),
 * but passes intentTools to the AI so it can detect actionable intents.
 *
 * Returns a ChatWithToolsResult:
 * - If the LLM invoked a tool: { response, toolCall: { name, params } }
 * - If no tool called: { response, toolCall: null }
 *
 * The caller is responsible for presenting confirmations and executing actions.
 */
export async function handleChatWithTools(
  db: ExtendedPrismaClient,
  memberId: string,
  userMessage: string,
): Promise<ChatWithToolsResult> {
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
      return {
        response: "You've hit the daily limit (50 messages). Resets at midnight your time.",
        toolCall: null,
      };
    }

    // 2. Classify topic from user message
    const topic = classifyTopic(userMessage);

    // 3. Store the user message with topic
    await storeMessage(db, memberId, 'user', userMessage, topic);

    // 4. Assemble context with topic filtering
    const context = await assembleContext(db, memberId, topic);

    // 5. Build system prompt
    const systemPrompt = await buildSystemPrompt(db, memberId);

    // 6. Build messages array
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

    // 7. Call AI with tools
    const result = await callAI(db, {
      memberId,
      feature: 'intent',
      messages,
      tools: intentTools,
    });

    if (result.degraded) {
      return {
        response: "My circuits are a bit fried right now. Try again in a sec.",
        toolCall: null,
      };
    }

    // 8. Check for tool calls
    if (result.toolCalls && result.toolCalls.length > 0) {
      const firstToolCall = result.toolCalls[0];
      let parsedParams: Record<string, unknown>;
      try {
        parsedParams = JSON.parse(firstToolCall.function.arguments) as Record<string, unknown>;
      } catch {
        logger.warn(`Failed to parse tool call arguments: ${firstToolCall.function.arguments}`);
        parsedParams = {};
      }

      // Store assistant response if it has content alongside the tool call
      if (result.content) {
        await storeMessage(db, memberId, 'assistant', result.content, topic);
      }

      logger.debug(
        `Tool call for ${memberId}: ${firstToolCall.function.name} (${JSON.stringify(parsedParams)})`,
      );

      return {
        response: result.content ?? '',
        toolCall: {
          name: firstToolCall.function.name,
          params: parsedParams,
        },
      };
    }

    // 9. No tool call -- regular conversation
    const responseText = result.content ?? '';
    if (responseText) {
      logger.debug(`AI response for ${memberId} (${responseText.length} chars, model: ${result.model})`);
      await storeMessage(db, memberId, 'assistant', responseText, topic);
    }

    return {
      response: responseText || "My circuits are a bit fried right now. Try again in a sec.",
      toolCall: null,
    };
  });
}
