/**
 * Reminder Constants
 *
 * Default configuration values, button IDs, intent detection patterns,
 * recurrence patterns, and urgency keywords for the smart reminders system.
 */

/**
 * Button custom IDs for reminder interactions.
 * All prefixed with `reminder:` for routing in the global button handler.
 */
export const BUTTON_IDS = {
  ACKNOWLEDGE: 'reminder:ack',
  SKIP_NEXT: 'reminder:skip',
} as const;

/**
 * Default values for reminder scheduling and delivery.
 */
export const REMINDER_DEFAULTS = {
  /** Maximum number of repeat DMs for high urgency reminders before giving up. */
  maxRepeatCount: 3,

  /** Interval between high urgency repeat DMs (5 minutes). */
  repeatIntervalMs: 5 * 60 * 1000,

  /** Maximum setTimeout delay (32-bit signed integer limit ~24.8 days). */
  maxTimeoutMs: 2_147_483_647,

  /** Sweep interval for rescheduling far-future reminders (1 hour). */
  sweepIntervalMs: 60 * 60 * 1000,
} as const;

/**
 * Patterns that indicate a message is a reminder request.
 * All patterns are case-insensitive.
 *
 * Must match:
 * - "remind me to call X at 3pm"
 * - "reminder to submit report on Friday"
 * - "set a reminder for Monday at 9am"
 *
 * Must NOT match:
 * - "how do reminders work?"
 * - "what reminders do I have?"
 */
export const REMINDER_PATTERNS: RegExp[] = [
  /\bremind\s+me\b/i,
  /\breminder\b.*\b(to|at|on|for)\b/i,
  /\bset\s+(a\s+)?reminder\b/i,
];

/**
 * Patterns that indicate a question about reminders, NOT a reminder request.
 * These override REMINDER_PATTERNS to prevent false positives.
 */
export const QUESTION_PATTERNS: RegExp[] = [
  /\b(how|what|when|where|why|can|does|will|is)\b.*\breminder/i,
  /\blist\b.*\breminder/i,
  /\bshow\b.*\breminder/i,
  /\bcancel\b.*\breminder/i,
  /\bdelete\b.*\breminder/i,
];

/**
 * Recurrence patterns mapping natural language to cron day-of-week expressions.
 * The hour and minute are filled in from chrono-node time parsing.
 * Cron format: minute hour day-of-month month day-of-week
 * For recurring, we use: ${minute} ${hour} * * ${cronDay}
 */
export const RECURRENCE_PATTERNS: { pattern: RegExp; cronDay: string }[] = [
  { pattern: /\bevery\s+monday\b/i, cronDay: '1' },
  { pattern: /\bevery\s+tuesday\b/i, cronDay: '2' },
  { pattern: /\bevery\s+wednesday\b/i, cronDay: '3' },
  { pattern: /\bevery\s+thursday\b/i, cronDay: '4' },
  { pattern: /\bevery\s+friday\b/i, cronDay: '5' },
  { pattern: /\bevery\s+saturday\b/i, cronDay: '6' },
  { pattern: /\bevery\s+sunday\b/i, cronDay: '0' },
  { pattern: /\bevery\s+day\b/i, cronDay: '*' },
  { pattern: /\bevery\s+weekday\b/i, cronDay: '1-5' },
  { pattern: /\bevery\s+weekend\b/i, cronDay: '0,6' },
];

/**
 * Keywords that indicate high urgency for a reminder.
 * When detected in natural language, the reminder is set to HIGH urgency.
 */
export const URGENCY_KEYWORDS = /\b(urgent|urgently|important|critical)\b/i;
