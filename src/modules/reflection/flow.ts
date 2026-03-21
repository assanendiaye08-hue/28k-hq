/**
 * Conversational DM reflection flow.
 *
 * Jarvis-initiated flow that:
 * 1. Opens DM channel with the member
 * 2. For WEEKLY: sends a transition message before planning
 * 3. Generates a personalized question from activity data
 * 4. Awaits member response (5 min timeout)
 * 5. Acknowledges with optional follow-up (AI-generated, Jarvis personality)
 * 6. Extracts insights from the exchange via AI
 * 7. Stores reflection record in DB
 * 8. Awards XP based on reflection type
 *
 * A failed reflection must never crash the process.
 */

import {
  type Client,
  type DMChannel,
  type Message,
  type Collection,
} from 'discord.js';
import type { ExtendedPrismaClient } from '../../db/client.js';
import { callAI } from '../../shared/ai-client.js';
import { awardXP } from '../xp/engine.js';
import { generateReflectionQuestion } from './questions.js';
import { REFLECTION_CONFIG, REFLECTION_XP } from './constants.js';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) =>
      `${timestamp as string} [reflection] ${level}: ${message as string}`),
  ),
  transports: [new winston.transports.Console()],
});

/** Jarvis character prompt for reflection acknowledgments. */
const JARVIS_CHARACTER = `You are Jarvis, a sharp personal operator for a productivity Discord server. Efficient, direct, you use casual language and slang naturally, you keep it real. You have their back but you'll call them out when they're slacking. You're not a mentor or sage -- you're their operator.`;

// ─── Await Response Helper ─────────────────────────────────────────────────────

/**
 * Wait for a single message response in a DM channel.
 * Follows the exact pattern from scheduler/planning.ts.
 */
async function awaitResponse(
  dm: DMChannel,
  authorId: string,
  timeoutMs = REFLECTION_CONFIG.timeoutMs,
): Promise<string | null> {
  try {
    const collected: Collection<string, Message> = await dm.awaitMessages({
      filter: (msg: Message) => msg.author.id === authorId,
      max: 1,
      time: timeoutMs,
      errors: ['time'],
    });
    return collected.first()?.content ?? null;
  } catch {
    return null;
  }
}

// ─── Main Reflection Flow ──────────────────────────────────────────────────────

/**
 * Run the full reflection DM conversation flow.
 *
 * @param client - Discord.js client
 * @param db - Extended Prisma client
 * @param memberId - The member to reflect with
 * @param reflectionType - DAILY, WEEKLY, or MONTHLY
 */
