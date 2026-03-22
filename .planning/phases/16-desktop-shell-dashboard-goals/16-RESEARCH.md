# Phase 16: Desktop Shell + Dashboard + Goals View - Research

**Researched:** 2026-03-21
**Domain:** Tauri v2 desktop app with React 19, Tailwind CSS 4, Zustand 5; system tray, OAuth login, dashboard and goal hierarchy views
**Confidence:** HIGH

## Summary

Phase 16 bootstraps the Tauri v2 desktop app from the empty `apps/desktop` scaffold into a working application with authentication, a system tray presence, a dashboard view, and a read-only goal hierarchy view. The API endpoints (auth, dashboard, goals, quote) already exist from Phase 15 -- this phase builds the client that consumes them.

The core technical challenges are: (1) scaffolding a Tauri v2 + React 19 + Vite + Tailwind 4 app inside the existing monorepo, (2) implementing Discord OAuth via the `tauri-plugin-oauth` localhost redirect pattern with PKCE token exchange through the existing API, (3) building the system tray with gold ouroboros icon and popover window using `tauri-plugin-positioner`, and (4) creating the dark+gold themed React UI for dashboard and goals with Zustand stores for state management.

**Primary recommendation:** Scaffold with `pnpm create tauri-app` in `apps/desktop`, integrate React 19 + Tailwind CSS 4 via `@tailwindcss/vite`, use `tauri-plugin-oauth` for localhost-based OAuth redirect, `@tauri-apps/plugin-store` for token persistence, and `tauri-plugin-positioner` for tray popover positioning. Do NOT use deep links for OAuth. Do NOT use `@tauri-apps/plugin-stronghold` (deprecated).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| APP-01 | Tauri v2 desktop app builds and runs on macOS and Windows | Tauri v2 scaffolding with Vite + React; `tray-icon` Cargo feature; platform-specific window config |
| APP-02 | App icon (gold ouroboros) appears in system tray / menu bar | TrayIconBuilder in Rust setup, PNG icon at `src-tauri/icons/tray-icon.png`, iconAsTemplate for macOS |
| APP-03 | Clicking tray icon opens a popover/mini-window with current state | `tauri-plugin-positioner` with `tray-icon` feature, `Position::TrayCenter`, visibility toggle on click |
| APP-04 | App has a full main window for dashboard, goals, and timer setup | Separate main window in `tauri.conf.json`, React Router for dashboard/goals/settings views |
| APP-05 | Dark theme with gold accents matching brand identity | Tailwind CSS 4 `@theme` directive with BRAND_COLORS from `@28k/shared`, single dark theme |
| AUTH-04 | Tokens stored securely in Tauri secure storage (OS keychain) | `@tauri-apps/plugin-store` for encrypted persistent storage of refresh tokens; access tokens in memory |
| DASH-01 | Dashboard shows today's active goals and priorities | `GET /dashboard` endpoint returns `goals.today`; render as priority list component |
| DASH-02 | Dashboard shows this week's goals | `GET /dashboard` endpoint returns `goals.weekly`; render as weekly goals component |
| DASH-03 | Dashboard shows current streak (with fire visual if active) | `GET /dashboard` returns `member.currentStreak`; streak badge with fire emoji/icon when > 0 |
| DASH-04 | Dashboard shows current rank and XP progress to next rank | `GET /dashboard` returns `member.rank`, `member.rankColor`, `member.nextRank`; progress bar component |
| DASH-05 | Dashboard shows a daily rotating operator quote from curated pool | `GET /dashboard` returns `quote`; styled quote card component |
| GOAL-01 | User can view goal hierarchy as a nested list (yearly->quarterly->monthly->weekly) | `GET /goals` returns 4-level deep tree; recursive React tree component with expand/collapse |
| GOAL-02 | Goals show progress bars (measurable: current/target, freetext: complete/not) | Goal node component renders progress bar for MEASURABLE type, checkbox for FREETEXT |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @tauri-apps/cli | 2.10.x | Tauri CLI for dev/build/bundle | Official Tauri build tool. Required for `tauri dev` and `tauri build`. |
| @tauri-apps/api | 2.10.x | JS API for Tauri features (tray, window, events) | Typed API for invoking Rust commands, managing windows, system tray from React. |
| React | 19.2.x | UI framework | Already standardized in STACK.md. Single `react` + `react-dom` install. |
| React Router | 7.13.x | Client-side routing (dashboard/goals/settings) | Simplified v7 API. Single `react-router` package. 4 routes total. |
| Tailwind CSS | 4.x | Utility-first CSS with `@tailwindcss/vite` plugin | Zero-config Vite plugin. `@theme` directive for brand colors. No `tailwind.config.js` needed. |
| Zustand | 5.0.x | Client state management (auth, dashboard, goals) | Minimal API, works outside React (needed for Tauri event handlers), selector subscriptions prevent unnecessary re-renders. |
| Vite | 6.x | Build tool / dev server | Battle-tested with Tauri v2. Pin to v6; v8 (Rolldown) is too new. |

