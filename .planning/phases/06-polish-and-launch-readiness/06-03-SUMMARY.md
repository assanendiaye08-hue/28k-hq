---
phase: 06-polish-and-launch-readiness
plan: 03
subsystem: hardening
tags: [discord-events, bot-recovery, member-lifecycle, admin-logging]

# Dependency graph
requires:
  - phase: 06-01
    provides: notification router, schema migration for NotificationPreference
provides:
  - Bot restart recovery checks (expired goals, stale sessions, season anomalies)
  - "#bot-log admin channel under BOT OPS category (owner-only)"
  - Member leave/rejoin lifecycle with restore/fresh DM flow
  - Hardening module auto-discovered by module loader
affects: [deployment, operations, onboarding]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Recovery check pattern: best-effort with try/catch per step, never blocks startup"
    - "Owner-only channel: hidden category + explicit permissionOverwrites for guild.ownerId"
    - "Rejoin detection via DiscordAccount lookup before onboarding fires"

key-files:
  created:
    - src/modules/hardening/constants.ts
    - src/modules/hardening/recovery.ts
    - src/modules/hardening/member-lifecycle.ts
    - src/modules/hardening/index.ts
  modified:
    - src/modules/server-setup/channels.ts

key-decisions:
  - "GuildMemberRemove handler accepts GuildMember | PartialGuildMember for type safety"
  - "Recovery uses updateMany for bulk goal resolution instead of per-record updates"
  - "Rejoin timeout defaults to restore (non-destructive) rather than requiring explicit choice"
  - "Both onboarding and hardening guildMemberAdd handlers fire independently -- dual DMs acceptable"

patterns-established:
  - "Recovery pattern: each check wrapped in individual try/catch so one failure does not block others"
  - "Admin log pattern: find #bot-log under BOT OPS category, post embed, fallback to stdout"

requirements-completed: [FNDN-06, CONT-02]

# Metrics
duration: 4min
completed: 2026-03-20
---

# Phase 06 Plan 03: Hardening Module Summary

**Bot restart recovery with admin logging, member leave/rejoin lifecycle with restore/fresh choice, and owner-only #bot-log channel**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-20T20:10:01Z
- **Completed:** 2026-03-20T20:14:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Bot restart silently resolves expired goals (ACTIVE past deadline -> MISSED) and cancels stale pending sessions (24+ hours old)
- Recovery summary embed posted to owner-only #bot-log channel on every restart with goal/session/season stats
- Member leave/rejoin lifecycle: departures logged with data preserved, rejoins detected via DiscordAccount and offered restore/fresh DM choice
- BOT OPS category with #bot-log channel created during server setup, hidden from @everyone, accessible only to guild owner and bot

## Task Commits

Each task was committed atomically:

1. **Task 1: Bot restart recovery with #bot-log admin channel** - `c9c4931` (feat)
2. **Task 2: Member leave/rejoin lifecycle and module registration** - `bd788c1` (feat)

## Files Created/Modified
- `src/modules/hardening/constants.ts` - BOT_LOG_CHANNEL, BOT_OPS_CATEGORY, RECOVERY_STALE_SESSION_HOURS exports
- `src/modules/hardening/recovery.ts` - runRecoveryChecks: expired goals, stale sessions, season status, #bot-log embed
- `src/modules/hardening/member-lifecycle.ts` - handleMemberRemove (log + preserve), handleMemberAdd (rejoin detect + restore/fresh DM)
- `src/modules/hardening/index.ts` - Module registration with ready, guildMemberRemove, guildMemberAdd event listeners
- `src/modules/server-setup/channels.ts` - Added BOT OPS category with #bot-log channel and owner-only permissions

## Decisions Made
- GuildMemberRemove handler accepts `GuildMember | PartialGuildMember` because Discord.js can provide partial members on leave events
- Recovery uses `updateMany` for bulk goal status changes rather than iterating with individual updates for efficiency
- Rejoin DM timeout defaults to restore (non-destructive) -- never auto-deletes data on inaction
- Both onboarding and hardening modules listen for guildMemberAdd independently; dual DMs are acceptable and contextually distinguishable

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed PartialGuildMember type error on GuildMemberRemove**
- **Found during:** Task 2 (member-lifecycle.ts)
- **Issue:** TypeScript error: `GuildMember | PartialGuildMember` not assignable to `GuildMember` parameter
- **Fix:** Updated handleMemberRemove signature to accept `GuildMember | PartialGuildMember` union type
- **Files modified:** src/modules/hardening/member-lifecycle.ts
- **Verification:** `npx tsc --noEmit` passes cleanly
- **Committed in:** bd788c1 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Type fix required for correct Discord.js event typing. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Hardening module is the final module before v1.0 launch
- Bot can now run unattended for 7+ days: restarts are silent, edge cases auto-resolved, lifecycle events logged
- All 3 plans in Phase 6 complete: notification routing, auto-feed content, and hardening

## Self-Check: PASSED

All 5 created/modified files verified on disk. Both task commits (c9c4931, bd788c1) verified in git log.

---
*Phase: 06-polish-and-launch-readiness*
*Completed: 2026-03-20*
