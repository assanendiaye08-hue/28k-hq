/**
 * Voice Tracker Module
 *
 * Passively tracks time spent in "Lock In" voice co-working channels.
 * Awards XP based on session duration (1 XP per 3 min, 200/day cap).
 *
 * Listens to Discord voiceStateUpdate events (NOT the internal event bus).
 * On bot ready, reconstructs sessions from current voice channel occupants.
 *
 * State machine transitions:
 * - JOIN tracked channel -> start session
 * - LEAVE -> end session (persist + XP)
 * - Switch to AFK channel -> pause
 * - Switch from AFK channel -> resume
 * - Server-deafen -> pause; un-deafen -> resume
 * - Self-mute / self-deafen -> continue tracking (deep focus)
 * - Switch between tracked channels -> update channel
 * - Switch from tracked to untracked (non-AFK) -> end session
 */

import type { Module, ModuleContext } from '../../shared/types.js';
import type { ExtendedPrismaClient } from '../../db/client.js';
import {
  startSession,
  endSession,
  pauseSession,
  resumeSession,
  updateSessionChannel,
  getActiveSession,
  reconstructSessions,
  isTrackedChannel,
} from './tracker.js';
import { buildSessionSummaryEmbed } from './embeds.js';
import { deliverToPrivateSpace } from '../../shared/delivery.js';

const voiceTrackerModule: Module = {
  name: 'voice-tracker',

  register(ctx: ModuleContext): void {
    const db = ctx.db as ExtendedPrismaClient;

    // Listen to Discord voiceStateUpdate events
    ctx.client.on('voiceStateUpdate', async (oldState, newState) => {
      try {
        const discordId = newState.id;
        const guild = newState.guild;
        const afkChannelId = guild.afkChannelId;

        const oldChannelId = oldState.channelId;
        const newChannelId = newState.channelId;

        // Resolve internal member ID from Discord account
        const account = await db.discordAccount.findUnique({
          where: { discordId },
          include: { member: { select: { id: true, displayName: true } } },
        });
        if (!account) return; // Not a registered member

        const memberId = account.memberId;

        // --- Server-deafen state changes (independent of channel change) ---
        if (newState.serverDeaf && !oldState.serverDeaf) {
          // Just became server-deafened -> pause
          pauseSession(discordId);
          return;
        }
        if (!newState.serverDeaf && oldState.serverDeaf) {
          // Just un-deafened -> resume
          resumeSession(discordId);
          return;
        }

        // --- Channel transitions ---
        const hasActiveSession = getActiveSession(discordId) !== undefined;

        // JOIN: no old channel, new channel exists
        if (!oldChannelId && newChannelId) {
          if (isTrackedChannel(newChannelId, guild)) {
            startSession(discordId, newChannelId, memberId, ctx.events);
          }
          return;
        }

        // LEAVE: old channel exists, no new channel
        if (oldChannelId && !newChannelId) {
          if (hasActiveSession) {
            const result = await endSession(discordId, db, ctx.events);
            if (result?.noteworthy) {
              const embed = buildSessionSummaryEmbed(
                account.member.displayName,
                result.durationMinutes,
                result.xpAwarded,
              );
              await deliverToPrivateSpace(ctx.client, db, memberId, { embeds: [embed] });
            }
            if (result?.leveledUp) {
              ctx.events.emit('levelUp', memberId, result.newRank!, result.oldRank!, 0);
            }
          }
          return;
        }

        // SWITCH: both old and new channel exist
        if (oldChannelId && newChannelId && oldChannelId !== newChannelId) {
          // Moving TO AFK channel -> pause
          if (newChannelId === afkChannelId && hasActiveSession) {
            pauseSession(discordId);
            return;
          }

          // Moving FROM AFK channel -> resume
          if (oldChannelId === afkChannelId && hasActiveSession) {
            resumeSession(discordId);
            return;
          }

          const oldTracked = isTrackedChannel(oldChannelId, guild);
          const newTracked = isTrackedChannel(newChannelId, guild);

          // Both tracked -> update channel
          if (oldTracked && newTracked && hasActiveSession) {
            updateSessionChannel(discordId, newChannelId);
            return;
          }

          // Was tracked, now untracked -> end session
          if (oldTracked && !newTracked && hasActiveSession) {
            const result = await endSession(discordId, db, ctx.events);
            if (result?.noteworthy) {
              const embed = buildSessionSummaryEmbed(
                account.member.displayName,
                result.durationMinutes,
                result.xpAwarded,
              );
              await deliverToPrivateSpace(ctx.client, db, memberId, { embeds: [embed] });
            }
            if (result?.leveledUp) {
              ctx.events.emit('levelUp', memberId, result.newRank!, result.oldRank!, 0);
            }
            return;
          }

          // Was untracked, now tracked -> start session
          if (!oldTracked && newTracked && !hasActiveSession) {
            startSession(discordId, newChannelId, memberId, ctx.events);
            return;
          }
        }
      } catch (error) {
        ctx.logger.error('[voice-tracker] Error in voiceStateUpdate handler:', error);
      }
    });

    // On bot ready: reconstruct sessions from current voice occupants
    ctx.client.once('ready', async (readyClient) => {
      try {
        const guild = readyClient.guilds.cache.first();
        if (!guild) {
          ctx.logger.warn('[voice-tracker] No guild found for session reconstruction');
          return;
        }

        const count = await reconstructSessions(guild, db, ctx.events);
        if (count > 0) {
          ctx.logger.info(`[voice-tracker] Reconstructed ${count} active voice session(s)`);
        }
      } catch (error) {
        ctx.logger.error('[voice-tracker] Error reconstructing sessions:', error);
      }
    });

    ctx.logger.info('[voice-tracker] Module registered');
  },
};

export default voiceTrackerModule;
