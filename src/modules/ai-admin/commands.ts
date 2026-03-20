/**
 * AI admin slash commands for cost visibility and model management.
 *
 * /cost today       -- Today's token usage with per-member and per-feature breakdown
 * /cost month       -- Month-to-date usage with projections
 * /cost set-budget  -- Override a member's daily token limit
 * /admin set-model  -- Hot-swap primary or fallback AI model at runtime
 *
 * All commands require Administrator permission.
 */

import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { TZDate } from '@date-fns/tz';
import { startOfDay, startOfMonth, getDaysInMonth, differenceInDays } from 'date-fns';
import type { ModuleContext } from '../../shared/types.js';
import type { ExtendedPrismaClient } from '../../db/client.js';
import { BRAND_COLORS } from '../../shared/constants.js';
import { resetModelConfigCache } from '../../shared/ai-client.js';

// ─── /cost Command ────────────────────────────────────────────────────────────

/**
 * Build the /cost slash command with today, month, and set-budget subcommands.
 */
export function buildCostCommand(): SlashCommandBuilder {
  return new SlashCommandBuilder()
    .setName('cost')
    .setDescription('View AI usage costs and manage budgets')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('today')
        .setDescription("Today's AI token usage and cost breakdown"),
    )
    .addSubcommand((sub) =>
      sub
        .setName('month')
        .setDescription('Month-to-date AI usage with projections'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('set-budget')
        .setDescription("Override a member's daily token limit")
        .addUserOption((opt) =>
          opt
            .setName('user')
            .setDescription('The member to set the budget for')
            .setRequired(true),
        )
        .addIntegerOption((opt) =>
          opt
            .setName('limit')
            .setDescription('Daily token limit (number of tokens)')
            .setRequired(true)
            .setMinValue(1000),
        ),
    ) as unknown as SlashCommandBuilder;
}

/**
 * Handle /cost today -- show today's usage breakdown.
 */
async function handleCostToday(
  interaction: ChatInputCommandInteraction,
  db: ExtendedPrismaClient,
): Promise<void> {
  const todayStart = startOfDay(new TZDate(new Date(), 'UTC'));

  // Total usage today
  const totalAgg = await db.tokenUsage.aggregate({
    _sum: { totalTokens: true, estimatedCostUsd: true },
    where: { createdAt: { gte: todayStart } },
  });

  const totalTokens = totalAgg._sum.totalTokens ?? 0;
  const totalCost = totalAgg._sum.estimatedCostUsd ?? 0;

  // Per-member breakdown (top 10)
  const memberGroups = await db.tokenUsage.groupBy({
    by: ['memberId'],
    _sum: { totalTokens: true, estimatedCostUsd: true },
    where: { createdAt: { gte: todayStart } },
    orderBy: { _sum: { totalTokens: 'desc' } },
    take: 10,
  });

  // Resolve member display names
  const memberIds = memberGroups
    .map((g) => g.memberId)
    .filter((id) => id !== 'system');
  const members = memberIds.length > 0
    ? await db.member.findMany({
        where: { id: { in: memberIds } },
        select: { id: true, displayName: true },
      })
    : [];
  const nameMap = new Map(members.map((m) => [m.id, m.displayName]));

  // Per-feature breakdown
  const featureGroups = await db.tokenUsage.groupBy({
    by: ['feature'],
    _sum: { totalTokens: true, estimatedCostUsd: true },
    where: { createdAt: { gte: todayStart } },
    orderBy: { _sum: { totalTokens: 'desc' } },
  });

  // Build embed
  const embed = new EmbedBuilder()
    .setColor(BRAND_COLORS.primary)
    .setTitle('AI Usage -- Today')
    .addFields(
      {
        name: 'Total Tokens',
        value: totalTokens.toLocaleString(),
        inline: true,
      },
      {
        name: 'Estimated Cost',
        value: `$${totalCost.toFixed(4)}`,
        inline: true,
      },
    )
    .setTimestamp();

  // Add per-member fields
  if (memberGroups.length > 0) {
    const memberLines = memberGroups.map((g) => {
      const name = g.memberId === 'system'
        ? 'System'
        : (nameMap.get(g.memberId) ?? g.memberId.slice(0, 8));
      const tokens = (g._sum.totalTokens ?? 0).toLocaleString();
      const cost = (g._sum.estimatedCostUsd ?? 0).toFixed(4);
      return `**${name}**: ${tokens} tokens ($${cost})`;
    });
    embed.addFields({
      name: 'Top Members',
      value: memberLines.join('\n'),
    });
  }

  // Add per-feature fields
  if (featureGroups.length > 0) {
    const featureLines = featureGroups.map((g) => {
      const tokens = (g._sum.totalTokens ?? 0).toLocaleString();
      const cost = (g._sum.estimatedCostUsd ?? 0).toFixed(4);
      return `**${g.feature}**: ${tokens} tokens ($${cost})`;
    });
    embed.addFields({
      name: 'By Feature',
      value: featureLines.join('\n'),
    });
  }

  if (totalTokens === 0) {
    embed.setDescription('No AI usage recorded today yet.');
  }

  await interaction.editReply({ embeds: [embed] });
}

