# Stack Research: v2.0 Desktop Companion App

**Domain:** Desktop companion app (Tauri v2 + React) with REST API (Fastify) for existing Discord productivity platform
**Researched:** 2026-03-21
**Confidence:** HIGH (versions verified via npm registry search, official docs consulted, integration with existing Prisma 7 / TypeScript / ESM stack validated)

**Scope:** This document covers ONLY new dependencies and patterns needed for the v2.0 milestone: Tauri desktop app, Fastify REST API, monorepo restructure (Turborepo + pnpm), and Discord OAuth2 integration. The validated v1.0/v1.1 bot stack (discord.js 14.25.x, Prisma 7.5.x, OpenRouter, chrono-node, @napi-rs/canvas, node-cron 4.x, date-fns 4.x, zod 4.x, winston 3.x, PM2) is not re-evaluated.

---

## Recommended Stack

### Monorepo Tooling

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| pnpm | 10.x (stable: 10.32.1) | Package manager + workspace management | Symlink-based node_modules is the most disk-efficient approach. Native workspace protocol (`workspace:*`) enables cross-package references. Already the standard for Turborepo monorepos. Use v10 stable -- v11 is alpha. |
| Turborepo | 2.x (stable: 2.8.20) | Build orchestration + task caching | Handles dependency-aware task ordering (`db:generate` before `build`), local caching (skip rebuilds when nothing changed), and parallel execution. Simpler config than Nx -- a single `turbo.json` file. No remote cache needed at this scale. |

**Why Turborepo over Nx:** Turborepo is configuration-minimal. A single `turbo.json` defines pipeline dependencies. Nx has more features (generators, affected detection, module federation) that are overkill for a 4-workspace monorepo with 1 developer. Turborepo's learning curve is 30 minutes; Nx's is a day.

**Why pnpm over npm/yarn:** npm hoists everything flat -- dependency collisions are common in monorepos. Yarn v4 works but adds `.yarnrc.yml`, PnP complexity, and a bundled binary. pnpm's strict symlink structure prevents phantom dependencies by default, and `pnpm-workspace.yaml` is 3 lines.

**Workspace structure:**
```
28k-hq/
  apps/
    bot/          # Existing Discord bot (moved from root)
    desktop/      # Tauri + React desktop app
    api/          # Fastify REST API server
  packages/
    db/           # Prisma schema, client, migrations (shared)
    shared/       # TypeScript types, constants, utils shared across apps
  turbo.json
  pnpm-workspace.yaml
  package.json    # Root -- workspaces config, shared dev deps
```

**pnpm-workspace.yaml:**
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

**Prisma in monorepo:** Prisma officially documents a pnpm workspaces pattern where the schema, migrations, and generated client live in `packages/db`. Both `apps/bot` and `apps/api` depend on `@28k/db` via `workspace:*`. The `db:generate` script must run before any app build -- Turborepo's `dependsOn` handles this ordering automatically.

---

### Desktop App -- Tauri v2

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| @tauri-apps/cli | 2.10.x | Tauri CLI for dev/build/bundle | Core build tool for Tauri apps. Handles Rust compilation, app bundling, code signing. |
| @tauri-apps/api | 2.10.x | JavaScript API for Tauri features | Typed API for invoking Rust commands, accessing system features, managing windows from the React frontend. |
| Rust (stable) | latest via rustup | Tauri backend runtime | Required by Tauri. Install via `rustup` -- it manages versions automatically. macOS needs Xcode CLT; Windows needs MSVC build tools. |

**Why Tauri over Electron:** Tauri produces 5-10MB binaries vs Electron's 150MB+. Tauri uses the OS webview (WebKit on macOS, WebView2 on Windows) instead of bundling Chromium. For a menu bar utility app that runs all day, the memory footprint difference is dramatic: ~30MB (Tauri) vs ~150MB+ (Electron). The Rust backend also means system tray, autostart, and notifications are native -- not JavaScript polyfills.

#### Tauri v2 Plugins (Official)

