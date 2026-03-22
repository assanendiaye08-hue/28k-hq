# Architecture Patterns: v2.0 Desktop Companion App Integration

**Domain:** Monorepo restructure + desktop app + REST API integration with existing Discord bot
**Researched:** 2026-03-21
**Confidence:** HIGH (full codebase review + official Prisma/Turborepo/Tauri docs)

## Executive Summary

The v2.0 milestone transforms a single-app Discord bot into a three-application platform: the existing bot, a new Fastify REST API, and a Tauri v2 desktop app. All three share the same PostgreSQL database and Prisma schema. The key architectural challenge is extracting shared logic (DB client, types, XP engine, timer constants, rank progression) into reusable packages without breaking the existing bot, then designing a cross-platform timer flow where the desktop app starts sessions via the API and the bot picks them up for Discord notifications and XP awards.

The monorepo restructure is the foundation. Everything else depends on it being right.

---

## Current Architecture (v1.1)

Single Node.js process running on Hetzner VPS via systemd.

```
src/
  index.ts              -- Entry point: client, db, events, commands, module loader
  core/
    config.ts           -- Zod-validated env vars (BOT_TOKEN, DATABASE_URL, etc.)
    client.ts           -- Discord.js Client with intents
    commands.ts         -- Slash command registry
    events.ts           -- EventBus (typed, sync, try/catch per handler)
    module-loader.ts    -- Dynamic import of src/modules/*/index.ts
  db/
    client.ts           -- PrismaClient singleton + encryption extension
    encryption.ts       -- $extends query hook for transparent AES-256-GCM
  shared/
    types.ts            -- Module, ModuleContext, IEventBus, ICommandRegistry
    constants.ts        -- RANK_PROGRESSION, BRAND_COLORS, SERVER_CATEGORIES
    crypto.ts           -- HKDF key derivation, encrypt/decrypt, recovery keys
    delivery.ts         -- DM/channel message delivery
    embeds.ts           -- Shared embed builders
    ai-types.ts         -- AI client types
    ai-templates.ts     -- Prompt templates
  modules/
    timer/              -- In-memory Map + DB persistence + Discord DM UI
    xp/                 -- Atomic XP awards, rank detection, constants
    goals/              -- Hierarchy engine, cascading progress
    checkin/            -- Daily check-ins, streak tracking
    ...25 modules total
```

### Key Patterns

| Pattern | Implementation | Relevant to v2.0? |
|---------|---------------|-------------------|
| Module registration | `register(ctx: ModuleContext)` with Client, DB, EventBus, Commands, Logger | Bot-only -- desktop app has no modules |
| Event bus | In-process pub/sub, sync handlers | Bot-only -- API uses HTTP, not events |
| Timer state | In-memory Map + DB ACTIVE records for recovery | Timer engine logic must be shared |
| XP awards | `awardXP(db, memberId, amount, source, desc)` atomic transaction | API needs this for desktop timer completion |
| Encryption | Prisma `$extends` hook, per-member HKDF keys | Shared -- API reads encrypted data too |
| Rank progression | `RANK_PROGRESSION` array + `getRankForXP()` | Shared -- desktop shows rank/progress |
| Timer constants | `TIMER_DEFAULTS`, `XP_AWARDS.timer` | Shared -- desktop validates timer config |

---

## Target Architecture (v2.0)

```
                                  +------------------+
                                  |   PostgreSQL DB   |
                                  |   (Hetzner VPS)   |
                                  +--------+---------+
                                           |
                    +----------------------+----------------------+
                    |                      |                      |
             +------+------+       +------+------+       +-------+------+
             |  Discord Bot |       |  Fastify API |       | Tauri Desktop|
             |  (apps/bot)  |       |  (apps/api)  |       | (apps/desktop)
             |              |       |              |       |              |
             | - 25 modules |       | - REST routes|       | - React UI   |
             | - Event bus  |       | - JWT auth   |       | - System tray|
             | - Discord.js |       | - Timer CRUD |       | - Timer view |
             | - Cron jobs  |       | - Goals CRUD |       | - Goals view |
             +------+------+       +------+------+       +------+-------+
                    |                      |                      |
                    +----------------------+----------------------+
                                           |
                              +------------+------------+
                              |     packages/db         |
                              |  Prisma schema + client  |
                              |  + encryption extension  |
                              +------------+------------+
                                           |
                              +------------+------------+
                              |    packages/shared       |
                              |  Types, constants, XP    |
                              |  engine, timer constants |
                              +-------------------------+
```

