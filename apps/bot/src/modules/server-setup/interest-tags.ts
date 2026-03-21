/**
 * AI-managed interest tag role creation and cleanup.
 *
 * Interest tags are lightweight Discord roles created from a member's
 * AI-extracted interest tags. They serve as filtering/visibility roles,
 * NOT rank roles. When no members have a particular interest tag, the
 * role and DB record are cleaned up after 7 days of disuse.
 */

import type { Guild } from 'discord.js';
import type { ExtendedPrismaClient } from '@28k/db';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) =>
      `${timestamp as string} [interest-tags] ${level}: ${message as string}`),
  ),
  transports: [new winston.transports.Console()],
});

/** Days of inactivity before an unused tag is cleaned up. */
const CLEANUP_DAYS = 7;

/**
 * Sync interest tags for a member.
 *
 * For each interest:
 * - If the tag doesn't exist in DB: create the record AND a Discord role
 * - If the tag exists: increment memberCount and update lastUsedAt
 * - Assign all interest tag roles to the member in Discord
 *
 * @param guild - The Discord guild
 * @param db - Extended PrismaClient
 * @param memberId - The member's unique ID (for finding their Discord accounts)
 * @param interests - Array of interest tag names
 */
export async function syncInterestTags(
  guild: Guild,
  db: ExtendedPrismaClient,
  memberId: string,
  interests: string[],
): Promise<void> {
  if (interests.length === 0) return;

  // Normalize interest names (lowercase, trimmed)
  const normalizedInterests = interests
    .map((i) => i.toLowerCase().trim())
    .filter((i) => i.length > 0 && i.length <= 100);

  const roleIds: string[] = [];

  for (const tagName of normalizedInterests) {
    try {
      // Check if the tag already exists
      let tag = await db.interestTag.findUnique({
        where: { name: tagName },
      });

      if (tag) {
        // Tag exists -- increment memberCount and update lastUsedAt
        tag = await db.interestTag.update({
          where: { name: tagName },
          data: {
            memberCount: { increment: 1 },
            lastUsedAt: new Date(),
          },
        });

        // If the tag has a Discord role, track it for assignment
        if (tag.roleId) {
          roleIds.push(tag.roleId);
        }
      } else {
        // Create new tag and Discord role
        let discordRole;
        try {
          discordRole = await guild.roles.create({
            name: tagName,
            color: 0x95a5a6, // Neutral grey -- interest tags are subtle
            reason: `AI-managed interest tag: ${tagName}`,
          });
        } catch (roleError) {
          logger.error(`Failed to create Discord role for tag "${tagName}": ${String(roleError)}`);
          // Still create the DB record without a role -- role can be created later
        }

        tag = await db.interestTag.create({
          data: {
            name: tagName,
            roleId: discordRole?.id ?? null,
            memberCount: 1,
          },
        });

        if (discordRole) {
          roleIds.push(discordRole.id);
        }

        logger.info(`Created interest tag: "${tagName}"${discordRole ? ` (role: ${discordRole.id})` : ' (no role)'}`);
      }
    } catch (error) {
      logger.error(`Failed to sync interest tag "${tagName}": ${String(error)}`);
    }
  }

  // Assign all interest tag roles to the member's Discord accounts
  if (roleIds.length > 0) {
    const accounts = await db.discordAccount.findMany({
      where: { memberId },
    });

    for (const account of accounts) {
      try {
        const guildMember = await guild.members.fetch(account.discordId).catch(() => null);
        if (guildMember) {
          const rolesToAdd = roleIds.filter((id) => !guildMember.roles.cache.has(id));
          if (rolesToAdd.length > 0) {
            await guildMember.roles.add(rolesToAdd, 'Interest tag sync');
          }
        }
      } catch (error) {
        logger.error(
          `Failed to assign interest roles to account ${account.discordId}: ${String(error)}`,
        );
      }
    }
  }
}

/**
 * Clean up unused interest tags.
 *
 * Finds tags where:
 * - memberCount is 0
 * - lastUsedAt is older than CLEANUP_DAYS days
 *
 * Deletes both the Discord role and the DB record.
 *
 * @param guild - The Discord guild
 * @param db - Extended PrismaClient
 */
export async function cleanupUnusedTags(
  guild: Guild,
  db: ExtendedPrismaClient,
): Promise<void> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - CLEANUP_DAYS);

  const unusedTags = await db.interestTag.findMany({
    where: {
      memberCount: 0,
      lastUsedAt: { lt: cutoff },
    },
  });

  if (unusedTags.length === 0) {
    logger.debug('No unused interest tags to clean up');
    return;
  }

  for (const tag of unusedTags) {
    try {
      // Delete the Discord role if it exists
      if (tag.roleId) {
        const role = guild.roles.cache.get(tag.roleId);
        if (role) {
          await role.delete('Interest tag cleanup: no members');
          logger.info(`Deleted Discord role for unused tag: "${tag.name}"`);
        }
      }

      // Delete the DB record
      await db.interestTag.delete({
        where: { id: tag.id },
      });

      logger.info(`Cleaned up unused interest tag: "${tag.name}"`);
    } catch (error) {
      logger.error(`Failed to clean up tag "${tag.name}": ${String(error)}`);
    }
  }

  logger.info(`Interest tag cleanup complete: ${unusedTags.length} tag(s) removed`);
}
