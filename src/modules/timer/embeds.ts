/**
 * Timer Embeds
 *
 * Display embeds for the timer DM message across all states.
 * The timer DM is a living message -- edited at transitions to show current state.
 * Also provides short string messages for break/resume notifications.
 */

import { EmbedBuilder } from 'discord.js';
import { BRAND_COLORS } from '../../shared/constants.js';
import type { ActiveTimer } from './engine.js';

/**
 * Build the live timer embed showing current state.
 * Color indicates state: success (working), info (break), warning (paused).
 */
export function buildTimerEmbed(timer: ActiveTimer): EmbedBuilder {
  const stateTitle =
    timer.state === 'working'
      ? 'Focus Mode'
      : timer.state === 'on_break'
        ? 'Break Time'
        : 'Paused';

  const stateColor =
    timer.state === 'working'
      ? BRAND_COLORS.success
      : timer.state === 'on_break'
        ? BRAND_COLORS.info
        : 0xf59e0b; // Amber/warning for paused

  const embed = new EmbedBuilder()
    .setColor(stateColor)
    .setTitle(stateTitle)
    .setTimestamp();

  if (timer.focus) {
    embed.setDescription(`Working on: **${timer.focus}**`);
  }

  // Calculate current worked time including any in-progress interval
  let currentWorkedMs = timer.totalWorkedMs;
  if (timer.state === 'working') {
    currentWorkedMs += Date.now() - timer.currentIntervalStart.getTime();
  }
  const workedMin = Math.floor(currentWorkedMs / 60_000);
  const xpSoFar = Math.floor(workedMin / 5);

  // Live countdown using Discord's relative timestamp (auto-updates in client)
  let countdownField: string;
  if (timer.state === 'paused') {
    countdownField = 'Paused';
  } else if (timer.state === 'working') {
    const endsAt = Math.floor((timer.currentIntervalStart.getTime() + timer.workDuration * 60_000) / 1000);
    countdownField = `<t:${endsAt}:R>`;
  } else {
    // on_break
    const endsAt = Math.floor((timer.currentIntervalStart.getTime() + timer.breakDuration * 60_000) / 1000);
    countdownField = `<t:${endsAt}:R>`;
  }

  const modeLabel = timer.mode === 'pomodoro' ? 'Pomodoro' : 'Free Flow';

  // Session progress for pomodoro
  let sessionField: string | null = null;
  if (timer.mode === 'pomodoro') {
    const current = timer.pomodoroCount + (timer.state === 'working' ? 1 : 0);
    sessionField = timer.targetSessions
      ? `${current}/${timer.targetSessions}`
      : `${current}`;
  }

  embed.addFields(
    { name: 'Ends', value: countdownField, inline: true },
    { name: 'Worked', value: `${workedMin} min`, inline: true },
    { name: 'XP', value: `+${xpSoFar}`, inline: true },
  );

  if (timer.mode === 'pomodoro' && sessionField) {
    embed.addFields(
      { name: 'Session', value: sessionField, inline: true },
      { name: 'Work/Break', value: `${timer.workDuration}/${timer.breakDuration} min`, inline: true },
    );
  } else if (timer.mode === 'proportional') {
    const breakEarned = Math.round(workedMin / timer.breakRatio);
    embed.addFields(
      { name: 'Break earned', value: `${breakEarned} min`, inline: true },
    );
  }

  return embed;
}

/**
 * Build the completed timer summary embed.
 * Shown when a timer session ends (stop or auto-end).
 */
export function buildTimerCompletedEmbed(
  totalWorkedMin: number,
  xpAwarded: number,
  pomodoroCount: number,
  mode: string,
  focus: string | null,
): EmbedBuilder {
  const hours = Math.floor(totalWorkedMin / 60);
  const mins = totalWorkedMin % 60;
  const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  const modeLabel = mode === 'pomodoro' ? 'Pomodoro' : 'Free Flow';

  const embed = new EmbedBuilder()
    .setColor(BRAND_COLORS.success)
    .setTitle(`${timeStr} locked in.`)
    .setTimestamp();

  const descParts: string[] = [];
  if (focus) {
    descParts.push(`Focus: **${focus}**`);
  }
  descParts.push(`+${xpAwarded} XP earned.`);
  embed.setDescription(descParts.join('\n'));

  embed.addFields(
    { name: 'Mode', value: modeLabel, inline: true },
    { name: 'Total Time', value: timeStr, inline: true },
  );

  if (mode === 'pomodoro' && pomodoroCount > 0) {
    embed.addFields(
      { name: 'Intervals', value: `${pomodoroCount} completed`, inline: true },
    );
  }

  return embed;
}

/**
 * Build a short encouraging message for break start.
 * Used as DM notification content (not an embed).
 */
export function buildBreakStartMessage(workedMinutes: number, breakMinutes: number): string {
  return `Nice work -- ${workedMinutes} min locked in. Take ${breakMinutes}.`;
}

/**
 * Build a short message when work resumes after a break.
 * Used as DM notification content (not an embed).
 */
export function buildWorkResumeMessage(): string {
  return 'Back to it!';
}