### Monorepo Structure

```
28k-hq/
  turbo.json
  pnpm-workspace.yaml
  package.json                  -- Root: devDeps only (turbo, typescript)

  apps/
    bot/
      src/
        index.ts                -- Current entry point (moved)
        core/                   -- config, client, commands, events, module-loader
        modules/                -- All 25 modules (unchanged internally)
      package.json              -- discord.js, node-cron, etc.
      tsconfig.json

    api/
      src/
        index.ts                -- Fastify server entry
        plugins/
          auth.ts               -- Discord OAuth + JWT
          prisma.ts             -- DB client plugin
        routes/
          auth.ts               -- POST /auth/discord, POST /auth/refresh
          timer.ts              -- GET/POST/PATCH /timer
          goals.ts              -- GET /goals (hierarchy)
          profile.ts            -- GET /profile
          dashboard.ts          -- GET /dashboard (aggregated)
        middleware/
          authenticate.ts       -- JWT verification preHandler
      package.json              -- fastify, @fastify/jwt, @fastify/oauth2
      tsconfig.json

    desktop/
      src/                      -- React frontend
        App.tsx
        components/
          Timer/                -- Timer UI (Pomodoro + Flowmodoro)
          Goals/                -- Goal hierarchy view
          Dashboard/            -- Today's priorities, streaks, rank
        hooks/
          useTimer.ts           -- Timer state management + API sync
          useGoals.ts           -- Goals data fetching
          useAuth.ts            -- OAuth flow + token storage
        api/
          client.ts             -- Fetch wrapper with JWT
      src-tauri/                -- Rust backend
        src/
          main.rs               -- Tauri setup, system tray, plugins
          tray.rs               -- Menu bar icon, timer display
        tauri.conf.json
        Cargo.toml
      package.json              -- react, @tauri-apps/api
      tsconfig.json

  packages/
    db/
      prisma/
        schema.prisma           -- THE schema (moved from root)
        migrations/
      src/
        client.ts               -- PrismaClient singleton + encryption
        index.ts                -- Re-export client + generated types
      generated/
        prisma/                 -- Generated client output
      package.json              -- @prisma/client, @prisma/adapter-pg
      prisma.config.ts
      tsconfig.json

    shared/
      src/
        constants.ts            -- RANK_PROGRESSION, BRAND_COLORS, TIMER_DEFAULTS
        types.ts                -- Shared types (IEventBus stays bot-only)
        xp-engine.ts            -- getRankForXP, getNextRankInfo, calculateCheckinXP
        xp-constants.ts         -- XP_AWARDS, STREAK_CONFIG
        timer-constants.ts      -- TIMER_DEFAULTS
        crypto.ts               -- encrypt, decrypt, deriveMemberKey (Node.js only)
        index.ts                -- Barrel export
      package.json
      tsconfig.json
```

---

## Component Boundaries

### What Gets Extracted to `packages/db`

| Current Location | New Location | Why |
|-----------------|-------------|-----|
| `prisma/schema.prisma` | `packages/db/prisma/schema.prisma` | Single schema, three consumers |
| `src/db/client.ts` | `packages/db/src/client.ts` | Shared Prisma singleton |
| `src/db/encryption.ts` | `packages/db/src/encryption.ts` | API needs encryption too |
| `src/shared/crypto.ts` | `packages/db/src/crypto.ts` | Encryption depends on crypto |
| `src/core/config.ts` | Stays in apps/bot, new config in apps/api | App-specific env vars differ |

