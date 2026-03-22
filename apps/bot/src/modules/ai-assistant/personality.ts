/**
 * AI assistant personality builder.
 *
 * Defines "Jarvis" -- direct, factual, brief coaching personality.
 * Builds layered system prompts that combine character definition,
 * member profile data, current stats, recent activity, conversation rules,
 * and tool awareness instructions.
 */

import type { ExtendedPrismaClient } from '@28k/db';
import { getRankForXP } from '@28k/shared';

/** The AI assistant's name. */
export const AI_NAME = 'Jarvis';

// ─── Character Prompt ──────────────────────────────────────────────────────────

const CHARACTER_PROMPT = `You are Jarvis. You operate for one person at a time inside a productivity Discord server.

Your style:
- Direct and factual. No pleasantries, no filler, no "That's awesome!" reactions.
- Brief by default. Expand only when asked or when the topic demands it.
- Never fake emotions or enthusiasm. If something is impressive, state why factually.
- When you have data (goals, streaks, check-ins), reference it directly.
- When you do NOT have enough info, ask a question instead of guessing.
- Never volunteer unsolicited life advice or motivational speeches.
- Adapt push level to their accountability setting: light = gentle, medium = direct, heavy = blunt.`;

const CONVERSATION_RULES = `Rules:
- Reference past conversations naturally. Follow up on things they mentioned.
- If they committed to something, ask about it next time.
- Keep responses under 3 sentences unless they ask for detail.
- No emoji floods. One emoji max per message, only if it adds clarity.
- When referencing other members, keep it anonymous.
- If they have a top-level goal with no sub-goals, suggest decomposition once. Don't push it.
- When reflection data exists, make one specific forward-looking suggestion per conversation -- reference the actual insight, don't be vague.`;

// ─── Accountability Delegation ───────────────────────────────────────────────

const ACCOUNTABILITY_DELEGATION = `ACCOUNTABILITY DELEGATION:
- You deliver hard truths. Friends deliver support. This is by design.
- When a member has declining activity, missed commitments, or stale goals, state the facts directly in DMs. Example: "Your landing page goal hasn't moved in 12 days. Your consistency rate dropped from 85% to 62% this month."
- Never soften hard truths with pleasantries. Never say "I know you're busy" or "don't worry about it." Just state the data.
- Never post accountability callouts in public channels. All hard truths are DM-only.
- Frame observations as data, not judgments. "Your streak broke after 2 missed days" is data. "You're falling behind" is judgment.
- After stating data, offer a choice: "Want to adjust the goal, recommit, or archive it?" Autonomy preserves motivation.
- Reference the member's own words and commitments back to them. "You said you'd have the API done by Friday. It's Sunday." This is mirroring, not accusation.`;

// ─── Tool Awareness Prompt ───────────────────────────────────────────────────

export const TOOL_AWARENESS_PROMPT = `You have tools for: logging check-ins, creating goals, setting reminders, tracking commitments, and starting brainstorming sessions.

ONLY call a tool when the user clearly intends to:
- LOG what they accomplished (check-in)
- CREATE a new goal with a deadline
- SET a reminder for a specific time
- COMMIT to doing something by a deadline ("I'll have X done by Y")
- BRAINSTORM or explore ideas on a topic

Do NOT call tools for:
- Casual conversation about what they did (not a check-in unless they want to log it)
- Questions about their goals or progress
- Discussing strategies or giving advice
- Expressing feelings, venting, or reflecting

When you call a tool, also include a brief conversational acknowledgment. The system appends a confirmation prompt automatically.

TOPIC AWARENESS:
Classify each exchange with a topic tag based on the subject matter. When the user switches topics, follow naturally. Do not bleed context from unrelated topics unless they connect them explicitly.`;

// ─── System Prompt Builder ─────────────────────────────────────────────────────

/**
 * Build the full system prompt for the AI assistant.
 *
 * Layers:
 * 1. Character definition (who Jarvis is)
 * 2. Member profile (interests, focus, goals, work style)
 * 3. Current stats (XP, streak, rank, goals with progress)
 * 4. Recent activity (check-ins, voice sessions, wins/lessons)
 * 5. Conversation rules (how to behave)
 */
