/**
 * Goals Module
 *
 * Provides /setgoal, /goals, /progress, and /completegoal slash commands.
 * Handles goal lifecycle: creation, progress tracking, auto-completion,
 * manual completion, and autocomplete for goal selection.
 *
 * Also registers the autocomplete interaction handler for /progress
 * and /completegoal goal selection.
 */

import type { Module, ModuleContext } from '../../shared/types.js';
import { registerGoalCommands, handleGoalAutocomplete } from './commands.js';
import type { AutocompleteInteraction } from 'discord.js';

const goalsModule: Module = {
  name: 'goals',

  register(ctx: ModuleContext): void {
    registerGoalCommands(ctx);

    // Register autocomplete handler for goal selection
    // The bot's interaction handler needs to route autocomplete events here
    ctx.events.on('autocomplete', async (...args: unknown[]) => {
      const [interaction] = args as [AutocompleteInteraction];
      if (
        interaction.commandName === 'progress' ||
        interaction.commandName === 'completegoal'
      ) {
        await handleGoalAutocomplete(interaction, ctx);
      }
      // Autocomplete for /setgoal parent option -- reuses the same handler
      if (
        interaction.commandName === 'setgoal' &&
        interaction.options.getFocused(true).name === 'parent'
      ) {
        await handleGoalAutocomplete(interaction, ctx);
      }
    });

    ctx.logger.info('[goals] Module registered');
  },
};

export default goalsModule;