The `packages/db` package exports:
```typescript
// packages/db/src/index.ts
export { db, disconnectDb, type ExtendedPrismaClient } from './client.js';
export * from '../generated/prisma/client';  // All Prisma types
```

**Critical**: The encryption extension needs the MASTER_ENCRYPTION_KEY. This env var must be available to both bot and API. The `packages/db/src/client.ts` reads it from `process.env.MASTER_ENCRYPTION_KEY` directly (no app-specific config import).

### What Gets Extracted to `packages/shared`

| Current Location | New Location | Why |
|-----------------|-------------|-----|
| `src/shared/constants.ts` (RANK_PROGRESSION, BRAND_COLORS) | `packages/shared/src/constants.ts` | Desktop shows ranks, uses brand colors |
| `src/modules/xp/engine.ts` (getRankForXP, getNextRankInfo) | `packages/shared/src/xp-engine.ts` | Desktop shows "375 XP to Hustler" |
| `src/modules/xp/constants.ts` (XP_AWARDS, STREAK_CONFIG) | `packages/shared/src/xp-constants.ts` | Desktop validates timer XP rules |
| `src/modules/timer/constants.ts` (TIMER_DEFAULTS) | `packages/shared/src/timer-constants.ts` | Desktop enforces min/max durations |

**What stays bot-only (not extracted):**
- `IEventBus`, `ICommandRegistry`, `ModuleContext`, `Module` -- Discord-specific interfaces
- `deliverToPrivateSpace()` -- Discord DM/channel delivery
- `EventBus` class -- In-process pub/sub, not needed by API or desktop
- Timer engine (`engine.ts`) -- In-memory state machine is bot-specific; API uses DB-only state
- All embed builders -- discord.js `EmbedBuilder` is bot-only
- Module loader -- Bot-specific dynamic import pattern

### What Does NOT Move

The XP `awardXP()` function is an interesting case. It depends on `ExtendedPrismaClient` (from packages/db) and `RANK_PROGRESSION` / `XP_AWARDS` (from packages/shared). It could live in packages/shared, but it also needs the Prisma client type, creating a circular-ish dependency.

**Decision**: Put `awardXP()` in `packages/shared` with the DB client as a parameter. It already takes `db: ExtendedPrismaClient` as a parameter, so no circular dependency -- it just needs the type imported from `packages/db`. This works cleanly because `packages/shared` can depend on `packages/db` for types.

```typescript
// packages/shared/src/xp-engine.ts
import type { ExtendedPrismaClient } from '@28k/db';
import { RANK_PROGRESSION } from './constants.js';
import { XP_AWARDS, STREAK_CONFIG } from './xp-constants.js';

export async function awardXP(
  db: ExtendedPrismaClient,
  memberId: string,
  amount: number,
  source: XPSource,
  description: string,
): Promise<AwardXPResult> { ... }
```

---

## New Components (Not Modified Existing)

### 1. Fastify REST API (`apps/api`)

Brand new application. Does NOT touch bot code.

**Purpose**: HTTP interface to the shared database for the desktop app. Handles authentication, timer CRUD, goals read, dashboard aggregation.

**Key Design Decisions**:

- **Stateless**: No in-memory state. All timer state lives in the database. The bot owns in-memory timer state; the API just reads/writes DB records.
- **JWT authentication**: Desktop app authenticates via Discord OAuth, receives a JWT signed by the API. All subsequent requests include the JWT.
- **Thin layer**: Routes are mostly Prisma queries + shared business logic from packages/shared. The API does not duplicate XP logic or timer state machine logic.

**Route inventory**:

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| POST | /auth/discord | Exchange Discord OAuth code for JWT | No |
| POST | /auth/refresh | Refresh expired JWT | Refresh token |
| GET | /me | Current member profile + stats | JWT |
| POST | /timer | Start a timer session | JWT |
| PATCH | /timer/:id | Pause/resume/stop timer | JWT |
| GET | /timer/active | Get active timer for member | JWT |
| GET | /timer/history | Recent completed sessions | JWT |
| GET | /goals | Goal hierarchy for member | JWT |
| GET | /dashboard | Aggregated dashboard data | JWT |