### Supporting (Tauri Plugins)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @tauri-apps/plugin-store | 2.x | Persistent key-value storage for refresh tokens and preferences | Store refresh token, user preferences (window position, etc.). NOT encrypted by default -- see security notes. |
| @tauri-apps/plugin-positioner | 2.x | Position windows at well-known locations (tray center) | Anchor popover window to tray icon position on click. Requires `tray-icon` Cargo feature. |
| tauri-plugin-oauth | 2.0.x | Localhost redirect server for OAuth flow | Spawn temporary localhost server to capture Discord OAuth redirect. Avoids deep link complexity. |
| @tauri-apps/plugin-opener | 2.x | Open URLs in default browser | Open Discord OAuth authorization URL in system browser. |

### Supporting (Dev)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @vitejs/plugin-react | latest | Vite plugin for React Fast Refresh | Required for HMR in development. |
| @types/react | latest | React TypeScript types | TypeScript support for React 19. |
| @types/react-dom | latest | ReactDOM TypeScript types | TypeScript support for ReactDOM. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @tauri-apps/plugin-store | @tauri-apps/plugin-stronghold | Stronghold is deprecated and will be removed in Tauri v3. Use plugin-store instead. |
| tauri-plugin-oauth (localhost) | @tauri-apps/plugin-deep-link | Deep links require app to be installed (not dev mode), registration at install time on macOS, and command-line arg coordination on Windows. Localhost redirect is simpler and works in dev. |
| tauri-plugin-secure-storage | @tauri-apps/plugin-store | secure-storage uses OS keychain (ideal for secrets), but is a third-party plugin with low download count. plugin-store is official and sufficient when combined with app-level encryption. For a 10-25 user app, store is pragmatic. |
| React Query / TanStack Query | fetch + Zustand | Only ~5 API calls total. TanStack Query adds caching/refetching abstractions that are overkill. Simple fetch wrapper with Zustand stores is cleaner. |

**Installation (in apps/desktop/):**

```bash
# Tauri CLI (dev tool)
pnpm add -D @tauri-apps/cli

# Tauri API + plugins
pnpm add @tauri-apps/api @tauri-apps/plugin-store @tauri-apps/plugin-positioner @tauri-apps/plugin-opener

# tauri-plugin-oauth (community plugin, npm scope is different)
pnpm add @fabianlars/tauri-plugin-oauth

# React + routing
pnpm add react react-dom react-router

# State management
pnpm add zustand

# Styling
pnpm add -D @tailwindcss/vite tailwindcss

# Build tooling
pnpm add -D vite @vitejs/plugin-react typescript @types/react @types/react-dom

# Workspace dependency (in package.json manually)
# "@28k/shared": "workspace:*"
```

**Cargo.toml (src-tauri/Cargo.toml) dependencies:**

