/**
 * Inspiration Module
 *
 * Lets members store up to 3 people they admire via /inspiration add|remove|list.
 * Inspirations are used by Jarvis (Phase 8, Plan 02) to personalize AI interactions
 * with motivational references.
 */

import type { Module, ModuleContext } from '../../shared/types.js';
import type { AutocompleteInteraction } from 'discord.js';
import {
  buildInspirationCommand,
  handleInspirationCommand,
  handleInspirationAutocomplete,
} from './commands.js';

const inspirationModule: Module = {
  name: 'inspiration',

  register(ctx: ModuleContext): void {
    // Register /inspiration command with add, remove, list subcommands
    ctx.commands.register('inspiration', buildInspirationCommand(), handleInspirationCommand);

    // Register autocomplete handler for /inspiration remove name option
    ctx.events.on('autocomplete', async (...args: unknown[]) => {
      const [interaction] = args as [AutocompleteInteraction];
      if (interaction.commandName === 'inspiration') {
        await handleInspirationAutocomplete(interaction, ctx);
      }
    });

    ctx.logger.info('[inspiration] Module registered');
  },
};

export default inspirationModule;
