/**
 * Goal slash commands: /setgoal, /goals, /progress, /completegoal
 *
 * Goals are the second pillar of the daily engagement loop (after check-ins).
 * They give members something to work toward, and completion awards
 * significantly more XP than check-ins (100/75 vs 25) to reward outcomes
 * over attendance.
 *
 * Two goal types:
 * - MEASURABLE: has target + unit (e.g., "5 cold emails"), auto-completes
 * - FREETEXT: qualitative (e.g., "learn Figma basics"), manual completion
 *
 * All replies are ephemeral -- goals are personal.
 */

import {
  SlashCommandBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from 'discord.js';
import { TZDate } from '@date-fns/tz';
import { addDays, addWeeks, addMonths, formatDistanceToNow, isPast, endOfWeek, endOfQuarter, endOfYear, parse } from 'date-fns';
import type { ModuleContext } from '../../shared/types.js';
import type { ExtendedPrismaClient } from '@28k/db';
import { successEmbed, errorEmbed, infoEmbed } from '../../shared/embeds.js';
import { awardXP } from '@28k/shared';
import { XP_AWARDS } from '@28k/shared';
import {
  validateGoalDepth,
  getTimeframeDeadline,
  goalTreeInclude,
  recalculateParentProgress,
} from './hierarchy.js';

// ─── Command Builders ──────────────────────────────────────────────────────────

export function buildSetgoalCommand(): SlashCommandBuilder {
  const cmd = new SlashCommandBuilder()
    .setName('setgoal')
    .setDescription('Set a new goal to work toward');

  cmd.addStringOption((opt) =>
    opt.setName('title').setDescription("What's the goal?").setRequired(true),
  );
  cmd.addStringOption((opt) =>
    opt
      .setName('deadline')
      .setDescription("When? (e.g., 'end of week', 'March 30', '2 weeks')")
      .setRequired(true),
  );
  cmd.addIntegerOption((opt) =>
    opt
      .setName('target')
      .setDescription("Target number (e.g., 5 for '5 cold emails')")
      .setRequired(false)
      .setMinValue(1),
  );
  cmd.addStringOption((opt) =>
    opt
      .setName('unit')
      .setDescription("Unit of measurement (e.g., 'emails', 'pages')")
      .setRequired(false),
  );
  cmd.addStringOption((opt) =>
    opt
      .setName('parent')
      .setDescription('Nest under an existing goal')
      .setRequired(false)
      .setAutocomplete(true),
  );
  cmd.addStringOption((opt) =>
    opt
      .setName('timeframe')
      .setDescription('Goal timeframe')
      .setRequired(false)
      .addChoices(
        { name: 'Yearly', value: 'YEARLY' },
        { name: 'Quarterly', value: 'QUARTERLY' },
        { name: 'Monthly', value: 'MONTHLY' },
        { name: 'Weekly', value: 'WEEKLY' },
      ),
  );

  return cmd;
}

export function buildGoalsCommand(): SlashCommandBuilder {
  const cmd = new SlashCommandBuilder()
    .setName('goals')
    .setDescription('View your active goals');

  cmd.addStringOption((opt) =>
    opt
      .setName('view')
      .setDescription('How to display goals')
      .setRequired(false)
      .addChoices(
        { name: 'List (default)', value: 'list' },
        { name: 'Tree', value: 'tree' },
      ),
  );

  return cmd;
}

export function buildProgressCommand(): SlashCommandBuilder {
  const cmd = new SlashCommandBuilder()
    .setName('progress')
    .setDescription('Update progress on a measurable goal');

  cmd.addStringOption((opt) =>
    opt
      .setName('goal')
      .setDescription('Which goal?')
      .setRequired(true)
      .setAutocomplete(true),
  );
  cmd.addIntegerOption((opt) =>
    opt
      .setName('value')
      .setDescription('New progress value')
      .setRequired(true)
      .setMinValue(0),
  );

  return cmd;
}

export function buildCompletegoalCommand(): SlashCommandBuilder {
  const cmd = new SlashCommandBuilder()
    .setName('completegoal')
    .setDescription('Mark a goal as complete');

  cmd.addStringOption((opt) =>
    opt
      .setName('goal')
      .setDescription('Which goal?')
      .setRequired(true)
      .setAutocomplete(true),
  );

  return cmd;
}

// ─── Command Registration ───────────────────────────────────────────────────────

export function registerGoalCommands(ctx: ModuleContext): void {
  ctx.commands.register('setgoal', buildSetgoalCommand(), handleSetgoal);
  ctx.commands.register('goals', buildGoalsCommand(), handleGoals);
  ctx.commands.register('progress', buildProgressCommand(), handleProgress);
  ctx.commands.register('completegoal', buildCompletegoalCommand(), handleCompletegoal);
}

// ─── Autocomplete Handler ───────────────────────────────────────────────────────

/**
 * Handle autocomplete for goal selection.
 * Returns active goals for the member (limit 25, within 3-second Discord limit).
 */
export async function handleGoalAutocomplete(
  interaction: AutocompleteInteraction,
  ctx: ModuleContext,
): Promise<void> {
  const db = ctx.db as ExtendedPrismaClient;
  const discordId = interaction.user.id;

  try {
    const account = await db.discordAccount.findUnique({
      where: { discordId },
    });
    if (!account) {
      await interaction.respond([]);
      return;
    }

    const focused = interaction.options.getFocused().toLowerCase();
    const commandName = interaction.commandName;

    // For /progress, only show measurable active goals
    const whereClause =
      commandName === 'progress'
        ? {
            memberId: account.memberId,
            status: { in: ['ACTIVE' as const, 'EXTENDED' as const] },
            type: 'MEASURABLE' as const,
          }
        : {
            memberId: account.memberId,
            status: { in: ['ACTIVE' as const, 'EXTENDED' as const] },
          };

    const goals = await db.goal.findMany({
      where: whereClause,
      orderBy: { deadline: 'asc' },
      take: 25,
    });

    const filtered = goals.filter((g) =>
      g.title.toLowerCase().includes(focused),
    );

    await interaction.respond(
      filtered.map((g) => ({
        name: g.title.length > 100 ? g.title.slice(0, 97) + '...' : g.title,
        value: g.id,
      })),
    );
  } catch (error) {
    console.warn('[goals] Autocomplete error:', error);
    await interaction.respond([]);
  }
}

// ─── /setgoal Handler ───────────────────────────────────────────────────────────

async function handleSetgoal(
  interaction: ChatInputCommandInteraction,
  ctx: ModuleContext,
): Promise<void> {
  const db = ctx.db as ExtendedPrismaClient;
  const { logger } = ctx;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // Look up member
  const discordId = interaction.user.id;
  const account = await db.discordAccount.findUnique({
    where: { discordId },
    include: { member: true },
  });

  if (!account) {
    await interaction.editReply({
      embeds: [errorEmbed('Not set up', 'Run /setup first to create your profile.')],
    });
    return;
  }

  const memberId = account.memberId;

  // Soft cap advisory at 5 active goals
  const activeGoalCount = await db.goal.count({
    where: {
      memberId,
      status: { in: ['ACTIVE', 'EXTENDED'] },
    },
  });

  // Parse inputs
  const title = interaction.options.getString('title', true);
  const deadlineInput = interaction.options.getString('deadline', true);
  const target = interaction.options.getInteger('target');
  const unit = interaction.options.getString('unit');
  const parentId = interaction.options.getString('parent');
  const timeframeInput = interaction.options.getString('timeframe');

  // Parse deadline
  let deadline = parseDeadline(deadlineInput);

  // If timeframe is provided and deadline fell through to fallback, use timeframe deadline
  if (timeframeInput && isFallbackDeadline(deadline)) {
    deadline = getTimeframeDeadline(timeframeInput);
  }

  // Validate parent if provided
  let depth = 0;
  if (parentId) {
    const parent = await db.goal.findFirst({
      where: {
        id: parentId,
        memberId,
        status: { in: ['ACTIVE', 'EXTENDED'] },
      },
    });

    if (!parent) {
      await interaction.editReply({
        embeds: [errorEmbed('Parent goal not found', 'Parent goal not found or not active.')],
      });
      return;
    }

    if (!validateGoalDepth(parent.depth)) {
      await interaction.editReply({
        embeds: [errorEmbed('Too deep', 'Goals can only be nested 4 levels deep.')],
      });
      return;
    }

    depth = parent.depth + 1;
  }

  // Determine goal type
  const goalType = target && unit ? 'MEASURABLE' : 'FREETEXT';

  // Create goal
  const goal = await db.goal.create({
    data: {
      memberId,
      title,
      description: title, // Set to title for now -- can be expanded via future edit
      type: goalType,
      targetValue: target,
      unit,
      deadline,
      parentId: parentId ?? undefined,
      timeframe: (timeframeInput as 'YEARLY' | 'QUARTERLY' | 'MONTHLY' | 'WEEKLY') ?? undefined,
      depth,
    },
  });

  logger.info(`Goal created: ${goal.id} (${goalType}) for ${memberId}${parentId ? ` under parent ${parentId}` : ''}`);

  // Build response embed
  const embed = successEmbed('Goal set!');
  embed.addFields(
    { name: 'Goal', value: title, inline: false },
    { name: 'Type', value: goalType === 'MEASURABLE' ? 'Measurable' : 'Free-text', inline: true },
    { name: 'Deadline', value: formatDeadline(deadline), inline: true },
  );

  if (timeframeInput) {
    embed.addFields({ name: 'Timeframe', value: timeframeInput, inline: true });
  }

  if (parentId) {
    const parentGoal = await db.goal.findFirst({ where: { id: parentId, memberId: account.memberId } });
    if (parentGoal) {
      embed.addFields({ name: 'Parent', value: parentGoal.title, inline: true });
    }
  }

  if (goalType === 'MEASURABLE' && target && unit) {
    embed.addFields({
      name: 'Progress',
      value: buildProgressBar(0, target, unit),
      inline: false,
    });
  }

  if (activeGoalCount >= 5) {
    embed.addFields({
      name: 'Heads up',
      value: `You now have ${activeGoalCount + 1} active goals. Consider completing some before adding more.`,
      inline: false,
    });
  }

  await interaction.editReply({ embeds: [embed] });
}

// ─── /goals Handler ─────────────────────────────────────────────────────────────

async function handleGoals(
  interaction: ChatInputCommandInteraction,
  ctx: ModuleContext,
): Promise<void> {
  const db = ctx.db as ExtendedPrismaClient;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const discordId = interaction.user.id;
  const account = await db.discordAccount.findUnique({
    where: { discordId },
  });

  if (!account) {
    await interaction.editReply({
      embeds: [errorEmbed('Not set up', 'Run /setup first to create your profile.')],
    });
    return;
  }

  const view = interaction.options.getString('view') ?? 'list';

  if (view === 'tree') {
    // Tree view: show full hierarchy from top-level goals
    const topGoals = await db.goal.findMany({
      where: {
        memberId: account.memberId,
        status: { in: ['ACTIVE', 'EXTENDED'] },
        parentId: null,
      },
      orderBy: { deadline: 'asc' },
      include: goalTreeInclude,
    });

    if (topGoals.length === 0) {
      await interaction.editReply({
        embeds: [infoEmbed('No active goals', 'Use /setgoal to create one.')],
      });
      return;
    }

    const treeText = renderGoalTree(topGoals as GoalWithChildren[]);
    const embed = infoEmbed('Your Goal Tree');
    embed.setDescription('```\n' + treeText + '\n```');

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // List view (default): show top-level and standalone goals with child counts
  const goals = await db.goal.findMany({
    where: {
      memberId: account.memberId,
      status: { in: ['ACTIVE', 'EXTENDED'] },
      parentId: null, // Only top-level goals
    },
    orderBy: { deadline: 'asc' },
    include: { _count: { select: { children: true } } },
  });

  if (goals.length === 0) {
    await interaction.editReply({
      embeds: [infoEmbed('No active goals', 'Use /setgoal to create one.')],
    });
    return;
  }

  const embed = infoEmbed('Your Goals');

  for (const goal of goals) {
    const statusBadge = goal.status === 'EXTENDED' ? ' [EXTENDED]' : '';
    const timeframeTag = goal.timeframe ? `[${goal.timeframe}] ` : '';
    const deadlineStr = isPast(goal.deadline)
      ? 'Overdue'
      : formatDistanceToNow(goal.deadline, { addSuffix: true });

    let fieldValue: string;
    const childCount = goal._count.children;

    if (childCount > 0) {
      // Parent goal -- show sub-goal progress
      const completedChildren = await db.goal.count({
        where: { parentId: goal.id, status: 'COMPLETED' },
      });
      fieldValue = `${completedChildren}/${childCount} sub-goals | Due ${deadlineStr}${statusBadge}`;
    } else if (goal.type === 'MEASURABLE' && goal.targetValue) {
      fieldValue = `${buildProgressBar(goal.currentValue, goal.targetValue, goal.unit ?? '')} | Due ${deadlineStr}${statusBadge}`;
    } else {
      fieldValue = `Due ${deadlineStr}${statusBadge}`;
    }

    embed.addFields({
      name: `${timeframeTag}${goal.title}`,
      value: fieldValue,
      inline: false,
    });
  }

  await interaction.editReply({ embeds: [embed] });
}

// ─── /progress Handler ──────────────────────────────────────────────────────────

async function handleProgress(
  interaction: ChatInputCommandInteraction,
  ctx: ModuleContext,
): Promise<void> {
  const db = ctx.db as ExtendedPrismaClient;
  const { events, logger } = ctx;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const discordId = interaction.user.id;
  const account = await db.discordAccount.findUnique({
    where: { discordId },
  });

  if (!account) {
    await interaction.editReply({
      embeds: [errorEmbed('Not set up', 'Run /setup first to create your profile.')],
    });
    return;
  }

  const goalId = interaction.options.getString('goal', true);
  const newValue = interaction.options.getInteger('value', true);

  // Find the goal
  const goal = await db.goal.findFirst({
    where: {
      id: goalId,
      memberId: account.memberId,
      type: 'MEASURABLE',
      status: { in: ['ACTIVE', 'EXTENDED'] },
    },
  });

  if (!goal) {
    await interaction.editReply({
      embeds: [errorEmbed('Goal not found', 'Could not find that measurable goal. Use /goals to see your active goals.')],
    });
    return;
  }

  // Guard: parent goals with children cannot have direct progress updates
  const childCount = await db.goal.count({ where: { parentId: goal.id } });
  if (childCount > 0) {
    await interaction.editReply({
      embeds: [errorEmbed('Parent goal', "This goal's progress is calculated from its sub-goals. Update your sub-goals instead.")],
    });
    return;
  }

  const oldValue = goal.currentValue;
  const delta = Math.max(0, newValue - oldValue); // Only count positive progress

  // Check if auto-complete (reached or exceeded target)
  const targetReached = goal.targetValue !== null && newValue >= goal.targetValue;

  if (targetReached) {
    // Auto-complete the goal
    await db.goal.update({
      where: { id: goal.id },
      data: {
        currentValue: newValue,
        status: 'COMPLETED',
        completedAt: new Date(),
        xpAwarded: XP_AWARDS.goal.measurableComplete,
      },
    });

    // Award goal completion XP
    const xpResult = await awardXP(
      db,
      account.memberId,
      XP_AWARDS.goal.measurableComplete,
      'GOAL_COMPLETE',
      `Completed goal: ${goal.title}`,
    );

    events.emit('goalCompleted', account.memberId, goal.id, 'MEASURABLE');
    events.emit('xpAwarded', account.memberId, XP_AWARDS.goal.measurableComplete, xpResult.newTotal, 'GOAL_COMPLETE');

    if (xpResult.leveledUp && xpResult.newRank && xpResult.oldRank) {
      events.emit('levelUp', account.memberId, xpResult.newRank, xpResult.oldRank, xpResult.newTotal);
    }

    const embed = successEmbed('Goal complete!');
    embed.addFields(
      { name: 'Goal', value: goal.title, inline: false },
      {
        name: 'Final',
        value: buildProgressBar(newValue, goal.targetValue!, goal.unit ?? ''),
        inline: true,
      },
      { name: 'XP', value: `+${XP_AWARDS.goal.measurableComplete} XP`, inline: true },
    );

    if (xpResult.leveledUp && xpResult.newRank) {
      embed.addFields({
        name: 'Level Up!',
        value: `You just hit **${xpResult.newRank}**!`,
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
    logger.info(`Goal auto-completed: ${goal.id} for ${account.memberId}`);

    // Cascade progress to parent if this goal has one
    if (goal.parentId) {
      await recalculateParentProgress(db, goal.parentId, events);
    }
  } else {
    // Update progress
    await db.goal.update({
      where: { id: goal.id },
      data: { currentValue: newValue },
    });

    // Award progress XP (only for positive delta)
    let progressXP = 0;
    if (delta > 0) {
      progressXP = XP_AWARDS.goal.progressUpdate * delta;
      const xpResult = await awardXP(
        db,
        account.memberId,
        progressXP,
        'GOAL_COMPLETE',
        `Progress on: ${goal.title} (+${delta} ${goal.unit ?? 'units'})`,
      );

      events.emit('xpAwarded', account.memberId, progressXP, xpResult.newTotal, 'GOAL_COMPLETE');

      if (xpResult.leveledUp && xpResult.newRank && xpResult.oldRank) {
        events.emit('levelUp', account.memberId, xpResult.newRank, xpResult.oldRank, xpResult.newTotal);
      }
    }

    events.emit('goalProgressUpdated', account.memberId, goal.id, newValue);

    const embed = infoEmbed('Progress updated');
    embed.addFields(
      { name: 'Goal', value: goal.title, inline: false },
      {
        name: 'Progress',
        value: buildProgressBar(newValue, goal.targetValue!, goal.unit ?? ''),
        inline: true,
      },
    );

    if (progressXP > 0) {
      embed.addFields({ name: 'XP', value: `+${progressXP} XP`, inline: true });
    }

    await interaction.editReply({ embeds: [embed] });
  }
}

// ─── /completegoal Handler ──────────────────────────────────────────────────────

async function handleCompletegoal(
  interaction: ChatInputCommandInteraction,
  ctx: ModuleContext,
): Promise<void> {
  const db = ctx.db as ExtendedPrismaClient;
  const { events, logger } = ctx;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const discordId = interaction.user.id;
  const account = await db.discordAccount.findUnique({
    where: { discordId },
  });

  if (!account) {
    await interaction.editReply({
      embeds: [errorEmbed('Not set up', 'Run /setup first to create your profile.')],
    });
    return;
  }

  const goalId = interaction.options.getString('goal', true);

  const goal = await db.goal.findFirst({
    where: {
      id: goalId,
      memberId: account.memberId,
      status: { in: ['ACTIVE', 'EXTENDED'] },
    },
  });

  if (!goal) {
    await interaction.editReply({
      embeds: [errorEmbed('Goal not found', 'Could not find that goal. Use /goals to see your active goals.')],
    });
    return;
  }

  // Determine XP based on goal type
  const xpAmount =
    goal.type === 'MEASURABLE'
      ? XP_AWARDS.goal.measurableComplete
      : XP_AWARDS.goal.freetextComplete;

  // Update goal
  await db.goal.update({
    where: { id: goal.id },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      xpAwarded: xpAmount,
    },
  });

  // Award XP
  const xpResult = await awardXP(
    db,
    account.memberId,
    xpAmount,
    'GOAL_COMPLETE',
    `Completed goal: ${goal.title}`,
  );

  events.emit('goalCompleted', account.memberId, goal.id, goal.type);
  events.emit('xpAwarded', account.memberId, xpAmount, xpResult.newTotal, 'GOAL_COMPLETE');

  if (xpResult.leveledUp && xpResult.newRank && xpResult.oldRank) {
    events.emit('levelUp', account.memberId, xpResult.newRank, xpResult.oldRank, xpResult.newTotal);
  }

  const embed = successEmbed('Goal complete!');
  embed.addFields(
    { name: 'Goal', value: goal.title, inline: false },
    { name: 'XP', value: `+${xpAmount} XP`, inline: true },
    { name: 'Type', value: goal.type === 'MEASURABLE' ? 'Measurable' : 'Free-text', inline: true },
  );

  if (xpResult.leveledUp && xpResult.newRank) {
    embed.addFields({
      name: 'Level Up!',
      value: `You just hit **${xpResult.newRank}**!`,
      inline: false,
    });
  }

  await interaction.editReply({ embeds: [embed] });
  logger.info(`Goal completed: ${goal.id} (${goal.type}) for ${account.memberId} (+${xpAmount} XP)`);

  // Cascade progress to parent if this goal has one
  if (goal.parentId) {
    await recalculateParentProgress(db, goal.parentId, events);
  }
}

// ─── Utility Functions ──────────────────────────────────────────────────────────

/**
 * Parse a natural language deadline into a Date.
 * Supports: "end of week", "X days/weeks/months", specific dates.
 * Falls back to 7 days from now on parse failure.
 */
function parseDeadline(input: string): Date {
  const normalized = input.toLowerCase().trim();
  const now = new Date();

  // "end of week" / "this week"
  if (normalized.includes('end of week') || normalized === 'this week') {
    return endOfWeek(now, { weekStartsOn: 1 }); // Sunday end
  }

  // "end of month" / "this month"
  if (normalized.includes('end of month') || normalized === 'this month') {
    const eom = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    return eom;
  }

  // "end of quarter" / "this quarter"
  if (normalized.includes('end of quarter') || normalized === 'this quarter') {
    return endOfQuarter(now);
  }

  // "end of year" / "this year"
  if (normalized.includes('end of year') || normalized === 'this year') {
    return endOfYear(now);
  }

  // "X days" / "X day"
  const daysMatch = normalized.match(/^(\d+)\s*days?$/);
  if (daysMatch) {
    return addDays(now, parseInt(daysMatch[1], 10));
  }

  // "X weeks" / "X week"
  const weeksMatch = normalized.match(/^(\d+)\s*weeks?$/);
  if (weeksMatch) {
    return addWeeks(now, parseInt(weeksMatch[1], 10));
  }

  // "X months" / "X month"
  const monthsMatch = normalized.match(/^(\d+)\s*months?$/);
  if (monthsMatch) {
    return addMonths(now, parseInt(monthsMatch[1], 10));
  }

  // Try parsing as a date string (e.g., "March 30", "2026-04-15")
  try {
    // Try common formats
    const formats = [
      'MMMM d',     // "March 30"
      'MMM d',      // "Mar 30"
      'yyyy-MM-dd', // "2026-04-15"
      'MM/dd',      // "03/30"
      'MM/dd/yyyy', // "03/30/2026"
    ];

    for (const fmt of formats) {
      try {
        const parsed = parse(normalized, fmt, now);
        if (!isNaN(parsed.getTime()) && parsed > now) {
          return parsed;
        }
      } catch {
        // Try next format
      }
    }
  } catch {
    // Fall through to default
  }

  // Default: 7 days from now
  return addDays(now, 7);
}

/**
 * Format a deadline date for display.
 */
function formatDeadline(date: Date): string {
  const relative = formatDistanceToNow(date, { addSuffix: true });
  const absolute = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  });
  return `${absolute} (${relative})`;
}

/**
 * Build a visual progress bar for measurable goals.
 * Example: [====------] 4/10 emails
 */
function buildProgressBar(current: number, target: number, unit: string): string {
  const percentage = Math.min(1, current / target);
  const filled = Math.round(percentage * 10);
  const empty = 10 - filled;
  const bar = '=' .repeat(filled) + '-'.repeat(empty);
  return `[${bar}] ${current}/${target} ${unit}`;
}

/**
 * Check if a parsed deadline is the 7-day fallback (i.e., parseDeadline couldn't
 * understand the input). Used to decide whether to override with timeframe deadline.
 *
 * Heuristic: if the deadline is exactly 7 days from now (within a 1-minute window),
 * it's the fallback.
 */
function isFallbackDeadline(deadline: Date): boolean {
  const expected = addDays(new Date(), 7);
  const diffMs = Math.abs(deadline.getTime() - expected.getTime());
  return diffMs < 60_000; // Within 1 minute = fallback
}

// ─── Tree Rendering ──────────────────────────────────────────────────────────────

/**
 * Recursive type for goal tree nodes loaded via goalTreeInclude.
 */
interface GoalWithChildren {
  id: string;
  title: string;
  status: string;
  type: string;
  timeframe: string | null;
  targetValue: number | null;
  currentValue: number;
  unit: string | null;
  children?: GoalWithChildren[];
}

/**
 * Render a goal tree as indented text with progress at each level.
 *
 * @param goals - Array of goals at the current level
 * @param indent - Current indentation depth
 * @returns Formatted tree string
 */
function renderGoalTree(goals: GoalWithChildren[], indent: number = 0): string {
  const lines: string[] = [];
  const prefix = '  '.repeat(indent);
  const connector = indent > 0 ? '|- ' : '';

  for (const goal of goals) {
    const timeframeTag = goal.timeframe ? `[${goal.timeframe}] ` : '';
    const statusBadge = goal.status === 'EXTENDED' ? ' [EXT]' : '';

    let progressStr: string;
    if (goal.children && goal.children.length > 0) {
      const completed = goal.children.filter((c) => c.status === 'COMPLETED').length;
      progressStr = `${completed}/${goal.children.length} sub-goals`;
    } else if (goal.type === 'MEASURABLE' && goal.targetValue) {
      progressStr = buildProgressBar(goal.currentValue, goal.targetValue, goal.unit ?? '');
    } else {
      progressStr = goal.status;
    }

    lines.push(`${prefix}${connector}${timeframeTag}${goal.title}: ${progressStr}${statusBadge}`);

    if (goal.children && goal.children.length > 0) {
      lines.push(renderGoalTree(goal.children, indent + 1));
    }
  }

  return lines.join('\n');
}
