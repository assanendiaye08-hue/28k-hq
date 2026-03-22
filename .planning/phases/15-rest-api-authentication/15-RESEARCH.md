# Phase 15: REST API + Authentication - Research

**Researched:** 2026-03-21
**Domain:** Fastify v5 REST API with Discord OAuth2 PKCE, JWT authentication, timer/goals/dashboard endpoints
**Confidence:** HIGH

## Summary

Phase 15 builds the Fastify REST API server in the `apps/api/` scaffold created by Phase 14. The API is the data layer boundary between the desktop app (Phase 16+) and the shared PostgreSQL database. It handles Discord OAuth2 authentication (PKCE flow for public clients), issues JWT access/refresh tokens, and exposes CRUD endpoints for timers, goals, dashboard aggregation, and daily quotes.

The existing monorepo infrastructure is solid: `@28k/db` exports the Prisma client with encryption, `@28k/shared` exports the XP engine and timer constants. The API imports both packages via workspace protocol. The critical architectural decision is that the API is a **stateless HTTP layer** -- no in-memory timer state, no scheduled timeouts. Timer countdown logic runs client-side in the desktop app; the API just persists state transitions to the database.

**Primary recommendation:** Build a minimal Fastify 5 server with TypeScript + ESM, register `@fastify/jwt` for token management, `@fastify/cors` for desktop app origins, and `@fastify/rate-limit` for basic security. Implement Discord OAuth2 PKCE with the API as the token exchange intermediary (client_secret never touches the desktop app). Add a `RefreshToken` model to the Prisma schema. Use Fastify's plugin encapsulation pattern to organize routes and middleware.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fastify | 5.8.x | HTTP API framework | 78K req/s, schema validation, TypeScript-first, plugin encapsulation. Already decided in STACK.md. |
| @fastify/cors | 11.x | CORS handling | Allow requests from Tauri app origins (`http://tauri.localhost`, `tauri://localhost`, `http://localhost:1420` dev). Official Fastify plugin. |
| @fastify/jwt | 9.x+ | JWT token management | Signs/verifies JWT access tokens. Decorates `request.user`. Handles expiry. Works with Fastify 5. |
| @fastify/cookie | 11.x | Cookie parsing | Handle refresh tokens via httpOnly cookies for secure token rotation. |
| @fastify/rate-limit | 10.x | Rate limiting | Prevent brute-force on auth endpoints. 10.3.0 is latest, documented Fastify 5 compatible. |
| zod | 4.x | Input validation | Already used by the bot. Validate request bodies/params. |
| dotenv | 17.x | Environment variables | Load `.env` for API-specific config (JWT_SECRET, DISCORD_CLIENT_ID, etc.). Already a bot dependency. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @28k/db | workspace:* | Prisma client + encryption | All database access. Already exists from Phase 14. |
| @28k/shared | workspace:* | XP engine, timer constants, rank constants | Timer XP awards, dashboard rank display, timer validation. Already exists from Phase 14. |
| tsx | 4.x | TypeScript execution | Dev mode: `tsx watch src/index.ts`. Already used by bot. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @fastify/jwt | jose | jose is lower-level. @fastify/jwt integrates with Fastify's request lifecycle (decorators, preHandler). Use the plugin. |
| zod for validation | Fastify JSON Schema | JSON Schema is Fastify's native validation. But the team already uses Zod extensively in the bot. Use Zod + `zod-to-json-schema` if needed, or validate in route handlers directly. |
| @fastify/rate-limit | Manual rate limiting | The plugin handles sliding windows, IP tracking, and response headers. No reason to hand-roll. |

**Installation:**
```bash
cd apps/api
pnpm add fastify @fastify/cors @fastify/jwt @fastify/cookie @fastify/rate-limit zod dotenv
pnpm add -D @types/node tsx typescript
```

## Architecture Patterns

### Recommended Project Structure

