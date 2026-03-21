/**
 * Natural Language Timer Parser
 *
 * Two-stage parser for detecting and extracting timer requests from DM messages:
 * 1. Fast keyword pre-filter (isTimerRequest) -- prevents AI calls on every DM
 * 2. AI structured output (parseTimerRequest) -- extracts mode, duration, focus
 *
 * Conservative by design: only explicit timer/focus/pomodoro keywords trigger
 * the AI parser. Ambiguous messages like "I'm going to work on my project"
 * are NOT intercepted (Pitfall 6 -- over-broad intent detection).
 */

import { callAI } from '../../shared/ai-client.js';
import type { ExtendedPrismaClient } from '../../db/client.js';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface TimerParseResult {
  isTimerRequest: boolean;
  mode: 'pomodoro' | 'proportional' | null;
  workMinutes: number | null;
  breakMinutes: number | null;
  focus: string | null;
}

// ─── Stage 1: Keyword Pre-Filter ────────────────────────────────────────────────

/**
 * Keyword patterns that indicate explicit timer/focus intent.
 * All patterns are case-insensitive.
 *
 * Must match:
 * - "start a 45 min focus session on coding"
 * - "pomodoro 30 minutes"
 * - "begin a timer for 25 minutes"
 * - "set a work session for 1 hour"
 * - "focus for 30 minutes on reading"
 *
 * Must NOT match:
 * - "I'm going to start working on my project" (no timer keyword)
 * - "I focused on my tasks today" (past tense, no timer keyword)
 * - "How does the timer work?" (question about timer, not a start request)
 */
const TIMER_KEYWORD_PATTERNS: RegExp[] = [
  // "start/begin/set" + "timer/pomodoro/focus session/work session"
  /\b(start|begin|set)\b.*\b(timer|pomodoro|focus\s*session|work\s*session)\b/i,
  // "timer/pomodoro" + "start/begin/set/for"
  /\b(timer|pomodoro)\b.*\b(start|begin|set|for)\b/i,
  // "focus for/on [number]" (e.g., "focus for 30 minutes")
  /\bfocus\s+(for|on)\s*\d+/i,
  // Standalone "pomodoro" is always timer intent
  /\bpomodoro\b/i,
];

/**
 * Patterns that indicate a question or informational request about timers,
 * NOT an actual timer start request. These override keyword matches.
 */
const QUESTION_PATTERNS: RegExp[] = [
  /\b(how|what|when|where|why|does|can|could|would|should|is|are|was|were)\b.*\b(timer|pomodoro|focus\s*session)\b.*\?/i,
  /\bhow\s+(does|do|is|are)\b.*\b(timer|pomodoro)\b/i,
  /\bwhat\s+(is|are)\b.*\b(timer|pomodoro)\b/i,
  /\btell\s+me\s+about\b.*\b(timer|pomodoro)\b/i,
];

/**
 * Fast keyword check for timer intent.
 * Returns true ONLY if the message contains explicit timer/focus keywords
 * and is NOT a question about the timer feature.
 *
 * This prevents the AI parser from being called on every DM.
 */
export function isTimerRequest(message: string): boolean {
  // Check if it's a question about timers first
  for (const pattern of QUESTION_PATTERNS) {
    if (pattern.test(message)) return false;
  }

  // Check for timer keyword patterns
  for (const pattern of TIMER_KEYWORD_PATTERNS) {
    if (pattern.test(message)) return true;
  }

  return false;
}

// ─── Stage 2: AI Structured Output ──────────────────────────────────────────────

const TIMER_PARSE_SYSTEM_PROMPT = `Parse whether this message is a request to start a timer/focus session. Extract mode (pomodoro for structured work/break cycles, proportional for free-form work where break is calculated from work time), work duration in minutes, break duration in minutes (only for pomodoro), and what they want to focus on. If the user just says 'pomodoro' or 'timer' without specifying, default to pomodoro 25/5. If they say 'focus session' or 'focus for X minutes' without specifying mode, default to pomodoro. If not a timer request, set isTimerRequest to false.`;

const TIMER_PARSE_RESPONSE_FORMAT = {
  type: 'json_schema' as const,
  json_schema: {
    name: 'timer_parse',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        isTimerRequest: { type: 'boolean' },
        mode: { anyOf: [{ type: 'string', enum: ['pomodoro', 'proportional'] }, { type: 'null' }] },
        workMinutes: { anyOf: [{ type: 'number' }, { type: 'null' }] },
        breakMinutes: { anyOf: [{ type: 'number' }, { type: 'null' }] },
        focus: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      },
      required: ['isTimerRequest', 'mode', 'workMinutes', 'breakMinutes', 'focus'],
      additionalProperties: false,
    },
  },
};

/** Default result returned on any parse failure. */
const DEFAULT_PARSE_RESULT: TimerParseResult = {
  isTimerRequest: false,
  mode: null,
  workMinutes: null,
  breakMinutes: null,
  focus: null,
};

/**
 * Parse a DM message using AI structured output to extract timer parameters.
 * Uses the member's own AI budget (not 'system') since it's member-initiated.
 *
 * On any error (AI failure, JSON parse error, budget exceeded), gracefully
 * returns isTimerRequest: false so the message falls through to regular chat.
 *
 * @param db - Extended Prisma client for AI budget tracking
 * @param memberId - Internal member ID for budget tracking
 * @param message - The raw DM message text
 * @returns Parsed timer parameters or safe default on failure
 */
export async function parseTimerRequest(
  db: ExtendedPrismaClient,
  memberId: string,
  message: string,
): Promise<TimerParseResult> {
  try {
    const result = await callAI(db, {
      memberId,
      feature: 'timer',
      messages: [
        { role: 'system', content: TIMER_PARSE_SYSTEM_PROMPT },
        { role: 'user', content: message },
      ],
      responseFormat: TIMER_PARSE_RESPONSE_FORMAT,
    });

    // Budget exceeded or both models failed
    if (result.degraded || !result.content) {
      return DEFAULT_PARSE_RESULT;
    }

    const parsed = JSON.parse(result.content) as TimerParseResult;

    // Validate the parsed result has the expected shape
    if (typeof parsed.isTimerRequest !== 'boolean') {
      return DEFAULT_PARSE_RESULT;
    }

    return parsed;
  } catch {
    // JSON parse error, network error, or any other failure
    // Gracefully return "not a timer request" so message goes to regular chat
    return DEFAULT_PARSE_RESULT;
  }
}
