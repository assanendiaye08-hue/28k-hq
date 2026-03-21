/**
 * Welcome channel content -- the hustler manifesto and server overview.
 *
 * This embed is sent to #welcome when the bot sets up the server.
 * It introduces new members to the server's purpose, explains the mechanics
 * (XP, ranks, private space, AI), and tells them to run /setup.
 *
 * The tone is real talk, not corporate motivational poster energy.
 */

import { type TextChannel } from 'discord.js';
import { brandEmbed } from '../../shared/embeds.js';

/**
 * Send the welcome manifesto embed to #welcome.
 *
 * @param channel - The #welcome text channel
 */
export async function sendWelcomeMessage(channel: TextChannel): Promise<void> {
  const embed = brandEmbed(
    'Welcome to the Grind',
    `This server isn't about watching from the sidelines. You're here because you're building something.\n\n` +
    `Whether it's a business, a skill, or a side hustle -- this is where you show up, put in work, and level up.\n\n` +
    `No fluff. No "rise and grind" motivation posts. Just a group of people actually doing the work and holding each other accountable.`,
  );

  embed.addFields(
    {
      name: 'How It Works',
      value:
        '**Check in daily** to track your progress and earn XP.\n' +
        '**Level up** through the ranks: Rookie -> Grinder -> Hustler -> Boss -> Mogul -> Legend.\n' +
        '**Compete** on leaderboards -- hours locked in, streaks, wins.',
      inline: false,
    },
    {
      name: 'Your Private Space',
      value:
        'After setup, you get a personal space (DM or private channel) where your AI assistant lives. ' +
        'It tracks your goals, sends daily briefs, and keeps you locked in.',
      inline: false,
    },
    {
      name: 'Get Started',
      value: 'Type `/setup` **right here in this channel** to create your profile, choose your space, and unlock the server.',
      inline: false,
    },
  );

  embed.setFooter({ text: 'Type /setup in this channel to get started' });

  await channel.send({ embeds: [embed] });
}
