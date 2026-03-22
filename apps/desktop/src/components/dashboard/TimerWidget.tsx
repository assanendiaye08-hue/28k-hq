import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTimerStore } from '../../stores/timer-store';
import { Card } from '../common/Card';

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function TimerWidget() {
  const phase = useTimerStore((s) => s.phase);
  const focus = useTimerStore((s) => s.focus);
  const getRemainingMs = useTimerStore((s) => s.getRemainingMs);
  const getElapsedMs = useTimerStore((s) => s.getElapsedMs);
  const timerMode = useTimerStore((s) => s.timerMode);
  const pomodoroCount = useTimerStore((s) => s.pomodoroCount);
  const navigate = useNavigate();

  // Force re-render every second when timer is active
  const [, setTick] = useState(0);
  useEffect(() => {
    if (phase === 'idle' || phase === 'transition') return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [phase]);

  if (phase === 'idle' || phase === 'transition') {
    return (
      <Card className="cursor-pointer hover:border-white/10 transition-colors" >
        <div
          className="flex items-center justify-between"
          onClick={() => navigate('/timer')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && navigate('/timer')}
        >
          <span className="text-text-tertiary text-sm">No active session</span>
          <span className="text-brand text-sm font-medium hover:text-brand-light transition-colors">
            Start a session
          </span>
        </div>
      </Card>
    );
  }

  // Active timer (working, on_break, paused)
  const isFlowWork = timerMode === 'flowmodoro' && phase === 'working';
  const displayTime = isFlowWork ? formatTime(getElapsedMs()) : formatTime(getRemainingMs());

  const phaseLabel =
    phase === 'working' ? 'Working' :
    phase === 'on_break' ? 'Break' :
    'Paused';

  const phaseColor =
    phase === 'working' ? 'text-brand' :
    phase === 'on_break' ? 'text-success' :
    'text-text-tertiary';

  const sessionLabel = timerMode === 'pomodoro'
    ? `Session ${phase === 'on_break' ? pomodoroCount : pomodoroCount + 1}`
    : null;

  return (
    <Card className="cursor-pointer hover:border-white/10 transition-colors">
      <div
        onClick={() => navigate('/timer')}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && navigate('/timer')}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-text-primary font-medium text-sm truncate">
              {focus || 'Focused work'}
            </span>
            <span className={`text-xs font-medium ${phaseColor}`}>
              {phaseLabel}
            </span>
            {sessionLabel && (
              <span className="text-[10px] uppercase tracking-wider text-text-tertiary bg-surface-2 px-1.5 py-0.5 rounded">
                {sessionLabel}
              </span>
            )}
          </div>
          <span className="text-text-primary font-mono text-lg font-semibold tabular-nums ml-3">
            {displayTime}
          </span>
        </div>
      </div>
    </Card>
  );
}