```toml
[dependencies]
tauri = { version = "2", features = ["tray-icon"] }
tauri-plugin-store = "2"
tauri-plugin-positioner = { version = "2", features = ["tray-icon"] }
tauri-plugin-opener = "2"
tauri-plugin-oauth = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

---

## Architecture Patterns

### Recommended Project Structure

```
apps/desktop/
  src/
    main.tsx               # React entry point
    App.tsx                # Router setup, auth gate
    index.css              # Tailwind @import + @theme (brand colors)
    api/
      client.ts            # Fetch wrapper with JWT auth + auto-refresh
    stores/
      auth-store.ts        # Zustand: user, tokens, login/logout
      dashboard-store.ts   # Zustand: dashboard data, loading state
      goals-store.ts       # Zustand: goal hierarchy, expand/collapse state
    pages/
      LoginPage.tsx        # Discord OAuth login screen
      DashboardPage.tsx    # Main dashboard view
      GoalsPage.tsx        # Goal hierarchy tree view
    components/
      layout/
        AppShell.tsx       # Sidebar nav + content area
        Sidebar.tsx        # Nav links (Dashboard, Goals, Settings)
      dashboard/
        PriorityList.tsx   # Today's priorities card
        WeeklyGoals.tsx    # Weekly goals card
        StreakBadge.tsx     # Streak display with fire icon
        RankProgress.tsx   # Rank name + XP progress bar
        DailyQuote.tsx     # Operator quote card
      goals/
        GoalTree.tsx       # Recursive tree container
        GoalNode.tsx       # Single goal with expand/collapse + progress
        ProgressBar.tsx    # Horizontal progress bar (reusable)
      common/
        Button.tsx         # Styled button
        Card.tsx           # Dark card with gold border option
        LoadingSpinner.tsx # Loading state
  src-tauri/
    src/
      lib.rs              # Tauri setup: plugins, tray, window config
    tauri.conf.json        # App config: windows, tray, build commands
    capabilities/
      default.json        # Plugin permissions
    icons/
      icon.png            # App icon (1024x1024 gold ouroboros)
      tray-icon.png       # Tray icon (32x32 or 64x64 gold ouroboros)
      icon.icns           # macOS app icon (generated)
      icon.ico            # Windows app icon (generated)
  package.json
  tsconfig.json
  vite.config.ts
```

### Pattern 1: Tauri App Setup in Monorepo

**What:** Initialize the Tauri project within the existing `apps/desktop` directory.
**When to use:** Setting up the desktop app for the first time.

```bash
# From project root, navigate to apps/desktop and scaffold
cd apps/desktop
pnpm create tauri-app . --template react-ts
```

Alternatively, initialize manually by creating the Vite + React project structure and then running `pnpm tauri init` to add `src-tauri/`.

**vite.config.ts:**
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  build: {
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
});
```

**tauri.conf.json (key sections):**
```json
{
  "productName": "28K HQ",
  "identifier": "com.28khq.desktop",
  "build": {
    "beforeDevCommand": "pnpm dev",
    "beforeBuildCommand": "pnpm build",
    "devUrl": "http://localhost:1420",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "label": "main",
        "title": "28K HQ",
        "width": 1000,
        "height": 700,
        "resizable": true,
        "visible": true,
        "decorations": true,
        "backgroundThrottling": "disabled"
      }
    ],
    "trayIcon": {
      "id": "main",
      "iconPath": "icons/tray-icon.png",
      "iconAsTemplate": true,
      "tooltip": "28K HQ",
      "showMenuOnLeftClick": false
    },
    "security": {
      "csp": "default-src 'self'; connect-src 'self' http://localhost:3001 https://api.28khq.com; img-src 'self' https://cdn.discordapp.com"
    }
  },
  "bundle": {
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.icns", "icons/icon.ico"]
  }
}
```

### Pattern 2: System Tray with Popover Window

**What:** Gold ouroboros icon in menu bar; left-click opens a small popover window anchored to the tray icon.
**When to use:** APP-02, APP-03.

**Rust setup (lib.rs):**
```rust
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_oauth::init())
        .setup(|app| {
            // Build tray menu
            let quit = MenuItem::with_id(app, "quit", "Quit 28K HQ", true, None::<&str>)?;
            let show = MenuItem::with_id(app, "show", "Show Dashboard", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;

            // Build tray icon
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => app.exit(0),
                    "show" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    // Feed positioner plugin the tray event
                    tauri_plugin_positioner::on_tray_event(tray.app_handle(), &event);

                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("main") {
                            if win.is_visible().unwrap_or(false) {
                                let _ = win.hide();
                            } else {
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### Pattern 3: Discord OAuth Flow (Localhost Redirect)

**What:** Open Discord OAuth in system browser, capture redirect on localhost, exchange code via API.
**When to use:** AUTH-04 login flow.

```typescript
// src/api/auth.ts
import { start, cancel } from '@fabianlars/tauri-plugin-oauth';
import { open } from '@tauri-apps/plugin-opener';
import { load } from '@tauri-apps/plugin-store';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const DISCORD_CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID;

