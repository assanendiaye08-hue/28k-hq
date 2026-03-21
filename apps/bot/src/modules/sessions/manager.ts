/**
 * Session Manager
 *
 * Core lifecycle management for lock-in sessions:
 * - startInstantSession: create voice channel, DM invitees, announce if public
 * - scheduleSession: create pending session for future start
 * - endSession: post summary, award host XP, clean up voice channel
 * - inviteMidSession: add participant to active private session
 * - cleanupOrphanedSessions: reconcile DB state on bot restart
 * - handleVoiceJoin/Leave: track participation via voiceStateUpdate
 *
 * IMPORTANT: This module does NOT award time-based voice XP.
 * Voice tracker handles all time XP automatically for channels under "Lock In".
 * Session module only awards the small sessionHost bonus (10 XP) for organizing.
 */

import type { Guild, Client, TextChannel } from 'discord.js';
import type { ExtendedPrismaClient } from '@28k/db';
import type { IEventBus } from '../../shared/types.js';
import { awardXP } from '@28k/shared';
import { XP_AWARDS } from '@28k/shared';
import {
  createSessionVoiceChannel,
  deleteSessionVoiceChannel,
  addParticipantPermission,
} from './voice-channels.js';
import {
  buildSessionAnnouncementEmbed,
  buildSessionInviteEmbed,
  buildSessionSummaryEmbed,
} from './embeds.js';
import {
  MAX_ACTIVE_SESSIONS_PER_MEMBER,
  SESSION_CLEANUP_DELAY_MS,
  SESSION_CHANNEL_NAME,
  LOCKIN_ROLE_NAME,
} from './constants.js';
import { deliverNotification } from '../notification-router/router.js';

/** In-memory tracking for active sessions. */
interface ActiveSessionEntry {
  sessionId: string;
  voiceChannelId: string;
  creatorMemberId: string;
}

/** Active sessions map keyed by sessionId. */
const activeSessions = new Map<string, ActiveSessionEntry>();

/**
 * Start an instant lock-in session.
 *
 * Creates voice channel, DMs invitees, announces if public.
 * Returns the created session record.
 */
export async function startInstantSession(
  guild: Guild,
  db: ExtendedPrismaClient,
  events: IEventBus,
  creatorMemberId: string,
  creatorDiscordId: string,
  title: string,
  visibility: 'PUBLIC' | 'PRIVATE',
  inviteeDiscordIds: string[],
): Promise<{ sessionId: string; voiceChannelId: string }> {
  // Check active session limit
  const activeCount = await db.lockInSession.count({
    where: { creatorMemberId, status: 'ACTIVE' },
  });
  if (activeCount >= MAX_ACTIVE_SESSIONS_PER_MEMBER) {
    throw new Error('You already have an active session. End it first with /endsession.');
  }

  // Infer title if not provided
  let sessionTitle = title;
  if (!sessionTitle) {
    sessionTitle = await inferSessionTitle(db, creatorMemberId);
  }

  const botId = guild.client.user?.id;
  if (!botId) throw new Error('Bot user not available');

  // Resolve creator username for channel naming
  const creatorMember = await guild.members.fetch(creatorDiscordId).catch(() => null);
  const creatorUsername = creatorMember?.user.username;

  // Create voice channel
  const voiceChannel = await createSessionVoiceChannel(
    guild,
    sessionTitle,
    creatorDiscordId,
    inviteeDiscordIds,
    visibility === 'PUBLIC',
    botId,
    creatorUsername,
  );

  // Create session in DB
  const session = await db.lockInSession.create({
    data: {
      creatorMemberId,
      voiceChannelId: voiceChannel.id,
      title: sessionTitle,
      visibility,
      status: 'ACTIVE',
      startedAt: new Date(),
    },
  });

  // Add creator as participant
  await db.sessionParticipant.create({
    data: {
      sessionId: session.id,
      memberId: creatorMemberId,
      role: 'creator',
    },
  });

  // Track in memory
  activeSessions.set(session.id, {
    sessionId: session.id,
    voiceChannelId: voiceChannel.id,
    creatorMemberId,
  });

  // DM each invitee via notification routing (respects session_alert preference)
  const creatorName = creatorMember?.displayName ?? 'Someone';
  for (const inviteeId of inviteeDiscordIds) {
    try {
      const inviteeAccount = await db.discordAccount.findUnique({ where: { discordId: inviteeId } });
      if (inviteeAccount) {
        const embed = buildSessionInviteEmbed(sessionTitle, creatorName, voiceChannel.id);
        await deliverNotification(guild.client, db, inviteeAccount.memberId, 'session_alert', { embeds: [embed] });
      }
    } catch {
      // Delivery failed -- silent
    }
  }

  // If PUBLIC: announce in #sessions and ping @LockInSessions
  if (visibility === 'PUBLIC') {
    await announceSession(guild, sessionTitle, creatorName, visibility);
  }

  // Emit event
  events.emit('sessionStarted', session.id, creatorMemberId);

  return { sessionId: session.id, voiceChannelId: voiceChannel.id };
}