**What the API does NOT do**:
- Send Discord DMs (bot handles Discord delivery)
- Manage in-memory timer timeouts (timer transitions happen client-side in desktop app)
- Run cron jobs (bot handles scheduled tasks)
- Manage Discord roles, channels, or interactions

### 2. Tauri Desktop App (`apps/desktop`)

Brand new application. Communicates ONLY with the API, never directly with the database.

**Architecture**:
- React frontend in WebView (standard Vite + React setup)
- Rust backend for system tray, menu bar, and OS integration
- All data fetched from REST API via `fetch()` with JWT auth header

**System Tray / Menu Bar**:
- Gold ouroboros icon in macOS menu bar / Windows system tray
- Title text shows countdown during active timer (e.g., "23:45")
- Menu items: Quick Timer Start, Current Status, Settings, Quit
- Tray icon updates via Rust `set_title()` called from frontend via Tauri commands

**Local State vs Remote State**:
- Timer countdown runs locally (JavaScript `setInterval` for display)
- Timer state persisted to API on start, pause, resume, stop
- On app launch: check API for active session, resume local countdown if found
- No local database -- the desktop app is a thin client

### 3. Discord OAuth Flow

```
Desktop App                    API Server                 Discord
    |                             |                          |
    |-- Open browser to -------->|                          |
    |   /auth/discord?...        |                          |
    |                            |-- Redirect to ---------->|
    |                            |   discord.com/oauth2     |
    |                            |                          |
    |                            |<-- Callback with code ---|
    |                            |                          |
    |                            |-- Exchange code for ----->|
    |                            |   access_token           |
    |                            |                          |
    |                            |<-- access_token ---------|
    |                            |                          |
    |                            |-- GET /users/@me ------->|
    |                            |                          |
    |                            |<-- Discord user info ----|
    |                            |                          |
    |<-- JWT + refresh token ----|                          |
    |    (mapped to memberId)    |                          |
```

**Implementation details**:

