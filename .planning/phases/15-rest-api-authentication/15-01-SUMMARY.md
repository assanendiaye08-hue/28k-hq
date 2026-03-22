---
phase: 15-rest-api-authentication
plan: 01
subsystem: api
tags: [fastify, jwt, discord-oauth, cors, rate-limit, prisma, zod, refresh-token]

# Dependency graph
requires:
  - phase: 14-monorepo-restructure
    provides: monorepo structure with @28k/db, @28k/shared, apps/api scaffold
provides:
  - Fastify REST API server with plugin architecture
  - Discord OAuth2 code exchange with PKCE support
  - JWT access tokens (15m) with refresh token rotation (30d)
  - Authenticate middleware for protected routes
  - Health endpoint with DB connectivity check
  - RefreshToken model in Prisma schema
  - TimerSession source and botNotified fields for cross-platform support
affects: [16-desktop-app-shell, 17-desktop-timer-sync, 18-desktop-dashboard]

# Tech tracking
tech-stack:
  added: [fastify, @fastify/cors, @fastify/jwt, @fastify/cookie, @fastify/rate-limit, fastify-plugin, zod, dotenv, tsx]
  patterns: [fastify-plugin encapsulation, Zod request validation, JWT+refresh token rotation, module augmentation for Fastify types]

key-files:
  created:
    - apps/api/src/index.ts
    - apps/api/src/config.ts
    - apps/api/src/plugins/prisma.ts
    - apps/api/src/plugins/auth.ts
    - apps/api/src/plugins/cors.ts
    - apps/api/src/plugins/rate-limit.ts
    - apps/api/src/middleware/authenticate.ts
    - apps/api/src/routes/health.ts
    - apps/api/src/routes/auth.ts
    - apps/api/src/lib/discord-oauth.ts
    - apps/api/tsconfig.json
  modified:
    - packages/db/prisma/schema.prisma
    - apps/api/package.json

key-decisions:
  - "Used Fastify plugin encapsulation for routes (no fp wrapper) and fp for infrastructure plugins"
  - "JWT payload contains sub (memberId) and did (discordId) for route-level identity"
  - "Refresh token rotation: delete old token, create new on each refresh for security"
  - "Rate limiting per-route on auth endpoints (5/min discord, 10/min refresh) plus global 100/min"

patterns-established:
  - "Fastify plugin pattern: infrastructure via fp(), routes via plain async function"
  - "Request validation: Zod schemas parsed in handler, 400 on failure"
  - "Module augmentation for FastifyInstance.db and FastifyRequest.memberId/discordId"
  - "Config pattern: Zod-validated process.env with hard fail on missing required vars"

requirements-completed: [API-01, AUTH-01, AUTH-02, AUTH-03]

# Metrics
duration: 3min
completed: 2026-03-21
---

# Phase 15 Plan 01: REST API Authentication Summary

**Fastify API server with Discord OAuth2 PKCE login, JWT access/refresh token rotation, and full plugin infrastructure (CORS, rate-limit, Prisma, JWT)**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-21T11:40:20Z
- **Completed:** 2026-03-21T11:43:50Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments
- Fastify server with 4 infrastructure plugins (CORS, rate-limit, Prisma, JWT/cookie) registered in correct order
- Discord OAuth2 code exchange with PKCE support, mapping Discord identity to existing 28K HQ members
- JWT access tokens (15m expiry) with refresh token rotation (30d expiry, single-use with DB persistence)
- Authenticate middleware that verifies JWT and decorates requests with memberId + discordId
- Health endpoint with database connectivity verification
- RefreshToken model and TimerSession cross-platform fields added to Prisma schema

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema changes + API dependencies + server foundation + plugins** - `dda3c26` (feat)
2. **Task 2: Discord OAuth exchange + JWT issuance + refresh + logout routes** - `21a12c9` (feat)

## Files Created/Modified
- `packages/db/prisma/schema.prisma` - Added RefreshToken model, TimerSession source/botNotified fields
- `apps/api/package.json` - Full dependency set for Fastify API
- `apps/api/tsconfig.json` - TypeScript config extending monorepo base
- `apps/api/src/index.ts` - Fastify server entry point with plugin/route registration
- `apps/api/src/config.ts` - Zod-validated environment configuration
- `apps/api/src/plugins/prisma.ts` - Database plugin decorating FastifyInstance with db
- `apps/api/src/plugins/auth.ts` - JWT + cookie plugin registration
- `apps/api/src/plugins/cors.ts` - CORS for Tauri desktop app origins
- `apps/api/src/plugins/rate-limit.ts` - Global rate limiting (100/min)
- `apps/api/src/middleware/authenticate.ts` - JWT verification preHandler hook
- `apps/api/src/routes/health.ts` - GET /health with DB connectivity check
- `apps/api/src/routes/auth.ts` - POST /discord, POST /refresh, POST /logout
- `apps/api/src/lib/discord-oauth.ts` - Discord OAuth2 helpers (exchangeCode, getDiscordUser)

## Decisions Made
- Used Fastify plugin encapsulation: infrastructure plugins wrapped with `fp()` for shared state, route plugins use plain async functions for encapsulation
- JWT payload contains `sub` (memberId) and `did` (discordId) -- minimal claims for route-level identity resolution
- Refresh token rotation deletes old token and creates new on each use, preventing token reuse attacks
- Per-route rate limiting on auth endpoints (5/min for Discord exchange, 10/min for refresh) layered on top of global 100/min
- CORS origins include `tauri://localhost` and `https://tauri.localhost` for Tauri v2 desktop app support

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

The API requires the following environment variables to be set in `apps/api/.env`:
- `JWT_SECRET` - Secret key for JWT signing
- `DISCORD_CLIENT_ID` - Discord application client ID
- `DISCORD_CLIENT_SECRET` - Discord application client secret
- `DATABASE_URL` - PostgreSQL connection string

## Next Phase Readiness
- API server foundation complete with all infrastructure plugins
- Auth flow ready for desktop app integration (Discord OAuth2 PKCE)
- Protected route pattern established via authenticate middleware
- Ready for data endpoints (timer sync, dashboard data) in subsequent plans/phases

## Self-Check: PASSED

All 12 created files verified present. Both task commits (dda3c26, 21a12c9) verified in git log.

---
*Phase: 15-rest-api-authentication*
*Completed: 2026-03-21*
