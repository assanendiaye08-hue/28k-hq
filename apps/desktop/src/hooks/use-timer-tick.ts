/**
 * Timer Tick Hook
 *
 * Drives 1-second interval updates for the timer countdown.
 * Updates tray title and detects phase completion.
 */

import { useEffect, useRef, useState } from 'react';
import { useTimerStore } from '../stores/timer-store';
import { updateTrayTitle } from '../lib/timer-tray';

interface TimerTick {
  remainingMs: number;
  formattedTime: string;
}

function formatTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0:00';
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export function useTimerTick(): TimerTick {
  const phase = useTimerStore((s) => s.phase);
  const getRemainingMs = useTimerStore((s) => s.getRemainingMs);
  const completePhase = useTimerStore((s) => s.completePhase);

  const [remainingMs, setRemainingMs] = useState(() => getRemainingMs());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (phase === 'working' || phase === 'on_break') {
      // Initial update
      const initial = getRemainingMs();
      setRemainingMs(initial);
      updateTrayTitle(initial).catch(() => {});

      intervalRef.current = setInterval(() => {
        const remaining = getRemainingMs();
        setRemainingMs(remaining);
        updateTrayTitle(remaining).catch(() => {});

        if (remaining <= 0) {
          completePhase();
        }
      }, 1000);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    }

    // Not in active phase -- clear tray and reset
    updateTrayTitle(null).catch(() => {});
    if (phase === 'paused') {
      setRemainingMs(getRemainingMs());
    } else {
      setRemainingMs(0);
    }

    return undefined;
  }, [phase, getRemainingMs, completePhase]);

  return {
    remainingMs,
    formattedTime: formatTime(remainingMs),
  };
}
