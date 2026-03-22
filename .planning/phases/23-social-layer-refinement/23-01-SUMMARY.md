---
phase: 23-social-layer-refinement
plan: 01
subsystem: social
tags: [streak, consistency-rate, xp, channels, leaderboard]

# Dependency graph
requires:
  - phase: 20-clean-slate
    provides: DM-only private interaction (PRIVATE SPACES obsolete)
  - phase: 22-daily-rhythm
    provides: Daily check-in and reflection flow
provides:
  - Two-day streak grace rule with never-zero reset
  - Consistency rate (30-day rolling window) metric
  - Consolidated 4-category server channel structure
affects: [23-02, 24-desktop-enhancement]

# Tech tracking
tech-stack:
  added: []
  patterns: [two-day-grace-rule, consistency-rate-metric]

key-files:
  created: []
  modified:
    - packages/shared/src/xp-constants.ts
    - apps/bot/src/modules/checkin/streak.ts
    - apps/bot/src/modules/checkin/commands.ts
    - apps/bot/src/modules/leaderboard/renderer.ts
    - apps/bot/src/modules/leaderboard/channel-sync.ts
    - apps/bot/src/modules/leaderboard/commands.ts
    - apps/bot/src/modules/server-setup/channels.ts

key-decisions:
  - "Two-day rule replaces both 7-day reset and weekly grace budget -- simpler mental model"
  - "Consistency rate uses UTC date strings for distinct-day counting (timezone-independent window)"
  - "buildStreakLeaderboardEmbed made async with optional db param -- backward compatible"

patterns-established:
  - "Two-day grace rule: miss 1 day = fine, miss 2+ = break to 1 (never zero)"
  - "Consistency rate pattern: count distinct check-in days over rolling window"

requirements-completed: [SOCIAL-02, SOCIAL-03]

# Metrics
duration: 3min
completed: 2026-03-22
---

# Phase 23 Plan 01: Streak Two-Day Rule and Channel Consolidation Summary

**Two-day streak grace rule with 30-day consistency rate metric, and server channels consolidated from 6 categories to 4**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-22T14:12:19Z
- **Completed:** 2026-03-22T14:15:23Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Streak breaks after 2+ consecutive missed days instead of 7, and never resets to zero (minimum 1)
- Consistency rate (30-day rolling window) calculated and shown in check-in response and streak leaderboard
- Server template reduced from 6 categories / 11 channels to 4 categories / 6 channels
- Removed RESOURCES and PRIVATE SPACES categories, and accountability/lessons channels from THE GRIND

## Task Commits

Each task was committed atomically:

1. **Task 1: Streak two-day rule, never-zero, and consistency rate** - `c7de20e` (feat)
2. **Task 2: Server channel consolidation** - `1468ae9` (feat)

## Files Created/Modified
- `packages/shared/src/xp-constants.ts` - Added missedDaysToBreak, removed graceDaysPerWeek and decayRate
- `apps/bot/src/modules/checkin/streak.ts` - Two-day rule logic, calculateConsistencyRate(), removed calculateGraceDays()
- `apps/bot/src/modules/checkin/commands.ts` - Consistency rate field in check-in embed
- `apps/bot/src/modules/leaderboard/renderer.ts` - Async buildStreakLeaderboardEmbed with consistency rate per member
- `apps/bot/src/modules/leaderboard/channel-sync.ts` - Updated to await async streak embed builder, pass db
- `apps/bot/src/modules/leaderboard/commands.ts` - Updated to await async streak embed builder, pass db
- `apps/bot/src/modules/server-setup/channels.ts` - 4 categories: WELCOME, THE GRIND, VOICE, BOT OPS

## Decisions Made
- Two-day rule replaces both the 7-day reset threshold and the weekly grace budget -- simpler mental model for members
- Consistency rate uses UTC date strings for distinct-day counting rather than timezone-specific calculation (the window is approximate anyway)
- buildStreakLeaderboardEmbed made async with optional db parameter for backward compatibility with empty-entry placeholder calls

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Streak and channel systems ready for Phase 23 Plan 02 (social engagement features)
- No blockers for Phase 24 (desktop enhancement)

## Self-Check: PASSED

All 8 files verified present. Both task commits (c7de20e, 1468ae9) confirmed in git log.

---
*Phase: 23-social-layer-refinement*
*Completed: 2026-03-22*
