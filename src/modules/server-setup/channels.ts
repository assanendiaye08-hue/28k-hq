/**
 * Server channel and category setup.
 *
 * Creates the full channel structure for the Discord Hustler server:
 *   WELCOME        -- visible to @everyone, #welcome is read-only
 *   THE GRIND      -- gated behind Member role (general, wins, lessons, accountability)
 *   RESOURCES      -- gated behind Member role (resource sharing)
 *   VOICE          -- gated behind Member role (co-working rooms)
 *   PRIVATE SPACES -- hidden from everyone (individual overwrites per member)
 *
 * The function is idempotent: existing categories and channels are skipped.
 * Receives the role map from setupServerRoles() for permission overwrites.
 */

import {
  type Guild,
  type Role,
  type CategoryChannel,
  ChannelType,
  PermissionFlagsBits,
} from 'discord.js';
import type { Logger } from 'winston';

/**
 * Category definitions with their channels and permission requirements.
 */
interface ChannelDef {
  name: string;
  type: ChannelType.GuildText | ChannelType.GuildVoice;
}

interface CategoryDef {
  name: string;
  /** If true, @everyone can view. If false, gated behind Member role. */
  public: boolean;
  /** If true, @everyone DENY ViewChannel with no Member role override (for private spaces). */
  hidden: boolean;
  channels: ChannelDef[];
}

const CATEGORIES: CategoryDef[] = [
  {
    name: 'WELCOME',
    public: true,
    hidden: false,
    channels: [
      { name: 'welcome', type: ChannelType.GuildText },
    ],
  },
  {
    name: 'THE GRIND',
    public: false,
    hidden: false,
    channels: [
      { name: 'general', type: ChannelType.GuildText },
      { name: 'wins', type: ChannelType.GuildText },
      { name: 'lessons', type: ChannelType.GuildText },
      { name: 'accountability', type: ChannelType.GuildText },
    ],
  },
  {
    name: 'RESOURCES',
    public: false,
    hidden: false,
    channels: [
      { name: 'tech-resources', type: ChannelType.GuildText },
      { name: 'business-resources', type: ChannelType.GuildText },
      { name: 'growth-resources', type: ChannelType.GuildText },
    ],
  },
  {
    name: 'VOICE',
    public: false,
    hidden: false,
    channels: [
      { name: 'The Lab', type: ChannelType.GuildVoice },
      { name: 'The Office', type: ChannelType.GuildVoice },
    ],
  },
  {
    name: 'PRIVATE SPACES',
    public: false,
    hidden: true,
    channels: [], // Individual channels created per member during onboarding
  },
];

/**
 * Find or create a category channel by name.
 */
async function findOrCreateCategory(
  guild: Guild,
  name: string,
  logger: Logger,
): Promise<CategoryChannel> {
  const existing = guild.channels.cache.find(
    (ch) => ch.type === ChannelType.GuildCategory && ch.name === name,
  ) as CategoryChannel | undefined;

  if (existing) {
    logger.debug(`Category already exists: ${name}`);
    return existing;
  }

  const created = await guild.channels.create({
    name,
    type: ChannelType.GuildCategory,
    reason: 'Discord Hustler server setup',
  });

  logger.info(`Created category: ${name}`);
  return created as CategoryChannel;
}

/**
 * Ensure the server has the correct channel structure.
 *
 * @param guild - The Discord guild to set up channels in
 * @param roles - Map of role name -> Role object (from setupServerRoles)
 * @param logger - Logger for tracking progress
 */
export async function setupServerChannels(
  guild: Guild,
  roles: Map<string, Role>,
  logger: Logger,
): Promise<void> {
  const memberRole = roles.get('Member');
  if (!memberRole) {
    throw new Error('Member role not found -- roles must be set up before channels');
  }

  const botMember = guild.members.me;
  if (!botMember) {
    throw new Error('Bot is not a member of the guild');
  }

  let categoriesCreated = 0;
  let channelsCreated = 0;

  for (const categoryDef of CATEGORIES) {
    // Find or create the category
    const category = await findOrCreateCategory(guild, categoryDef.name, logger);
    categoriesCreated++;

    // Set category-level permissions
    if (categoryDef.hidden) {
      // PRIVATE SPACES: deny @everyone, no Member role override
      await category.permissionOverwrites.edit(guild.roles.everyone, {
        ViewChannel: false,
      });
    } else if (!categoryDef.public) {
      // Gated categories: deny @everyone, allow Member role
      await category.permissionOverwrites.edit(guild.roles.everyone, {
        ViewChannel: false,
      });
      await category.permissionOverwrites.edit(memberRole, {
        ViewChannel: true,
      });
    }
    // Public categories (WELCOME): @everyone can view by default (no overwrite needed)

    // Create channels within this category
    for (const channelDef of categoryDef.channels) {
      const existingChannel = guild.channels.cache.find(
        (ch) =>
          ch.name === channelDef.name.toLowerCase().replace(/ /g, '-') &&
          ch.parentId === category.id,
      ) ?? guild.channels.cache.find(
        (ch) =>
          ch.name === channelDef.name &&
          ch.parentId === category.id,
      );

      if (existingChannel) {
        logger.debug(`Channel already exists: ${channelDef.name} in ${categoryDef.name}`);
        channelsCreated++;
        continue;
      }

      const created = await guild.channels.create({
        name: channelDef.name,
        type: channelDef.type,
        parent: category,
        reason: 'Discord Hustler server setup',
      });

      // Special handling for #welcome channel
      if (channelDef.name === 'welcome' && categoryDef.name === 'WELCOME') {
        // @everyone can view and read history, but NOT send messages
        await created.permissionOverwrites.edit(guild.roles.everyone, {
          ViewChannel: true,
          ReadMessageHistory: true,
          SendMessages: false,
        });

        // Bot can send messages in #welcome
        await created.permissionOverwrites.edit(botMember.id, {
          ViewChannel: true,
          SendMessages: true,
          EmbedLinks: true,
        });
      }

      logger.info(`Created channel: ${channelDef.name} in ${categoryDef.name}`);
      channelsCreated++;
    }
  }

  logger.info(
    `Channel setup complete: ${categoriesCreated} categories, ${channelsCreated} channels`,
  );
}
