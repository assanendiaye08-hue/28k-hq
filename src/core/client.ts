import { Client, GatewayIntentBits, Partials } from 'discord.js';

/**
 * Create and configure the Discord.js client with required intents and partials.
 *
 * Intents:
 * - Guilds: guild/channel events
 * - GuildMembers: member join/leave (PRIVILEGED -- must be enabled in Developer Portal)
 * - GuildMessages: message events in guild channels
 * - DirectMessages: DM events (for setup flow, private spaces)
 * - MessageContent: read message content (PRIVILEGED -- must be enabled in Developer Portal)
 *
 * Partials:
 * - Channel: required for DM events
 * - Message: required for uncached message events
 *
 * Does NOT login -- the caller (index.ts) handles that.
 */
export function createClient(): Client {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [
      Partials.Channel,
      Partials.Message,
    ],
  });
}
