---
phase: 09-productivity-timer
plan: 03
subsystem: timer
tags: [ai, natural-language, discord.js, dm-interactions, structured-output]

# Dependency graph
requires:
  - phase: 09-productivity-timer
    provides: Timer engine (createTimer, getActiveTimer), startTimerForMember export, TIMER_DEFAULTS constants
  - phase: 07-ai-infrastructure
    provides: callAI with json_schema responseFormat, AIFeature type with 'timer' entry
provides:
  - Natural language timer parser with keyword pre-filter and AI structured output
  - DM-initiated timer starts ("start a 45 min focus session on coding")
  - Shared timer start path between /timer command and DM handler (no duplication)
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: [keyword pre-filter before AI call to prevent false positives, two-stage NLP with fast regex + AI structured output]

key-files:
  created:
    - src/modules/timer/natural-language.ts
  modified:
    - src/modules/ai-assistant/index.ts

key-decisions:
  - "Keyword pre-filter rejects questions about timers via separate QUESTION_PATTERNS array"
  - "AI parse uses member's own budget (not system) since it is member-initiated"
  - "startTimerForMember reused from timer/index.ts to avoid duplicating timer start logic"

patterns-established:
  - "Two-stage NLP: fast keyword regex gate before expensive AI structured output call"
  - "Question pattern exclusion: separate regex array overrides keyword matches for questions"

requirements-completed: [TIMER-01]

# Metrics
duration: 2min
completed: 2026-03-21
---

# Phase 9 Plan 3: Natural Language Timer Starts Summary

**Two-stage NLP parser (keyword pre-filter + AI structured output) wired into Jarvis DM handler for natural language timer starts**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-21T00:28:16Z
- **Completed:** 2026-03-21T00:30:56Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Natural language timer parser with conservative keyword pre-filter preventing false positives on casual messages
- AI structured output extraction of mode (pomodoro/proportional), duration, break time, and focus text
- DM handler integration that intercepts timer requests before regular Jarvis chat processing
- Shared startTimerForMember function prevents code duplication between /timer command and DM paths

## Task Commits

Each task was committed atomically:

1. **Task 1: Natural language timer parser** - `35faec6` (feat)
2. **Task 2: AI assistant DM integration for timer starts** - `15d819d` (feat)

## Files Created/Modified
- `src/modules/timer/natural-language.ts` - Two-stage parser: isTimerRequest keyword pre-filter + parseTimerRequest AI structured output
- `src/modules/ai-assistant/index.ts` - Added timer intent interception before regular chat, imports from timer module

## Decisions Made
- Keyword pre-filter uses a separate QUESTION_PATTERNS array to reject questions like "how does the timer work?" -- this prevents the override from needing complex negative lookaheads in the main patterns
- AI parse calls use the member's own budget (not 'system') since it is a member-initiated action that should count toward their daily token budget
- Reused startTimerForMember from timer/index.ts (built in Plan 02) instead of duplicating timer start logic in the AI assistant module

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 9 (Productivity Timer) is now fully complete: engine, commands, buttons, XP, restart recovery, and natural language DM starts
- All four TIMER requirements fulfilled across plans 01-03
- Timer module is production-ready pending database migration (prisma migrate dev)

## Self-Check: PASSED

All 2 files verified present. Both task commits (35faec6, 15d819d) verified in git log.

---
*Phase: 09-productivity-timer*
*Completed: 2026-03-21*
