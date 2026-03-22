# Project Research Summary

**Project:** 28K HQ v2.0 -- Desktop Companion App
**Domain:** Desktop productivity app (Tauri v2 + React) with REST API (Fastify) extending an existing Discord bot platform
**Researched:** 2026-03-21
**Confidence:** HIGH

## Executive Summary

The v2.0 milestone transforms a single-process Discord bot (23K LOC TypeScript, Prisma 7, PostgreSQL) into a three-application platform: the existing bot, a new Fastify REST API, and a Tauri v2 desktop companion app. The desktop app provides visual UX for features that are awkward in Discord embeds -- a menu bar countdown timer, a goal hierarchy tree, and an at-a-glance dashboard with streaks, rank, and priorities. The entire stack is TypeScript end-to-end, with a pnpm + Turborepo monorepo sharing a Prisma database package and a constants/types package across all three apps. No new cloud services are needed; the API runs on the same VPS as the bot, and the desktop app runs on user machines.

The recommended approach is to execute the migration in strict sequence: monorepo restructure first (extract shared packages, move the bot, verify nothing breaks), then API server with Discord OAuth, then desktop app shell with auth, then cross-platform timer integration, then goals/dashboard/polish. This order is non-negotiable because each layer depends on the one below it. The monorepo restructure is the riskiest phase -- it touches every import path in 23K lines of code and introduces pnpm's strict dependency resolution, which will surface a known Prisma 7 TypeScript bug (TS2742 with `@prisma/client-runtime-utils`). The timer integration is the most architecturally complex phase because two processes (bot and API) write to the same `TimerSession` table, requiring the API to be the single authority for timer state to prevent race conditions and double XP awards.

The key risks are: (1) the monorepo migration breaking the live bot during restructure, (2) Tauri's WebView background throttling silently killing timer accuracy in the menu bar app, and (3) the menu bar countdown being macOS-only (Windows system tray does not support text display). All three have documented mitigations. The competitive advantage is not in building a better timer -- Flow, Be Focused Pro, and Pomotroid already exist -- but in being the visual layer for a gamified community ecosystem where timer sessions feed XP, streaks, and AI coach context.

## Key Findings

### Recommended Stack

The stack leverages the existing TypeScript/Prisma/PostgreSQL foundation and adds Tauri v2 for the desktop app, Fastify 5.x for the REST API, and Turborepo + pnpm for monorepo orchestration. All new dependencies are zero-cost (no new SaaS). The desktop app uses React 19, Tailwind CSS 4, Zustand 5 for state, and React Router 7 for routing. Vite 6 or 7 (not 8 -- too fresh) is the build tool. Discord OAuth2 is implemented natively (3 fetch calls, no auth library).

**Core technologies:**
- **Tauri v2** (2.10.x): Desktop app framework -- 5-10MB binary, ~30MB RAM vs Electron's 150MB+. Native system tray, notifications, autostart, auto-updater, and deep linking via official plugins.
- **Fastify 5.x** (5.8.2): REST API -- 78K req/s, built-in JSON schema validation, first-class TypeScript, plugin architecture. With @fastify/jwt, @fastify/cors, @fastify/cookie for auth.
- **Turborepo 2.x + pnpm 10.x**: Monorepo tooling -- single `turbo.json` for build orchestration, pnpm's strict symlink `node_modules` prevents phantom dependencies. 30-minute learning curve.
- **React 19 + Tailwind CSS 4 + Zustand 5**: Desktop frontend -- standard SPA stack. Zustand's selector-based subscriptions prevent re-render storms from the 1-second timer tick. No SSR/SSG needed in a desktop app.
- **Discord OAuth2 (native PKCE)**: Authentication -- authorization code flow with PKCE (no client secret in desktop binary). API exchanges code for tokens and issues its own JWT.

**Critical version note:** Pin Vite to 6.x or 7.x. Vite 8 shipped 4 days ago with Rolldown internals -- untested with Tauri v2 and Tailwind v4.

### Expected Features

