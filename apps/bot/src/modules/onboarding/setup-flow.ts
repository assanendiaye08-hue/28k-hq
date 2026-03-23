/**
 * The core onboarding DM conversation flow.
 *
 * When a member runs /setup, this module opens a DM channel and asks
 * 5 natural questions. Each question waits up to 5 minutes for a response
 * with a brief acknowledgment after each answer.
 *
 * The flow is conversational, not form-like. Acknowledgments vary to feel natural.
 * All private interactions happen via DMs -- no space preference question needed.
 *
 * Returns a structured result with answers, or an error if DMs are closed
 * or the member times out.
 */

import {
  type Client,
  type GuildMember,
  type DMChannel,
  type Message,
  type Collection,
  EmbedBuilder,
} from 'discord.js';
import type { Logger } from 'winston';
import winston from 'winston';
import { SETUP_TIMEOUT_MS, BRAND_COLORS } from '@28k/shared';
import type { ExtendedPrismaClient } from '@28k/db';
import type { IEventBus } from '../../shared/types.js';
import { callAI } from '../../shared/ai-client.js';

const setupLogger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) =>
      `${timestamp as string} [coaching-onboarding] ${level}: ${message as string}`),
  ),
  transports: [new winston.transports.Console()],
});

/** Track users currently in setup flow so other DM listeners can skip them. */
export const activeSetupUsers = new Set<string>();

/** Track users currently in coaching onboarding so DM listener skips them. */
export const activeCoachingUsers = new Set<string>();

/**
 * Setup question definition.
 */
interface SetupQuestion {
  key: string;
  question: string;
}

/**
 * Successful setup flow result.
 */
export interface SetupFlowResult {
  answers: Record<string, string>;
  displayName: string;
}

/**
 * Error result when setup flow cannot complete.
 */
export interface SetupFlowError {
  error: 'dms_closed' | 'timeout' | 'cancelled';
}

/**
 * The 5 onboarding questions asked during setup.
 * Keys match the profile field names for easy mapping.
 */
const QUESTIONS: SetupQuestion[] = [
  {
    key: 'situation',
    question: "What's your current hustle? What are you working on right now?",
  },
  {
    key: 'interests',
    question:
      "What areas are you most into? (coding, design, marketing, writing, business, or whatever you're into)",
  },
  {
    key: 'goals',
    question: "What's the main thing you're trying to achieve in the next 3 months?",
  },
  {
    key: 'learn',
    question: 'What do you want to learn or get better at?',
  },
  {
    key: 'style',
    question:
      'How do you like to work? Solo grinder? Need accountability? Love competition? Describe your style.',
  },
];

/**
 * Varied acknowledgments to keep the conversation feeling natural.
 * Cycled through in order (not random, for consistency).
 */
const ACKNOWLEDGMENTS = [
  'Got it.',
  'Nice.',
  'Solid.',
  'Cool, noted.',
  'Appreciate that.',
];

/**
 * Wait for a single message response in a DM channel.
 *
 * @param dm - The DM channel to listen in
 * @param authorId - The Discord user ID to filter messages from
 * @returns The message content, or null if timed out
 */
async function awaitResponse(
  dm: DMChannel,
  authorId: string,
): Promise<string | null> {
  try {
    const collected: Collection<string, Message> = await dm.awaitMessages({
      filter: (msg: Message) => msg.author.id === authorId,
      max: 1,
      time: SETUP_TIMEOUT_MS,
      errors: ['time'],
    });

    const response = collected.first();
    return response?.content ?? null;
  } catch {
    // Timeout
    return null;
  }
}

/**
 * Run the onboarding DM conversation with a member.
 *
 * Asks 5 natural questions about who they are and what they're building.
 * All private interactions happen via DMs.
 *
 * @param member - The guild member running /setup
 * @param logger - Logger for tracking progress
 * @returns SetupFlowResult on success, SetupFlowError on failure
 */