/**
 * Handle /cost month -- show month-to-date usage with projections.
 */
async function handleCostMonth(
  interaction: ChatInputCommandInteraction,
  db: ExtendedPrismaClient,
): Promise<void> {
  const now = new TZDate(new Date(), 'UTC');
  const monthStart = startOfMonth(now);
  const daysInMonth = getDaysInMonth(now);
  const daysElapsed = differenceInDays(now, monthStart) + 1; // Include today

  // Month-to-date totals
  const totalAgg = await db.tokenUsage.aggregate({
    _sum: { totalTokens: true, estimatedCostUsd: true },
    where: { createdAt: { gte: monthStart } },
  });

  const totalTokens = totalAgg._sum.totalTokens ?? 0;
  const totalCost = totalAgg._sum.estimatedCostUsd ?? 0;

  // Daily averages
  const dailyAvgTokens = daysElapsed > 0 ? Math.round(totalTokens / daysElapsed) : 0;
  const dailyAvgCost = daysElapsed > 0 ? totalCost / daysElapsed : 0;

  // Projected monthly
  const projectedTokens = dailyAvgTokens * daysInMonth;
  const projectedCost = dailyAvgCost * daysInMonth;

  // Top 5 members by month-to-date usage
  const memberGroups = await db.tokenUsage.groupBy({
    by: ['memberId'],
    _sum: { totalTokens: true, estimatedCostUsd: true },
    where: { createdAt: { gte: monthStart } },
    orderBy: { _sum: { totalTokens: 'desc' } },
    take: 5,
  });

  const memberIds = memberGroups
    .map((g) => g.memberId)
    .filter((id) => id !== 'system');
  const members = memberIds.length > 0
    ? await db.member.findMany({
        where: { id: { in: memberIds } },
        select: { id: true, displayName: true },
      })
    : [];
  const nameMap = new Map(members.map((m) => [m.id, m.displayName]));

  // Build embed
  const embed = new EmbedBuilder()
    .setColor(BRAND_COLORS.primary)
    .setTitle('AI Usage -- Month to Date')
    .addFields(
      {
        name: 'Total Tokens',
        value: totalTokens.toLocaleString(),
        inline: true,
      },
      {
        name: 'Estimated Cost',
        value: `$${totalCost.toFixed(4)}`,
        inline: true,
      },
      {
        name: 'Daily Average',
        value: `${dailyAvgTokens.toLocaleString()} tokens ($${dailyAvgCost.toFixed(4)})`,
        inline: true,
      },
      {
        name: 'Projected Monthly',
        value: `${projectedTokens.toLocaleString()} tokens ($${projectedCost.toFixed(4)})`,
        inline: true,
      },
    )
    .setFooter({ text: `Day ${daysElapsed} of ${daysInMonth}` })
    .setTimestamp();

  // Top members
  if (memberGroups.length > 0) {
    const memberLines = memberGroups.map((g) => {
      const name = g.memberId === 'system'
        ? 'System'
        : (nameMap.get(g.memberId) ?? g.memberId.slice(0, 8));
      const tokens = (g._sum.totalTokens ?? 0).toLocaleString();
      const cost = (g._sum.estimatedCostUsd ?? 0).toFixed(4);
      return `**${name}**: ${tokens} tokens ($${cost})`;
    });
    embed.addFields({
      name: 'Top Members',
      value: memberLines.join('\n'),
    });
  }

  if (totalTokens === 0) {
    embed.setDescription('No AI usage recorded this month yet.');
  }

  await interaction.editReply({ embeds: [embed] });
}