/**
 * Schedule a future session (creates PENDING record).
 */
export async function scheduleSession(
  guild: Guild,
  db: ExtendedPrismaClient,
  creatorMemberId: string,
  title: string,
  visibility: 'PUBLIC' | 'PRIVATE',
  scheduledFor: Date,
  inviteeDiscordIds: string[],
): Promise<{ sessionId: string }> {
  const session = await db.lockInSession.create({
    data: {
      creatorMemberId,
      title,
      visibility,
      status: 'PENDING',
      scheduledFor,
    },
  });

  // Resolve creator name for embeds
  const creatorAccount = await db.discordAccount.findFirst({
    where: { memberId: creatorMemberId },
  });
  let creatorName = 'Someone';
  if (creatorAccount) {
    try {
      const user = await guild.client.users.fetch(creatorAccount.discordId);
      creatorName = user.displayName ?? user.username;
    } catch { /* silent */ }
  }

  // DM invitees about the scheduled session via notification routing
  for (const inviteeId of inviteeDiscordIds) {
    try {
      const inviteeAccount = await db.discordAccount.findUnique({ where: { discordId: inviteeId } });
      if (inviteeAccount) {
        const embed = buildSessionAnnouncementEmbed(title, creatorName, visibility, scheduledFor);
        await deliverNotification(guild.client, db, inviteeAccount.memberId, 'session_alert', { embeds: [embed] });
      }
    } catch {
      // Delivery failed -- silent
    }
  }

  // If PUBLIC: announce scheduled session
  if (visibility === 'PUBLIC') {
    await announceSession(guild, title, creatorName, visibility, scheduledFor);
  }

  return { sessionId: session.id };
}

/**
 * End an active session.
 *
 * Calculates duration, awards host XP if 2+ participants,
 * posts summary, and cleans up voice channel.
 */
export async function endSession(
  guild: Guild,
  db: ExtendedPrismaClient,
  events: IEventBus,
  client: Client,
  sessionId: string,
): Promise<{ durationMinutes: number; participantCount: number } | null> {
  const session = await db.lockInSession.findUnique({
    where: { id: sessionId },
    include: { participants: true },
  });

  if (!session || session.status !== 'ACTIVE') return null;

  // Calculate duration
  const now = new Date();
  const startedAt = session.startedAt ?? now;
  const elapsedMs = now.getTime() - startedAt.getTime();
  const durationMinutes = Math.max(1, Math.floor(elapsedMs / 60_000));

  // Update session record
  await db.lockInSession.update({
    where: { id: sessionId },
    data: {
      status: 'COMPLETED',
      endedAt: now,
      durationMinutes,
    },
  });

  // Update all participants who haven't left
  await db.sessionParticipant.updateMany({
    where: { sessionId, leftAt: null },
    data: { leftAt: now },
  });

  // Count unique participants
  const participantCount = session.participants.length;

  // Award sessionHost XP to creator if 2+ participants
  if (participantCount >= 2) {
    try {
      await awardXP(
        db,
        session.creatorMemberId,
        XP_AWARDS.sessionHost,
        'SESSION_HOST',
        `Hosted lock-in session: ${session.title} (${participantCount} participants)`,
      );
    } catch {
      // XP award failed -- continue with cleanup
    }
  }

  // Build and post summary
  const participantNames = await resolveParticipantNames(
    guild,
    db,
    session.participants.map((p) => p.memberId),
  );

  const summaryEmbed = buildSessionSummaryEmbed(
    session.title,
    participantNames[0] ?? 'Unknown',
    durationMinutes,
    participantNames,
    session.title,
  );

  // Post summary in #sessions channel
  await postToSessionsChannel(guild, { embeds: [summaryEmbed] });

  // Clean up voice channel after delay
  if (session.voiceChannelId) {
    const channelId = session.voiceChannelId;
    setTimeout(() => {
      deleteSessionVoiceChannel(guild, channelId).catch(() => { /* silent */ });
    }, SESSION_CLEANUP_DELAY_MS);
  }

  // Remove from active sessions map
  activeSessions.delete(sessionId);

  // Emit event
  events.emit('sessionEnded', sessionId, durationMinutes);

  return { durationMinutes, participantCount };
}

