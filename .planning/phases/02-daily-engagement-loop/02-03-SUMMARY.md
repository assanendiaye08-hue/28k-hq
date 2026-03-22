---
phase: 02-daily-engagement-loop
plan: 03
subsystem: scheduler, engagement
tags: [node-cron, openrouter, morning-briefs, sunday-planning, discord-slash-commands, cron-tasks, timezone]

requires:
  - phase: 02-daily-engagement-loop
    provides: "XP engine, streak tracker, check-in/goal commands, goal expiry checker, delivery utility, Phase 2 Prisma models, event types"
  - phase: 01-foundation-and-identity
    provides: "Module system, OpenRouter integration pattern, DM conversation pattern (setup-flow.ts), interest tag cleanup"
provides:
  - "SchedulerManager class for per-member cron task lifecycle (create, update, destroy, rebuild)"
  - "Hybrid AI+template morning brief generation with DeepSeek V3.2 and member tone preference"
  - "Check-in reminder delivery that skips if already checked in today"
  - "Sunday planning session as conversational DM flow with AI goal extraction"
  - "/settings command for timezone, brief time/tone, reminders, and Sunday planning toggle"
  - "Goal expiry check wired to hourly cron task"
  - "Interest tag cleanup wired to daily cron task"
  - "11 total slash commands registered in deploy script"
affects: [03-competition-and-social-proof, 04-ai-assistant]

tech-stack:
  added: ["node-cron@4.2.1", "@types/node-cron"]
  patterns:
    - "Per-member cron tasks via SchedulerManager with timezone support"
    - "Hybrid AI+template brief generation: real data template + DeepSeek V3.2 humanization"
    - "Brief cache (in-memory Map with date key) prevents regeneration cost"
    - "Conversational DM planning session using awaitMessages pattern"
    - "AI goal extraction from natural language via OpenRouter structured output"
    - "IANA timezone validation via Intl.DateTimeFormat"
    - "Factory callback pattern for cron task creation (makeBriefFn, makeReminderFn, makePlanningFn)"

key-files:
  created:
    - src/modules/scheduler/manager.ts
    - src/modules/scheduler/briefs.ts
    - src/modules/scheduler/planning.ts
    - src/modules/scheduler/commands.ts
    - src/modules/scheduler/index.ts
  modified:
    - src/deploy-commands.ts

key-decisions:
  - "Used node-cron schedule() which wraps createTask().start() -- better TypeScript type support via @types/node-cron"
  - "Brief tone descriptions map tone keys to natural language descriptions for AI system prompt"
  - "IANA timezone validation uses Intl.DateTimeFormat try/catch -- works in all modern Node.js runtimes"
  - "Sunday planning reminder times support both HH:mm and am/pm formats with deduplication"
  - "Interest tag cleanup runs at 4:00 AM UTC (low-traffic time)"

patterns-established:
  - "SchedulerManager: Map<memberId, Map<taskType, ScheduledTask>> for per-member task lifecycle"
  - "Brief delivery: fetch data -> build template -> AI humanize -> embed -> deliverToPrivateSpace"
  - "Reminder skip: check today's check-in count before sending -- no nagging"
  - "Planning session: 3-step conversational DM (rating -> goals -> reminders) with AI extraction"
  - "Settings command: upsert pattern with partial update (only update provided fields)"
  - "Module ready: client.once('ready') to rebuild all tasks from database"

requirements-completed: [ENGAGE-05]

duration: 6min
completed: 2026-03-20
---

# Phase 2 Plan 03: Scheduler Module Summary

**Per-member scheduler with hybrid AI morning briefs (DeepSeek V3.2), conversational Sunday planning, /settings command, and hourly goal expiry wiring via node-cron 4.x**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-20T11:41:22Z
- **Completed:** 2026-03-20T11:47:50Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Built SchedulerManager class with per-member cron task lifecycle (create, update, destroy, rebuildAll on restart)
- Implemented hybrid AI+template morning brief generation using DeepSeek V3.2 with member-chosen tone (coach, chill, data-first) and in-memory cache
- Created check-in reminder delivery that skips if member already checked in today (personal assistant tone, not nagging)
- Built Sunday planning session as a 3-step conversational DM flow (week rating, AI goal extraction, reminder times)
- Created /settings command for timezone, brief time/tone, reminder times, and Sunday planning toggle with IANA timezone validation
- Wired goal expiry checker to hourly cron task and interest tag cleanup to daily cron task
- Registered 11 total slash commands in deploy script

## Task Commits

Each task was committed atomically:

1. **Task 1: Scheduler manager, hybrid morning briefs, and check-in reminders** - `be12b8e` (feat)
2. **Task 2: Sunday planning, /settings command, module registration, and goal expiry wiring** - `67399e9` (feat)

## Files Created/Modified
- `src/modules/scheduler/manager.ts` - SchedulerManager class with per-member cron task lifecycle
- `src/modules/scheduler/briefs.ts` - Hybrid AI+template morning brief generation and check-in reminder delivery
- `src/modules/scheduler/planning.ts` - Sunday planning session as conversational DM flow with AI goal extraction
- `src/modules/scheduler/commands.ts` - /settings slash command for schedule preferences
- `src/modules/scheduler/index.ts` - Module registration, ready event rebuild, scheduleUpdated listener, global cron tasks
- `src/deploy-commands.ts` - Added /settings command (11 total)

## Decisions Made
- Used node-cron `schedule()` instead of `createTask()` because @types/node-cron has types for `schedule()` -- functionally equivalent since `schedule()` calls `createTask().start()` internally
- Brief tone descriptions map tone keys to natural language descriptions to give the AI more context (e.g., "coach" becomes "a motivational coach -- direct, encouraging, focused on action")
- IANA timezone validation uses `Intl.DateTimeFormat` try/catch pattern rather than maintaining a manual list -- works for all valid IANA timezone identifiers
- Sunday planning reminder time parsing supports both HH:mm and am/pm formats with automatic deduplication and sorting
- Interest tag cleanup scheduled at 4:00 AM UTC as a low-traffic time to minimize any performance impact

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed null/undefined type mismatch in parseHHmm return**
- **Found during:** Task 2 (commands.ts)
- **Issue:** `parseHHmm()` returns `string | null` but `parsedBriefTime` was typed as `string | undefined`. TypeScript strict mode rejects `null` for `undefined`.
- **Fix:** Added `?? undefined` coercion at call site
- **Files modified:** src/modules/scheduler/commands.ts
- **Verification:** `npx tsc --noEmit` passes
- **Committed in:** 67399e9

---

**Total deviations:** 1 auto-fixed (1 bug -- TypeScript type issue)
**Impact on plan:** Minor type coercion needed for strictNullChecks compatibility. No scope creep.

## Issues Encountered
None beyond the auto-fixed TypeScript issue above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 2 is fully complete: XP engine, check-ins, goals, streaks, morning briefs, Sunday planning, and scheduler
- The daily engagement loop is wired: briefs pull members in -> goals give direction -> check-ins track progress -> XP rewards effort
- Phase 3 (Competition and Social Proof) can now build on all Phase 2 data (leaderboards, community pulse in briefs, etc.)
- Phase 4 (AI Assistant) can reference all 11 bot commands for member guidance in conversation

## Self-Check: PASSED

All 6 files verified present. Both task commits (be12b8e, 67399e9) verified in git log.

---
*Phase: 02-daily-engagement-loop*
*Completed: 2026-03-20*
