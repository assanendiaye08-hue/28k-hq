/**
 * Reminder Parser
 *
 * Two-stage parser for detecting and extracting reminders from natural language:
 * 1. Fast keyword pre-filter (isReminderRequest) -- prevents chrono calls on every DM
 * 2. chrono-node time extraction + recurrence detection (parseReminder)
 *
 * Content extraction strips the "remind me" prefix, time expression, recurrence
 * phrase, and urgency keywords to produce a clean reminder content string.
 */

import * as chrono from 'chrono-node';
import {
  REMINDER_PATTERNS,
  QUESTION_PATTERNS,
  RECURRENCE_PATTERNS,
  URGENCY_KEYWORDS,
} from './constants.js';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface ParsedReminder {
  content: string;
  fireAt: Date | null;
  isRecurring: boolean;
  cronExpression: string | null;
  urgency: 'LOW' | 'HIGH';
}

// ─── Stage 1: Intent Detection ──────────────────────────────────────────────────

/**
 * Fast keyword check for reminder intent.
 * Returns true ONLY if the message contains explicit reminder keywords
 * and is NOT a question about reminders.
 *
 * This prevents chrono-node parsing from being called on every DM.
 */
export function isReminderRequest(text: string): boolean {
  // Reject questions about reminders first
  for (const pattern of QUESTION_PATTERNS) {
    if (pattern.test(text)) return false;
  }

  // Check for reminder keyword patterns
  for (const pattern of REMINDER_PATTERNS) {
    if (pattern.test(text)) return true;
  }

  return false;
}

// ─── Stage 2: Time + Content Extraction ─────────────────────────────────────────

/**
 * Parse a reminder request to extract content, time, recurrence, and urgency.
 *
 * Processing steps:
 * 1. Detect recurrence via RECURRENCE_PATTERNS, extract cronDay
 * 2. Detect urgency via URGENCY_KEYWORDS
 * 3. Parse time with chrono-node (forward-date, timezone-aware)
 * 4. Extract clean content by stripping parsed fragments
 * 5. Build cron expression for recurring reminders
 *
 * @param text - The raw message text (e.g., "remind me every Monday at 9am to review goals")
 * @param timezone - IANA timezone string (e.g., "America/New_York")
 * @returns Parsed reminder or null if time is unparseable
 */
export function parseReminder(text: string, timezone: string): ParsedReminder | null {
  let workingText = text;

  // Step 1: Detect recurrence
  let cronDay: string | null = null;
  let recurrenceMatch: string | null = null;

  for (const { pattern, cronDay: day } of RECURRENCE_PATTERNS) {
    const match = workingText.match(pattern);
    if (match) {
      cronDay = day;
      recurrenceMatch = match[0];
      // Strip recurrence prefix from text for chrono parsing
      workingText = workingText.replace(pattern, '').trim();
      break;
    }
  }

  const isRecurring = cronDay !== null;

  // Step 2: Detect urgency
  let urgency: 'LOW' | 'HIGH' = 'LOW';
  const urgencyMatch = workingText.match(URGENCY_KEYWORDS);
  if (urgencyMatch) {
    urgency = 'HIGH';
    workingText = workingText.replace(URGENCY_KEYWORDS, '').trim();
  }

  // Step 3: Parse time with chrono-node
  const results = chrono.parse(workingText, {
    instant: new Date(),
    timezone,
  }, {
    forwardDate: true,
  });

  if (results.length === 0) {
    return null; // Unparseable time
  }

  const chronoResult = results[0];
  const fireAt = chronoResult.start.date();

  // Step 4: Extract content
  // Remove "remind me" prefix variants
  let content = workingText
    .replace(/\bremind\s+me\b/i, '')
    .replace(/\bset\s+(a\s+)?reminder\b/i, '')
    .replace(/\breminder\b/i, '');

  // Remove the chrono-parsed time expression
  const timeText = chronoResult.text;
  const timeIndex = content.toLowerCase().indexOf(timeText.toLowerCase());
  if (timeIndex !== -1) {
    content = content.slice(0, timeIndex) + content.slice(timeIndex + timeText.length);
  }

  // Remove leading "to", "for", "that", "about" connectors
  content = content.replace(/^\s*(to|for|that|about)\s+/i, '').trim();
  // Remove trailing "to", "for" connectors
  content = content.replace(/\s+(to|for)$/i, '').trim();
  // Clean up double spaces and leading/trailing punctuation
  content = content.replace(/\s{2,}/g, ' ').replace(/^[\s,.-]+|[\s,.-]+$/g, '').trim();

  if (!content) {
    content = 'Reminder'; // Fallback if content extraction leaves nothing
  }

  // Step 5: Build cron expression for recurring reminders
  let cronExpression: string | null = null;
  if (isRecurring && cronDay) {
    const hour = chronoResult.start.get('hour') ?? 0;
    const minute = chronoResult.start.get('minute') ?? 0;
    cronExpression = `${minute} ${hour} * * ${cronDay}`;
  }

  return {
    content,
    fireAt,
    isRecurring,
    cronExpression,
    urgency,
  };
}
