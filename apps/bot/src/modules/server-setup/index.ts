/**
 * Server Setup Module
 *
 * Ensures the Discord server has the correct structure on bot startup:
 * - Rank roles (Legend -> Rookie) + Member gate role
 * - Channel categories (WELCOME, THE GRIND, RESOURCES, VOICE, PRIVATE SPACES)
 * - Permission overwrites gating channels behind Member role
 * - Welcome message in #welcome for new members
 *
 * This module runs on the 'ready' event (bot startup) and 'guildMemberAdd' event.
 * All operations are idempotent -- safe to re-run on every startup.
 */

import { ChannelType, type TextChannel, Events } from 'discord.js';
import type { Module, ModuleContext } from '../../shared/types.js';
import { setupServerRoles } from './roles.js';
import { setupServerChannels } from './channels.js';

const serverSetupModule: Module = {
  name: 'server-setup',

  register(ctx: ModuleContext): void {
    const { client, logger } = ctx;

    // On bot ready: set up server structure
    client.on(Events.ClientReady, async () => {
      const guild = client.guilds.cache.first();

      if (!guild) {
        logger.warn('No guilds found -- server setup skipped. Invite the bot to a server first.');
        return;
      }

      logger.info(`Setting up server structure for: ${guild.name}`);

      try {
        // Step 1: Create/verify roles
        const roles = await setupServerRoles(guild, logger);

        // Step 2: Create/verify channels (needs roles for permission overwrites)
        await setupServerChannels(guild, roles, logger);

        logger.info('Server setup complete');
      } catch (error) {
        logger.error('Server setup failed:', error);
      }
    });

    // On new member join: tag them in #welcome
    client.on(Events.GuildMemberAdd, async (member) => {
      try {
        const welcomeChannel = member.guild.channels.cache.find(
          (ch) => ch.name === 'welcome' && ch.type === ChannelType.GuildText,
        ) as TextChannel | undefined;

        if (welcomeChannel) {
          await welcomeChannel.send(
            `Hey ${member}! Welcome to the grind. Run \`/setup\` to get started and unlock the server.`,
          );
          logger.info(`Sent welcome message for new member: ${member.user.tag}`);
        } else {
          logger.warn('Could not find #welcome channel for new member greeting');
        }
      } catch (error) {
        logger.error(`Failed to send welcome message for ${member.user.tag}:`, error);
      }
    });
  },
};

export default serverSetupModule;
