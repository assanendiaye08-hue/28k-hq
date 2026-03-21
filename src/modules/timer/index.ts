/**
 * Timer Module
 *
 * Registers the /timer command, button interaction handler, and
 * transition orchestration for the productivity timer.
 *
 * Follows the voice-tracker/index.ts pattern:
 * - Module with name + register function
 * - Event bus for cross-module communication
 * - client.once('ready') for restart recovery
 *
 * Key features:
 * - Per-member locks to prevent race conditions on rapid button presses
 * - Global button handler filtered by timer: prefix
 * - Automatic work->break and break->work transitions
 * - Idle timeout auto-end with single gentle nudge
 * - Restart recovery from ACTIVE TimerSession DB records
 * - startTimerForMember export for natural language timer starts (Plan 09-03)
 */

import {
  ChannelType,
  type AutocompleteInteraction,
  type ButtonInteraction,
  type Client,
  type DMChannel,
} from 'discord.js';
import type { Module, ModuleContext } from '../../shared/types.js';
import type { ExtendedPrismaClient } from '../../db/client.js';
import {
  createTimer,
  getActiveTimer,
  pauseTimer,
  resumeTimer,
  stopTimer,
  transitionToBreak,
  transitionToWork,
  scheduleTransition,
  restoreTimer,
  type ActiveTimer,
} from './engine.js';
import { TIMER_DEFAULTS } from './constants.js';
import {
  buildTimerEmbed,
  buildTimerCompletedEmbed,
  buildBreakStartMessage,
  buildWorkResumeMessage,
} from './embeds.js';
import {
  buildWorkButtons,
  buildBreakButtons,
  buildPausedButtons,
} from './buttons.js';
import {
  buildTimerCommand,
  handleTimerCommand,
  handleTimerAutocomplete,
} from './commands.js';
import {
  persistTimerSession,
  createActiveTimerRecord,
  updateTimerRecord,
  deleteActiveTimerRecord,
} from './session.js';

// ─── Per-Member Processing Lock ────────────────────────────────────────────────

/**
 * Per-member processing lock using promise chaining.
 * Prevents race conditions on rapid button presses (Pitfall 2 from research).
 * Copied from ai-assistant/chat.ts pattern.
 */
const processingLocks = new Map<string, Promise<void>>();

async function withMemberLock<T>(memberId: string, fn: () => Promise<T>): Promise<T> {
  const existing = processingLocks.get(memberId) ?? Promise.resolve();

  let resolve: () => void;
  const newLock = new Promise<void>((r) => { resolve = r; });
  processingLocks.set(memberId, newLock);

  // Wait for any existing processing to complete
  await existing;

  try {
    return await fn();
  } finally {
    resolve!();
    // Clean up if this is still the latest lock
    if (processingLocks.get(memberId) === newLock) {
      processingLocks.delete(memberId);
    }
  }
}

// ─── DM Channel Helper ─────────────────────────────────────────────────────────

/**
 * Fetch a DM channel by ID and verify it supports sending messages.
 * Returns the channel as DMChannel or null if not available.
 */
