import { config } from '../core/config.js';

/**
 * Check if a Discord user is the owner.
 * Looks up whether this Discord account is linked to the same Member
 * as the configured OWNER_DISCORD_ID — supports multi-account identity.
 */
export async function isOwner(userId: string, db: any): Promise<boolean> {
  // Fast path: exact match
  if (userId === config.OWNER_DISCORD_ID) return true;

  // Check if both accounts belong to the same member
  const [ownerAccount, userAccount] = await Promise.all([
    db.discordAccount.findUnique({ where: { discordId: config.OWNER_DISCORD_ID } }),
    db.discordAccount.findUnique({ where: { discordId: userId } }),
  ]);

  if (!ownerAccount || !userAccount) return false;
  return ownerAccount.memberId === userAccount.memberId;
}
