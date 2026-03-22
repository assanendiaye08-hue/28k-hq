---
phase: 22-daily-rhythm
plan: 02
subsystem: coaching
tags: [reflection, nudge, graduated-pullback, stale-goals, open-loops, zeigarnik]

# Dependency graph
requires:
  - phase: 22-daily-rhythm
    provides: "Outreach budget enforcement, coaching config toggles, quiet hours, conversational briefs"
  - phase: 21-conversational-jarvis
    provides: "AI assistant with memory service (storeMessage), topic-aware context assembly"
provides:
  - "Evening reflection open-loop-closing routine: shows commitments/goals, captures tomorrow's priority"
  - "Stale goal detection (5+ days no activity) via findStaleGoals()"
  - "Graduated pullback for disengaged members: 4-7d reduced, 8-14d sparse, 15+d silent"
  - "Tomorrow's priority stored as ConversationMessage with topic 'planning' for morning brief"
affects: [22-daily-rhythm, 23-social-layer]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Open-loop-closing: query today's data (commitments, check-ins, goals), present as context, ask specific closing question"
    - "Graduated pullback curve: silence-duration drives nudge frequency and tone rather than fixed accountability level"
    - "Tomorrow's priority stored as planning-topic ConversationMessage for cross-feature context"

key-files:
  created: []
  modified:
    - "apps/bot/src/modules/reflection/flow.ts"
    - "apps/bot/src/modules/reflection/questions.ts"
    - "apps/bot/src/modules/ai-assistant/nudge.ts"
    - "apps/bot/src/modules/scheduler/index.ts"

key-decisions:
  - "DAILY reflection branches into dedicated runDailyClosingFlow -- WEEKLY/MONTHLY keep existing behavior unchanged"
  - "Stale goal detection uses check-in recency as proxy since Goal model has no updatedAt field"
  - "Graduated pullback returns null for 15+ days (no nudging) vs PullbackTier object for active tiers"
  - "Tomorrow's priority stored with topic 'planning' so morning brief assembleContext naturally surfaces it"

patterns-established:
  - "Open-loop-closing pattern: fetch day's data -> AI builds contextual question -> capture response -> capture next-day priority -> store as conversation messages"
  - "Graduated pullback pattern: getGraduatedPullback(daysSilent) returns tier config or null, checked before any nudge delivery"

requirements-completed: [RHYTHM-02, RHYTHM-04]

# Metrics
duration: 7min
completed: 2026-03-22
---

# Phase 22 Plan 02: Evening Reflection Open-Loop Closure and Graduated Nudge Pullback Summary

**Evening reflection closes the day by showing commitments/goals, asking what got done, capturing tomorrow's priority; stale goal detection and graduated pullback reduce contact for disengaged members**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-22T12:05:22Z
- **Completed:** 2026-03-22T12:12:16Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Evolved DAILY reflection from generic Q&A into structured open-loop-closing routine that shows today's commitments, check-ins, and goals before asking what got done
- Added "What's the ONE thing for tomorrow?" capture -- stored as planning-topic ConversationMessage so morning brief can reference it
- Implemented stale goal detection (5+ days no activity) with check-in recency as staleness proxy
- Added graduated pullback curve: 4-7 days reduced nudging, 8-14 days sparse (1 per 3 days), 15+ days complete silence
- All reflection exchanges and nudges now stored as conversation messages with appropriate topic tags

## Task Commits

Each task was committed atomically:

1. **Task 1: Evolve evening reflection into open-loop-closing routine** - `832a05f` (feat)
2. **Task 2: Add stale goal nudges and graduated pullback** - `4e8e4f3` (feat, merged with parallel 22-03 commit)

## Files Created/Modified
- `apps/bot/src/modules/reflection/flow.ts` - Added runDailyClosingFlow with open-loop summary, closing question, tomorrow's priority capture
- `apps/bot/src/modules/reflection/questions.ts` - Added buildEveningClosingPrompt() and EveningClosingContext interface
- `apps/bot/src/modules/ai-assistant/nudge.ts` - Added findStaleGoals(), getGraduatedPullback(), getDaysSinceLastCheckIn(); modified sendNudge with pullback curve
- `apps/bot/src/modules/scheduler/index.ts` - Evening nudge sweep now checks graduated pullback before calling sendNudge

## Decisions Made
- DAILY reflection branches into a dedicated runDailyClosingFlow function -- WEEKLY and MONTHLY keep the existing question-answer-acknowledge flow unchanged
- Stale goal detection uses check-in recency as proxy (no check-ins in last N days = goals stale) since Goal model lacks updatedAt; measurable goals with progress > 0 are excluded
- Graduated pullback is checked both in sendNudge and in the evening sweep -- defense in depth prevents nudge leaks
- Tomorrow's priority stored with topic 'planning' (not 'reflection') so assembleContext's topic filtering naturally includes it when building morning briefs

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Goal model has no updatedAt field**
- **Found during:** Task 2 (stale goal detection)
- **Issue:** Plan specified querying Goal.updatedAt but the Goal model only has createdAt, completedAt, extendedAt
- **Fix:** Used check-in recency as staleness proxy: if member has no check-ins in threshold period, all goals older than threshold are stale
- **Files modified:** apps/bot/src/modules/ai-assistant/nudge.ts
- **Verification:** Build passes, logic correctly handles the absent field

**2. [Rule 3 - Blocking] Task 2 changes committed by parallel 22-03 execution**
- **Found during:** Task 2 commit
- **Issue:** A parallel plan executor committed the Task 2 file changes as part of its own commit (4e8e4f3)
- **Fix:** Verified all changes are present in the repository and build passes; documented the merged commit
- **Files modified:** None additional
- **Verification:** grep confirms all functions exist, build passes

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Bug fix was necessary for correctness (schema mismatch). Parallel commit was a process issue, not a code issue -- all changes are correctly in the tree.

## Issues Encountered
- Goal model lacks updatedAt field that the plan referenced -- adapted staleness heuristic to use check-in recency instead
- Parallel 22-03 plan execution committed Task 2 changes alongside its own work -- all changes verified present

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Evening reflection now closes open loops and feeds tomorrow's priority into morning brief context
- Graduated pullback is ready for use by any proactive feature that calls sendNudge
- findStaleGoals and getGraduatedPullback are exported for reuse by other modules

## Self-Check: PASSED

All files exist. All commits verified.

---
*Phase: 22-daily-rhythm*
*Completed: 2026-03-22*
