---
phase: 15-rest-api-authentication
plan: 02
subsystem: api
tags: [fastify, timer, goals, dashboard, quotes, xp, zod, prisma]

# Dependency graph
requires:
  - phase: 15-rest-api-authentication
    plan: 01
    provides: Fastify server, JWT auth, authenticate middleware, Prisma plugin
  - phase: 14-monorepo-restructure
    provides: "@28k/shared (awardXP, getRankForXP, XP_AWARDS, TIMER_DEFAULTS), @28k/db"
provides:
  - Timer CRUD endpoints (create, pause, resume, stop, active, history) with XP award on completion
  - Goals hierarchy endpoints (list, create, update/complete, single with children)
  - Dashboard aggregation endpoint (member stats, rank, goals, timer, checkins, quote)
  - Daily rotating quote system (50 curated operator quotes)
affects: [16-desktop-app-shell, 17-desktop-timer-sync, 18-desktop-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns: [Zod request validation for all endpoints, preHandler authenticate hook per plugin, daily cap enforcement for timer XP, goal depth validation, parallel Promise.all for dashboard queries]

key-files:
  created:
    - apps/api/src/routes/timer.ts
    - apps/api/src/routes/goals.ts
    - apps/api/src/routes/dashboard.ts
    - apps/api/src/routes/quote.ts
    - apps/api/src/lib/quotes.ts
  modified:
    - apps/api/src/index.ts

key-decisions:
  - "Timer XP uses same formula as bot: 1 XP per 5 min worked, min 5 min, daily cap 200"
  - "Goal hierarchy loaded 4 levels deep using nested Prisma includes (matches bot pattern)"
  - "Dashboard returns goals split into today (weekly + 7-day deadline) and weekly categories"
  - "Quote rotation uses day-of-year modulo for consistent daily quote (UTC-based)"

patterns-established:
  - "Route plugin pattern: async function with fastify.addHook('preHandler', authenticate) for all routes"
  - "Zod safeParse with 400 error response including flattened error details"
  - "One-active-per-member enforcement: findFirst + 409 conflict response"
  - "Daily cap: sum xpAwarded from today's sessions, cap remainder"

requirements-completed: [API-02, API-03, API-04, API-05, API-06]

# Metrics
duration: 4min
completed: 2026-03-21
---

# Phase 15 Plan 02: Data Endpoints Summary

**Timer CRUD with XP awards, goal hierarchy with completion XP, dashboard aggregation, and daily quote rotation -- complete REST API for desktop app consumption**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-21T11:47:37Z
- **Completed:** 2026-03-21T11:51:16Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Timer CRUD endpoints with one-active-per-member enforcement, pause/resume/stop actions, and XP award on completion using shared awardXP() with daily cap
- Goals hierarchy endpoints supporting 4-level deep nesting, depth validation, creation with parentId, progress updates, and completion with XP award
- Dashboard aggregation endpoint combining member stats, rank info (getRankForXP/getNextRankInfo), goals, active timer, today's check-ins, and daily quote in parallel queries
- Daily rotating quote system with 50 curated operator quotes from discipline/hustle/execution figures

## Task Commits

Each task was committed atomically:

1. **Task 1: Timer CRUD endpoints with XP award on completion** - `e88347c` (feat)
2. **Task 2: Goals, Dashboard, and Quote endpoints** - `4ad4cff` (feat)

## Files Created/Modified
- `apps/api/src/routes/timer.ts` - Timer CRUD: POST /, PATCH /:id (pause/resume/stop), GET /active, GET /history with XP award logic
- `apps/api/src/routes/goals.ts` - Goals: GET / (hierarchy), POST / (create with depth validation), PATCH /:id (progress/complete), GET /:id
- `apps/api/src/routes/dashboard.ts` - Dashboard: GET / aggregating member, goals, timer, checkins, quote with parallel queries
- `apps/api/src/routes/quote.ts` - Quote: GET / returning daily rotating operator quote (no auth required)
- `apps/api/src/lib/quotes.ts` - 50 curated operator quotes with getDailyQuote() using day-of-year rotation
- `apps/api/src/index.ts` - Registered timer, goals, dashboard, and quote route plugins at proper prefixes

## Decisions Made
- Timer XP calculation matches bot formula exactly: 1 XP per 5 min worked, minimum 5 min to earn any, daily cap of 200 XP
- Goal hierarchy loaded with nested Prisma includes 4 levels deep (same goalTreeInclude pattern as bot)
- Dashboard splits goals into "today" (weekly timeframe + 7-day deadline window) and "weekly" categories
- Quote rotation is deterministic by day-of-year modulo quote count (same quote for entire UTC day)
- Quote endpoint is the only unauthenticated data endpoint (alongside /health)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. All endpoints use existing database schema and shared packages.

## Next Phase Readiness
- Complete REST API ready for desktop app consumption (auth + data endpoints)
- Timer sync between bot and desktop can leverage source field (BOT vs DESKTOP) and botNotified flag
- Dashboard endpoint provides all data needed for desktop dashboard view
- Goal hierarchy API matches bot's hierarchy module patterns for consistency

## Self-Check: PASSED

All 6 files verified present. Both task commits (e88347c, 4ad4cff) verified in git log.

---
*Phase: 15-rest-api-authentication*
*Completed: 2026-03-21*
