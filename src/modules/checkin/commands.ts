/**
 * /checkin slash command handler.
 *
 * Flow:
 * 1. deferReply (ephemeral) -- Discord requires response within 3 seconds
 * 2. Look up member by Discord ID
 * 3. Get timezone from MemberSchedule (default UTC)
 * 4. Count today's check-ins for diminishing XP
 * 5. AI category extraction via OpenRouter
 * 6. Create CheckIn record (content encrypted by Prisma extension)
 * 7. Update streak (flexible scoring with grace days)
 * 8. Calculate and award XP (diminishing returns + streak multiplier)
 * 9. Reply with success embed (ephemeral)
 * 10. Also deliver to private space for history
 */

import {
  SlashCommandBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { TZDate } from '@date-fns/tz';
import { startOfDay } from 'date-fns';
import type { ModuleContext } from '../../shared/types.js';
import type { ExtendedPrismaClient } from '../../db/client.js';
import { successEmbed, errorEmbed } from '../../shared/embeds.js';
import { deliverNotification } from '../notification-router/router.js';
import { awardXP, calculateCheckinXP } from '../xp/engine.js';
import { extractCategories } from './ai-categories.js';
import { updateStreak } from './streak.js';

/**
 * Build the /checkin slash command definition.
 */
export function buildCheckinCommand(): SlashCommandBuilder {
  const cmd = new SlashCommandBuilder()
    .setName('checkin')
    .setDescription('Log what you did today');

  cmd.addStringOption((opt) =>
    opt
      .setName('activity')
      .setDescription('What did you do today?')
      .setRequired(true),
  );

  cmd.addIntegerOption((opt) =>
    opt
      .setName('effort')
      .setDescription('How hard did you push? (1-5)')
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(5),
  );

  return cmd;
}

/**
 * Register the /checkin command with the module context.
 */
export function registerCheckinCommands(ctx: ModuleContext): void {
  ctx.commands.register('checkin', buildCheckinCommand(), handleCheckin);
}

/**
 * Handle the /checkin interaction.
 */
async function handleCheckin(
  interaction: ChatInputCommandInteraction,
  ctx: ModuleContext,
): Promise<void> {
  const db = ctx.db as ExtendedPrismaClient;
  const { client, events, logger } = ctx;

  // 1. Defer reply immediately (ephemeral -- check-ins are private)
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // 2. Look up member by Discord ID
  const discordId = interaction.user.id;
  const account = await db.discordAccount.findUnique({
    where: { discordId },
    include: { member: true },
  });

  if (!account) {
    await interaction.editReply({
      embeds: [errorEmbed('Not set up', 'Run /setup first to create your profile.')],
    });
    return;
  }

  const member = account.member;
  const memberId = member.id;

  // 3. Get timezone from MemberSchedule (default UTC)
  const schedule = await db.memberSchedule.findUnique({
    where: { memberId },
  });
  const timezone = schedule?.timezone ?? 'UTC';

  // 4. Count today's check-ins for this member (in their timezone)
  const now = new TZDate(new Date(), timezone);
  const todayStart = startOfDay(now);

  const todayCheckIns = await db.checkIn.count({
    where: {
      memberId,
      createdAt: { gte: todayStart },
    },
  });
  const dayIndex = todayCheckIns + 1; // 1-indexed (this will be the Nth check-in today)

  // 5. AI category extraction
  const activityText = interaction.options.getString('activity', true);
  const effortRating = interaction.options.getInteger('effort');
  const { categories } = await extractCategories(db, memberId, activityText);

  // 6. Create CheckIn record (content encrypted by Prisma extension)
  const checkIn = await db.checkIn.create({
    data: {
      memberId,
      content: activityText,
      effortRating,
      categories,
      dayIndex,
    },
  });

  // 7. Update streak
  const streakResult = await updateStreak(db, memberId, timezone);

  // 8. Calculate XP
  const checkinXP = calculateCheckinXP(dayIndex, streakResult.multiplier);
  let totalXPAwarded = checkinXP;

  // Award check-in XP
  const xpResult = await awardXP(
    db,
    memberId,
    checkinXP,
    'CHECKIN',
    `Check-in #${dayIndex} (${categories.join(', ')})`,
  );

  // Emit xpAwarded event
  events.emit('xpAwarded', memberId, checkinXP, xpResult.newTotal, 'CHECKIN');

  // Handle level-up
  if (xpResult.leveledUp && xpResult.newRank && xpResult.oldRank) {
    events.emit('levelUp', memberId, xpResult.newRank, xpResult.oldRank, xpResult.newTotal);
  }

  // Award streak bonus if applicable (comeback bonus)
  if (streakResult.streakBonus > 0) {
    const streakBonusResult = await awardXP(
      db,
      memberId,
      streakResult.streakBonus,
      'STREAK_BONUS',
      `Comeback bonus (+${streakResult.streakBonus} XP)`,
    );
    totalXPAwarded += streakResult.streakBonus;
    events.emit('xpAwarded', memberId, streakResult.streakBonus, streakBonusResult.newTotal, 'STREAK_BONUS');

    if (streakBonusResult.leveledUp && streakBonusResult.newRank && streakBonusResult.oldRank) {
      events.emit('levelUp', memberId, streakBonusResult.newRank, streakBonusResult.oldRank, streakBonusResult.newTotal);
    }
  }

  // Award streak milestone bonus if applicable
  if (streakResult.milestoneBonus > 0) {
    const milestoneResult = await awardXP(
      db,
      memberId,
      streakResult.milestoneBonus,
      'STREAK_BONUS',
      `${streakResult.milestoneDays}-day streak milestone!`,
    );
    totalXPAwarded += streakResult.milestoneBonus;
    events.emit('xpAwarded', memberId, streakResult.milestoneBonus, milestoneResult.newTotal, 'STREAK_BONUS');

    if (milestoneResult.leveledUp && milestoneResult.newRank && milestoneResult.oldRank) {
      events.emit('levelUp', memberId, milestoneResult.newRank, milestoneResult.oldRank, milestoneResult.newTotal);
    }
  }

  // 9. Emit checkinComplete event
  events.emit('checkinComplete', memberId, checkIn.id, dayIndex);

  // 10. Update CheckIn with XP awarded
  await db.checkIn.update({
    where: { id: checkIn.id },
    data: { xpAwarded: totalXPAwarded },
  });

  // 11. Build response embed
  const embed = successEmbed('Check-in logged');

  embed.addFields(
    { name: 'Categories', value: categories.join(', '), inline: true },
    {
      name: 'XP Earned',
      value: streakResult.multiplier > 1.0
        ? `+${totalXPAwarded} XP (${streakResult.multiplier.toFixed(1)}x streak)`
        : `+${totalXPAwarded} XP`,
      inline: true,
    },
    {
      name: 'Streak',
      value: `${streakResult.currentStreak} days (${streakResult.multiplier.toFixed(1)}x)`,
      inline: true,
    },
  );

  if (effortRating) {
    embed.addFields({ name: 'Effort', value: `${'*'.repeat(effortRating)}/5`, inline: true });
  }

  if (dayIndex > 1) {
    embed.setFooter({ text: `Check-in #${dayIndex} today (reduced XP)` });
  }

  if (streakResult.isComeback) {
    embed.addFields({
      name: 'Welcome back!',
      value: `+${streakResult.streakBonus} comeback XP`,
      inline: false,
    });
  }

  if (streakResult.milestoneBonus > 0 && streakResult.milestoneDays) {
    embed.addFields({
      name: 'Streak Milestone!',
      value: `${streakResult.milestoneDays}-day streak! +${streakResult.milestoneBonus} bonus XP`,
      inline: false,
    });
  }

  if (xpResult.leveledUp && xpResult.newRank) {
    embed.addFields({
      name: 'Level Up!',
      value: `You just hit **${xpResult.newRank}**!`,
      inline: false,
    });
  }

  // 12. Reply (ephemeral)
  await interaction.editReply({ embeds: [embed] });

  // 13. Also send to private space for history
  try {
    await deliverNotification(client, db, memberId, 'general', { embeds: [embed] });
  } catch (error) {
    logger.warn(`Could not deliver check-in to private space for ${memberId}: ${String(error)}`);
  }
}
