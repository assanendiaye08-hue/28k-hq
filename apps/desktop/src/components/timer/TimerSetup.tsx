/**
 * TimerSetup
 *
 * Configuration form for starting a timer session.
 * Supports Pomodoro (structured cycles) and Flowmodoro (count-up with ratio breaks).
 */

import { useState, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useTimerStore, type TimerMode } from '../../stores/timer-store';
import { useGoalsStore } from '../../stores/goals-store';
import { TIMER_DEFAULTS } from '@28k/shared';
import { preloadAlarm } from '../../lib/timer-audio';
import { Card } from '../common/Card';

export function TimerSetup() {
  const start = useTimerStore((s) => s.start);
  const goals = useGoalsStore((s) => s.goals);
  const fetchGoals = useGoalsStore((s) => s.fetchGoals);

  const [timerMode, setTimerMode] = useState<TimerMode>('pomodoro');
  const [focus, setFocus] = useState('');
  const [goalId, setGoalId] = useState<string | null>(null);

  // Fetch goals on mount for the dropdown
  useEffect(() => { fetchGoals(); }, [fetchGoals]);
  const [workDuration, setWorkDuration] = useState<number>(TIMER_DEFAULTS.defaultWorkMinutes);
  const [breakDuration, setBreakDuration] = useState<number>(TIMER_DEFAULTS.defaultBreakMinutes);
  const [longBreakDuration, setLongBreakDuration] = useState(15);
  const [longBreakInterval, setLongBreakInterval] = useState(4);
  const [targetSessions, setTargetSessions] = useState<number | null>(4);
  const [unlimited, setUnlimited] = useState(false);
  const [autoStartBreak, setAutoStartBreak] = useState(false);
  const [autoStartWork, setAutoStartWork] = useState(false);
  const [breakRatio, setBreakRatio] = useState<number>(TIMER_DEFAULTS.defaultBreakRatio);
  const [focusError, setFocusError] = useState(false);
  const [validationError, setValidationError] = useState('');

  const handleStart = () => {
    if (!focus.trim()) {
      setFocusError(true);
      return;
    }
    setFocusError(false);
    setValidationError('');

    try {
      preloadAlarm();

      if (timerMode === 'flowmodoro') {
        start({
          focus: focus.trim(),
          timerMode: 'flowmodoro',
          breakRatio,
          goalId,
        });
      } else {
        start({
          focus: focus.trim(),
          timerMode: 'pomodoro',
          workDuration,
          breakDuration,
          longBreakDuration,
          longBreakInterval,
          targetSessions: unlimited ? null : targetSessions,
          autoStartBreak,
          autoStartWork,
          goalId,
        });
      }
      // Auto-minimize — timer runs in menu bar, click tray to reopen
      getCurrentWindow().hide().catch(() => {});
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to start timer';
      setValidationError(message);
    }
  };

  const inputClass =
    'bg-surface-2 border border-white/5 rounded-xl px-3 py-2.5 text-text-primary focus:border-brand focus:ring-1 focus:ring-brand/30 outline-none w-full transition-colors';

  const modeBtn = (mode: TimerMode, label: string) => (
    <button
      type="button"
      onClick={() => setTimerMode(mode)}
      className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
        timerMode === mode
          ? 'bg-brand text-surface-base'
          : 'bg-surface-2 text-text-secondary hover:text-text-primary'
      }`}
    >
      {label}
    </button>
  );

  return (
    <Card title="Start Timer">
      <div className="space-y-4">
        {/* Mode Toggle */}
        <div className="flex gap-1 p-1 bg-surface-1 rounded-xl">
          {modeBtn('pomodoro', 'Pomodoro')}
          {modeBtn('flowmodoro', 'Flowmodoro')}
        </div>

        {/* Focus */}
        <div>
          <label className="block text-text-secondary text-sm mb-1">Focus</label>
          <input
            type="text"
            value={focus}
            onChange={(e) => {
              setFocus(e.target.value);
              if (focusError) setFocusError(false);
            }}
            placeholder="What are you working on?"
            className={`${inputClass} ${focusError ? 'border-error' : ''}`}
          />
          {focusError && (
            <p className="text-error text-xs mt-1">Focus is required</p>
          )}
        </div>

        {/* Goal (optional) */}
        {goals.filter(g => g.status === 'ACTIVE').length > 0 && (
          <div>
            <label className="block text-text-secondary text-sm mb-1">Goal (optional)</label>
            <select
              value={goalId ?? ''}
              onChange={(e) => setGoalId(e.target.value || null)}
              className={inputClass}
            >
              <option value="">No goal</option>
              {goals
                .filter(g => g.status === 'ACTIVE')
                .map(g => (
                  <option key={g.id} value={g.id}>{g.title}</option>
                ))}
            </select>
          </div>
        )}

        {timerMode === 'pomodoro' ? (
          <>
            {/* Work duration — hours + minutes */}
            <div>
              <label className="block text-text-secondary text-sm mb-1">Work duration</label>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={3}
                    value={Math.floor(workDuration / 60)}
                    onChange={(e) => {
                      const h = Math.max(0, Math.min(3, Number(e.target.value)));
                      const m = workDuration % 60;
                      setWorkDuration(Math.max(1, Math.min(180, h * 60 + m)));
                    }}
                    className={`${inputClass} w-16 text-center`}
                  />
                  <span className="text-text-tertiary text-sm">h</span>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={workDuration % 60}
                    onChange={(e) => {
                      const h = Math.floor(workDuration / 60);
                      const m = Math.max(0, Math.min(59, Number(e.target.value)));
                      setWorkDuration(Math.max(1, Math.min(180, h * 60 + m)));
                    }}
                    className={`${inputClass} w-16 text-center`}
                  />
                  <span className="text-text-tertiary text-sm">m</span>
                </div>
              </div>
            </div>

            {/* Break duration */}
            <div>
              <label className="block text-text-secondary text-sm mb-1">Break (min)</label>
              <input
                type="number"
                min={1}
                max={60}
                value={breakDuration}
                onChange={(e) => setBreakDuration(Math.max(1, Math.min(60, Number(e.target.value))))}
                className={inputClass}
              />
            </div>

            {/* Long break */}
            <div>
              <label className="block text-text-secondary text-sm mb-1">Long break</label>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={longBreakDuration}
                  onChange={(e) => setLongBreakDuration(Math.max(1, Math.min(60, Number(e.target.value))))}
                  className={inputClass}
                  title="Duration (min)"
                />
                <div className="flex items-center gap-2">
                  <span className="text-text-tertiary text-sm shrink-0">every</span>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={longBreakInterval}
                    onChange={(e) => setLongBreakInterval(Math.max(1, Math.min(12, Number(e.target.value))))}
                    className={inputClass}
                    title="Every N sessions"
                  />
                </div>
              </div>
            </div>

            {/* Sessions */}
            <div>
              <label className="block text-text-secondary text-sm mb-1">Sessions</label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={targetSessions ?? 4}
                  onChange={(e) => setTargetSessions(Math.max(1, Math.min(12, Number(e.target.value))))}
                  disabled={unlimited}
                  className={`${inputClass} ${unlimited ? 'opacity-50' : ''}`}
                />
                <label className="flex items-center gap-2 cursor-pointer shrink-0">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={unlimited}
                    onClick={() => {
                      setUnlimited(!unlimited);
                      if (!unlimited) setTargetSessions(null);
                      else setTargetSessions(4);
                    }}
                    className={`relative w-9 h-5 rounded-full transition-colors ${
                      unlimited ? 'bg-brand' : 'bg-surface-3'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                        unlimited ? 'translate-x-4' : ''
                      }`}
                    />
                  </button>
                  <span className="text-text-secondary text-sm">{unlimited ? '\u221E' : ''}</span>
                </label>
              </div>
            </div>

            {/* Auto-start toggles */}
            <div className="flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoStartBreak}
                  onClick={() => setAutoStartBreak(!autoStartBreak)}
                  className={`relative w-9 h-5 rounded-full transition-colors ${
                    autoStartBreak ? 'bg-brand' : 'bg-surface-3'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      autoStartBreak ? 'translate-x-4' : ''
                    }`}
                  />
                </button>
                <span className="text-text-secondary text-sm">Auto-start break</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoStartWork}
                  onClick={() => setAutoStartWork(!autoStartWork)}
                  className={`relative w-9 h-5 rounded-full transition-colors ${
                    autoStartWork ? 'bg-brand' : 'bg-surface-3'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      autoStartWork ? 'translate-x-4' : ''
                    }`}
                  />
                </button>
                <span className="text-text-secondary text-sm">Auto-start work</span>
              </label>
            </div>
          </>
        ) : (
          /* Flowmodoro mode: only break ratio */
          <div>
            <label className="block text-text-secondary text-sm mb-1">Break ratio</label>
            <input
              type="number"
              min={1}
              max={10}
              value={breakRatio}
              onChange={(e) => setBreakRatio(Math.max(1, Math.min(10, Number(e.target.value))))}
              className={inputClass}
            />
            <p className="text-text-tertiary text-xs mt-1">
              Break = work time / ratio (e.g., 50 min work → 10 min break at 5:1)
            </p>
          </div>
        )}

        {/* Error message */}
        {validationError && (
          <p className="text-error text-sm">{validationError}</p>
        )}

        {/* Start button */}
        <button
          onClick={handleStart}
          className="w-full bg-brand hover:bg-brand/90 text-surface-base font-semibold py-3 px-8 rounded-xl shadow-lg shadow-brand/20 transition-all active:scale-[0.98]"
        >
          Start Timer
        </button>
      </div>
    </Card>
  );
}
