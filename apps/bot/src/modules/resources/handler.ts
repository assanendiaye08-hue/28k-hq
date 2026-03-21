/**
 * Resource Post Handler
 *
 * Detects messages posted in resource channels (tech-resources,
 * business-resources, growth-resources). For each resource post:
 *
 * 1. Reacts with link emoji (acknowledgement)
 * 2. Creates a discussion thread (keeps channel clean)
 * 3. Awards 15 XP with 4-hour cooldown (incentivizes sharing)
 * 4. Fire-and-forget AI tagging (updates thread name with topic)
 *
 * Cooldown: 4 hours per member (prevents spam across all resource channels).
 */

import type { Message, TextChannel } from 'discord.js';
import { ThreadAutoArchiveDuration } from 'discord.js';
import type { ExtendedPrismaClient } from '@28k/db';
import type { IEventBus } from '../../shared/types.js';
import { awardXP } from '@28k/shared';
import { XP_AWARDS } from '@28k/shared';
import { RESOURCE_CHANNELS, RESOURCE_EMOJI, THREAD_WELCOME } from './constants.js';
import { extractResourceTags } from './tagger.js';

/** Cooldown map: memberId -> last award timestamp. */
const cooldowns = new Map<string, number>();

/**
 * Check if a member is on cooldown for resource sharing.
 */
function isOnCooldown(memberId: string): boolean {
  const lastAward = cooldowns.get(memberId);
  if (!lastAward) return false;
  return Date.now() - lastAward < XP_AWARDS.resourceShareCooldownMs;
}

/**
 * Set cooldown for a member after resource share XP award.
 */
function setCooldown(memberId: string): void {
  cooldowns.set(memberId, Date.now());
}

/**
 * Truncate a string to a maximum length, adding ellipsis if needed.
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Handle a message posted in a resource channel.
 *
 * Reacts with emoji, creates discussion thread, awards XP with cooldown,
 * and fires off async AI tagging to update the thread name.
 */
export async function handleResourcePost(
  message: Message,
  db: ExtendedPrismaClient,
  events: IEventBus,
): Promise<void> {
  // Ignore bot messages
  if (message.author.bot) return;

  // Only process guild messages
  if (!message.guild) return;

  // Check if this is a resource channel
  const channel = message.channel as TextChannel;
  const channelName = channel.name;

  if (!RESOURCE_CHANNELS.includes(channelName as typeof RESOURCE_CHANNELS[number])) {
    return; // Not a resource channel
  }

  // Resolve internal member from Discord account
  const account = await db.discordAccount.findUnique({
    where: { discordId: message.author.id },
  });
  if (!account) return; // Not a registered member

  const memberId = account.memberId;

  // React with link emoji -- acknowledgement regardless of cooldown
  try {
    await message.react(RESOURCE_EMOJI);
  } catch {
    // Reaction failed (permissions, etc.) -- continue anyway
  }

  // Create discussion thread
  const firstLine = message.content.split('\n')[0] || 'Resource';
  const threadName = 'Discuss: ' + truncate(firstLine, 80);

  let thread;
  try {
    thread = await message.startThread({
      name: threadName,
      autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
      reason: 'Auto-thread for resource discussion',
    });

    await thread.send(THREAD_WELCOME);
  } catch {
    // Thread creation failed -- continue (XP can still be awarded)
  }

  // Award XP if not on cooldown
  if (!isOnCooldown(memberId)) {
    const result = await awardXP(
      db,
      memberId,
      XP_AWARDS.resourceShare,
      'RESOURCE_SHARE',
      `Resource shared in #${channelName}`,
    );

    setCooldown(memberId);

    // Emit event for leaderboard refresh etc.
    events.emit('resourceShared', memberId, message.id);

    // Emit levelUp if detected
    if (result.leveledUp) {
      events.emit('levelUp', memberId, result.newRank!, result.oldRank!, result.newTotal);
    }
  }

  // Fire-and-forget: AI tagging to update thread name with extracted topic
  if (thread) {
    extractResourceTags(db, message.content)
      .then(async (tags) => {
        if (tags.topic && tags.topic !== 'Resource') {
          try {
            await thread.setName('Discuss: ' + truncate(tags.topic, 80));
          } catch {
            // Thread name update failed -- silent
          }
        }
      })
      .catch(() => {
        // AI tagging failed entirely -- silent, thread keeps original name
      });
  }
}
