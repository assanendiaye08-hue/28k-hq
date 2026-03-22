/**
 * Timer Store
 *
 * Zustand store managing the full pomodoro timer lifecycle:
 * idle -> working -> on_break -> paused -> transition
 *
 * Uses timestamp-based countdown (never counts ticks).
 * Persists state on every change for restart recovery.
 * Syncs session lifecycle to the REST API.
 */

import { create } from 'zustand';
import { apiFetch } from '../api/client';
import { TIMER_DEFAULTS } from '@28k/shared';
import {
  saveTimerState,
  loadTimerState,
  clearTimerState,
  type SavedTimerState,
} from '../lib/timer-persistence';
import { updateTrayTitle, updateTrayTitleElapsed } from '../lib/timer-tray';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { onPhaseComplete, onSessionComplete } from '../lib/timer-notifications';

// ─── Types ──────────────────────────────────────────────────────────────────

export type TimerPhase = 'idle' | 'working' | 'on_break' | 'paused' | 'transition';
export type TransitionType = 'work_done' | 'break_done' | 'session_complete' | null;

interface StopResponse {
  xpAwarded: number;
  leveledUp: boolean;
  newRank: { name: string; color: number } | null;
}

interface LastStopResult {
  xpAwarded: number;
  leveledUp: boolean;
  newRank: string | null;
}

export type TimerMode = 'pomodoro' | 'flowmodoro';

interface StartConfig {
  workDuration?: number;
  breakDuration?: number;
  longBreakDuration?: number;
  longBreakInterval?: number;
  targetSessions?: number | null;
  autoStartBreak?: boolean;
  autoStartWork?: boolean;
  focus: string;
  goalId?: string | null;
  timerMode?: TimerMode;
  breakRatio?: number;
}

interface TimerState {
  // Phase state
  phase: TimerPhase;
  sessionId: string | null;
  phaseStartedAt: number | null;
  phaseDurationMs: number;
  totalWorkedMs: number;
  totalBreakMs: number;
  pomodoroCount: number;
  prePausePhase: TimerPhase | null;
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
  timerMode: TimerMode;
  breakRatio: number;

  // Transition state
  transitionType: TransitionType;
  lastStopResult: LastStopResult | null;

  // Computed
  getRemainingMs: () => number;
  getElapsedMs: () => number;
  isLongBreak: () => boolean;

