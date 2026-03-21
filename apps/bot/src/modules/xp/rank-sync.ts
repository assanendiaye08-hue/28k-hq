/**
 * Rank Sync -- Discord role management on level change.
 *
 * When a member levels up, this module:
 * 1. Fetches their Discord accounts from the database
 * 2. For each account, fetches the guild member
 * 3. Removes the old rank role, adds the new rank role
 *
 * All role operations are wrapped in try/catch because:
 * - Roles can be deleted by admins
 * - Bot may lack permission
 * - Race conditions on multiple level-ups
 *
 * Failures are logged as warnings, never thrown -- a failed role
 * assignment should not break the XP flow.
 */

import { Client, type Guild, EmbedBuilder } from 'discord.js';
import type { ExtendedPrismaClient } from '@28k/db';
import { RANK_PROGRESSION } from '@28k/shared';
import { getNextRankInfo } from '@28k/shared';

/**
 * Sync Discord roles after a rank change.
 *
 * Removes old rank role, adds new rank role for all of the member's
 * linked Discord accounts across all guilds the bot is in.
 *
 * @param client - Discord.js client
 * @param db - Extended Prisma client
 * @param memberId - Internal member ID
 * @param newRankName - Name of the new rank
 * @param oldRankName - Name of the old rank
 */
export async function syncRank(
  client: Client,
  db: ExtendedPrismaClient,
  memberId: string,
  newRankName: string,
  oldRankName: string,
): Promise<void> {
  // Get all Discord accounts linked to this member
  const accounts = await db.discordAccount.findMany({
    where: { memberId },
  });

  if (accounts.length === 0) return;

  // Process each guild the bot is in
  for (const guild of client.guilds.cache.values()) {
    for (const account of accounts) {
      try {
        await syncRankForAccount(guild, account.discordId, newRankName, oldRankName);
      } catch (error) {
        // Log and continue -- never let a role sync failure break the flow
        console.warn(
          `[rank-sync] Failed to sync rank for ${account.discordId} in guild ${guild.name}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  }
}

/**
 * Sync rank role for a single Discord account in a single guild.
 */
async function syncRankForAccount(
  guild: Guild,
  discordId: string,
  newRankName: string,
  oldRankName: string,
): Promise<void> {
  // Fetch the guild member -- they may not be in this guild
  let guildMember;
  try {
    guildMember = await guild.members.fetch(discordId);
  } catch {
    // Member not in this guild -- skip silently
    return;
  }

  // Find old rank role and remove it
  const oldRank = RANK_PROGRESSION.find((r) => r.name === oldRankName);
  if (oldRank) {
    const oldRole = guild.roles.cache.find((r) => r.name === oldRankName);
    if (oldRole && guildMember.roles.cache.has(oldRole.id)) {
      try {
        await guildMember.roles.remove(oldRole);
      } catch (error) {
        console.warn(
          `[rank-sync] Could not remove role "${oldRankName}" from ${discordId}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

  // Find new rank role and add it
  const newRole = guild.roles.cache.find((r) => r.name === newRankName);
  if (newRole) {
    try {
      await guildMember.roles.add(newRole);
    } catch (error) {
      console.warn(
        `[rank-sync] Could not add role "${newRankName}" to ${discordId}:`,
        error instanceof Error ? error.message : error,
      );
    }
  } else {
    console.warn(
      `[rank-sync] Role "${newRankName}" not found in guild "${guild.name}". ` +
        'Create the role or run server setup.',
    );
  }
}

/**
 * Build a level-up celebration embed.
 *
 * Delivered to member's private space only -- never posted publicly.
 * Design: subtle, satisfying, not intrusive. Like a game achievement notification.
 *
 * @param displayName - Member's display name
 * @param newRankName - The rank they just reached
 * @param totalXp - Their total XP after the award
 * @returns Configured EmbedBuilder
 */
export function buildLevelUpEmbed(
  displayName: string,
  newRankName: string,
  totalXp: number,
): EmbedBuilder {
  const newRank = RANK_PROGRESSION.find((r) => r.name === newRankName);
  const color = newRank?.color ?? 0xf59e0b; // Fall back to brand gold

  return new EmbedBuilder()
    .setColor(color)
    .setTitle('Level Up!')
    .setDescription(`**${displayName}**, you just hit **${newRankName}**`)
    .addFields(
      { name: 'Total XP', value: totalXp.toLocaleString(), inline: true },
      { name: 'Next Rank', value: getNextRankInfo(totalXp), inline: true },
    )
    .setFooter({ text: 'Keep grinding.' })
    .setTimestamp();
}
