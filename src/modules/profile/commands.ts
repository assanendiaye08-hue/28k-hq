/**
 * /profile command handler.
 *
 * - /profile (no args): Show the calling member's own full profile.
 *   Includes all tags, visibility settings, member since date, linked accounts count.
 *   Has an "Edit Visibility" button that opens a select menu to toggle fields.
 *
 * - /profile @user: Show the mentioned member's PUBLIC profile only.
 *   Uses getPublicProfile to filter fields.
 *
 * Also integrates with onboarding: if structured tags are empty but rawAnswers
 * exist, triggers lazy AI tag extraction on first profile view.
 */

import {
  type ChatInputCommandInteraction,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
} from 'discord.js';
import type { ModuleContext } from '../../shared/types.js';
import type { ExtendedPrismaClient } from '../../db/client.js';
import { profileEmbed, errorEmbed, successEmbed } from '../../shared/embeds.js';
import {
  getPublicProfile,
  updateVisibility,
  getValidProfileFields,
  DEFAULT_PUBLIC_FIELDS,
} from './visibility.js';
import { extractProfileTags } from './ai-tags.js';
import { syncInterestTags } from '../server-setup/interest-tags.js';

/**
 * Handle the /profile command.
 */
export async function profileCommand(
  interaction: ChatInputCommandInteraction,
  ctx: ModuleContext,
): Promise<void> {
  const db = ctx.db as ExtendedPrismaClient;

  await interaction.deferReply({
    flags: MessageFlags.Ephemeral,
  });

  const targetUser = interaction.options.getUser('user');

  if (targetUser) {
    // Viewing another member's public profile
    await showPublicProfile(interaction, db, targetUser.id);
  } else {
    // Viewing own full profile
    await showOwnProfile(interaction, db, ctx);
  }
}

/**
 * Show the calling member's own full profile with edit controls.
 */
