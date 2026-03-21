import type { Client, ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import type { Logger } from 'winston';

/**
 * Command registry interface -- the actual implementation lives in core/commands.ts.
 * Defined here so all modules can reference it without circular imports.
 */
export interface ICommandRegistry {
  register(
    name: string,
    builder: SlashCommandBuilder,
    handler: CommandHandler,
  ): void;
  getBuilders(): SlashCommandBuilder[];
  handleInteraction(
    interaction: ChatInputCommandInteraction,
    ctx: ModuleContext,
  ): Promise<void>;
}

/**
 * Event bus interface -- the actual implementation lives in core/events.ts.
 * Defined here so all modules can reference it without circular imports.
 */
export interface IEventBus {
  on(event: string, handler: (...args: unknown[]) => void): void;
  emit(event: string, ...args: unknown[]): void;
}

/**
 * Context passed to every module during registration and command execution.
 * Contains all shared services the module needs.
 */
export interface ModuleContext {
  client: Client;
  db: unknown; // Will be PrismaClient after Plan 02
  commands: ICommandRegistry;
  events: IEventBus;
  logger: Logger;
}

/**
 * A feature module that registers its commands, events, and scheduled tasks
 * against the shared bot core during startup.
 */
export interface Module {
  name: string;
  register(ctx: ModuleContext): void | Promise<void>;
}

/**
 * Handler function for a slash command interaction.
 */
export type CommandHandler = (
  interaction: ChatInputCommandInteraction,
  ctx: ModuleContext,
) => Promise<void>;

/**
 * Private space type -- member chooses where they want their personal space.
 * Matches the Prisma SpaceType enum (defined in Plan 02 schema).
 */
export enum SpaceType {
  DM = 'DM',
  CHANNEL = 'CHANNEL',
}
