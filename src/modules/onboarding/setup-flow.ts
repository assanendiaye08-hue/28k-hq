/**
 * The core onboarding DM conversation flow.
 *
 * When a member runs /setup, this module opens a DM channel and asks
 * 5 natural questions + 1 space preference question. Each question waits
 * up to 5 minutes for a response with a brief acknowledgment after each answer.
 *
 * The flow is conversational, not form-like. Acknowledgments vary to feel natural.
 *
 * Returns a structured result with answers and space preference, or an error
 * if DMs are closed or the member times out.
 */

import {
  type GuildMember,
  type DMChannel,
  type Message,
  type Collection,
} from 'discord.js';
import type { Logger } from 'winston';
import { SETUP_TIMEOUT_MS } from '../../shared/constants.js';

/** Track users currently in setup flow so other DM listeners can skip them. */
export const activeSetupUsers = new Set<string>();

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
  spaceType: 'DM' | 'CHANNEL';
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
 * Asks 5 natural questions about who they are and what they're building,
 * then asks for their private space preference (DM or server channel).
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

      // Send varied acknowledgment (not after the last question -- go straight to space preference)
      if (i < QUESTIONS.length - 1) {
        await dm.send(ACKNOWLEDGMENTS[i % ACKNOWLEDGMENTS.length]);
      }
    }

    // Step 4: Ask about private space preference
    await dm.send(
      "Last thing -- where do you want your private space? This is where I'll send you " +
      "briefs, track your stuff, and where you can talk to the AI assistant.\n\n" +
      "**1.** Right here in DMs (fully private, just you and me)\n" +
      "**2.** A private channel in the server (more integrated, still only visible to you)\n\n" +
      "Reply **1** or **2**",
    );

    const spaceResponse = await awaitResponse(dm, member.id);

    if (spaceResponse === null) {
      await dm.send(
        "No worries, you can run /setup again whenever you're ready.",
      ).catch(() => {});
      logger.info(`Setup flow timed out for ${member.user.tag} on space preference`);
      return { error: 'timeout' };
    }

    // Parse space preference -- default to DM if unclear
    const trimmed = spaceResponse.trim();
    const spaceType: 'DM' | 'CHANNEL' =
      trimmed === '2' || trimmed.toLowerCase().includes('channel') || trimmed.toLowerCase().includes('server')
        ? 'CHANNEL'
        : 'DM';

    logger.info(
      `Setup flow complete for ${member.user.tag}: space=${spaceType}, answers=${Object.keys(answers).length}`,
    );

    return {
      answers,
      spaceType,
      displayName: member.displayName,
    };
  } finally {
    activeSetupUsers.delete(member.id);
  }
}
