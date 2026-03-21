/**
 * Timer Engine
 *
 * In-memory state machine for productivity timer sessions.
 * Follows the voice-tracker/tracker.ts pattern: active state in a Map,
 * DB persistence on meaningful events (start, transitions, end).
 *
 * State transitions:
 *   createTimer -> working
 *   working -> on_break (transitionToBreak)
 *   on_break -> working (transitionToWork)
 *   working | on_break -> paused (pauseTimer)
 *   paused -> working | on_break (resumeTimer, restores pre-pause state)
 *   working | on_break | paused -> stopped (stopTimer)
 */

import { TIMER_DEFAULTS } from './constants.js';

/** Active timer state held in memory. */
export interface ActiveTimer {
  memberId: string;
  mode: 'pomodoro' | 'proportional';
  state: 'working' | 'on_break' | 'paused';
  /** State before pause, for resume. Only set when state is 'paused'. */
  prePauseState: 'working' | 'on_break' | null;
  workDuration: number;
  breakDuration: number;
  breakRatio: number;
  focus: string | null;
  goalId: string | null;
  currentIntervalStart: Date;
  totalWorkedMs: number;
  totalBreakMs: number;
  pomodoroCount: number;
  dmMessageId: string | null;
  dmChannelId: string | null;
  startedAt: Date;
  /**
   * Remaining duration in ms when paused mid-interval.
   * Used by the caller to re-schedule the transition on resume.
   */
  remainingMs: number | null;
  /** Target number of pomodoro sessions. Null = unlimited. */
  targetSessions: number | null;
}

/** Options for creating a new timer. */
export interface CreateTimerOptions {
  mode: 'pomodoro' | 'proportional';
  workDuration?: number;
  breakDuration?: number;
  breakRatio?: number;
  focus?: string | null;
  goalId?: string | null;
  targetSessions?: number | null;
}

/** In-memory timer map keyed by memberId. */
const activeTimers = new Map<string, ActiveTimer>();

/** Scheduled transition timeouts keyed by memberId. */
const timerTimeouts = new Map<string, NodeJS.Timeout>();

/**
 * Create a new active timer in the in-memory map.
 * Does NOT schedule a timeout -- the caller handles that after sending the DM.
 */
export function createTimer(memberId: string, options: CreateTimerOptions): ActiveTimer {
  const now = new Date();
  const timer: ActiveTimer = {
    memberId,
    mode: options.mode,
    state: 'working',
    prePauseState: null,
    workDuration: options.workDuration ?? TIMER_DEFAULTS.defaultWorkMinutes,
    breakDuration: options.breakDuration ?? TIMER_DEFAULTS.defaultBreakMinutes,
    breakRatio: options.breakRatio ?? TIMER_DEFAULTS.defaultBreakRatio,
    focus: options.focus ?? null,
    goalId: options.goalId ?? null,
    currentIntervalStart: now,
    totalWorkedMs: 0,
    totalBreakMs: 0,
    pomodoroCount: 0,
    dmMessageId: null,
    dmChannelId: null,
    startedAt: now,
    remainingMs: null,
    targetSessions: options.targetSessions ?? null,
  };

  activeTimers.set(memberId, timer);
  return timer;
}

/**
 * Get the active timer for a member, or undefined if none.
 */
export function getActiveTimer(memberId: string): ActiveTimer | undefined {
  return activeTimers.get(memberId);
}

/**
 * Transition a working timer to break state.
 * Accumulates worked time from the current interval, increments pomodoroCount.
 * For proportional mode, calculates break duration from the current work interval.
 * Returns the updated timer or null if no timer or wrong state.
 */
export function transitionToBreak(memberId: string): ActiveTimer | null {
  const timer = activeTimers.get(memberId);
  if (!timer || timer.state !== 'working') return null;

  const now = Date.now();
  const intervalWorkedMs = now - timer.currentIntervalStart.getTime();
  timer.totalWorkedMs += intervalWorkedMs;
  timer.pomodoroCount += 1;

  // For proportional mode, calculate break from current work interval
  if (timer.mode === 'proportional') {
    const intervalWorkedMinutes = intervalWorkedMs / 60_000;
    timer.breakDuration = Math.max(
      TIMER_DEFAULTS.minBreakMinutes,
      Math.min(
        Math.round(intervalWorkedMinutes / timer.breakRatio),
        TIMER_DEFAULTS.maxBreakMinutes,
      ),
    );
  }

  timer.state = 'on_break';
  timer.currentIntervalStart = new Date(now);
  timer.prePauseState = null;
  timer.remainingMs = null;

  return timer;
}

/**
 * Transition a break timer back to working state.
 * Accumulates break time from the current interval.
 * Returns the updated timer or null if no timer or wrong state.
 */
