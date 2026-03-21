/**
 * Discord Hustler - Entry Point
 *
 * Orchestrates bot startup:
 * 1. Validate environment config (fail fast)
 * 2. Create Discord client with required intents
 * 3. Initialize logger, database, command registry, event bus
 * 4. Build ModuleContext and load feature modules
 * 5. On client ready: log status, register slash commands
 * 6. Login to Discord
 * 7. Handle graceful shutdown on SIGINT/SIGTERM
 */

import { REST, Routes } from 'discord.js';
import winston from 'winston';

import { config } from './core/config.js';
import { createClient } from './core/client.js';
import { CommandRegistry } from './core/commands.js';
import { EventBus } from './core/events.js';
import { loadModules } from './core/module-loader.js';
import { db, disconnectDb } from './db/client.js';
import type { ModuleContext } from './shared/types.js';

// --- Logger Setup ---

const logger = winston.createLogger({
  level: config.NODE_ENV === 'production' ? 'info' : 'debug',
  format:
    config.NODE_ENV === 'production'
      ? winston.format.combine(winston.format.timestamp(), winston.format.json())
      : winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp({ format: 'HH:mm:ss' }),
          winston.format.printf(({ timestamp, level, message, ...rest }) => {
            const extra = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
            return `${timestamp as string} ${level}: ${message as string}${extra}`;
          }),
        ),
  transports: [
    new winston.transports.Console(),
    ...(config.NODE_ENV === 'production'
      ? [
          new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error',
          }),
          new winston.transports.File({
            filename: 'logs/combined.log',
          }),
        ]
      : []),
  ],
});

// --- Main Startup ---

async function main(): Promise<void> {
  logger.info('Starting Discord Hustler...');

  // Create Discord client
  const client = createClient();

  // Initialize core services
  const commands = new CommandRegistry();
  const events = new EventBus();
  // Database client with encryption extension (from db/client.ts)

  // Build module context
  const ctx: ModuleContext = {
    client,
    db,
    commands,
    events,
    logger,
  };

  // Load feature modules
  await loadModules(ctx);

  // On ready: log status and register slash commands with Discord
  client.once('ready', async (readyClient) => {
    logger.info(
      `Bot ready! Logged in as ${readyClient.user.tag} | ${readyClient.guilds.cache.size} guild(s)`,
    );

    // Register slash commands with Discord API (guild-scoped for fast updates)
    try {
      const rest = new REST().setToken(config.BOT_TOKEN);
      const commandData = commands.getBuilders().map((builder) => builder.toJSON());

      if (commandData.length > 0) {
        await rest.put(
          Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, config.DISCORD_GUILD_ID),
          { body: commandData },
        );
        logger.info(`Registered ${commandData.length} slash command(s) with Discord`);
      } else {
        logger.info('No slash commands to register (no modules loaded commands)');
      }
    } catch (error) {
      logger.error('Failed to register slash commands:', error);
    }
  });

  // Route interactions to command handlers
  client.on('interactionCreate', async (interaction) => {
    if (interaction.isAutocomplete()) {
      events.emit('autocomplete', interaction);
      return;
    }
    if (interaction.isButton()) {
      events.emit('buttonInteraction', interaction);
      return;
    }
    if (!interaction.isChatInputCommand()) return;
    await commands.handleInteraction(interaction, ctx);
  });

  // Login to Discord
  await client.login(config.BOT_TOKEN);

  // --- Graceful Shutdown ---

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal} -- shutting down gracefully...`);

    try {
      client.destroy();
      logger.info('Discord client disconnected');
    } catch (error) {
      logger.error('Error disconnecting Discord client:', error);
    }

    try {
      await disconnectDb();
      logger.info('Database connection closed');
    } catch (error) {
      logger.error('Error closing database connection:', error);
    }

    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  logger.error('Fatal error during startup:', error);
  process.exit(1);
});
