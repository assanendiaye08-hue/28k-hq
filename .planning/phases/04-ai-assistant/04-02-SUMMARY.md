---
phase: 04-ai-assistant
plan: 02
subsystem: ai
tags: [openrouter, deepseek, nudge, accountability, cron, scheduler]

# Dependency graph
requires:
  - phase: 04-ai-assistant/01
    provides: "Ace personality, memory service (getRecentMessages, getSummary, storeMessage), buildSystemPrompt"
  - phase: 02-daily-engagement-loop/03
    provides: "SchedulerManager, sendBrief, sendCheckinReminder, /settings command"
provides:
  - "AI-powered morning briefs with conversation history and community pulse"
  - "Configurable accountability nudge system (light/medium/heavy)"
  - "/accountability command for nudge intensity"
  - "nudge-time option on /settings"
  - "Evening nudge sweep at 21:00 UTC"
  - "Extended silence detection with genuine check-in mode"
affects: [05-polish-and-deployment]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "NUDGE_MARKER prefix on conversation messages for per-day counting"
    - "getCommunityPulse aggregation helper for server-wide activity metrics"
    - "Layered system prompt: Ace personality + brief-specific addendum"

key-files:
  created:
    - src/modules/ai-assistant/nudge.ts
  modified:
    - src/modules/scheduler/briefs.ts
    - src/modules/ai-assistant/commands.ts
    - src/modules/ai-assistant/index.ts
    - src/modules/scheduler/manager.ts
    - src/modules/scheduler/index.ts
    - src/modules/scheduler/commands.ts
    - src/deploy-commands.ts

key-decisions:
  - "NUDGE_MARKER prefix on stored nudge messages enables per-day counting without extra DB field"
  - "Evening nudge sweep at 21:00 UTC is a fallback; individual per-member cron tasks are primary"
  - "Default nudge time set to 21:00 on first /accountability usage"
  - "generateBrief signature extended with db parameter for AI context loading"

patterns-established:
  - "NUDGE_MARKER: prefix nudge messages with '[NUDGE]' for counting/filtering"
  - "Community pulse: aggregate server-wide activity into structured object for AI prompts"

requirements-completed: [AI-02, AI-03]

# Metrics
duration: 5min
completed: 2026-03-20
---

# Phase 4 Plan 2: AI Briefs and Accountability Nudges Summary

**AI-powered morning briefs with conversation history/community pulse and configurable accountability nudges (light/medium/heavy) with extended silence check-in**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-20T14:41:34Z
- **Completed:** 2026-03-20T14:47:22Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Morning briefs now use Ace personality with conversation history references and community pulse data
- Accountability nudge system with 3 intensity levels and configurable per-member timing
- Extended silence detection (3-7 days based on level) triggers genuine check-in, not nagging
- /accountability and /settings nudge-time give members full control over nudge behavior

## Task Commits

Each task was committed atomically:

1. **Task 1: AI-powered morning brief upgrade and /accountability command** - `4769f2d` (feat)
2. **Task 2: Nudge system with scheduler integration and extended silence handling** - `bcc9664` (feat)

## Files Created/Modified
- `src/modules/ai-assistant/nudge.ts` - Accountability nudge logic with ACCOUNTABILITY_LEVELS, shouldNudge, sendNudge
- `src/modules/scheduler/briefs.ts` - Enhanced morning briefs with AI context, conversation history, community pulse
- `src/modules/ai-assistant/commands.ts` - Added /accountability command with light/medium/heavy choices
- `src/modules/ai-assistant/index.ts` - Registered /accountability command handler
- `src/modules/scheduler/manager.ts` - Extended with scheduleNudge method, nudgeFn in rebuildAll/updateMemberSchedule
- `src/modules/scheduler/index.ts` - Integrated nudge factory and evening nudge sweep at 21:00 UTC
- `src/modules/scheduler/commands.ts` - Added nudge-time option to /settings, display nudge/accountability in settings view
- `src/deploy-commands.ts` - Registered /accountability in deploy script

## Decisions Made
- NUDGE_MARKER prefix on stored nudge messages enables per-day counting without extra DB field
- Evening nudge sweep at 21:00 UTC is a fallback; individual per-member cron tasks are primary scheduling mechanism
- Default nudge time set to 21:00 on first /accountability usage (members can change via /settings)
- generateBrief signature extended with db parameter for AI context loading (conversation history + community pulse)
- Removed DAILY_AI_CALL_CAP constant (briefs are once daily per member anyway)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- AI assistant phase complete with personality, chat, memory, briefs, and nudges
- Ready for Phase 5 (polish and deployment)
- All nudge/accountability settings already in MemberSchedule schema (added in Plan 01)

## Self-Check: PASSED

All 8 files verified present. Both task commits (4769f2d, bcc9664) verified in git history. TypeScript compiles clean.

---
*Phase: 04-ai-assistant*
*Completed: 2026-03-20*
