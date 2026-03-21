/**
 * TimerDisplay
 *
 * Running timer display with circular progress ring,
 * countdown, phase label, session dots, and controls.
 */

import { useTimerStore } from '../../stores/timer-store';
import { useTimerTick } from '../../hooks/use-timer-tick';
import { ProgressRing } from './ProgressRing';
import { SessionDots } from './SessionDots';
import { TimerControls } from './TimerControls';

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
    // Determine if we just finished working (going to break) or break (going to work)
    // If phaseDurationMs matches work duration, we're about to work (just finished break)
    // We check by seeing if pomodoroCount increased recently -- simpler: the store sets
    // phaseDurationMs to the NEXT phase duration. If it's break-sized, we finished working.
    const justFinishedWork = phaseDurationMs <= 60 * 60000 && phaseDurationMs !== useTimerStore.getState().workDuration * 60000;
    // Simpler heuristic: if pomodoroCount > 0 and phaseDurationMs < workDuration, it's a break transition
    const workDurationMs = useTimerStore.getState().workDuration * 60000;
    const goingToBreak = phaseDurationMs !== workDurationMs;

    return (
      <div className="flex flex-col items-center gap-6">
        <div className="text-center">
          <p className="text-2xl font-bold text-text-primary mb-2">
            {goingToBreak ? 'Work complete!' : 'Break complete!'}
          </p>
          <p className="text-text-secondary">{focus}</p>
        </div>

        <SessionDots completed={pomodoroCount} total={targetSessions} />

        <button
          onClick={goingToBreak ? transitionToBreak : transitionToWork}
          className="bg-brand hover:bg-brand/90 text-surface-base font-semibold py-3 px-8 rounded-lg transition-colors"
        >
          {goingToBreak ? 'Start Break' : 'Resume Work'}
        </button>

        <button
          onClick={() => stop()}
          className="text-text-tertiary hover:text-error text-sm transition-colors"
        >
          Stop Timer
        </button>
      </div>
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
