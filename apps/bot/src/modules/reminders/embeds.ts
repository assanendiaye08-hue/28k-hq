/**
 * Reminder Embeds
 *
 * Display builders for reminder DM messages.
 * Low urgency: plain text (no embed overhead).
 * High urgency: red accent embed with timestamp for visual distinction.
 * Delayed: suffix for reminders fired after bot restart.
 */

import { EmbedBuilder } from 'discord.js';
import { BRAND_COLORS } from '@28k/shared';

/**
 * Build plain text content for a low urgency reminder.
 * No embed -- keeps the DM lightweight and unobtrusive.
 */
export function buildLowUrgencyContent(content: string): string {
  return `Reminder: ${content}`;
}

/**
 * Build a visually distinct embed for a high urgency reminder.
 * Uses error/red color for attention, includes timestamp.
 */
export function buildHighUrgencyEmbed(content: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(BRAND_COLORS.error)
    .setTitle('Urgent Reminder')
    .setDescription(content)
    .setTimestamp();
}

/**
 * Build plain text content for a delayed reminder (missed during downtime).
 * Suffix "(delayed)" signals the reminder fired late due to bot restart.
 */
export function buildDelayedReminderContent(content: string): string {
  return `Reminder (delayed): ${content}`;
}
