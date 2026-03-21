/**
 * Server role setup -- creates the rank progression and Member gate role.
 *
 * Roles are created in hierarchy order (highest first) so Discord positions
 * them correctly. The function is idempotent: existing roles are skipped.
 *
 * Role hierarchy (top to bottom):
 *   Legend > Mogul > Boss > Hustler > Grinder > Rookie > Member > @everyone
 *
 * The "Member" role is the gating role -- assigned after /setup to unlock channels.
 * Rank roles are NOT hoisted (keeps the member list clean) and NOT mentionable.
 */

import type { Guild, Role } from 'discord.js';
import type { Logger } from 'winston';
import { RANK_PROGRESSION } from '@28k/shared';

/**
 * Ensure all server roles exist (rank progression + Member role).
 *
 * @param guild - The Discord guild to set up roles in
 * @param logger - Logger for tracking created vs existing roles
 * @returns Map of role name -> Role object (used by channel setup for permission overwrites)
 */
export async function setupServerRoles(
  guild: Guild,
  logger: Logger,
): Promise<Map<string, Role>> {
  const roleMap = new Map<string, Role>();

  // Fetch existing roles to check before creating
  await guild.roles.fetch();

  // Create rank roles in reverse order (highest first for correct hierarchy position)
  // RANK_PROGRESSION is ordered low-to-high, so we reverse it
  const ranksHighToLow = [...RANK_PROGRESSION].reverse();

  for (const rank of ranksHighToLow) {
    const existing = guild.roles.cache.find((r) => r.name === rank.name);

    if (existing) {
      logger.debug(`Role already exists: ${rank.name}`);
      roleMap.set(rank.name, existing);
    } else {
      const created = await guild.roles.create({
        name: rank.name,
        color: rank.color,
        hoist: false, // Clean member list
        mentionable: false,
        reason: 'Discord Hustler rank progression setup',
      });
      logger.info(`Created role: ${rank.name}`);
      roleMap.set(rank.name, created);
    }
  }

  // Create the "Member" gate role (no special color, below rank roles)
  const memberRole = guild.roles.cache.find((r) => r.name === 'Member');

  if (memberRole) {
    logger.debug('Role already exists: Member');
    roleMap.set('Member', memberRole);
  } else {
    const created = await guild.roles.create({
      name: 'Member',
      color: 0x000000, // No color (invisible in role list)
      hoist: false,
      mentionable: false,
      reason: 'Discord Hustler gate role -- assigned after /setup',
    });
    logger.info('Created role: Member');
    roleMap.set('Member', created);
  }

  const createdCount = ranksHighToLow.length + 1; // ranks + Member
  const existingCount = roleMap.size;
  logger.info(
    `Role setup complete: ${existingCount} roles ready (${createdCount - existingCount} were already present)`,
  );

  return roleMap;
}