```
apps/api/
  src/
    index.ts              # Entry point: create Fastify instance, register plugins, listen
    config.ts             # Zod-validated env vars (JWT_SECRET, DISCORD_CLIENT_ID, etc.)
    plugins/
      prisma.ts           # Decorate fastify with db client from @28k/db
      auth.ts             # @fastify/jwt registration + request.memberId decorator
      cors.ts             # @fastify/cors configuration
      rate-limit.ts       # @fastify/rate-limit configuration
    routes/
      auth.ts             # POST /auth/discord, POST /auth/refresh, POST /auth/logout
      timer.ts            # POST /timer, PATCH /timer/:id, GET /timer/active, GET /timer/history
      goals.ts            # GET /goals
      dashboard.ts        # GET /dashboard (aggregated)
      quote.ts            # GET /quote
      health.ts           # GET /health (liveness + db check)
    middleware/
      authenticate.ts     # preHandler hook: verifies JWT, sets request.memberId
    lib/
      discord-oauth.ts    # Discord OAuth2 PKCE helpers (buildAuthUrl, exchangeCode, getUser)
      quotes.ts           # Curated quote pool + daily rotation logic
  package.json
  tsconfig.json
```

### Pattern 1: Fastify Plugin Encapsulation

**What:** Each concern (db, auth, cors, routes) is a Fastify plugin registered via `fastify.register()`.
**When to use:** Always. Fastify's plugin system provides encapsulation and testability.
**Example:**

```typescript
// apps/api/src/plugins/prisma.ts
import fp from 'fastify-plugin';
import { db, type ExtendedPrismaClient } from '@28k/db';
import type { FastifyPluginAsync } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    db: ExtendedPrismaClient;
  }
}

const prismaPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('db', db);

  fastify.addHook('onClose', async () => {
    await db.$disconnect();
  });
};

export default fp(prismaPlugin, { name: 'prisma' });
```

### Pattern 2: JWT Authentication Middleware

**What:** A preHandler hook that verifies JWT and sets `request.memberId`.
**When to use:** On all authenticated routes (everything except `/auth/*` and `/health`).
**Example:**

```typescript
// apps/api/src/middleware/authenticate.ts
import type { FastifyRequest, FastifyReply } from 'fastify';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; did: string };
    user: { sub: string; did: string };
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    memberId: string;
    discordId: string;
  }
}

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

### Pattern 3: Route Modules as Async Plugins

**What:** Each route file is an async plugin that registers related endpoints.
**When to use:** For organizing routes by domain (auth, timer, goals, etc.).
**Example:**

```typescript
// apps/api/src/routes/timer.ts
import type { FastifyPluginAsync } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';

const timerRoutes: FastifyPluginAsync = async (fastify) => {
  // All routes in this plugin require authentication
  fastify.addHook('preHandler', authenticate);

  fastify.post('/timer', async (request, reply) => {
    const { mode, workDuration, breakDuration, focus, goalId } = request.body as any;
    // Validate with TIMER_DEFAULTS from @28k/shared
    // Create TimerSession via fastify.db
    // Return 201 with session data
  });

  fastify.patch('/timer/:id', async (request, reply) => {
    const { action } = request.body as any; // 'pause' | 'resume' | 'stop'
    // Update TimerSession, award XP on stop via awardXP from @28k/shared
  });

  fastify.get('/timer/active', async (request, reply) => {
    // Find ACTIVE TimerSession for request.memberId
  });
};

