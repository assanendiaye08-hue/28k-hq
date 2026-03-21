---
phase: 09-productivity-timer
plan: 02
subsystem: timer
tags: [discord.js, slash-commands, buttons, xp, prisma, dm-interactions]

# Dependency graph
requires:
  - phase: 09-productivity-timer
    provides: Timer engine state machine, button builders, embed builders, constants
  - phase: 03-competition-and-social-proof
    provides: XP engine with awardXP, voice-tracker module pattern, event bus
  - phase: 07-ai-infrastructure
    provides: AIFeature type for timer cost tracking
provides:
  - /timer slash command with 5 subcommands (start, pause, resume, stop, status)
  - Session persistence with XP awarding (1 per 5 min, 200/day cap)
  - Goal autocomplete for linking timers to active goals
  - Global button interaction routing via isButton() in index.ts
  - Timer module with button handler filtered by timer: prefix
  - Per-member lock preventing race conditions on rapid button presses
  - Automatic work->break and break->work DM transitions
  - Idle timeout with gentle nudge then auto-end
  - Restart recovery from ACTIVE TimerSession DB records
  - startTimerForMember export for natural language timer starts
affects: [09-03 natural-language-timer]

# Tech tracking
tech-stack:
  added: []
  patterns: [global button routing via event bus, per-member lock for button handlers, DM channel type narrowing with ChannelType.DM]

key-files:
  created:
    - src/modules/timer/commands.ts
    - src/modules/timer/session.ts
    - src/modules/timer/index.ts
  modified:
    - src/index.ts
    - src/deploy-commands.ts
    - src/core/events.ts

key-decisions:
  - "Global button routing added to index.ts between autocomplete and command checks"
  - "timerTransition internal event for decoupling command handlers from transition orchestration"
  - "fetchDMChannel helper with ChannelType.DM narrowing to avoid PartialGroupDMChannel type issues"
  - "Restart recovery sends NEW DM messages instead of editing old ones (Pitfall 5)"
  - "Sessions < 1 min persisted as CANCELLED, >= 1 min as COMPLETED"
  - "deleteActiveTimerRecord called before creating new ACTIVE record to clean up stale data"

patterns-established:
  - "Global button routing: isButton() in index.ts emits buttonInteraction event, modules filter by customId prefix"
  - "DM channel narrowing: use ChannelType.DM check + cast to DMChannel for type safety"
  - "Transition orchestration via internal events: commands emit timerTransition, module handler routes to transition functions"

requirements-completed: [TIMER-01, TIMER-02, TIMER-03, TIMER-04]

# Metrics
duration: 9min
completed: 2026-03-21
---

# Phase 9 Plan 2: Timer Interaction Layer Summary

**Full timer slash command with interactive DM buttons, session persistence with XP, global button routing, and startTimerForMember export for AI integration**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-21T00:15:14Z
- **Completed:** 2026-03-21T00:24:27Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Complete /timer command with 5 subcommands (start, pause, resume, stop, status) including goal autocomplete
- Session persistence to TimerSession table with XP awarding (1 per 5 min, 200/day cap, 5 min minimum)
- Global button interaction routing in index.ts via event bus for long-lived timer buttons
- Timer module with per-member locks, automatic DM transitions, idle timeout, and restart recovery
- startTimerForMember export enabling Plan 09-03 natural language timer starts

## Task Commits

Each task was committed atomically:

1. **Task 1: Commands, session persistence, and deploy script** - `9b8629f` (feat)
2. **Task 2: Module registration, button handler, and transition orchestration** - `c62544d` (feat)

## Files Created/Modified
- `src/modules/timer/commands.ts` - /timer slash command builder with 5 subcommands, handler routing, goal autocomplete
- `src/modules/timer/session.ts` - DB persistence for timer sessions, XP awarding with daily cap, ACTIVE record management
- `src/modules/timer/index.ts` - Module registration, button handler, transition orchestration, restart recovery, startTimerForMember
- `src/index.ts` - Added isButton() routing to event bus between autocomplete and command checks
- `src/deploy-commands.ts` - Added /timer command to registration array with Phase 9 header comment
- `src/core/events.ts` - Added timerTransition event to BotEventMap

## Decisions Made
- Added global button routing to index.ts between the autocomplete and isChatInputCommand checks -- this is the first button handler in the codebase and establishes the pattern for any future button-based features
- Used an internal timerTransition event to decouple command handlers from transition orchestration -- commands emit the event, the module's register function handles it with withMemberLock
- Used ChannelType.DM type narrowing instead of isDMBased() to avoid TypeScript errors with PartialGroupDMChannel (which lacks send/messages properties)
- Restart recovery sends a NEW DM message with "Bot restarted" context instead of trying to edit the old one, per Pitfall 5 from research
- Sessions under 1 minute are persisted as CANCELLED (no XP), sessions 1+ minutes as COMPLETED
- Clean up stale ACTIVE records with deleteActiveTimerRecord before creating new ones

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed DM channel type narrowing for TypeScript compilation**
- **Found during:** Task 2 (module registration)
- **Issue:** Using isDMBased() returns a union including PartialGroupDMChannel which lacks send() and messages properties, causing TS2339 errors
- **Fix:** Created fetchDMChannel helper using ChannelType.DM check with explicit cast to DMChannel; applied same pattern in commands.ts
- **Files modified:** src/modules/timer/index.ts, src/modules/timer/commands.ts
- **Verification:** npx tsc --noEmit passes clean
- **Committed in:** c62544d (Task 2 commit)

**2. [Rule 1 - Bug] Fixed Prisma relation name for Discord accounts**
- **Found during:** Task 2 (restart recovery)
- **Issue:** Used `discordAccounts` relation name in Prisma include but the actual field on Member model is `accounts`
- **Fix:** Changed to a separate db.discordAccount.findFirst query instead of nested include, matching the pattern used elsewhere in the codebase
- **Files modified:** src/modules/timer/index.ts
- **Verification:** npx tsc --noEmit passes clean
- **Committed in:** c62544d (Task 2 commit)

**3. [Rule 2 - Missing Critical] Added timerTransition event to BotEventMap**
- **Found during:** Task 2 (transition orchestration)
- **Issue:** Commands.ts emits timerTransition event for orchestration but it was not in BotEventMap
- **Fix:** Added timerTransition: [memberId: string, type: string] to BotEventMap in events.ts
- **Files modified:** src/core/events.ts
- **Verification:** npx tsc --noEmit passes clean
- **Committed in:** c62544d (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 missing critical)
**Impact on plan:** All auto-fixes necessary for TypeScript compilation and correct operation. No scope creep.

## Issues Encountered
None -- all issues were type-safety matters caught by TypeScript compilation and resolved inline.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Timer is fully functional end-to-end: commands, buttons, DM transitions, XP, and restart recovery
- startTimerForMember is exported and ready for Plan 09-03 to wire up natural language timer starts via AI assistant
- Database migration from Plan 01 must be applied before runtime (prisma migrate dev)

## Self-Check: PASSED

All 6 files verified present. Both task commits (9b8629f, c62544d) verified in git log. startTimerForMember export confirmed at line 134 of index.ts.

---
*Phase: 09-productivity-timer*
*Completed: 2026-03-21*
