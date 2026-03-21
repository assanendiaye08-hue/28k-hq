/**
 * Timer Slash Commands
 *
 * /timer start [mode] [work] [break] [focus] [goal] -- Start a productivity timer
 * /timer pause -- Pause the current timer
 * /timer resume -- Resume a paused timer
 * /timer stop -- Stop the current timer and persist session
 * /timer status -- Show current timer state
 *
 * The start subcommand sends a DM with an interactive embed and buttons.
 * Subsequent state changes are handled by the button handler in index.ts.
 */

import {
  ChannelType,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type DMChannel,
} from 'discord.js';
import type { ModuleContext } from '../../shared/types.js';
import type { ExtendedPrismaClient } from '@28k/db';
import {
  createTimer,
  getActiveTimer,
  pauseTimer,
  resumeTimer,
  stopTimer,
  scheduleTransition,
} from './engine.js';
import { TIMER_DEFAULTS } from '@28k/shared';
import { buildTimerEmbed, buildTimerCompletedEmbed } from './embeds.js';
import { buildWorkButtons, buildPausedButtons } from './buttons.js';
import {
  persistTimerSession,
  createActiveTimerRecord,
  updateTimerRecord,
  deleteActiveTimerRecord,
} from './session.js';

// ─── Command Builder ────────────────────────────────────────────────────────────

/**
 * Build the /timer slash command definition with 5 subcommands.
 */
