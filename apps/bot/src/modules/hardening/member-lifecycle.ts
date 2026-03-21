/**
 * Member leave/rejoin lifecycle handlers.
 *
 * - handleMemberRemove: Logs departure to #bot-log. Data is preserved
 *   (deletion only via /deletedata).
 * - handleMemberAdd: Detects rejoins by checking if DiscordAccount exists.
 *   Offers restore/fresh choice via DM with 5-minute timeout.
 *   Genuinely new members are handled by the onboarding module.
 */

import {
  type Client,
  type GuildMember,
  type PartialGuildMember,
  type TextChannel,
  ChannelType,
} from 'discord.js';
import type { ExtendedPrismaClient } from '@28k/db';
import type { Logger } from 'winston';
import { BOT_LOG_CHANNEL, BOT_OPS_CATEGORY } from './constants.js';
import { SETUP_TIMEOUT_MS } from '@28k/shared';
import { hardDeleteMember } from '../data-privacy/deleter.js';

/**
 * Find the #bot-log text channel in the member's guild.
 */
function findBotLog(guild: GuildMember['guild'] | PartialGuildMember['guild']): TextChannel | null {
  const category = guild.channels.cache.find(
    (ch) => ch.type === ChannelType.GuildCategory && ch.name === BOT_OPS_CATEGORY,
  );
  if (!category) return null;

  const channel = guild.channels.cache.find(
    (ch) =>
      ch.type === ChannelType.GuildText &&
      ch.name === BOT_LOG_CHANNEL &&
      ch.parentId === category.id,
  );

  return (channel as TextChannel) ?? null;
}

/**
 * Handle a member leaving the server.
 *
 * Logs the departure to #bot-log but does NOT delete any data.
 * Data deletion is only possible via /deletedata.
 */
export async function handleMemberRemove(
  member: GuildMember | PartialGuildMember,
  db: ExtendedPrismaClient,
  logger: Logger,
): Promise<void> {
  const displayName = member.displayName;

  // Check if this member had a profile
  const account = await db.discordAccount.findUnique({
    where: { discordId: member.id },
    include: { member: { select: { id: true, displayName: true } } },
  });

  if (account) {
    const memberName = account.member.displayName;
    logger.info(
      `[hardening] Member left: ${memberName} (memberId: ${account.memberId}). Data preserved -- use /deletedata to remove.`,
    );
  } else {
    logger.info(`[hardening] Non-registered user left: ${displayName}`);
  }

  // Post to #bot-log
  const botLog = findBotLog(member.guild);
  if (botLog) {
    try {
      await botLog.send(`${displayName} left the server. Profile data preserved.`);
    } catch (error) {
      logger.error(`[hardening] Failed to log member departure to #bot-log: ${String(error)}`);
    }
  }
}

/**
 * Handle a member joining (or rejoining) the server.
 *
 * If the member has an existing DiscordAccount, this is a rejoin.
 * They get a DM offering to restore their profile or start fresh.
 * If not found, this is a genuinely new member and the onboarding
 * module handles the welcome flow.
 */
export async function handleMemberAdd(
  member: GuildMember,
  client: Client,
  db: ExtendedPrismaClient,
  logger: Logger,
): Promise<void> {
  const displayName = member.displayName;

  // Check for existing account (rejoin detection)
  const account = await db.discordAccount.findUnique({
    where: { discordId: member.id },
    include: {
      member: {
        select: {
          id: true,
          displayName: true,
        },
        include: {
          profile: { select: { interests: true } },
        },
      },
    },
  });

  // Not a rejoin -- genuinely new member. Let onboarding module handle it.
  if (!account) {
    return;
  }

  const memberId = account.memberId;
  const memberName = account.member.displayName;
  logger.info(`[hardening] Rejoin detected: ${memberName} (memberId: ${memberId})`);

  let choice: 'restore' | 'fresh' | 'timeout-restore' = 'timeout-restore';

  try {
    // Try to DM the member with restore/fresh choice
    const dm = await member.createDM();
    await dm.send(
      'Welcome back! Your profile is still here. Want to pick up where you left off, or start fresh?\n\n' +
      'Reply **restore** to keep your existing profile, or **fresh** to wipe everything and start over with /setup.',
    );

    // Wait for response with 5-minute timeout
    const collected = await dm.awaitMessages({
      filter: (msg) => msg.author.id === member.id,
      max: 1,
      time: SETUP_TIMEOUT_MS,
    });

    const reply = collected.first()?.content.trim().toLowerCase();

    if (reply === 'fresh' || reply === 'start fresh') {
      // Fresh start: delete all data
      choice = 'fresh';
      try {
        await hardDeleteMember(db, client, memberId, member.guild);
        await dm.send('Done! Run `/setup` to create a new profile.');
        logger.info(`[hardening] ${memberName} chose fresh start -- data deleted`);
      } catch (error) {
        await dm.send('Something went wrong wiping your data. Please try `/deletedata` manually.');
        logger.error(`[hardening] Failed to delete data for ${memberName}: ${String(error)}`);
      }
    } else {
      // Restore (explicit "restore" or any other reply)
      choice = 'restore';
      await restoreMemberAccess(member, db, account.member.profile?.interests ?? [], logger);
      await dm.send('Welcome back! Everything is just how you left it.');
      logger.info(`[hardening] ${memberName} chose restore`);
    }
  } catch {
    // DM failed or timed out -- default to restore (non-destructive)
    choice = 'timeout-restore';
    await restoreMemberAccess(member, db, account.member.profile?.interests ?? [], logger);
    logger.info(`[hardening] ${memberName} rejoined, timed out on choice, auto-restored`);
  }

  // Post rejoin event to #bot-log
  const botLog = findBotLog(member.guild);
  if (botLog) {
    try {
      await botLog.send(`${displayName} rejoined. Choice: ${choice}.`);
    } catch (error) {
      logger.error(`[hardening] Failed to log rejoin to #bot-log: ${String(error)}`);
    }
  }
}

/**
 * Restore a rejoining member's access:
 * 1. Assign the Member role to regain channel access
 * 2. Reassign interest tag roles they previously had
 */
async function restoreMemberAccess(
  member: GuildMember,
  db: ExtendedPrismaClient,
  interests: string[],
  logger: Logger,
): Promise<void> {
  const guild = member.guild;

  // Assign Member role
  const memberRole = guild.roles.cache.find((r) => r.name === 'Member');
  if (memberRole) {
    try {
      await member.roles.add(memberRole, 'Rejoin -- restoring Member role');
    } catch (error) {
      logger.error(`[hardening] Failed to assign Member role on rejoin: ${String(error)}`);
    }
  }

  // Reassign interest tag roles
  if (interests.length > 0) {
    try {
      const tags = await db.interestTag.findMany({
        where: {
          name: { in: interests },
          roleId: { not: null },
        },
      });

      for (const tag of tags) {
        if (tag.roleId) {
          const role = guild.roles.cache.get(tag.roleId);
          if (role) {
            await member.roles.add(role, 'Rejoin -- restoring interest tag role');
          }
        }
      }
    } catch (error) {
      logger.error(`[hardening] Failed to restore interest tag roles on rejoin: ${String(error)}`);
    }
  }
}
