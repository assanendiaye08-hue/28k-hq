/**
 * DM Delivery Utility
 *
 * Delivers messages to a member via DM. All private interactions happen via DMs --
 * no per-member private channels.
 *
 * Supports focus session gating: when a member is in a focus session (set by the
 * desktop app), non-critical messages are held (returns false). Callers can bypass
 * the gate for time-critical messages by passing { respectFocusSession: false }.
 *
 * NOTE: For typed notifications (briefs, nudges, level-ups, session alerts),
 * callers should prefer `deliverNotification` from the notification-router
 * module. It routes to the member's preferred account per notification type,
 * falling back to this function when no preference is set.
 *
 * This function remains the fallback for notification-router and is used
 * directly by non-recurring deliveries (e.g., /mydata file export).
 */

import { Client } from 'discord.js';
import type { EmbedBuilder } from 'discord.js';
import type { ExtendedPrismaClient } from '@28k/db';

/**
 * Content payload for DM delivery.
 * At least one of embeds or content must be provided.
 */
export interface DeliveryContent {
  embeds?: EmbedBuilder[];
  content?: string;
}

/**
 * Deliver a message to a member via DM.
 *
 * 1. If respectFocusSession is true (default), check if member is in a focus session.
 *    If so, return false (message held -- not delivered).
 * 2. Look up the member's first linked Discord account.
 * 3. Send the message via DM.
 *
 * @returns true if delivery succeeded, false if held (focus) or no delivery target found
 */
export async function deliverDM(
  client: Client,
  db: ExtendedPrismaClient,
  memberId: string,
  content: DeliveryContent,
  options?: { respectFocusSession?: boolean },
): Promise<boolean> {
  try {
    // Check focus session (skip if respectFocusSession is false)
    if (options?.respectFocusSession !== false) {
      const member = await db.member.findUnique({
        where: { id: memberId },
        select: { inFocusSession: true },
      });
      if (member?.inFocusSession) return false;
    }

    // DM delivery via first linked account
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

/** Backward-compatible alias for existing callers. */
export const deliverToPrivateSpace = deliverDM;
