---
phase: 13-monthly-progress-recap
plan: 01
subsystem: ai
tags: [ai, recap, cron, discord-embed, aggregation]

# Dependency graph
requires:
  - phase: 07-ai-infrastructure
    provides: callAI centralized client, AIFeature type, budget enforcement
  - phase: 09-productivity-timer
    provides: TimerSession data model for focus hour aggregation
  - phase: 12-self-evaluation-and-reflection
    provides: Reflection data model for recap insights
provides:
  - Monthly recap aggregator querying 6 data sources (check-ins, goals, timers, voice, XP, reflections)
  - AI-generated narrative with adaptive depth (rich vs thin data)
  - Share-to-#wins via trophy reaction (condensed public version)
  - Monthly cron sweep on 1st at 10:00 UTC
affects: []

# Tech tracking
tech-stack:
  added: [date-fns (subMonths, startOfMonth, endOfMonth, format)]
  patterns: [in-memory Map for cross-module state bridging, adaptive AI depth based on data richness]

key-files:
  created:
    - src/modules/recap/constants.ts
    - src/modules/recap/aggregator.ts
    - src/modules/recap/generator.ts
    - src/modules/recap/share.ts
    - src/modules/recap/index.ts
  modified:
    - src/shared/ai-types.ts
    - src/modules/scheduler/index.ts

key-decisions:
  - "pendingRecaps Map exported from generator.ts bridges DM delivery and reaction listener across module files"
  - "Direct DM via user.send() instead of deliverNotification to get Message object back for reaction tracking"
  - "Trophy emoji checked as both Unicode and name 'trophy' for custom/standard emoji compatibility"
  - "Public recap shows stats + Jarvis quote only -- no personal insights, reflections, or suggestions"
  - "Template fallback formats stats as clean text without AI personality when AI is unavailable"

patterns-established:
  - "Adaptive AI depth: MIN_DATA_THRESHOLD controls rich narrative vs brief encouragement"
  - "Quote extraction: AI instructed to prefix with 'Quote:' for reliable parsing"

requirements-completed: [RECAP-01, RECAP-02]

# Metrics
duration: 4min
completed: 2026-03-21
---

# Phase 13 Plan 01: Monthly Progress Recap Summary

**AI-generated monthly recap DM with adaptive depth covering 6 data sources, plus share-to-#wins via trophy reaction**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-21T03:03:59Z
- **Completed:** 2026-03-21T03:07:48Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Monthly data aggregator querying check-ins, goals, timer sessions, voice sessions, XP transactions, and reflections in parallel
- AI recap generator with adaptive depth -- rich data produces detailed narrative + suggestions, thin data produces brief encouragement
- Share-to-#wins via trophy reaction posts condensed stats + one Jarvis quote (no personal details exposed)
- Monthly cron sweep registered in scheduler (1st of each month at 10:00 UTC for all members with schedules)

## Task Commits

Each task was committed atomically:

1. **Task 1: Recap module -- aggregator, AI generator, constants** - `efa4405` (feat)
2. **Task 2: Share-to-#wins reaction listener, module registration, scheduler cron** - `721d9ca` (feat)

## Files Created/Modified
- `src/modules/recap/constants.ts` - Recap config: trophy emoji, cron schedule, data threshold
- `src/modules/recap/aggregator.ts` - MonthlyRecapData interface and aggregateMonthlyData querying 6 tables
- `src/modules/recap/generator.ts` - generateRecap (AI with adaptive depth), sendRecap (DM delivery), pendingRecaps Map
- `src/modules/recap/share.ts` - buildPublicRecap (condensed embed) and shareToWins (#wins poster)
- `src/modules/recap/index.ts` - Module registration with trophy reaction listener
- `src/shared/ai-types.ts` - Added 'recap' to AIFeature union type
- `src/modules/scheduler/index.ts` - Added monthly-recap-sweep cron (1st at 10:00 UTC)

## Decisions Made
- pendingRecaps Map exported from generator.ts to bridge DM delivery and reaction listener -- simpler than a shared state file
- Direct DM via user.send() instead of deliverNotification to get the Message object back for reaction tracking
- Trophy emoji checked as both Unicode code point and name 'trophy' for compatibility with custom/standard emojis
- Public recap intentionally strips personal insights and suggestions -- only stats + Jarvis quote for social proof
- Template fallback produces clean stats text without personality when AI is unavailable or budget exceeded
- Quote extraction uses "Quote:" prefix instruction to AI, with fallback to any quoted line, then a generic default

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- This is the FINAL plan of the v1.1 milestone -- all 13 phases complete
- The monthly progress recap module closes the feedback loop: members accumulate data daily, get a periodic "look how far you've come" moment
- All v1.1 features operational: AI infrastructure, inspiration system, productivity timer, smart reminders, goal hierarchy, self-evaluation, and monthly recap

## Self-Check: PASSED

All 7 created/modified files verified on disk. Both task commits (efa4405, 721d9ca) verified in git log.

---
*Phase: 13-monthly-progress-recap*
*Completed: 2026-03-21*