  // Actions
  start: (config: StartConfig) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  completePhase: () => void;
  transitionToBreak: () => void;
  transitionToWork: () => void;
  transitionToFlowBreak: () => void;
  skipFlowBreak: () => void;
  restore: (saved: SavedTimerState) => void;
  syncFromPersistence: () => Promise<void>;
  updateFocus: (newFocus: string) => void;
  clearLastStopResult: () => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildSaveState(state: TimerState): SavedTimerState {
  return {
    phase: state.phase,
    sessionId: state.sessionId,
    phaseStartedAt: state.phaseStartedAt,
    phaseDurationMs: state.phaseDurationMs,
    totalWorkedMs: state.totalWorkedMs,
    totalBreakMs: state.totalBreakMs,
    pomodoroCount: state.pomodoroCount,
    prePausePhase: state.prePausePhase,
    pauseRemainingMs: state.pauseRemainingMs,
    workDuration: state.workDuration,
    breakDuration: state.breakDuration,
    longBreakDuration: state.longBreakDuration,
    longBreakInterval: state.longBreakInterval,
    targetSessions: state.targetSessions,
    autoStartBreak: state.autoStartBreak,
    autoStartWork: state.autoStartWork,
    focus: state.focus,
    goalId: state.goalId,
    transitionType: state.transitionType,
    timerMode: state.timerMode,
    breakRatio: state.breakRatio,
  };
}

// ─── Store ──────────────────────────────────────────────────────────────────

export const useTimerStore = create<TimerState>((set, get) => ({
  // Phase state
  phase: 'idle',
  sessionId: null,
  phaseStartedAt: null,
  phaseDurationMs: 0,
  totalWorkedMs: 0,
  totalBreakMs: 0,
  pomodoroCount: 0,
  prePausePhase: null,
  pauseRemainingMs: 0,

  // Config defaults
  workDuration: TIMER_DEFAULTS.defaultWorkMinutes,
  breakDuration: TIMER_DEFAULTS.defaultBreakMinutes,
  longBreakDuration: 15,
  longBreakInterval: 4,
  targetSessions: null,
  autoStartBreak: false,
  autoStartWork: false,
  focus: '',
  goalId: null,
  timerMode: 'pomodoro' as TimerMode,
  breakRatio: TIMER_DEFAULTS.defaultBreakRatio,

  // Transition state
  transitionType: null,
  lastStopResult: null,

  // ── Computed ──

  getRemainingMs: () => {
    const { phase, pauseRemainingMs, phaseStartedAt, phaseDurationMs } = get();
    if (phase === 'paused') return pauseRemainingMs;
    if (phaseStartedAt === null) return 0;
    return Math.max(0, phaseDurationMs - (Date.now() - phaseStartedAt));
  },

  getElapsedMs: () => {
    const { phaseStartedAt } = get();
    return phaseStartedAt ? Date.now() - phaseStartedAt : 0;
  },

  isLongBreak: () => {
    const { longBreakInterval, pomodoroCount } = get();
    return longBreakInterval > 0 && pomodoroCount > 0 && pomodoroCount % longBreakInterval === 0;
  },

  // ── Actions ──

  start: (config) => {
    if (get().phase !== 'idle') {
      throw new Error('A timer is already active. Stop it first.');
    }
    if (!config.focus.trim()) {
      throw new Error('Focus is required to start a timer');
    }

    const timerMode = config.timerMode ?? 'pomodoro';
    const breakRatio = config.breakRatio ?? TIMER_DEFAULTS.defaultBreakRatio;
    const workDuration = config.workDuration ?? TIMER_DEFAULTS.defaultWorkMinutes;
    const breakDuration = config.breakDuration ?? TIMER_DEFAULTS.defaultBreakMinutes;
    const longBreakDuration = config.longBreakDuration ?? 15;
    const longBreakInterval = config.longBreakInterval ?? 4;
    const targetSessions = config.targetSessions ?? null;
    const localSessionId = crypto.randomUUID();

    // Set state IMMEDIATELY — no awaiting API
    set({
      phase: 'working',
      sessionId: localSessionId,
      phaseStartedAt: Date.now(),
      phaseDurationMs: timerMode === 'flowmodoro' ? 0 : workDuration * 60000,
      totalWorkedMs: 0,
      totalBreakMs: 0,
      pomodoroCount: 0,
      prePausePhase: null,
      pauseRemainingMs: 0,
      workDuration,
      breakDuration,
      longBreakDuration,
      longBreakInterval,
      targetSessions,
      autoStartBreak: config.autoStartBreak ?? false,
      autoStartWork: config.autoStartWork ?? false,
      focus: config.focus,
      goalId: config.goalId ?? null,
      timerMode,
      breakRatio,
    });

    saveTimerState(buildSaveState(get())).catch(() => {});

    // Fire API in background — timer works even if server is down
    const apiMode = timerMode === 'flowmodoro' ? 'PROPORTIONAL' : 'POMODORO';
    apiFetch<{ id: string }>('/timer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: apiMode,
        workDuration: timerMode === 'flowmodoro' ? undefined : workDuration,
        breakDuration: timerMode === 'flowmodoro' ? undefined : breakDuration,
        breakRatio: timerMode === 'flowmodoro' ? breakRatio : undefined,
        focus: config.focus,
        goalId: config.goalId || undefined,
        targetSessions: timerMode === 'flowmodoro' ? undefined : (targetSessions ?? undefined),
        longBreakDuration: timerMode === 'flowmodoro' ? undefined : (longBreakDuration ?? undefined),
        longBreakInterval: timerMode === 'flowmodoro' ? undefined : (longBreakInterval ?? undefined),
      }),
    })
      .then((res) => set({ sessionId: res.id }))
      .catch(() => {});
  },

