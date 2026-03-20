/**
 * Profile module -- AI-powered member profiles with visibility controls.
 *
 * Provides:
 * - /profile command (view own or another member's profile)
 * - AI tag extraction from natural language profile answers
 * - Visibility control for profile fields
 * - Integration with interest tag role management
 *
 * Listens for:
 * - memberSetupComplete: triggers AI tag extraction + interest tag sync
 *   after a member finishes /setup (from the onboarding module)
 */

import { SlashCommandBuilder } from 'discord.js';
import type { Module, ModuleContext } from '../../shared/types.js';
import type { ExtendedPrismaClient } from '../../db/client.js';
import { profileCommand } from './commands.js';
import { extractProfileTags } from './ai-tags.js';
import { syncInterestTags } from '../server-setup/interest-tags.js';

const profileModule: Module = {
  name: 'profile',

  register(ctx: ModuleContext): void {
    // Register the /profile slash command
    const builder = new SlashCommandBuilder()
      .setName('profile')
      .setDescription('View or edit your profile')
      .addUserOption((opt) =>
        opt
          .setName('user')
          .setDescription("View another member's public profile")
          .setRequired(false),
      );

    ctx.commands.register('profile', builder as SlashCommandBuilder, profileCommand);

    // Listen for memberSetupComplete event to trigger AI tag extraction
    ctx.events.on('memberSetupComplete', (...args: unknown[]) => {
      const memberId = args[0] as string;
      const discordId = args[1] as string;

      // Fire and forget -- don't block the setup flow
      void handleSetupComplete(ctx, memberId, discordId);
    });

    ctx.logger.info('Profile module registered');
  },
};

/**
 * Handle the memberSetupComplete event.
 * Extracts AI tags from the member's raw answers and syncs interest tags.
 */
async function handleSetupComplete(
  ctx: ModuleContext,
  memberId: string,
  discordId: string,
): Promise<void> {
  const db = ctx.db as ExtendedPrismaClient;

  try {
    // Load the member's profile to get raw answers
    const profile = await db.memberProfile.findUnique({
      where: { memberId },
    });

    if (!profile?.rawAnswers) {
      ctx.logger.warn(`memberSetupComplete: No raw answers for member ${memberId}`);
      return;
    }

    // Parse raw answers (they're decrypted automatically by the encryption extension)
    const rawAnswers = JSON.parse(profile.rawAnswers) as Record<string, string>;

    // Extract structured tags via AI
    const tags = await extractProfileTags(db, memberId, rawAnswers);

    // Update the profile with extracted tags
    await db.memberProfile.update({
      where: { memberId },
      data: {
        interests: tags.interests,
        currentFocus: tags.currentFocus,
        goals: tags.goals,
        learningAreas: tags.learningAreas,
        workStyle: tags.workStyle,
      },
    });

    ctx.logger.info(
      `Extracted profile tags for member ${memberId}: ${tags.interests.length} interests, ${tags.goals.length} goals`,
    );

    // Sync interest tags as Discord roles
    const guild = ctx.client.guilds.cache.first();
    if (guild) {
      await syncInterestTags(guild, db, memberId, tags.interests);
    }
  } catch (error) {
    ctx.logger.error(`Failed to extract tags for member ${memberId}:`, error);
  }
}

export default profileModule;
