/**
 * AI-assisted goal decomposition -- DM conversation flow.
 *
 * Members DM Jarvis with natural language like "break down my yearly goal"
 * or "decompose Build a SaaS" to enter a guided flow:
 *
 * 1. Select goal to decompose (fuzzy match or numbered list)
 * 2. Choose sub-goal timeframe (quarterly, monthly, weekly)
 * 3. AI suggests 2-5 sub-goals with structured output
 * 4. Member approves, edits (remove/add), or cancels
 * 5. Approved sub-goals created in DB linked to parent
 *
 * Uses the same awaitMessages pattern as scheduler/planning.ts.
 */

import {
  type Client,
  type DMChannel,
  type Message,
  type Collection,
} from 'discord.js';
import type { ExtendedPrismaClient } from '../../db/client.js';
import type { IEventBus } from '../../shared/types.js';
import { callAI } from '../../shared/ai-client.js';
import { validateGoalDepth, getTimeframeDeadline } from './hierarchy.js';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) =>
      `${timestamp as string} [decompose] ${level}: ${message as string}`),
  ),
  transports: [new winston.transports.Console()],
});

/** Timeout for each response during decomposition (5 minutes). */
const DECOMPOSE_TIMEOUT_MS = 5 * 60 * 1000;

/** Maximum rounds of editing before auto-proceeding. */
const MAX_EDIT_ROUNDS = 3;

// ─── Intent Detection ──────────────────────────────────────────────────────────

/**
 * Regex patterns for detecting decomposition intent in a DM message.
 */
const DECOMPOSE_PATTERNS = [
  /\b(decompose|break\s*down|break\s*it\s*down|split\s*up|sub[- ]?goals?|subgoals?)\b/i,
  /\b(break\s+this\s+into\s+steps)\b/i,
  /\b(help\s+me\s+plan)\b.*\b(goal|objective|target)\b/i,
];

/** Goal-context words that must accompany generic patterns. */
const GOAL_CONTEXT = /\b(goal|objective|target|yearly|quarterly|monthly|weekly)\b/i;

/**
 * Check if a message content indicates a goal decomposition request.
 *
 * Detects phrases like:
 * - "break down my yearly goal"
 * - "decompose Build a SaaS"
 * - "help me split up my quarterly goal"
 * - "break this into steps for my goal"
 */
export function isDecompositionRequest(content: string): boolean {
  // Direct decomposition keywords (strong signal)
  if (DECOMPOSE_PATTERNS[0].test(content)) {
    return true;
  }

  // "break this into steps" -- needs goal context
  if (DECOMPOSE_PATTERNS[1].test(content) && GOAL_CONTEXT.test(content)) {
    return true;
  }

  // "help me plan" -- needs goal context
  if (DECOMPOSE_PATTERNS[2].test(content)) {
    return true;
  }

  return false;
}

// ─── Goal Name Extraction ──────────────────────────────────────────────────────

/**
 * Try to extract a goal name or identifier from the decomposition request.
 *
 * Looks for:
 * - Quoted strings: 'break down "Build a SaaS"'
 * - Timeframe patterns: "my yearly goal", "quarterly goal"
 * - Text after keywords: "decompose Build a SaaS product"
 *
 * @returns The extracted name/hint or null if can't determine.
 */
export function extractDecompositionGoalName(content: string): string | null {
  // Quoted strings (double or single quotes)
  const quotedMatch = content.match(/["']([^"']+)["']/);
  if (quotedMatch) {
    return quotedMatch[1];
  }

  // "my yearly/quarterly/monthly/weekly goal" -- return the timeframe as hint
  const timeframeMatch = content.match(/\bmy\s+(yearly|quarterly|monthly|weekly)\s+goal\b/i);
  if (timeframeMatch) {
    return timeframeMatch[1].toUpperCase();
  }

  // Text after "decompose" or "break down" (take rest of sentence)
  const afterKeyword = content.match(/\b(?:decompose|break\s*down)\s+(.+?)(?:\s+into\b|\s+for\b|$)/i);
  if (afterKeyword) {
    const extracted = afterKeyword[1].trim();
    // Filter out generic words that aren't goal names
    if (extracted.length > 2 && !/^(my|the|this|it|that|a|an)\s*$/i.test(extracted)) {
      // Remove trailing "goal" if present
      return extracted.replace(/\s+goals?\s*$/i, '').trim() || null;
    }
  }

  return null;
}

