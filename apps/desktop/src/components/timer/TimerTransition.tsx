/**
 * TimerTransition
 *
 * Full-screen transition card shown between pomodoro phases.
 * Three modes: work_done, break_done, session_complete.
 */

import { SessionDots } from './SessionDots';

interface TimerTransitionProps {
  type: 'work_done' | 'break_done' | 'session_complete';
  onStartBreak?: () => void;
  onStartWork?: () => void;
  onDismiss?: () => void;
  onStop?: () => void;
  xpAwarded?: number;
  pomodoroCount?: number;
  targetSessions?: number | null;
  focus?: string;
  isLongBreak?: boolean;
  leveledUp?: boolean;
  newRank?: string | null;
}

export function TimerTransition({
  type,
  onStartBreak,
  onStartWork,
  onDismiss,
  onStop,
  xpAwarded,
  pomodoroCount,
  targetSessions,
  focus,
  isLongBreak,
  leveledUp,
  newRank,
}: TimerTransitionProps) {
  return (
    <div
      className="flex flex-col items-center gap-6 animate-fade-in"
      style={{ animation: 'fadeIn 0.4s ease-out' }}
    >
      {type === 'work_done' && (
        <>
          <div className="text-center">
            <p className="text-3xl font-bold text-brand mb-2">Work Complete!</p>
            {focus && <p className="text-text-secondary">{focus}</p>}
            {isLongBreak && (
              <p className="text-success text-sm mt-1">Time for a long break (15 min)</p>
            )}
          </div>

          <SessionDots completed={pomodoroCount ?? 0} total={targetSessions ?? null} />

          <button
            onClick={onStartBreak}
            className="bg-brand hover:bg-brand/90 text-surface-base font-semibold py-3 px-8 rounded-lg transition-colors"
          >
            Start Break
          </button>

          <button
            onClick={onStop}
            className="text-text-tertiary hover:text-error text-sm transition-colors"
          >
            Stop Timer
          </button>
        </>
      )}

      {type === 'break_done' && (
        <>
          <div className="text-center">
            <p className="text-3xl font-bold text-success mb-2">Break Over!</p>
            <p className="text-text-secondary">Ready to get back to work?</p>
          </div>

          <SessionDots completed={pomodoroCount ?? 0} total={targetSessions ?? null} />

          <button
            onClick={onStartWork}
            className="bg-brand hover:bg-brand/90 text-surface-base font-semibold py-3 px-8 rounded-lg transition-colors"
          >
            Resume Work
          </button>

          <button
            onClick={onStop}
            className="text-text-tertiary hover:text-error text-sm transition-colors"
          >
            Stop Timer
          </button>
        </>
      )}

      {type === 'session_complete' && (
        <>
          <div className="text-center">
            <p className="text-3xl font-bold text-brand mb-2">All Sessions Complete!</p>
            {focus && <p className="text-text-secondary mb-4">{focus}</p>}
          </div>

          <div className="text-center">
            <p className="text-text-secondary text-sm mb-1">Sessions completed</p>
            <p className="text-2xl font-bold text-text-primary">{pomodoroCount ?? 0}</p>
          </div>

          {xpAwarded !== undefined && xpAwarded > 0 && (
            <div className="text-center">
              <p className="text-text-secondary text-sm mb-1">XP Earned</p>
              <p className="text-3xl font-bold" style={{ color: '#FFD700' }}>
                +{xpAwarded} XP
              </p>
            </div>
          )}

          {leveledUp && newRank && (
            <div className="text-center">
              <p className="text-lg font-semibold text-brand">Rank Up!</p>
              <p className="text-text-primary">{newRank}</p>
            </div>
          )}

          <button
            onClick={onDismiss}
            className="bg-brand hover:bg-brand/90 text-surface-base font-semibold py-3 px-8 rounded-lg transition-colors"
          >
            Done
          </button>
        </>
      )}

      {/* CSS keyframe for fade-in animation */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
