/**
 * TimerDisplay
 *
 * Running timer display with circular progress ring,
 * countdown/count-up, phase label, session dots, and controls.
 * Shows TimerTransition screen between phases.
 * Supports both Pomodoro (countdown) and Flowmodoro (count-up work).
 */

import { useTimerStore } from '../../stores/timer-store';
import { useTimerTick } from '../../hooks/use-timer-tick';
import { Card } from '../common/Card';
import { ProgressRing } from './ProgressRing';
import { SessionDots } from './SessionDots';
import { TimerControls } from './TimerControls';
import { TimerTransition } from './TimerTransition';

function formatBreakDuration(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

export function TimerDisplay() {
  const phase = useTimerStore((s) => s.phase);
  const phaseDurationMs = useTimerStore((s) => s.phaseDurationMs);
  const workDuration = useTimerStore((s) => s.workDuration);
  const breakDuration = useTimerStore((s) => s.breakDuration);
  const longBreakDuration = useTimerStore((s) => s.longBreakDuration);
  const pomodoroCount = useTimerStore((s) => s.pomodoroCount);
  const targetSessions = useTimerStore((s) => s.targetSessions);
  const focus = useTimerStore((s) => s.focus);
  const pause = useTimerStore((s) => s.pause);
  const resume = useTimerStore((s) => s.resume);
  const stop = useTimerStore((s) => s.stop);
  const transitionToBreak = useTimerStore((s) => s.transitionToBreak);
  const transitionToWork = useTimerStore((s) => s.transitionToWork);
  const transitionToFlowBreak = useTimerStore((s) => s.transitionToFlowBreak);
  const skipFlowBreak = useTimerStore((s) => s.skipFlowBreak);
  const isLongBreak = useTimerStore((s) => s.isLongBreak);
  const transitionType = useTimerStore((s) => s.transitionType);
  const lastStopResult = useTimerStore((s) => s.lastStopResult);
  const clearLastStopResult = useTimerStore((s) => s.clearLastStopResult);
  const timerMode = useTimerStore((s) => s.timerMode);

  const { remainingMs, elapsedMs, formattedTime } = useTimerTick();

  const isFlowmodoro = timerMode === 'flowmodoro';
  const isFlowWork = isFlowmodoro && (phase === 'working' || (phase === 'paused' && useTimerStore.getState().prePausePhase === 'working'));

  // Progress calculation
  let progress: number;
  if (isFlowWork) {
    // No progress ring for flow work (or show subtle fill-up)
    progress = 0;
  } else {
    const originalDurationMs = (phase === 'working' || (phase === 'paused' && useTimerStore.getState().prePausePhase === 'working'))
      ? workDuration * 60000
      : (isLongBreak() ? longBreakDuration : breakDuration) * 60000;
    progress = originalDurationMs > 0 ? 1 - remainingMs / originalDurationMs : 0;
  }

  // Phase label
  const phaseLabel = (() => {
    if (isFlowWork) {
      return { text: 'Flow', color: 'text-brand' };
    }
    switch (phase) {
      case 'working':
        return { text: 'Working', color: 'text-brand' };
      case 'on_break':
        return { text: isFlowmodoro ? 'Break' : (isLongBreak() ? 'Long Break' : 'Break'), color: 'text-success' };
      case 'paused':
        return { text: 'Paused', color: 'text-text-secondary' };
      case 'transition':
        return { text: 'Transition', color: 'text-text-secondary' };
      default:
        return { text: '', color: '' };
    }
  })();

  // Progress ring color
  const ringColor = phase === 'on_break' ? 'var(--color-success)' : 'var(--color-brand)';

  // Transition screen
  if (phase === 'transition') {
    if (transitionType === 'session_complete') {
      return (
        <TimerTransition
          type="session_complete"
          focus={focus}
          pomodoroCount={isFlowmodoro ? 1 : pomodoroCount}
          targetSessions={isFlowmodoro ? 1 : targetSessions}
          xpAwarded={lastStopResult?.xpAwarded}
          leveledUp={lastStopResult?.leveledUp}
          newRank={lastStopResult?.newRank}
          onDismiss={clearLastStopResult}
        />
      );
    }

    if (transitionType === 'work_done') {
      if (isFlowmodoro) {
        // Flowmodoro work_done: show calculated break offer
        return (
          <Card>
            <div className="flex flex-col items-center gap-6 py-4 animate-fade-in">
              <div className="text-center">
                <p className="text-3xl font-bold text-brand mb-2">Flow Complete!</p>
                {focus && <p className="text-text-secondary">{focus}</p>}
                <p className="text-text-tertiary text-sm mt-2">
                  Break: {formatBreakDuration(phaseDurationMs)}
                </p>
              </div>
              <button
                onClick={transitionToFlowBreak}
                className="bg-brand hover:bg-brand-light active:scale-[0.98] text-surface-base font-semibold py-3 px-8 rounded-xl shadow-lg shadow-brand/20 transition-all"
              >
                Start Break
              </button>
              <button
                onClick={skipFlowBreak}
                className="text-text-tertiary hover:text-error text-sm transition-colors"
              >
                Done
              </button>
            </div>
          </Card>
        );
      }

      return (
        <TimerTransition
          type="work_done"
          focus={focus}
          pomodoroCount={pomodoroCount}
          targetSessions={targetSessions}
          isLongBreak={isLongBreak()}
          onStartBreak={transitionToBreak}
          onStop={() => stop()}
        />
      );
    }

    if (transitionType === 'break_done') {
      return (
        <TimerTransition
          type="break_done"
          pomodoroCount={pomodoroCount}
          targetSessions={targetSessions}
          onStartWork={transitionToWork}
          onStop={() => stop()}
        />
      );
    }

    // Fallback for restored state without transitionType (legacy)
    const workDurationMs = useTimerStore.getState().workDuration * 60000;
    const goingToBreak = phaseDurationMs !== workDurationMs;

    return (
      <TimerTransition
        type={goingToBreak ? 'work_done' : 'break_done'}
        focus={focus}
        pomodoroCount={pomodoroCount}
        targetSessions={targetSessions}
        isLongBreak={goingToBreak ? isLongBreak() : false}
        onStartBreak={goingToBreak ? transitionToBreak : undefined}
        onStartWork={goingToBreak ? undefined : transitionToWork}
        onStop={() => stop()}
      />
    );
  }

  return (
    <Card>
      <div className="flex flex-col items-center gap-6 py-4">
        <ProgressRing progress={progress} color={ringColor}>
          <span className="text-4xl font-mono font-bold text-text-primary">
            {formattedTime}
          </span>
        </ProgressRing>

        <p className={`text-lg font-semibold ${phaseLabel.color}`}>
          {phaseLabel.text}
        </p>

        <p className="text-text-secondary text-sm">{focus}</p>

        {!isFlowmodoro && (
          <SessionDots completed={pomodoroCount} total={targetSessions} />
        )}

        <TimerControls
          onPause={() => pause()}
          onResume={() => resume()}
          onStop={() => stop()}
          isPaused={phase === 'paused'}
        />
      </div>
    </Card>
  );
}
