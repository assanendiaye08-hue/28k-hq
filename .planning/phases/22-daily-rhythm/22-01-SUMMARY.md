---
phase: 22-daily-rhythm
plan: 01
subsystem: scheduler
tags: [prisma, coaching-config, outreach-budget, quiet-hours, conversational-brief]

# Dependency graph
requires:
  - phase: 21-conversational-jarvis
    provides: "AI assistant with tool calling, memory service (storeMessage), and topic-aware context"
  - phase: 20-clean-slate
    provides: "DM-only delivery layer with focus session gating"
provides:
  - "Outreach budget enforcement (3 DMs/day per member) via checkAndIncrementOutreach"
  - "Quiet hours gating via isQuietHours (handles overnight spans)"
  - "Coaching config fields on MemberSchedule (enableBrief, enableNudge, enableReflection, quietStart, quietEnd)"
  - "Conversational morning briefs stored as ConversationMessage for reply support"
affects: [22-daily-rhythm, 23-social-layer]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Gate functions as standalone utilities called before delivery (not inside deliverDM)"
    - "Per-feature enable/disable toggles on MemberSchedule"
    - "Storing proactive messages as ConversationMessage to make them conversational"

key-files:
  created: []
  modified:
    - "packages/db/prisma/schema.prisma"
    - "apps/bot/src/shared/delivery.ts"
    - "apps/bot/src/modules/scheduler/briefs.ts"
    - "apps/bot/src/modules/scheduler/index.ts"

key-decisions:
  - "Gate functions (checkAndIncrementOutreach, isQuietHours) are standalone exports, not embedded in deliverDM -- user-initiated replies never consume budget"
  - "Brief stored as ConversationMessage with topic 'brief' -- reply support comes free via existing assembleContext pipeline"
  - "enableReflection is checked independently from reflectionIntensity -- toggle controls on/off, intensity controls frequency"

patterns-established:
  - "Proactive outreach pattern: check enableX -> isQuietHours -> checkAndIncrementOutreach -> send"
  - "Conversational proactive messages: store as ConversationMessage after delivery for reply context"

requirements-completed: [RHYTHM-01, RHYTHM-05, SET-01, SET-02]

# Metrics
duration: 3min
completed: 2026-03-22
---

# Phase 22 Plan 01: Outreach Budget, Coaching Config, and Conversational Briefs Summary

**Outreach budget enforcement (3 DMs/day), per-feature coaching toggles with quiet hours, and conversational morning briefs stored as conversation messages for natural reply support**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-22T11:58:36Z
- **Completed:** 2026-03-22T12:01:56Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Added 7 coaching config fields to MemberSchedule (enableBrief, enableNudge, enableReflection, quietStart, quietEnd, dailyOutreachCount, lastOutreachDate)
- Implemented outreach budget gate (max 3 bot-initiated DMs/day per member) with timezone-aware daily reset
- Implemented quiet hours gate with overnight span support (e.g., 22:00-07:00)
- Made morning briefs conversational by storing them as ConversationMessage -- members can reply naturally and Jarvis responds with brief context
- Wired all three gates into every proactive sender: brief, nudge, reflection, planning, and evening nudge sweep

## Task Commits

Each task was committed atomically:

1. **Task 1: Add coaching config fields to schema and outreach budget + quiet hours to delivery** - `5c832ed` (feat)
2. **Task 2: Make morning brief conversational and wire outreach gates into scheduler** - `3330313` (feat)

## Files Created/Modified
- `packages/db/prisma/schema.prisma` - Added 7 coaching config fields to MemberSchedule model
- `apps/bot/src/shared/delivery.ts` - Added checkAndIncrementOutreach() and isQuietHours() gate functions
- `apps/bot/src/modules/scheduler/briefs.ts` - Added gates to sendBrief, store brief as ConversationMessage, updated footer
- `apps/bot/src/modules/scheduler/index.ts` - Wired gates into makeNudgeFn, makeReflectionFn, makePlanningFn, and evening sweep

## Decisions Made
- Gate functions (checkAndIncrementOutreach, isQuietHours) are standalone exports called by proactive senders, not embedded in deliverDM -- user-initiated replies never consume outreach budget
- Brief stored as ConversationMessage with topic 'brief' -- reply support comes free via existing assembleContext pipeline without any changes to ai-assistant module
- enableReflection is checked independently from reflectionIntensity -- toggle controls on/off, intensity controls frequency when enabled

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Outreach budget and quiet hours gates are ready for all proactive features in plans 02 and 03
- Per-feature toggles allow members to customize which proactive features they receive
- Morning brief reply flow works natively through existing AI assistant pipeline

## Self-Check: PASSED

All files exist. All commits verified.

---
*Phase: 22-daily-rhythm*
*Completed: 2026-03-22*
