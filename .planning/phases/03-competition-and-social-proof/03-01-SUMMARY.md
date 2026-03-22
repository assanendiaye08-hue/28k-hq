---
phase: 03-competition-and-social-proof
plan: 01
subsystem: xp, voice, engagement
tags: [discord.js, prisma, voice-tracking, xp-engine, event-bus]

# Dependency graph
requires:
  - phase: 01-foundation-and-identity
    provides: "Module loader, event bus, Prisma schema with Member model"
  - phase: 02-daily-engagement-loop
    provides: "XP engine (awardXP), XP_AWARDS constants, delivery utility"
provides:
  - "VoiceSession, Season, SeasonSnapshot, BotConfig Prisma models"
  - "Voice-tracker module with full state machine (join/leave/pause/resume/switch)"
  - "Wins-lessons module with emoji reactions and XP cooldown"
  - "XPSource expanded with VOICE_SESSION, WIN_POST, LESSON_POST"
  - "6 new Phase 3 events in BotEventMap"
affects: [03-02-PLAN, 03-03-PLAN, leaderboards, seasons]

# Tech tracking
tech-stack:
  added: []
  patterns: [in-memory-state-machine, session-reconstruction-on-ready, channel-category-filtering]

key-files:
  created:
    - src/modules/voice-tracker/tracker.ts
    - src/modules/voice-tracker/index.ts
    - src/modules/voice-tracker/constants.ts
    - src/modules/voice-tracker/embeds.ts
    - src/modules/wins-lessons/handler.ts
    - src/modules/wins-lessons/index.ts
    - src/modules/wins-lessons/constants.ts
  modified:
    - prisma/schema.prisma
    - src/core/client.ts
    - src/core/events.ts
    - src/modules/xp/engine.ts
    - src/modules/xp/constants.ts

key-decisions:
  - "Voice sessions use in-memory Map (not DB) for active tracking with DB persistence on end"
  - "Self-mute and self-deafen continue tracking (deep focus); only server-deafen pauses"
  - "Lessons award 35 XP vs wins 30 XP to encourage vulnerability in sharing failures"
  - "Session reconstruction on bot ready creates sessions with startedAt=now (no duration credit for downtime)"

patterns-established:
  - "In-memory state machine with DB persistence on state exit: used for voice sessions"
  - "Channel category filtering via parent.name match: isTrackedChannel pattern"
  - "Per-type per-member cooldown map: reusable for rate-limiting any per-user activity"

requirements-completed: [COMP-02, COMP-03]

# Metrics
duration: 4min
completed: 2026-03-20
---

# Phase 3 Plan 01: Schema Extensions, Voice Tracker, and Wins/Lessons Summary

**Voice co-work tracking with in-memory state machine and wins/lessons emoji reactions with XP cooldown, plus Prisma schema for seasons and snapshots**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-20T12:36:20Z
- **Completed:** 2026-03-20T12:40:48Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- Extended Prisma schema with VoiceSession, Season, SeasonSnapshot, BotConfig models and expanded XPSource enum
- Built voice-tracker module with full state machine: join/leave/pause/resume/switch/reconstruct, voice XP (1 per 3 min, 200/day cap, 5-min minimum), noteworthy session embeds
- Built wins-lessons module with emoji reactions, XP awards (30/35), and 2-hour per-type cooldown
- Added GuildVoiceStates intent and 6 Phase 3 events to BotEventMap

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema extensions, core plumbing, and XP engine expansion** - `3284f5f` (feat)
2. **Task 2: Voice tracker and wins/lessons modules** - `d5af9e2` (feat)

## Files Created/Modified
- `prisma/schema.prisma` - Added VoiceSession, Season, SeasonSnapshot, BotConfig models; extended XPSource enum; added Member relations
- `src/core/client.ts` - Added GuildVoiceStates intent
- `src/core/events.ts` - Added 6 Phase 3 events to BotEventMap
- `src/modules/xp/engine.ts` - Expanded XPSource type with voice/win/lesson sources
- `src/modules/xp/constants.ts` - Added voice XP config, win/lesson XP amounts, cooldown duration
- `src/modules/voice-tracker/constants.ts` - Voice tracking constants (min session, noteworthy threshold, category name)
- `src/modules/voice-tracker/tracker.ts` - In-memory session state machine with DB persistence and XP award
- `src/modules/voice-tracker/embeds.ts` - Encouraging embed for noteworthy sessions
- `src/modules/voice-tracker/index.ts` - Module registration with voiceStateUpdate listener and ready reconstruction
- `src/modules/wins-lessons/constants.ts` - Channel names and emoji constants
- `src/modules/wins-lessons/handler.ts` - Message handler with cooldown, reaction, and XP award
- `src/modules/wins-lessons/index.ts` - Module registration with messageCreate listener

## Decisions Made
- Voice sessions tracked in-memory Map keyed by discordId (fast lookups, no DB overhead for active sessions)
- Self-mute and self-deafen continue tracking per context decision (deep focus indicator)
- Lessons get 35 XP vs wins 30 XP (slightly higher to encourage vulnerability per user decision)
- Session reconstruction on bot ready uses startedAt=now (no credit for bot downtime -- fair and simple)
- Module loader auto-discovers new modules via directory convention (no manual wiring needed)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Database not running locally so `prisma db push` failed -- used `prisma validate` and `prisma generate` instead (schema will be pushed on next deploy with DB access)

## User Setup Required
None - no external service configuration required. GuildVoiceStates is a non-privileged intent (no Developer Portal changes needed).

## Next Phase Readiness
- Voice-tracker and wins-lessons modules are data producers ready for Plan 02 (leaderboards) to query
- Season and SeasonSnapshot models ready for Plan 03 (seasonal system) to use
- BotConfig model ready for storing leaderboard message IDs

## Self-Check: PASSED

All 8 files verified present. Both task commits (3284f5f, d5af9e2) verified in git log.

---
*Phase: 03-competition-and-social-proof*
*Completed: 2026-03-20*