// ─── Sub-goal Type ─────────────────────────────────────────────────────────────

interface SuggestedSubgoal {
  title: string;
  type: 'MEASURABLE' | 'FREETEXT';
  targetValue: number | null;
  unit: string | null;
}

// ─── Timeframe Mapping ─────────────────────────────────────────────────────────

/** Map parent timeframe to default child timeframe (one level down). */
function getDefaultChildTimeframe(parentTimeframe: string | null): string {
  switch (parentTimeframe) {
    case 'YEARLY':
      return 'QUARTERLY';
    case 'QUARTERLY':
      return 'MONTHLY';
    case 'MONTHLY':
      return 'WEEKLY';
    case 'WEEKLY':
      return 'WEEKLY'; // Can't go lower
    default:
      return 'WEEKLY'; // No timeframe -- default to weekly
  }
}

/** Parse user timeframe input to enum value. */
function parseTimeframeInput(input: string, fallback: string): string {
  const normalized = input.toLowerCase().trim();
  if (/quarterly/i.test(normalized)) return 'QUARTERLY';
  if (/monthly/i.test(normalized)) return 'MONTHLY';
  if (/weekly/i.test(normalized)) return 'WEEKLY';
  return fallback;
}

// ─── Await Response Helper ─────────────────────────────────────────────────────

/**
 * Wait for a single message response in a DM channel.
 * Follows the exact pattern from scheduler/planning.ts.
 */
