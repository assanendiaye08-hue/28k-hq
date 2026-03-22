import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock modules before importing the store
vi.mock('../api/client', () => ({
  apiFetch: vi.fn(() => Promise.resolve({ id: 'server-id-123' })),
}));

vi.mock('../lib/timer-persistence', () => ({
  saveTimerState: vi.fn(() => Promise.resolve()),
  loadTimerState: vi.fn(() => Promise.resolve(null)),
  clearTimerState: vi.fn(() => Promise.resolve()),
}));

vi.mock('../lib/timer-tray', () => ({
  updateTrayTitle: vi.fn(() => Promise.resolve()),
  updateTrayTitleElapsed: vi.fn(() => Promise.resolve()),
}));

vi.mock('../lib/timer-notifications', () => ({
  onPhaseComplete: vi.fn(() => Promise.resolve()),
  onSessionComplete: vi.fn(() => Promise.resolve()),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    show: vi.fn(() => Promise.resolve()),
    setFocus: vi.fn(() => Promise.resolve()),
  })),
}));

vi.mock('@28k/shared', () => ({
  TIMER_DEFAULTS: {
    defaultWorkMinutes: 25,
    defaultBreakMinutes: 5,
    defaultBreakRatio: 5,
  },
}));

import { useTimerStore } from '../stores/timer-store';