| Plugin | npm Package | Version | Purpose | Why Needed |
|--------|-------------|---------|---------|------------|
| System Tray | Built into `@tauri-apps/api` (tray module) | 2.10.x | Gold ouroboros icon in macOS menu bar, tray menu | Core feature -- the app lives in the menu bar, not as a regular window. Tray API supports custom icons, click handlers, and context menus. |
| Notifications | `@tauri-apps/plugin-notification` | 2.x | Timer transition alerts, session reminders | Native OS notifications for timer state changes (work->break, break->work, session complete). More reliable than web Notification API. |
| Autostart | `@tauri-apps/plugin-autostart` | 2.x | Launch at login | Companion app should start with the OS. One-line config in Rust, toggle from UI settings. |
| Updater | `@tauri-apps/plugin-updater` | 2.x | In-app auto-updates | Ship fixes without asking users to re-download. Checks a JSON endpoint for new versions, downloads delta updates. Can use GitHub Releases as the update server. |
| Store | `@tauri-apps/plugin-store` | 2.x | Persistent local key-value storage | Cache user preferences, last window position, theme settings. Survives app restarts. Simpler than SQLite for settings. |
| Deep Link | `@tauri-apps/plugin-deep-link` | 2.x | Custom URL scheme for OAuth callback | Enables `28khq://oauth/callback` deep link for Discord OAuth redirect. Required for the authentication flow. |

**What NOT to add:** Tauri has 20+ plugins (barcode scanner, biometric, clipboard, dialog, etc.). Only install the 5 above. The app is a menu bar timer/dashboard, not a feature-rich IDE. Each plugin adds Rust compile time.

---

### Desktop Frontend -- React + Tailwind

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| React | 19.x (stable: 19.2.x) | UI framework | Already the ecosystem standard. React 19's `useActionState` and improved transitions work well for the timer state machine UI. The team (single dev) already knows React. |
| React Router | 7.x (stable: 7.13.x) | Client-side routing | Lightweight routing for dashboard/timer/goals/settings views. v7 simplified the API -- single `react-router` package, no separate `react-router-dom`. |
| Tailwind CSS | 4.x | Utility-first CSS | v4 has zero-config setup with the Vite plugin (`@tailwindcss/vite`). No `tailwind.config.js` needed -- use CSS `@theme` directive for the gold accent brand tokens. 5x faster builds than v3. |
| Zustand | 5.x (stable: 5.0.12) | Client-side state management | Lightweight store for timer state, user session, cached goals. No providers/context needed -- just `create(set => ...)`. 20M+ weekly downloads, 3KB gzipped. Perfect for a small app with 3-4 stores (timer, auth, goals, settings). |
| Vite | 6.x or 7.x | Build tool / dev server | Tauri's official frontend build tool recommendation. Vite 8 just shipped (4 days ago) with Rolldown -- too fresh for production use with Tauri. Pin to Vite 6.x or 7.x which are battle-tested with Tauri v2. |

**Why Zustand over Redux/Jotai/Signals:** Redux is massive boilerplate for 3-4 stores. Jotai is atom-based (good for fine-grained reactivity, unnecessary here). Zustand is the sweet spot: minimal API, TypeScript-first, works outside React components (important for Tauri event handlers that need to update state). One file per store, zero providers.

**Why NOT Next.js / Remix:** Tauri wraps a local web view. There is no server. SSR, SSG, and server components are meaningless in a desktop app. Use Vite + React directly -- it produces a static SPA that Tauri bundles.

**Why Vite 6/7 not 8:** Vite 8 shipped March 17, 2026 -- 4 days ago. It replaces esbuild+Rollup with Rolldown+Oxc. Major internal change. Tauri's integration with Vite is well-tested on v6/v7. Wait for the ecosystem (Tailwind v4 Vite plugin, Tauri CLI) to confirm Vite 8 compatibility before upgrading. The risk of a day debugging Vite 8 edge cases is not worth the marginal build speed improvement for a small app.

---