function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function loginWithDiscord(): Promise<{
  accessToken: string;
  refreshToken: string;
  member: { id: string; displayName: string; discordId: string; avatar: string | null };
}> {
  // 1. Start localhost server to capture redirect
  const port = await start({ ports: [28457] });
  const redirectUri = `http://127.0.0.1:${port}`;

  // 2. Generate PKCE pair
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  // 3. Open Discord OAuth in browser
  const authUrl = new URL('https://discord.com/oauth2/authorize');
  authUrl.searchParams.set('client_id', DISCORD_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'identify');
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  await open(authUrl.toString());

  // 4. Wait for redirect with authorization code
  const callbackUrl = await new Promise<string>((resolve) => {
    // tauri-plugin-oauth emits the redirect URL
    // The onUrl callback receives it
  });

  // 5. Extract code from callback URL
  const url = new URL(callbackUrl);
  const code = url.searchParams.get('code');
  if (!code) throw new Error('No authorization code received');

  // 6. Cancel the localhost server
  await cancel(port);

  // 7. Exchange code via our API (server-side token exchange)
  const response = await fetch(`${API_BASE}/auth/discord`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, codeVerifier, redirectUri }),
  });

  if (!response.ok) throw new Error('Token exchange failed');

  const data = await response.json();

  // 8. Store refresh token persistently
  const store = await load('auth.json', { autoSave: true });
  await store.set('refreshToken', data.refreshToken);
  await store.save();

  return data;
}
```

### Pattern 4: API Client with JWT Auto-Refresh

**What:** Fetch wrapper that attaches JWT, auto-refreshes on 401.
**When to use:** All authenticated API calls from the desktop app.

```typescript
// src/api/client.ts
import { load } from '@tauri-apps/plugin-store';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

async function refreshAccessToken(): Promise<string | null> {
  const store = await load('auth.json', { autoSave: false });
  const refreshToken = await store.get<string>('refreshToken');
  if (!refreshToken) return null;

  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) {
    // Refresh token expired -- user must re-login
    await store.delete('refreshToken');
    await store.save();
    return null;
  }

  const data = await res.json();

  // Store rotated refresh token
  await store.set('refreshToken', data.refreshToken);
  await store.save();

  accessToken = data.accessToken;
  return data.accessToken;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  let res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  // Auto-refresh on 401
  if (res.status === 401 && accessToken) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers.set('Authorization', `Bearer ${newToken}`);
      res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    }
  }

  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}
```

### Pattern 5: Zustand Store Structure

**What:** Three stores for auth, dashboard, and goals state.
**When to use:** All React components that need app state.

```typescript
// src/stores/auth-store.ts
import { create } from 'zustand';
import { setAccessToken } from '../api/client';

interface AuthState {
  user: { id: string; displayName: string; discordId: string; avatar: string | null } | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (user: AuthState['user'], accessToken: string) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true, // true initially while checking stored tokens
  login: (user, accessToken) => {
    setAccessToken(accessToken);
    set({ user, isAuthenticated: true, isLoading: false });
  },
  logout: () => {
    setAccessToken(null);
    set({ user: null, isAuthenticated: false, isLoading: false });
  },
  setLoading: (isLoading) => set({ isLoading }),
}));
```

```typescript
// src/stores/dashboard-store.ts
import { create } from 'zustand';
import { apiFetch } from '../api/client';

interface DashboardData {
  member: {
    displayName: string;
    totalXp: number;
    currentStreak: number;
    longestStreak: number;
    rank: string;
    rankColor: number;
    nextRank: string;
  };
  goals: { today: Goal[]; weekly: Goal[] };
  timer: TimerSession | null;
  todayCheckins: number;
  quote: { text: string; author: string };
}

interface DashboardState {
  data: DashboardData | null;
  isLoading: boolean;
  error: string | null;
  fetchDashboard: () => Promise<void>;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  data: null,
  isLoading: false,
  error: null,
  fetchDashboard: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await apiFetch<DashboardData>('/dashboard');
      set({ data, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },
}));
```

### Pattern 6: Tailwind CSS 4 Dark+Gold Theme

**What:** Single dark theme with gold accents using CSS-first config.
**When to use:** APP-05 brand styling.

```css
/* src/index.css */
@import "tailwindcss";

