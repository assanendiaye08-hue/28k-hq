/**
 * Reminder Delivery Backend
 *
 * Pluggable delivery interface for reminder notifications.
 * The DiscordReminderDelivery implementation sends DMs via the notification
 * router for routing flexibility, with a direct-DM fallback for high urgency
 * reminders where we need the message ID for acknowledgment tracking.
 *
 * Designed so Apple ecosystem (APNs, Shortcuts) can be added later by
 * implementing ReminderDeliveryBackend without touching the scheduler.
 */

import type { ActionRowBuilder, ButtonBuilder, Client, Message } from 'discord.js';
import type { ExtendedPrismaClient } from '../../db/client.js';
import { deliverNotification } from '../notification-router/router.js';
import { buildLowUrgencyContent, buildHighUrgencyEmbed, buildDelayedReminderContent } from './embeds.js';

/**
 * Backend interface for delivering reminders.
 * Each platform (Discord, APNs, etc.) implements this contract.
 */
export interface ReminderDeliveryBackend {
  deliver(
    memberId: string,
    content: string,
    urgency: 'LOW' | 'HIGH',
    options?: {
      buttons?: ActionRowBuilder<ButtonBuilder>;
      isDelayed?: boolean;
    },
  ): Promise<{ messageId: string | null; success: boolean }>;
}

/**
 * Discord DM delivery backend for reminders.
 *
 * Low urgency: plain text via deliverNotification (routed to preferred account).
 * High urgency: direct DM to get Message object back for acknowledgment tracking.
 * Falls back to deliverNotification if direct DM fails.
 */
export class DiscordReminderDelivery implements ReminderDeliveryBackend {
  constructor(
    private readonly client: Client,
    private readonly db: ExtendedPrismaClient,
  ) {}

  async deliver(
    memberId: string,
    content: string,
    urgency: 'LOW' | 'HIGH',
    options?: {
      buttons?: ActionRowBuilder<ButtonBuilder>;
      isDelayed?: boolean;
    },
  ): Promise<{ messageId: string | null; success: boolean }> {
    try {
      if (urgency === 'HIGH') {
        return await this.deliverHighUrgency(memberId, content, options);
      }
      return await this.deliverLowUrgency(memberId, content, options);
    } catch (error) {
      console.warn(`[Reminders] Failed to deliver reminder to member ${memberId}:`, error);
      return { messageId: null, success: false };
    }
  }

  /**
   * Low urgency: plain text via notification router.
   * No need for message ID -- low urgency doesn't repeat.
   */
  private async deliverLowUrgency(
    memberId: string,
    content: string,
    options?: {
      buttons?: ActionRowBuilder<ButtonBuilder>;
      isDelayed?: boolean;
    },
  ): Promise<{ messageId: string | null; success: boolean }> {
    const text = options?.isDelayed
      ? buildDelayedReminderContent(content)
      : buildLowUrgencyContent(content);

    const deliveryContent: Record<string, unknown> = { content: text };
    if (options?.buttons) {
      deliveryContent.components = [options.buttons];
    }

    const success = await deliverNotification(
      this.client,
      this.db,
      memberId,
      'reminder',
      deliveryContent as Parameters<typeof deliverNotification>[4],
    );

    return { messageId: null, success };
  }

  /**
   * High urgency: direct DM to get the Message object back.
   * We need the message ID so the scheduler can track acknowledgment
   * and stop repeat DMs when the member clicks "Got it".
   *
   * Falls back to deliverNotification if direct DM fails.
   */
  private async deliverHighUrgency(
    memberId: string,
    content: string,
    options?: {
      buttons?: ActionRowBuilder<ButtonBuilder>;
      isDelayed?: boolean;
    },
  ): Promise<{ messageId: string | null; success: boolean }> {
    const embed = buildHighUrgencyEmbed(content);

    // Try direct DM to get message ID back
    try {
      const account = await this.db.discordAccount.findFirst({
        where: { memberId },
      });

      if (account) {
        const user = await this.client.users.fetch(account.discordId);
        const sendPayload: Record<string, unknown> = { embeds: [embed] };
        if (options?.buttons) {
          sendPayload.components = [options.buttons];
        }
        const message = await user.send(sendPayload) as Message;
        return { messageId: message.id, success: true };
      }
    } catch {
      // Direct DM failed -- fall back to notification router
    }

    // Fallback: use notification router (no message ID available)
    const deliveryContent: Record<string, unknown> = { embeds: [embed] };
    if (options?.buttons) {
      deliveryContent.components = [options.buttons];
    }

    const success = await deliverNotification(
      this.client,
      this.db,
      memberId,
      'reminder',
      deliveryContent as Parameters<typeof deliverNotification>[4],
    );

    return { messageId: null, success };
  }
}
