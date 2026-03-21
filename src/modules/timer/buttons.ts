/**
 * Timer Button Builders
 *
 * Action row builders for the timer DM message.
 * Buttons use a `timer:` namespace prefix for global handler routing.
 * Each timer state (working, break, paused) has its own button set.
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';

/**
 * Button custom IDs for timer interactions.
 * All prefixed with `timer:` for routing in the global button handler.
 */
export const BUTTON_IDS = {
  PAUSE: 'timer:pause',
  RESUME: 'timer:resume',
  STOP: 'timer:stop',
  SKIP_BREAK: 'timer:skip_break',
} as const;

/**
 * Build the button row shown during a work interval.
 * Pause (Secondary) + Stop (Danger)
 */
export function buildWorkButtons(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(BUTTON_IDS.PAUSE)
      .setLabel('Pause')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(BUTTON_IDS.STOP)
      .setLabel('Stop')
      .setStyle(ButtonStyle.Danger),
  );
}

/**
 * Build the button row shown during a break interval.
 * Skip Break (Primary) + Stop (Danger)
 */
export function buildBreakButtons(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(BUTTON_IDS.SKIP_BREAK)
      .setLabel('Skip Break')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(BUTTON_IDS.STOP)
      .setLabel('Stop')
      .setStyle(ButtonStyle.Danger),
  );
}

/**
 * Build the button row shown when the timer is paused.
 * Resume (Success) + Stop (Danger)
 */
export function buildPausedButtons(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(BUTTON_IDS.RESUME)
      .setLabel('Resume')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(BUTTON_IDS.STOP)
      .setLabel('Stop')
      .setStyle(ButtonStyle.Danger),
  );
}
