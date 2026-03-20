/**
 * Notification Router
 *
 * Routes notifications to a member's preferred Discord account based on
 * notification type. If a preference is set and the target account has
 * DMs open, delivers there. Otherwise falls back to deliverToPrivateSpace.
 *
 * Callers should prefer deliverNotification over deliverToPrivateSpace
 * for all recurring notifications (briefs, nudges, level-ups, etc.).
 */

import type { Client } from 'discord.js';
import type { ExtendedPrismaClient } from '../../db/client.js';
import { deliverToPrivateSpace, type DeliveryContent } from '../../shared/delivery.js';
import type { NotificationType } from './constants.js';

/**
 * Map notification type to the corresponding preference field on NotificationPreference.
 */
const TYPE_TO_FIELD: Record<string, string> = {
  brief: 'briefAccountId',
  nudge: 'nudgeAccountId',
  session_alert: 'sessionAlertAccountId',
  level_up: 'levelUpAccountId',
};

/**
 * Deliver a notification to a member, routing to their preferred account
 * for the given notification type.
 *
 * Routing logic:
 * 1. If type is 'general', delegate directly to deliverToPrivateSpace.
 * 2. Look up NotificationPreference for the member.
 * 3. If a preferred account ID exists for this type, try DM delivery to that account.
 * 4. If DM delivery fails (closed DMs, user not found), fall back to deliverToPrivateSpace.
 * 5. If no preference exists, fall back to deliverToPrivateSpace.
 *
 * @returns true if delivery succeeded, false if all attempts failed
 */
export async function deliverNotification(
  client: Client,
  db: ExtendedPrismaClient,
  memberId: string,
  type: NotificationType,
  content: DeliveryContent,
): Promise<boolean> {
  // General notifications always go to default delivery
  if (type === 'general') {
    return deliverToPrivateSpace(client, db, memberId, content);
  }

  // Look up notification preference
  try {
    const prefs = await db.notificationPreference.findUnique({
      where: { memberId },
    });

    const fieldName = TYPE_TO_FIELD[type];
    const preferredAccountId = prefs && fieldName
      ? (prefs as Record<string, unknown>)[fieldName] as string | null
      : null;

    if (preferredAccountId) {
      // Try to deliver to the preferred account via DM
      try {
        const user = await client.users.fetch(preferredAccountId);
        await user.send(content);
        return true;
      } catch {
        // Preferred account DM failed -- fall back to default delivery
      }
    }
  } catch {
    // Preference lookup failed -- fall back to default delivery
  }

  // Fallback: deliver via private space (existing behavior)
  return deliverToPrivateSpace(client, db, memberId, content);
}
