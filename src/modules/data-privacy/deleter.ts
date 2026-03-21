/**
 * Data Deleter -- hard-deletes all member data with Discord cleanup.
 *
 * Performs Discord cleanup BEFORE database deletion to ensure we still
 * have the data needed for cleanup (linked accounts, private space).
 *
 * Deletion order:
 * 1. Fetch linked Discord accounts and private space (while they exist)
 * 2. Delete private space Discord channel
 * 3. Delete SessionParticipant records (no cascade from Member)
 * 4. Delete Member record (cascades ALL related tables)
 * 5. Strip bot-managed roles from all linked Discord accounts
 */

import type { Client, Guild } from 'discord.js';
import type { ExtendedPrismaClient } from '../../db/client.js';

/**
 * Permanently delete all data for a member and clean up Discord resources.
 *
 * @param db - Extended Prisma client
 * @param client - Discord client for channel/role operations
 * @param memberId - The member's internal CUID
 * @param guild - The Discord guild to clean up roles/channels in
 */
export async function hardDeleteMember(
  db: ExtendedPrismaClient,
  client: Client,
  memberId: string,
  guild: Guild,
): Promise<void> {
  // Step 1: Fetch Discord resources while they still exist
  const accounts = await db.discordAccount.findMany({
    where: { memberId },
    select: { discordId: true },
  });

  const space = await db.privateSpace.findUnique({
    where: { memberId },
  });

  // Step 2: Delete private space channel if it exists
  if (space?.channelId) {
    const ch = await client.channels.fetch(space.channelId).catch(() => null);
    if (ch) await ch.delete('Member data deletion').catch(() => {});
  }

  // Step 3: Delete records without cascade relations
  await db.sessionParticipant.deleteMany({ where: { memberId } });
  await db.tokenUsage.deleteMany({ where: { memberId } });

  // Step 4: Delete Member record -- cascades to ALL related tables:
  // DiscordAccount, MemberProfile, PrivateSpace, CheckIn, Goal,
  // XPTransaction, MemberSchedule, VoiceSession, ConversationMessage,
  // ConversationSummary, SeasonSnapshot
  await db.member.delete({ where: { id: memberId } });

  // Step 5: Strip ALL bot-managed roles from linked Discord accounts
  for (const account of accounts) {
    try {
      const guildMember = await guild.members.fetch(account.discordId);
      // Remove all roles except @everyone (which can't be removed)
      const botRoles = guildMember.roles.cache.filter((r) => r.name !== '@everyone');
      for (const [, role] of botRoles) {
        await guildMember.roles.remove(role).catch(() => {});
      }
    } catch {
      // Member may have left server -- nothing to clean up
    }
  }
}