**Must have (table stakes):**
- Pomodoro timer with custom work/break/long break intervals and session count
- Menu bar countdown display (the defining UX -- glance up and see "14:32")
- Popover controls on tray click (play/pause/skip/stop, progress ring, session counter)
- Phase transition notifications with alarm sounds
- Session sync to bot API (the whole point -- feeds XP, streaks, Jarvis context)
- Discord OAuth login (gates all personalized features)
- Goal hierarchy view (read-only nested tree with progress bars, expand/collapse)
- Dashboard (today's priorities, weekly goal progress, streak, rank, daily quote)
- Dark theme with gold accents, minimize to tray, global keyboard shortcut

**Should have (differentiators, v2.x):**
- Flowmodoro mode (count-up timer with auto-calculated break -- very few desktop apps offer this)
- Live XP animation on session complete ("+50 XP" dopamine hit -- no standalone timer does this)
- Screen focus on break transition (assertive break reminder, more than a notification)
- Ticking/ambient sounds during focus (ADHD focus ritual cue)

**Defer (v3+):**
- Goal creation/editing from desktop (duplicates complex bot logic, creates sync conflicts)
- Community-aware dashboard with leaderboard position (API endpoints don't exist yet)
- Detailed analytics/statistics (monthly recaps and Jarvis already handle retrospectives)
- App/website blocking (requires elevated OS permissions, not the core value prop)

**Anti-features (never build):**
- Built-in task manager, calendar integration, activity tracking, music integration, theme customization, sync/cloud storage for settings

### Architecture Approach

The architecture follows a strict three-tier model: desktop app (thin client) -> Fastify API (auth + data gateway) -> PostgreSQL (shared database). The bot and API are separate Node.js processes on the same VPS, both consuming `@28k/db` (Prisma schema, client, encryption) and `@28k/shared` (types, constants, XP engine, timer constants). The desktop app imports only `@28k/shared` for types/constants and never touches the database. The timer uses a "database as source of truth" pattern: the bot owns in-memory state for Discord timers, the API writes DB records for desktop timers, and a 30-second bot polling cron detects desktop completions for Discord DM notifications and role updates.

**Major components:**
1. **`packages/db`** -- Prisma schema, client singleton with AES-256-GCM encryption extension, generated types. Single source of truth for all database access.
2. **`packages/shared`** -- Constants (RANK_PROGRESSION, BRAND_COLORS, TIMER_DEFAULTS), XP engine (awardXP, getRankForXP), timer constants. Pure functions + types, no runtime dependencies beyond `@28k/db` types.
3. **`apps/api`** -- Fastify REST server. Discord OAuth + JWT auth, timer CRUD, goals read, dashboard aggregation. Stateless, thin data layer. Deployed behind nginx with TLS on same VPS.
4. **`apps/desktop`** -- Tauri v2 + React SPA. System tray with countdown, popover timer controls, goal tree view, dashboard. All data via REST API. Timer countdown runs client-side (JavaScript), syncs to API on user actions.
5. **`apps/bot`** -- Existing Discord bot (unchanged internally). Moved to `apps/bot/`, imports from `@28k/db` and `@28k/shared`. New: 30-second cron polling for desktop timer completions.

### Critical Pitfalls

1. **Monorepo migration breaks the live bot** -- Moving 23K LOC to a new directory structure changes every import path, `prisma.config.ts` path resolution, PM2 entry points, and `.env` loading. Mitigation: dedicated migration phase with zero new features; move one package at a time; verify bot starts after each step.

2. **Prisma 7 + pnpm TypeScript errors (TS2742)** -- Known open bug where Prisma 7's generated client references `@prisma/client-runtime-utils` which pnpm's strict `node_modules` can't resolve. Mitigation: explicitly install `@prisma/client-runtime-utils` in `packages/db`; if needed, add `public-hoist-pattern[]=@prisma/*` to `.npmrc`.

3. **WebView background throttling kills timer accuracy** -- Tauri's WebView suspends JavaScript timers when the app window is hidden (the normal state for a menu bar app). `setInterval` stops firing entirely after 5-6 minutes. Mitigation: set `backgroundThrottling: "disabled"` in `tauri.conf.json`; compute elapsed time from `Date.now() - startedAt` timestamps, never trust `setInterval` cadence.

4. **Menu bar countdown is macOS-only** -- `TrayIcon.set_title()` only works on macOS. Windows system tray has no text display equivalent. Mitigation: design two UX patterns from day one -- macOS uses `set_title()`, Windows uses an always-on-top frameless mini-window.

5. **Bot and desktop timer race condition** -- Two processes writing `TimerSession` records for the same member causes duplicate sessions, stale state, and double XP awards. Mitigation: API is the single authority for all timer writes; enforce one active timer per member at the application level; bot polls DB for desktop completions rather than managing state independently.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Monorepo Restructure
**Rationale:** Everything depends on the monorepo being right. The API cannot exist without `packages/db`. The desktop app cannot exist without `packages/shared`. The bot cannot be touched until it is moved to `apps/bot/`. This is pure infrastructure with zero new features.
**Delivers:** Working monorepo with pnpm + Turborepo. Bot running identically from `apps/bot/`. Shared packages extracted and importable.
**Addresses:** Foundation for all features
**Avoids:** Pitfall 1 (migration breaks bot), Pitfall 2 (Prisma + pnpm TS errors), Pitfall 7 (Prisma generate path issues), Pitfall 13 (Turborepo cache invalidation), Pitfall 10 (encryption module sharing)
**Key tasks:** Create `pnpm-workspace.yaml`, extract `packages/db` (schema + client + encryption), extract `packages/shared` (constants + XP engine + timer constants), move bot to `apps/bot/`, update all imports, verify `pnpm dev --filter bot` works, update deploy scripts.

### Phase 2: REST API + Authentication
**Rationale:** The desktop app is useless without an API to talk to. Auth gates every personalized feature. Build the data layer before the presentation layer.
**Delivers:** Running Fastify server with Discord OAuth + JWT auth, profile/dashboard/goals read endpoints, timer CRUD endpoints. Deployed behind nginx on same VPS.
**Uses:** Fastify 5.x, @fastify/jwt, @fastify/cors, @fastify/cookie, Discord OAuth2 PKCE
**Implements:** API server component, JWT auth middleware, all REST routes
**Avoids:** Pitfall 6 (OAuth redirect URI confusion -- use PKCE + fixed localhost port), Pitfall 8 (connection pool exhaustion -- set `max: 5` per process), Pitfall 14 (API must not create Discord gateway client)
**Key tasks:** Scaffold `apps/api`, implement Discord OAuth with PKCE, JWT signing/verification, timer routes (POST/PATCH/GET), goals route (GET hierarchy), dashboard route (aggregated data), deploy as systemd service behind nginx.

### Phase 3: Desktop App Shell + Auth + Dashboard
**Rationale:** Get the Tauri app booting, authenticated, and showing read-only data before tackling the complex timer integration. This validates the full stack end-to-end (OAuth -> JWT -> API -> data display) with the simplest possible features.
**Delivers:** Installable Tauri app with Discord login, dashboard view (priorities, streak, rank, quote), goal hierarchy tree view, system tray icon, dark theme with gold accents.
**Uses:** Tauri v2, React 19, Tailwind CSS 4, Zustand 5, Vite 6/7, React Router 7
**Implements:** Desktop app component, OAuth flow, dashboard + goals views, system tray icon
**Avoids:** Pitfall 11 (use localhost redirect for OAuth, not deep links during dev), Pitfall 9 (set up CI matrix builds immediately), Pitfall 12 (tray icon bugs -- create in `setup()`, test both platforms)
**Key tasks:** Scaffold Tauri app, implement OAuth login flow with `tauri-plugin-oauth`, build dashboard view, build goal tree view, system tray with gold ouroboros icon, dark theme, minimize to tray, set up GitHub Actions CI for macOS + Windows builds.

### Phase 4: Cross-Platform Timer
**Rationale:** The timer is the core feature and the most architecturally complex integration. It requires the API (Phase 2) and the desktop shell (Phase 3) to be working. Timer integration touches both the desktop app and the bot (polling cron), so it must be built with both sides in mind.
**Delivers:** Working Pomodoro timer in the desktop app with menu bar countdown, popover controls, phase transitions, notifications, sounds, session sync to API, XP award on completion, bot DM notification of desktop sessions.
**Addresses:** Pomodoro timer (P1), menu bar countdown (P1), popover controls (P1), phase transitions + sounds (P1), session sync (P1), global keyboard shortcut (P1)
**Avoids:** Pitfall 3 (design macOS + Windows UX from day one), Pitfall 4 (disable background throttling, use timestamp math), Pitfall 5 (API as single timer authority, one active session per member)
**Key tasks:** Timer state machine (idle/working/break/long_break), Pomodoro countdown UI, menu bar countdown (macOS `set_title`, Windows mini-window), popover with progress ring + session counter, phase transition notifications + alarm sounds, session sync (POST on start, PATCH on pause/resume/stop), XP feedback display, bot polling cron for desktop completions, add `source` + `botNotified` fields to `TimerSession` schema.

### Phase 5: Polish + Distribution
**Rationale:** Polish features that are not MVP-critical but round out the product. Distribution infrastructure (auto-updater) is needed before sharing with the 10-25 member group.
**Delivers:** Flowmodoro mode, XP animation, ambient sounds, auto-start preferences, launch at login, auto-update via GitHub Releases, error handling, offline resilience.
**Addresses:** P2 features (flowmodoro, XP animation, ambient sounds, auto-start, launch at login)
**Avoids:** Pitfall 15 (use GitHub Releases for auto-update backend)
**Key tasks:** Flowmodoro count-up timer + auto-calculated break, XP gain animation on session complete, ticking/ambient sounds, auto-start next phase toggle, launch at login toggle, Tauri updater plugin with GitHub Releases, offline session queueing with retry, error boundaries + graceful degradation.

### Phase Ordering Rationale

- **Phase 1 before everything:** The monorepo restructure is a prerequisite for all new code. Both the API and desktop app depend on shared packages that do not exist yet. The bot must survive the migration without downtime.
- **Phase 2 before Phase 3:** The desktop app is a thin client that calls the API. Without the API, the desktop app has nothing to display. Auth must exist before any authenticated views.
- **Phase 3 before Phase 4:** The timer requires a working desktop shell with auth, system tray, and notification capabilities. Starting with read-only views (dashboard, goals) validates the stack with simpler features before tackling the complex timer.
- **Phase 4 as the integration phase:** Timer is where bot, API, and desktop all interact. It touches schema changes (`source`, `botNotified`), API routes, desktop UI, and bot cron. All three must be working before this integration.
- **Phase 5 as polish:** Flowmodoro, XP animations, and auto-update are valuable but not critical for initial validation with the 10-25 member group.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1 (Monorepo Restructure):** The Prisma 7 + pnpm TS2742 bug is an open issue with workarounds but no upstream fix. May need hands-on experimentation to find the right combination of `@prisma/client-runtime-utils` installation + `.npmrc` hoisting. Research the exact current state of the issue before starting.
- **Phase 2 (API + Auth):** Discord OAuth PKCE for desktop apps has scattered documentation. The exact redirect URI configuration (localhost port vs deep link) and `tauri-plugin-oauth` integration need validation with a minimal prototype before committing to a pattern.
- **Phase 4 (Cross-Platform Timer):** The macOS vs Windows tray text disparity needs a concrete Windows UX prototype. The background throttling fix (`backgroundThrottling: "disabled"`) needs validation that it actually works with Tauri v2.10.x -- the config option was added relatively recently.

Phases with standard patterns (skip research-phase):
- **Phase 3 (Desktop Shell + Dashboard):** Tauri + React + Vite is a well-documented setup. Dashboard and goal tree views are standard React data display. OAuth login flow follows the pattern designed in Phase 2.
- **Phase 5 (Polish):** Flowmodoro is a UI variation of the existing timer. Auto-update via GitHub Releases is documented in Tauri's official guides.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified via npm registry. Tauri v2, Fastify 5, React 19, Turborepo 2, pnpm 10 are all stable releases. Only concern: Vite 8 is too new (pinned to 6/7). |
| Features | MEDIUM-HIGH | Based on competitor analysis of 6+ apps (Flow, Be Focused Pro, Pomotroid, TomatoBar, Flowmo, Pomofocus). Feature prioritization is sound but user validation needed -- the 10-25 person group may have different priorities than the general market. |
| Architecture | HIGH | Full codebase review performed. Monorepo structure follows official Prisma + Turborepo guides. Timer cross-platform flow is the most novel design and has clear patterns (API as authority, bot polling). |
| Pitfalls | HIGH | Verified against GitHub issue trackers (Tauri, Prisma, Turborepo), official docs, and community post-mortems. The Prisma 7 + pnpm bug and Tauri background throttling are confirmed issues with documented workarounds. |

**Overall confidence:** HIGH

### Gaps to Address

- **Prisma 7 + pnpm TS2742 resolution:** The workaround (installing `@prisma/client-runtime-utils`) needs hands-on validation. If it does not work, the fallback is `.npmrc` hoisting, but this weakens pnpm's strict resolution benefit. Check the GitHub issue status before Phase 1.
- **Windows timer UX:** The always-on-top mini-window approach for Windows countdown display is a reasonable design but has no precedent in the Tauri ecosystem. Needs prototyping early in Phase 4.
- **Discord OAuth PKCE with tauri-plugin-oauth:** The exact integration between `tauri-plugin-oauth` (localhost redirect capture) and Discord's PKCE flow needs a proof-of-concept. The plugin may handle PKCE natively or may need manual code_verifier generation.
- **Bot polling for desktop completions:** The 30-second polling cron is architecturally simple but the UX implication (up to 30s delay for Discord DM after completing a desktop timer session) should be validated with users. May need to reduce to 10 seconds or switch to a direct HTTP call from API to bot.
- **macOS code signing cost:** Apple Developer certificate is $99/year. Not a technical gap but a decision to make before the first macOS release. Unsigned apps trigger Gatekeeper warnings that may confuse the 10-25 user base.

## Sources

### Primary (HIGH confidence)
- [Tauri v2 official documentation](https://v2.tauri.app/) -- Plugins, system tray, deep linking, configuration reference
- [Tauri npm packages](https://www.npmjs.com/package/@tauri-apps/cli) -- Version 2.10.1 verified
- [Fastify documentation](https://fastify.dev/) -- TypeScript guide, plugin architecture
- [Fastify + plugins on npm](https://www.npmjs.com/package/fastify) -- Version 5.8.2 verified
- [Turborepo documentation](https://turborepo.dev/) -- Repository structure, task dependencies
- [Prisma monorepo guides](https://www.prisma.io/docs/guides/turborepo) -- pnpm workspaces, Turborepo integration
- [Discord OAuth2 documentation](https://discord.com/developers/docs/topics/oauth2) -- PKCE flow, scopes

### Secondary (MEDIUM confidence)
- [Prisma + pnpm TS2742 bug](https://github.com/prisma/prisma/issues/28581) -- Open issue, workarounds documented
- [Tauri background throttling](https://github.com/tauri-apps/wry/issues/1246) -- Fix exists in Tauri v2 but is not default
- [Tauri tray icon quirks](https://github.com/tauri-apps/tauri/issues/8982) -- Known bugs with workarounds
- [tauri-plugin-oauth](https://github.com/FabianLars/tauri-plugin-oauth) -- Community plugin for desktop OAuth
- Competitor analysis: Flow, Be Focused Pro, Pomotroid, TomatoBar, Flowmo, Pomofocus

### Tertiary (LOW confidence)
- [Discord OAuth PKCE for desktop apps](https://github.com/discord/discord-api-docs/issues/4002) -- Community discussion, not official guidance
- [TypeScript Monorepo Best Practice 2026](https://hsb.horse/en/blog/typescript-monorepo-best-practice-2026/) -- Blog post, single source

---
*Research completed: 2026-03-21*
*Ready for roadmap: yes*
