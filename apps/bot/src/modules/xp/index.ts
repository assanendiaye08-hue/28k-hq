/**
 * XP Module
 *
 * Service module (no slash commands) that listens for events and
 * manages XP awards, rank sync, and level-up celebrations.
 *
 * Event listeners:
 * - xpAwarded: Sync Discord roles if leveled up, send celebration embed
 * - memberSetupComplete: Award one-time setup bonus XP (50 XP)
 *
 * The actual XP awarding for check-ins and goals is done by those
 * modules -- they call awardXP() directly and emit events.
 * This module reacts to the events for role sync and celebrations.
 */

import type { Module, ModuleContext } from '../../shared/types.js';
import type { ExtendedPrismaClient } from '@28k/db';
import { awardXP, XP_AWARDS } from '@28k/shared';
import { syncRank, buildLevelUpEmbed } from './rank-sync.js';
import { deliverNotification } from '../notification-router/router.js';

const xpModule: Module = {
  name: 'xp',

  register(ctx: ModuleContext): void {
    const { client, events, logger } = ctx;
    const db = ctx.db as ExtendedPrismaClient;

    /**
     * On xpAwarded: if the member leveled up, sync their Discord roles
     * and send a level-up celebration to their private space.
     */
    events.on('xpAwarded', async (...args: unknown[]) => {
      const [memberId, amount, newTotal, source] = args as [string, number, number, string];

      // We need to check if this award caused a level-up.
      // The emitter should provide this info, but we can also check by
      // looking at the rank before and after. Since the event gives us
      // the source, we import the rank check.
      // The actual level-up detection and levelUp event emission happens
      // in the check-in/goal modules that call awardXP().
      // This listener is kept for future extensibility (analytics, etc.)
      logger.debug(
        `XP awarded: ${amount} to ${memberId} (total: ${newTotal}, source: ${source})`,
      );
    });

    /**
     * On levelUp: sync Discord roles and send celebration embed.
     */
    events.on('levelUp', async (...args: unknown[]) => {
      const [memberId, newRank, oldRank, newTotal] = args as [string, string, string, number];

      logger.info(`Level up: ${memberId} ${oldRank} -> ${newRank} (${newTotal} XP)`);

      // Sync Discord roles
      try {
        await syncRank(client, db, memberId, newRank, oldRank);
      } catch (error) {
        logger.error(`Failed to sync rank for ${memberId}:`, error);
      }

      // Send level-up celebration to private space
      try {
        const member = await db.member.findUnique({
          where: { id: memberId },
        });

        if (member) {
          const embed = buildLevelUpEmbed(member.displayName, newRank, newTotal);
          const delivered = await deliverNotification(client, db, memberId, 'level_up', {
            embeds: [embed],
          });

          if (!delivered) {
            logger.warn(`Could not deliver level-up celebration to ${memberId}`);
          }
        }
      } catch (error) {
        logger.error(`Failed to send level-up celebration for ${memberId}:`, error);
      }
    });

    /**
     * On memberSetupComplete: award one-time setup bonus XP.
     * This fires once when a member completes /setup for the first time.
     */
    events.on('memberSetupComplete', async (...args: unknown[]) => {
      const [memberId] = args as [string, string];

      try {
        const result = await awardXP(
          db,
          memberId,
          XP_AWARDS.setupBonus,
          'SETUP_BONUS',
          'Completed profile setup',
        );

        // Emit xpAwarded event so other listeners (analytics, etc.) can react
        events.emit('xpAwarded', memberId, XP_AWARDS.setupBonus, result.newTotal, 'SETUP_BONUS');

        // If setup bonus caused a level-up (unlikely but possible), emit levelUp
        if (result.leveledUp && result.newRank && result.oldRank) {
          events.emit('levelUp', memberId, result.newRank, result.oldRank, result.newTotal);
        }

        logger.info(`Setup bonus: awarded ${XP_AWARDS.setupBonus} XP to ${memberId}`);
      } catch (error) {
        logger.error(`Failed to award setup bonus XP to ${memberId}:`, error);
      }
    });
  },
};

export default xpModule;
