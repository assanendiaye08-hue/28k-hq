/**
 * Private Space Delivery Utility
 *
 * Reusable function to deliver messages to a member's private space.
 * Handles both space types (DM and private channel) transparently.
 *
 * Used by: check-in responses, goal updates, morning briefs,
 * reminders, level-up notifications -- all Phase 2 features.
 */

import { Client, TextChannel, type EmbedBuilder } from 'discord.js';
import type { ExtendedPrismaClient } from '../db/client.js';

/**
 * Content payload for private space delivery.
 * At least one of embeds or content must be provided.
 */
export interface DeliveryContent {
  embeds?: EmbedBuilder[];
  content?: string;
}

/**
 * Deliver a message to a member's private space.
 *
 * Lookup order:
 * 1. If member has a CHANNEL private space with a valid channelId, send there.
 * 2. Otherwise (DM preference or channel unavailable), DM via first linked Discord account.
 *
 * @returns true if delivery succeeded, false if no delivery target found
 */
export async function deliverToPrivateSpace(
  client: Client,
  db: ExtendedPrismaClient,
  memberId: string,
  content: DeliveryContent,
): Promise<boolean> {
  try {
    // Look up the member's private space preference
    const space = await db.privateSpace.findUnique({
      where: { memberId },
    });

    // Try channel delivery first if member prefers it
    if (space?.type === 'CHANNEL' && space.channelId) {
      try {
        const channel = await client.channels.fetch(space.channelId);
        if (channel?.isTextBased()) {
          await (channel as TextChannel).send(content);
          return true;
        }
      } catch {
        // Channel fetch/send failed -- fall through to DM
      }
    }

    // DM fallback (or DM is the preference)
    const account = await db.discordAccount.findFirst({
      where: { memberId },
    });
    if (!account) return false;

    const user = await client.users.fetch(account.discordId);
    await user.send(content);
    return true;
  } catch {
    // All delivery attempts failed (DMs closed, user not found, etc.)
    return false;
  }
}
