/**
 * Sessions Module
 *
 * Member-initiated lock-in sessions with instant and scheduled modes.
 * Manages voice channel lifecycle, attendance tracking, and session summaries.
 *
 * Commands: /lockin, /schedule-session, /endsession, /invite-session
 *
 * On ready:
 * - Cleans up orphaned sessions (voice channels deleted during downtime)
 * - Starts missed scheduled sessions (scheduledFor <= now while bot was offline)
 * - Sets up cron tasks for upcoming scheduled sessions
 *
 * On voiceStateUpdate:
 * - Tracks join/leave for session participation records
 */

import type { Module, ModuleContext } from '../../shared/types.js';
import type { ExtendedPrismaClient } from '../../db/client.js';
import {
  buildLockinCommand,
  buildScheduleSessionCommand,
  buildEndsessionCommand,
  buildInviteSessionCommand,
  handleLockin,
  handleScheduleSession,
  handleEndsession,
  handleInviteSession,
} from './commands.js';
import {
  cleanupOrphanedSessions,
  startInstantSession,
  handleVoiceJoin,
  handleVoiceLeave,
  findSessionByVoiceChannel,
} from './manager.js';

const sessionsModule: Module = {
  name: 'sessions',

  register(ctx: ModuleContext): void {
    const db = ctx.db as ExtendedPrismaClient;

    // Register slash commands
    ctx.commands.register('lockin', buildLockinCommand(), handleLockin);
    ctx.commands.register('schedule-session', buildScheduleSessionCommand(), handleScheduleSession);
    ctx.commands.register('endsession', buildEndsessionCommand(), handleEndsession);
    ctx.commands.register('invite-session', buildInviteSessionCommand(), handleInviteSession);

    // On bot ready: cleanup and start scheduled sessions
    ctx.client.once('ready', async (readyClient) => {
      try {
        const guild = readyClient.guilds.cache.first();
        if (!guild) {
          ctx.logger.warn('[sessions] No guild found for session cleanup');
          return;
        }

        // Clean up orphaned sessions
        const cleanedUp = await cleanupOrphanedSessions(guild, db);
        if (cleanedUp > 0) {
          ctx.logger.info(`[sessions] Cleaned up ${cleanedUp} orphaned session(s)`);
        }

        // Start missed scheduled sessions (scheduledFor <= now, still PENDING)
        const missedSessions = await db.lockInSession.findMany({
          where: {
            status: 'PENDING',
            scheduledFor: { lte: new Date() },
          },
        });

        for (const session of missedSessions) {
          try {
            const creatorAccount = await db.discordAccount.findFirst({
              where: { memberId: session.creatorMemberId },
            });
            if (!creatorAccount) continue;

            await startInstantSession(
              guild,
              db,
              ctx.events,
              session.creatorMemberId,
              creatorAccount.discordId,
              session.title,
              session.visibility as 'PUBLIC' | 'PRIVATE',
              [],
            );

            // Mark original as cancelled (replaced by the instant one)
            await db.lockInSession.update({
              where: { id: session.id },
              data: { status: 'CANCELLED' },
            });
          } catch (error) {
            ctx.logger.error(`[sessions] Failed to start missed session ${session.id}:`, error);
          }
        }

        // Set up timers for upcoming scheduled sessions
        const upcomingSessions = await db.lockInSession.findMany({
          where: {
            status: 'PENDING',
            scheduledFor: { gt: new Date() },
          },
        });

        for (const session of upcomingSessions) {
          if (!session.scheduledFor) continue;
          const delay = session.scheduledFor.getTime() - Date.now();
          if (delay <= 0) continue;

          setTimeout(async () => {
            try {
              const freshGuild = readyClient.guilds.cache.first();
              if (!freshGuild) return;

              const creatorAccount = await db.discordAccount.findFirst({
                where: { memberId: session.creatorMemberId },
              });
              if (!creatorAccount) return;

              await startInstantSession(
                freshGuild,
                db,
                ctx.events,
                session.creatorMemberId,
                creatorAccount.discordId,
                session.title,
                session.visibility as 'PUBLIC' | 'PRIVATE',
                [],
              );

              await db.lockInSession.update({
                where: { id: session.id },
                data: { status: 'CANCELLED' },
              });
            } catch (error) {
              ctx.logger.error(`[sessions] Failed to start scheduled session ${session.id}:`, error);
            }
          }, delay);

          ctx.logger.info(
            `[sessions] Scheduled session "${session.title}" to start in ${Math.round(delay / 60_000)} min`,
          );
        }
      } catch (error) {
        ctx.logger.error('[sessions] Error in ready handler:', error);
      }
    });

    // Listen to voiceStateUpdate for session participation tracking
    ctx.client.on('voiceStateUpdate', async (oldState, newState) => {
      try {
        const discordId = newState.id;
        const oldChannelId = oldState.channelId;
        const newChannelId = newState.channelId;

        // Only care about channel changes
        if (oldChannelId === newChannelId) return;

        // Resolve member
        const account = await db.discordAccount.findUnique({
          where: { discordId },
        });
        if (!account) return;

        const memberId = account.memberId;

        // JOIN: joined a new channel
        if (newChannelId) {
          const session = findSessionByVoiceChannel(newChannelId);
          if (session) {
            await handleVoiceJoin(db, session.sessionId, memberId);
          }
        }

        // LEAVE: left a channel
        if (oldChannelId) {
          const session = findSessionByVoiceChannel(oldChannelId);
          if (session) {
            await handleVoiceLeave(db, session.sessionId, memberId);
          }
        }
      } catch {
        // Silent -- don't crash on voice state errors
      }
    });

    ctx.logger.info('[sessions] Module registered');
  },
};

export default sessionsModule;