### REST API -- Fastify

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Fastify | 5.x (stable: 5.8.2) | HTTP API framework | Fastest Node.js framework (78K req/s vs Express's 15K). Schema-based validation with built-in JSON schema support. First-class TypeScript support. Plugin architecture matches the bot's module pattern. |
| @fastify/cors | 11.x | CORS handling | Allow requests from the Tauri app's `tauri://localhost` and `https://tauri.localhost` origins. Simple plugin registration. |
| @fastify/jwt | latest | JWT token management | Sign and verify JWT access tokens for the Discord OAuth flow. Decorates `request.user` with the verified payload. Handles token expiry automatically. |
| @fastify/cookie | 11.x | Cookie parsing | Handle refresh tokens via httpOnly cookies (secure token rotation). Signed cookies prevent tampering. |

**Why Fastify over Express:** Express v5 is finally stable but still callback-oriented and slow. Fastify is async-first, has built-in schema validation (replaces `express-validator`), built-in JSON serialization (2x faster than `JSON.stringify`), and a plugin system that enforces encapsulation. The TypeScript experience is substantially better -- route schemas are typed end-to-end.

**Why Fastify over tRPC:** The PROJECT.md already calls this out -- REST works with any client language. If a future iOS app or web dashboard is built, they can hit the same REST endpoints without a TypeScript client. tRPC locks every consumer to TypeScript. For a single-dev project, this flexibility matters more than tRPC's type inference convenience.

**Why NOT Hono:** Hono is excellent for edge/serverless but runs on VPS here. Fastify's plugin ecosystem (JWT, CORS, rate-limit, swagger) is more mature for traditional server deployments. Hono's middleware ecosystem is thinner for auth patterns.

---

### Authentication -- Discord OAuth2

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Discord OAuth2 (native) | API v10 | User authentication | No library needed. Discord OAuth2 is a standard authorization code flow with 3 HTTP requests. Adding a library for 3 fetch calls is overengineering. |

**Flow (Authorization Code + PKCE):**

1. Desktop app opens Discord OAuth URL in system browser with PKCE `code_verifier` + `code_challenge`
2. User authorizes; Discord redirects to intermediate page hosted on the API (e.g., `api.28khq.com/auth/callback`)
3. Intermediate page redirects to deep link: `28khq://oauth/callback?code=xxx`
4. Tauri deep link plugin catches the redirect, sends code to API
5. API exchanges code + `code_verifier` for access token with Discord
6. API verifies user is a member of the 28K HQ guild via `GET /users/@me/guilds`
7. API issues its own JWT (short-lived access + long-lived refresh) tied to the existing `Member` record
8. Desktop app stores tokens via `@tauri-apps/plugin-store`

**Scopes needed:** `identify` (get user info) + `guilds` (verify guild membership). No `bot` scope -- the bot already has its own token.

**Why PKCE:** Desktop apps cannot securely store a client secret. PKCE eliminates the need for one -- the code verifier/challenge pair prevents authorization code interception. Discord supports PKCE natively with the `PUBLIC_OAUTH2_CLIENT` application flag.

**Why an intermediate redirect page:** Discord does not allow custom URL schemes (`28khq://`) as redirect URIs directly. The API hosts a lightweight HTML page at `/auth/callback` that receives the code via query params, then redirects to the deep link. This also provides a "Click to open app" fallback button if the deep link fails.

**Why NOT Passport.js / next-auth / better-auth:** These are designed for web apps with sessions. The desktop app uses stateless JWTs. The entire OAuth flow is: (1) redirect to Discord, (2) exchange code for token, (3) issue JWT. That is 50 lines of Fastify route handlers, not a framework.

---

### Shared Packages

| Package | Contents | Consumers |
|---------|----------|-----------|
| `@28k/db` | Prisma schema, `prisma.config.ts`, generated client, seed scripts, migrations | `apps/bot`, `apps/api` |
| `@28k/shared` | TypeScript types (Member, Goal, Timer, etc.), constants (XP values, rank thresholds), utility functions (encryption helpers, date formatting) | `apps/bot`, `apps/api`, `apps/desktop` |

**@28k/db package.json:**
```json
{
  "name": "@28k/db",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./client": "./src/client.ts"
  },
  "scripts": {
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:push": "prisma db push",
    "db:deploy": "prisma migrate deploy"
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

**@28k/shared:** This package contains ONLY types and pure functions. No runtime dependencies. The desktop app imports types from here but never imports Prisma or database code directly -- the API is the data layer boundary.

---

## Installation

### System Prerequisites

```bash
# Rust (required for Tauri)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# pnpm (if not already installed)
corepack enable && corepack prepare pnpm@latest --activate

# macOS: Xcode Command Line Tools (for Tauri Rust compilation)
xcode-select --install
```

### Root package.json

```bash
# Initialize monorepo root
pnpm init

# Core build tooling (root devDependencies)
pnpm add -Dw turbo typescript
```

### apps/api (Fastify REST API)

```bash
# Core
pnpm add fastify @fastify/cors @fastify/jwt @fastify/cookie zod

# Dev
pnpm add -D @types/node tsx typescript

# Workspace dependency
# In apps/api/package.json: "@28k/db": "workspace:*", "@28k/shared": "workspace:*"
```

### apps/desktop (Tauri + React)

```bash
# Tauri CLI (dev tool)
pnpm add -D @tauri-apps/cli

# Tauri API + plugins
pnpm add @tauri-apps/api @tauri-apps/plugin-notification @tauri-apps/plugin-autostart @tauri-apps/plugin-updater @tauri-apps/plugin-store @tauri-apps/plugin-deep-link

# React + routing
pnpm add react react-dom react-router

# Styling
pnpm add -D @tailwindcss/vite tailwindcss

# State management
pnpm add zustand

# Build tooling
pnpm add -D vite @vitejs/plugin-react typescript @types/react @types/react-dom

# Workspace dependency
# In apps/desktop/package.json: "@28k/shared": "workspace:*"
# NOTE: Desktop does NOT depend on @28k/db -- it talks to the API, not the database
```

### apps/bot (existing bot, moved)

```bash
# No new dependencies. Existing package.json moves to apps/bot/
# Add workspace dependency:
# "@28k/db": "workspace:*", "@28k/shared": "workspace:*"
# Remove prisma/pg from bot's own dependencies (now in @28k/db)
```

---

## turbo.json Configuration

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "db:generate": {
      "cache": false
    },
    "build": {
      "dependsOn": ["^db:generate", "^build"],
      "outputs": ["dist/**", "src-tauri/target/**"]
    },
    "dev": {
      "dependsOn": ["^db:generate"],
      "cache": false,
      "persistent": true
    },
    "lint": {},
    "test": {
      "dependsOn": ["^db:generate"]
    }
  }
}
```

**Key detail:** The `^db:generate` dependency ensures that any app depending on `@28k/db` will have the Prisma client generated before build or dev. This prevents the common monorepo pitfall of "PrismaClient not generated" errors.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Desktop framework | Tauri v2 | Electron | 150MB+ bundle, 150MB+ RAM usage, ships entire Chromium. The app is a menu bar utility -- Tauri's 5-10MB binary and ~30MB RAM is the right tool. |
| Desktop framework | Tauri v2 | Neutralino.js | Smaller community, fewer plugins, no system tray plugin equivalent, limited update mechanism. Tauri's plugin ecosystem for tray/notifications/autostart/updater is mature. |
| API framework | Fastify 5.x | Express 5.x | Slower (5x fewer req/s), no built-in schema validation, callback-oriented DX. Express is legacy at this point. |
| API framework | Fastify 5.x | Hono | Hono excels at edge/serverless. For a VPS deployment with JWT auth, CORS, and structured plugins, Fastify's ecosystem is more complete. |
| API framework | Fastify 5.x | tRPC | Locks all consumers to TypeScript. REST API enables future iOS/web clients without a TS dependency. At 10-25 members, tRPC's type inference savings are minimal vs Zod-validated REST routes. |
| Package manager | pnpm 10.x | npm 10.x | npm hoists dependencies flat -- phantom dependency bugs are common in monorepos. pnpm's strict node_modules structure prevents this by default. |
| Package manager | pnpm 10.x | Yarn 4.x | Yarn PnP adds complexity (.yarnrc.yml, special IDE plugins). Yarn classic is deprecated. pnpm is simpler and faster. |
| Build orchestrator | Turborepo 2.x | Nx | Nx has generators, affected detection, and module federation -- features for 50+ developer teams. For 1 developer with 4 workspaces, Turborepo's single `turbo.json` is all that's needed. |
| Build orchestrator | Turborepo 2.x | Lerna | Lerna is for publishing npm packages. This is a private monorepo. Lerna adds no value here. |
| State management | Zustand 5.x | Redux Toolkit | Redux adds boilerplate (slices, reducers, actions, selectors) for 3-4 small stores. Zustand is one function call per store. |
| State management | Zustand 5.x | Jotai | Jotai's atom model is better for fine-grained reactivity with many independent pieces of state. The desktop app has a few coarse stores (timer, auth, goals). Zustand's store model is a better fit. |
| State management | Zustand 5.x | React Context | Context re-renders all consumers on any change. The timer store updates every second -- Context would cause the entire app to re-render every second. Zustand's selector-based subscriptions prevent this. |
| CSS framework | Tailwind CSS 4.x | CSS Modules | Tailwind's utility classes are faster to write for a small team. The app has a simple design system (dark theme + gold accents). No component library needed. |
| CSS framework | Tailwind CSS 4.x | shadcn/ui | shadcn/ui is excellent for complex web apps with forms, dialogs, tables. The desktop app UI is primarily a timer display, a goals tree, and a dashboard card layout. Custom Tailwind components are simpler than importing a component library. |
| Auth | Native OAuth2 + JWT | Passport.js | Passport is middleware for Express with 500+ strategies. The app has one auth strategy (Discord OAuth2). Three fetch calls replace an entire framework. |
| Auth | Native OAuth2 + JWT | better-auth | Designed for web apps with session management. Desktop apps use stateless JWTs. Different paradigm. |
| Build tool | Vite 6/7 | Vite 8 | Vite 8 shipped 4 days ago with Rolldown replacing esbuild+Rollup. Major internal change. Wait for Tauri v2 + Tailwind v4 ecosystem to confirm compatibility. Zero benefit for a small app. |
| Routing | React Router 7.x | TanStack Router | TanStack Router has better type safety but heavier API. The desktop app has 4 routes (dashboard, timer, goals, settings). React Router 7's simplified API is sufficient and more familiar. |

---

## What NOT to Add for v2.0

| Avoid | Why | Do Instead |
|-------|-----|------------|
| Electron | 150MB+ binary, ships Chromium. Wrong tool for a menu bar utility. | Tauri v2 |
| tRPC | Locks future clients to TypeScript. REST is universally consumable. | Fastify + Zod schemas |
| Passport.js / next-auth / better-auth | Overengineered for a single OAuth2 provider. Session-based auth frameworks for a stateless JWT flow. | 3 fetch calls + @fastify/jwt |
| shadcn/ui / Radix UI | Component library for a simple UI. Adds 20+ dependencies for buttons and dialogs. The app is a timer, a tree view, and a dashboard. | Custom Tailwind components |
| Redux / MobX | Heavy state management for 3-4 small stores. | Zustand |
| Prisma in desktop app | The desktop app must NOT access the database directly. All data flows through the API. | Fetch from Fastify API |
| React Query / TanStack Query | Adds caching, refetching, and deduplication abstractions. The app makes ~5 API calls total (auth, goals, timer sync, dashboard data). A simple `fetch` wrapper with Zustand is cleaner. | `fetch()` + Zustand stores |
| Socket.io / WebSockets | Real-time sync between bot and desktop sounds cool but adds massive complexity. Timer data syncs via API polling on a 30s interval or on user action. | Periodic REST polling + event-driven sync on user actions |
| Tailwind v3 | v4 has zero-config Vite plugin, no tailwind.config.js, 5x faster. No reason to use v3. | Tailwind v4 |
| Vite 8 | Released 4 days ago. Untested with Tauri v2 + Tailwind v4. | Vite 6.x or 7.x |
| Docker for desktop app | Tauri builds native binaries. Docker is for the API server deployment, not the desktop app. | Tauri bundler for .dmg (macOS) / .msi (Windows) |
| Remote Turborepo cache (Vercel) | Adds cloud dependency for 1 developer. Local cache is sufficient. | Local Turborepo cache (default) |
| Rust for custom Tauri commands (initially) | The timer, goals, and dashboard are all API-driven. No need for custom Rust commands until performance profiling shows a bottleneck. | JavaScript API + Tauri plugins |

---

## Version Compatibility Matrix

| New Package | Compatible With | Notes |
|-------------|-----------------|-------|
| Tauri CLI 2.10.x | Rust stable (latest via rustup) | Rust is managed by rustup, always latest stable. macOS needs Xcode CLT. |
| Tauri API 2.10.x | Vite 6.x/7.x, React 19.x | Official Vite integration docs cover setup. Vite 8 untested. |
| React 19.2.x | TypeScript 5.9.x, Vite 6.x/7.x | Full compatibility. React 19 types ship with `@types/react`. |
| Tailwind CSS 4.x | Vite 6.x/7.x via `@tailwindcss/vite` | First-party Vite plugin. Zero config needed. |
| Fastify 5.8.x | Node.js >= 20, TypeScript 5.x | Targets ES2023. Compatible with existing Node 22.x. |
| @fastify/jwt latest | Fastify 5.x | Official Fastify plugin, always compatible with latest major. |
| @fastify/cors 11.x | Fastify 5.x | Official plugin. |
| @fastify/cookie 11.x | Fastify 5.x | Official plugin. |
| Zustand 5.0.x | React 18+ (supports 19) | No providers needed. Works with React 19 out of the box. |
| React Router 7.13.x | React 18+ (supports 19) | Single package import. |
| Turborepo 2.8.x | pnpm 9+/10+ | Official pnpm workspace support. |
| pnpm 10.x | Node.js >= 18 | Well within our Node 22.x. |
| Prisma 7.5.x (existing) | pnpm workspaces | Official guide for pnpm workspace setup. Schema + client in `packages/db`. |

---

## Cost Impact of v2.0

| Item | Change | Estimate |
|------|--------|----------|
| Tauri desktop app | Bundled into binary, runs locally | $0 |
| Fastify API server | Runs on same VPS as the bot | $0 incremental (shares existing VPS) |
| Discord OAuth2 | Free API calls | $0 |
| Tauri updater | GitHub Releases as update server | $0 (within GitHub free tier) |
| pnpm + Turborepo | Local tooling | $0 |
| **v2.0 net increase** | | **$0** (no new external service costs) |

The API and bot share the same PostgreSQL database and VPS. The desktop app runs on user machines. No new cloud services are needed.

---

## Migration Path: Monorepo Restructure

The existing flat project (`/` with `src/`, `prisma/`, `package.json`) must be restructured into workspaces. This is a file-move operation, not a rewrite.

**Steps:**
1. Initialize pnpm workspace root with `pnpm-workspace.yaml`
2. Move `src/` and bot-specific `package.json` entries to `apps/bot/`
3. Move `prisma/` to `packages/db/`
4. Extract shared types/constants to `packages/shared/`
5. Create `apps/api/` (new Fastify server)
6. Create `apps/desktop/` (new Tauri app via `pnpm create tauri-app`)
7. Update imports in `apps/bot/` to use `@28k/db` and `@28k/shared`
8. Add `turbo.json` for build orchestration
9. Verify `pnpm dev --filter bot` still works identically

**Risk:** The main risk is import path breakage during the move. TypeScript's `paths` or `exports` in each package.json will catch errors at compile time. Run `tsc --noEmit` after each step.

---

## Sources

- [Tauri v2 official documentation](https://v2.tauri.app/) -- Plugin list, system tray API, prerequisites, deep linking guide. HIGH confidence.
- [@tauri-apps/cli on npm](https://www.npmjs.com/package/@tauri-apps/cli) -- Version 2.10.1 verified. HIGH confidence.
- [@tauri-apps/api on npm](https://www.npmjs.com/package/@tauri-apps/api) -- Version 2.10.1 verified. HIGH confidence.
- [@tauri-apps/plugin-notification on npm](https://www.npmjs.com/package/@tauri-apps/plugin-notification) -- Version 2.3.3 verified. HIGH confidence.
- [@tauri-apps/plugin-autostart on npm](https://www.npmjs.com/package/@tauri-apps/plugin-autostart) -- Version 2.5.1 verified. HIGH confidence.
- [@tauri-apps/plugin-updater on npm](https://www.npmjs.com/package/@tauri-apps/plugin-updater) -- Version 2.10.0 verified. HIGH confidence.
- [@tauri-apps/plugin-store on npm](https://www.npmjs.com/package/@tauri-apps/plugin-store) -- Persistent key-value store. HIGH confidence.
- [@tauri-apps/plugin-deep-link on npm](https://www.npmjs.com/package/@tauri-apps/plugin-deep-link) -- Custom URL scheme for OAuth. HIGH confidence.
- [Tauri v2 System Tray documentation](https://v2.tauri.app/learn/system-tray/) -- Tray icon API, menu integration, macOS support. HIGH confidence.
- [Tauri v2 Deep Linking documentation](https://v2.tauri.app/plugin/deep-linking/) -- Custom scheme registration, OAuth callback pattern. HIGH confidence.
- [Fastify on npm](https://www.npmjs.com/package/fastify) -- Version 5.8.2 verified. HIGH confidence.
- [Fastify TypeScript guide](https://fastify.dev/docs/latest/Reference/TypeScript/) -- ESM + TypeScript setup, fastify-tsconfig. HIGH confidence.
- [@fastify/cors on npm](https://www.npmjs.com/package/@fastify/cors) -- Version 11.2.0 verified. HIGH confidence.
- [@fastify/jwt on npm](https://www.npmjs.com/package/@fastify/jwt) -- Latest version active. HIGH confidence.
- [@fastify/cookie on npm](https://www.npmjs.com/package/@fastify/cookie) -- Version 11.0.2 verified. HIGH confidence.
- [Turborepo on npm](https://www.npmjs.com/package/turbo) -- Version 2.8.20 verified. HIGH confidence.
- [Turborepo repository structure guide](https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository) -- apps/ + packages/ pattern. HIGH confidence.
- [pnpm on npm](https://www.npmjs.com/package/pnpm) -- Version 10.32.1 stable verified. HIGH confidence.
- [pnpm workspaces documentation](https://pnpm.io/workspaces) -- Workspace protocol, configuration. HIGH confidence.
- [Prisma pnpm workspaces guide](https://www.prisma.io/docs/guides/use-prisma-in-pnpm-workspaces) -- Shared client generation across workspaces. HIGH confidence.
- [Prisma Turborepo guide](https://www.prisma.io/docs/guides/turborepo) -- Task ordering with `dependsOn`. HIGH confidence.
- [React v19.2 announcement](https://react.dev/blog/2025/10/01/react-19-2) -- Version 19.2.x stable. HIGH confidence.
- [React Router on npm](https://www.npmjs.com/package/react-router) -- Version 7.13.1 verified. HIGH confidence.
- [Tailwind CSS v4 announcement](https://tailwindcss.com/blog/tailwindcss-v4) -- Vite plugin, zero-config setup. HIGH confidence.
- [Zustand on npm](https://www.npmjs.com/package/zustand) -- Version 5.0.12 verified. 20M+ weekly downloads. HIGH confidence.
- [Vite releases page](https://vite.dev/releases) -- Vite 8.0 shipped March 17 2026. HIGH confidence.
- [Discord OAuth2 documentation](https://discord.com/developers/docs/topics/oauth2) -- PKCE flow, scopes, token exchange. HIGH confidence.
- [Discord OAuth2 PKCE issue #4002](https://github.com/discord/discord-api-docs/issues/4002) -- PKCE implementation details and caveats. MEDIUM confidence.

---
*Stack research for: 28K HQ v2.0 Desktop Companion App*
*Researched: 2026-03-21*
