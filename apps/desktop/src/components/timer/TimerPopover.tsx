/**
 * TimerPopover
 *
 * Compact timer display for the tray popover window.
 * Loads state from persistence on mount and communicates
 * changes back via Tauri events for cross-window sync.
 */

import { useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { emit } from '@tauri-apps/api/event';
import { useTimerStore } from '../../stores/timer-store';
import { loadTimerState } from '../../lib/timer-persistence';
import { useTimerTick } from '../../hooks/use-timer-tick';
import { ProgressRing } from './ProgressRing';
import { SessionDots } from './SessionDots';
import { TimerControls } from './TimerControls';

function emitStateChanged() {
  emit('timer-state-changed').catch(() => {});
}

export function TimerPopover() {
  const phase = useTimerStore((s) => s.phase);
  const phaseDurationMs = useTimerStore((s) => s.phaseDurationMs);
  const pomodoroCount = useTimerStore((s) => s.pomodoroCount);
  const targetSessions = useTimerStore((s) => s.targetSessions);
  const focus = useTimerStore((s) => s.focus);
  const pause = useTimerStore((s) => s.pause);
  const resume = useTimerStore((s) => s.resume);
  const stop = useTimerStore((s) => s.stop);
  const restore = useTimerStore((s) => s.restore);
  const isLongBreak = useTimerStore((s) => s.isLongBreak);

  const { remainingMs, formattedTime } = useTimerTick();

  // Load persisted state on mount (separate JS context)
  useEffect(() => {
    const init = async () => {
      const saved = await loadTimerState();
      if (saved && saved.phase !== 'idle') {
        restore(saved);
      }
    };
    init();
  }, [restore]);

  const progress = phaseDurationMs > 0 ? 1 - remainingMs / phaseDurationMs : 0;

  const phaseLabel = (() => {
    switch (phase) {
      case 'working':
        return { text: 'Working', color: 'text-brand' };
      case 'on_break':
        return { text: isLongBreak() ? 'Long Break' : 'Break', color: 'text-success' };
      case 'paused':
        return { text: 'Paused', color: 'text-text-secondary' };
      default:
        return { text: '', color: '' };
    }
  })();

  const ringColor = phase === 'on_break' ? 'var(--color-success)' : 'var(--color-brand)';

  const handlePause = async () => {
    await pause();
    emitStateChanged();
  };

  const handleResume = async () => {
    await resume();
    emitStateChanged();
  };

  const handleStop = async () => {
    await stop();
    emitStateChanged();
    getCurrentWindow().close().catch(() => {});
  };

  // If idle (timer was stopped from main window), close popover
  useEffect(() => {
    if (phase === 'idle') {
      // Small delay to avoid closing before store initializes
      const timeout = setTimeout(() => {
        const currentPhase = useTimerStore.getState().phase;
        if (currentPhase === 'idle') {
          getCurrentWindow().close().catch(() => {});
        }
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [phase]);

  return (
    <div className="bg-surface-base text-text-primary p-4 h-screen flex flex-col items-center justify-center gap-4">
      {/* Progress Ring */}
      <ProgressRing progress={progress} size={160} color={ringColor}>
        <span className="text-3xl font-mono font-bold text-text-primary">
          {formattedTime}
        </span>
      </ProgressRing>

      {/* Phase label */}
      <p className={`text-base font-semibold ${phaseLabel.color}`}>
        {phaseLabel.text}
      </p>

      {/* Focus text */}
      <p className="text-text-secondary text-sm text-center truncate max-w-[280px]">
        {focus}
      </p>

      {/* Session dots */}
      <SessionDots completed={pomodoroCount} total={targetSessions} />

      {/* Controls */}
      <TimerControls
        onPause={handlePause}
        onResume={handleResume}
        onStop={handleStop}
        isPaused={phase === 'paused'}
      />
    </div>
  );
}