1. Desktop app uses `tauri-plugin-oauth` to spawn a temporary localhost server
2. The localhost callback receives the authorization code from Discord redirect
3. Desktop posts the code to `POST /api/auth/discord`
4. API exchanges the code with Discord for an access token
5. API calls Discord's `/users/@me` to get the user's Discord ID
6. API looks up `DiscordAccount` by discordId to find the `memberId`
7. API signs a JWT containing `{ memberId, discordId }` and returns it
8. Desktop stores the JWT securely (Tauri's secure storage or keychain)

**Required Discord OAuth scopes**: `identify` (that's it -- we only need the Discord user ID to map to a member)

**JWT payload**:
```typescript
{
  sub: string;       // memberId (internal CUID)
  did: string;       // discordId (for display/avatar)
  iat: number;       // issued at
  exp: number;       // expires (15 min)
}
```

Refresh tokens stored server-side in a new `RefreshToken` model or in `BotConfig` (key-value store already exists).

---

## Cross-Platform Timer Flow

This is the most complex integration point. The timer needs to work from both Discord (bot slash commands) and the desktop app, with sessions tracked in the same database and XP awarded once.

### Design Principle: Database as Source of Truth

The bot's in-memory timer Map is an optimization for the bot process. The API writes directly to the database. Both use the same `TimerSession` model.

### Flow: Timer Started from Desktop App

```
Desktop App              API Server              Database              Bot Process
    |                        |                       |                      |
    |-- POST /timer -------->|                       |                      |
    |   {mode, work, break,  |                       |                      |
    |    focus, goalId}      |                       |                      |
    |                        |-- INSERT TimerSession->|                      |
    |                        |   status=ACTIVE        |                      |
    |                        |   source='DESKTOP'     |                      |
    |<-- 201 {session} ------|                       |                      |
    |                        |                       |                      |
    |  [Local countdown      |                       |                      |
    |   running in React]    |                       |                      |
    |                        |                       |                      |
    |-- PATCH /timer/:id --->|                       |                      |
    |   {action: 'pause'}   |                       |                      |
    |                        |-- UPDATE TimerSession->|                      |
    |                        |   state='paused'       |                      |
    |                        |   remainingMs=...      |                      |
    |<-- 200 {session} ------|                       |                      |
    |                        |                       |                      |
    |-- PATCH /timer/:id --->|                       |                      |
    |   {action: 'stop'}    |                       |                      |
    |                        |-- UPDATE TimerSession->|                      |
    |                        |   status='COMPLETED'   |                      |
    |                        |   endedAt=now          |                      |
    |                        |                       |                      |
    |                        |-- awardXP() ---------->|                      |
    |                        |   (from packages/      |                      |
    |                        |    shared)             |                      |
    |<-- 200 {xp, rank} ----|                       |                      |
    |                        |                       |                      |
    |                        |                       |   [Bot's cron or     |
    |                        |                       |    event listener    |
    |                        |                       |    detects new XP    |
    |                        |                       |    transaction]      |
    |                        |                       |                      |
    |                        |                       |<---- Bot queries -----|
    |                        |                       |      for levelUp     |
    |                        |                       |                      |
    |                        |                       |   [If levelUp: bot   |
    |                        |                       |    sends Discord DM  |
    |                        |                       |    + updates roles]  |
```

### Flow: Timer Started from Discord Bot (unchanged)

The bot's existing timer flow is completely unchanged. The in-memory Map + DB persistence pattern continues to work. The only addition: a `source` field on `TimerSession` to distinguish `'BOT'` vs `'DESKTOP'` sessions.

### Schema Change for Cross-Platform Support

```prisma
model TimerSession {
  // ... existing fields unchanged ...

  // NEW: Source platform
  source    String    @default("BOT")  // "BOT" or "DESKTOP"

  // REPURPOSED: dmMessageId/dmChannelId are null for DESKTOP sessions
  // Bot ignores DESKTOP sessions in its in-memory Map
  // API ignores BOT sessions in its timer routes
}
```

### Bot-Side: Detecting Desktop Timer Completions

The bot needs to know when a desktop timer completes so it can:
1. Send a Discord DM with the completion summary
2. Update Discord roles if a level-up occurred

**Options considered**:
- **Webhook from API to bot**: Over-engineered for 10-25 users
- **Bot polls DB**: Simple, reliable, low-frequency
- **Shared event via Redis**: Overkill for single-VPS deployment

**Decision**: Bot polls. Add a lightweight cron job (every 30 seconds) that checks for recently-completed DESKTOP timer sessions that haven't been notified yet.

```prisma
model TimerSession {
  // ... existing fields ...
  source          String    @default("BOT")
  botNotified     Boolean   @default(false)  // Has bot sent completion DM?
}
```

Bot cron logic:
```typescript
// Every 30 seconds
const unnotified = await db.timerSession.findMany({
  where: {
    source: 'DESKTOP',
    status: 'COMPLETED',
    botNotified: false,
    endedAt: { gte: thirtyMinutesAgo },  // Don't notify old sessions
  },
});

for (const session of unnotified) {
  // Send Discord DM with completion embed
  await deliverTimerCompletionDM(session);
  // Check for level-up and update roles
  await checkAndNotifyLevelUp(session.memberId);
  // Mark as notified
  await db.timerSession.update({
    where: { id: session.id },
    data: { botNotified: true },
  });
}
```

This is simple, robust, works with a single-VPS architecture, and the 30-second delay is acceptable for a completion notification.

### Timer State Machine Comparison

| Aspect | Bot (In-Memory) | API (DB-Only) |
|--------|-----------------|---------------|
| State storage | Map<memberId, ActiveTimer> | TimerSession rows |
| Transition scheduling | setTimeout callbacks | Client-side (desktop counts down locally) |
| Work-to-break transition | Bot's event bus emits `timerTransition` | Desktop app triggers locally, PATCH API |
| XP award | On `stopTimer()` in-process | On `PATCH /timer/:id {action: stop}` |
| Restart recovery | Bot reconstructs from ACTIVE sessions | Desktop checks API on launch |
| DM delivery | Bot edits DM message with embed | Bot polls for DESKTOP completions |

---

## Authentication Architecture

### JWT Token Lifecycle

```
Access Token (15 min TTL)
  - Stored in memory (React state)
  - Sent as Bearer header on every API request
  - Contains memberId + discordId

Refresh Token (30 day TTL)
  - Stored in Tauri secure storage (OS keychain)
  - Used to get new access token when expired
  - Rotated on each refresh (one-time use)
  - Invalidated on logout
```

### New Database Model

```prisma
model RefreshToken {
  id        String   @id @default(cuid())
  memberId  String
  token     String   @unique  // Random 64-byte hex
  expiresAt DateTime
  createdAt DateTime @default(now())

  @@index([memberId])
  @@index([token, expiresAt])
}
```

### API Auth Middleware

```typescript
// apps/api/src/middleware/authenticate.ts
import { FastifyRequest, FastifyReply } from 'fastify';

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const payload = await request.jwtVerify();
    request.memberId = payload.sub;
    request.discordId = payload.did;
  } catch {
    reply.code(401).send({ error: 'Unauthorized' });
  }
}
```

---

## Data Flow Diagrams

### Dashboard Data (Desktop App Launch)

```
Desktop App                    API Server                    Database
    |                              |                            |
    |-- GET /dashboard ----------->|                            |
    |                              |-- Member + stats --------->|
    |                              |-- Active goals (tree) ---->|
    |                              |-- Today's check-ins ------>|
    |                              |-- Current streak --------->|
    |                              |-- Active timer? ---------->|
    |                              |                            |
    |                              |  [Aggregate into single    |
    |                              |   response object]         |
    |                              |                            |
    |<-- 200 {                     |                            |
    |     member: { name, rank,    |                            |
    |       totalXp, streak },     |                            |
    |     goals: [ hierarchy ],    |                            |
    |     timer: { active? },      |                            |
    |     quote: "..."             |                            |
    |   } -------------------------|                            |
```

### Goals Hierarchy (Read-Only from Desktop)

Desktop displays goals but does NOT create/edit them (that stays in Discord for v2.0 MVP). Goals are read-only in the desktop app to keep scope manageable.

```
GET /goals?timeframe=weekly
  -> Returns nested goal tree for the authenticated member
  -> Uses goalTreeInclude pattern from packages/shared
  -> Titles are cleartext; descriptions are decrypted by the encryption extension
```

---

## Monorepo Configuration

### `pnpm-workspace.yaml`

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

### Root `package.json`

```json
{
  "name": "28k-hq",
  "private": true,
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "db:generate": "turbo db:generate",
    "db:migrate": "turbo db:migrate"
  },
  "devDependencies": {
    "turbo": "^2.x",
    "typescript": "^5.9.x"
  }
}
```

### `turbo.json`

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalEnv": ["DATABASE_URL", "MASTER_ENCRYPTION_KEY"],
  "tasks": {
    "build": {
      "dependsOn": ["^build", "^db:generate"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "dependsOn": ["^db:generate"],
      "cache": false,
      "persistent": true
    },
    "db:generate": {
      "cache": false
    },
    "db:migrate": {
      "cache": false
    },
    "lint": {
      "dependsOn": ["^db:generate"]
    }
  }
}
```

### Package Dependencies (Dependency Graph)

```
packages/db          -- No internal deps (depends on @prisma/client, pg)
packages/shared      -- Depends on packages/db (for types only)
apps/bot             -- Depends on packages/db, packages/shared
apps/api             -- Depends on packages/db, packages/shared
apps/desktop         -- Depends on packages/shared (for constants/types only, NOT db)
```

The desktop app NEVER imports packages/db directly. It has no database access. It communicates only through the API.

### Package Names

```
packages/db       -> @28k/db
packages/shared   -> @28k/shared
apps/bot          -> @28k/bot
apps/api          -> @28k/api
apps/desktop      -> @28k/desktop
```

### `packages/db/package.json`

```json
{
  "name": "@28k/db",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:deploy": "prisma migrate deploy",
    "db:studio": "prisma studio"
  },
  "dependencies": {
    "@prisma/client": "^7.5.0",
    "@prisma/adapter-pg": "^7.5.0",
    "pg": "^8.20.0"
  },
  "devDependencies": {
    "prisma": "^7.5.0"
  }
}
```

### `packages/shared/package.json`

```json
{
  "name": "@28k/shared",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@28k/db": "workspace:*"
  }
}
```

---

## Build Order and Dependencies

### Phase Build Order (Suggested Roadmap Sequence)

```
Phase 1: Monorepo Restructure
  1. Create monorepo skeleton (pnpm-workspace.yaml, turbo.json)
  2. Extract packages/db (schema, client, encryption, crypto)
  3. Extract packages/shared (constants, XP engine, timer constants)
  4. Move bot to apps/bot, update all imports
  5. Verify bot builds and runs identically

