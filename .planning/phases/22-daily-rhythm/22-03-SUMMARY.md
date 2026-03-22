---
phase: 22-daily-rhythm
plan: 03
subsystem: scheduler
tags: [weekly-review, coaching-onboarding, planning, timezone, stale-goals]

# Dependency graph
requires:
  - phase: 22-daily-rhythm
    provides: "Outreach budget, coaching config, conversational briefs (plan 01)"
  - phase: 21-conversational-jarvis
    provides: "AI assistant with tool calling, memory service (storeMessage), and callAI"
provides:
  - "Weekly review summary before Sunday planning (goals, commitments, focus time, streak)"
  - "Coaching onboarding flow for first-time DM users (timezone, brief time, coaching level)"
  - "Stale goal detection in nudge module (fixed pre-existing updatedAt bug)"
affects: [23-social-layer]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "AI-generated summaries with template fallback for proactive messages"
    - "Coaching onboarding triggered by first DM without MemberSchedule (not by slash command)"
    - "Timezone alias resolution (EST/PST/city names to IANA strings)"

key-files:
  created: []
  modified:
    - "apps/bot/src/modules/scheduler/planning.ts"
    - "apps/bot/src/modules/onboarding/setup-flow.ts"
    - "apps/bot/src/modules/ai-assistant/index.ts"
    - "apps/bot/src/modules/ai-assistant/nudge.ts"
    - "apps/bot/src/modules/scheduler/index.ts"

key-decisions:
  - "Weekly review uses AI with template fallback -- member always sees data even if AI is degraded"
  - "Stalled goal detection uses createdAt + currentValue since Goal model has no updatedAt field"
  - "Coaching onboarding triggers automatically on first DM (no slash command needed)"
  - "activeCoachingUsers Set prevents DM handler from processing messages during onboarding"

patterns-established:
  - "Proactive data-driven review before conversational interaction (give context, then ask)"
  - "DM-triggered onboarding flow with activeUsers Set guard pattern"

requirements-completed: [RHYTHM-03, SET-03]

# Metrics
duration: 6min
completed: 2026-03-22
---

# Phase 22 Plan 03: Weekly Review and Coaching Onboarding Summary

**Sunday planning opens with AI-generated week review (goals/commitments/focus), and first-time DM users get a 3-question coaching onboarding setting timezone, brief time, and accountability level**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-22T12:05:08Z
- **Completed:** 2026-03-22T12:11:31Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Added buildWeekReview() that queries goals completed/stalled, commitments (fulfilled/missed/pending), check-ins, voice session focus time, and streak direction
- AI-generated review text with template fallback sent before "How did last week go?" question, stored as ConversationMessage for Jarvis context
- Created runCoachingOnboarding() with timezone (IANA alias resolution), morning brief time parsing, and coaching level selection
- First DM without MemberSchedule triggers onboarding automatically; subsequent DMs go through normal chat pipeline
- Fixed pre-existing stale goal detection bug (Goal model has no updatedAt field -- switched to createdAt + currentValue heuristic)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add weekly review summary to Sunday planning session** - `36c017c` (feat)
2. **Task 2: Create coaching onboarding flow for first DM interaction** - `4e8e4f3` (feat)

## Files Created/Modified
- `apps/bot/src/modules/scheduler/planning.ts` - Added buildWeekReview(), generateReviewText(), and review step before "How did last week go?"
- `apps/bot/src/modules/onboarding/setup-flow.ts` - Added runCoachingOnboarding() with timezone aliases, time parsing, coaching level
- `apps/bot/src/modules/ai-assistant/index.ts` - Added coaching onboarding trigger for first-time DM users without MemberSchedule
- `apps/bot/src/modules/ai-assistant/nudge.ts` - Fixed stale goal detection (updatedAt -> createdAt heuristic), included 22-02 graduated pullback
- `apps/bot/src/modules/scheduler/index.ts` - Included 22-02 graduated pullback wiring in evening nudge sweep

## Decisions Made
- Weekly review uses AI with template fallback -- data-driven summary always reaches the member even if AI call fails
- Stalled goal detection uses createdAt + currentValue since Goal model lacks updatedAt: measurable goals with currentValue 0 are stalled, freetext goals older than the week are stalled
- Coaching onboarding is DM-triggered (not slash command) -- lowest friction for new members; /settings available for adjustments afterward
- activeCoachingUsers Set prevents DM handler from re-entering during the onboarding conversation
- Timezone resolution accepts common abbreviations (EST, PST, GMT) and city names (London, Tokyo) via alias map

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Goal.updatedAt reference in stale goal detection**
- **Found during:** Task 1 (weekly review) and Task 2 (nudge.ts build error)
- **Issue:** Goal model in Prisma schema has no `updatedAt` field; code in planning.ts and nudge.ts referenced it causing TS2353 compile error
- **Fix:** Replaced updatedAt-based stalled detection with createdAt + currentValue heuristic: goals created before the review week with currentValue 0 (measurable) or still active (freetext) are considered stalled
- **Files modified:** apps/bot/src/modules/scheduler/planning.ts, apps/bot/src/modules/ai-assistant/nudge.ts
- **Verification:** `npx turbo build --filter=@28k/bot` passes
- **Committed in:** 36c017c (Task 1), 4e8e4f3 (Task 2)

**2. [Rule 3 - Blocking] Included uncommitted 22-02 changes blocking build**
- **Found during:** Task 2 (build verification)
- **Issue:** Pre-existing 22-02 changes in nudge.ts and scheduler/index.ts were in working tree but uncommitted, including stale goal exports and graduated pullback wiring
- **Fix:** Included these changes in Task 2 commit since they were build-blocking prerequisites
- **Files modified:** apps/bot/src/modules/ai-assistant/nudge.ts, apps/bot/src/modules/scheduler/index.ts
- **Verification:** Build passes with all changes included
- **Committed in:** 4e8e4f3 (Task 2)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both auto-fixes necessary for build correctness. No scope creep.

## Issues Encountered

None beyond the auto-fixed deviations above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 22 (Daily Rhythm) is now complete -- all 3 plans done
- Outreach gates, coaching config, weekly review, and coaching onboarding provide full proactive coaching foundation
- Phase 23 (Social Layer) can proceed independently
- Phase 24 (Desktop Enhancement) can proceed independently

## Self-Check: PASSED

All files exist. All commits verified.

---
*Phase: 22-daily-rhythm*
*Completed: 2026-03-22*
