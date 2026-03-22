/**
 * Notification Router
 *
 * Routes notifications to a member's preferred Discord account based on
 * notification type. If a preference is set and the target account has
 * DMs open, delivers there. Otherwise falls back to deliverDM.
 *
 * Callers should prefer deliverNotification over deliverDM
 * for all recurring notifications (briefs, nudges, level-ups, etc.).
 */

import type { Client } from 'discord.js';
import type { ExtendedPrismaClient } from '@28k/db';
import { deliverDM, type DeliveryContent } from '../../shared/delivery.js';
import type { NotificationType } from './constants.js';

/**
 * Map notification type to the corresponding preference field on NotificationPreference.
 */
const TYPE_TO_FIELD: Record<string, string> = {
  brief: 'briefAccountId',
  nudge: 'nudgeAccountId',
  session_alert: 'sessionAlertAccountId',
  level_up: 'levelUpAccountId',
  reminder: 'reminderAccountId',
};

/**
 * Deliver a notification to a member, routing to their preferred account
 * for the given notification type.
 *
 * Focus session behavior:
 * - Reminders bypass focus session gate (user-set, time-critical)
 * - All other notification types respect focus sessions (held during deep work)
 *
 * Routing logic:
 * 1. If type is 'general', delegate directly to deliverDM.
 * 2. Look up NotificationPreference for the member.
 * 3. If a preferred account ID exists for this type, try DM delivery to that account.
 * 4. If DM delivery fails (closed DMs, user not found), fall back to deliverDM.
 * 5. If no preference exists, fall back to deliverDM.
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
  // Reminders are user-set and time-critical -- bypass focus session
  const respectFocusSession = type !== 'reminder';

  // General notifications always go to default delivery
  if (type === 'general') {
    return deliverDM(client, db, memberId, content, { respectFocusSession });
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

  // Fallback: deliver via DM (with focus session gating)
  return deliverDM(client, db, memberId, content, { respectFocusSession });
}
