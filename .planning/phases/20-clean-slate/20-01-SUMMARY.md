---
phase: 20-clean-slate
plan: 01
subsystem: bot
tags: [discord, slash-commands, module-cleanup, timer, auto-feed]

# Dependency graph
requires:
  - phase: 19-cross-platform-sync
    provides: v2.0 complete with desktop timer replacing bot timer
provides:
  - Timer module removed from bot codebase (7 source files, 7 compiled files)
  - Auto-feed module removed from bot codebase (6 source files, 6 compiled files)
  - AI assistant DM handler cleaned of all timer intent interception
  - Slash commands stripped to 4 (/goals, /reminders, /leaderboard, /announce-update)
  - Timer event types removed from core event bus
affects: [20-02-DMs-only-focus-signaling, 21-conversational-jarvis]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "v3.0 command registration: only 4 slash commands, all other interaction via DMs"

key-files:
  created: []
  modified:
    - apps/bot/src/deploy-commands.ts
    - apps/bot/src/modules/ai-assistant/index.ts
    - apps/bot/src/core/events.ts

key-decisions:
  - "Removed timer event type definitions from events.ts since no module emits or listens to them after timer module deletion"
  - "Kept server-setup/channels.ts auto-feed channel name reference -- cosmetic, will be addressed in Phase 23 channel consolidation"
  - "Removed unused isPrivateChannel variable from AI assistant DM handler (was only used by timer start block)"

patterns-established:
  - "v3.0 DM-first model: slash commands are minimal, conversational Jarvis handles most interactions"

requirements-completed: [CLEAN-01, CLEAN-04, CLEAN-03]

# Metrics
duration: 4min
completed: 2026-03-22
---

# Phase 20 Plan 01: Remove Legacy Modules and Strip Slash Commands Summary

**Deleted timer (7 files) and auto-feed (6 files) bot modules, stripped 20+ slash command registrations down to 4 (/goals, /reminders, /leaderboard, /announce-update), cleaned AI assistant of all timer intent handling**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-22T10:59:43Z
- **Completed:** 2026-03-22T11:04:00Z
- **Tasks:** 3
- **Files modified:** 15 (13 deleted, 2 modified) + events.ts cleanup

## Accomplishments
- Removed 3,290 lines of timer and auto-feed code from the bot codebase
- AI assistant DM handler now flows directly: skip bots -> check DM/private -> skip setup users -> resolve member -> check reminder intent -> check decomposition intent -> show typing -> handleChat (no timer intercept)
- deploy-commands.ts reduced from 188 lines to 69 lines, registering exactly 4 commands
- Core event bus cleaned of dead timer event types (timerStarted, timerCompleted, timerCancelled, timerTransition)

## Task Commits

Each task was committed atomically:

1. **Task 1: Delete timer and auto-feed modules, clean AI assistant timer references** - `5fced5d` (feat)
2. **Task 2: Strip deploy-commands.ts to four remaining slash commands** - `0e559bf` (feat)
3. **Task 3: Build verification and deploy commands** - verification-only task, no file changes to commit

## Files Created/Modified
- `apps/bot/src/modules/timer/` (7 files deleted) - Entire timer module removed
- `apps/bot/src/modules/auto-feed/` (6 files deleted) - Entire auto-feed module removed
- `apps/bot/src/modules/ai-assistant/index.ts` - Removed 7 timer imports, 4 timer handler blocks (~160 lines), updated module doc comment
- `apps/bot/src/deploy-commands.ts` - Rewritten to register only 4 commands, removed 20+ command imports
- `apps/bot/src/core/events.ts` - Removed 4 timer event type definitions
- `apps/bot/dist/modules/timer/` (14 files deleted) - Compiled timer artifacts removed
- `apps/bot/dist/modules/auto-feed/` (12 files deleted) - Compiled auto-feed artifacts removed

## Decisions Made
- Removed timer event type definitions from core/events.ts since they became dead types with no emitter or listener after module deletion
- Kept the `auto-feed` channel name in server-setup/channels.ts -- this is a channel layout definition that will be addressed in Phase 23 (channel consolidation)
- Removed the `isPrivateChannel` variable from AI assistant DM handler since it was only used by the timer start block to set responseChannelId
- Did not attempt to deploy slash commands locally (no .env) -- deployment will occur on VPS after git push

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Dead Code] Removed timer event types from core/events.ts**
- **Found during:** Task 1
- **Issue:** After deleting the timer module, the event bus still had 4 timer event type definitions (timerStarted, timerCompleted, timerCancelled, timerTransition) with no remaining emitters or listeners
- **Fix:** Removed the 4 dead event types from BotEventMap
- **Files modified:** apps/bot/src/core/events.ts
- **Verification:** grep confirmed no timer event references remain in the codebase
- **Committed in:** 5fced5d (Task 1 commit)

**2. [Rule 1 - Bug] Removed unused isPrivateChannel variable**
- **Found during:** Task 1
- **Issue:** After removing timer handler blocks, the `isPrivateChannel` variable (set in DM handler) had no remaining usage -- it was only consumed by the timer start block for responseChannelId
- **Fix:** Removed the `let isPrivateChannel = false;` declaration and `isPrivateChannel = true;` assignment
- **Files modified:** apps/bot/src/modules/ai-assistant/index.ts
- **Verification:** TypeScript compilation passes without unused variable
- **Committed in:** 5fced5d (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 dead code removal, 1 unused variable cleanup)
**Impact on plan:** Both auto-fixes directly caused by the planned deletions. No scope creep.

## Issues Encountered
- Pre-existing TypeScript errors in `apps/bot/src/shared/delivery.ts` (references `inFocusSession` field not yet in schema -- belongs to Plan 20-02 focus session signaling) and `apps/bot/src/modules/onboarding/commands.ts` (uncommitted DM-only refactor changes from Plan 20-02 prep). These are not caused by this plan's changes.
- Slash command deployment requires VPS environment variables -- script cannot run locally. Verified syntax correctness via TypeScript compilation instead.

## User Setup Required
None - no external service configuration required. Slash command deployment will happen automatically on VPS after git push + pull.

## Next Phase Readiness
- Bot codebase is leaner: timer and auto-feed modules fully removed
- Ready for Plan 20-02: DMs-only delivery refactor + focus session signaling
- Slash command deployment needs to run on VPS (`npx tsx src/deploy-commands.ts`) after pushing these changes

---
*Phase: 20-clean-slate*
*Completed: 2026-03-22*
