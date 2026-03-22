/**
 * Session Embeds
 *
 * Embeds for session announcements, invitations, and summaries.
 * Kept brief and clean -- no walls of text.
 */

import { EmbedBuilder, channelMention } from 'discord.js';
import { BRAND_COLORS } from '@28k/shared';
import { VOICE_PROMO_LINE } from './constants.js';

/**
 * Build an announcement embed for a session (posted in #sessions or DM).
 */
export function buildSessionAnnouncementEmbed(
  title: string,
  creatorName: string,
  visibility: string,
  scheduledFor?: Date,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(BRAND_COLORS.primary)
    .setTitle(`\u{1F3A7} Lock-In: ${title}`)
    .setDescription(
      scheduledFor
        ? `**${creatorName}** scheduled a ${visibility.toLowerCase()} session for <t:${Math.floor(scheduledFor.getTime() / 1000)}:F>.`
        : `**${creatorName}** started a ${visibility.toLowerCase()} session. Jump in!`,
    )
    .addFields({ name: 'Why join?', value: VOICE_PROMO_LINE })
    .setTimestamp();

  if (visibility === 'PUBLIC') {
    embed.setFooter({ text: 'Join the voice channel to lock in' });
  }

  return embed;
}

/**
 * Build an invite embed DM'd to an invitee.
 */
export function buildSessionInviteEmbed(
  title: string,
  creatorName: string,
  voiceChannelId: string,
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(BRAND_COLORS.info)
    .setTitle(`You're invited to lock in`)
    .setDescription(
      `**${creatorName}** invited you to a session: **${title}**\n\n` +
      `Join here: ${channelMention(voiceChannelId)}`,
    )
    .setTimestamp();
}

/**
 * Build a summary embed posted when a session ends.
 */
export function buildSessionSummaryEmbed(
  title: string,
  creatorName: string,
  durationMinutes: number,
  participantNames: string[],
  topic: string,
): EmbedBuilder {
  const hours = Math.floor(durationMinutes / 60);
  const mins = durationMinutes % 60;
  const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  const participantList = participantNames.length > 0
    ? participantNames.join(', ')
    : 'Solo session';

  const participantCount = participantNames.length || 1;
  const totalFocusedMinutes = participantCount * durationMinutes;
  const collectiveImpact = `${participantCount} ${participantCount === 1 ? 'person' : 'people'} x ${durationMinutes}m = **${totalFocusedMinutes} focused minutes**`;

  return new EmbedBuilder()
    .setColor(BRAND_COLORS.success)
    .setTitle(`Session Complete: ${title}`)
    .setDescription(`**${creatorName}** locked in for **${timeStr}**.`)
    .addFields(
      { name: 'Topic', value: topic || title, inline: true },
      { name: 'Attendees', value: participantList, inline: true },
      { name: 'Duration', value: timeStr, inline: true },
      { name: 'Collective Impact', value: collectiveImpact },
    )
    .setTimestamp();
}