export async function runReflectionFlow(
  client: Client,
  db: ExtendedPrismaClient,
  memberId: string,
  reflectionType: string,
): Promise<void> {
  try {
    // a. Fetch member with accounts and schedule
    const member = await db.member.findUniqueOrThrow({
      where: { id: memberId },
      include: {
        accounts: { take: 1 },
        schedule: true,
      },
    });

    if (member.accounts.length === 0) {
      logger.warn(`No Discord accounts for member ${memberId}, skipping reflection`);
      return;
    }

    const discordId = member.accounts[0].discordId;

    // b. Open DM channel
    let dm: DMChannel;
    try {
      const user = await client.users.fetch(discordId);
      dm = await user.createDM();
    } catch {
      logger.warn(`Could not open DM with ${discordId} -- DMs may be closed`);
      return;
    }

    // c. For WEEKLY type: send a transition message
    if (reflectionType === 'WEEKLY') {
      try {
        await dm.send("Before we plan next week, let's reflect on how this week went.");
      } catch {
        logger.warn(`Could not send DM to ${discordId} -- DMs likely closed`);
        return;
      }
    }

    // d. Generate personalized question
    const { question: generatedQuestion } = await generateReflectionQuestion(
      db,
      memberId,
      reflectionType,
    );

    // e. Send the question as a DM
    try {
      await dm.send(generatedQuestion);
    } catch {
      logger.warn(`Could not send reflection question DM to ${discordId}`);
      return;
    }

    // f. Await member response
    const memberResponse = await awaitResponse(dm, discordId);
    if (memberResponse === null) {
      await dm.send('No worries, we can reflect later.').catch(() => {});
      return;
    }

    // g. Acknowledge the response with AI-generated acknowledgment
    let followUpQuestion: string | null = null;
    let hasFollowUp = false;

    try {
      const ackResult = await callAI(db, {
        memberId,
        feature: 'reflection',
        messages: [
          {
            role: 'system',
            content: `${JARVIS_CHARACTER}\n\nAcknowledge this reflection response briefly and warmly. If appropriate, ask ONE follow-up question. If not, just acknowledge. Return JSON with 'acknowledgment' (string) and 'hasFollowUp' (boolean) and 'followUpQuestion' (string or null).`,
          },
          {
            role: 'user',
            content: `Question asked: "${generatedQuestion}"\n\nMember's response: "${memberResponse}"`,
          },
        ],
        responseFormat: {
          type: 'json_schema' as const,
          jsonSchema: {
            name: 'reflection_acknowledgment',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                acknowledgment: { type: 'string' },
                hasFollowUp: { type: 'boolean' },
                followUpQuestion: { anyOf: [{ type: 'string' }, { type: 'null' }] },
              },
              required: ['acknowledgment', 'hasFollowUp', 'followUpQuestion'],
              additionalProperties: false,
            },
          },
        },
      });

      if (!ackResult.degraded && ackResult.content) {
        const ackParsed = JSON.parse(ackResult.content) as {
          acknowledgment: string;
          hasFollowUp: boolean;
          followUpQuestion: string | null;
        };
        await dm.send(ackParsed.acknowledgment);
        hasFollowUp = ackParsed.hasFollowUp;
        followUpQuestion = ackParsed.followUpQuestion;
      } else {
        await dm.send('Appreciate you sharing that.');
      }
    } catch (error) {
      logger.warn(`Acknowledgment AI call failed: ${String(error)}`);
      await dm.send('Appreciate you sharing that.').catch(() => {});
    }

    // h. Optional follow-up
    let followUpResponse: string | null = null;

    if (hasFollowUp && followUpQuestion && REFLECTION_CONFIG.maxFollowUps > 0) {
      await dm.send(followUpQuestion).catch(() => {});
      const followUp = await awaitResponse(dm, discordId);
      if (followUp !== null) {
        followUpResponse = followUp;
        await dm.send('Got it, thanks for sharing.').catch(() => {});
      }
    }

    // i. Extract insights from the full Q&A exchange
    const fullExchange = [
      `Question: ${generatedQuestion}`,
      `Response: ${memberResponse}`,
      followUpResponse ? `Follow-up Q: ${followUpQuestion}` : null,
      followUpResponse ? `Follow-up A: ${followUpResponse}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    let extractedInsight: string | null = null;

    try {
      const insightResult = await callAI(db, {
        memberId,
        feature: 'reflection',
        messages: [
          {
            role: 'system',
            content:
              "Extract a 1-2 sentence key insight from this reflection exchange. Focus on self-awareness, patterns, or commitments the member expressed. Return JSON with 'insight' (string).",
          },
          {
            role: 'user',
            content: fullExchange,
          },
        ],
        responseFormat: {
          type: 'json_schema' as const,
          jsonSchema: {
            name: 'reflection_insight',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                insight: { type: 'string' },
              },
              required: ['insight'],
              additionalProperties: false,
            },
          },
        },
      });

      if (!insightResult.degraded && insightResult.content) {
        const insightParsed = JSON.parse(insightResult.content) as { insight: string };
        extractedInsight = insightParsed.insight;
      }
    } catch (error) {
      logger.warn(`Insight extraction failed: ${String(error)}`);
    }

    // j. Store the reflection in DB
    await db.reflection.create({
      data: {
        memberId,
        type: reflectionType as 'DAILY' | 'WEEKLY' | 'MONTHLY',
        question: generatedQuestion,
        response:
          memberResponse +
          (followUpResponse ? `\n\nFollow-up: ${followUpResponse}` : ''),
        insights: extractedInsight,
      },
    });

    // k. Award XP
    const xpKey = reflectionType.toLowerCase() as keyof typeof REFLECTION_XP;
    const xpAmount = REFLECTION_XP[xpKey] ?? REFLECTION_XP.daily;

    await awardXP(
      db,
      memberId,
      xpAmount,
      'REFLECTION',
      `Completed ${reflectionType.toLowerCase()} reflection`,
    );

    // l. Send closing message
    await dm.send(`Reflection logged. +${xpAmount} XP.`).catch(() => {});

    logger.info(
      `${reflectionType} reflection completed for ${memberId}: +${xpAmount} XP`,
    );
  } catch (error) {
    logger.error(`Reflection flow failed for ${memberId}: ${String(error)}`);
  }
}