/**
 * Handle /cost set-budget -- override a member's daily token limit.
 */
async function handleCostSetBudget(
  interaction: ChatInputCommandInteraction,
  db: ExtendedPrismaClient,
): Promise<void> {
  const targetUser = interaction.options.getUser('user', true);
  const limit = interaction.options.getInteger('limit', true);

  // Look up the Discord account -> Member
  const account = await db.discordAccount.findUnique({
    where: { discordId: targetUser.id },
    include: { member: { select: { id: true, displayName: true } } },
  });

  if (!account) {
    await interaction.editReply({
      content: `${targetUser.username} is not a registered member. They need to run /setup first.`,
    });
    return;
  }

  // Upsert the budget
  await db.memberAIBudget.upsert({
    where: { memberId: account.member.id },
    create: { memberId: account.member.id, dailyTokenLimit: limit },
    update: { dailyTokenLimit: limit },
  });

  await interaction.editReply({
    content: `Set daily budget for **${account.member.displayName}** to **${limit.toLocaleString()}** tokens.`,
  });
}

// ─── /admin set-model Command ────────────────────────────────────────────────

/**
 * Build the /admin slash command with set-model subcommand.
 */
export function buildAdminSetModelCommand(): SlashCommandBuilder {
  return new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Server administration commands')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('set-model')
        .setDescription('Change the active AI model at runtime')
        .addStringOption((opt) =>
          opt
            .setName('model-type')
            .setDescription('Which model slot to change')
            .setRequired(true)
            .addChoices(
              { name: 'Primary', value: 'primary' },
              { name: 'Fallback', value: 'fallback' },
            ),
        )
        .addStringOption((opt) =>
          opt
            .setName('model-id')
            .setDescription('OpenRouter model ID (e.g., x-ai/grok-4.1-fast)')
            .setRequired(true),
        ),
    ) as unknown as SlashCommandBuilder;
}

/**
 * Handle /admin set-model -- hot-swap the AI model.
 */
async function handleAdminSetModel(
  interaction: ChatInputCommandInteraction,
  db: ExtendedPrismaClient,
): Promise<void> {
  const modelType = interaction.options.getString('model-type', true);
  const modelId = interaction.options.getString('model-id', true);

  const configKey = modelType === 'primary' ? 'ai_primary_model' : 'ai_fallback_model';

  // Upsert BotConfig
  await db.botConfig.upsert({
    where: { key: configKey },
    create: { key: configKey, value: modelId },
    update: { value: modelId },
  });

  // Clear the model config cache so the next AI call picks up the change immediately
  resetModelConfigCache();

  await interaction.editReply({
    content: `Set **${modelType}** model to \`${modelId}\`. Takes effect on next AI call.`,
  });
}

// ─── Command Handlers ─────────────────────────────────────────────────────────

/**
 * Handle all /cost subcommands.
 */
export async function handleCost(
  interaction: ChatInputCommandInteraction,
  ctx: ModuleContext,
): Promise<void> {
  const db = ctx.db as ExtendedPrismaClient;
  await interaction.deferReply({ ephemeral: true });

  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'today':
      await handleCostToday(interaction, db);
      break;
    case 'month':
      await handleCostMonth(interaction, db);
      break;
    case 'set-budget':
      await handleCostSetBudget(interaction, db);
      break;
    default:
      await interaction.editReply({ content: `Unknown subcommand: ${subcommand}` });
  }
}

/**
 * Handle all /admin subcommands.
 */
export async function handleAdmin(
  interaction: ChatInputCommandInteraction,
  ctx: ModuleContext,
): Promise<void> {
  const db = ctx.db as ExtendedPrismaClient;
  await interaction.deferReply({ ephemeral: true });

  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'set-model':
      await handleAdminSetModel(interaction, db);
      break;
    default:
      await interaction.editReply({ content: `Unknown subcommand: ${subcommand}` });
  }
}
