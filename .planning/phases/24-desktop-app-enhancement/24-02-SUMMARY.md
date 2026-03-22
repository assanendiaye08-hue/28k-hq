---
phase: 24-desktop-app-enhancement
plan: 02
subsystem: api, ui
tags: [fastify, zustand, react, prisma, polling, ambient-ui]

# Dependency graph
requires:
  - phase: 24-desktop-app-enhancement
    provides: TodayView layout with right sidebar for component placement
provides:
  - GET /activity/grinding API endpoint returning active community members
  - useActivityStore Zustand store for polling grinder data
  - GrindingIndicator component with ambient "who's working" display
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Ambient status indicator pattern: silent load, fail-to-empty, polling refresh"
    - "Merged data sources: combine inFocusSession members with active timer sessions, deduplicate by ID"

key-files:
  created:
    - apps/api/src/routes/activity.ts
    - apps/desktop/src/stores/activity-store.ts
    - apps/desktop/src/components/dashboard/GrindingIndicator.tsx
  modified:
    - apps/api/src/index.ts
    - apps/desktop/src/components/dashboard/TodayView.tsx

key-decisions:
  - "Merged two data sources (inFocusSession + active timers) with deduplication for comprehensive grinder detection"
  - "60-second polling instead of real-time push -- simple, sufficient for ambient awareness"
  - "Silent failure to empty state -- no error UI for non-critical ambient data"

patterns-established:
  - "Ambient indicator pattern: no Card wrapper, border-t separator, green pulsing dot visual anchor"
  - "Activity polling: 60s setInterval with cleanup, fail-silent to empty state"

requirements-completed: [APP-03]

# Metrics
duration: 3min
completed: 2026-03-22
---

# Phase 24 Plan 02: Who's Grinding Indicator Summary

**Activity API endpoint with ambient grinding indicator showing active community members via 60-second polling**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-22T14:38:39Z
- **Completed:** 2026-03-22T14:41:21Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- GET /activity/grinding endpoint merges focus-session and active-timer data with self-exclusion
- Ambient grinding indicator with green pulsing dot, up to 3 member names with focus labels
- 60-second auto-refresh polling with silent failure handling

## Task Commits

Each task was committed atomically:

1. **Task 1: Create activity API endpoint for active grinders** - `caa0a2e` (feat)
2. **Task 2: Build grinding indicator component and wire into Today view** - `831e410` + `18d3272` (feat)

## Files Created/Modified
- `apps/api/src/routes/activity.ts` - GET /grinding endpoint querying members with active sessions
- `apps/api/src/index.ts` - Registered activityRoutes with /activity prefix
- `apps/desktop/src/stores/activity-store.ts` - Zustand store with fetchGrinders action
- `apps/desktop/src/components/dashboard/GrindingIndicator.tsx` - Ambient indicator with pulsing dot and member list
- `apps/desktop/src/components/dashboard/TodayView.tsx` - Added GrindingIndicator below StreakBadge in right sidebar

## Decisions Made
- Merged two data sources (inFocusSession flag + active timer sessions) with Map-based deduplication for comprehensive grinder detection
- 60-second polling interval chosen over real-time push -- appropriate for ambient "library effect" awareness
- Silent failure to empty state -- no error UI since this is non-critical ambient data
- Registered route in index.ts (not server.ts as plan specified) since index.ts is the actual app entry point

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Route registration in index.ts instead of server.ts**
- **Found during:** Task 1
- **Issue:** Plan referenced `apps/api/src/server.ts` but the actual entry point is `apps/api/src/index.ts`
- **Fix:** Registered activityRoutes in index.ts following the same pattern as other routes
- **Files modified:** apps/api/src/index.ts
- **Verification:** TypeScript compilation passes, route registration follows existing pattern
- **Committed in:** caa0a2e (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Trivial file path correction. No scope creep.

## Issues Encountered
- Linter auto-removed unused GrindingIndicator import from TodayView.tsx during initial commit (import was added but component JSX was in same edit batch) -- resolved with follow-up commit

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 24 complete (2/2 plans) -- desktop app enhancement fully shipped
- Desktop app now serves as self-contained execution cockpit: timer, goals, streak, and ambient social awareness
- No blockers for future phases

## Self-Check: PASSED

- All 5 files verified present
- All 3 commits verified in git log

---
*Phase: 24-desktop-app-enhancement*
*Completed: 2026-03-22*
