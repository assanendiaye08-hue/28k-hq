import { EmbedBuilder } from 'discord.js';
import { BRAND_COLORS } from '@28k/shared';

/**
 * Create a success embed (green) for positive outcomes.
 */
export function successEmbed(title: string, description?: string): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(BRAND_COLORS.success)
    .setTitle(title)
    .setTimestamp();

  if (description) {
    embed.setDescription(description);
  }

  return embed;
}

/**
 * Create an error embed (red) for failures and warnings.
 */
export function errorEmbed(title: string, description?: string): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(BRAND_COLORS.error)
    .setTitle(title)
    .setTimestamp();

  if (description) {
    embed.setDescription(description);
  }

  return embed;
}

/**
 * Create an info embed (blue) for informational messages.
 */
export function infoEmbed(title: string, description?: string): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(BRAND_COLORS.info)
    .setTitle(title)
    .setTimestamp();

  if (description) {
    embed.setDescription(description);
  }

  return embed;
}

/**
 * Create a profile embed (amber/gold) for member profile displays.
 */
export function profileEmbed(displayName: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(BRAND_COLORS.profile)
    .setTitle(displayName)
    .setTimestamp();
}

/**
 * Create a branded embed with the hustler gold color.
 * Use for general bot messages that represent the brand.
 */
export function brandEmbed(title: string, description?: string): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(BRAND_COLORS.primary)
    .setTitle(title)
    .setTimestamp();

  if (description) {
    embed.setDescription(description);
  }

  return embed;
}