async function fetchDMChannel(
  client: Client,
  channelId: string,
): Promise<DMChannel | null> {
  try {
    const channel = await client.channels.fetch(channelId);
    if (channel && channel.type === ChannelType.DM) {
      return channel as DMChannel;
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Exported Helper: startTimerForMember ──────────────────────────────────────

/**
 * Start a timer for a member programmatically.
 * Encapsulates the full timer start flow: createTimer, send DM with embed+buttons,
 * persist DB record, schedule transition.
 *
 * Used by Plan 09-03 for natural language timer starts via AI assistant.
 *
 * @param client - Discord client for sending DMs
 * @param db - Extended Prisma client
 * @param events - Event bus for emitting timer events
 * @param memberId - Internal member ID
 * @param discordId - Discord user ID for DM delivery
 * @param options - Timer configuration
 * @returns The created ActiveTimer, or null if DM delivery failed
 */
export async function startTimerForMember(
  client: Client,
  db: ExtendedPrismaClient,
  events: import('../../shared/types.js').IEventBus,
  memberId: string,
  discordId: string,
  options: {
    mode?: 'pomodoro' | 'proportional';
    workDuration?: number;
    breakDuration?: number;
    focus?: string | null;
    goalId?: string | null;
  } = {},
): Promise<ActiveTimer | null> {
  // Check if member already has an active timer
  if (getActiveTimer(memberId)) {
    return null;
  }

  const mode = options.mode ?? 'pomodoro';
  const workDuration = options.workDuration ?? TIMER_DEFAULTS.defaultWorkMinutes;
  const breakDuration =
    mode === 'proportional'
      ? 0
      : (options.breakDuration ?? TIMER_DEFAULTS.defaultBreakMinutes);

  // Create the in-memory timer
  const timer = createTimer(memberId, {
    mode,
    workDuration,
    breakDuration,
    breakRatio: TIMER_DEFAULTS.defaultBreakRatio,
    focus: options.focus ?? null,
    goalId: options.goalId ?? null,
  });

  // Send DM to user
  try {
    const user = await client.users.fetch(discordId);
    const dmChannel = await user.createDM();
    const dmMessage = await dmChannel.send({
      embeds: [buildTimerEmbed(timer)],
      components: [buildWorkButtons()],
    });

    timer.dmMessageId = dmMessage.id;
    timer.dmChannelId = dmChannel.id;
  } catch {
    // If DM fails, clean up and return null
    stopTimer(memberId);
    return null;
  }

  // Create ACTIVE DB record for restart recovery
  try {
    await deleteActiveTimerRecord(db, memberId);
    await createActiveTimerRecord(db, timer);
  } catch {
    // Non-critical -- timer works without DB record, just no restart recovery
  }

  // Schedule work->break transition
  scheduleTransition(
    memberId,
    workDuration * 60_000,
    async () => {
      events.emit('timerTransition', memberId, 'work_to_break');
    },
  );

  events.emit('timerStarted', memberId, mode);
  return timer;
}

// ─── Timer Module ──────────────────────────────────────────────────────────────

const timerModule: Module = {
  name: 'timer',

  register(ctx: ModuleContext): void {
    const db = ctx.db as ExtendedPrismaClient;

    // Register /timer command
    ctx.commands.register('timer', buildTimerCommand(), handleTimerCommand);

    // Register autocomplete handler for goal option
    ctx.events.on('autocomplete', async (...args: unknown[]) => {
      const interaction = args[0] as AutocompleteInteraction;
      if (interaction.commandName !== 'timer') return;
      await handleTimerAutocomplete(interaction, db);
    });

    // Register button interaction handler
    ctx.events.on('buttonInteraction', async (...args: unknown[]) => {
      const interaction = args[0] as ButtonInteraction;
      if (!interaction.customId.startsWith('timer:')) return;

      try {
        await interaction.deferUpdate(); // Respond within 3 seconds (Pitfall 1)
      } catch {
        return; // Interaction already expired
      }

      await handleTimerButton(interaction, db, ctx);
    });

    // Register internal transition event handler
    ctx.events.on('timerTransition', async (...args: unknown[]) => {
      const memberId = args[0] as string;
      const type = args[1] as string;

      await withMemberLock(memberId, async () => {
        await handleTransition(memberId, type, db, ctx);
      });
    });

    // Restart recovery: reconstruct active timers from DB on bot ready
    ctx.client.once('ready', async () => {
      try {
        const count = await reconstructTimers(ctx.client, db, ctx);
        if (count > 0) {
          ctx.logger.info(`[timer] Reconstructed ${count} active timer(s) from DB`);
        }
      } catch (error) {
        ctx.logger.error('[timer] Error reconstructing timers:', error);
      }
    });

    ctx.logger.info('[timer] Module registered');
  },
};

export default timerModule;

// ─── Button Handler ────────────────────────────────────────────────────────────

/**
 * Handle a button interaction on a timer DM message.
 * All mutations are wrapped in withMemberLock to prevent race conditions.
 */
async function handleTimerButton(
  interaction: ButtonInteraction,
  db: ExtendedPrismaClient,
  ctx: ModuleContext,
): Promise<void> {
  // Resolve member ID from Discord account
  const account = await db.discordAccount.findUnique({
    where: { discordId: interaction.user.id },
  });
  if (!account) return;

  const memberId = account.memberId;

  await withMemberLock(memberId, async () => {
    try {
      switch (interaction.customId) {
        case 'timer:pause':
          await handleButtonPause(interaction, db, memberId);
          break;
        case 'timer:resume':
          await handleButtonResume(interaction, db, ctx, memberId);
          break;
        case 'timer:stop':
          await handleButtonStop(interaction, db, ctx, memberId);
          break;
        case 'timer:skip_break':
          await handleButtonSkipBreak(interaction, db, ctx, memberId);
          break;
      }
    } catch (error) {
      ctx.logger.error(`[timer] Button handler error for ${interaction.customId}:`, error);
      try {
        await interaction.editReply({
          content: 'Something went wrong with the timer. Try /timer status.',
        });
      } catch {
        // Can't even send error -- give up
      }
    }
  });
}

async function handleButtonPause(
  interaction: ButtonInteraction,
  db: ExtendedPrismaClient,
  memberId: string,
): Promise<void> {
  const timer = pauseTimer(memberId);
  if (!timer) return;

  await interaction.editReply({
    embeds: [buildTimerEmbed(timer)],
    components: [buildPausedButtons()],
  });

  try {
    await updateTimerRecord(db, memberId, {
      totalWorkedMs: timer.totalWorkedMs,
      totalBreakMs: timer.totalBreakMs,
      timerState: timer.state,
      prePauseState: timer.prePauseState,
    });
  } catch {
    // Non-critical
  }
}

async function handleButtonResume(
  interaction: ButtonInteraction,
  db: ExtendedPrismaClient,
  ctx: ModuleContext,
  memberId: string,
): Promise<void> {
  const timer = resumeTimer(memberId);
  if (!timer) return;

  const buttons =
    timer.state === 'working' ? buildWorkButtons() : buildBreakButtons();

  await interaction.editReply({
    embeds: [buildTimerEmbed(timer)],
    components: [buttons],
  });

  // Reschedule transition for remaining time
  if (timer.remainingMs && timer.remainingMs > 0) {
    const transitionType =
      timer.state === 'working' ? 'work_to_break' : 'break_to_work';
    scheduleTransition(memberId, timer.remainingMs, async () => {
      ctx.events.emit('timerTransition', memberId, transitionType);
    });
  }

  try {
    await updateTimerRecord(db, memberId, {
      totalWorkedMs: timer.totalWorkedMs,
      totalBreakMs: timer.totalBreakMs,
      timerState: timer.state,
      prePauseState: timer.prePauseState,
    });
  } catch {
    // Non-critical
  }
}

async function handleButtonStop(
  interaction: ButtonInteraction,
  db: ExtendedPrismaClient,
  ctx: ModuleContext,
  memberId: string,
): Promise<void> {
  const timer = stopTimer(memberId);
  if (!timer) return;

  // Delete ACTIVE DB record
  try {
    await deleteActiveTimerRecord(db, memberId);
  } catch {
    // Non-critical
  }

  // Persist completed session
  const durationMinutes = Math.floor(timer.totalWorkedMs / 60_000);
  const status = durationMinutes < 1 ? 'CANCELLED' : 'COMPLETED';
  const result = await persistTimerSession(db, timer, status);

  // Update DM with completed embed (no buttons)
  await interaction.editReply({
    embeds: [
      buildTimerCompletedEmbed(
        result.durationMinutes,
        result.xpAwarded,
        timer.pomodoroCount,
        timer.mode,
        timer.focus,
      ),
    ],
    components: [],
  });

  // Emit events
  if (status === 'COMPLETED') {
    ctx.events.emit('timerCompleted', memberId, durationMinutes);
    if (result.leveledUp) {
      ctx.events.emit('levelUp', memberId, result.newRank!, result.oldRank!, 0);
    }
  } else {
    ctx.events.emit('timerCancelled', memberId);
  }
}

async function handleButtonSkipBreak(
  interaction: ButtonInteraction,
  db: ExtendedPrismaClient,
  ctx: ModuleContext,
  memberId: string,
): Promise<void> {
  const timer = transitionToWork(memberId);
  if (!timer) return;

  await interaction.editReply({
    embeds: [buildTimerEmbed(timer)],
    components: [buildWorkButtons()],
  });

  // Schedule next work->break transition
  scheduleTransition(
    memberId,
    timer.workDuration * 60_000,
    async () => {
      ctx.events.emit('timerTransition', memberId, 'work_to_break');
    },
  );

  try {
    await updateTimerRecord(db, memberId, {
      totalWorkedMs: timer.totalWorkedMs,
      totalBreakMs: timer.totalBreakMs,
      pomodoroCount: timer.pomodoroCount,
      timerState: timer.state,
    });
  } catch {
    // Non-critical
  }
}

// ─── Transition Orchestration ──────────────────────────────────────────────────

/**
 * Handle automatic timer transitions (work->break, break->work, idle timeout).
 * Called by the timerTransition event handler.
 */
async function handleTransition(
  memberId: string,
  type: string,
  db: ExtendedPrismaClient,
  ctx: ModuleContext,
): Promise<void> {
  const timer = getActiveTimer(memberId);
  if (!timer) return;

  switch (type) {
    case 'work_to_break':
      await handleWorkToBreak(memberId, timer, db, ctx);
      break;
    case 'break_to_work':
      await handleBreakToWork(memberId, timer, db, ctx);
      break;
    case 'idle_nudge':
      await handleIdleNudge(memberId, timer, ctx);
      break;
    case 'idle_timeout':
      await handleIdleTimeout(memberId, timer, db, ctx);
      break;
  }
}

async function handleWorkToBreak(
  memberId: string,
  _timer: ActiveTimer,
  db: ExtendedPrismaClient,
  ctx: ModuleContext,
): Promise<void> {
  const timer = transitionToBreak(memberId);
  if (!timer) return;

  const workedMin = Math.floor(timer.totalWorkedMs / 60_000);

  // Edit DM with break embed + break buttons
  try {
    if (timer.dmChannelId && timer.dmMessageId) {
      const dmChannel = await fetchDMChannel(ctx.client, timer.dmChannelId);
      if (dmChannel) {
        const message = await dmChannel.messages.fetch(timer.dmMessageId);
        await message.edit({
          embeds: [buildTimerEmbed(timer)],
          components: [buildBreakButtons()],
        });

        // Send encouraging break message as separate content
        await dmChannel.send(
          buildBreakStartMessage(workedMin, timer.breakDuration),
        );
      }
    }
  } catch (error) {
    ctx.logger.error('[timer] Failed to update DM on work->break transition:', error);
  }

  // Update DB record
  try {
    await updateTimerRecord(db, memberId, {
      totalWorkedMs: timer.totalWorkedMs,
      totalBreakMs: timer.totalBreakMs,
      pomodoroCount: timer.pomodoroCount,
      breakDuration: timer.breakDuration,
      timerState: timer.state,
    });
  } catch {
    // Non-critical
  }

  // Schedule next transition based on mode
  if (timer.mode === 'pomodoro') {
    // Schedule break->work transition
    scheduleTransition(
      memberId,
      timer.breakDuration * 60_000,
      async () => {
        ctx.events.emit('timerTransition', memberId, 'break_to_work');
      },
    );
  } else {
    // Proportional mode: schedule gentle nudge, then idle timeout
    scheduleTransition(
      memberId,
      (timer.breakDuration + TIMER_DEFAULTS.gentleNudgeDelayMinutes) * 60_000,
      async () => {
        ctx.events.emit('timerTransition', memberId, 'idle_nudge');
      },
    );
  }
}

async function handleBreakToWork(
  memberId: string,
  _timer: ActiveTimer,
  db: ExtendedPrismaClient,
  ctx: ModuleContext,
): Promise<void> {
  const timer = transitionToWork(memberId);
  if (!timer) return;

  // Edit DM with work embed + work buttons
  try {
    if (timer.dmChannelId && timer.dmMessageId) {
      const dmChannel = await fetchDMChannel(ctx.client, timer.dmChannelId);
      if (dmChannel) {
        const message = await dmChannel.messages.fetch(timer.dmMessageId);
        await message.edit({
          embeds: [buildTimerEmbed(timer)],
          components: [buildWorkButtons()],
        });

        // Send "Back to it!" message
        await dmChannel.send(buildWorkResumeMessage());
      }
    }
  } catch (error) {
    ctx.logger.error('[timer] Failed to update DM on break->work transition:', error);
  }

  // Update DB record
  try {
    await updateTimerRecord(db, memberId, {
      totalWorkedMs: timer.totalWorkedMs,
      totalBreakMs: timer.totalBreakMs,
      pomodoroCount: timer.pomodoroCount,
      timerState: timer.state,
    });
  } catch {
    // Non-critical
  }

  // Schedule next work->break transition
  scheduleTransition(
    memberId,
    timer.workDuration * 60_000,
    async () => {
      ctx.events.emit('timerTransition', memberId, 'work_to_break');
    },
  );
}

async function handleIdleNudge(
  memberId: string,
  timer: ActiveTimer,
  ctx: ModuleContext,
): Promise<void> {
  // Send a single gentle DM nudge -- priority is NOT distracting workflow
  try {
    if (timer.dmChannelId) {
      const dmChannel = await fetchDMChannel(ctx.client, timer.dmChannelId);
      if (dmChannel) {
        await dmChannel.send(
          'Your break ended a few minutes ago. Ready to continue or done for now?',
        );
      }
    }
  } catch {
    // Non-critical
  }

  // Schedule the auto-end timeout (remaining time until idleTimeoutMinutes)
  const remainingIdleMs =
    (TIMER_DEFAULTS.idleTimeoutMinutes - TIMER_DEFAULTS.gentleNudgeDelayMinutes) *
    60_000;
  scheduleTransition(memberId, remainingIdleMs, async () => {
    ctx.events.emit('timerTransition', memberId, 'idle_timeout');
  });
}

async function handleIdleTimeout(
  memberId: string,
  _timer: ActiveTimer,
  db: ExtendedPrismaClient,
  ctx: ModuleContext,
): Promise<void> {
  // Auto-end the session -- they worked, just didn't return from break
  const timer = stopTimer(memberId);
  if (!timer) return;

  // Delete ACTIVE DB record
  try {
    await deleteActiveTimerRecord(db, memberId);
  } catch {
    // Non-critical
  }

  // Persist as COMPLETED (they did work, just didn't come back from break)
  const result = await persistTimerSession(db, timer, 'COMPLETED');

  // Update DM with completed embed
  try {
    if (timer.dmChannelId && timer.dmMessageId) {
      const dmChannel = await fetchDMChannel(ctx.client, timer.dmChannelId);
      if (dmChannel) {
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

        await dmChannel.send(
          `Timer auto-ended after idle timeout. ${result.durationMinutes} min worked.${result.xpAwarded > 0 ? ` +${result.xpAwarded} XP` : ''}`,
        );
      }
    }
  } catch {
    // Non-critical
  }

  ctx.events.emit('timerCompleted', memberId, Math.floor(timer.totalWorkedMs / 60_000));
  if (result.leveledUp) {
    ctx.events.emit('levelUp', memberId, result.newRank!, result.oldRank!, 0);
  }
}

// ─── Restart Recovery ──────────────────────────────────────────────────────────

/**
 * Reconstruct active timers from DB on bot restart.
 * For each active session, restores the in-memory state and sends a NEW DM
 * (don't try to edit old one -- Pitfall 5: DM cache cleared on restart).
 */
async function reconstructTimers(
  client: Client,
  db: ExtendedPrismaClient,
  ctx: ModuleContext,
): Promise<number> {
  const activeSessions = await db.timerSession.findMany({
    where: { status: 'ACTIVE' },
  });

  let count = 0;
  for (const session of activeSessions) {
    try {
      // Look up a Discord account for this member
      const account = await db.discordAccount.findFirst({
        where: { memberId: session.memberId },
        select: { discordId: true },
      });
      const discordId = account?.discordId;
      if (!discordId) continue;

      const now = Date.now();
      const elapsedMs = now - session.lastStateChangeAt.getTime();

      // Determine what state the timer should be in based on elapsed time
      // Simple heuristic: if it's been longer than the idle timeout, auto-end
      const totalIdleMs =
        (session.workDuration + session.breakDuration + TIMER_DEFAULTS.idleTimeoutMinutes) *
        60_000;
      if (elapsedMs > totalIdleMs) {
        // Too much time has passed -- end this session
        await db.timerSession.updateMany({
          where: { id: session.id },
          data: { status: 'COMPLETED', endedAt: new Date() },
        });
        continue;
      }

      // Restore in-memory timer with persisted state
      const restoredState = (session.timerState as ActiveTimer['state']) ?? 'working';
      const timer: ActiveTimer = {
        memberId: session.memberId,
        mode: session.mode === 'POMODORO' ? 'pomodoro' : 'proportional',
        state: restoredState,
        prePauseState: (session.prePauseState as ActiveTimer['prePauseState']) ?? (restoredState === 'paused' ? 'working' : null),
        workDuration: session.workDuration,
        breakDuration: session.breakDuration,
        breakRatio: session.breakRatio,
        focus: session.focus,
        goalId: session.goalId,
        currentIntervalStart: new Date(),
        totalWorkedMs: session.totalWorkedMs,
        totalBreakMs: session.totalBreakMs,
        pomodoroCount: session.pomodoroCount,
        dmMessageId: null,
        dmChannelId: null,
        startedAt: session.startedAt,
        remainingMs: null,
      };

      restoreTimer(session.memberId, timer);

      // Send a NEW DM with current state (Pitfall 5: don't edit old message)
      try {
        const user = await client.users.fetch(discordId);
        const dmChannel = await user.createDM();
        // Choose buttons based on restored state
        const recoveryButtons =
          restoredState === 'paused' ? buildPausedButtons()
          : restoredState === 'on_break' ? buildBreakButtons()
          : buildWorkButtons();
        const dmMessage = await dmChannel.send({
          content: 'Bot restarted -- your timer has been restored.',
          embeds: [buildTimerEmbed(timer)],
          components: [recoveryButtons],
        });

        timer.dmMessageId = dmMessage.id;
        timer.dmChannelId = dmChannel.id;

        // Update DB with new DM references
        await updateTimerRecord(db, session.memberId, {
          dmMessageId: dmMessage.id,
          dmChannelId: dmChannel.id,
        });
      } catch {
        // If DM fails, the timer is still in memory but the user won't see it
        ctx.logger.warn(`[timer] Could not DM member ${session.memberId} for timer recovery`);
      }

      // Schedule transition based on restored state
      if (restoredState === 'working') {
        const remainingWorkMs = Math.max(0, timer.workDuration * 60_000 - elapsedMs);
        scheduleTransition(session.memberId, remainingWorkMs, async () => {
          ctx.events.emit('timerTransition', session.memberId, 'work_to_break');
        });
      } else if (restoredState === 'on_break') {
        const remainingBreakMs = Math.max(0, timer.breakDuration * 60_000 - elapsedMs);
        scheduleTransition(session.memberId, remainingBreakMs, async () => {
          ctx.events.emit('timerTransition', session.memberId, 'break_to_work');
        });
      }
      // If paused, no transition to schedule -- user must resume

      count++;
    } catch (error) {
      ctx.logger.error(`[timer] Error reconstructing timer for session ${session.id}:`, error);
    }
  }

  return count;
}
