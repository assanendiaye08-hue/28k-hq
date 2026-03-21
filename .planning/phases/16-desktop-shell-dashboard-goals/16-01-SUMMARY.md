---
phase: 16-desktop-shell-dashboard-goals
plan: 01
subsystem: ui
tags: [tauri, react, vite, tailwind, zustand, oauth, discord, desktop, tray]

requires:
  - phase: 15-rest-api-authentication
    provides: "POST /auth/discord, /auth/refresh, /auth/logout endpoints for OAuth and token management"
  - phase: 14-monorepo-restructure
    provides: "Monorepo structure with apps/desktop workspace and @28k/shared package"
provides:
  - "Tauri v2 desktop app shell with React 19 + Vite 6 + Tailwind CSS 4"
  - "System tray with menu and left-click window toggle"
  - "Window close-to-hide behavior for persistent background app"
  - "Discord OAuth login flow via tauri-plugin-oauth + PKCE"
  - "API client with JWT auto-refresh on 401"
  - "Zustand auth store with login/logout state management"
  - "Dark+gold CSS theme with brand, surface, text, rank color variables"
affects: [16-02, 16-03, 17-timer-sync]

tech-stack:
  added: [tauri@2, react@19, react-dom@19, react-router@7, zustand@5, vite@6, tailwindcss@4, "@tauri-apps/api@2", "@tauri-apps/plugin-store@2", "@tauri-apps/plugin-positioner@2", "@tauri-apps/plugin-opener@2", "@fabianlars/tauri-plugin-oauth@2"]
  patterns: [tauri-tray-toggle, close-to-hide, oauth-localhost-redirect, api-client-auto-refresh, zustand-auth-store]

key-files:
  created:
    - apps/desktop/package.json
    - apps/desktop/tsconfig.json
    - apps/desktop/vite.config.ts
    - apps/desktop/index.html
    - apps/desktop/src/main.tsx
    - apps/desktop/src/App.tsx
    - apps/desktop/src/index.css
    - apps/desktop/src/api/client.ts
    - apps/desktop/src/api/auth.ts
    - apps/desktop/src/stores/auth-store.ts
    - apps/desktop/src/pages/LoginPage.tsx
    - apps/desktop/src/components/common/LoadingSpinner.tsx
    - apps/desktop/src-tauri/Cargo.toml
    - apps/desktop/src-tauri/build.rs
    - apps/desktop/src-tauri/src/lib.rs
    - apps/desktop/src-tauri/src/main.rs
    - apps/desktop/src-tauri/tauri.conf.json
    - apps/desktop/src-tauri/capabilities/default.json
    - apps/desktop/src-tauri/icons/tray-icon.png
    - apps/desktop/src-tauri/icons/icon.png
  modified:
    - pnpm-lock.yaml

key-decisions:
  - "Used openUrl from @tauri-apps/plugin-opener (not 'open' -- API changed in v2)"
  - "Used onUrl listener from tauri-plugin-oauth for callback capture (start() returns port, not URL)"
  - "Store plugin load() requires defaults:{} parameter in latest v2"
  - "Placeholder gold circle PNGs for tray and app icons (user replaces with ouroboros later)"

patterns-established:
  - "Tauri tray toggle: left-click show/hide window, right-click menu with Show Dashboard + Quit"
  - "Close-to-hide: onCloseRequested handler calls event.preventDefault() + window.hide()"
  - "OAuth localhost redirect: start() server, onUrl() listener, cancel() cleanup, PKCE exchange"
  - "API client auto-refresh: apiFetch wrapper intercepts 401, refreshes token, retries once"
  - "Zustand auth store: login(user, token) sets accessToken + user state, logout clears both"

requirements-completed: [APP-01, APP-02, APP-03, APP-05, AUTH-04]

duration: 6min
completed: 2026-03-21
---

# Phase 16 Plan 01: Desktop Shell Scaffold Summary

**Tauri v2 desktop app with system tray, Discord OAuth via localhost redirect + PKCE, and dark+gold Tailwind CSS 4 theme**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-21T12:51:24Z
- **Completed:** 2026-03-21T12:57:37Z
- **Tasks:** 2
- **Files modified:** 25

## Accomplishments
- Tauri v2 + React 19 + Vite 6 + Tailwind CSS 4 app scaffolded in apps/desktop/
- System tray with Show Dashboard / Quit menu, left-click toggles window visibility, window close hides to tray
- Discord OAuth login flow via tauri-plugin-oauth localhost redirect with PKCE code challenge
- API client wrapper with automatic JWT refresh on 401, Zustand auth store for session state
- Dark+gold CSS theme with brand/surface/text/border/rank color variables via Tailwind @theme

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold Tauri v2 app with React, Vite, Tailwind, system tray, and close-to-hide** - `905779e` (feat)
2. **Task 2: Discord OAuth login flow, API client with auto-refresh, and auth store** - `55d50f8` (feat)

## Files Created/Modified

