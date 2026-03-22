/**
 * TimerPage
 *
 * Main timer page that switches between setup form (idle)
 * and running display (working/break/paused/transition).
 * Restores persisted timer state on mount.
 */

import { useEffect } from 'react';
import { useTimerStore } from '../stores/timer-store';
import { loadTimerState } from '../lib/timer-persistence';
import { apiFetch } from '../api/client';
import { TimerSetup } from '../components/timer/TimerSetup';
import { TimerDisplay } from '../components/timer/TimerDisplay';

export function TimerPage() {
  const phase = useTimerStore((s) => s.phase);
  const restore = useTimerStore((s) => s.restore);

  // Restore persisted timer state on mount
  useEffect(() => {
    const restoreState = async () => {
      // First try local persistence
      const saved = await loadTimerState();
      if (saved && saved.phase && saved.phase !== 'idle' && saved.phaseDurationMs > 0) {
        restore(saved);
        return;
      }

      // Fallback: check API for active timer
      try {
        const active = await apiFetch<{
          id: string;
          focus: string;
          workDuration: number;
          breakDuration: number;
          timerState: string;
          remainingMs: number;
          totalWorkedMs: number;
          totalBreakMs: number;
          pomodoroCount: number;
          targetSessions: number | null;
          longBreakDuration: number | null;
          longBreakInterval: number | null;
        } | null>('/timer/active');

        if (active && active.timerState !== 'STOPPED' && active.remainingMs > 0) {
          restore({
            phase: active.timerState === 'PAUSED' ? 'paused' : 'working',
            sessionId: active.id,
            phaseStartedAt: active.timerState === 'PAUSED' ? null : Date.now(),
            phaseDurationMs: active.remainingMs,
            totalWorkedMs: active.totalWorkedMs ?? 0,
            totalBreakMs: active.totalBreakMs ?? 0,
            pomodoroCount: active.pomodoroCount ?? 0,
            prePausePhase: active.timerState === 'PAUSED' ? 'working' : null,
            pauseRemainingMs: active.timerState === 'PAUSED' ? active.remainingMs : 0,
            workDuration: active.workDuration,
            breakDuration: active.breakDuration,
            longBreakDuration: active.longBreakDuration ?? 15,
            longBreakInterval: active.longBreakInterval ?? 4,
            targetSessions: active.targetSessions ?? null,
            autoStartBreak: false,
            autoStartWork: false,
            focus: active.focus,
            goalId: null,
          });
        }
      } catch {
        // API not available -- use local state only
      }
    };

    restoreState();
  }, [restore]);

  return (
    <div className="max-w-lg mx-auto">
      <div key={phase === 'idle' ? 'setup' : 'display'} className="animate-fade-in">
        {phase === 'idle' ? <TimerSetup /> : <TimerDisplay />}
      </div>
    </div>
  );
}
