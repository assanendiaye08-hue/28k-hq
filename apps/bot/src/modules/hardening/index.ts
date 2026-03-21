/**
 * Hardening Module
 *
 * Ensures the bot runs unattended for 7+ days:
 *
 * 1. On 'ready': runs recovery checks (expired goals, stale sessions, season status)
 *    and posts a summary to #bot-log. Recovery failures are caught and logged --
 *    they never prevent the bot from starting.
 *
 * 2. On 'guildMemberRemove': logs departure to #bot-log, preserves data.
 *
 * 3. On 'guildMemberAdd': detects rejoins (existing DiscordAccount) and offers
 *    restore/fresh choice via DM. Genuinely new members are left to the
 *    onboarding module.
 *
 * Auto-discovered by the module loader (exports name + register).
 */

import { Events } from 'discord.js';
import type { Module, ModuleContext } from '../../shared/types.js';
import type { ExtendedPrismaClient } from '@28k/db';
import { runRecoveryChecks } from './recovery.js';
import { handleMemberRemove, handleMemberAdd } from './member-lifecycle.js';

const hardeningModule: Module = {
  name: 'hardening',

  register(ctx: ModuleContext): void {
    const db = ctx.db as ExtendedPrismaClient;
    const { client, logger } = ctx;

    // 1. Recovery checks on bot ready
    client.once('ready', async () => {
      try {
        await runRecoveryChecks(client, db, logger);
      } catch (error) {
        // Recovery failures must NEVER prevent the bot from starting
        logger.error(`[hardening] Recovery checks failed (non-fatal): ${String(error)}`);
      }
    });

    // 2. Member departure logging
    client.on(Events.GuildMemberRemove, async (member) => {
      try {
        await handleMemberRemove(member, db, logger);
      } catch (error) {
        logger.error(`[hardening] Error handling member remove: ${String(error)}`);
      }
    });

    // 3. Rejoin detection and restore/fresh flow
    client.on(Events.GuildMemberAdd, async (member) => {
      try {
        await handleMemberAdd(member, client, db, logger);
      } catch (error) {
        logger.error(`[hardening] Error handling member add: ${String(error)}`);
      }
    });

    logger.info('[hardening] Module registered');
  },
};

export default hardeningModule;