@theme {
  /* Brand colors from @28k/shared BRAND_COLORS */
  --color-brand: #f59e0b;          /* primary gold (0xf59e0b) */
  --color-brand-light: #fbbf24;    /* lighter gold for hover states */
  --color-brand-dim: #b45309;      /* darker gold for borders */
  --color-success: #22c55e;        /* green */
  --color-error: #ef4444;          /* red */
  --color-info: #3b82f6;           /* blue */

  /* Dark theme surface colors */
  --color-surface-base: #0f0f0f;   /* deepest background */
  --color-surface-1: #1a1a1a;      /* card backgrounds */
  --color-surface-2: #262626;      /* elevated surfaces */
  --color-surface-3: #333333;      /* hover states */

  /* Text colors */
  --color-text-primary: #f5f5f5;   /* main text */
  --color-text-secondary: #a3a3a3; /* muted text */
  --color-text-tertiary: #737373;  /* disabled/hint text */

  /* Border */
  --color-border: #333333;
  --color-border-brand: #f59e0b40; /* gold with 25% opacity */

  /* Rank colors (from RANK_PROGRESSION) */
  --color-rank-rookie: #9e9e9e;
  --color-rank-grinder: #4caf50;
  --color-rank-hustler: #2196f3;
  --color-rank-boss: #9c27b0;
  --color-rank-mogul: #ff9800;
  --color-rank-legend: #ffd700;
}

body {
  @apply bg-surface-base text-text-primary;
  font-family: system-ui, -apple-system, sans-serif;
}
```

Usage in components:
```tsx
<div className="bg-surface-1 border border-border rounded-lg p-4">
  <h2 className="text-brand font-bold">Today's Priorities</h2>
  <p className="text-text-secondary">Your weekly focus areas</p>
</div>
```

### Anti-Patterns to Avoid

- **Deep links for OAuth:** Deep links only work when the app is installed (not in `tauri dev`). Use localhost redirect via `tauri-plugin-oauth` for both dev and production.
- **Stronghold for token storage:** `@tauri-apps/plugin-stronghold` is deprecated and will be removed in Tauri v3. Use `@tauri-apps/plugin-store` instead.
- **Access token in persistent storage:** Store the access token (15min TTL) in memory only (Zustand store). Only the refresh token (30 days) goes to persistent storage.
- **Direct Prisma/DB imports from desktop:** The desktop app MUST NOT depend on `@28k/db`. It depends only on `@28k/shared` (for types, constants, brand colors). All data comes through the API.
- **React Query / TanStack Query:** Overkill for 5 API calls. Simple fetch wrapper + Zustand is cleaner.
- **Building a custom tree component from scratch for goals:** Use a recursive React component pattern. No third-party tree library needed, but do NOT try to make it editable in this phase (goals are read-only).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OAuth localhost redirect | Custom http server for OAuth callback | `tauri-plugin-oauth` | Handles port selection, cleanup, callback capture. Rolling your own means managing server lifecycle, port conflicts, and cross-platform socket binding. |
| Window positioning near tray | Manual screen coordinate math | `tauri-plugin-positioner` with `Position::TrayCenter` | Handles multi-monitor, DPI scaling, tray position detection on both macOS and Windows. |
| PKCE code challenge | Custom crypto implementation | Web Crypto API (`crypto.subtle.digest`) | Available in Tauri's webview. Handles SHA-256 hashing for S256 code challenge. |
| Icon generation | Manual resizing to all platform sizes | `pnpm tauri icon` CLI command | Generates `.icns`, `.ico`, and all PNG sizes from a single 1024x1024 source. |
| Progress bar | Custom SVG circle animation | HTML `<div>` with width percentage + Tailwind classes | Linear progress bars are trivial with `w-[${pct}%]`. No library needed. |
| Tree expand/collapse | Custom DOM manipulation | React state + conditional rendering | `expanded` state per node ID in Zustand store. Recursive component handles rendering. |

**Key insight:** The complexity in this phase is in the integration plumbing (Tauri setup, OAuth flow, API client, tray behavior), NOT in the UI components. Dashboard and goals views are straightforward React components consuming API data.

---

## Common Pitfalls

### Pitfall 1: Background Throttling Kills Timer Display

**What goes wrong:** Tauri uses a WebView that by default suspends all JavaScript timers when the window is minimized or hidden. For a tray app where the window is hidden most of the time, `setInterval` and `setTimeout` stop firing.
**Why it happens:** WebKit applies `inactiveSchedulingPolicy: suspend` by default. No visible window = background tab behavior.
**How to avoid:** Set `"backgroundThrottling": "disabled"` in every window config in `tauri.conf.json`. This is mandatory even though this phase does not implement the timer -- the dashboard may have auto-refresh, and future phases add the timer.
**Warning signs:** Data that appears stale after restoring the window.

### Pitfall 2: CORS Mismatch Between Dev and Production

**What goes wrong:** During development, the Vite dev server runs on `http://localhost:1420`. The API CORS plugin (`apps/api/src/plugins/cors.ts`) already includes `http://localhost:1420`, `tauri://localhost`, and `https://tauri.localhost`. But production Tauri apps use `https://tauri.localhost` as the origin (macOS) or `http://tauri.localhost` (Windows). If the origin is wrong, every API call fails silently with CORS errors.
**Why it happens:** Tauri's origin changes between dev mode and production builds, and differs by OS.
**How to avoid:** The CORS plugin already has all four origins configured. Verify in production build testing. Also add the API URL to the CSP in `tauri.conf.json`.
**Warning signs:** `fetch()` calls fail with "CORS error" only in production builds.