export function transitionToWork(memberId: string): ActiveTimer | null {
  const timer = activeTimers.get(memberId);
  if (!timer || timer.state !== 'on_break') return null;

  const now = Date.now();
  const intervalBreakMs = now - timer.currentIntervalStart.getTime();
  timer.totalBreakMs += intervalBreakMs;

  timer.state = 'working';
  timer.currentIntervalStart = new Date(now);
  timer.prePauseState = null;
  timer.remainingMs = null;

  return timer;
}

/**
 * Pause the timer. Accumulates elapsed time from the current interval
 * and stores the pre-pause state for resume.
 * Clears any scheduled transition timeout.
 * Returns the updated timer or null if no timer or already paused.
 */
export function pauseTimer(memberId: string): ActiveTimer | null {
  const timer = activeTimers.get(memberId);
  if (!timer || timer.state === 'paused') return null;

  const now = Date.now();
  const intervalMs = now - timer.currentIntervalStart.getTime();

  // Store pre-pause state for resume
  timer.prePauseState = timer.state;

  if (timer.state === 'working') {
    timer.totalWorkedMs += intervalMs;
  } else if (timer.state === 'on_break') {
    timer.totalBreakMs += intervalMs;
  }

  // Calculate remaining time in the current interval for re-scheduling on resume
  if (timer.prePauseState === 'working') {
    const totalIntervalMs = timer.workDuration * 60_000;
    timer.remainingMs = Math.max(0, totalIntervalMs - intervalMs);
  } else if (timer.prePauseState === 'on_break') {
    const totalIntervalMs = timer.breakDuration * 60_000;
    timer.remainingMs = Math.max(0, totalIntervalMs - intervalMs);
  }

  timer.state = 'paused';
  timer.currentIntervalStart = new Date(now);

  // Clear any scheduled transition
  clearScheduledTransition(memberId);

  return timer;
}

/**
 * Resume a paused timer. Restores the pre-pause state and sets a new interval start.
 * Returns the updated timer or null if no timer or not paused.
 */
export function resumeTimer(memberId: string): ActiveTimer | null {
  const timer = activeTimers.get(memberId);
  if (!timer || timer.state !== 'paused' || !timer.prePauseState) return null;

  const now = new Date();

  timer.state = timer.prePauseState;
  timer.prePauseState = null;
  timer.currentIntervalStart = now;

  // remainingMs is preserved for the caller to re-schedule the transition

  return timer;
}

/**
 * Stop and remove a timer. Accumulates any final elapsed time.
 * Clears scheduled transition. Returns a snapshot of the final state
 * for persistence, or null if no timer exists.
 */
export function stopTimer(memberId: string): ActiveTimer | null {
  const timer = activeTimers.get(memberId);
  if (!timer) return null;

  const now = Date.now();

  // Accumulate final interval time based on current state
  if (timer.state === 'working') {
    timer.totalWorkedMs += now - timer.currentIntervalStart.getTime();
  } else if (timer.state === 'on_break') {
    timer.totalBreakMs += now - timer.currentIntervalStart.getTime();
  }
  // If paused, time was already accumulated in pauseTimer()

  // Clean up
  clearScheduledTransition(memberId);
  activeTimers.delete(memberId);

  // Return snapshot (timer object is no longer in the map but still valid)
  return timer;
}

/**
 * Schedule a transition callback after a delay.
 * Clears any existing timeout for the member. Stores the handle for cleanup.
 */
export function scheduleTransition(
  memberId: string,
  durationMs: number,
  onTransition: () => Promise<void>,
): void {
  // Clear any existing timeout
  const existing = timerTimeouts.get(memberId);
  if (existing) clearTimeout(existing);

  const timeout = setTimeout(async () => {
    timerTimeouts.delete(memberId);
    try {
      await onTransition();
    } catch (error) {
      console.error(`[Timer] Transition error for member ${memberId}:`, error);
    }
  }, durationMs);

  timerTimeouts.set(memberId, timeout);
}

/**
 * Clear and delete any scheduled transition for a member.
 */
export function clearScheduledTransition(memberId: string): void {
  const existing = timerTimeouts.get(memberId);
  if (existing) {
    clearTimeout(existing);
    timerTimeouts.delete(memberId);
  }
}

/**
 * Get all currently active timers.
 * Used for restart recovery to persist state before shutdown.
 */
export function getAllActiveTimers(): ActiveTimer[] {
  return Array.from(activeTimers.values());
}

/**
 * Restore a timer directly into the in-memory map.
 * Used for restart recovery -- no validation, assumes the caller
 * has reconstructed a valid ActiveTimer from DB state.
 */
export function restoreTimer(memberId: string, timer: ActiveTimer): void {
  activeTimers.set(memberId, timer);
}