export default timerRoutes;
```

### Pattern 4: Discord OAuth2 PKCE Token Exchange

**What:** The API server handles the entire token exchange -- the desktop app never sees the client_secret.
**When to use:** The `/auth/discord` endpoint.
**Flow:**

```
1. Desktop app generates code_verifier (43-128 chars) + code_challenge (SHA256)
2. Desktop app opens system browser to Discord authorize URL with code_challenge
3. Discord redirects to http://127.0.0.1:{port}/callback with ?code=xxx
4. Desktop captures code via temporary localhost server
5. Desktop POSTs { code, code_verifier, redirect_uri } to API /auth/discord
6. API exchanges code + code_verifier + client_secret with Discord for access_token
7. API calls Discord GET /users/@me to get discordId
8. API looks up DiscordAccount -> Member
9. API signs JWT { sub: memberId, did: discordId }
10. API creates RefreshToken record
11. API returns { accessToken, refreshToken, member }
```

### Anti-Patterns to Avoid

- **Desktop app holds client_secret:** NEVER. The API exchanges the code server-side with the client_secret. The desktop app uses PKCE to prove it initiated the flow.
- **API holds in-memory timer state:** The API is stateless. It writes to the DB. Timer countdown logic belongs in the desktop app. The bot has its own in-memory state for its own timers.
- **Importing discord.js in the API:** The API uses raw HTTP (fetch) to call Discord OAuth endpoints. No gateway connection. No discord.js dependency.
- **Creating a new PrismaClient in the API:** Use the singleton from `@28k/db`. The API and bot each get their own instance (separate processes) but share the same code.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT signing/verification | Custom crypto | @fastify/jwt | Handles key rotation, algorithm selection, expiry checking, request decoration |
| CORS headers | Manual `Access-Control-*` headers | @fastify/cors | Handles preflight OPTIONS, credentials, multiple origins |
| Rate limiting | IP tracking + sliding window | @fastify/rate-limit | Handles Redis/memory stores, response headers, per-route config |
| PKCE code_challenge | Custom S256 hashing | `crypto.createHash('sha256')` from Node.js | Standard crypto, but use Node.js built-in, not a library |
| Cookie signing | Manual HMAC | @fastify/cookie `signed: true` | Prevents cookie tampering |
| Input validation | Manual checks | Zod schemas | Already used project-wide, consistent error messages |
| XP award calculation | Duplicate logic | `awardXP()` from @28k/shared | Single source of truth, already battle-tested in bot |
| Timer validation (min/max durations) | Hardcoded values | `TIMER_DEFAULTS` from @28k/shared | Single source of truth |

**Key insight:** The entire API is a thin layer: Fastify plugins handle HTTP concerns, @28k/db handles persistence, @28k/shared handles business logic. The API's job is routing, authentication, and serialization.

## Common Pitfalls

### Pitfall 1: Tauri CORS Origin Complexity

**What goes wrong:** Tauri apps send different Origin headers depending on platform and build mode:
- **Development:** `http://localhost:1420` (Vite dev server)
- **macOS production:** `tauri://localhost`
- **Windows production:** `https://tauri.localhost`
- **Some configurations:** Origin may be absent or `-`

**Why it happens:** Tauri uses a custom protocol for loading the webview, and each platform handles origins differently.

**How to avoid:** Configure @fastify/cors with an array of all possible origins:
```typescript
fastify.register(cors, {
  origin: [
    'http://localhost:1420',     // Vite dev server
    'tauri://localhost',         // macOS production
    'https://tauri.localhost',   // Windows production
    'http://tauri.localhost',    // Alternate
  ],
  credentials: true,
});
```
Also: since every authenticated request requires a JWT Bearer token, the real security boundary is the JWT, not CORS origin checking. CORS prevents browser-based attacks, but the Tauri app is not a browser tab.

**Warning signs:** 403/CORS errors when the desktop app makes API calls.

### Pitfall 2: Discord OAuth PKCE -- Only S256 Supported

**What goes wrong:** Using `plain` for `code_challenge_method` returns `invalid_request` with "Unsupported code_challenge_method".

**Why it happens:** Discord only supports S256, not plain. This is documented in the API docs PR #7046 but not prominently in the main OAuth2 docs.

**How to avoid:** Always use S256:
```typescript
import { createHash, randomBytes } from 'node:crypto';

function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url'); // 43 chars, URL-safe
}

function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}
```

**Warning signs:** `invalid_request` error during token exchange.