/**
 * Invite a new participant mid-session.
 */
export async function inviteMidSession(
  guild: Guild,
  db: ExtendedPrismaClient,
  sessionId: string,
  newDiscordId: string,
): Promise<void> {
  const session = await db.lockInSession.findUnique({
    where: { id: sessionId },
  });

  if (!session || session.status !== 'ACTIVE') {
    throw new Error('No active session found.');
  }

  // Resolve new invitee's member ID
  const account = await db.discordAccount.findUnique({
    where: { discordId: newDiscordId },
  });

  if (account) {
    // Add participant record (upsert to avoid duplicates)
    await db.sessionParticipant.upsert({
      where: {
        sessionId_memberId: { sessionId, memberId: account.memberId },
      },
      create: {
        sessionId,
        memberId: account.memberId,
        role: 'participant',
      },
      update: {
        leftAt: null, // Re-join if they left before
      },
    });
  }

  // Add voice channel permission (for private sessions)
  if (session.voiceChannelId && session.visibility === 'PRIVATE') {
    await addParticipantPermission(guild, session.voiceChannelId, newDiscordId);
  }

  // DM the invitee via notification routing
  try {
    const inviteeAccount = await db.discordAccount.findUnique({ where: { discordId: newDiscordId } });
    if (inviteeAccount && session.voiceChannelId) {
      const creatorAccount = await db.discordAccount.findFirst({
        where: { memberId: session.creatorMemberId },
      });
      let creatorName = 'Someone';
      if (creatorAccount) {
        try {
          const fetchedUser = await guild.client.users.fetch(creatorAccount.discordId);
          creatorName = fetchedUser.displayName ?? fetchedUser.username;
        } catch { /* silent */ }
      }

      const embed = buildSessionInviteEmbed(session.title, creatorName, session.voiceChannelId);
      await deliverNotification(guild.client, db, inviteeAccount.memberId, 'session_alert', { embeds: [embed] });
    }
  } catch {
    // Delivery failed -- silent
  }
}

/**
 * Clean up orphaned sessions on bot restart.
 *
 * For each ACTIVE session in DB:
 * - If voice channel is gone or empty: complete the session
 * - If voice channel has people in it: reconstruct in active sessions map
 */
export async function cleanupOrphanedSessions(
  guild: Guild,
  db: ExtendedPrismaClient,
): Promise<number> {
  const activeSessRecords = await db.lockInSession.findMany({
    where: { status: 'ACTIVE' },
  });

  let cleanedUp = 0;

  for (const session of activeSessRecords) {
    if (!session.voiceChannelId) {
      // No voice channel -- mark completed
      await db.lockInSession.update({
        where: { id: session.id },
        data: {
          status: 'COMPLETED',
          endedAt: new Date(),
          durationMinutes: session.startedAt
            ? Math.floor((Date.now() - session.startedAt.getTime()) / 60_000)
            : 0,
        },
      });
      cleanedUp++;
      continue;
    }

    const channel = guild.channels.cache.get(session.voiceChannelId);

    if (!channel || !channel.isVoiceBased() || channel.members.size === 0) {
      // Channel gone or empty -- clean up
      if (channel) {
        try {
          await channel.delete('Orphaned session cleanup');
        } catch { /* silent */ }
      }

      await db.lockInSession.update({
        where: { id: session.id },
        data: {
          status: 'COMPLETED',
          endedAt: new Date(),
          durationMinutes: session.startedAt
            ? Math.floor((Date.now() - session.startedAt.getTime()) / 60_000)
            : 0,
        },
      });

      await db.sessionParticipant.updateMany({
        where: { sessionId: session.id, leftAt: null },
        data: { leftAt: new Date() },
      });

      cleanedUp++;
    } else {
      // Channel exists with people -- reconstruct in memory
      activeSessions.set(session.id, {
        sessionId: session.id,
        voiceChannelId: session.voiceChannelId,
        creatorMemberId: session.creatorMemberId,
      });
    }
  }

  return cleanedUp;
}

