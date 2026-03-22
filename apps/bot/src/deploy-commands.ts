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
 * v3.0 command set (4 commands):
 *   /goals        - View and manage goals
 *   /reminders    - View and manage reminders
 *   /leaderboard  - View the leaderboard
 *   /announce-update - Announce a bot update to members
 *
 * All other interactions happen through DMs with Jarvis (conversational AI).
 */

import { REST, Routes } from 'discord.js';
import { config } from './core/config.js';
import { buildGoalsCommand } from './modules/goals/commands.js';
import { buildLeaderboardCommand } from './modules/leaderboard/commands.js';
import { buildRemindersCommand } from './modules/reminders/commands.js';
import { buildAnnounceUpdateCommand } from './modules/announce-update/commands.js';

const commands = [
  buildGoalsCommand(),
  buildRemindersCommand(),
  buildLeaderboardCommand(),
  buildAnnounceUpdateCommand(),
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
