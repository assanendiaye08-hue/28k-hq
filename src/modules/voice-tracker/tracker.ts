/**
 * Voice Session Tracker
 *
 * In-memory session state machine for voice co-working tracking.
 * Sessions are persisted to DB on end with duration calculation.
 * XP is awarded based on session length (1 XP per 3 min, 200/day cap).
 *
 * State transitions:
 *   JOIN -> active session
 *   LEAVE -> persist + award XP + remove
 *   AFK channel / server-deafen -> pause
 *   Return from AFK / un-deafen -> resume
 *   Channel switch (within tracked) -> update channelId
 *   Channel switch (out of tracked) -> end session
 */

import type { Guild, CategoryChannel } from 'discord.js';
import type { ExtendedPrismaClient } from '../../db/client.js';
import type { IEventBus } from '../../shared/types.js';
import { awardXP } from '../xp/engine.js';
import { XP_AWARDS } from '../xp/constants.js';
import { MIN_SESSION_MINUTES, NOTEWORTHY_THRESHOLD_MINUTES, VOICE_CATEGORY_NAME } from './constants.js';

/** Active voice session held in memory. */
export interface ActiveSession {
  memberId: string;
  discordId: string;
  channelId: string;
  startedAt: Date;
  pausedAt?: Date;
  totalPausedMs: number;
}

/** Result returned after ending a session. */
export interface SessionEndResult {
  durationMinutes: number;
  xpAwarded: number;
  noteworthy: boolean;
  leveledUp: boolean;
  newRank?: string;
  oldRank?: string;
}

/** In-memory session map keyed by Discord user ID. */
const sessions = new Map<string, ActiveSession>();

/**
 * Start a new voice session for a user.
 */
export function startSession(
  discordId: string,
  channelId: string,
  memberId: string,
  events: IEventBus,
): void {
  sessions.set(discordId, {
    memberId,
    discordId,
    channelId,
    startedAt: new Date(),
    totalPausedMs: 0,
  });
  events.emit('voiceSessionStarted', memberId, channelId);
}

/**
 * End a voice session: calculate duration, persist to DB, award XP.
 * Returns null if no active session exists.
 */
export async function endSession(
  discordId: string,
  db: ExtendedPrismaClient,
  events: IEventBus,
): Promise<SessionEndResult | null> {
  const session = sessions.get(discordId);
  if (!session) return null;

  // If currently paused, account for the final pause duration
  const now = new Date();
  let totalPaused = session.totalPausedMs;
  if (session.pausedAt) {
    totalPaused += now.getTime() - session.pausedAt.getTime();
  }

  const elapsedMs = now.getTime() - session.startedAt.getTime() - totalPaused;
  const durationMinutes = Math.floor(elapsedMs / 60_000);

  // Remove from memory regardless of duration
  sessions.delete(discordId);

  // Only persist and award XP for meaningful sessions
  if (durationMinutes < MIN_SESSION_MINUTES) {
    return { durationMinutes, xpAwarded: 0, noteworthy: false, leveledUp: false };
  }

  // Find the active season (if any) for linking
  const activeSeason = await db.season.findFirst({ where: { active: true } });

  // Persist session to database
  await db.voiceSession.create({
    data: {
      memberId: session.memberId,
      channelId: session.channelId,
      startedAt: session.startedAt,
      endedAt: now,
      durationMinutes,
      seasonId: activeSeason?.id ?? null,
    },
  });

  // Calculate voice XP (1 per 3 minutes, capped at daily remaining)
  const rawXP = Math.floor(durationMinutes / 3) * XP_AWARDS.voice.xpPer3Minutes;
  const todayUsed = await getTodayVoiceXP(db, session.memberId);
  const remaining = Math.max(0, XP_AWARDS.voice.dailyCap - todayUsed);
  const xpToAward = Math.min(rawXP, remaining);

  let leveledUp = false;
  let newRank: string | undefined;
  let oldRank: string | undefined;

  if (xpToAward > 0) {
    const result = await awardXP(
      db,
      session.memberId,
      xpToAward,
      'VOICE_SESSION',
      `Voice co-work session: ${durationMinutes} min`,
    );
    leveledUp = result.leveledUp;
    newRank = result.newRank;
    oldRank = result.oldRank;
  }

  events.emit('voiceSessionEnded', session.memberId, durationMinutes, session.channelId);

  return {
    durationMinutes,
    xpAwarded: xpToAward,
    noteworthy: durationMinutes >= NOTEWORTHY_THRESHOLD_MINUTES,
    leveledUp,
    newRank,
    oldRank,
  };
}

/**
 * Pause a session (AFK channel or server-deafen).
 */
export function pauseSession(discordId: string): void {
  const session = sessions.get(discordId);
  if (session && !session.pausedAt) {
    session.pausedAt = new Date();
  }
}

/**
 * Resume a paused session (return from AFK or un-deafen).
 */
export function resumeSession(discordId: string): void {
  const session = sessions.get(discordId);
  if (session?.pausedAt) {
    session.totalPausedMs += Date.now() - session.pausedAt.getTime();
    session.pausedAt = undefined;
  }
}

/**
 * Update the channel for an active session (co-work channel switch).
 */
export function updateSessionChannel(discordId: string, newChannelId: string): void {
  const session = sessions.get(discordId);
  if (session) {
    session.channelId = newChannelId;
  }
}

/**
 * Get the active session for a user (or undefined).
 */
export function getActiveSession(discordId: string): ActiveSession | undefined {
  return sessions.get(discordId);
}

/**
 * Reconstruct sessions on bot ready by scanning voice channels.
 * Creates sessions with startedAt = now for all members currently in tracked channels.
 */
export async function reconstructSessions(
  guild: Guild,
  db: ExtendedPrismaClient,
  events: IEventBus,
): Promise<number> {
  let count = 0;
  const afkChannelId = guild.afkChannelId;

  for (const [, channel] of guild.channels.cache) {
    if (!channel.isVoiceBased()) continue;
    if (channel.id === afkChannelId) continue;
    if (!isTrackedChannel(channel.id, guild)) continue;

    for (const [discordId, member] of channel.members) {
      // Skip if already tracking (shouldn't happen on fresh start)
      if (sessions.has(discordId)) continue;

      // Resolve internal member ID
      const account = await db.discordAccount.findUnique({
        where: { discordId },
      });
      if (!account) continue;

      startSession(discordId, channel.id, account.memberId, events);
      count++;
    }
  }

  return count;
}

/**
 * Check if a channel is under the "Lock In" category and not the AFK channel.
 */
export function isTrackedChannel(channelId: string, guild: Guild): boolean {
  const channel = guild.channels.cache.get(channelId);
  if (!channel) return false;
  if (channel.id === guild.afkChannelId) return false;

  // Check if parent category is "Lock In"
  const parent = channel.parent;
  if (!parent) return false;

  return parent.name === VOICE_CATEGORY_NAME;
}

/**
 * Get total voice XP earned today (UTC) for daily cap check.
 */
async function getTodayVoiceXP(
  db: ExtendedPrismaClient,
  memberId: string,
): Promise<number> {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const result = await db.xPTransaction.aggregate({
    where: {
      memberId,
      source: 'VOICE_SESSION',
      createdAt: { gte: todayStart },
    },
    _sum: { amount: true },
  });

  return result._sum.amount ?? 0;
}
