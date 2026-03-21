/**
 * Timer Persistence
 *
 * Save/load/clear timer state to @tauri-apps/plugin-store.
 * Uses timer-state.json for restart recovery.
 */

import { load } from '@tauri-apps/plugin-store';

export interface SavedTimerState {
  phase: string;
  sessionId: string | null;
  phaseStartedAt: number | null;
  phaseDurationMs: number;
  totalWorkedMs: number;
  totalBreakMs: number;
  pomodoroCount: number;
  prePausePhase: string | null;
  pauseRemainingMs: number;
  // Config
  workDuration: number;
  breakDuration: number;
  longBreakDuration: number;
  longBreakInterval: number;
  targetSessions: number | null;
  autoStartBreak: boolean;
  autoStartWork: boolean;
  focus: string;
  goalId: string | null;
  transitionType?: string | null;
}

export async function saveTimerState(state: SavedTimerState): Promise<void> {
  const store = await load('timer-state.json', { defaults: {} });
  await store.set('timerState', state);
  await store.save();
}

export async function loadTimerState(): Promise<SavedTimerState | null> {
  const store = await load('timer-state.json', { defaults: {} });
  const saved = await store.get<SavedTimerState>('timerState');
  return saved ?? null;
}

export async function clearTimerState(): Promise<void> {
  const store = await load('timer-state.json', { defaults: {} });
  await store.delete('timerState');
  await store.save();
}