- `apps/desktop/package.json` - @28k/desktop workspace package with Tauri + React + Tailwind deps
- `apps/desktop/tsconfig.json` - ES2021 target, bundler resolution, react-jsx
- `apps/desktop/vite.config.ts` - React + Tailwind plugins, port 1420, HMR, Tauri env prefix
- `apps/desktop/index.html` - Vite entry HTML with root div
- `apps/desktop/src/main.tsx` - React 19 createRoot entry
- `apps/desktop/src/App.tsx` - Auth-gated routing, session restore, close-to-hide handler
- `apps/desktop/src/index.css` - Tailwind CSS 4 @theme with dark+gold color system
- `apps/desktop/src/api/client.ts` - apiFetch with Bearer auth, auto-refresh on 401
- `apps/desktop/src/api/auth.ts` - loginWithDiscord, tryRestoreSession, logoutSession
- `apps/desktop/src/stores/auth-store.ts` - Zustand store with user/isAuthenticated/isLoading
- `apps/desktop/src/pages/LoginPage.tsx` - Discord login button with loading/error states
- `apps/desktop/src/components/common/LoadingSpinner.tsx` - Gold spinning loader
- `apps/desktop/src-tauri/Cargo.toml` - 28k-hq-desktop with tray-icon, store, positioner, oauth plugins
- `apps/desktop/src-tauri/build.rs` - tauri_build::build()
- `apps/desktop/src-tauri/src/lib.rs` - Tauri setup: tray menu, icon, visibility toggle, plugins
- `apps/desktop/src-tauri/src/main.rs` - desktop_lib::run() entry
- `apps/desktop/src-tauri/tauri.conf.json` - 28K HQ app config: window, tray, CSP, bundle
- `apps/desktop/src-tauri/capabilities/default.json` - Plugin permissions including window show/hide/focus
- `apps/desktop/src-tauri/icons/tray-icon.png` - White circle placeholder (32x32, iconAsTemplate)
- `apps/desktop/src-tauri/icons/icon.png` - Gold circle placeholder (32x32)

## Decisions Made

- Used `openUrl` from `@tauri-apps/plugin-opener` instead of `open` (the v2 API renamed this export)
- Used `onUrl` listener from `@fabianlars/tauri-plugin-oauth` for callback URL capture (start() only returns port number)
- Added `defaults: {}` to all `load()` calls because the v2 store plugin requires it in StoreOptions
- Created placeholder PNG icons programmatically via Python (gold/white circles) for both tray and app icons

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed @tauri-apps/plugin-opener import**
- **Found during:** Task 2 (OAuth login flow)
- **Issue:** Plan referenced `import { open } from '@tauri-apps/plugin-opener'` but v2 API exports `openUrl`
- **Fix:** Changed import to `openUrl` and updated call site
- **Files modified:** apps/desktop/src/api/auth.ts
- **Verification:** TypeScript compiles without errors
- **Committed in:** 55d50f8 (Task 2 commit)

**2. [Rule 1 - Bug] Fixed @tauri-apps/plugin-store load() signature**
- **Found during:** Task 2 (OAuth login flow + API client)
- **Issue:** v2 store plugin requires `defaults` property in StoreOptions, but plan/research used `{ autoSave: false }` alone
- **Fix:** Added `defaults: {}` to all load() calls
- **Files modified:** apps/desktop/src/api/auth.ts, apps/desktop/src/api/client.ts
- **Verification:** TypeScript compiles without errors
- **Committed in:** 55d50f8 (Task 2 commit)

**3. [Rule 1 - Bug] Fixed tauri-plugin-oauth callback URL capture pattern**
- **Found during:** Task 2 (OAuth login flow)
- **Issue:** Plan assumed start() returns callback URL, but it returns port number. Callback comes via onUrl() listener
- **Fix:** Restructured to use onUrl() listener with Promise + timeout pattern before calling start()
- **Files modified:** apps/desktop/src/api/auth.ts
- **Verification:** TypeScript compiles, API matches actual @fabianlars/tauri-plugin-oauth v2 types
- **Committed in:** 55d50f8 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (3 bugs -- all API signature mismatches between research docs and actual v2 plugin types)
**Impact on plan:** All fixes corrected API usage to match actual installed package types. No scope creep.

## Issues Encountered

- Rust toolchain (rustc/cargo) installed in ~/.rustup/toolchains/ but not in PATH -- resolved by setting PATH explicitly for tauri info verification

## User Setup Required

None - no external service configuration required. VITE_API_URL and VITE_DISCORD_CLIENT_ID environment variables needed at runtime but are already part of the project's .env pattern.

## Next Phase Readiness
- Desktop app shell complete with auth, tray, and theme
- Ready for Plan 02 (Dashboard view and Goals tree) to build on authenticated state
- API endpoints from Phase 15 (dashboard, goals, quote) ready for consumption

## Self-Check: PASSED

- All 20 created files verified present on disk
- Both task commits (905779e, 55d50f8) verified in git log

---
*Phase: 16-desktop-shell-dashboard-goals*
*Completed: 2026-03-21*
