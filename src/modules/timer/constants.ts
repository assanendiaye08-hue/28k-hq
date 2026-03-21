/**
 * Timer Constants
 *
 * Default configuration values for the productivity timer.
 * Supports both Pomodoro (structured cycles) and Proportional
 * (free-form work with ratio-based breaks) modes.
 */

export const TIMER_DEFAULTS = {
  /** Default work interval in minutes (standard Pomodoro). */
  defaultWorkMinutes: 25,

  /** Default break interval in minutes (standard Pomodoro). */
  defaultBreakMinutes: 5,

  /** Default break ratio for proportional mode (break = work_time / ratio). */
  defaultBreakRatio: 5,

  /** Minimum allowed work interval in minutes. */
  minWorkMinutes: 1,

  /** Maximum allowed work interval in minutes (3 hours). */
  maxWorkMinutes: 180,

  /** Minimum allowed break interval in minutes. */
  minBreakMinutes: 1,

  /** Maximum allowed break interval in minutes. */
  maxBreakMinutes: 60,

  /** Auto-end session after break expires + this many minutes of inactivity. */
  idleTimeoutMinutes: 15,

  /** Send one gentle nudge this many minutes after break ends, then auto-end at idleTimeout. */
  gentleNudgeDelayMinutes: 5,
} as const;