### Pitfall 3: Refresh Token Not Rotated on Each Use

**What goes wrong:** A stolen refresh token can be used indefinitely if not rotated.

**Why it happens:** Basic implementations reuse the same refresh token until it expires.

**How to avoid:** Rotate on every use:
1. Client sends refresh token to `POST /auth/refresh`
2. API looks up RefreshToken record, verifies it exists and is not expired
3. API deletes the old RefreshToken record
4. API creates a new RefreshToken record with new random token
5. API signs a new access token
6. API returns both new access token and new refresh token

If a stolen refresh token is used after the legitimate client already used it, the lookup fails (deleted), and the theft is detected.

### Pitfall 4: Timer Session Not Enforcing One-Active-Per-Member

**What goes wrong:** Member starts a timer on the desktop app, another via the Discord bot -- two ACTIVE TimerSession records for the same member.

**Why it happens:** No unique constraint on `(memberId, status='ACTIVE')`. Prisma doesn't support partial unique indexes natively.

**How to avoid:** Application-level check before creating a TimerSession:
```typescript
const existing = await db.timerSession.findFirst({
  where: { memberId, status: 'ACTIVE' },
});
if (existing) {
  return reply.code(409).send({
    error: 'Timer already active',
    activeSession: existing,
  });
}
```
Both the API and the bot must do this check. The bot already does it in its timer engine (`getActiveTimer` returns existing timer). The API must add the same guard.

### Pitfall 5: DB Connection Pool Exhaustion with Two Processes

**What goes wrong:** Bot + API each create a PrismaClient with default pool size, exhausting PostgreSQL connections on the VPS.

**Why it happens:** Each PrismaClient via `PrismaPg` adapter creates a `pg.Pool` with default `max` connections. Two always-on processes double the connection count.

**How to avoid:** The current `packages/db/src/client.ts` creates the PrismaPg adapter without explicit pool size. Add `max: 5` for the API:
```typescript
const adapter = new PrismaPg({ connectionString, max: 5 });
```
However, since both bot and API import the same singleton from `@28k/db`, the pool size must be configurable. Use an environment variable:
```typescript
const poolSize = parseInt(process.env.DB_POOL_SIZE ?? '5', 10);
const adapter = new PrismaPg({ connectionString, max: poolSize });
```
For 10-25 users, 5 connections per process (10 total) is more than sufficient. PostgreSQL default is 100.

### Pitfall 6: Encrypted Fields Require MASTER_ENCRYPTION_KEY in API Process

**What goes wrong:** API returns encrypted gibberish instead of readable goal descriptions or reflection responses.

**Why it happens:** The API process doesn't have `MASTER_ENCRYPTION_KEY` set in its environment.

**How to avoid:** Both bot and API systemd services must share the same `.env` file (or EnvironmentFile) containing `MASTER_ENCRYPTION_KEY` and `DATABASE_URL`. The encryption extension in `@28k/db` reads `process.env.MASTER_ENCRYPTION_KEY` directly -- no code change needed, just environment configuration.

**Note for Phase 15 scope:** Most endpoints return cleartext data (timer state, goal titles, XP, rank). Encrypted fields (goal descriptions, reflection responses, check-in content) may not be needed in the API at all for the MVP dashboard. If they are, the encryption extension handles decryption transparently.

## Code Examples

### Fastify Server Entry Point