describe('timer-store', () => {
  beforeEach(() => {
    useTimerStore.setState({
      phase: 'idle',
      sessionId: null,
      phaseStartedAt: null,
      phaseDurationMs: 0,
      totalWorkedMs: 0,
      totalBreakMs: 0,
      pomodoroCount: 0,
      prePausePhase: null,
      pauseRemainingMs: 0,
      workDuration: 25,
      breakDuration: 5,
      longBreakDuration: 15,
      longBreakInterval: 4,
      targetSessions: null,
      autoStartBreak: false,
      autoStartWork: false,
      focus: '',
      goalId: null,
      transitionType: null,
      lastStopResult: null,
      timerMode: 'pomodoro',
      breakRatio: 5,
    });
  });

  it('start() sets state correctly', () => {
    useTimerStore.getState().start({ focus: 'test', workDuration: 25 });

    const state = useTimerStore.getState();
    expect(state.phase).toBe('working');
    expect(typeof state.phaseStartedAt).toBe('number');
    expect(state.phaseDurationMs).toBe(1500000);
    expect(state.focus).toBe('test');
  });

  it('stop() resets to idle', () => {
    useTimerStore.getState().start({ focus: 'test' });
    useTimerStore.getState().stop();

    const state = useTimerStore.getState();
    expect(state.phase).toBe('idle');
    expect(state.sessionId).toBeNull();
    expect(state.totalWorkedMs).toBe(0);
    expect(state.focus).toBe('');
  });

  it('start -> stop -> start again works', () => {
    useTimerStore.getState().start({ focus: 'first' });
    useTimerStore.getState().stop();
    useTimerStore.getState().start({ focus: 'second' });

    const state = useTimerStore.getState();
    expect(state.phase).toBe('working');
  });

  it('completePhase() from working -> transition', () => {
    useTimerStore.getState().start({ focus: 'test', workDuration: 25 });
    // Force phaseStartedAt to be in the past so elapsed is calculated
    useTimerStore.setState({ phaseStartedAt: Date.now() - 100 });
    useTimerStore.getState().completePhase();

    const state = useTimerStore.getState();
    expect(state.phase).toBe('transition');
    expect(state.pomodoroCount).toBe(1);
    expect(state.transitionType).toBe('work_done');
  });

  it('completePhase() with targetSessions reached', () => {
    useTimerStore.getState().start({
      focus: 'test',
      workDuration: 25,
      targetSessions: 1,
    });
    useTimerStore.setState({ phaseStartedAt: Date.now() - 100 });
    useTimerStore.getState().completePhase();

    const state = useTimerStore.getState();
    expect(state.transitionType).toBe('session_complete');
  });

  it('pause/resume cycle', () => {
    useTimerStore.getState().start({ focus: 'test', workDuration: 25 });
    const prePause = useTimerStore.getState().phase;

    useTimerStore.getState().pause();
    expect(useTimerStore.getState().phase).toBe('paused');

    useTimerStore.getState().resume();
    expect(useTimerStore.getState().phase).toBe(prePause);
  });

  it('getRemainingMs() returns valid numbers', () => {
    // idle: returns 0
    expect(useTimerStore.getState().getRemainingMs()).toBe(0);

    // after start: returns positive number
    useTimerStore.getState().start({ focus: 'test', workDuration: 25 });
    const remaining = useTimerStore.getState().getRemainingMs();
    expect(remaining).toBeGreaterThan(0);
    expect(Number.isNaN(remaining)).toBe(false);
  });

  // ── Flowmodoro Tests ──

  it('start() in flowmodoro mode sets timerMode and breakRatio', () => {
    useTimerStore.getState().start({
      focus: 'flow session',
      timerMode: 'flowmodoro',
      breakRatio: 3,
    });

    const state = useTimerStore.getState();
    expect(state.phase).toBe('working');
    expect(state.timerMode).toBe('flowmodoro');
    expect(state.breakRatio).toBe(3);
    expect(state.phaseDurationMs).toBe(0); // count-up, no fixed duration
    expect(state.focus).toBe('flow session');
  });

  it('stop() during flowmodoro work triggers transition with calculated break', () => {
    useTimerStore.getState().start({
      focus: 'flow work',
      timerMode: 'flowmodoro',
      breakRatio: 5,
    });

    // Simulate 50 minutes of work (3,000,000 ms)
    const workMs = 50 * 60 * 1000;
    useTimerStore.setState({ phaseStartedAt: Date.now() - workMs });

    useTimerStore.getState().stop();

    const state = useTimerStore.getState();
    expect(state.phase).toBe('transition');
    expect(state.transitionType).toBe('work_done');
    // Break should be ~10 minutes (50 min / 5 ratio = 10 min = 600,000 ms)
    // Allow some tolerance for test execution time
    expect(state.phaseDurationMs).toBeGreaterThan(590000);
    expect(state.phaseDurationMs).toBeLessThan(610000);
    expect(state.totalWorkedMs).toBeGreaterThan(workMs - 1000);
  });

  it('transitionToFlowBreak() starts countdown break', () => {
    useTimerStore.getState().start({
      focus: 'flow work',
      timerMode: 'flowmodoro',
      breakRatio: 5,
    });

    // Simulate work and stop
    useTimerStore.setState({ phaseStartedAt: Date.now() - 300000 }); // 5 min
    useTimerStore.getState().stop(); // triggers transition

    // Now transition to break
    useTimerStore.getState().transitionToFlowBreak();

    const state = useTimerStore.getState();
    expect(state.phase).toBe('on_break');
    expect(typeof state.phaseStartedAt).toBe('number');
    expect(state.phaseDurationMs).toBeGreaterThan(0); // calculated break duration
    expect(state.transitionType).toBeNull();
  });

  it('skipFlowBreak() goes to idle', () => {
    useTimerStore.getState().start({
      focus: 'flow work',
      timerMode: 'flowmodoro',
      breakRatio: 5,
    });

    // Simulate work and stop
    useTimerStore.setState({ phaseStartedAt: Date.now() - 300000 });
    useTimerStore.getState().stop();

    // Skip break
    useTimerStore.getState().skipFlowBreak();

    const state = useTimerStore.getState();
    expect(state.phase).toBe('idle');
    expect(state.timerMode).toBe('pomodoro'); // reset to default
    expect(state.focus).toBe('');
  });

  it('getElapsedMs() returns elapsed time from phaseStartedAt', () => {
    // idle: returns 0
    expect(useTimerStore.getState().getElapsedMs()).toBe(0);

    // after flowmodoro start: returns elapsed
    useTimerStore.getState().start({
      focus: 'flow test',
      timerMode: 'flowmodoro',
    });

    const elapsed = useTimerStore.getState().getElapsedMs();
    expect(elapsed).toBeGreaterThanOrEqual(0);
    expect(elapsed).toBeLessThan(1000); // just started
  });

  it('flowmodoro break completePhase() triggers session_complete', () => {
    useTimerStore.getState().start({
      focus: 'flow work',
      timerMode: 'flowmodoro',
      breakRatio: 5,
    });

    // Simulate: work -> stop -> transition -> start break -> break completes
    useTimerStore.setState({
      phase: 'on_break',
      phaseStartedAt: Date.now() - 100,
      phaseDurationMs: 60000,
      totalWorkedMs: 300000,
      timerMode: 'flowmodoro',
    });

    useTimerStore.getState().completePhase();

    const state = useTimerStore.getState();
    expect(state.phase).toBe('transition');
    expect(state.transitionType).toBe('session_complete');
  });
});
