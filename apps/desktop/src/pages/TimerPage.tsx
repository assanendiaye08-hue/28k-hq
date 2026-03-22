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

      // Note: API restore removed — local persistence is the source of truth.
      // Stale API sessions caused ghost timers on reload.
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
