/**
 * Wins/Lessons Message Handler
 *
 * Detects messages posted in #wins and #lessons channels.
 * Reacts with emoji, awards XP with cooldown, emits events.
 *
 * Cooldown: 2 hours per type per member. If on cooldown, the bot
 * still reacts (acknowledgement) but doesn't award duplicate XP.
 */

import type { Client, Message, TextChannel } from 'discord.js';
import type { ExtendedPrismaClient } from '../../db/client.js';
import type { IEventBus } from '../../shared/types.js';
import { awardXP } from '../xp/engine.js';
import { XP_AWARDS } from '../xp/constants.js';
import {
  WINS_CHANNEL_NAME,
  LESSONS_CHANNEL_NAME,
  WIN_EMOJI,
  LESSON_EMOJI,
} from './constants.js';

/** Cooldown map: memberId -> type ('win'|'lesson') -> last award timestamp. */
const cooldowns = new Map<string, Map<string, number>>();

/**
 * Check if a member is on cooldown for a specific type.
 */
function isOnCooldown(memberId: string, type: string): boolean {
  const memberCooldowns = cooldowns.get(memberId);
  if (!memberCooldowns) return false;

  const lastAward = memberCooldowns.get(type);
  if (!lastAward) return false;

  return Date.now() - lastAward < XP_AWARDS.winsLessonsCooldownMs;
}

/**
 * Set cooldown for a member and type.
 */
function setCooldown(memberId: string, type: string): void {
  if (!cooldowns.has(memberId)) {
    cooldowns.set(memberId, new Map());
  }
  cooldowns.get(memberId)!.set(type, Date.now());
}

/**
 * Handle a message in #wins or #lessons.
 * React with emoji, award XP if not on cooldown, emit events.
 */
export async function handleWinsLessonsMessage(
  message: Message,
  db: ExtendedPrismaClient,
  events: IEventBus,
  client: Client,
): Promise<void> {
  // Ignore bot messages
  if (message.author.bot) return;

  // Only process guild messages
  if (!message.guild) return;

  // Determine if this is a #wins or #lessons channel by name
  const channel = message.channel as TextChannel;
  const channelName = channel.name;

  let type: 'win' | 'lesson';
  let emoji: string;
  let xpAmount: number;
  let source: 'WIN_POST' | 'LESSON_POST';

  if (channelName === WINS_CHANNEL_NAME) {
    type = 'win';
    emoji = WIN_EMOJI;
    xpAmount = XP_AWARDS.win;
    source = 'WIN_POST';
  } else if (channelName === LESSONS_CHANNEL_NAME) {
    type = 'lesson';
    emoji = LESSON_EMOJI;
    xpAmount = XP_AWARDS.lesson;
    source = 'LESSON_POST';
  } else {
    return; // Not a tracked channel
  }

  // Resolve internal member from Discord account
  const account = await db.discordAccount.findUnique({
    where: { discordId: message.author.id },
  });
  if (!account) return; // Not a registered member

  const memberId = account.memberId;

  // Always react -- acknowledgement regardless of cooldown
  try {
    await message.react(emoji);
  } catch {
    // Reaction failed (permissions, etc.) -- continue anyway
  }

  // Check cooldown before awarding XP
  if (isOnCooldown(memberId, type)) {
    return; // Already reacted, just skip XP
  }

  // Award XP
  const result = await awardXP(
    db,
    memberId,
    xpAmount,
    source,
    `${type === 'win' ? 'Win' : 'Lesson'} shared in #${channelName}`,
  );

  // Set cooldown
  setCooldown(memberId, type);

  // Emit event
  if (type === 'win') {
    events.emit('winPosted', memberId, message.id);
  } else {
    events.emit('lessonPosted', memberId, message.id);
  }

  // Emit levelUp if detected
  if (result.leveledUp) {
    events.emit('levelUp', memberId, result.newRank!, result.oldRank!, result.newTotal);
  }
}
