/**
 * Account linking logic with code generation and verification.
 *
 * Flow:
 * 1. Member runs /link on Account A -> generateLinkCode creates a 6-char code with 5-min TTL
 * 2. Member runs /verify CODE on Account B -> verifyLinkCode atomically validates and links
 * 3. Both accounts now point to the same Member identity (shared XP, profile, data)
 *
 * Security:
 * - Codes are 6-character uppercase alphanumeric (e.g., "A3F2B1")
 * - Codes expire after 5 minutes
 * - Codes can only be used once
 * - Only one active code per account at a time
 * - Verification uses a Prisma $transaction for atomicity (prevents race conditions)
 * - Account cap of 5 linked accounts per member
 */

import crypto from 'node:crypto';
import type { ExtendedPrismaClient } from '@28k/db';
import { ACCOUNT_LINK_CAP, LINK_CODE_TTL_MS } from '@28k/shared';

/**
 * Result of a link code verification attempt.
 */
export interface VerifyResult {
  success: boolean;
  error?: 'invalid_or_expired' | 'requester_not_setup' | 'already_linked_different' | 'cap_reached';
  memberId?: string;
}

/**
 * Result of an unlink attempt.
 */
export interface UnlinkResult {
  success: boolean;
  error?: 'last_account' | 'not_found';
}

/**
 * Generate a 6-character uppercase alphanumeric link code.
 *
 * If the requester already has a pending (unused, non-expired) code,
 * it is deleted first (one active code per account).
 *
 * @param db - Extended PrismaClient
 * @param requesterId - Discord ID of the account requesting the link
 * @returns The generated code and its expiry time
 */
export async function generateLinkCode(
  db: ExtendedPrismaClient,
  requesterId: string,
): Promise<{ code: string; expiresAt: Date }> {
  // Delete any existing pending codes for this requester
  await db.linkCode.deleteMany({
    where: {
      requesterId,
      used: false,
    },
  });

  // Generate a 6-character uppercase alphanumeric code
  const code = crypto.randomBytes(3).toString('hex').toUpperCase();
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS);

  await db.linkCode.create({
    data: {
      code,
      requesterId,
      expiresAt,
      used: false,
    },
  });

  return { code, expiresAt };
}

/**
 * Verify a link code and link the verifier's account to the requester's member identity.
 *
 * Uses prisma.$transaction for atomicity -- prevents race conditions where
 * the same code could be used twice simultaneously.
 *
 * @param db - Extended PrismaClient
 * @param verifierId - Discord ID of the account verifying the code
 * @param code - The 6-character link code
 * @returns Verification result with success status and error details
 */
export async function verifyLinkCode(
  db: ExtendedPrismaClient,
  verifierId: string,
  code: string,
): Promise<VerifyResult> {
  // Use interactive transaction for atomicity
  // Note: We need to use the base client's $transaction since the extended
  // client wraps it. The extended client passes through $transaction calls.
  return db.$transaction(async (tx) => {
    // 1. Look up the link code (must be valid, not expired, not used)
    const linkCode = await tx.linkCode.findFirst({
      where: {
        code,
        used: false,
        expiresAt: { gt: new Date() },
      },
    });

    if (!linkCode) {
      return { success: false, error: 'invalid_or_expired' as const };
    }

    // 2. Mark the code as used (prevent reuse)
    await tx.linkCode.update({
      where: { id: linkCode.id },
      data: { used: true },
    });

    // 3. Look up the requester's DiscordAccount to find their memberId
    const requesterAccount = await tx.discordAccount.findUnique({
      where: { discordId: linkCode.requesterId },
    });

    if (!requesterAccount) {
      return { success: false, error: 'requester_not_setup' as const };
    }

    const memberId = requesterAccount.memberId;

    // 4. Check if the verifier already has a DiscordAccount linked to a DIFFERENT member
    const existingVerifierAccount = await tx.discordAccount.findUnique({
      where: { discordId: verifierId },
    });

    if (existingVerifierAccount) {
      if (existingVerifierAccount.memberId === memberId) {
        // Already linked to the same member -- that's fine, treat as success
        return { success: true, memberId };
      }
      return { success: false, error: 'already_linked_different' as const };
    }

    // 5. Check account cap: member must have fewer than ACCOUNT_LINK_CAP linked accounts
    const accountCount = await tx.discordAccount.count({
      where: { memberId },
    });

    if (accountCount >= ACCOUNT_LINK_CAP) {
      return { success: false, error: 'cap_reached' as const };
    }

    // 6. Create the DiscordAccount for the verifier pointing to the same member
    await tx.discordAccount.create({
      data: {
        discordId: verifierId,
        memberId,
      },
    });

    return { success: true, memberId };
  });
}

/**
 * Unlink a Discord account from its member identity.
 *
 * Cannot unlink the last account -- a member must always have at least
 * one linked Discord account.
 *
 * @param db - Extended PrismaClient
 * @param discordId - Discord ID of the account to unlink
 * @returns Unlink result with success status
 */
export async function unlinkAccount(
  db: ExtendedPrismaClient,
  discordId: string,
): Promise<UnlinkResult> {
  // Look up the DiscordAccount
  const account = await db.discordAccount.findUnique({
    where: { discordId },
  });

  if (!account) {
    return { success: false, error: 'not_found' };
  }

  // Check: the member must have at least 2 linked accounts
  const accountCount = await db.discordAccount.count({
    where: { memberId: account.memberId },
  });

  if (accountCount <= 1) {
    return { success: false, error: 'last_account' };
  }

  // Delete the DiscordAccount record
  await db.discordAccount.delete({
    where: { discordId },
  });

  return { success: true };
}

/**
 * Get all Discord accounts linked to a member.
 *
 * @param db - Extended PrismaClient
 * @param memberId - The member's unique ID
 * @returns Array of DiscordAccount records
 */
export async function getLinkedAccounts(
  db: ExtendedPrismaClient,
  memberId: string,
) {
  return db.discordAccount.findMany({
    where: { memberId },
    orderBy: { linkedAt: 'asc' },
  });
}