  pause: () => {
    const state = get();
    const { phase, phaseStartedAt, phaseDurationMs, sessionId, totalWorkedMs, totalBreakMs, pomodoroCount, timerMode } = state;

    if (phase !== 'working' && phase !== 'on_break') return;

    const elapsed = phaseStartedAt ? Date.now() - phaseStartedAt : 0;
    const newTotalWorkedMs = phase === 'working' ? totalWorkedMs + elapsed : totalWorkedMs;
    const newTotalBreakMs = phase === 'on_break' ? totalBreakMs + elapsed : totalBreakMs;

    // For flowmodoro work, remaining is meaningless (count-up) -- store elapsed instead
    const isFlowWork = timerMode === 'flowmodoro' && phase === 'working';
    const remaining = isFlowWork ? 0 : Math.max(0, phaseDurationMs - elapsed);

    // Update state immediately
    set({
      phase: 'paused',
      prePausePhase: phase,
      pauseRemainingMs: isFlowWork ? elapsed : remaining,
      totalWorkedMs: newTotalWorkedMs,
      totalBreakMs: newTotalBreakMs,
    });

    // Show frozen time in tray
    if (isFlowWork) {
      updateTrayTitleElapsed(elapsed).catch(() => {});
    } else {
      updateTrayTitle(remaining).catch(() => {});
    }
    saveTimerState(buildSaveState(get())).catch(() => {});

    // Fire API in background
    if (sessionId) {
      apiFetch(`/timer/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'pause',
          remainingMs: remaining,
          totalWorkedMs: newTotalWorkedMs,
          totalBreakMs: newTotalBreakMs,
          pomodoroCount,
          timerState: phase,
        }),
      }).catch(() => {});
    }
  },

  resume: () => {
    const { prePausePhase, pauseRemainingMs, sessionId, timerMode } = get();
    if (!prePausePhase) return;

    const isFlowWork = timerMode === 'flowmodoro' && prePausePhase === 'working';

    // For flowmodoro work resume: phaseStartedAt = now - pausedElapsed (so getElapsedMs continues)
    // For countdown resume: phaseStartedAt = now, phaseDurationMs = pauseRemainingMs
    set({
      phase: prePausePhase,
      phaseStartedAt: isFlowWork ? Date.now() - pauseRemainingMs : Date.now(),
      phaseDurationMs: isFlowWork ? 0 : pauseRemainingMs,
      prePausePhase: null,
      pauseRemainingMs: 0,
    });

    // Immediately sync tray
    if (isFlowWork) {
      updateTrayTitleElapsed(pauseRemainingMs).catch(() => {});
    } else {
      updateTrayTitle(pauseRemainingMs).catch(() => {});
    }
    saveTimerState(buildSaveState(get())).catch(() => {});

    // Fire API in background
    if (sessionId) {
      apiFetch(`/timer/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resume' }),
      }).catch(() => {});
    }
  },

  stop: () => {
    const state = get();
    const { phase, phaseStartedAt, sessionId, totalWorkedMs, totalBreakMs, pomodoroCount, timerMode, breakRatio } = state;

    // Flowmodoro work: stop triggers break calculation transition instead of going idle
    const isFlowWork = timerMode === 'flowmodoro' && (phase === 'working' || (phase === 'paused' && state.prePausePhase === 'working'));
    if (isFlowWork) {
      const elapsed = phase === 'paused' ? state.pauseRemainingMs : (phaseStartedAt ? Date.now() - phaseStartedAt : 0);
      const newTotalWorkedMs = phase === 'paused' ? totalWorkedMs : totalWorkedMs + elapsed;
      const breakDurationMs = Math.round(newTotalWorkedMs / breakRatio);

      set({
        phase: 'transition',
        transitionType: 'work_done',
        phaseStartedAt: null,
        phaseDurationMs: breakDurationMs,
        totalWorkedMs: newTotalWorkedMs,
      });

      updateTrayTitle(null).catch(() => {});
      saveTimerState(buildSaveState(get())).catch(() => {});

      // Show window for transition
      try {
        const win = getCurrentWindow();
        win.show().catch(() => {});
        win.setFocus().catch(() => {});
      } catch { /* ignore */ }
      return;
    }

    // Capture final totals BEFORE resetting
    let finalWorkedMs = totalWorkedMs;
    let finalBreakMs = totalBreakMs;

    if (phaseStartedAt && (phase === 'working' || phase === 'on_break')) {
      const elapsed = Date.now() - phaseStartedAt;
      if (phase === 'working') finalWorkedMs += elapsed;
      if (phase === 'on_break') finalBreakMs += elapsed;
    }

    const capturedSessionId = sessionId;

    // Reset state IMMEDIATELY
    set({
      phase: 'idle',
      sessionId: null,
      phaseStartedAt: null,
      phaseDurationMs: 0,
      totalWorkedMs: 0,
      totalBreakMs: 0,
      pomodoroCount: 0,
      prePausePhase: null,
      pauseRemainingMs: 0,
      focus: '',
      goalId: null,
      transitionType: null,
      lastStopResult: null,
      timerMode: 'pomodoro',
      breakRatio: TIMER_DEFAULTS.defaultBreakRatio,
    });

    // Local cleanup
    clearTimerState().catch(() => {});
    updateTrayTitle(null).catch(() => {});

    // Show window so user can see setup form
    try {
      const win = getCurrentWindow();
      win.show().catch(() => {});
      win.setFocus().catch(() => {});
    } catch { /* ignore if window API unavailable */ }

    // Fire API PATCH in background
    if (capturedSessionId) {
      apiFetch(`/timer/${capturedSessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'stop',
          totalWorkedMs: finalWorkedMs,
          totalBreakMs: finalBreakMs,
          pomodoroCount,
        }),
      }).catch(() => {});
    }
  },

  completePhase: () => {
    // Clear tray immediately on phase completion
    updateTrayTitle(null).catch(() => {});

    const state = get();
    const {
      phase, phaseStartedAt, phaseDurationMs,
      totalWorkedMs, totalBreakMs, pomodoroCount,
      targetSessions, longBreakDuration, longBreakInterval,
      breakDuration, workDuration, autoStartBreak, autoStartWork,
      focus,
    } = state;

    // Flowmodoro work never auto-completes (user stops manually)
    // Flowmodoro break completion -> session complete
    if (get().timerMode === 'flowmodoro' && phase === 'on_break') {
      const elapsed = phaseStartedAt ? Date.now() - phaseStartedAt : phaseDurationMs;
      const newTotalBreakMs = totalBreakMs + elapsed;

      onPhaseComplete('on_break', focus).catch(() => {});

      set({
        totalBreakMs: newTotalBreakMs,
        phase: 'transition',
        transitionType: 'session_complete',
        phaseStartedAt: null,
      });

      // Call stop API to get XP
      const { sessionId } = get();
      if (sessionId) {
        apiFetch<StopResponse>(`/timer/${sessionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'stop',
            totalWorkedMs,
            totalBreakMs: newTotalBreakMs,
            pomodoroCount: 1,
          }),
        })
          .then((res) => {
            set({
              lastStopResult: {
                xpAwarded: res.xpAwarded,
                leveledUp: res.leveledUp,
                newRank: res.newRank?.name ?? null,
              },
            });
            onSessionComplete(focus, res.xpAwarded).catch(() => {});
          })
          .catch(() => {
            set({ lastStopResult: { xpAwarded: 0, leveledUp: false, newRank: null } });
          });
      } else {
        set({ lastStopResult: { xpAwarded: 0, leveledUp: false, newRank: null } });
      }

      saveTimerState(buildSaveState(get())).catch(() => {});
      return;
    }

    if (phase === 'working') {
      const elapsed = phaseStartedAt ? Date.now() - phaseStartedAt : phaseDurationMs;
      const newTotalWorkedMs = totalWorkedMs + elapsed;
      const newPomodoroCount = pomodoroCount + 1;

      // Trigger alarm + foreground for work completion
      onPhaseComplete('working', focus).catch(() => {});

      // Check if target sessions reached
      if (targetSessions !== null && newPomodoroCount >= targetSessions) {
        // Show session complete transition instead of going idle
        set({
          totalWorkedMs: newTotalWorkedMs,
          pomodoroCount: newPomodoroCount,
          phase: 'transition',
          transitionType: 'session_complete',
          phaseStartedAt: null,
        });

        // Call stop API in background to get XP
        const { sessionId } = get();
        if (sessionId) {
          apiFetch<StopResponse>(`/timer/${sessionId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'stop',
              totalWorkedMs: newTotalWorkedMs,
              totalBreakMs,
              pomodoroCount: newPomodoroCount,
            }),
          })
            .then((res) => {
              set({
                lastStopResult: {
                  xpAwarded: res.xpAwarded,
                  leveledUp: res.leveledUp,
                  newRank: res.newRank?.name ?? null,
                },
              });
              onSessionComplete(focus, res.xpAwarded).catch(() => {});
            })
            .catch(() => {
              set({ lastStopResult: { xpAwarded: 0, leveledUp: false, newRank: null } });
            });
        } else {
          set({ lastStopResult: { xpAwarded: 0, leveledUp: false, newRank: null } });
        }

        saveTimerState(buildSaveState(get())).catch(() => {});
        return;
      }

      // Determine break duration
      const isLong = longBreakInterval > 0 && newPomodoroCount > 0 && newPomodoroCount % longBreakInterval === 0;
      const nextBreakMs = (isLong ? longBreakDuration : breakDuration) * 60000;

      if (autoStartBreak) {
        set({
          phase: 'on_break',
          phaseStartedAt: Date.now(),
          phaseDurationMs: nextBreakMs,
          totalWorkedMs: newTotalWorkedMs,
          pomodoroCount: newPomodoroCount,
          transitionType: null,
        });
      } else {
        set({
          phase: 'transition',
          transitionType: 'work_done',
          phaseStartedAt: null,
          phaseDurationMs: nextBreakMs,
          totalWorkedMs: newTotalWorkedMs,
          pomodoroCount: newPomodoroCount,
        });
      }
    } else if (phase === 'on_break') {
      const elapsed = phaseStartedAt ? Date.now() - phaseStartedAt : phaseDurationMs;
      const newTotalBreakMs = totalBreakMs + elapsed;

      // Trigger alarm + foreground for break completion
      onPhaseComplete('on_break', focus).catch(() => {});

      if (autoStartWork) {
        set({
          phase: 'working',
          phaseStartedAt: Date.now(),
          phaseDurationMs: workDuration * 60000,
          totalBreakMs: newTotalBreakMs,
          transitionType: null,
        });
      } else {
        set({
          phase: 'transition',
          transitionType: 'break_done',
          phaseStartedAt: null,
          phaseDurationMs: workDuration * 60000,
          totalBreakMs: newTotalBreakMs,
        });
      }
    }

    saveTimerState(buildSaveState(get())).catch(() => {});
  },

  transitionToBreak: () => {
    const { longBreakDuration, breakDuration } = get();
    const isLong = get().isLongBreak();
    const durationMs = (isLong ? longBreakDuration : breakDuration) * 60000;

    set({
      phase: 'on_break',
      phaseStartedAt: Date.now(),
      phaseDurationMs: durationMs,
      transitionType: null,
    });

    saveTimerState(buildSaveState(get())).catch(() => {});
  },

  transitionToWork: () => {
    const { workDuration } = get();

    set({
      phase: 'working',
      phaseStartedAt: Date.now(),
      phaseDurationMs: workDuration * 60000,
      transitionType: null,
    });

    saveTimerState(buildSaveState(get())).catch(() => {});
  },

  transitionToFlowBreak: () => {
    const { phaseDurationMs } = get();
    // phaseDurationMs was set to calculated break duration during stop -> transition
    set({
      phase: 'on_break',
      phaseStartedAt: Date.now(),
      phaseDurationMs,
      transitionType: null,
    });

    saveTimerState(buildSaveState(get())).catch(() => {});
  },

  skipFlowBreak: () => {
    const { sessionId, totalWorkedMs, totalBreakMs } = get();
    const capturedSessionId = sessionId;

    set({
      phase: 'idle',
      sessionId: null,
      phaseStartedAt: null,
      phaseDurationMs: 0,
      totalWorkedMs: 0,
      totalBreakMs: 0,
      pomodoroCount: 0,
      prePausePhase: null,
      pauseRemainingMs: 0,
      focus: '',
      goalId: null,
      transitionType: null,
      lastStopResult: null,
      timerMode: 'pomodoro',
      breakRatio: TIMER_DEFAULTS.defaultBreakRatio,
    });

    clearTimerState().catch(() => {});
    updateTrayTitle(null).catch(() => {});

    try {
      const win = getCurrentWindow();
      win.show().catch(() => {});
      win.setFocus().catch(() => {});
    } catch { /* ignore */ }

    if (capturedSessionId) {
      apiFetch(`/timer/${capturedSessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'stop',
          totalWorkedMs,
          totalBreakMs,
          pomodoroCount: 1,
        }),
      }).catch(() => {});
    }
  },

  restore: (saved) => {
    set({
      phase: saved.phase as TimerPhase,
      sessionId: saved.sessionId,
      phaseStartedAt: saved.phaseStartedAt,
      phaseDurationMs: saved.phaseDurationMs,
      totalWorkedMs: saved.totalWorkedMs,
      totalBreakMs: saved.totalBreakMs,
      pomodoroCount: saved.pomodoroCount,
      prePausePhase: saved.prePausePhase as TimerPhase | null,
      pauseRemainingMs: saved.pauseRemainingMs,
      workDuration: saved.workDuration,
      breakDuration: saved.breakDuration,
      longBreakDuration: saved.longBreakDuration,
      longBreakInterval: saved.longBreakInterval,
      targetSessions: saved.targetSessions,
      autoStartBreak: saved.autoStartBreak,
      autoStartWork: saved.autoStartWork,
      focus: saved.focus,
      goalId: saved.goalId,
      transitionType: (saved.transitionType as TransitionType) ?? null,
      timerMode: (saved.timerMode as TimerMode) ?? 'pomodoro',
      breakRatio: saved.breakRatio ?? TIMER_DEFAULTS.defaultBreakRatio,
    });

    // If timer was running, check if it should have already completed
    // (flowmodoro work never auto-completes -- user stops manually)
    const { phase, phaseStartedAt, phaseDurationMs, timerMode } = get();
    const isFlowWork = timerMode === 'flowmodoro' && phase === 'working';
    if ((phase === 'working' || phase === 'on_break') && phaseStartedAt && !isFlowWork) {
      const remaining = phaseDurationMs - (Date.now() - phaseStartedAt);
      if (remaining <= 0) {
        get().completePhase();
      }
    }
  },

  syncFromPersistence: async () => {
    const saved = await loadTimerState();
    if (saved) {
      get().restore(saved);
    } else {
      // No persisted state -- timer was stopped externally
      set({
        phase: 'idle',
        sessionId: null,
        phaseStartedAt: null,
        phaseDurationMs: 0,
        totalWorkedMs: 0,
        totalBreakMs: 0,
        pomodoroCount: 0,
        prePausePhase: null,
        pauseRemainingMs: 0,
        focus: '',
        goalId: null,
        transitionType: null,
        lastStopResult: null,
      });
    }
  },

  updateFocus: (newFocus) => {
    set({ focus: newFocus });
    saveTimerState(buildSaveState(get())).catch(() => {});
  },

  clearLastStopResult: () => {
    set({
      phase: 'idle',
      sessionId: null,
      phaseStartedAt: null,
      phaseDurationMs: 0,
      totalWorkedMs: 0,
      totalBreakMs: 0,
      pomodoroCount: 0,
      prePausePhase: null,
      pauseRemainingMs: 0,
      focus: '',
      goalId: null,
      transitionType: null,
      lastStopResult: null,
      timerMode: 'pomodoro',
      breakRatio: TIMER_DEFAULTS.defaultBreakRatio,
    });
    clearTimerState().catch(() => {});
    updateTrayTitle(null).catch(() => {});
    // Show window so user can see setup form
    getCurrentWindow().show().catch(() => {});
    getCurrentWindow().setFocus().catch(() => {});
  },
}));
