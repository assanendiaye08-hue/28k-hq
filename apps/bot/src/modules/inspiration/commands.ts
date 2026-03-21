/**
 * Inspiration slash commands.
 *
 * /inspiration add [name] [context?] -- Add a person who inspires you (max 3)
 * /inspiration remove [name]         -- Remove an inspiration (with autocomplete)
 * /inspiration list                  -- View your inspirations
 */

import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from 'discord.js';
import type { ModuleContext } from '../../shared/types.js';
import type { ExtendedPrismaClient } from '@28k/db';
import { BRAND_COLORS } from '@28k/shared';

/** Maximum number of inspirations a member can have. */
const MAX_INSPIRATIONS = 3;

// ─── Command Builder ────────────────────────────────────────────────────────────

/**
 * Build the /inspiration slash command definition with add, remove, list subcommands.
 */
export function buildInspirationCommand(): SlashCommandBuilder {
  return new SlashCommandBuilder()
    .setName('inspiration')
    .setDescription('Manage the people who inspire you')
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Add a person who inspires you')
        .addStringOption((opt) =>
          opt
            .setName('name')
            .setDescription('Name of the person')
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName('context')
            .setDescription('Why they inspire you')
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Remove an inspiration')
        .addStringOption((opt) =>
          opt
            .setName('name')
            .setDescription('Name of the person to remove')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('View your inspirations'),
    ) as SlashCommandBuilder;
}

// ─── Command Handler ────────────────────────────────────────────────────────────

/**
 * Handle the /inspiration slash command (add, remove, list subcommands).
 */
export async function handleInspirationCommand(
  interaction: ChatInputCommandInteraction,
  ctx: ModuleContext,
): Promise<void> {
  const db = ctx.db as ExtendedPrismaClient;
  const subcommand = interaction.options.getSubcommand();

  // Resolve Discord ID to member
  const account = await db.discordAccount.findUnique({
    where: { discordId: interaction.user.id },
  });

  if (!account) {
    await interaction.reply({
      content: 'You need to run /setup first.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const memberId = account.memberId;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    switch (subcommand) {
      case 'add':
        await handleAdd(interaction, db, memberId);
        break;
      case 'remove':
        await handleRemove(interaction, db, memberId);
        break;
      case 'list':
        await handleList(interaction, db, memberId);
        break;
      default:
        await interaction.editReply({ content: 'Unknown subcommand.' });
    }
  } catch (error) {
    ctx.logger.error(`[inspiration] /${subcommand} failed: ${String(error)}`);
    await interaction.editReply({
      content: 'Something went wrong. Try again in a sec.',
    });
  }
}

// ─── Subcommand Handlers ────────────────────────────────────────────────────────

/**
 * /inspiration add -- Add a person who inspires the member.
 * Enforces a maximum of 3 inspirations.
 */
async function handleAdd(
  interaction: ChatInputCommandInteraction,
  db: ExtendedPrismaClient,
  memberId: string,
): Promise<void> {
  const name = interaction.options.getString('name', true).trim();
  const context = interaction.options.getString('context')?.trim() || null;

  // Check current count
  const count = await db.inspiration.count({ where: { memberId } });

  if (count >= MAX_INSPIRATIONS) {
    // Check if this is an update to an existing inspiration (same name)
    const existing = await db.inspiration.findUnique({
      where: { memberId_name: { memberId, name } },
    });

    if (!existing) {
      await interaction.editReply({
        content: `You can have up to ${MAX_INSPIRATIONS} inspirations. Remove one first with \`/inspiration remove\`.`,
      });
      return;
    }
  }

  // Upsert -- create or update if same name exists
  await db.inspiration.upsert({
    where: { memberId_name: { memberId, name } },
    create: { memberId, name, context },
    update: { context },
  });

  const embed = new EmbedBuilder()
    .setColor(BRAND_COLORS.primary)
    .setTitle('Inspiration Added')
    .setDescription(`**${name}** added as an inspiration.${context ? `\n\n> ${context}` : ''}`);

  await interaction.editReply({ embeds: [embed] });
}

/**
 * /inspiration remove -- Remove an inspiration by name.
 */
async function handleRemove(
  interaction: ChatInputCommandInteraction,
  db: ExtendedPrismaClient,
  memberId: string,
): Promise<void> {
  const name = interaction.options.getString('name', true).trim();

  // Try to delete -- deleteMany returns count so we know if anything was removed
  const result = await db.inspiration.deleteMany({
    where: { memberId, name },
  });

  if (result.count === 0) {
    await interaction.editReply({
      content: 'No inspiration found with that name.',
    });
    return;
  }

  await interaction.editReply({
    content: `Removed **${name}** from your inspirations.`,
  });
}

/**
 * /inspiration list -- Display the member's inspirations.
 */
async function handleList(
  interaction: ChatInputCommandInteraction,
  db: ExtendedPrismaClient,
  memberId: string,
): Promise<void> {
  const inspirations = await db.inspiration.findMany({
    where: { memberId },
    orderBy: { createdAt: 'asc' },
  });

  if (inspirations.length === 0) {
    await interaction.editReply({
      content: 'No inspirations set yet. Use `/inspiration add` to add someone who inspires you.',
    });
    return;
  }

  const lines = inspirations.map((insp, i) => {
    const contextLine = insp.context ? `\n> ${insp.context}` : '';
    return `**${i + 1}.** ${insp.name}${contextLine}`;
  });

  const embed = new EmbedBuilder()
    .setColor(BRAND_COLORS.primary)
    .setTitle('Your Inspirations')
    .setDescription(lines.join('\n\n'))
    .setFooter({ text: `${inspirations.length}/${MAX_INSPIRATIONS} slots used` });

  await interaction.editReply({ embeds: [embed] });
}

// ─── Autocomplete Handler ───────────────────────────────────────────────────────

/**
 * Handle autocomplete for /inspiration remove -- returns the member's current inspiration names.
 */
export async function handleInspirationAutocomplete(
  interaction: AutocompleteInteraction,
  ctx: ModuleContext,
): Promise<void> {
  const db = ctx.db as ExtendedPrismaClient;

  try {
    const account = await db.discordAccount.findUnique({
      where: { discordId: interaction.user.id },
    });

    if (!account) {
      await interaction.respond([]);
      return;
    }

    const focused = interaction.options.getFocused().toLowerCase();
    const inspirations = await db.inspiration.findMany({
      where: { memberId: account.memberId },
      select: { name: true },
      orderBy: { createdAt: 'asc' },
    });

    const filtered = inspirations
      .filter((insp) => insp.name.toLowerCase().includes(focused))
      .slice(0, 25)
      .map((insp) => ({ name: insp.name, value: insp.name }));

    await interaction.respond(filtered);
  } catch {
    await interaction.respond([]);
  }
}
