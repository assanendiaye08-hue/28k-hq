/**
 * AI assistant personality builder.
 *
 * Defines "Jarvis" -- a personal operator with hustler
 * energy. Builds layered system prompts that combine character definition,
 * member profile data, current stats, recent activity, and conversation rules.
 */

import type { ExtendedPrismaClient } from '../../db/client.js';
import { getRankForXP } from '../xp/engine.js';

/** The AI assistant's name. */
export const AI_NAME = 'Jarvis';

// ─── Character Prompt ──────────────────────────────────────────────────────────

const CHARACTER_PROMPT = `You are Jarvis, a sharp personal operator for a productivity Discord server. Efficient, direct, you use casual language and slang naturally, you keep it real. You have their back but you'll call them out when they're slacking. You're not a mentor or sage -- you're their operator, helping them get things done. You remember past conversations and follow up on things they mentioned. Never invent facts about their data. If you don't know something, say so.`;

const CONVERSATION_RULES = `Reference past conversations naturally. If the member mentioned something they'd do, follow up on it. Adapt your push level based on their accountability setting: light = gentle nudges, medium = direct and real, heavy = calls it out hard. Keep responses concise unless they ask for detail. Don't use excessive emojis. When referencing other members' activity, keep it anonymous ("someone in the server crushed it yesterday") unless the member specifically asks about others.`;

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

  // Conversation rules
  sections.push(CONVERSATION_RULES);

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
  }>;
}): string {
  const rank = getRankForXP(member.totalXp);
  const lines: string[] = ['--- CURRENT STATS ---'];
  lines.push(`Total XP: ${member.totalXp}`);
  lines.push(`Current Streak: ${member.currentStreak} days`);
  lines.push(`Rank: ${rank.name}`);

  if (member.goals.length > 0) {
    lines.push('Active Goals:');
    for (const goal of member.goals) {
      if (goal.type === 'MEASURABLE' && goal.targetValue !== null) {
        lines.push(`  - ${goal.title}: ${goal.currentValue}/${goal.targetValue} ${goal.unit ?? ''}`);
      } else {
        lines.push(`  - ${goal.title}`);
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
