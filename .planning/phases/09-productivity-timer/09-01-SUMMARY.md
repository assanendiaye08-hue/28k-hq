---
phase: 09-productivity-timer
plan: 01
subsystem: timer
tags: [discord.js, prisma, state-machine, pomodoro, buttons, embeds]

# Dependency graph
requires:
  - phase: 03-competition-and-social-proof
    provides: voice-tracker in-memory Map pattern, XP engine, event bus
  - phase: 07-ai-infrastructure
    provides: AIFeature type for timer cost tracking
provides:
  - TimerSession Prisma model with TimerMode/TimerStatus enums
  - TIMER_SESSION XP source in Prisma enum and TypeScript type
  - Timer engine state machine with in-memory Map
  - Button builders for work/break/paused states
  - Timer embed builders for live state and completed summary
  - Timer XP constants (1 XP/5 min, 200 daily cap)
  - Timer events in BotEventMap (timerStarted, timerCompleted, timerCancelled, buttonInteraction)
affects: [09-02 commands-and-interactions, 09-03 persistence-and-recovery]

# Tech tracking
tech-stack:
  added: []
  patterns: [timer state machine with prePauseState for resume, proportional break calculation from work interval / ratio, setTimeout scheduling with cleanup Map]

key-files:
  created:
    - src/modules/timer/constants.ts
    - src/modules/timer/buttons.ts
    - src/modules/timer/embeds.ts
    - src/modules/timer/engine.ts
  modified:
    - prisma/schema.prisma
    - src/modules/xp/engine.ts
    - src/modules/xp/constants.ts
    - src/core/events.ts
    - src/shared/ai-types.ts

key-decisions:
  - "prePauseState field on ActiveTimer to track whether resume goes to working or on_break"
  - "remainingMs field on ActiveTimer so callers can re-schedule transitions after resume"
  - "Proportional break calculated from current work interval only (not cumulative totalWorkedMs)"
  - "Amber/warning color (0xf59e0b) for paused state distinct from success/info"

patterns-established:
  - "Timer state machine: in-memory Map<memberId, ActiveTimer> with separate Map<memberId, Timeout> for scheduled transitions"
  - "Button namespace prefix: timer: for global handler routing"
  - "Encouraging short strings (not embeds) for break/resume DM notification content"

requirements-completed: [TIMER-01, TIMER-02, TIMER-03]

# Metrics
duration: 5min
completed: 2026-03-21
---

# Phase 9 Plan 1: Timer Foundation Summary

**Timer state machine engine with Prisma model, button builders, embed builders, and XP/event type integration**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-21T00:05:21Z
- **Completed:** 2026-03-21T00:10:29Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- TimerSession Prisma model with TimerMode/TimerStatus enums and proper indexes for restart recovery
- Complete timer engine state machine supporting pomodoro and proportional modes with pause/resume
- Button builders for all three timer states (work, break, paused) with timer: prefixed custom IDs
- Timer embeds showing live state (mode, focus, worked time, XP) and completed summary

## Task Commits

Each task was committed atomically:

1. **Task 1: Prisma schema and type system updates** - `55162b7` (feat)
2. **Task 2: Timer engine, constants, buttons, and embeds** - `c88c458` (feat)

## Files Created/Modified
- `prisma/schema.prisma` - Added TimerSession model, TimerMode/TimerStatus enums, TIMER_SESSION to XPSource, relations to Member/Season
- `src/modules/timer/constants.ts` - Timer defaults (25/5 work/break, 5:1 ratio, 15 min idle timeout, 5 min nudge delay)
- `src/modules/timer/buttons.ts` - BUTTON_IDS and builders for work, break, and paused button rows
- `src/modules/timer/embeds.ts` - buildTimerEmbed, buildTimerCompletedEmbed, buildBreakStartMessage, buildWorkResumeMessage
- `src/modules/timer/engine.ts` - ActiveTimer interface, in-memory Map, createTimer, pauseTimer, resumeTimer, stopTimer, transitionToBreak, transitionToWork, scheduleTransition, getAllActiveTimers, restoreTimer
- `src/modules/xp/engine.ts` - Added TIMER_SESSION to XPSource type union
- `src/modules/xp/constants.ts` - Added timer section to XP_AWARDS (1 XP/5 min, 200 daily cap, 5 min minimum)
- `src/core/events.ts` - Added timerStarted, timerCompleted, timerCancelled, buttonInteraction to BotEventMap
- `src/shared/ai-types.ts` - Added 'timer' to AIFeature type union

## Decisions Made
- Added `prePauseState` field to ActiveTimer so resume knows whether to restore 'working' or 'on_break' state
- Added `remainingMs` field to ActiveTimer so callers can re-schedule the correct remaining transition time after resume
- Proportional break duration calculated from current work interval only (not cumulative totalWorkedMs) -- this means each break is proportional to the preceding work sprint, not the entire session
- Used amber/warning color (0xf59e0b) for paused state to visually distinguish from working (green) and break (blue)
- Database migration deferred -- Prisma schema validates but DB is not running locally. Migration will apply on next `prisma migrate dev`

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Database not running locally so `npx prisma migrate dev` could not apply. Schema validates cleanly. Migration will apply automatically on next `prisma migrate dev` when DB is available.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Engine, embeds, and buttons are ready for Plan 02 (commands + interactions) to wire up slash commands and button handler
- Plan 03 (persistence + recovery) can use the engine's getAllActiveTimers/restoreTimer for restart recovery
- Migration must be applied before Plan 03's persistence layer can create/query TimerSession records

## Self-Check: PASSED

All 5 created files verified present. Both task commits (55162b7, c88c458) verified in git log.

---
*Phase: 09-productivity-timer*
*Completed: 2026-03-21*