export async function runSetupFlow(
  member: GuildMember,
  logger: Logger,
): Promise<SetupFlowResult | SetupFlowError> {
  // Mark user as in setup flow so AI assistant skips their DMs
  activeSetupUsers.add(member.id);

  // Step 1: Open DM channel
  let dm: DMChannel;
  try {
    dm = await member.createDM();
  } catch {
    activeSetupUsers.delete(member.id);
    logger.warn(`Could not open DM with ${member.user.tag} -- DMs may be closed`);
    return { error: 'dms_closed' };
  }

  try {
    // Step 2: Send intro message
    try {
      await dm.send(
        "Hey! Let's get you set up. I'm going to ask you a few questions so I can tailor " +
        "the server to you. Just answer naturally -- no wrong answers.",
      );
    } catch {
      logger.warn(`Could not send DM to ${member.user.tag} -- DMs likely closed`);
      return { error: 'dms_closed' };
    }

    // Step 3: Ask questions one at a time
    const answers: Record<string, string> = {};

    for (let i = 0; i < QUESTIONS.length; i++) {
      const q = QUESTIONS[i];

      await dm.send(q.question);

      const response = await awaitResponse(dm, member.id);

      if (response === null) {
        // Timeout
        await dm.send(
          "No worries, you can run /setup again whenever you're ready.",
        ).catch(() => {
          // Member may have closed DMs or left the server
        });
        logger.info(`Setup flow timed out for ${member.user.tag} on question: ${q.key}`);
        return { error: 'timeout' };
      }

      answers[q.key] = response;

      // Send varied acknowledgment (not after the last question)
      if (i < QUESTIONS.length - 1) {
        await dm.send(ACKNOWLEDGMENTS[i % ACKNOWLEDGMENTS.length]);
      }
    }

    logger.info(
      `Setup flow complete for ${member.user.tag}: answers=${Object.keys(answers).length}`,
    );

    return {
      answers,
      displayName: member.displayName,
    };
  } finally {
    activeSetupUsers.delete(member.id);
  }
}

// ─── Coaching Onboarding ──────────────────────────────────────────────────────

/** Common IANA timezone aliases for fuzzy matching. */
const TIMEZONE_ALIASES: Record<string, string> = {
  est: 'America/New_York',
  edt: 'America/New_York',
  eastern: 'America/New_York',
  cst: 'America/Chicago',
  cdt: 'America/Chicago',
  central: 'America/Chicago',
  mst: 'America/Denver',
  mdt: 'America/Denver',
  mountain: 'America/Denver',
  pst: 'America/Los_Angeles',
  pdt: 'America/Los_Angeles',
  pacific: 'America/Los_Angeles',
  gmt: 'Europe/London',
  bst: 'Europe/London',
  london: 'Europe/London',
  cet: 'Europe/Paris',
  cest: 'Europe/Paris',
  paris: 'Europe/Paris',
  lyon: 'Europe/Paris',
  marseille: 'Europe/Paris',
  toulouse: 'Europe/Paris',
  france: 'Europe/Paris',
  berlin: 'Europe/Berlin',
  germany: 'Europe/Berlin',
  madrid: 'Europe/Madrid',
  spain: 'Europe/Madrid',
  rome: 'Europe/Rome',
  italy: 'Europe/Rome',
  amsterdam: 'Europe/Amsterdam',
  brussels: 'Europe/Brussels',
  zurich: 'Europe/Zurich',
  stockholm: 'Europe/Stockholm',
  dubai: 'Asia/Dubai',
  uae: 'Asia/Dubai',
  jst: 'Asia/Tokyo',
  tokyo: 'Asia/Tokyo',
  japan: 'Asia/Tokyo',
  ist: 'Asia/Kolkata',
  india: 'Asia/Kolkata',
  mumbai: 'Asia/Kolkata',
  delhi: 'Asia/Kolkata',
  singapore: 'Asia/Singapore',
  shanghai: 'Asia/Shanghai',
  beijing: 'Asia/Shanghai',
  china: 'Asia/Shanghai',
  seoul: 'Asia/Seoul',
  korea: 'Asia/Seoul',
  aest: 'Australia/Sydney',
  sydney: 'Australia/Sydney',
  australia: 'Australia/Sydney',
  utc: 'UTC',
  'new york': 'America/New_York',
  'los angeles': 'America/Los_Angeles',
  chicago: 'America/Chicago',
  denver: 'America/Denver',
  toronto: 'America/Toronto',
  montreal: 'America/Montreal',
  canada: 'America/Toronto',
  mexico: 'America/Mexico_City',
  brazil: 'America/Sao_Paulo',
  'sao paulo': 'America/Sao_Paulo',
};

/**
 * Resolve a timezone string from user input. Accepts IANA strings directly,
 * common abbreviations, and city/country names.
 */
function resolveTimezoneStatic(input: string): string | null {
  // Strip common suffixes like "time", "timezone", "time zone"
  const stripped = input.trim().toLowerCase()
    .replace(/\s*(time\s*zone|timezone|time)\s*$/i, '')
    .replace(/[_-]/g, ' ')
    .trim();

  if (TIMEZONE_ALIASES[stripped]) return TIMEZONE_ALIASES[stripped];

  // Check if it's a valid IANA string directly
  try {
    Intl.DateTimeFormat(undefined, { timeZone: input.trim() });
    return input.trim();
  } catch { /* not valid IANA */ }

  // Partial match
  for (const [key, value] of Object.entries(TIMEZONE_ALIASES)) {
    if (stripped.includes(key) || key.includes(stripped)) {
      return value;
    }
  }

  return null;
}

