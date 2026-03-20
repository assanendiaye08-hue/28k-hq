---
phase: 02-daily-engagement-loop
plan: 01
subsystem: database, xp-engine
tags: [prisma, xp, rank-progression, discord-roles, encryption, event-bus]

requires:
  - phase: 01-foundation-and-identity
    provides: "Member model, encryption extension, event bus, module system, RANK_PROGRESSION constants"
provides:
  - "Phase 2 Prisma models: CheckIn, Goal, XPTransaction, MemberSchedule"
  - "XP engine with atomic transaction logging and level-up detection"
  - "Rank sync service for Discord role assignment on level change"
  - "XP/streak constants centralized for economy tuning"
  - "Private space delivery utility for all Phase 2 modules"
  - "Phase 2 event types in BotEventMap"
affects: [02-02-PLAN, 02-03-PLAN, 03-competition-and-social-proof]

tech-stack:
  added: []
  patterns:
    - "Prisma $transaction for atomic XP award + totalXp increment"
    - "Event-driven XP: modules emit events, XP module reacts"
    - "Private space delivery abstraction for DM/channel transparency"
    - "Diminishing returns curve for anti-spam XP"
    - "Flexible streak scoring with grace days and decay (not binary)"

key-files:
  created:
    - src/modules/xp/constants.ts
    - src/modules/xp/engine.ts
    - src/modules/xp/rank-sync.ts
    - src/modules/xp/index.ts
    - src/shared/delivery.ts
  modified:
    - prisma/schema.prisma
    - src/core/events.ts
    - src/db/encryption.ts
    - src/shared/constants.ts

key-decisions:
  - "Prisma 7 generates XPTransaction accessor as xPTransaction (camelCase with capital P) -- use tx.xPTransaction in code"
  - "RankInfo type widened from readonly const tuple to plain interface for cross-module compatibility"
  - "XP_AWARDS re-exported from shared/constants.ts for onboarding module convenience"

patterns-established:
  - "Atomic XP award: awardXP() wraps create+increment in $transaction, returns level-up info"
  - "Rank sync: try/catch per account per guild, log warnings, never throw"
  - "Level-up celebration: embed to private space only, never public"
  - "Setup bonus: listen for memberSetupComplete, auto-award 50 XP"

requirements-completed: [ENGAGE-03, ENGAGE-04]

duration: 5min
completed: 2026-03-20
---

# Phase 2 Plan 01: XP Engine and Schema Extensions Summary

**Prisma Phase 2 models, atomic XP engine with transaction logging, Discord rank sync, streak multiplier, and private space delivery utility**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-20T11:22:36Z
- **Completed:** 2026-03-20T11:27:51Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Extended Prisma schema with CheckIn, Goal, XPTransaction, MemberSchedule models and all Phase 2 enums
- Built XP engine with atomic $transaction for XP award + totalXp increment, level-up detection, and streak multiplier calculation
- Implemented rank sync that manages Discord roles across all guilds and linked accounts with graceful error handling
- Created level-up celebration embed delivered privately (never public)
- Added ENCRYPTED_FIELDS for CheckIn.content and Goal.description
- Added 6 Phase 2 events to BotEventMap for cross-module communication
- Created deliverToPrivateSpace utility handling both DM and channel space types
- Centralized XP economy constants with researched gaming psychology values

## Task Commits

Each task was committed atomically:

1. **Task 1: Prisma schema extensions, Phase 2 event types, XP/streak constants, and delivery utility** - `82c37ec` (feat)
2. **Task 2: XP engine module with transaction logging, streak multiplier, rank sync, and level-up celebrations** - `e6c2f74` (feat)

## Files Created/Modified
- `prisma/schema.prisma` - Extended Member model + 4 new models (CheckIn, Goal, XPTransaction, MemberSchedule) + 3 enums
- `src/core/events.ts` - 6 new Phase 2 events in BotEventMap
- `src/db/encryption.ts` - Added CheckIn.content and Goal.description to ENCRYPTED_FIELDS
- `src/shared/constants.ts` - Re-exported XP_AWARDS from xp/constants for onboarding convenience
- `src/shared/delivery.ts` - deliverToPrivateSpace utility for DM/channel delivery
- `src/modules/xp/constants.ts` - XP_AWARDS and STREAK_CONFIG with researched values
- `src/modules/xp/engine.ts` - awardXP, getRankForXP, calculateCheckinXP, calculateStreakMultiplier
- `src/modules/xp/rank-sync.ts` - syncRank, buildLevelUpEmbed
- `src/modules/xp/index.ts` - XP module registration with event listeners

## Decisions Made
- Prisma 7 generates the XPTransaction model accessor as `xPTransaction` (capital P after lowercase x) -- used this in all transaction code
- Widened RankInfo type from readonly const tuple to `{ name: string; xpThreshold: number; color: number }` for cross-module compatibility with RANK_PROGRESSION
- Re-exported XP_AWARDS from shared/constants.ts so the onboarding module can import setup bonus XP without reaching into xp/constants directly

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Prisma accessor name for XPTransaction**
- **Found during:** Task 2 (XP engine implementation)
- **Issue:** Plan used `tx.xpTransaction` but Prisma 7 generates it as `tx.xPTransaction` (camelCase rule: uppercase letter after lowercase prefix)
- **Fix:** Changed to `tx.xPTransaction.create()`
- **Files modified:** src/modules/xp/engine.ts
- **Verification:** `npx tsc --noEmit` passes
- **Committed in:** e6c2f74

**2. [Rule 1 - Bug] Fixed readonly const tuple type mismatch in getRankForXP/getNextRankInfo**
- **Found during:** Task 2 (XP engine implementation)
- **Issue:** RANK_PROGRESSION is `as const`, making each element a unique literal type. Returning a single element as `(typeof RANK_PROGRESSION)[number]` and then using it in `indexOf` caused type narrowing conflicts.
- **Fix:** Created `RankInfo` type with widened string/number fields, used `findIndex` with threshold comparison instead of `indexOf`
- **Files modified:** src/modules/xp/engine.ts
- **Verification:** `npx tsc --noEmit` passes
- **Committed in:** e6c2f74

---

**Total deviations:** 2 auto-fixed (2 bugs -- TypeScript type issues)
**Impact on plan:** Both fixes were necessary for TypeScript compilation. No scope creep.

## Issues Encountered
None beyond the auto-fixed TypeScript issues above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- XP engine is ready for check-in and goal modules to call `awardXP()` and emit events
- `deliverToPrivateSpace` is ready for check-in responses, goal updates, morning briefs, and reminders
- Phase 2 event types are registered for cross-module communication
- Prisma schema has all models needed for Plans 02 and 03

## Self-Check: PASSED

All 10 files verified present. Both task commits (82c37ec, e6c2f74) verified in git log.

---
*Phase: 02-daily-engagement-loop*
*Completed: 2026-03-20*
