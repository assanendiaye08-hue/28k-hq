---
phase: 18-flowmodoro-goals-editing
plan: 01
subsystem: ui
tags: [zustand, tauri, timer, flowmodoro, count-up]

requires:
  - phase: 17-pomodoro-timer
    provides: "Timer store, tick hook, tray, persistence, setup/display components"
provides:
  - "Flowmodoro count-up timer mode alongside existing pomodoro"
  - "Timer mode toggle (Pomodoro/Flowmodoro) in setup form"
  - "Break ratio config for proportional break calculation"
  - "Elapsed time display in app and menu bar for flow work"
  - "transitionToFlowBreak and skipFlowBreak store actions"
affects: [18-02, timer-sync]

tech-stack:
  added: []
  patterns: ["Dual-mode timer with timerMode discriminant branching"]

key-files:
  created: []
  modified:
    - apps/desktop/src/stores/timer-store.ts
    - apps/desktop/src/hooks/use-timer-tick.ts
    - apps/desktop/src/lib/timer-tray.ts
    - apps/desktop/src/lib/timer-persistence.ts
    - apps/desktop/src/components/timer/TimerSetup.tsx
    - apps/desktop/src/components/timer/TimerDisplay.tsx
    - apps/desktop/src/pages/TimerPage.tsx
    - apps/desktop/src/__tests__/timer-store.test.ts

key-decisions:
  - "Flowmodoro pause stores elapsed (not remaining) in pauseRemainingMs, resume recalculates phaseStartedAt"
  - "Flowmodoro break completion goes directly to session_complete (no multi-session concept)"
  - "Break ratio range 1-10 with default 5 (matching TIMER_DEFAULTS.defaultBreakRatio)"

patterns-established:
  - "timerMode discriminant: all tick, tray, persistence, and display logic branches on timerMode value"
  - "Flowmodoro work_done transition in TimerDisplay is inline Card (not TimerTransition) for custom flow layout"

requirements-completed: [FLW-01, FLW-02, FLW-03, FLW-04, FLW-05, FLW-06]

duration: 6min
completed: 2026-03-22
---

# Phase 18 Plan 01: Flowmodoro Timer Mode Summary

**Dual-mode timer supporting count-up flowmodoro work with ratio-based break calculation alongside existing pomodoro countdown**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-22T05:12:44Z
- **Completed:** 2026-03-22T05:18:32Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Timer store supports both pomodoro and flowmodoro modes with timerMode discriminant
- Flowmodoro start sends mode PROPORTIONAL to API, count-up work has no fixed duration
- Stopping flowmodoro work calculates break from totalWorkedMs / breakRatio and shows transition
- TimerSetup has segmented Pomodoro/Flowmodoro toggle with conditional form fields
- TimerDisplay shows count-up for flow work, countdown for flow break, and custom transition
- 13 tests pass (7 existing pomodoro + 6 new flowmodoro)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend timer store, persistence, tray, and tick hook for flowmodoro mode** - `73e50de` (feat)
2. **Task 2: Add mode toggle to TimerSetup and mode-aware TimerDisplay** - `657ad3d` (feat)

## Files Created/Modified
- `apps/desktop/src/stores/timer-store.ts` - Added timerMode, breakRatio, getElapsedMs, transitionToFlowBreak, skipFlowBreak; flowmodoro branching in start/stop/pause/resume/restore
- `apps/desktop/src/hooks/use-timer-tick.ts` - Count-up tick for flow work, exports elapsedMs alongside remainingMs
- `apps/desktop/src/lib/timer-tray.ts` - Added updateTrayTitleElapsed for menu bar elapsed display
- `apps/desktop/src/lib/timer-persistence.ts` - Added timerMode and breakRatio to SavedTimerState
- `apps/desktop/src/components/timer/TimerSetup.tsx` - Pomodoro/Flowmodoro toggle, conditional fields, breakRatio input
- `apps/desktop/src/components/timer/TimerDisplay.tsx` - Mode-aware display: count-up for flow work, inline transition for flow work_done
- `apps/desktop/src/pages/TimerPage.tsx` - Restore handles flowmodoro sessions with phaseDurationMs === 0
- `apps/desktop/src/__tests__/timer-store.test.ts` - 6 new flowmodoro tests

## Decisions Made
- Flowmodoro pause stores elapsed time in pauseRemainingMs (repurposed field), resume reconstructs phaseStartedAt from it
- Flowmodoro break completion goes directly to session_complete transition (no multi-session concept in flowmodoro)
- Break ratio constrained to 1-10 range with helper text explaining the ratio math

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Flowmodoro mode is fully functional in desktop app
- Ready for Phase 18 Plan 02 (goals editing)
- Pre-existing DashboardPage.tsx type error is out of scope (unrelated to timer)

---
*Phase: 18-flowmodoro-goals-editing*
*Completed: 2026-03-22*
