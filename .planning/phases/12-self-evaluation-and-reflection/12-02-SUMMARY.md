---
phase: 12-self-evaluation-and-reflection
plan: 02
subsystem: ai, scheduler, discord-dm
tags: [reflection, ai-personalization, conversational-flow, xp, cron]

# Dependency graph
requires:
  - phase: 12-self-evaluation-and-reflection
    provides: Reflection Prisma model, REFLECTION_CONFIG/XP constants, scheduler scheduleReflection method
  - phase: 07-ai-infrastructure
    provides: Centralized callAI with budget enforcement and structured output
  - phase: 02-daily-engagement-loop
    provides: XP engine awardXP, check-in data for activity summary
provides:
  - AI-personalized reflection question generation from member activity data
  - Conversational DM reflection flow (question -> response -> follow-up -> insight extraction -> DB storage)
  - Daily reflection cron with intensity-based scheduling (medium=Mon/Wed/Fri, heavy=daily)
  - Weekly reflection chained before Sunday planning session
  - Monthly reflection sweep on 28th for medium/heavy members
  - XP awards on reflection completion (daily 15, weekly 30, monthly 50)
affects: [12-03, 13-monthly-recap]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Activity data aggregation pattern for AI-personalized question generation"
    - "Intensity-based day-of-week filtering for tiered scheduling (medium=Mon/Wed/Fri)"
    - "Chained scheduler callbacks (weekly reflection before planning session)"

key-files:
  created:
    - src/modules/reflection/questions.ts
    - src/modules/reflection/flow.ts
    - src/modules/reflection/index.ts
  modified:
    - src/modules/scheduler/index.ts
    - src/shared/ai-types.ts
    - src/modules/xp/engine.ts

key-decisions:
  - "responseFormat uses jsonSchema (camelCase) matching codebase convention"
  - "Weekly reflection chains in makePlanningFn (not in flow.ts) so scheduler handles sequencing"
  - "Medium intensity uses Mon/Wed/Fri heuristic (dayOfWeek 1,3,5) for 3 days/week"
  - "Fallback questions per type when AI degrades (never fails silently)"
  - "Monthly cron at 18:00 UTC on 28th queries medium+heavy members directly"

patterns-established:
  - "Conversational DM flow pattern: generate AI question -> await response -> AI acknowledgment -> optional follow-up -> AI insight extraction -> DB store -> XP award"

requirements-completed: [REFLECT-01, REFLECT-02]

# Metrics
duration: 4min
completed: 2026-03-21
---

# Phase 12 Plan 02: Reflection Conversation Engine Summary

**AI-personalized reflection questions from member activity data, conversational DM flow with insight extraction, and intensity-based scheduler wiring for daily/weekly/monthly reflections**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-21T02:38:01Z
- **Completed:** 2026-03-21T02:41:48Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- AI-personalized question generation that fetches goals, check-ins, timer sessions, voice sessions, streak, and previous reflections to produce specific questions
- Full conversational DM flow: question -> response -> AI acknowledgment with optional follow-up -> insight extraction -> Reflection DB record -> XP award
- Scheduler wiring: daily reflections fire at 8 PM (medium=Mon/Wed/Fri, heavy=daily), weekly reflection chains before Sunday planning, monthly sweep on 28th

## Task Commits

Each task was committed atomically:

1. **Task 1: AI-personalized question generation and reflection DM flow** - `bed35bb` (feat)
2. **Task 2: Reflection module registration and scheduler wiring** - `9986ae9` (feat)

## Files Created/Modified
- `src/modules/reflection/questions.ts` - AI-personalized question generation from member activity data
- `src/modules/reflection/flow.ts` - Full conversational DM reflection flow with response storage and insight extraction
- `src/modules/reflection/index.ts` - Reflection module registration (auto-discovered, no slash commands)
- `src/modules/scheduler/index.ts` - Real reflection callbacks, weekly chaining, monthly cron sweep
- `src/shared/ai-types.ts` - Added 'reflection' to AIFeature type
- `src/modules/xp/engine.ts` - Added 'REFLECTION' to XPSource type

## Decisions Made
- responseFormat uses jsonSchema (camelCase) matching codebase convention from decompose.ts and planning.ts
- Weekly reflection chains in makePlanningFn so scheduler controls sequencing (flow.ts does not call runPlanningSession)
- Medium intensity uses Mon/Wed/Fri (dayOfWeek 1,3,5) heuristic for 3 days/week daily reflections
- Fallback template questions per reflection type (daily/weekly/monthly) when AI degrades or fails
- Monthly cron fires at 18:00 UTC on 28th, querying medium+heavy members directly from DB

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added 'reflection' to AIFeature type**
- **Found during:** Task 1
- **Issue:** AIFeature type in ai-types.ts did not include 'reflection', so callAI with feature: 'reflection' would cause type error
- **Fix:** Added 'reflection' to the AIFeature union type
- **Files modified:** src/shared/ai-types.ts
- **Committed in:** bed35bb (Task 1 commit)

**2. [Rule 2 - Missing Critical] Added 'REFLECTION' to XPSource type**
- **Found during:** Task 1
- **Issue:** XPSource type in engine.ts did not include 'REFLECTION' (already in Prisma schema but not in TS type)
- **Fix:** Added 'REFLECTION' to the XPSource union type
- **Files modified:** src/modules/xp/engine.ts
- **Committed in:** bed35bb (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 missing critical)
**Impact on plan:** Both fixes required for type safety. No scope creep.

## Issues Encountered
None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Reflection records with AI-extracted insights now stored in DB, ready for Plan 12-03 (context enrichment)
- Stored insights available for memory system integration and monthly recap aggregation
- All reflection types (daily/weekly/monthly) fully wired through scheduler

## Self-Check: PASSED

All 6 files verified present. Both task commits (bed35bb, 9986ae9) confirmed in git log.

---
*Phase: 12-self-evaluation-and-reflection*
*Completed: 2026-03-21*