/**
 * Resolve timezone using AI when static matching fails.
 * Returns the IANA string, or null if genuinely unresolvable.
 */
async function resolveTimezoneWithAI(db: ExtendedPrismaClient, input: string): Promise<string | null> {
  try {
    const result = await callAI(db, {
      memberId: 'system',
      feature: 'chat',
      messages: [
        {
          role: 'system',
          content: 'You are a timezone resolver. Given user input, return the correct IANA timezone string (e.g. Europe/Paris, America/New_York). Reply with ONLY the IANA string, nothing else. If completely unresolvable, reply UNKNOWN.',
        },
        { role: 'user', content: `Timezone input: "${input}"` },
      ],
    });
    if (!result.content) return null;
    const tz = result.content.trim();
    if (tz === 'UNKNOWN') return null;
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
      return tz;
    } catch { return null; }
  } catch {
    return null;
  }
}

/**
 * Parse a time string like "8am", "9:30am", "14:00" into HH:mm format.
 */
function parseTimeInput(input: string): string | null {
  const trimmed = input.trim().toLowerCase();

  // Match HH:mm format
  const hhmmMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmmMatch) {
    const h = parseInt(hhmmMatch[1], 10);
    const m = parseInt(hhmmMatch[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
  }

  // Match "Xam", "X:MMam", "Xpm" style
  const ampmMatch = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (ampmMatch) {
    let h = parseInt(ampmMatch[1], 10);
    const m = ampmMatch[2] ? parseInt(ampmMatch[2], 10) : 0;
    const period = ampmMatch[3].toLowerCase();

    if (period === 'pm' && h < 12) h += 12;
    if (period === 'am' && h === 12) h = 0;

    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
  }

  return null;
}

/**
 * Run the coaching onboarding flow for a first-time DM interaction.
 *
 * Asks 3 quick questions: timezone, morning brief time, coaching level.
 * Creates or updates MemberSchedule with collected preferences.
 * Emits 'scheduleUpdated' so SchedulerManager picks up the new schedule.
 *
 * @param client - Discord.js client
 * @param db - Extended Prisma client
 * @param memberId - The member's internal ID
 * @param discordId - The member's Discord user ID
 * @param events - Event bus for emitting scheduleUpdated
 */
export async function runCoachingOnboarding(
  client: Client,
  db: ExtendedPrismaClient,
  memberId: string,
  discordId: string,
  events: IEventBus,
): Promise<void> {
  activeCoachingUsers.add(discordId);

  try {
    // Open DM channel
    let dm: DMChannel;
    try {
      const user = await client.users.fetch(discordId);
      dm = await user.createDM();
    } catch {
      setupLogger.warn(`Could not open DM with ${discordId} for coaching onboarding`);
      return;
    }

    // Intro
    try {
      await dm.send(
        "Before we chat, let me get a few quick preferences so I can work around your schedule. " +
        "This only takes a minute.",
      );
    } catch {
      setupLogger.warn(`Could not send DM to ${discordId} -- DMs likely closed`);
      return;
    }

    // ── Question 1: Timezone ──────────────────────────────────────────────────
    await dm.send(
      "What timezone are you in? City, country, or abbreviation — whatever's easiest (e.g. Paris, EST, Tokyo, Brazil).",
    );

    let timezone = 'UTC';
    const tzResponse = await awaitCoachingResponse(dm, discordId);
    if (tzResponse === null || /skip/i.test(tzResponse ?? '')) {
      await dm.send("No worries, we'll use UTC. Just tell me your timezone anytime to update it.");
    } else {
      const resolved = resolveTimezoneStatic(tzResponse);
      if (resolved) {
        timezone = resolved;
        await dm.send(`Got it, ${timezone}.`);
      } else {
        // AI fallback — try to resolve naturally
        await dm.send("Let me look that up...");
        const aiResolved = await resolveTimezoneWithAI(db, tzResponse);
        if (aiResolved) {
          timezone = aiResolved;
          await dm.send(`Got it, ${timezone}.`);
        } else {
          // Ask for clarification once
          await dm.send(
            "I couldn't figure that one out. What's the nearest major city or country? Or say 'skip' to use UTC.",
          );
          const retryResponse = await awaitCoachingResponse(dm, discordId);
          if (retryResponse && !/skip/i.test(retryResponse)) {
            const retryStatic = resolveTimezoneStatic(retryResponse);
            const retryFinal = retryStatic ?? await resolveTimezoneWithAI(db, retryResponse);
            if (retryFinal) {
              timezone = retryFinal;
              await dm.send(`Got it, ${timezone}.`);
            } else {
              await dm.send("Couldn't match it — defaulting to UTC. Just tell me anytime to update it.");
            }
          } else {
            await dm.send("Defaulting to UTC. Just tell me anytime to update it.");
          }
        }
      }
    }

    // ── Question 2: Morning brief time ────────────────────────────────────────
    await dm.send(
      "When should I send your morning brief? (e.g., 8am, 9:30am) or 'skip' for no morning brief.",
    );

    let briefTime: string | null = null;
    const briefResponse = await awaitCoachingResponse(dm, discordId);
    if (briefResponse === null || /skip/i.test(briefResponse ?? '')) {
      await dm.send("No morning brief — just tell me anytime and I'll set it up.");
    } else {
      const parsed = parseTimeInput(briefResponse);
      if (parsed) {
        briefTime = parsed;
        await dm.send(`Morning brief set for ${briefTime}.`);
      } else {
        await dm.send("Couldn't parse that time — skipping for now. Just tell me anytime to set it.");
      }
    }

    // ── Question 3: Coaching level ────────────────────────────────────────────
    await dm.send(
      "How much should I push you?\n" +
      "**light** -- gentle reminders\n" +
      "**medium** -- direct check-ins\n" +
      "**heavy** -- full accountability partner",
    );

    let accountabilityLevel = 'medium';
    const levelResponse = await awaitCoachingResponse(dm, discordId);
    if (levelResponse !== null) {
      const normalized = levelResponse.trim().toLowerCase();
      if (['light', 'medium', 'heavy'].includes(normalized)) {
        accountabilityLevel = normalized;
      } else if (/gentle|soft|easy|low/i.test(normalized)) {
        accountabilityLevel = 'light';
      } else if (/hard|intense|strict|high|full/i.test(normalized)) {
        accountabilityLevel = 'heavy';
      }
      // Default stays 'medium' for anything else
    }
    await dm.send(`Coaching level: ${accountabilityLevel}.`);

    // ── Create/update MemberSchedule ──────────────────────────────────────────
    const existing = await db.memberSchedule.findUnique({ where: { memberId } });

    if (existing) {
      await db.memberSchedule.update({
        where: { memberId },
        data: {
          timezone,
          briefTime,
          accountabilityLevel,
          enableBrief: true,
          enableNudge: true,
          enableReflection: true,
        },
      });
    } else {
      await db.memberSchedule.create({
        data: {
          memberId,
          timezone,
          briefTime,
          accountabilityLevel,
          enableBrief: true,
          enableNudge: true,
          enableReflection: true,
        },
      });
    }

    // ── Confirmation embed ────────────────────────────────────────────────────
    const confirmEmbed = new EmbedBuilder()
      .setColor(BRAND_COLORS.primary)
      .setTitle('Coaching Preferences Set')
      .addFields(
        { name: 'Timezone', value: timezone, inline: true },
        { name: 'Morning Brief', value: briefTime ?? 'Off', inline: true },
        { name: 'Coaching Level', value: accountabilityLevel, inline: true },
      )
      .setFooter({ text: "Just DM me anytime to adjust anything" })
      .setTimestamp();

    await dm.send({ embeds: [confirmEmbed] });

    // Help message — show what Jarvis can do right away
    await dm.send(
      "Here's what I can do — just write naturally:\n\n" +
      "**Set a goal** → \"I want to hit $5k/mo by June\"\n" +
      "**Set a reminder** → \"Remind me to send invoices every Friday at 5pm\"\n" +
      "**Log progress** → \"Worked 3 hours on the landing page today\"\n" +
      "**Get your status** → \"How am I doing on my goals?\"\n" +
      "**Plan your week** → \"Let's plan this week\"\n\n" +
      "No commands, no syntax. Just talk.",
    );

    // Emit scheduleUpdated so SchedulerManager picks up the new/updated schedule
    events.emit('scheduleUpdated', memberId);

    setupLogger.info(
      `Coaching onboarding complete for ${memberId}: tz=${timezone}, brief=${briefTime ?? 'off'}, level=${accountabilityLevel}`,
    );
  } catch (error) {
    setupLogger.error(`Coaching onboarding failed for ${memberId}: ${String(error)}`);
  } finally {
    activeCoachingUsers.delete(discordId);
  }
}

/**
 * Wait for a response during coaching onboarding (3 minute timeout).
 */
async function awaitCoachingResponse(
  dm: DMChannel,
  authorId: string,
): Promise<string | null> {
  try {
    const collected: Collection<string, Message> = await dm.awaitMessages({
      filter: (msg: Message) => msg.author.id === authorId,
      max: 1,
      time: 3 * 60 * 1000, // 3 minutes per question
      errors: ['time'],
    });
    const response = collected.first();
    return response?.content ?? null;
  } catch {
    return null;
  }
}
