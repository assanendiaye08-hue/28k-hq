/**
 * Conversational DM reflection flow.
 *
 * Jarvis-initiated flow that:
 * 1. Opens DM channel with the member
 * 2. For DAILY: runs an open-loop-closing routine (show commitments/goals,
 *    ask what got done, capture tomorrow's priority)
 * 3. For WEEKLY: sends a transition message before planning
 * 4. Generates a personalized question from activity data
 * 5. Awaits member response (5 min timeout)
 * 6. Acknowledges with optional follow-up (AI-generated, Jarvis personality)
 * 7. Extracts insights from the exchange via AI
 * 8. Stores reflection record in DB
 * 9. Awards XP based on reflection type
 *
 * A failed reflection must never crash the process.
 */

import {
  type Client,
  type DMChannel,
  type Message,
  type Collection,
} from 'discord.js';
import type { ExtendedPrismaClient } from '@28k/db';
import { callAI } from '../../shared/ai-client.js';
import { awardXP } from '@28k/shared';
import { generateReflectionQuestion, buildEveningClosingPrompt } from './questions.js';
import { storeMessage } from '../ai-assistant/memory.js';
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

    // c. Branch: DAILY uses open-loop-closing routine, WEEKLY/MONTHLY use existing flow
    if (reflectionType === 'DAILY') {
      await runDailyClosingFlow(db, dm, memberId, discordId);
      return;
    }

    // ─── WEEKLY / MONTHLY Flow (existing behavior) ─────────────────────────

    // c2. For WEEKLY type: send a transition message
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

    // Store exchange as conversation messages for context continuity
    await storeMessage(db, memberId, 'assistant', generatedQuestion, 'reflection');
    await storeMessage(db, memberId, 'user', memberResponse, 'reflection');

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

// ─── Daily Open-Loop-Closing Flow ─────────────────────────────────────────────

/**
 * Run the DAILY evening reflection as an open-loop-closing routine.
 *
 * Steps:
 * 1. Build context: show today's commitments, check-ins, goals
 * 2. Ask a closing question based on open loops
 * 3. Acknowledge the response
 * 4. Ask "What's the ONE thing for tomorrow?"
 * 5. Store everything: reflection record, conversation messages (for morning brief)
 * 6. Award XP
 */
async function runDailyClosingFlow(
  db: ExtendedPrismaClient,
  dm: DMChannel,
  memberId: string,
  discordId: string,
): Promise<void> {
  try {
    // 1. Build open-loop context
    const closingCtx = await buildEveningClosingPrompt(db, memberId);

    // 2. Send the day summary and closing question via AI
    let closingQuestion: string;

    try {
      const closingResult = await callAI(db, {
        memberId,
        feature: 'reflection',
        messages: [
          {
            role: 'system',
            content: `${JARVIS_CHARACTER}\n\nYou're closing out the day with this member. Review their day summary and ask ONE specific closing question. If they have pending commitments, ask whether those got done. If they have untouched goals, ask about progress. If nothing is pending, ask what they got done today. Keep it conversational and under 3 sentences. Include the day summary naturally in your message. Return JSON with 'message' (string).`,
          },
          {
            role: 'user',
            content: `Day summary:\n${closingCtx.prompt}`,
          },
        ],
        responseFormat: {
          type: 'json_schema' as const,
          jsonSchema: {
            name: 'evening_closing',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                message: { type: 'string' },
              },
              required: ['message'],
              additionalProperties: false,
            },
          },
        },
      });

      if (!closingResult.degraded && closingResult.content) {
        const parsed = JSON.parse(closingResult.content) as { message: string };
        closingQuestion = parsed.message;
      } else {
        // Fallback based on context
        if (closingCtx.pendingCommitments.length > 0) {
          closingQuestion = `End of day. You committed to: ${closingCtx.pendingCommitments.map((c) => c.title).join(', ')}. Did that happen?`;
        } else if (closingCtx.untouchedGoals.length > 0) {
          closingQuestion = `Closing out the day. Any progress on ${closingCtx.untouchedGoals.map((g) => g.title).join(', ')} today?`;
        } else {
          closingQuestion = "Day's wrapping up. What did you get done today?";
        }
      }
    } catch {
      closingQuestion = "Day's wrapping up. What did you get done today?";
    }

    // Send closing question
    try {
      await dm.send(closingQuestion);
    } catch {
      logger.warn(`Could not send daily closing DM to ${discordId}`);
      return;
    }

    // Store the closing question as conversation message
    await storeMessage(db, memberId, 'assistant', closingQuestion, 'reflection');

    // 3. Await member response about what got done
    const whatGotDone = await awaitResponse(dm, discordId);
    if (whatGotDone === null) {
      await dm.send('No worries, we can reflect later.').catch(() => {});
      return;
    }

    // Store member response
    await storeMessage(db, memberId, 'user', whatGotDone, 'reflection');

    // 4. Acknowledge and ask for tomorrow's priority
    let ackMessage: string;
    try {
      const ackResult = await callAI(db, {
        memberId,
        feature: 'reflection',
        messages: [
          {
            role: 'system',
            content: `${JARVIS_CHARACTER}\n\nBriefly acknowledge what they said about their day (1 sentence). Then ask: "What's the ONE thing for tomorrow?" Keep it tight.`,
          },
          {
            role: 'user',
            content: `Day context:\n${closingCtx.prompt}\n\nWhat they said: "${whatGotDone}"`,
          },
        ],
      });

      if (!ackResult.degraded && ackResult.content) {
        ackMessage = ackResult.content;
      } else {
        ackMessage = "Got it. What's the ONE thing for tomorrow?";
      }
    } catch {
      ackMessage = "Got it. What's the ONE thing for tomorrow?";
    }

    await dm.send(ackMessage).catch(() => {});
    await storeMessage(db, memberId, 'assistant', ackMessage, 'reflection');

    // 5. Await tomorrow's priority
    const tomorrowPriority = await awaitResponse(dm, discordId);
    if (tomorrowPriority === null) {
      // Still save what we have
      await dm.send("No problem. We'll figure it out in the morning.").catch(() => {});
    } else {
      // Store tomorrow's priority as a planning-topic message so morning brief can reference it
      await storeMessage(db, memberId, 'user', tomorrowPriority, 'planning');
      await storeMessage(
        db,
        memberId,
        'assistant',
        `Tomorrow's priority: ${tomorrowPriority}`,
        'planning',
      );
      await dm.send("Locked in. I'll remind you in the morning.").catch(() => {});
    }

    // 6. Build insight string including tomorrow's priority
    const insightParts = [`Day closing: ${whatGotDone}`];
    if (tomorrowPriority) {
      insightParts.push(`Tomorrow's priority: ${tomorrowPriority}`);
    }
    const insightString = insightParts.join(' | ');

    // 7. Store the reflection record
    await db.reflection.create({
      data: {
        memberId,
        type: 'DAILY',
        question: closingQuestion,
        response: whatGotDone + (tomorrowPriority ? `\n\nTomorrow: ${tomorrowPriority}` : ''),
        insights: insightString,
      },
    });

    // 8. Award XP
    const xpAmount = REFLECTION_XP.daily;
    await awardXP(
      db,
      memberId,
      xpAmount,
      'REFLECTION',
      'Completed daily evening reflection',
    );

    await dm.send(`Reflection logged. +${xpAmount} XP.`).catch(() => {});

    logger.info(`DAILY closing reflection completed for ${memberId}: +${xpAmount} XP`);
  } catch (error) {
    logger.error(`Daily closing flow failed for ${memberId}: ${String(error)}`);
  }
}