Phase 2: REST API Foundation
  1. Create apps/api skeleton (Fastify)
  2. Add Discord OAuth + JWT auth
  3. Add /me, /dashboard routes (read-only)
  4. Deploy API alongside bot on same VPS

Phase 3: Desktop App Shell
  1. Create apps/desktop (Tauri + React)
  2. Implement OAuth login flow
  3. Dashboard view (read-only data display)
  4. System tray with icon

Phase 4: Cross-Platform Timer
  1. Add timer API routes (POST, PATCH, GET)
  2. Desktop timer UI (Pomodoro + Flowmodoro setup, countdown)
  3. Menu bar countdown display
  4. Bot polling for desktop completions + DM notifications
  5. Add TimerSession.source and TimerSession.botNotified fields

Phase 5: Goals + Polish
  1. Goals hierarchy read view in desktop
  2. Dark theme with gold accents
  3. Auto-update, error handling, offline resilience
```

### Build Dependency Chain

```
prisma generate (packages/db)
       |
       v
tsc packages/shared (depends on packages/db types)
       |
       v
  +----+----+----+
  |         |    |
  v         v    v
apps/bot  apps/api  apps/desktop (Vite build, no tsc)
```

### Dev Server Startup Order

1. `pnpm turbo db:generate` (runs once)
2. All three apps can start in parallel:
   - `apps/bot`: `tsx watch src/index.ts`
   - `apps/api`: `tsx watch src/index.ts`
   - `apps/desktop`: `cargo tauri dev` (runs Vite + Tauri together)

---

## VPS Deployment Architecture

Both bot and API run on the same Hetzner VPS. The desktop app is distributed as a native binary.

```
Hetzner VPS (same machine)
  +------------------------------------------+
  |                                          |
  |  systemd: 28k-bot.service                |
  |    -> node /opt/28k-hq/apps/bot/dist/    |
  |                                          |
  |  systemd: 28k-api.service                |
  |    -> node /opt/28k-hq/apps/api/dist/    |
  |    -> Listens on :3001 (internal)        |
  |                                          |
  |  nginx (reverse proxy)                   |
  |    -> api.28khq.com -> localhost:3001    |
  |    -> TLS via Let's Encrypt              |
  |                                          |
  |  PostgreSQL                              |
  |    -> Both services connect via           |
  |       DATABASE_URL (unix socket)         |
  |                                          |
  +------------------------------------------+