```typescript
// apps/api/src/index.ts
import Fastify from 'fastify';
import { config } from './config.js';
import prismaPlugin from './plugins/prisma.js';
import authPlugin from './plugins/auth.js';
import corsPlugin from './plugins/cors.js';
import rateLimitPlugin from './plugins/rate-limit.js';
import authRoutes from './routes/auth.js';
import timerRoutes from './routes/timer.js';
import goalsRoutes from './routes/goals.js';
import dashboardRoutes from './routes/dashboard.js';
import quoteRoutes from './routes/quote.js';
import healthRoutes from './routes/health.js';

const app = Fastify({
  logger: {
    level: config.LOG_LEVEL,
    transport: config.NODE_ENV === 'development'
      ? { target: 'pino-pretty' }
      : undefined,
  },
});

// Plugins (order matters: prisma before routes)
await app.register(corsPlugin);
await app.register(rateLimitPlugin);
await app.register(prismaPlugin);
await app.register(authPlugin);

// Routes
await app.register(authRoutes, { prefix: '/auth' });
await app.register(timerRoutes, { prefix: '/timer' });
await app.register(goalsRoutes, { prefix: '/goals' });
await app.register(dashboardRoutes, { prefix: '/dashboard' });
await app.register(quoteRoutes, { prefix: '/quote' });
await app.register(healthRoutes, { prefix: '/health' });

await app.listen({ port: config.PORT, host: '0.0.0.0' });
```

### Discord OAuth2 Token Exchange

```typescript
// apps/api/src/lib/discord-oauth.ts
const DISCORD_API = 'https://discord.com/api/v10';
const TOKEN_URL = 'https://discord.com/api/oauth2/token';

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

interface DiscordUser {
  id: string;
  username: string;
  avatar: string | null;
  global_name: string | null;
}

export async function exchangeCode(
  code: string,
  codeVerifier: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
): Promise<TokenResponse> {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
    code_verifier: codeVerifier,
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Discord token exchange failed: ${res.status} ${error}`);
  }

  return res.json() as Promise<TokenResponse>;
}

