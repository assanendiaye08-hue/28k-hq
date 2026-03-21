/**
 * Onboarding Module
 *
 * Handles the /setup command and new member greeting flow:
 * - Registers the /setup slash command
 * - On guildMemberAdd: sends a DM prompting them to run /setup,
 *   with a fallback @mention in #welcome if DMs are closed
 *
 * The actual setup logic lives in commands.ts (command handler),
 * setup-flow.ts (DM conversation), and channel-setup.ts (private channel creation).
 */

import { ChannelType, type TextChannel, type ButtonInteraction, Events } from 'discord.js';
import type { Module, ModuleContext } from '../../shared/types.js';
import { setupCommand, handleSetup, handleSetupButton } from './commands.js';
import { SETUP_BUTTON_ID } from './welcome.js';

const onboardingModule: Module = {
  name: 'onboarding',

  register(ctx: ModuleContext): void {
    const { client, commands, events, logger } = ctx;

    // Register /setup command
    commands.register('setup', setupCommand, handleSetup);

    // Handle "Get Started" button from #welcome
    events.on('buttonInteraction', async (...args: unknown[]) => {
      const interaction = args[0] as ButtonInteraction;
      if (interaction.customId !== SETUP_BUTTON_ID) return;
      try {
        await handleSetupButton(interaction, ctx);
      } catch (error) {
        logger.error(`Setup button error for ${interaction.user.tag}:`, error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: 'Something went wrong. Please try again.',
            ephemeral: true,
          }).catch(() => {});
        }
      }
    });

    // On new member join: prompt them to run /setup
    client.on(Events.GuildMemberAdd, async (member) => {
      try {
        // Try DM first
        const dm = await member.createDM();
        await dm.send(
          `Hey ${member.user.username}! Welcome to the server. ` +
          "Run `/setup` in the server to create your profile and unlock everything.",
        );
        logger.info(`Sent onboarding DM to new member: ${member.user.tag}`);
      } catch {
        // DMs closed -- this is fine, the server-setup module tags them in #welcome
        logger.debug(
          `Could not DM new member ${member.user.tag} -- DMs may be closed. ` +
          '#welcome mention handled by server-setup module.',
        );
      }
    });
  },
};

export default onboardingModule;
