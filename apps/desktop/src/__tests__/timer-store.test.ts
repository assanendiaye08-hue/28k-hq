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
});
