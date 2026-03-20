import {
  type ChatInputCommandInteraction,
  type SlashCommandBuilder,
} from 'discord.js';
import type { CommandHandler, ModuleContext, ICommandRegistry } from '../shared/types.js';

interface RegisteredCommand {
  builder: SlashCommandBuilder;
  handler: CommandHandler;
}

/**
 * Slash command registry and interaction router.
 *
 * Modules register commands during startup via register().
 * The entry point wires handleInteraction to the interactionCreate event.
 * When an interaction comes in, the registry looks up the command name
 * and routes to the correct handler.
 */
export class CommandRegistry implements ICommandRegistry {
  private commands = new Map<string, RegisteredCommand>();

  /**
   * Register a slash command with its builder and handler.
   */
  register(
    name: string,
    builder: SlashCommandBuilder,
    handler: CommandHandler,
  ): void {
    if (this.commands.has(name)) {
      throw new Error(`Command "${name}" is already registered`);
    }
    this.commands.set(name, { builder, handler });
  }

  /**
   * Get all SlashCommandBuilder instances for deployment via Discord REST API.
   * Used by deploy-commands.ts to register commands with Discord.
   */
  getBuilders(): SlashCommandBuilder[] {
    return Array.from(this.commands.values()).map((cmd) => cmd.builder);
  }

  /**
   * Route an incoming ChatInputCommandInteraction to the correct handler.
   * Replies with an ephemeral "Unknown command" if the command is not registered.
   */
  async handleInteraction(
    interaction: ChatInputCommandInteraction,
    ctx: ModuleContext,
  ): Promise<void> {
    const command = this.commands.get(interaction.commandName);

    if (!command) {
      await interaction.reply({
        content: 'Unknown command. This command may have been removed.',
        ephemeral: true,
      });
      return;
    }

    try {
      await command.handler(interaction, ctx);
    } catch (error) {
      ctx.logger.error(`Error handling command "${interaction.commandName}":`, error);

      // Try to respond if we haven't already
      const reply = interaction.replied || interaction.deferred
        ? interaction.followUp.bind(interaction)
        : interaction.reply.bind(interaction);

      try {
        await reply({
          content: 'Something went wrong. Please try again later.',
          ephemeral: true,
        });
      } catch {
        // If we can't even send the error reply, just log it
        ctx.logger.error('Failed to send error response for command:', interaction.commandName);
      }
    }
  }
}
