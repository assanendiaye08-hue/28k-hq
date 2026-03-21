/**
 * TimerDisplay
 *
 * Running timer display with circular progress ring,
 * countdown, phase label, session dots, and controls.
 * Shows TimerTransition screen between phases.
 */

import { useTimerStore } from '../../stores/timer-store';
import { useTimerTick } from '../../hooks/use-timer-tick';
import { ProgressRing } from './ProgressRing';
import { SessionDots } from './SessionDots';
import { TimerControls } from './TimerControls';
import { TimerTransition } from './TimerTransition';

export function TimerDisplay() {
  const phase = useTimerStore((s) => s.phase);
  const phaseDurationMs = useTimerStore((s) => s.phaseDurationMs);
  const pomodoroCount = useTimerStore((s) => s.pomodoroCount);
  const targetSessions = useTimerStore((s) => s.targetSessions);
  const focus = useTimerStore((s) => s.focus);
  const pause = useTimerStore((s) => s.pause);
  const resume = useTimerStore((s) => s.resume);
  const stop = useTimerStore((s) => s.stop);
  const transitionToBreak = useTimerStore((s) => s.transitionToBreak);
  const transitionToWork = useTimerStore((s) => s.transitionToWork);
  const isLongBreak = useTimerStore((s) => s.isLongBreak);
  const transitionType = useTimerStore((s) => s.transitionType);
  const lastStopResult = useTimerStore((s) => s.lastStopResult);
  const clearLastStopResult = useTimerStore((s) => s.clearLastStopResult);

  const { remainingMs, formattedTime } = useTimerTick();

  const progress = phaseDurationMs > 0 ? 1 - remainingMs / phaseDurationMs : 0;

  // Phase label
  const phaseLabel = (() => {
    switch (phase) {
      case 'working':
        return { text: 'Working', color: 'text-brand' };
      case 'on_break':
        return { text: isLongBreak() ? 'Long Break' : 'Break', color: 'text-success' };
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
          pomodoroCount={pomodoroCount}
          targetSessions={targetSessions}
          xpAwarded={lastStopResult?.xpAwarded}
          leveledUp={lastStopResult?.leveledUp}
          newRank={lastStopResult?.newRank}
          onDismiss={clearLastStopResult}
        />
      );
    }

    if (transitionType === 'work_done') {
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
    <div className="flex flex-col items-center gap-6">
      {/* Progress Ring with countdown */}
      <ProgressRing progress={progress} color={ringColor}>
        <span className="text-4xl font-mono font-bold text-text-primary">
          {formattedTime}
        </span>
      </ProgressRing>

      {/* Phase label */}
      <p className={`text-lg font-semibold ${phaseLabel.color}`}>
        {phaseLabel.text}
      </p>

      {/* Focus text */}
      <p className="text-text-secondary text-sm">{focus}</p>

      {/* Session dots */}
      <SessionDots completed={pomodoroCount} total={targetSessions} />

      {/* Controls */}
      <TimerControls
        onPause={() => pause()}
        onResume={() => resume()}
        onStop={() => stop()}
        isPaused={phase === 'paused'}
      />
    </div>
  );
}