/**
 * Handle a user joining a session voice channel.
 * Adds them as a participant if not already tracked.
 */
export async function handleVoiceJoin(
  db: ExtendedPrismaClient,
  sessionId: string,
  memberId: string,
): Promise<void> {
  await db.sessionParticipant.upsert({
    where: {
      sessionId_memberId: { sessionId, memberId },
    },
    create: {
      sessionId,
      memberId,
      role: 'participant',
    },
    update: {
      leftAt: null, // Re-join
    },
  });
}

/**
 * Handle a user leaving a session voice channel.
 * Sets their leftAt timestamp.
 */
export async function handleVoiceLeave(
  db: ExtendedPrismaClient,
  sessionId: string,
  memberId: string,
): Promise<void> {
  await db.sessionParticipant.updateMany({
    where: { sessionId, memberId, leftAt: null },
    data: { leftAt: new Date() },
  });
}

/**
 * Find the active session for a voice channel ID (if any).
 */
export function findSessionByVoiceChannel(voiceChannelId: string): ActiveSessionEntry | undefined {
  for (const entry of activeSessions.values()) {
    if (entry.voiceChannelId === voiceChannelId) {
      return entry;
    }
  }
  return undefined;
}

/**
 * Find the active session created by a specific member.
 */
export async function findActiveSessionByCreator(
  db: ExtendedPrismaClient,
  creatorMemberId: string,
): Promise<{ id: string; title: string; voiceChannelId: string | null } | null> {
  return db.lockInSession.findFirst({
    where: { creatorMemberId, status: 'ACTIVE' },
    select: { id: true, title: true, voiceChannelId: true },
  });
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Infer session title from member's active goals or profile focus.
 */
async function inferSessionTitle(
  db: ExtendedPrismaClient,
  memberId: string,
): Promise<string> {
  // Try most recent active goal title
  const recentGoal = await db.goal.findFirst({
    where: { memberId, status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
    select: { title: true },
  });
  if (recentGoal?.title) return recentGoal.title;

  // Try currentFocus from profile
  const profile = await db.memberProfile.findUnique({
    where: { memberId },
    select: { currentFocus: true },
  });
  if (profile?.currentFocus) return profile.currentFocus;

  return 'General lock-in';
}

/**
 * Resolve participant member IDs to display names.
 */
async function resolveParticipantNames(
  guild: Guild,
  db: ExtendedPrismaClient,
  memberIds: string[],
): Promise<string[]> {
  const names: string[] = [];

  for (const memberId of memberIds) {
    const account = await db.discordAccount.findFirst({
      where: { memberId },
    });
    if (!account) {
      names.push('Unknown');
      continue;
    }

    try {
      const guildMember = await guild.members.fetch(account.discordId);
      names.push(guildMember.displayName);
    } catch {
      names.push('Unknown');
    }
  }

  return names;
}

/**
 * Post an announcement in the #sessions text channel.
 */
async function announceSession(
  guild: Guild,
  title: string,
  creatorName: string,
  visibility: string,
  scheduledFor?: Date,
): Promise<void> {
  const embed = buildSessionAnnouncementEmbed(title, creatorName, visibility, scheduledFor);

  const sessionsChannel = guild.channels.cache.find(
    (ch) => ch.name === SESSION_CHANNEL_NAME && ch.isTextBased(),
  ) as TextChannel | undefined;

  if (!sessionsChannel) return;

  // Find @LockInSessions role for ping
  const role = guild.roles.cache.find((r) => r.name === LOCKIN_ROLE_NAME);
  const content = role ? `<@&${role.id}>` : undefined;

  try {
    await sessionsChannel.send({ content, embeds: [embed] });
  } catch {
    // Channel send failed -- silent
  }
}

/**
 * Post a message to the #sessions text channel.
 */
async function postToSessionsChannel(
  guild: Guild,
  messagePayload: { embeds: import('discord.js').EmbedBuilder[]; content?: string },
): Promise<void> {
  const sessionsChannel = guild.channels.cache.find(
    (ch) => ch.name === SESSION_CHANNEL_NAME && ch.isTextBased(),
  ) as TextChannel | undefined;

  if (!sessionsChannel) return;

  try {
    await sessionsChannel.send(messagePayload);
  } catch {
    // Channel send failed -- silent
  }
}
