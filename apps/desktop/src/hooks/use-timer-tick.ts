/**
 * Timer Tick Hook
 *
 * Drives 1-second interval updates for the timer.
 * Supports countdown (pomodoro) and count-up (flowmodoro work).
 * Updates tray title and detects phase completion.
 */

import { useEffect, useRef, useState } from 'react';
import { useTimerStore } from '../stores/timer-store';
import { updateTrayTitle, updateTrayTitleElapsed } from '../lib/timer-tray';

interface TimerTick {
  remainingMs: number;
  elapsedMs: number;
  formattedTime: string;
}

function formatTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0:00';
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0:00';
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function useTimerTick(): TimerTick {
  const phase = useTimerStore((s) => s.phase);
  const timerMode = useTimerStore((s) => s.timerMode);
  const getRemainingMs = useTimerStore((s) => s.getRemainingMs);
  const getElapsedMs = useTimerStore((s) => s.getElapsedMs);
  const completePhase = useTimerStore((s) => s.completePhase);

  const [remainingMs, setRemainingMs] = useState(() => getRemainingMs());
  const [elapsedMs, setElapsedMs] = useState(() => getElapsedMs());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clear interval helper
  const clearTick = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  useEffect(() => {
    const isFlowWork = timerMode === 'flowmodoro' && phase === 'working';

    if (phase === 'working' || phase === 'on_break') {
      if (isFlowWork) {
        // Flowmodoro work: count UP
        const initial = getElapsedMs();
        setElapsedMs(initial);
        setRemainingMs(0);
        updateTrayTitleElapsed(initial).catch(() => {});

        intervalRef.current = setInterval(() => {
          const elapsed = getElapsedMs();
          setElapsedMs(elapsed);
          updateTrayTitleElapsed(elapsed).catch(() => {});
          // No auto-completion -- user stops manually
        }, 1000);
      } else {
        // Pomodoro or flowmodoro break: count DOWN
        const initial = getRemainingMs();
        setRemainingMs(initial);
        setElapsedMs(0);
        updateTrayTitle(initial).catch(() => {});

        intervalRef.current = setInterval(() => {
          const remaining = getRemainingMs();
          setRemainingMs(remaining);
          updateTrayTitle(remaining).catch(() => {});

          if (remaining <= 0) {
            clearTick();
            completePhase();
          }
        }, 1000);
      }

      return () => {
        clearTick();
        updateTrayTitle(null).catch(() => {});
      };
    }

    if (phase === 'paused') {
      if (timerMode === 'flowmodoro' && useTimerStore.getState().prePausePhase === 'working') {
        // Show paused elapsed time
        const pausedElapsed = useTimerStore.getState().pauseRemainingMs;
        setElapsedMs(pausedElapsed);
        setRemainingMs(0);
        updateTrayTitleElapsed(pausedElapsed).catch(() => {});
      } else {
        const paused = getRemainingMs();
        setRemainingMs(paused);
        setElapsedMs(0);
        updateTrayTitle(paused).catch(() => {});
      }
    } else {
      // Not active -- clear tray
      updateTrayTitle(null).catch(() => {});
      setRemainingMs(0);
      setElapsedMs(0);
    }

    return () => {
      updateTrayTitle(null).catch(() => {});
    };
  }, [phase, timerMode, getRemainingMs, getElapsedMs, completePhase]);

  // Determine which time to show as formatted
  const isFlowWork = timerMode === 'flowmodoro' && (phase === 'working' || (phase === 'paused' && useTimerStore.getState().prePausePhase === 'working'));
  const displayMs = isFlowWork ? elapsedMs : remainingMs;

  return {
    remainingMs,
    elapsedMs,
    formattedTime: isFlowWork ? formatElapsed(displayMs) : formatTime(displayMs),
  };
}