### Pitfall 3: OAuth Redirect Port Conflict

**What goes wrong:** `tauri-plugin-oauth` spawns a localhost server on a specified port. If the port is in use by another app, the OAuth flow fails.
**Why it happens:** Desktop environments have many services binding ports.
**How to avoid:** Configure multiple fallback ports: `{ ports: [28457, 28458, 28459] }`. The plugin tries each in order.
**Warning signs:** "Address already in use" errors during OAuth login.

### Pitfall 4: Tray Icon Not Visible on macOS Dark Menu Bar

**What goes wrong:** A colored (gold) PNG icon may be invisible or ugly on macOS's dark menu bar. macOS expects "template" images (monochrome with alpha) for menu bar items.
**Why it happens:** macOS menu bar icons should use template rendering (`iconAsTemplate: true`) which recolors the icon to match the menu bar appearance (white on dark, black on light). A gold icon would lose its brand color.
**How to avoid:** Create TWO icon variants: (1) a template icon (monochrome ouroboros silhouette) for macOS menu bar set with `iconAsTemplate: true`, and (2) a gold-colored icon for the app window icon and Windows tray. The tray config in `tauri.conf.json` points to the template version. The app icon (`bundle.icon`) uses the full-color version.
**Warning signs:** Tray icon appears as a solid black blob or is invisible.

### Pitfall 5: Vite Version Incompatibility with Tauri

**What goes wrong:** Vite 8 (released March 17, 2026) replaces esbuild+Rollup with Rolldown. Tauri v2's integration is tested with Vite 6/7.
**Why it happens:** Vite 8 is 4 days old. Breaking changes are possible.
**How to avoid:** Pin to Vite 6.x. Do NOT upgrade to Vite 8 for this phase.
**Warning signs:** Build errors in `tauri build`, HMR failures in `tauri dev`.

### Pitfall 6: Window Close Quits the App

**What goes wrong:** By default, closing the main window quits the Tauri app. For a tray app, closing the window should hide it, not quit.
**Why it happens:** Standard desktop app behavior is to quit on window close.
**How to avoid:** Handle the `close_requested` event on the window to hide instead of close. In Rust: use `window.on_window_event()` to catch `WindowEvent::CloseRequested` and call `window.hide()` instead. In the React frontend, use `getCurrentWindow().onCloseRequested()` to prevent default and hide.
**Warning signs:** App disappears from tray when user closes the main window.

---

## Code Examples

### Tray Icon Configuration (tauri.conf.json)

```json
{
  "app": {
    "trayIcon": {
      "id": "main",
      "iconPath": "icons/tray-icon.png",
      "iconAsTemplate": true,
      "tooltip": "28K HQ",
      "showMenuOnLeftClick": false
    }
  }
}
```

