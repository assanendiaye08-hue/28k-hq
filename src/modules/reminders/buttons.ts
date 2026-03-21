/**
 * Reminder Button Builders
 *
 * Action row builders for reminder DM messages.
 * Buttons use a `reminder:` namespace prefix for global handler routing.
 * High urgency reminders get an "Got it" button, recurring get "Skip Next".
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { BUTTON_IDS } from './constants.js';

/**
 * Build the button row for high urgency reminders.
 * "Got it" button (Success style) acknowledges and stops repeat DMs.
 */
export function buildHighUrgencyButtons(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(BUTTON_IDS.ACKNOWLEDGE)
      .setLabel('Got it')
      .setStyle(ButtonStyle.Success),
  );
}

/**
 * Build the button row for recurring reminders.
 * "Skip Next" button (Secondary style) skips the next occurrence only.
 */
export function buildRecurringButtons(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(BUTTON_IDS.SKIP_NEXT)
      .setLabel('Skip Next')
      .setStyle(ButtonStyle.Secondary),
  );
}

/**
 * Build the button row for recurring high urgency reminders.
 * Both "Got it" and "Skip Next" buttons in one row.
 */
export function buildRecurringHighUrgencyButtons(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(BUTTON_IDS.ACKNOWLEDGE)
      .setLabel('Got it')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(BUTTON_IDS.SKIP_NEXT)
      .setLabel('Skip Next')
      .setStyle(ButtonStyle.Secondary),
  );
}