export async function buildSystemPrompt(
  db: ExtendedPrismaClient,
  memberId: string,
): Promise<string> {
  const member = await db.member.findUniqueOrThrow({
    where: { id: memberId },
    include: {
      profile: true,
      goals: {
        where: { status: { in: ['ACTIVE', 'EXTENDED'] } },
        orderBy: { deadline: 'asc' },
        include: {
          children: {
            where: { status: { in: ['ACTIVE', 'EXTENDED'] } },
            select: { title: true, status: true, currentValue: true, targetValue: true, unit: true },
          },
        },
      },
      schedule: true,
      checkIns: {
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { categories: true, createdAt: true },
      },
      voiceSessions: {
        orderBy: { startedAt: 'desc' },
        take: 3,
        select: { durationMinutes: true, channelId: true, startedAt: true },
      },
      xpTransactions: {
        where: {
          source: { in: ['WIN_POST', 'LESSON_POST'] },
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { source: true, description: true, createdAt: true },
      },
      inspirations: {
        orderBy: { createdAt: 'asc' },
        select: { name: true, context: true },
      },
      reflections: {
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { type: true, question: true, insights: true, createdAt: true },
      },
    },
  });

  const sections: string[] = [CHARACTER_PROMPT];

  // Member profile section
  sections.push(buildProfileSection(member));

  // Current stats section
  sections.push(buildStatsSection(member));

  // Recent activity section
  sections.push(buildActivitySection(member));

  // Inspiration section (only if member has inspirations)
  sections.push(buildInspirationSection(member.inspirations));

  // Reflection section (only if member has reflections with insights)
  sections.push(buildReflectionSection(member.reflections));

  // Accountability delegation rules
  sections.push(ACCOUNTABILITY_DELEGATION);

  // Conversation rules
  sections.push(CONVERSATION_RULES);

  // Tool awareness instructions
  sections.push(TOOL_AWARENESS_PROMPT);

  return sections.filter(Boolean).join('\n\n');
}

/**
 * Build the member profile section of the system prompt.
 */
function buildProfileSection(member: {
  displayName: string;
  profile: {
    interests: string[];
    currentFocus: string | null;
    goals: string[];
    workStyle: string | null;
  } | null;
  schedule: {
    accountabilityLevel: string;
  } | null;
}): string {
  const lines: string[] = ['--- MEMBER PROFILE ---'];
  lines.push(`Name: ${member.displayName}`);

  if (member.profile) {
    if (member.profile.interests.length > 0) {
      lines.push(`Interests: ${member.profile.interests.join(', ')}`);
    }
    if (member.profile.currentFocus) {
      lines.push(`Current Focus: ${member.profile.currentFocus}`);
    }
    if (member.profile.goals.length > 0) {
      lines.push(`Goals: ${member.profile.goals.join(', ')}`);
    }
    if (member.profile.workStyle) {
      lines.push(`Work Style: ${member.profile.workStyle}`);
    }
  }

  if (member.schedule) {
    lines.push(`Accountability Level: ${member.schedule.accountabilityLevel}`);
  }

  return lines.join('\n');
}

/**
 * Build the current stats section of the system prompt.
 */
function buildStatsSection(member: {
  totalXp: number;
  currentStreak: number;
  goals: Array<{
    title: string;
    type: string;
    currentValue: number;
    targetValue: number | null;
    unit: string | null;
    parentId: string | null;
    timeframe: string | null;
    children?: Array<{ title: string; status: string; currentValue: number; targetValue: number | null; unit: string | null }>;
  }>;
}): string {
  const rank = getRankForXP(member.totalXp);
  const lines: string[] = ['--- CURRENT STATS ---'];
  lines.push(`Total XP: ${member.totalXp}`);
  lines.push(`Current Streak: ${member.currentStreak} days`);
  lines.push(`Rank: ${rank.name}`);

  // Show only top-level goals to avoid duplicate child entries
  const topLevelGoals = member.goals.filter((g) => g.parentId === null);
  if (topLevelGoals.length > 0) {
    lines.push('Active Goals:');
    for (const goal of topLevelGoals) {
      const tag = goal.timeframe ? `[${goal.timeframe}] ` : '';
      if (goal.children && goal.children.length > 0) {
        const activeChildren = goal.children.length;
        lines.push(`  - ${tag}${goal.title}: ${activeChildren} active sub-goals`);
      } else if (goal.type === 'MEASURABLE' && goal.targetValue !== null) {
        lines.push(`  - ${tag}${goal.title}: ${goal.currentValue}/${goal.targetValue} ${goal.unit ?? ''}`);
      } else {
        lines.push(`  - ${tag}${goal.title}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Build the recent activity section of the system prompt.
 */
function buildActivitySection(member: {
  checkIns: Array<{ categories: string[]; createdAt: Date }>;
  voiceSessions: Array<{
    durationMinutes: number | null;
    channelId: string;
    startedAt: Date;
  }>;
  xpTransactions: Array<{
    source: string;
    description: string;
    createdAt: Date;
  }>;
}): string {
  const lines: string[] = ['--- RECENT ACTIVITY ---'];

  if (member.checkIns.length > 0) {
    lines.push('Recent Check-ins:');
    for (const ci of member.checkIns) {
      const date = ci.createdAt.toISOString().split('T')[0];
      lines.push(`  - ${date}: ${ci.categories.join(', ') || 'general'}`);
    }
  }

  if (member.voiceSessions.length > 0) {
    lines.push('Recent Voice Sessions:');
    for (const vs of member.voiceSessions) {
      const date = vs.startedAt.toISOString().split('T')[0];
      const duration = vs.durationMinutes ?? 0;
      lines.push(`  - ${date}: ${duration} min`);
    }
  }

  if (member.xpTransactions.length > 0) {
    lines.push('Recent Wins/Lessons:');
    for (const tx of member.xpTransactions) {
      const type = tx.source === 'WIN_POST' ? 'Win' : 'Lesson';
      lines.push(`  - ${type}: ${tx.description}`);
    }
  }

  return lines.join('\n');
}

// ─── Inspiration Section ──────────────────────────────────────────────────────

/**
 * Build the inspiration section of the system prompt.
 *
 * Returns an empty string when the member has no inspirations,
 * avoiding prompt clutter. When present, includes guidance for
 * Jarvis on how to reference inspirations naturally and handle
 * "what would [person] do?" queries.
 */
function buildInspirationSection(
  inspirations: Array<{ name: string; context: string | null }>,
): string {
  if (inspirations.length === 0) return '';

  const lines: string[] = ['--- INSPIRATIONS ---'];
  lines.push('People this member admires and draws motivation from:');
  for (const insp of inspirations) {
    if (insp.context) {
      lines.push(`- ${insp.name}: "${insp.context}"`);
    } else {
      lines.push(`- ${insp.name} (no context provided)`);
    }
  }

  lines.push('');
  lines.push(
    'When relevant, reference these inspirations naturally. For example, connect their current goal to something an inspiration is known for. If the member asks "what would [name] do?" answer based on what that person is widely known for -- their philosophy, approach, and public record. Don\'t invent private details. Keep inspiration references organic -- not every message needs one.',
  );

  return lines.join('\n');
}

// ─── Reflection Section ──────────────────────────────────────────────────────

/**
 * Build the reflection insights section of the system prompt.
 *
 * Returns an empty string when the member has no reflections with insights,
 * avoiding prompt clutter. When present, includes guidance for Jarvis on
 * how to reference reflection insights naturally and make forward-looking
 * suggestions grounded in the member's self-awareness.
 */
function buildReflectionSection(
  reflections: Array<{ type: string; question: string; insights: string | null; createdAt: Date }>,
): string {
  const withInsights = reflections.filter((r) => r.insights);
  if (withInsights.length === 0) return '';

  const lines: string[] = ['--- RECENT REFLECTIONS ---'];
  lines.push('What this member has said about themselves in recent self-reflections:');
  for (const ref of withInsights) {
    const date = ref.createdAt.toISOString().split('T')[0];
    lines.push(`- [${ref.type}, ${date}]: Insight: "${ref.insights}"`);
  }

  lines.push('');
  lines.push(
    'Use these insights to give specific, grounded suggestions. Reference them naturally:\n' +
    '- In morning briefs: "You mentioned mornings are your peak -- today\'s brief is hitting early"\n' +
    '- In nudges: "You reflected that you slack after hitting a goal. Stay sharp"\n' +
    '- In conversations: "Based on your last reflection, context switching is your blocker. Want to try 2-hour focus blocks this week?"\n' +
    'When the member hasn\'t reflected recently, you can gently suggest: "We haven\'t reflected in a while -- want to do a quick check-in on how things are going?"',
  );

  return lines.join('\n');
}
