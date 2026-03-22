# Domain Pitfalls: v2.0 Desktop Companion App

**Domain:** Adding Tauri v2 desktop app, Fastify REST API, and Turborepo monorepo restructure to existing 23K LOC Discord bot with Prisma 7 / PostgreSQL
**Researched:** 2026-03-21
**Confidence:** HIGH (verified against Tauri v2 docs, Prisma official guides, GitHub issue trackers, and community post-mortems)

## Critical Pitfalls

Mistakes that cause rewrites, data loss, or week-long debugging sessions.

---

### Pitfall 1: Monorepo Migration Breaks the Working Bot

**What goes wrong:**
The existing project is a single-app Node.js repo with a flat `package.json`, `src/` directory, and `prisma/` at root. Restructuring to `apps/bot`, `apps/api`, `apps/desktop`, `packages/db`, `packages/shared` requires moving every file, updating every import path, reconfiguring TypeScript, and switching from npm to pnpm -- all at once. A half-migrated state where the bot can't start means the live Discord server goes dark. The current `package.json` has 12 dependencies and 8 devDependencies with npm lockfile. pnpm's strict node_modules structure will immediately surface phantom dependencies the project may be silently relying on (packages importable because npm hoisted them, not because they're declared).

**Why it happens:**
"It's just moving files" underestimates the scope. Every `import` path changes. The `tsconfig.json` needs `rootDir`, `outDir`, and path mapping changes. The `prisma.config.ts` uses `import.meta.dirname` for path resolution -- this breaks when the file moves to `packages/db/`. PM2's `ecosystem.config.cjs` points to `dist/index.js` -- the build output path changes. The `.env` loading assumes root-level `.env` file -- Turborepo recommends per-package `.env` files. The `deploy-commands.ts` script that registers Discord slash commands needs its own build step or to be co-located with the bot app.

**Consequences:**
- Bot goes offline during migration if done on the same branch/deploy
- Import errors cascade: moving `src/shared/` to `packages/shared/` breaks every module that imports from it
- pnpm `--frozen-lockfile` fails in CI because `pnpm-lock.yaml` doesn't exist yet
- `prisma generate` fails because `prisma.config.ts` can't find the schema at its old path
- PM2 can't find the entry point because `dist/index.js` moved to `apps/bot/dist/index.js`

**Prevention:**
1. Do the migration in a single dedicated phase BEFORE adding any new code. No new features in the same PR.
2. Use `pnpm import` to generate `pnpm-lock.yaml` from the existing `package-lock.json` -- don't start from scratch.
3. Create `pnpm-workspace.yaml` first, then move directories one at a time: `packages/db` first (schema + client), then `packages/shared`, then `apps/bot`, then add `apps/api` and `apps/desktop` as empty scaffolds.
4. Update `ecosystem.config.cjs` and deploy scripts immediately after moving `apps/bot`.
5. Test that `pnpm run dev` starts the bot and connects to Discord BEFORE moving to the next step.
6. Keep the `.env` file at root AND symlink/copy to `packages/db/.env` during migration. Consolidate later.

**Detection:**
- Bot doesn't start after file moves
- `Module not found` errors referencing old paths
- `prisma generate` or `prisma migrate` fails with path errors

**Phase to address:**
Phase 1 (Monorepo Restructure). This must be the FIRST thing done. Everything else depends on it.

---

### Pitfall 2: Prisma 7 + pnpm Monorepo TypeScript Resolution Failure

**What goes wrong:**
Prisma 7.x has a known, open bug ([prisma/prisma#28581](https://github.com/prisma/prisma/issues/28581)) where the generated Prisma Client produces TypeScript TS2742 errors in pnpm monorepos. The error looks like: `The inferred type of 'DbNull' cannot be named without a reference to '.pnpm/@prisma+client-runtime-utils@7.x.x/...'`. This happens because Prisma 7's generated code references `@prisma/client-runtime-utils` which TypeScript can't resolve through pnpm's symlink structure. The project is on Prisma 7.5.0 -- directly affected.

**Why it happens:**
Prisma 7 restructured its generated client to depend on `@prisma/client-runtime-utils` as a separate package. pnpm's strict, non-hoisted `node_modules` structure means this transitive dependency isn't directly accessible where TypeScript expects it. npm's flat hoisting hid this issue, which is why the current single-app setup works fine.

**Consequences:**
- `tsc` fails across the entire monorepo after migration to pnpm
- `apps/bot`, `apps/api`, and any package importing from `@repo/db` all get the same TS2742 error
- Build pipeline completely blocked

**Prevention:**
1. Explicitly install `@prisma/client-runtime-utils` as a dependency in `packages/db/package.json`: `pnpm add @prisma/client-runtime-utils --filter @repo/db`
2. If that doesn't resolve it, add to `.npmrc` at root: `public-hoist-pattern[]=@prisma/*` to hoist Prisma packages (targeted, not blanket hoisting)
3. Set `"declaration": false` in `packages/db/tsconfig.json` if generating declarations triggers the bug (only use this if the package exports the client instance, not raw types)
4. Monitor the GitHub issue for an upstream fix in Prisma 7.6+
5. Test `tsc --noEmit` across all workspaces immediately after setting up `packages/db`

**Detection:**
- TS2742 errors mentioning `@prisma/client-runtime-utils` in any `tsc` build
- CI passes locally (npm/hoisted) but fails in CI (pnpm strict)

**Phase to address:**
Phase 1 (Monorepo Restructure). Must be validated immediately after moving Prisma to `packages/db`.

---

### Pitfall 3: Timer Countdown in Menu Bar -- macOS-Only Feature Treated as Cross-Platform

**What goes wrong:**
The PRD specifies "menu bar countdown" for the productivity timer. Tauri's `TrayIcon.set_title()` API displays text next to the tray icon in the macOS menu bar -- perfect for showing "23:45" counting down. But `set_title()` is **macOS-only**. Windows has no equivalent: the system tray shows icons and tooltips, not arbitrary text. Linux shows the title only if an icon is also present, and explicitly warns it "can take up a significant amount of space on the user's panel." Building a "menu bar countdown" feature assuming cross-platform parity will result in a Mac-only feature that silently does nothing on Windows.

**Why it happens:**
The macOS menu bar is architecturally different from the Windows system tray. macOS menu bar items can display text + icon natively. Windows system tray only supports icon + tooltip (hover text). Tauri correctly exposes what the OS supports, but the abstraction doesn't paper over this difference.

**Consequences:**
- Windows users see a static tray icon with no countdown -- the headline feature is missing
- Tooltip updates on Windows are limited to hover-only text, not persistent display
- Design and UX assumptions made for macOS don't transfer

**Prevention:**
1. Design TWO timer UX patterns from the start:
   - **macOS:** `set_title("23:45")` next to the tray icon for persistent countdown
   - **Windows:** Always-on-top frameless mini-window (Tauri supports `always_on_top: true`, `decorations: false`, `width: 120, height: 40`) pinned to a screen corner, showing the countdown
2. Use `std::env::consts::OS` in Rust or `navigator.platform` / Tauri's `os` plugin in the frontend to branch behavior
3. The tooltip (`set_tooltip`) works on both macOS and Windows -- use it as a supplementary display on both platforms, but don't rely on it as the primary countdown mechanism since it only shows on hover
4. Test on both platforms in Phase 1 of desktop development, not at the end

**Detection:**
- Timer works great on Mac, Windows users report "I can't see the timer"
- QA only tests on developer's Mac

**Phase to address:**
Phase 2 (Desktop App MVP). The timer UI must be designed platform-aware from day one. Don't build the Mac version first and "fix Windows later."

---

### Pitfall 4: Background Throttling Kills Timer Accuracy

**What goes wrong:**
Tauri uses a WebView (WKWebView on macOS, WebView2 on Windows) to render the frontend. By default, WebKit applies an `inactiveSchedulingPolicy` of `suspend` -- when the app window is minimized or hidden (common for a menu bar app!), **all JavaScript timers stop**. `setInterval` and `setTimeout` cease firing. The timer countdown freezes silently. After 5-6 minutes minimized, the entire webview may fully suspend. Users reported timers stopping entirely when the app was minimized ([tauri-apps/tauri#5147](https://github.com/tauri-apps/tauri/issues/5147)). For a productivity timer app that runs in the background by design, this is catastrophic.

**Why it happens:**
A menu bar / system tray app has no visible window most of the time. The webview interprets "no visible window" as "background tab" and applies aggressive throttling. This is browser behavior inherited by the webview -- designed for battery life, destructive for timer apps. The fix exists in Tauri v2 (the `backgroundThrottling` config option was added after [wry#1246](https://github.com/tauri-apps/wry/issues/1246) was resolved) but is NOT the default.

**Consequences:**
- Timer shows "23:45" when minimized, still shows "23:45" when restored 10 minutes later
- Timer completion notifications never fire while app is in background
- XP awards and session data are incorrect because elapsed time tracking breaks
- Users lose trust in the timer's accuracy

**Prevention:**
1. Set `backgroundThrottling: "disabled"` in `tauri.conf.json` window configuration. This is mandatory for a timer app.
2. Even with throttling disabled, don't rely solely on JavaScript `setInterval` for time tracking. Store `startedAt` timestamp and compute elapsed time from `Date.now() - startedAt` on each tick. This way, even if a tick is delayed, the displayed time is always correct.
3. Move critical timer logic to the Rust backend via Tauri commands. Rust threads are not affected by webview throttling. Use `tokio::time::interval` in Rust to track timer state and push updates to the frontend via events.
4. On window restore / visibility change, immediately recalculate displayed time from the authoritative timestamp, don't trust the last displayed value.

**Detection:**
- Timer appears to "jump" when window is restored (shows wrong time, then corrects)
- Timer completion notifications arrive minutes late
- Works perfectly when the window is visible, breaks when minimized

**Phase to address:**
Phase 2 (Desktop App MVP). Set `backgroundThrottling: "disabled"` in the initial `tauri.conf.json` scaffold. Implement timestamp-based time calculation from the first timer prototype.

---

### Pitfall 5: Two Processes Writing Timer State -- Bot and Desktop Race Condition

**What goes wrong:**
The current bot persists timer state to the `TimerSession` table: `timerState`, `prePauseState`, `remainingMs`, `lastStateChangeAt`, `totalWorkedMs`, `totalBreakMs`, `pomodoroCount`. The desktop app will also create and manage timer sessions. If both the Discord bot (via `/timer start`) and the desktop app can create and modify `TimerSession` records for the same member simultaneously, they will overwrite each other. Member starts a timer on desktop, pauses it via Discord slash command -- the bot reads stale `remainingMs` because the desktop app updated it 2 seconds ago but the bot cached the old value.

**Why it happens:**
The bot holds timer state in-memory (`activeTimers` Map in `src/modules/timer/manager.ts`) AND persists to DB for restart recovery. The desktop app would naturally hold its own in-memory state and sync to the same DB. Neither knows about the other's in-memory state. The database becomes a shared mutable resource with no coordination.

**Consequences:**
- Duplicate timer sessions for the same member (one from bot, one from desktop)
- Pause/resume from one client doesn't affect the other's in-memory state
- XP double-awarded when both clients complete the "same" session
- `totalWorkedMs` and `pomodoroCount` drift between clients

**Prevention:**
1. **Single source of truth: the API.** The Fastify API must be the ONLY process that reads/writes `TimerSession`. The bot should call the API (internal HTTP or shared library), NOT access the database directly for timer operations. The desktop app already calls the API by design.
2. **Active session constraint:** Add a unique constraint or application-level check: one active timer per member, regardless of source. `@@unique([memberId, status])` with a partial unique index on `status = 'ACTIVE'` (Prisma doesn't support partial unique indexes natively -- enforce in application code or raw SQL).
3. **Event-driven sync:** When the API updates a timer, emit an event (WebSocket to desktop, Discord message edit to bot). Both clients subscribe to state changes rather than polling.
4. **Optimistic locking:** Add a `version` field to `TimerSession`. Any update must include the current version; reject if version mismatch. This catches concurrent writes.

**Detection:**
- Member reports "I have two timers running"
- XP transaction log shows duplicate `TIMER_SESSION` awards for overlapping time periods
- Timer shows different state on Discord vs desktop

**Phase to address:**
Phase 2 (API Server) and Phase 3 (Desktop Timer). Design the "API as single authority" pattern before building either client's timer feature.

---

## Moderate Pitfalls

Mistakes that cost days, not weeks. Recoverable but painful.

---

### Pitfall 6: Discord OAuth Redirect URI -- localhost vs Deep Link Confusion

**What goes wrong:**
Discord OAuth2 for desktop apps requires a redirect URI. The two options are: (a) `http://127.0.0.1:{port}/callback` using a temporary localhost server, or (b) a custom URL scheme like `myapp://callback` via deep linking. Discord supports custom schemes ONLY when using PKCE flow. Developers commonly try `http://localhost/callback` (fails -- Discord requires `127.0.0.1`, not `localhost`) or try custom schemes without PKCE (fails with `invalid_grant`). Additionally, the redirect URI registered in the Discord Developer Portal must EXACTLY match what the app sends, including port number for localhost -- but a temporary localhost server gets a random port each time.

**Why it happens:**
Discord's OAuth2 docs are scattered across three pages (OAuth2 general, Social SDK authentication, discord-api-docs issues). The desktop-specific guidance is minimal. Most tutorials show web app flows with fixed redirect URIs. Desktop apps need either a fixed localhost port (port conflicts risk) or PKCE + custom scheme (more complex setup).

**Consequences:**
- `invalid_grant` or `Invalid OAuth2 redirect_uri` errors during development
- Auth flow works on developer's machine (port 9876 is free) but fails on user's machine (port in use)
- Custom scheme deep links require app to be installed (not just running from `tauri dev`)
- On macOS, deep link schemes can only be registered at install time, not runtime
- On Windows/Linux, deep links arrive as command-line args to a new process instance -- must coordinate with running instance via single-instance plugin

**Prevention:**
1. **Use PKCE + localhost with a fixed port.** Register `http://127.0.0.1:28457/callback` in Discord Developer Portal (use a high, unusual port to minimize conflicts). Use the `tauri-plugin-oauth` library which spawns a temporary localhost server to capture the redirect.
2. **Implement PKCE flow.** Discord requires PKCE for desktop/mobile apps. Generate code_verifier (43-128 chars, alphanumeric + `-._~`), compute code_challenge with S256. Send both in the authorization request. Exchange code + verifier for tokens server-side (in the Fastify API, NOT in the desktop app -- don't expose client_secret).
3. **Token exchange on the API server.** Desktop sends the authorization code to `POST /auth/discord/callback` on the Fastify API. API exchanges code for tokens using client_secret (which never touches the desktop app). API returns a session token/JWT to the desktop app.
4. **Store tokens securely.** Use Tauri's `tauri-plugin-store` with encryption, NOT plain localStorage. Refresh tokens must be rotated and stored server-side.

**Detection:**
- Auth works in development but fails in production builds
- "Invalid redirect URI" errors in Discord OAuth flow
- Port conflict errors on app launch

**Phase to address:**
Phase 2 (API Server + Auth). Implement OAuth flow early -- it gates all authenticated API calls.

---

### Pitfall 7: Prisma Schema Sharing -- generate Runs in Wrong Location

**What goes wrong:**
Moving `prisma/schema.prisma` and `prisma.config.ts` to `packages/db/` means `prisma generate` must run from within that package. But Turborepo tasks and developer habits (`pnpm prisma generate` from root) will try to run it from the wrong directory. The current `prisma.config.ts` uses `import.meta.dirname` for path resolution -- this ONLY works when executed from the directory containing the config file. Running from root resolves paths relative to root, not `packages/db/`. Additionally, Prisma 7 no longer runs `prisma generate` automatically after `migrate dev` -- developers must run it explicitly, and forgetting means stale types.

**Why it happens:**
Prisma's CLI looks for `prisma.config.ts` in the current working directory by default. In a monorepo, "current working directory" depends on whether you ran the command from root (`pnpm run db:generate`) vs from the package (`cd packages/db && pnpm prisma generate`). Turborepo's `--filter` flag changes the cwd, but not all developers know to use it.

**Consequences:**
- `prisma generate` silently generates client in the wrong `node_modules` directory
- Apps import `@prisma/client` but get stale or empty types
- `prisma migrate dev` fails with "datasource property is required" because it can't find the config
- CI builds fail because `db:generate` ran before `packages/db` dependencies were installed

**Prevention:**
1. In `packages/db/package.json`, define explicit scripts:
   ```json
   {
     "scripts": {
       "db:generate": "prisma generate",
       "db:migrate": "prisma migrate dev",
       "db:push": "prisma db push"
     }
   }
   ```
2. In root `turbo.json`, configure task dependencies:
   ```json
   {
     "tasks": {
       "db:generate": { "cache": false },
       "build": { "dependsOn": ["^db:generate"] },
       "dev": { "dependsOn": ["^db:generate"] }
     }
   }
   ```
3. `packages/db/prisma.config.ts` must start with `import "dotenv/config"` and use `import.meta.dirname` for path resolution (already the pattern in the current codebase).
4. Export the Prisma client singleton AND all generated types from `packages/db/src/index.ts`. Other packages import `from "@repo/db"`, never directly from `@prisma/client`.
5. Add `DATABASE_URL` to `globalEnv` in `turbo.json` so task hashing accounts for database changes.

**Detection:**
- TypeScript errors about missing Prisma model types after schema changes
- "Generate" works locally but types are stale in CI
- `prisma migrate dev` fails with path resolution errors

**Phase to address:**
Phase 1 (Monorepo Restructure). Set up the `packages/db` pipeline correctly before adding any new apps.

---

### Pitfall 8: Two Database Clients Exhausting Connection Pool

**What goes wrong:**
Currently, the bot creates one `PrismaClient` instance (in `src/db/client.ts`) which manages a connection pool to PostgreSQL. After the migration, three processes could connect to the same database: the bot (via `packages/db`), the Fastify API (via `packages/db`), and potentially `prisma studio` or migration scripts. Each `PrismaClient` instance creates its own connection pool (default: `num_cpus * 2 + 1` connections for PostgreSQL via the `pg` adapter). On a small VPS, the database may have a max of 20-100 connections. Two always-on processes (bot + API) could consume 20+ connections at baseline, leaving little room for spikes.

**Why it happens:**
`PrismaClient` is designed to be instantiated once per process. In a monorepo, `packages/db` exports a singleton, but each app that imports it gets its own instance (different Node.js processes). This is correct behavior -- you can't share a connection pool across processes. But developers often don't think about aggregate connection usage across all services hitting the same database.

**Consequences:**
- `FATAL: too many clients already` PostgreSQL errors during load
- Bot drops queries during API traffic spikes (and vice versa)
- Connection timeout errors that appear random

**Prevention:**
1. **Explicitly configure pool sizes.** In the `pg` adapter (which this project uses), set `max` connections per process. For 10-25 users, 5 connections per process is more than enough:
   ```typescript
   const pool = new Pool({ connectionString: env.DATABASE_URL, max: 5 });
   ```
2. **Use PgBouncer** if connection pressure grows. PgBouncer multiplexes connections and handles pool exhaustion gracefully. Overkill for 10-25 users now, but worth knowing about.
3. **Monitor connection count.** Add a health check endpoint to the Fastify API that reports `SELECT count(*) FROM pg_stat_activity`.
4. **Don't create PrismaClient in hot paths.** The `packages/db` export must be a module-level singleton, not a factory function that creates new clients.

**Detection:**
- Intermittent database errors under normal load
- Errors correlate with both bot and API being active simultaneously
- `pg_stat_activity` shows more connections than expected

**Phase to address:**
Phase 2 (API Server). Configure explicit pool sizes when setting up the Fastify app's database connection.

---

### Pitfall 9: Cross-Compilation Doesn't Work -- You Need CI Matrix Builds

**What goes wrong:**
Tauri cannot reliably cross-compile. You cannot build a Windows `.exe` on macOS or vice versa. MSI installers can only be built on Windows (WiX requires Windows). macOS `.app` bundles and `.dmg` installers can only be built on macOS (code signing requires macOS Keychain). Developers working on Mac will build and test only the macOS version, then discover at release time that the Windows build has issues they never saw -- different webview rendering (WebView2 vs WKWebView), different file paths, different system tray behavior.

**Why it happens:**
Tauri's Rust backend compiles to native binaries. Native binaries require the target OS toolchain. Cross-compilation from macOS to Windows has gotten better in Tauri v2 (NSIS installers can be cross-compiled with caveats), but MSI cannot, and it's "not tested as much" per official docs. Recent versions (v2.2.0) introduced cross-compilation regressions.

**Consequences:**
- No Windows build artifacts until CI is set up
- Windows-specific bugs discovered only after release
- macOS code signing requires Keychain access in CI (secrets management complexity)
- Build times multiply: each platform is a separate CI job

**Prevention:**
1. **Set up GitHub Actions CI matrix from day one.** Use the official `tauri-apps/tauri-action` which handles multi-platform builds. Configure a 3x matrix: `macos-latest`, `windows-latest`, `ubuntu-latest` (if Linux support is added later).
2. **Use the `turbo-tauri` workflow template** ([LiRenTech/turbo-tauri](https://github.com/LiRenTech/turbo-tauri)) which combines Turborepo caching with Tauri multi-platform builds.
3. **Test on Windows regularly.** Even if the developer works on Mac, spin up a Windows VM or use CI artifacts for manual testing after each feature milestone.
4. **Handle code signing early.** macOS requires an Apple Developer certificate ($99/year). Windows Authenticode signing requires a code signing certificate. Set up signing in CI before the first release, not during.
5. **Budget for CI costs.** macOS runners on GitHub Actions are more expensive than Linux. Each build compiles Rust from scratch unless cached. Expect 15-30 minute build times per platform.

**Detection:**
- Developer ships macOS `.dmg` only, "Windows coming soon" indefinitely
- Windows build fails in CI with cryptic Rust compilation errors
- Users report the app "doesn't install" because it's unsigned

**Phase to address:**
Phase 2 (Desktop App scaffold). Set up CI with platform matrix when creating the Tauri project, not after features are built.

---

### Pitfall 10: Encrypted Data Access from API Server -- Key Management Across Processes

**What goes wrong:**
The existing bot uses per-member AES-256-GCM encryption (`src/shared/crypto.ts` + `src/db/encryption.ts`) with per-member key derivation from `encryptionSalt`. The master encryption key is presumably in `.env` as an environment variable. The Fastify API needs to decrypt member data (conversation messages, check-in content, goal descriptions, reflection responses) to display in the desktop app. If the API doesn't have the same encryption key and the same decryption logic, it gets raw encrypted gibberish from the database. If it DOES have the key, now two processes hold the master key -- doubling the attack surface.

**Why it happens:**
Encryption was designed for a single-process architecture. The crypto module is in `src/shared/crypto.ts` -- after monorepo migration, it moves to `packages/shared/`. Both `apps/bot` and `apps/api` need to import it. But the encryption key (likely `ENCRYPTION_KEY` in `.env`) must be available to both processes. This is straightforward in development (same `.env` file) but requires careful secrets management in production (two PM2 processes, possibly different env files).

**Consequences:**
- Desktop app shows encrypted text instead of readable content
- API can decrypt data but uses a different key format, corrupting data
- Encryption key is duplicated in multiple `.env` files, increasing leak risk
- If the key is rotated, both processes must be restarted simultaneously

**Prevention:**
1. **Move crypto module to `packages/shared/`.** Both apps import the same encryption/decryption functions. This is already the natural location.
2. **Single `.env` source for secrets.** Use a root-level `.env` file for `ENCRYPTION_KEY` and `DATABASE_URL`, referenced by both apps. Turborepo's `globalEnv` in `turbo.json` makes this explicit.
3. **API returns decrypted data.** The desktop app should NEVER have the encryption key or perform decryption. The API decrypts data server-side and returns plaintext over HTTPS. The desktop app is a "dumb client" for encrypted fields.
4. **Consider whether the desktop app actually needs encrypted fields.** Goals, timers, and dashboard data may not need decryption at all (goal titles are cleartext, timer state is cleartext). Only conversation messages and reflection responses are encrypted. The desktop MVP may not display these at all.

**Detection:**
- Desktop app shows base64-encoded strings where readable text should be
- API crashes with `ERR_OSSL_EVP_WRONG_FINAL_BLOCK_LENGTH` (wrong decryption key)
- Same data decrypts differently in bot vs API (encoding mismatch)

**Phase to address:**
Phase 1 (Monorepo Restructure) for moving the module; Phase 2 (API Server) for implementing decryption in API endpoints.

---

## Minor Pitfalls

Mistakes that cost hours, not days. Annoying but manageable.

---

### Pitfall 11: Tauri Dev Mode vs Production -- Deep Link and Protocol Handler Differences

**What goes wrong:**
Deep links (custom URL schemes like `28khq://callback`) only work when the app is installed as a proper `.app` bundle (macOS) or registered via the Windows registry. During development with `tauri dev` or `cargo tauri dev`, the app runs unbundled -- deep links don't reach it. Developers test OAuth with a localhost redirect, ship with deep link redirect, and it breaks in production because they never tested the deep link path.

**Prevention:**
1. Use localhost redirect (`http://127.0.0.1:{port}/callback`) for OAuth in BOTH dev and production. Deep links add complexity without clear benefit for a desktop OAuth flow.
2. If deep links are needed for other features (opening the app from Discord), test with `tauri build` artifacts, not `tauri dev`.

**Phase to address:** Phase 2 (Desktop App + Auth).

---

### Pitfall 12: Tauri System Tray -- Multiple Icons and macOS Submenu Quirks

**What goes wrong:**
Several known Tauri v2 bugs affect system tray behavior: (a) Creating a tray icon can produce TWO icons -- one transparent with click events, one visible with no events ([tauri-apps/tauri#8982](https://github.com/tauri-apps/tauri/issues/8982)). (b) On macOS, the first submenu in a tray menu is forcibly placed under the application's "About" menu regardless of its label. (c) Showing a window from a tray menu item on macOS requires an extra click to focus ([tauri-apps/tauri#7884](https://github.com/tauri-apps/tauri/issues/7884)).

**Prevention:**
1. Create the tray icon in the Tauri `setup()` function, not lazily. Test on both macOS and Windows.
2. On macOS, make the first submenu item an "About" entry to satisfy the forced placement.
3. After showing a window from tray click, explicitly call `window.set_focus()`.
4. Pin to a specific Tauri version and test tray behavior before upgrading.

**Phase to address:** Phase 2 (Desktop App MVP).

---

### Pitfall 13: Turborepo Cache Invalidation with Environment Variables

**What goes wrong:**
Turborepo caches task outputs aggressively. If `DATABASE_URL` changes but the source code doesn't, Turborepo may serve a cached `db:generate` output with the old database schema. Similarly, if `DISCORD_TOKEN` or `ENCRYPTION_KEY` changes, cached builds may embed stale values.

**Prevention:**
1. Add ALL environment variables that affect builds to `globalEnv` in `turbo.json`:
   ```json
   { "globalEnv": ["DATABASE_URL", "ENCRYPTION_KEY", "DISCORD_TOKEN"] }
   ```
2. Set `"cache": false` for `db:generate` task -- Prisma generation is fast enough that caching saves little and risks stale types.
3. For secrets, use `globalPassThroughEnv` (not `globalEnv`) if you don't want them to affect cache hashing.

**Phase to address:** Phase 1 (Monorepo Restructure).

---

### Pitfall 14: Fastify + Bot Competing for the Same Discord Gateway Events

**What goes wrong:**
If the Fastify API also instantiates a `discord.js` Client (e.g., to send messages, update embeds, or verify member identity), it creates a second gateway connection. Discord rate-limits gateway connections per bot token. Two processes connecting with the same token can cause `DISALLOWED_INTENTS` errors or missed events if Discord load-balances shards differently.

**Prevention:**
1. The API should NEVER create a Discord gateway client. It should use the Discord REST API directly (via `@discordjs/rest` or raw HTTP) for any Discord operations (verifying tokens, fetching user info).
2. For sending Discord messages from the API (e.g., "timer completed" notifications), use a message queue or internal HTTP call to the bot process, which holds the single gateway connection.
3. Discord OAuth token validation doesn't require a bot client -- it's a REST API call to `GET /users/@me` with the user's bearer token.

**Phase to address:** Phase 2 (API Server).

---

### Pitfall 15: Desktop App Auto-Update Distribution

**What goes wrong:**
Tauri supports auto-updates via the `tauri-plugin-updater`, but it requires hosting update manifests (JSON files describing latest version + download URLs) on a server. For a 10-25 person friend group, setting up a full update server feels like overkill, but without it, every update requires manually redistributing `.dmg`/`.exe` files.

**Prevention:**
1. Use GitHub Releases as the update backend -- `tauri-action` automatically creates releases with artifacts. The updater plugin can check GitHub's API for new releases.
2. Configure auto-update checking on app launch with a "Update available" notification, not forced auto-install.
3. This is not MVP -- defer to a polish phase. For initial distribution, share `.dmg`/`.exe` files directly in the Discord server.

**Phase to address:** Post-MVP polish phase.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Monorepo restructure | Import paths break everywhere (Pitfall 1) | Move one package at a time, test bot starts after each move |
| Monorepo restructure | Prisma 7 + pnpm TypeScript errors (Pitfall 2) | Install `@prisma/client-runtime-utils` explicitly |
| Monorepo restructure | Prisma generate runs from wrong directory (Pitfall 7) | Configure Turborepo `dependsOn` with `^db:generate` |
| Monorepo restructure | Cache invalidation with env vars (Pitfall 13) | Add secrets to `globalEnv` in turbo.json |
| Monorepo restructure | Encrypted data module sharing (Pitfall 10) | Move crypto to `packages/shared/`, single .env for secrets |
| API server | Connection pool exhaustion (Pitfall 8) | Explicit `max: 5` pool size per process |
| API server | Discord gateway conflict (Pitfall 14) | API uses REST only, never gateway |
| API server + Auth | OAuth redirect URI misconfiguration (Pitfall 6) | Use PKCE + fixed localhost port, exchange tokens server-side |
| Desktop app scaffold | CI matrix builds needed (Pitfall 9) | Set up `tauri-action` with platform matrix immediately |
| Desktop timer | Menu bar countdown is Mac-only (Pitfall 3) | Design platform-specific UX from day one |
| Desktop timer | Background throttling kills timers (Pitfall 4) | Set `backgroundThrottling: "disabled"`, use timestamp math |
| Desktop timer | Bot and desktop timer race condition (Pitfall 5) | API is single authority for timer state |
| Desktop timer | Tray icon bugs (Pitfall 12) | Pin Tauri version, test tray on both platforms |
| Deep linking | Dev vs production behavior differs (Pitfall 11) | Use localhost redirect for OAuth, not deep links |
| Distribution | Auto-update infrastructure (Pitfall 15) | Use GitHub Releases, defer to polish phase |

## Sources

- [Tauri v2 System Tray documentation](https://v2.tauri.app/learn/system-tray/)
- [Tauri v2 Deep Linking plugin](https://v2.tauri.app/plugin/deep-linking/)
- [Tauri v2 Configuration reference](https://v2.tauri.app/reference/config/)
- [Tauri v2 GitHub Pipelines](https://v2.tauri.app/distribute/pipelines/github/)
- [Tauri tray set_title feature (macOS only) -- Issue #3322](https://github.com/tauri-apps/tauri/issues/3322)
- [Tauri duplicate tray icons -- Issue #8982](https://github.com/tauri-apps/tauri/issues/8982)
- [Tauri tray focus issue -- Issue #7884](https://github.com/tauri-apps/tauri/issues/7884)
- [Tauri background throttling/suspension -- wry Issue #1246](https://github.com/tauri-apps/wry/issues/1246)
- [Tauri app stops in background -- Issue #5147](https://github.com/tauri-apps/tauri/issues/5147)
- [Prisma 7 + pnpm TS2742 errors -- Issue #28581](https://github.com/prisma/prisma/issues/28581)
- [Prisma + Turborepo official guide](https://www.prisma.io/docs/guides/turborepo)
- [Prisma in pnpm workspaces guide](https://www.prisma.io/docs/guides/use-prisma-in-pnpm-workspaces)
- [Prisma monorepo discussion #19444](https://github.com/prisma/prisma/discussions/19444)
- [Prisma connection pool docs](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/connection-pool)
- [Discord OAuth2 documentation](https://discord.com/developers/docs/topics/oauth2)
- [tauri-plugin-oauth for desktop OAuth](https://github.com/FabianLars/tauri-plugin-oauth)
- [Discord custom scheme redirect URIs -- Issue #450](https://github.com/discord/discord-api-docs/issues/450)
- [Turborepo GitHub Actions guide](https://turborepo.dev/docs/guides/ci-vendors/github-actions)
- [turbo-tauri combined workflow](https://github.com/LiRenTech/turbo-tauri)
- [Nhost monorepo migration post-mortem](https://nhost.io/blog/how-we-configured-pnpm-and-turborepo-for-our-monorepo)
- [pnpm import command docs](https://pnpm.io/cli/import)