export async function getDiscordUser(accessToken: string): Promise<DiscordUser> {
  const res = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Discord user fetch failed: ${res.status}`);
  }

  return res.json() as Promise<DiscordUser>;
}
```

### Auth Route: Discord OAuth Exchange + JWT Issuance

```typescript
// apps/api/src/routes/auth.ts (key route)
fastify.post('/discord', async (request, reply) => {
  const { code, codeVerifier, redirectUri } = request.body as {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  };

  // 1. Exchange code with Discord
  const tokens = await exchangeCode(
    code, codeVerifier, redirectUri,
    config.DISCORD_CLIENT_ID, config.DISCORD_CLIENT_SECRET,
  );

  // 2. Get Discord user identity
  const discordUser = await getDiscordUser(tokens.access_token);

  // 3. Find member by Discord account
  const account = await fastify.db.discordAccount.findUnique({
    where: { discordId: discordUser.id },
    include: { member: true },
  });

  if (!account) {
    return reply.code(403).send({
      error: 'Not a 28K HQ member',
      message: 'Your Discord account is not linked to a 28K HQ membership.',
    });
  }

  // 4. Sign JWT access token (15 min)
  const accessToken = fastify.jwt.sign(
    { sub: account.memberId, did: discordUser.id },
    { expiresIn: '15m' },
  );

  // 5. Create refresh token (30 days)
  const refreshTokenValue = randomBytes(32).toString('hex');
  await fastify.db.refreshToken.create({
    data: {
      memberId: account.memberId,
      token: refreshTokenValue,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  return reply.code(200).send({
    accessToken,
    refreshToken: refreshTokenValue,
    member: {
      id: account.memberId,
      displayName: account.member.displayName,
      discordId: discordUser.id,
      avatar: discordUser.avatar,
    },
  });
});
```

### Dashboard Aggregation Endpoint

```typescript
// apps/api/src/routes/dashboard.ts
import { getRankForXP, getNextRankInfo } from '@28k/shared';

fastify.get('/', async (request, reply) => {
  const memberId = request.memberId;

  const [member, activeGoals, activeTimer, todayCheckins] = await Promise.all([
    fastify.db.member.findUnique({ where: { id: memberId } }),
    fastify.db.goal.findMany({
      where: { memberId, status: 'ACTIVE' },
      include: goalTreeInclude,
      orderBy: { deadline: 'asc' },
    }),
    fastify.db.timerSession.findFirst({
      where: { memberId, status: 'ACTIVE' },
    }),
    fastify.db.checkIn.findMany({
      where: {
        memberId,
        createdAt: { gte: startOfToday() },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  if (!member) {
    return reply.code(404).send({ error: 'Member not found' });
  }

  const rank = getRankForXP(member.totalXp);
  const nextRankInfo = getNextRankInfo(member.totalXp);

  return {
    member: {
      displayName: member.displayName,
      totalXp: member.totalXp,
      currentStreak: member.currentStreak,
      longestStreak: member.longestStreak,
      rank: rank.name,
      rankColor: rank.color,
      nextRank: nextRankInfo,
    },
    goals: activeGoals,
    timer: activeTimer,
    todayCheckins: todayCheckins.length,
    quote: getDailyQuote(), // from lib/quotes.ts
  };
});
```

### Daily Quote Rotation System

```typescript
// apps/api/src/lib/quotes.ts

// Curated pool of operator quotes -- discipline, execution, accountability
const QUOTES: Array<{ text: string; author: string }> = [
  { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { text: "Hard work beats talent when talent doesn't work hard.", author: "Tim Notke" },
  { text: "Discipline is the bridge between goals and accomplishment.", author: "Jim Rohn" },
  // ... 50-100 curated quotes
];

/**
 * Get the daily quote based on day-of-year rotation.
 * Same quote for all members on a given day. Cycles through the pool annually.
 */
export function getDailyQuote(): { text: string; author: string } {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.floor(
    (now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000)
  );
  return QUOTES[dayOfYear % QUOTES.length];
}
```

## Schema Changes Required

### New Model: RefreshToken

```prisma
model RefreshToken {
  id        String   @id @default(cuid())
  memberId  String
  token     String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())

  member Member @relation(fields: [memberId], references: [id], onDelete: Cascade)

  @@index([memberId])
  @@index([token, expiresAt])
}
```

### Modified Model: TimerSession

Add `source` and `botNotified` fields for cross-platform timer support:

```prisma
model TimerSession {
  // ... existing fields ...

  source      String  @default("BOT")     // "BOT" or "DESKTOP"
  botNotified Boolean @default(false)      // Has bot sent completion DM?
}
```

### Member Model: Add RefreshToken Relation

```prisma
model Member {
  // ... existing relations ...
  refreshTokens RefreshToken[]
}
```

## API Environment Variables

New env vars needed for the API (add to shared `.env`):

| Variable | Purpose | Example |
|----------|---------|---------|
| `JWT_SECRET` | Secret for signing JWTs | 64-char hex string |
| `DISCORD_CLIENT_ID` | OAuth2 application client ID | From Discord Developer Portal |
| `DISCORD_CLIENT_SECRET` | OAuth2 application client secret | From Discord Developer Portal |
| `API_PORT` | Port for API server | `3001` |
| `NODE_ENV` | Environment mode | `development` or `production` |
| `LOG_LEVEL` | Pino log level | `info` |

Shared with bot (already exist):
- `DATABASE_URL`
- `MASTER_ENCRYPTION_KEY`

## CORS Configuration for Tauri Desktop App

Tauri apps send different Origin headers depending on platform and build mode:

| Context | Origin |
|---------|--------|
| Vite dev server | `http://localhost:1420` |
| macOS production | `tauri://localhost` |
| Windows production | `https://tauri.localhost` |

Configure @fastify/cors to accept all three. Since every authenticated request also carries a JWT Bearer token, the real security boundary is the JWT, not CORS.

**Important:** If CORS origin issues prove unreliable across platforms, the desktop app can make API calls through Tauri's Rust HTTP client (which bypasses CORS entirely since requests originate from the native layer). This is a Phase 16 concern but worth noting for API design -- the API should validate by JWT, not origin.

## Rate Limiting Strategy

| Endpoint | Rate | Window | Reason |
|----------|------|--------|--------|
| POST /auth/discord | 5 | 1 min | Prevent OAuth brute-force |
| POST /auth/refresh | 10 | 1 min | Prevent refresh token guessing |
| All authenticated routes | 100 | 1 min | General abuse prevention |
| GET /health | 30 | 1 min | Allow monitoring but not spam |

For 10-25 users, in-memory rate limiting (default store) is sufficient. No Redis needed.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Passport.js for OAuth | Raw fetch + PKCE | 2024+ | Passport adds 500+ strategies for 1 provider. 3 fetch calls replace the framework. |
| Express + middleware chain | Fastify + plugins | 2023+ | Plugin encapsulation is cleaner than Express middleware ordering. |
| Session-based auth for desktop | Stateless JWT | Standard | Desktop apps cannot maintain server sessions. JWTs are self-contained. |
| OAuth implicit grant for SPAs | Authorization code + PKCE | RFC 7636 | Implicit grant is deprecated. PKCE is the standard for public clients. |

**Deprecated/outdated:**
- `fastify-jwt` (unscoped): Replaced by `@fastify/jwt`. Use the scoped package.
- OAuth implicit grant: Deprecated in OAuth 2.1. Use authorization code + PKCE.
- `@types/fastify-jwt`: Not needed. `@fastify/jwt` ships its own types.

## Open Questions

1. **DB Pool Size Configuration**
   - What we know: Both bot and API import `db` from `@28k/db`, which creates a singleton `PrismaPg` adapter without explicit pool size.
   - What's unclear: Whether to add `DB_POOL_SIZE` env var to `@28k/db` or configure per-app.
   - Recommendation: Add `DB_POOL_SIZE` env var support to `packages/db/src/client.ts`. Default to 5 if not set. Both bot and API can set their own values.

2. **API Subdomain vs Path**
   - What we know: Architecture doc shows `api.28khq.com -> localhost:3001`.
   - What's unclear: Whether the domain `28khq.com` is registered and DNS is configured.
   - Recommendation: Build the API to listen on a port. Domain/nginx configuration is a deployment concern, not a code concern. Test with `http://localhost:3001` in development.

3. **Quote Pool Size and Curation**
   - What we know: API-05 requires daily rotating quotes from a curated pool.
   - What's unclear: How many quotes, what tone, who curates.
   - Recommendation: Start with 30-50 curated "operator" quotes (discipline, execution, hustle culture). Store as a TypeScript constant array in `lib/quotes.ts`. Rotate by day-of-year modulo. Can be expanded later without schema changes.

4. **Timer CRUD -- Create vs Manage Active Sessions**
   - What we know: The bot's timer engine creates an ACTIVE TimerSession record on start, then updates on transitions, then deletes ACTIVE + creates COMPLETED on stop.
   - What's unclear: Should the API follow the exact same pattern (create ACTIVE, delete+create COMPLETED) or simplify (create, then update status)?
   - Recommendation: Simplify. Create TimerSession with `status: 'ACTIVE'` on start. Update fields on pause/resume. Update `status: 'COMPLETED'` and `endedAt` on stop. No delete-and-recreate. The bot's pattern exists because it creates records for restart recovery; the API writes directly to the authoritative DB record.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| API-01 | Fastify REST API server runs on VPS alongside the Discord bot | Fastify 5.8.x with TypeScript ESM, `apps/api/` in monorepo, shares VPS via different port |
| API-02 | Timer CRUD endpoints (start, pause, resume, stop, status) | POST /timer, PATCH /timer/:id, GET /timer/active -- uses @28k/db for persistence, @28k/shared for validation |
| API-03 | Goals endpoints (list hierarchy, create, update progress, complete) | GET /goals with `goalTreeInclude` pattern from bot hierarchy module, goals CRUD using shared XP engine |
| API-04 | Dashboard endpoints (priorities, streak, rank, XP, weekly goals) | GET /dashboard aggregates Member, Goals, TimerSession, CheckIn with `getRankForXP()` from @28k/shared |
| API-05 | Daily quote endpoint (rotating operator quotes from curated pool) | GET /quote with day-of-year rotation over curated constant array |
| API-06 | Shared XP award logic from packages/shared | `awardXP()` from @28k/shared called on timer stop, goal completion -- already tested in bot |
| AUTH-01 | Discord OAuth 2.0 (PKCE flow) login | PKCE with S256, API exchanges code + verifier + client_secret with Discord, returns JWT |
| AUTH-02 | OAuth maps Discord account to existing Member record | Lookup DiscordAccount by discordId from Discord `/users/@me` response, find linked Member |
| AUTH-03 | JWT access tokens (15 min) + refresh tokens (30 days) | @fastify/jwt signs access tokens, RefreshToken model in DB for refresh tokens, rotation on use |
</phase_requirements>

## Sources

### Primary (HIGH confidence)
- [Fastify v5 official docs -- TypeScript reference](https://fastify.dev/docs/latest/Reference/TypeScript/) -- Plugin typing, route generics, decorator patterns
- [Fastify v5 encapsulation docs](https://fastify.dev/docs/v5.3.x/Reference/Encapsulation/) -- Plugin scoping
- [@fastify/jwt GitHub](https://github.com/fastify/fastify-jwt) -- v9+ for Fastify 5, sign/verify API, cookie support
- [@fastify/cors npm](https://www.npmjs.com/package/@fastify/cors) -- v11.x, origin array/function configuration
- [@fastify/rate-limit npm](https://www.npmjs.com/package/@fastify/rate-limit) -- v10.3.0, Fastify 5 compatible
- [Discord OAuth2 documentation](https://docs.discord.com/developers/topics/oauth2) -- Authorization code flow, token endpoints, scopes
- [Discord OAuth2 PKCE PR #7046](https://github.com/discord/discord-api-docs/pull/7046) -- S256 only, code_verifier 43+ chars, custom scheme support with PKCE
- [Discord OAuth2 PKCE Issue #4002](https://github.com/discord/discord-api-docs/issues/4002) -- POST required for token endpoint, form-urlencoded body
- Phase 14 summaries (14-01-SUMMARY.md, 14-02-SUMMARY.md) -- Monorepo structure, @28k/db and @28k/shared exports verified
- Codebase review: packages/db/src/client.ts, packages/shared/src/xp-engine.ts, apps/bot/src/modules/timer/ -- Current implementation patterns

### Secondary (MEDIUM confidence)
- [Tauri CORS Discussion #6898](https://github.com/tauri-apps/tauri/discussions/6898) -- Origin behavior varies by platform
- [Tauri v2 HTTP Headers docs](https://v2.tauri.app/security/http-headers/) -- Production header injection
- [STACK.md research](/.planning/research/STACK.md) -- Fastify 5.8.2 version, Discord OAuth flow design
- [ARCHITECTURE.md research](/.planning/research/ARCHITECTURE.md) -- Route inventory, component boundaries, timer flow
- [PITFALLS.md research](/.planning/research/PITFALLS.md) -- OAuth redirect URI pitfalls, connection pool exhaustion

### Tertiary (LOW confidence)
- Tauri Origin behavior across platforms -- conflicting reports between `tauri://localhost`, `https://tauri.localhost`, and absent origins. Needs empirical testing in Phase 16.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all packages verified via npm registry, versions confirmed compatible with Fastify 5
- Architecture: HIGH -- patterns derived from existing bot codebase + official Fastify docs + prior research documents
- Authentication flow: HIGH -- Discord OAuth2 endpoints verified, PKCE behavior confirmed via GitHub issues/PRs
- Pitfalls: HIGH -- informed by prior PITFALLS.md research + codebase review of timer/encryption modules
- CORS for Tauri: MEDIUM -- platform-specific origin behavior has conflicting reports, needs empirical validation

**Research date:** 2026-03-21
**Valid until:** 2026-04-21 (stable domain, no fast-moving dependencies)
