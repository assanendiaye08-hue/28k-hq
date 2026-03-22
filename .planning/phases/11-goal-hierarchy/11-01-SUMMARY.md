---
phase: 11-goal-hierarchy
plan: 01
subsystem: database, goals
tags: [prisma, self-relation, hierarchy, cascading-progress, date-fns]

# Dependency graph
requires:
  - phase: 02-daily-engagement-loop
    provides: Goal model, expiry checker, XP engine
  - phase: 04-ai-assistant
    provides: memory context builder, personality prompt builder
provides:
  - GoalTimeframe enum and self-referential Goal hierarchy in Prisma schema
  - Cascading progress engine (recalculateParentProgress) in hierarchy.ts
  - Tree query helpers (goalTreeInclude, validateGoalDepth, getTimeframeDeadline)
  - parentAutoComplete XP constant (50 XP)
  - Hierarchy-aware expiry (leaf goals only)
  - Hierarchy-aware AI context (top-level goals with children indented)
  - Hierarchy fields in data export (parentId, timeframe, depth)
affects: [11-goal-hierarchy, goals, ai-assistant, scheduler, data-privacy, hardening]

# Tech tracking
tech-stack:
  added: []
  patterns: [self-referential-relation, cascading-status-propagation, leaf-only-expiry]

key-files:
  created:
    - src/modules/goals/hierarchy.ts
  modified:
    - prisma/schema.prisma
    - src/modules/xp/constants.ts
    - src/modules/goals/expiry.ts
    - src/modules/ai-assistant/memory.ts
    - src/modules/ai-assistant/personality.ts
    - src/modules/data-privacy/exporter.ts
    - src/modules/hardening/recovery.ts
    - src/modules/scheduler/briefs.ts

key-decisions:
  - "GoalStatus CANCELLED not added (not in existing enum); MISSED children excluded from countable ratio instead"
  - "events parameter optional on checkExpiredGoals for backward compatibility with existing scheduler caller"
  - "Decomposition suggestion added to CONVERSATION_RULES (prompt engineering, no command handler)"

patterns-established:
  - "Leaf-only expiry: parent goals never directly expired; status follows children via cascading"
  - "Top-level filtering: AI context shows parentId===null goals only, children indented below"
  - "Optional hierarchy fields: parentId nullable, timeframe nullable -- standalone goals unchanged"

requirements-completed: [GOAL-01, GOAL-02]

# Metrics
duration: 4min
completed: 2026-03-21
---

# Phase 11 Plan 01: Goal Hierarchy Schema and Cascading Engine Summary

**Self-referential Goal hierarchy with GoalTimeframe enum, cascading progress engine, and hierarchy-aware updates across 8 consuming modules**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-21T01:47:58Z
- **Completed:** 2026-03-21T01:52:34Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Prisma Goal model now supports optional parent-child hierarchy (parentId, timeframe, depth) with GoalHierarchy self-relation
- hierarchy.ts provides cascading progress recalculation that walks up the tree, auto-completing parents when all countable children complete (50 XP)
- All 6 consuming modules updated: expiry/recovery only process leaf goals, AI context shows hierarchy, data export includes new fields

## Task Commits

Each task was committed atomically:

1. **Task 1: Prisma schema migration, hierarchy.ts cascading engine, and XP constant** - `92db4f2` (feat)
2. **Task 2: Update all consuming modules for hierarchy-aware backward compatibility** - `c3feb2d` (feat)

## Files Created/Modified
- `prisma/schema.prisma` - GoalTimeframe enum, parentId/timeframe/depth fields, GoalHierarchy self-relation, parentId index
- `src/modules/goals/hierarchy.ts` - Cascading progress engine, tree include, depth validation, timeframe deadlines
- `src/modules/xp/constants.ts` - parentAutoComplete: 50 XP
- `src/modules/goals/expiry.ts` - Leaf-only expiry with parent recalculation on MISSED
- `src/modules/ai-assistant/memory.ts` - Top-level goals with children indented in context
- `src/modules/ai-assistant/personality.ts` - Timeframe tags, child counts, decomposition suggestion
- `src/modules/data-privacy/exporter.ts` - parentId, timeframe, depth in export
- `src/modules/hardening/recovery.ts` - Leaf-only bulk resolution
- `src/modules/scheduler/briefs.ts` - Timeframe and childCount in brief data

## Decisions Made
- GoalStatus CANCELLED not added (not in existing enum); MISSED children excluded from countable ratio instead
- events parameter on checkExpiredGoals made optional (not required) to maintain backward compatibility with existing scheduler caller that passes only (db, client)
- Decomposition suggestion added to CONVERSATION_RULES string rather than a separate prompt section

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Adjusted CANCELLED status handling in hierarchy.ts**
- **Found during:** Task 1
- **Issue:** Plan referenced CANCELLED status in countable children filter, but GoalStatus enum only has ACTIVE, COMPLETED, MISSED, EXTENDED
- **Fix:** Filter countable children by ACTIVE, EXTENDED, COMPLETED; exclude MISSED (which serves the same purpose as excluding CANCELLED)
- **Files modified:** src/modules/goals/hierarchy.ts
- **Verification:** npx tsc --noEmit passes
- **Committed in:** 92db4f2 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Auto-fix necessary because CANCELLED enum value doesn't exist. Same behavioral outcome -- excluded children don't count toward parent ratio.

## Issues Encountered
- Database not reachable (localhost:5432), so `npx prisma db push` could not run. Schema was validated via `npx prisma generate` and `npx tsc --noEmit` instead. The migration will apply when the database is available.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Schema and hierarchy engine ready for Plan 02 (goal commands: /setgoal with parentId, /subgoal, /goaltree)
- All consuming modules already handle hierarchy gracefully
- Standalone goals continue working identically to v1.0

## Self-Check: PASSED

All 9 files verified present. Both task commits (92db4f2, c3feb2d) verified in git log.

---
*Phase: 11-goal-hierarchy*
*Completed: 2026-03-21*