### Capabilities Configuration (src-tauri/capabilities/default.json)

```json
{
  "identifier": "default",
  "description": "Default capabilities for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "store:default",
    "positioner:default",
    "opener:default"
  ]
}
```

### React Router Setup (App.tsx)

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { useAuthStore } from './stores/auth-store';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import GoalsPage from './pages/GoalsPage';

function App() {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) return <LoadingScreen />;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={
          isAuthenticated ? <Navigate to="/" /> : <LoginPage />
        } />
        <Route path="/" element={
          isAuthenticated ? <DashboardPage /> : <Navigate to="/login" />
        } />
        <Route path="/goals" element={
          isAuthenticated ? <GoalsPage /> : <Navigate to="/login" />
        } />
      </Routes>
    </BrowserRouter>
  );
}
```

### Recursive Goal Tree Component

```tsx
// src/components/goals/GoalNode.tsx
interface GoalNodeProps {
  goal: Goal;
  depth: number;
}

function GoalNode({ goal, depth }: GoalNodeProps) {
  const [expanded, setExpanded] = useState(depth < 2); // auto-expand first 2 levels
  const hasChildren = goal.children && goal.children.length > 0;

  const progress = goal.type === 'MEASURABLE' && goal.targetValue
    ? Math.round((goal.currentValue / goal.targetValue) * 100)
    : goal.status === 'COMPLETED' ? 100 : 0;

  return (
    <div style={{ marginLeft: `${depth * 20}px` }}>
      <div className="flex items-center gap-2 py-2">
        {hasChildren && (
          <button onClick={() => setExpanded(!expanded)} className="text-text-secondary">
            {expanded ? '>' : 'v'}
          </button>
        )}
        <span className="text-text-primary flex-1">{goal.title}</span>
        <div className="w-24">
          <ProgressBar value={progress} />
        </div>
      </div>
      {expanded && hasChildren && goal.children.map((child: Goal) => (
        <GoalNode key={child.id} goal={child} depth={depth + 1} />
      ))}
    </div>
  );
}
```

### Window Hide on Close (React side)

```typescript
// In App.tsx or main.tsx setup
import { getCurrentWindow } from '@tauri-apps/api/window';

