/**
 * Standalone script to register slash commands with Discord API.
 *
 * Usage:
 *   npm run deploy-commands           # Guild-scoped (instant, for development)
 *   npm run deploy-commands -- --global  # Global (up to 1 hour cache, for production)
 *
 * This script is NOT part of the bot runtime. It runs independently to
 * register/update slash commands with Discord, then exits.
 *
 * Phase 1 commands: /setup, /profile, /link, /verify, /unlink
 */

import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import { config } from './core/config.js';

// --- Phase 1 Slash Commands ---

const commands = [
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Set up your profile and unlock the server'),

  new SlashCommandBuilder()
    .setName('profile')
    .setDescription('View or edit your profile')
    .addUserOption((opt) =>
      opt
        .setName('user')
        .setDescription('View another member\'s public profile')
        .setRequired(false),
    ),

  new SlashCommandBuilder()
    .setName('link')
    .setDescription('Generate a code to link another Discord account'),

  new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Verify an account link code')
    .addStringOption((opt) =>
      opt
        .setName('code')
        .setDescription('The 6-character link code')
        .setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName('unlink')
    .setDescription('Unlink a Discord account from your identity'),
];

// --- Deploy ---

async function deploy(): Promise<void> {
  const isGlobal = process.argv.includes('--global');
  const rest = new REST().setToken(config.BOT_TOKEN);

  const commandData = commands.map((cmd) => cmd.toJSON());

  console.log(`Registering ${commandData.length} slash command(s)...`);
  console.log(`Mode: ${isGlobal ? 'GLOBAL (up to 1 hour cache)' : 'GUILD (instant update)'}`);
  console.log(`Commands: ${commands.map((c) => '/' + c.name).join(', ')}`);

  try {
    if (isGlobal) {
      // Global registration -- available in all guilds, up to 1 hour to propagate
      await rest.put(
        Routes.applicationCommands(config.DISCORD_CLIENT_ID),
        { body: commandData },
      );
    } else {
      // Guild-scoped registration -- instant update, development only
      await rest.put(
        Routes.applicationGuildCommands(
          config.DISCORD_CLIENT_ID,
          config.DISCORD_GUILD_ID,
        ),
        { body: commandData },
      );
    }

    console.log(`Successfully registered ${commandData.length} command(s)!`);
  } catch (error) {
    console.error('Failed to register commands:', error);
    process.exit(1);
  }
}

deploy();