async function showOwnProfile(
  interaction: ChatInputCommandInteraction,
  db: ExtendedPrismaClient,
  ctx: ModuleContext,
): Promise<void> {
  const discordId = interaction.user.id;

  // Look up the member via their Discord account
  const account = await db.discordAccount.findUnique({
    where: { discordId },
    include: {
      member: {
        include: {
          profile: true,
          accounts: true,
        },
      },
    },
  });

  if (!account?.member) {
    await interaction.editReply({
      embeds: [
        errorEmbed(
          'Profile Not Found',
          'You need to run `/setup` first to create your profile.',
        ),
      ],
    });
    return;
  }

  const { member } = account;
  const profile = member.profile;

  if (!profile) {
    await interaction.editReply({
      embeds: [
        errorEmbed(
          'No Profile',
          'Your profile hasn\'t been set up yet. Run `/setup` to get started.',
        ),
      ],
    });
    return;
  }

  // Lazy tag extraction: if structured tags are empty but rawAnswers exist
  if (
    profile.interests.length === 0 &&
    profile.goals.length === 0 &&
    profile.rawAnswers &&
    profile.rawAnswers.length > 0
  ) {
    try {
      const rawAnswers = JSON.parse(profile.rawAnswers) as Record<string, string>;
      const tags = await extractProfileTags(db, member.id, rawAnswers);

      await db.memberProfile.update({
        where: { memberId: member.id },
        data: {
          interests: tags.interests,
          currentFocus: tags.currentFocus,
          goals: tags.goals,
          learningAreas: tags.learningAreas,
          workStyle: tags.workStyle,
        },
      });

      // Sync interest tags as Discord roles
      if (interaction.guild) {
        await syncInterestTags(interaction.guild, db, member.id, tags.interests);
      }

      // Reload profile with extracted tags
      Object.assign(profile, {
        interests: tags.interests,
        currentFocus: tags.currentFocus,
        goals: tags.goals,
        learningAreas: tags.learningAreas,
        workStyle: tags.workStyle,
      });
    } catch (error) {
      ctx.logger.error('Lazy tag extraction failed during /profile:', error);
      // Continue showing profile without tags -- not a blocking error
    }
  }

  // Build the profile embed
  const embed = profileEmbed(member.displayName)
    .setDescription('Your full profile')
    .addFields(
      {
        name: 'Interests',
        value: profile.interests.length > 0 ? profile.interests.join(', ') : '*Not set*',
        inline: true,
      },
      {
        name: 'Current Focus',
        value: profile.currentFocus || '*Not set*',
        inline: true,
      },
      {
        name: 'Work Style',
        value: profile.workStyle || '*Not set*',
        inline: true,
      },
      {
        name: 'Goals',
        value: profile.goals.length > 0 ? profile.goals.join(', ') : '*Not set*',
        inline: true,
      },
      {
        name: 'Learning Areas',
        value: profile.learningAreas.length > 0 ? profile.learningAreas.join(', ') : '*Not set*',
        inline: true,
      },
      {
        name: 'Visibility',
        value: profile.publicFields.length > 0
          ? profile.publicFields.map((f) => `\`${f}\``).join(', ')
          : '*All fields private*',
        inline: false,
      },
      {
        name: 'Member Since',
        value: `<t:${Math.floor(member.createdAt.getTime() / 1000)}:R>`,
        inline: true,
      },
      {
        name: 'Linked Accounts',
        value: `${member.accounts.length}`,
        inline: true,
      },
    );

  // Edit Visibility button
  const editButton = new ButtonBuilder()
    .setCustomId('profile_edit_visibility')
    .setLabel('Edit Visibility')
    .setStyle(ButtonStyle.Secondary);

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(editButton);

  const response = await interaction.editReply({
    embeds: [embed],
    components: [buttonRow],
  });

  // Collect button interaction (60 second timeout)
  try {
    const buttonInteraction = await response.awaitMessageComponent({
      componentType: ComponentType.Button,
      filter: (i) => i.user.id === interaction.user.id && i.customId === 'profile_edit_visibility',
      time: 60_000,
    });

    // Show the visibility select menu
    const fields = getValidProfileFields();
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('profile_visibility_select')
      .setPlaceholder('Select which fields to make public')
      .setMinValues(0)
      .setMaxValues(fields.length)
      .addOptions(
        fields.map((field) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(formatFieldName(field))
            .setValue(field)
            .setDescription(`Make ${formatFieldName(field)} visible to others`)
            .setDefault(profile.publicFields.includes(field)),
        ),
      );

    const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    await buttonInteraction.update({
      content: 'Select which fields should be visible to other members:',
      components: [selectRow],
    });

    // Collect select menu interaction (60 second timeout)
    const selectInteraction = await response.awaitMessageComponent({
      componentType: ComponentType.StringSelect,
      filter: (i) =>
        i.user.id === interaction.user.id && i.customId === 'profile_visibility_select',
      time: 60_000,
    });

    const selectedFields = selectInteraction.values;

    await updateVisibility(db, member.id, selectedFields);

    await selectInteraction.update({
      embeds: [
        successEmbed(
          'Visibility Updated',
          selectedFields.length > 0
            ? `Public fields: ${selectedFields.map((f) => `\`${f}\``).join(', ')}`
            : 'All profile fields are now private.',
        ),
      ],
      components: [],
      content: '',
    });
  } catch {
    // Timeout or user didn't interact -- remove button to keep UI clean
    try {
      await interaction.editReply({ components: [] });
    } catch {
      // Message may have been deleted -- ignore
    }
  }
}

/**
 * Show another member's public profile.
 */
async function showPublicProfile(
  interaction: ChatInputCommandInteraction,
  db: ExtendedPrismaClient,
  targetDiscordId: string,
): Promise<void> {
  // Look up the target member via their Discord account
  const account = await db.discordAccount.findUnique({
    where: { discordId: targetDiscordId },
    include: {
      member: {
        include: {
          profile: true,
        },
      },
    },
  });

  if (!account?.member) {
    await interaction.editReply({
      embeds: [
        errorEmbed(
          'Member Not Found',
          'That user hasn\'t set up their profile yet.',
        ),
      ],
    });
    return;
  }

  const { member } = account;
  const profile = member.profile;

  if (!profile) {
    await interaction.editReply({
      embeds: [
        profileEmbed(member.displayName).setDescription(
          'This member hasn\'t completed their profile yet.',
        ),
      ],
    });
    return;
  }

  // Get only the public fields
  const publicProfile = getPublicProfile(profile);

  const embed = profileEmbed(member.displayName);

  // Check if there are any public fields to show
  const publicFieldEntries = Object.entries(publicProfile).filter(
    ([, value]) => value !== undefined && value !== null,
  );

  if (publicFieldEntries.length === 0) {
    embed.setDescription('This member keeps their profile private.');
  } else {
    embed.setDescription('Public profile');

    for (const [field, value] of publicFieldEntries) {
      const displayValue = Array.isArray(value)
        ? (value as string[]).length > 0
          ? (value as string[]).join(', ')
          : '*Not set*'
        : (value as string) || '*Not set*';

      embed.addFields({
        name: formatFieldName(field),
        value: displayValue,
        inline: true,
      });
    }
  }

  embed.addFields({
    name: 'Member Since',
    value: `<t:${Math.floor(member.createdAt.getTime() / 1000)}:R>`,
    inline: true,
  });

  await interaction.editReply({ embeds: [embed] });
}

/**
 * Format a camelCase field name into a human-readable label.
 * e.g. "learningAreas" -> "Learning Areas"
 */
function formatFieldName(field: string): string {
  return field
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}