async function awaitResponse(
  dm: DMChannel,
  authorId: string,
  timeoutMs = DECOMPOSE_TIMEOUT_MS,
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

// ─── Format Suggestions ────────────────────────────────────────────────────────

function formatSuggestionList(subgoals: SuggestedSubgoal[]): string {
  const lines = subgoals.map((sg, i) => {
    const detail =
      sg.type === 'MEASURABLE' && sg.targetValue != null && sg.unit
        ? ` (measurable: 0/${sg.targetValue} ${sg.unit})`
        : ' (free-text)';
    return `${i + 1}. ${sg.title}${detail}`;
  });

  return (
    "Here's what I suggest:\n\n" +
    lines.join('\n') +
    '\n\n' +
    'Reply with:\n' +
    '- "yes" to create all of these\n' +
    '- "remove 2" to drop a suggestion\n' +
    '- "add [title]" to add your own\n' +
    '- "cancel" to stop'
  );
}

// ─── Main Decomposition Flow ───────────────────────────────────────────────────

/**
 * Run the full goal decomposition DM conversation.
 *
 * @param client - Discord.js client
 * @param db - Extended Prisma client
 * @param memberId - The member's internal ID
 * @param discordId - The member's Discord user ID
 * @param events - Event bus
 * @param goalNameHint - Optional hint from extractDecompositionGoalName
 */
export async function runDecompositionFlow(
  client: Client,
  db: ExtendedPrismaClient,
  memberId: string,
  discordId: string,
  events: IEventBus,
  goalNameHint: string | null,
): Promise<void> {
  // Open DM channel
  let dm: DMChannel;
  try {
    const user = await client.users.fetch(discordId);
    dm = await user.createDM();
  } catch {
    logger.warn(`Could not open DM with ${discordId} for decomposition`);
    return;
  }

  // ─── Step 0: Find the goal to decompose ────────────────────────────────────

  const activeGoals = await db.goal.findMany({
    where: {
      memberId,
      status: { in: ['ACTIVE', 'EXTENDED'] },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (activeGoals.length === 0) {
    await dm.send(
      "You don't have any active goals to decompose. Set one with /setgoal first.",
    );
    return;
  }

  let selectedGoal: typeof activeGoals[number] | null = null;

  // Try to match by hint
  if (goalNameHint) {
    const hintLower = goalNameHint.toLowerCase();

    // Check if hint is a timeframe (YEARLY, QUARTERLY, etc.)
    const timeframeHint = ['YEARLY', 'QUARTERLY', 'MONTHLY', 'WEEKLY'].includes(
      goalNameHint.toUpperCase(),
    )
      ? goalNameHint.toUpperCase()
      : null;

    if (timeframeHint) {
      const matches = activeGoals.filter((g) => g.timeframe === timeframeHint);
      if (matches.length === 1) {
        selectedGoal = matches[0];
      }
    } else {
      // Fuzzy match against goal titles
      const matches = activeGoals.filter((g) =>
        g.title.toLowerCase().includes(hintLower),
      );
      if (matches.length === 1) {
        selectedGoal = matches[0];
      }
    }
  }

  if (!selectedGoal && activeGoals.length === 1) {
    // Only one active goal -- suggest it
    await dm.send(
      `I'll break down '${activeGoals[0].title}' -- sound good? (yes/pick another)`,
    );
    const confirm = await awaitResponse(dm, discordId);
    if (confirm === null) {
      await dm.send('Timed out. You can restart this anytime.');
      return;
    }
    if (/^(yes|yeah|yep|sure|ok|do it|go ahead)/i.test(confirm.trim())) {
      selectedGoal = activeGoals[0];
    } else {
      await dm.send('No active goals to pick from besides that one. Try /setgoal to add more.');
      return;
    }
  }

  if (!selectedGoal && activeGoals.length > 1) {
    // Present numbered list
    const list = activeGoals
      .map((g, i) => {
        const tf = g.timeframe ? ` [${g.timeframe}]` : '';
        return `${i + 1}. ${g.title}${tf}`;
      })
      .join('\n');

    await dm.send(
      `Which goal should I break down?\n\n${list}\n\nReply with the number.`,
    );

    const pick = await awaitResponse(dm, discordId);
    if (pick === null) {
      await dm.send('Timed out. You can restart this anytime.');
      return;
    }

    const pickNum = parseInt(pick.trim(), 10);
    if (pickNum >= 1 && pickNum <= activeGoals.length) {
      selectedGoal = activeGoals[pickNum - 1];
    } else {
      // Try fuzzy match on their response
      const fuzzy = activeGoals.find((g) =>
        g.title.toLowerCase().includes(pick.toLowerCase().trim()),
      );
      if (fuzzy) {
        selectedGoal = fuzzy;
      } else {
        await dm.send("Couldn't find that goal. Try again with /ask or say 'decompose' again.");
        return;
      }
    }
  }

  if (!selectedGoal) {
    await dm.send("Couldn't determine which goal to decompose. Try again.");
    return;
  }

  // Validate depth
  if (!validateGoalDepth(selectedGoal.depth)) {
    await dm.send(
      'This goal is already at the maximum nesting depth (4 levels).',
    );
    return;
  }

  // ─── Step 1: Ask about sub-goal timeframe ──────────────────────────────────

  const defaultTimeframe = getDefaultChildTimeframe(selectedGoal.timeframe);

  await dm.send(
    `Let's break down '${selectedGoal.title}' into smaller goals.\n\n` +
    `What timeframe should the sub-goals be? (quarterly, monthly, or weekly)`,
  );

  const timeframeResponse = await awaitResponse(dm, discordId);
  let childTimeframe: string;

  if (timeframeResponse === null) {
    await dm.send('Timed out. You can restart this anytime.');
    return;
  }

  childTimeframe = parseTimeframeInput(timeframeResponse, defaultTimeframe);

  // ─── Step 2: Use AI to suggest sub-goals ───────────────────────────────────

  const result = await callAI(db, {
    memberId,
    feature: 'planning',
    messages: [
      {
        role: 'system',
        content: `You are helping a member break down a goal into 2-5 actionable sub-goals. Each sub-goal should be specific, achievable within a ${childTimeframe.toLowerCase()} timeframe, and contribute to the parent goal. Return a JSON object with a "subgoals" array. Each sub-goal has: "title" (string, concise actionable title), "type" (string, "MEASURABLE" or "FREETEXT"), "targetValue" (number or null -- only for MEASURABLE), "unit" (string or null -- only for MEASURABLE).`,
      },
      {
        role: 'user',
        content: `Break down this goal into sub-goals:\n\nGoal: ${selectedGoal.title}\nDescription: ${selectedGoal.description || 'No description'}\nTimeframe for sub-goals: ${childTimeframe}\n\nSuggest 2-5 specific sub-goals.`,
      },
    ],
    responseFormat: {
      type: 'json_schema' as const,
      jsonSchema: {
        name: 'goal_decomposition',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            subgoals: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  type: { type: 'string', enum: ['MEASURABLE', 'FREETEXT'] },
                  targetValue: { type: ['number', 'null'] },
                  unit: { type: ['string', 'null'] },
                },
                required: ['title', 'type', 'targetValue', 'unit'],
                additionalProperties: false,
              },
            },
          },
          required: ['subgoals'],
          additionalProperties: false,
        },
      },
    },
  });

  if (result.degraded || !result.content) {
    await dm.send(
      "I couldn't generate suggestions right now. Try again later or create sub-goals manually with /setgoal and the parent option.",
    );
    return;
  }

  let subgoals: SuggestedSubgoal[];
  try {
    const parsed = JSON.parse(result.content) as { subgoals: SuggestedSubgoal[] };
    subgoals = parsed.subgoals.slice(0, 5); // Cap at 5
    if (subgoals.length === 0) {
      await dm.send(
        "AI returned no suggestions. Try again or create sub-goals manually with /setgoal.",
      );
      return;
    }
  } catch {
    await dm.send(
      "I couldn't parse the AI suggestions. Try again later or create sub-goals manually.",
    );
    return;
  }

  // ─── Step 3: Present suggestions and let member approve/edit ───────────────

  await dm.send(formatSuggestionList(subgoals));

  let editRounds = 0;

  while (editRounds < MAX_EDIT_ROUNDS) {
    const editResponse = await awaitResponse(dm, discordId);
    if (editResponse === null) {
      await dm.send('Timed out. You can restart this anytime.');
      return;
    }

    const trimmed = editResponse.trim().toLowerCase();

    // Approve
    if (/^(yes|create|approve|do it|go ahead|looks good|lgtm)/i.test(trimmed)) {
      break;
    }

    // Cancel
    if (/^(cancel|stop|nevermind|never mind|nah|no)/i.test(trimmed)) {
      await dm.send('No worries, we can do this anytime.');
      return;
    }

    // Remove item
    const removeMatch = trimmed.match(/^remove\s+(\d+)/);
    if (removeMatch) {
      const idx = parseInt(removeMatch[1], 10) - 1;
      if (idx >= 0 && idx < subgoals.length) {
        subgoals.splice(idx, 1);
        if (subgoals.length === 0) {
          await dm.send('All suggestions removed. Cancelling decomposition.');
          return;
        }
        await dm.send(formatSuggestionList(subgoals));
        editRounds++;
        continue;
      }
    }

    // Add item
    const addMatch = editResponse.trim().match(/^add\s+(.+)/i);
    if (addMatch) {
      const newTitle = addMatch[1].trim();
      if (newTitle.length > 0) {
        subgoals.push({
          title: newTitle,
          type: 'FREETEXT',
          targetValue: null,
          unit: null,
        });
        await dm.send(formatSuggestionList(subgoals));
        editRounds++;
        continue;
      }
    }

    // Unrecognized -- ask again
    await dm.send(
      'Reply "yes" to create, "remove N" to drop, "add [title]" to add, or "cancel" to stop.',
    );
    editRounds++;
  }

  // If we exhausted edit rounds, proceed with current list
  if (subgoals.length === 0) {
    await dm.send('No sub-goals to create. Cancelled.');
    return;
  }

  // ─── Step 4: Create sub-goals in database ──────────────────────────────────

  const createdTitles: string[] = [];

  for (const sg of subgoals) {
    const deadline = getTimeframeDeadline(childTimeframe);
    await db.goal.create({
      data: {
        memberId,
        title: sg.title,
        description: sg.title,
        type: sg.type as 'MEASURABLE' | 'FREETEXT',
        targetValue: sg.targetValue,
        unit: sg.unit,
        deadline,
        parentId: selectedGoal.id,
        timeframe: childTimeframe as 'YEARLY' | 'QUARTERLY' | 'MONTHLY' | 'WEEKLY',
        depth: selectedGoal.depth + 1,
      },
    });
    createdTitles.push(sg.title);
  }

  // Send confirmation
  const childList = createdTitles.map((t) => `- ${t}`).join('\n');
  await dm.send(
    `Created ${createdTitles.length} sub-goals under "${selectedGoal.title}":\n${childList}\n\nUse /goals tree to see your full goal hierarchy.`,
  );

  logger.info(
    `[goals] Decomposed goal ${selectedGoal.id} into ${createdTitles.length} sub-goals for ${memberId}`,
  );
}