```

**Why nginx**: The API needs HTTPS for the desktop app to communicate securely. nginx handles TLS termination and can also rate-limit or log requests.

**Shared `.env`**: Both services read the same `.env` file (or systemd EnvironmentFile) with shared secrets (DATABASE_URL, MASTER_ENCRYPTION_KEY). Bot has additional Discord-specific vars; API has JWT_SECRET.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Shared In-Memory State Between Bot and API
**What:** Trying to share the bot's in-memory timer Map with the API process
**Why bad:** They are separate processes. Cannot share memory. Would require Redis/IPC which is overkill for 10-25 users.
**Instead:** Database is the shared state. Bot owns in-memory optimizations for its own timers. API writes to DB. Bot polls DB for cross-platform sync.

### Anti-Pattern 2: Desktop App Directly Accessing Database
**What:** Having the Tauri app connect to PostgreSQL directly
**Why bad:** Exposes database credentials in a client application. No auth layer. Can't rate-limit or validate requests. Encryption key would be in the desktop binary.
**Instead:** Desktop talks to API only. API handles auth, validation, and database access.

### Anti-Pattern 3: Duplicating Business Logic
**What:** Re-implementing XP calculations, rank thresholds, or timer validation in the API or desktop
**Why bad:** Logic diverges over time. XP awarded differently from bot vs desktop.
**Instead:** Extract to packages/shared. Both bot and API import the same `awardXP()`, `getRankForXP()`, `TIMER_DEFAULTS`.

### Anti-Pattern 4: Bot Watching Database Changes via Triggers/LISTEN
**What:** Using PostgreSQL LISTEN/NOTIFY or triggers to alert the bot of desktop timer completions
**Why bad:** Adds complexity to the database layer. Hard to debug. Prisma doesn't natively support LISTEN/NOTIFY.
**Instead:** Simple polling cron (every 30 seconds). For 10-25 users, this is zero-load and dead simple.

### Anti-Pattern 5: Premature WebSocket Integration
**What:** Adding WebSocket support between API and desktop for real-time updates
**Why bad:** The desktop app runs a local timer. It doesn't need real-time push from the server. HTTP polling on app launch is sufficient for dashboard data.
**Instead:** REST API with polling on focus/launch. Timer countdown runs entirely client-side. State synced to API on user actions (start, pause, stop).

---

## Scalability Considerations

| Concern | 10-25 users (current) | 100+ users (future) |
|---------|----------------------|---------------------|
| API load | ~50 req/day total | Add response caching |
| Timer polling | 30s cron, <1 query | Still fine at 100 |
| DB connections | 2 clients (bot + API) | PgBouncer if needed |
| Auth tokens | In-memory JWT verify | Still fine |
| Desktop updates | Manual/GitHub releases | Tauri auto-updater |

This architecture is deliberately simple for the current scale. Every component can be enhanced independently if the user base grows.

---

## Sources

- [Prisma + Turborepo Guide](https://www.prisma.io/docs/guides/turborepo) -- Official guide for shared DB package (HIGH confidence)
- [Turborepo Repository Structure](https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository) -- apps/ vs packages/ convention (HIGH confidence)
- [Tauri v2 System Tray](https://v2.tauri.app/learn/system-tray/) -- Tray icon, title, menu items (HIGH confidence)
- [Tauri v2 Create Project](https://v2.tauri.app/start/create-project/) -- React + Tauri setup (HIGH confidence)
- [tauri-plugin-oauth](https://github.com/FabianLars/tauri-plugin-oauth) -- OAuth flow for desktop apps (MEDIUM confidence)
- [Fastify OAuth2 Plugin](https://github.com/fastify/fastify-oauth2) -- Discord OAuth integration (HIGH confidence)
- [Fastify JWT Plugin](https://github.com/fastify/fastify-jwt) -- JWT signing/verification (HIGH confidence)
- [Discord OAuth2 Docs](https://docs.discord.com/developers/topics/oauth2) -- Scopes, endpoints (HIGH confidence)
- [Prisma + Fastify Example](https://github.com/prisma/prisma-examples/tree/latest/typescript/rest-fastify) -- REST API pattern (HIGH confidence)
- [TypeScript Monorepo Best Practice 2026](https://hsb.horse/en/blog/typescript-monorepo-best-practice-2026/) -- pnpm + Turborepo + TS Project References (MEDIUM confidence)