const appWindow = getCurrentWindow();
appWindow.onCloseRequested(async (event) => {
  event.preventDefault();
  await appWindow.hide();
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `tailwind.config.js` | CSS `@theme` directive in Tailwind 4 | January 2025 | No JS config file needed. Colors defined in CSS. |
| Tauri Stronghold for secrets | `tauri-plugin-store` (Stronghold deprecated) | Tauri v2.x, 2025 | Stronghold will be removed in v3. Use store or keyring. |
| `react-router-dom` package | Single `react-router` package | React Router v7 | No separate DOM package needed. |
| `create()(...)` Zustand v4 | `create<T>()((set) => ...)` Zustand v5 | Zustand v5, 2024 | Simplified generics syntax. |
| Vite 6/7 (esbuild + Rollup) | Vite 8 (Rolldown + Oxc) | March 17, 2026 | Too new for Tauri. Pin to Vite 6.x. |
| `@tauri-apps/plugin-deep-link` for OAuth | `tauri-plugin-oauth` (localhost redirect) | Community consensus | Deep links only work in installed apps, not dev mode. Localhost is more reliable. |

**Deprecated/outdated:**
- `@tauri-apps/plugin-stronghold`: Deprecated, will be removed in Tauri v3. Do not use.
- `tailwind.config.js`: Replaced by CSS `@theme` directive in Tailwind v4.
- `react-router-dom`: Merged into single `react-router` package in v7.

---

## Open Questions

1. **Gold ouroboros icon source file**
   - What we know: No icon file exists in the repository yet. Tray icons need a 1024x1024 source PNG for `tauri icon` generation, plus a separate template (monochrome) PNG for macOS tray.
   - What's unclear: Where the ouroboros logo design will come from (user provides SVG/PNG, or generated).
   - Recommendation: Create a placeholder gold circle icon for development. The user provides the real ouroboros design. The `pnpm tauri icon` command generates all sizes from the source.

2. **`tauri-plugin-oauth` callback URL handling**
   - What we know: The plugin spawns a localhost server and receives the redirect. The API's Discord route expects `code`, `codeVerifier`, and `redirectUri` in the POST body.
   - What's unclear: The exact mechanism by which `tauri-plugin-oauth` passes the callback URL back to JS. The `onUrl` callback in the npm package API should receive the full redirect URL with query params.
   - Recommendation: Test the OAuth flow early in development. The callback URL parsing is the most fragile part of the auth integration.

3. **AUTH-04 interpretation: "OS keychain" vs plugin-store**
   - What we know: The requirement says "Tauri secure storage (OS keychain)." The official `plugin-store` stores unencrypted JSON files. The third-party `tauri-plugin-secure-storage` wraps the OS keychain but has very low adoption (34 downloads/month).
   - What's unclear: Whether the user strictly requires OS keychain integration or accepts encrypted file storage.
   - Recommendation: Use `@tauri-apps/plugin-store` for the refresh token (official, well-supported). The store file is scoped to the app's data directory which requires app-level access. For a 10-25 user friend group app, this is pragmatic security. If stricter keychain storage is needed, it can be added later via `tauri-plugin-keyring`.

---

## Sources

### Primary (HIGH confidence)
- [Tauri v2 Create Project](https://v2.tauri.app/start/create-project/) -- Scaffolding commands, template selection
- [Tauri v2 Vite Frontend Config](https://v2.tauri.app/start/frontend/vite/) -- vite.config.ts structure, HMR settings, port config
- [Tauri v2 System Tray](https://v2.tauri.app/learn/system-tray/) -- TrayIconBuilder, menu events, click handlers, JavaScript API
- [Tauri v2 Configuration Reference](https://v2.tauri.app/reference/config/) -- tauri.conf.json schema, window options, tray config
- [Tauri v2 Config Schema](https://schema.tauri.app/config/2) -- backgroundThrottling values, window properties
- [Tauri v2 App Icons](https://v2.tauri.app/develop/icons/) -- `tauri icon` command, platform icon requirements
- [Tauri v2 Positioner Plugin](https://v2.tauri.app/plugin/positioner/) -- Installation, tray-relative positioning, JS API
- [Tauri v2 Store Plugin](https://v2.tauri.app/plugin/store/) -- Persistent KV storage, JS API, permissions
- [Tailwind CSS v4 Announcement](https://tailwindcss.com/blog/tailwindcss-v4) -- `@import "tailwindcss"`, `@theme` directive, Vite plugin setup
- [tauri-plugin-oauth GitHub](https://github.com/FabianLars/tauri-plugin-oauth) -- Localhost redirect pattern, Rust/JS API, port configuration
- STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md -- Project-internal research documents (reviewed in full)
- Phase 15 summaries (15-01, 15-02) -- API endpoints, auth flow, route structure

### Secondary (MEDIUM confidence)
- [Building a System Tray App with Tauri](https://tauritutorials.com/blog/building-a-system-tray-app-with-tauri) -- Popover pattern, window hide on close, skip taskbar
- [Tauri v2 Multi-Window Guide (Oflight)](https://www.oflight.co.jp/en/columns/tauri-v2-multi-window-system-tray) -- Multi-window management, tray integration
- [Tauri Background Throttling Feature](https://github.com/tauri-apps/tauri/issues/5250) -- backgroundThrottling config, platform support
- [Tauri Monorepo Discussion](https://github.com/orgs/tauri-apps/discussions/7368) -- Tauri in monorepo context

### Tertiary (LOW confidence)
- [tauri-plugin-secure-storage crates.io](https://crates.io/crates/tauri-plugin-secure-storage) -- OS keychain wrapper. Low adoption (34 downloads/month). Needs validation if strict keychain requirement.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All libraries verified via official docs, versions confirmed, compatibility validated in project research
- Architecture: HIGH -- Patterns follow Tauri v2 official docs, React community conventions, and project-established monorepo structure
- Pitfalls: HIGH -- Verified against Tauri GitHub issues, official docs, and project PITFALLS.md research
- OAuth flow: MEDIUM -- tauri-plugin-oauth JS API callback mechanism needs runtime validation; concept is proven but exact callback wiring should be tested early

**Research date:** 2026-03-21
**Valid until:** 2026-04-21 (30 days -- stack is stable)
