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
import { TZDate } from '@date-fns/tz';
import { startOfDay } from 'date-fns';

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

// ─── Outreach Budget Gate ────────────────────────────────────────────────────

/** Maximum bot-initiated DMs per member per day. */
const MAX_DAILY_OUTREACH = 3;

/**
 * Check and increment the daily outreach budget for a member.
 *
 * Proactive senders (brief, nudge, reflection, planning) call this BEFORE
 * calling deliverDM. It is NOT called inside deliverDM itself -- user-initiated
 * replies should not consume budget.
 *
 * @returns true if budget allows another outreach, false if exhausted
 */
export async function checkAndIncrementOutreach(
  db: ExtendedPrismaClient,
  memberId: string,
): Promise<boolean> {
  const schedule = await db.memberSchedule.findUnique({
    where: { memberId },
    select: {
      dailyOutreachCount: true,
      lastOutreachDate: true,
      timezone: true,
    },
  });

  // No schedule = allow (defaults work without config)
  if (!schedule) return true;

  const tz = schedule.timezone || 'UTC';
  const nowInTz = new TZDate(new Date(), tz);
  const todayStart = startOfDay(nowInTz);

  // Check if counter needs reset (new day in member's timezone)
  const lastDate = schedule.lastOutreachDate;
  const isNewDay = !lastDate || new TZDate(lastDate, tz) < todayStart;

  if (isNewDay) {
    // Reset counter and increment for this outreach
    await db.memberSchedule.update({
      where: { memberId },
      data: { dailyOutreachCount: 1, lastOutreachDate: new Date() },
    });
    return true;
  }

  // Same day -- check budget
  if (schedule.dailyOutreachCount >= MAX_DAILY_OUTREACH) {
    return false; // Budget exhausted
  }

  // Increment counter
  await db.memberSchedule.update({
    where: { memberId },
    data: {
      dailyOutreachCount: { increment: 1 },
      lastOutreachDate: new Date(),
    },
  });
  return true;
}

// ─── Quiet Hours Gate ────────────────────────────────────────────────────────

/**
 * Check if the current time falls within a member's configured quiet hours.
 *
 * Handles overnight spans (e.g., 22:00-07:00 crosses midnight).
 *
 * @returns true if currently in quiet hours, false otherwise
 */
export async function isQuietHours(
  db: ExtendedPrismaClient,
  memberId: string,
): Promise<boolean> {
  const schedule = await db.memberSchedule.findUnique({
    where: { memberId },
    select: { quietStart: true, quietEnd: true, timezone: true },
  });

  if (!schedule || !schedule.quietStart || !schedule.quietEnd) {
    return false; // No quiet hours configured
  }

  const tz = schedule.timezone || 'UTC';
  const nowInTz = new TZDate(new Date(), tz);
  const currentMinutes = nowInTz.getHours() * 60 + nowInTz.getMinutes();

  const [startH, startM] = schedule.quietStart.split(':').map(Number);
  const [endH, endM] = schedule.quietEnd.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes <= endMinutes) {
    // Same-day span (e.g., 08:00-12:00)
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } else {
    // Overnight span (e.g., 22:00-07:00)
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
}

/** Backward-compatible alias for existing callers. */
export const deliverToPrivateSpace = deliverDM;