export function buildTimerCommand(): SlashCommandBuilder {
  return new SlashCommandBuilder()
    .setName('timer')
    .setDescription('Productivity timer for focused work sessions')
    .addSubcommand((sub) =>
      sub
        .setName('start')
        .setDescription('Start a focus timer')
        .addStringOption((opt) =>
          opt
            .setName('focus')
            .setDescription('What are you working on?')
            .setRequired(true)
            .setMaxLength(100),
        )
        .addStringOption((opt) =>
          opt
            .setName('mode')
            .setDescription('Timer mode (default: pomodoro)')
            .setRequired(false)
            .addChoices(
              { name: 'Pomodoro', value: 'pomodoro' },
              { name: 'Free Flow', value: 'proportional' },
            ),
        )
        .addIntegerOption((opt) =>
          opt
            .setName('work')
            .setDescription('Work duration in minutes (default 25)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(180),
        )
        .addIntegerOption((opt) =>
          opt
            .setName('break')
            .setDescription('Break duration in minutes (default 5, pomodoro only)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(60),
        )
        .addIntegerOption((opt) =>
          opt
            .setName('sessions')
            .setDescription('Number of pomodoro rounds (default: unlimited)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(12),
        )
        .addStringOption((opt) =>
          opt
            .setName('goal')
            .setDescription('Link to an active goal')
            .setRequired(false)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('pause').setDescription('Pause your current timer'),
    )
    .addSubcommand((sub) =>
      sub.setName('resume').setDescription('Resume your paused timer'),
    )
    .addSubcommand((sub) =>
      sub.setName('stop').setDescription('Stop your current timer'),
    )
    .addSubcommand((sub) =>
      sub.setName('status').setDescription('Check your current timer status'),
    ) as SlashCommandBuilder;
}

// ─── Command Handler ────────────────────────────────────────────────────────────

/**
 * Handle /timer command interactions.
 * Routes to the appropriate subcommand handler.
 */
export async function handleTimerCommand(
  interaction: ChatInputCommandInteraction,
  ctx: ModuleContext,
): Promise<void> {
  const db = ctx.db as ExtendedPrismaClient;
  await interaction.deferReply({ ephemeral: true });

  // Resolve internal member ID from Discord account
  const account = await db.discordAccount.findUnique({
    where: { discordId: interaction.user.id },
  });

  if (!account) {
    await interaction.editReply('You need to run /setup first.');
    return;
  }

  const memberId = account.memberId;
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'start':
      await handleStart(interaction, db, ctx, memberId);
      break;
    case 'pause':
      await handlePause(interaction, db, memberId);
      break;
    case 'resume':
      await handleResume(interaction, db, ctx, memberId);
      break;
    case 'stop':
      await handleStop(interaction, db, ctx, memberId);
      break;
    case 'status':
      await handleStatus(interaction, memberId);
      break;
  }
}

// ─── Subcommand Handlers ────────────────────────────────────────────────────────

async function handleStart(
  interaction: ChatInputCommandInteraction,
  db: ExtendedPrismaClient,
  ctx: ModuleContext,
  memberId: string,
): Promise<void> {
  // Check if member already has an active timer
  if (getActiveTimer(memberId)) {
    await interaction.editReply(
      'You already have a timer running. Stop it first with /timer stop.',
    );
    return;
  }

  // Read options
  const mode = (interaction.options.getString('mode') ?? 'pomodoro') as
    | 'pomodoro'
    | 'proportional';
  const workDuration =
    interaction.options.getInteger('work') ?? TIMER_DEFAULTS.defaultWorkMinutes;
  let breakDuration =
    interaction.options.getInteger('break') ?? TIMER_DEFAULTS.defaultBreakMinutes;
  let focus = interaction.options.getString('focus') ?? 'Focused work';
  const targetSessions = interaction.options.getInteger('sessions') ?? null;
  let goalId: string | null = null;

  // Handle goal option
  const goalOptionId = interaction.options.getString('goal');
  if (goalOptionId) {
    const goal = await db.goal.findFirst({
      where: { id: goalOptionId, memberId, status: 'ACTIVE' },
    });
    if (!goal) {
      await interaction.editReply(
        'Goal not found or not active. Pick an active goal from the autocomplete list.',
      );
      return;
    }
    focus = goal.title;
    goalId = goal.id;
  }

  // For proportional mode, break is calculated dynamically
  if (mode === 'proportional') {
    breakDuration = 0; // Placeholder -- calculated on transition
  }

  // Create the in-memory timer
  const timer = createTimer(memberId, {
    mode,
    workDuration,
    breakDuration,
    breakRatio: TIMER_DEFAULTS.defaultBreakRatio,
    focus,
    goalId,
    targetSessions,
  });

  // Send DM to user with timer embed and buttons
  try {
    const user = await ctx.client.users.fetch(interaction.user.id);
    const dmChannel = await user.createDM();
    const dmMessage = await dmChannel.send({
      embeds: [buildTimerEmbed(timer)],
      components: [buildWorkButtons()],
    });

    // Store DM references on the timer
    timer.dmMessageId = dmMessage.id;
    timer.dmChannelId = dmChannel.id;
  } catch {
    // If DM fails, clean up the timer and tell the user
    stopTimer(memberId);
    await interaction.editReply(
      'Could not send you a DM. Please enable DMs from this server and try again.',
    );
    return;
  }

  // Create ACTIVE DB record for restart recovery
  try {
    await deleteActiveTimerRecord(db, memberId); // Clean up any stale records
    await createActiveTimerRecord(db, timer);
  } catch (error) {
    ctx.logger.error('[timer] Failed to create active timer record:', error);
  }

  // Schedule work->break transition
  scheduleTransition(
    memberId,
    workDuration * 60_000,
    async () => {
      // This callback is invoked by the module's transition orchestrator
      ctx.events.emit('timerTransition', memberId, 'work_to_break');
    },
  );

  await interaction.editReply('Timer started! Check your DMs.');
  ctx.events.emit('timerStarted', memberId, mode);
}

async function handlePause(
  interaction: ChatInputCommandInteraction,
  db: ExtendedPrismaClient,
  memberId: string,
): Promise<void> {
  const timer = pauseTimer(memberId);
  if (!timer) {
    await interaction.editReply('No active timer to pause.');
    return;
  }

  // Update DM message
  try {
    if (timer.dmChannelId && timer.dmMessageId) {
      const channel = await interaction.client.channels.fetch(timer.dmChannelId);
      if (channel && channel.type === ChannelType.DM) {
        const dmChannel = channel as DMChannel;
        const message = await dmChannel.messages.fetch(timer.dmMessageId);
        await message.edit({
          embeds: [buildTimerEmbed(timer)],
          components: [buildPausedButtons()],
        });
      }
    }
  } catch {
    // DM edit failure is non-critical
  }

  // Update DB record
  try {
    await updateTimerRecord(db, memberId, {
      totalWorkedMs: timer.totalWorkedMs,
      totalBreakMs: timer.totalBreakMs,
      timerState: timer.state,
      prePauseState: timer.prePauseState,
      remainingMs: timer.remainingMs,
    });
  } catch {
    // DB update failure is non-critical for pause
  }

  await interaction.editReply('Timer paused.');
}

async function handleResume(
  interaction: ChatInputCommandInteraction,
  db: ExtendedPrismaClient,
  ctx: ModuleContext,
  memberId: string,
): Promise<void> {
  const timer = resumeTimer(memberId);
  if (!timer) {
    await interaction.editReply('No paused timer to resume.');
    return;
  }

  // Update DM message with appropriate buttons
  try {
    if (timer.dmChannelId && timer.dmMessageId) {
      const channel = await interaction.client.channels.fetch(timer.dmChannelId);
      if (channel && channel.type === ChannelType.DM) {
        const dmChannel = channel as DMChannel;
        const { buildBreakButtons } = await import('./buttons.js');
        const message = await dmChannel.messages.fetch(timer.dmMessageId);
        const buttons =
          timer.state === 'working' ? buildWorkButtons() : buildBreakButtons();
        await message.edit({
          embeds: [buildTimerEmbed(timer)],
          components: [buttons],
        });
      }
    }
  } catch {
    // DM edit failure is non-critical
  }

  // Reschedule transition for remaining time
  if (timer.remainingMs && timer.remainingMs > 0) {
    const transitionEvent =
      timer.state === 'working' ? 'work_to_break' : 'break_to_work';
    scheduleTransition(memberId, timer.remainingMs, async () => {
      ctx.events.emit('timerTransition', memberId, transitionEvent);
    });
  }

  // Update DB record
  try {
    await updateTimerRecord(db, memberId, {
      totalWorkedMs: timer.totalWorkedMs,
      totalBreakMs: timer.totalBreakMs,
      timerState: timer.state,
      prePauseState: timer.prePauseState,
      remainingMs: null,
    });
  } catch {
    // DB update failure is non-critical for resume
  }

  await interaction.editReply('Timer resumed.');
}

async function handleStop(
  interaction: ChatInputCommandInteraction,
  db: ExtendedPrismaClient,
  ctx: ModuleContext,
  memberId: string,
): Promise<void> {
  const timer = stopTimer(memberId);
  if (!timer) {
    await interaction.editReply('No active timer to stop.');
    return;
  }

  // Delete the ACTIVE DB record
  try {
    await deleteActiveTimerRecord(db, memberId);
  } catch {
    // Non-critical
  }

  // Persist completed session
  const durationMinutes = Math.floor(timer.totalWorkedMs / 60_000);
  const status = durationMinutes < 1 ? 'CANCELLED' : 'COMPLETED';

  const result = await persistTimerSession(db, timer, status);

  // Update DM message with completed embed (no buttons)
  try {
    if (timer.dmChannelId && timer.dmMessageId) {
      const channel = await interaction.client.channels.fetch(timer.dmChannelId);
      if (channel && channel.type === ChannelType.DM) {
        const dmChannel = channel as DMChannel;
        const message = await dmChannel.messages.fetch(timer.dmMessageId);
        await message.edit({
          embeds: [
            buildTimerCompletedEmbed(
              result.durationMinutes,
              result.xpAwarded,
              timer.pomodoroCount,
              timer.mode,
              timer.focus,
            ),
          ],
          components: [], // Remove buttons
        });
      }
    }
  } catch {
    // DM edit failure is non-critical
  }

  // Emit events
  if (status === 'COMPLETED') {
    ctx.events.emit('timerCompleted', memberId, durationMinutes);
    if (result.leveledUp) {
      ctx.events.emit('levelUp', memberId, result.newRank!, result.oldRank!, 0);
    }
  } else {
    ctx.events.emit('timerCancelled', memberId);
  }

  const xpMsg = result.xpAwarded > 0 ? ` +${result.xpAwarded} XP` : '';
  await interaction.editReply(
    `Timer stopped. ${result.durationMinutes} min worked.${xpMsg}`,
  );
}

async function handleStatus(
  interaction: ChatInputCommandInteraction,
  memberId: string,
): Promise<void> {
  const timer = getActiveTimer(memberId);
  if (!timer) {
    await interaction.editReply('No active timer.');
    return;
  }

  await interaction.editReply({
    embeds: [buildTimerEmbed(timer)],
  });
}

// ─── Autocomplete Handler ───────────────────────────────────────────────────────

/**
 * Handle autocomplete for the goal option on /timer start.
 * Returns active goals for the member (limit 25).
 */
export async function handleTimerAutocomplete(
  interaction: AutocompleteInteraction,
  db: ExtendedPrismaClient,
): Promise<void> {
  try {
    const account = await db.discordAccount.findUnique({
      where: { discordId: interaction.user.id },
    });
    if (!account) {
      await interaction.respond([]);
      return;
    }

    const focused = interaction.options.getFocused().toLowerCase();

    const goals = await db.goal.findMany({
      where: {
        memberId: account.memberId,
        status: { in: ['ACTIVE', 'EXTENDED'] },
      },
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
  } catch {
    await interaction.respond([]);
  }
}
