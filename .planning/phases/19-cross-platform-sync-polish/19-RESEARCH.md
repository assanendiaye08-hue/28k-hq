# Phase 19: Cross-Platform Sync + Polish - Research

**Researched:** 2026-03-22
**Domain:** Tauri v2 plugins (updater, autostart, process), dashboard reactivity, settings persistence
**Confidence:** HIGH

## Summary

Phase 19's actual scope is narrow: four requirements that need new code (APP-06, APP-07, DASH-06, and a Settings page), while the SYNC requirements (SYNC-01 through SYNC-04) and GOAL-06 are already satisfied by the shared API/DB architecture. SYNC-02 (bot DM on timer complete) is explicitly skipped.

The implementation centers on three Tauri v2 official plugins (`tauri-plugin-updater`, `tauri-plugin-autostart`, `tauri-plugin-process`) plus a dashboard refresh mechanism. All three plugins follow the same installation pattern already used in this project (Cargo dependency + JS bindings + capabilities permissions). Settings persistence uses the existing `@tauri-apps/plugin-store` pattern from timer-persistence.ts.

Dashboard auto-refresh (DASH-06) is best implemented by having the timer store and goals store call `fetchDashboard()` after state-changing API calls complete, rather than polling. This is event-driven, zero-latency for local changes, and requires no new infrastructure.

**Primary recommendation:** Add three Tauri plugins (updater, autostart, process), create a settings store persisted to plugin-store, build a Settings page with two toggles, and wire dashboard refresh into existing store actions.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SYNC-01 | Timer started in desktop visible to bot | ALREADY SATISFIED -- shared API/DB, no new code |
| SYNC-02 | Timer completed triggers bot DM | SKIPPED -- app shows transition screen instead |
| SYNC-03 | One active timer enforced cross-platform | ALREADY SATISFIED -- API enforces single active timer per member |
| SYNC-04 | Goals visible cross-platform | ALREADY SATISFIED -- shared API/DB |
| GOAL-06 | Goal changes sync bidirectionally | ALREADY SATISFIED -- shared API/DB |
| DASH-06 | Dashboard updates when timer completes or goals change | Dashboard store refresh wired into timer-store and goals-store actions |
| APP-06 | Auto-updater via GitHub Releases (opt-in, OFF by default) | tauri-plugin-updater + tauri-plugin-process + signing keys |
| APP-07 | Autostart on login (opt-in, OFF by default) | tauri-plugin-autostart with MacosLauncher::LaunchAgent |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| tauri-plugin-updater | 2.x | Check for and install app updates from GitHub Releases | Official Tauri plugin, supports static JSON endpoints |
| tauri-plugin-autostart | 2.x | Register/unregister app for system login startup | Official Tauri plugin, handles macOS LaunchAgent and Windows registry |
| tauri-plugin-process | 2.x | Relaunch app after update installation | Official Tauri plugin, provides `relaunch()` for post-update restart |
| @tauri-apps/plugin-store | 2.x (already installed) | Persist settings (autostart, auto-updater toggles) | Already used for timer-persistence.ts |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @tauri-apps/plugin-updater | 2.x | JS bindings for update check/download/install | Frontend update check logic |
| @tauri-apps/plugin-autostart | 2.x | JS bindings for enable/disable/isEnabled | Settings page toggle |
| @tauri-apps/plugin-process | 2.x | JS bindings for relaunch after update | Post-update restart |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Static GitHub Releases JSON | CrabNebula Cloud | More features but paid service, overkill for 10-25 users |
| Plugin-store for settings | Tauri FS + JSON file | Plugin-store already used, no reason to add a second persistence layer |

**Installation:**

Rust (run in `apps/desktop/src-tauri/`):
```bash
cargo add tauri-plugin-updater --target 'cfg(any(target_os = "macos", windows, target_os = "linux"))'
cargo add tauri-plugin-autostart --target 'cfg(any(target_os = "macos", windows, target_os = "linux"))'
cargo add tauri-plugin-process --target 'cfg(any(target_os = "macos", windows, target_os = "linux"))'
```

JavaScript (run in `apps/desktop/`):
```bash
pnpm add @tauri-apps/plugin-updater @tauri-apps/plugin-autostart @tauri-apps/plugin-process
```

## Architecture Patterns

### Recommended Project Structure
```
apps/desktop/src/
├── stores/
│   └── settings-store.ts     # New: persisted settings (autostart, auto-updater)
├── pages/
│   └── SettingsPage.tsx       # New: settings toggles
├── lib/
│   ├── settings-persistence.ts  # New: load/save settings to plugin-store
│   └── updater.ts              # New: check-for-update logic
├── components/
│   └── layout/
│       └── Sidebar.tsx         # Modified: add Settings nav item
└── App.tsx                     # Modified: add /settings route
```

### Pattern 1: Settings Persistence (same pattern as timer-persistence.ts)
**What:** Use `@tauri-apps/plugin-store` to persist user preferences
**When to use:** Any setting that must survive app restart
**Example:**
```typescript
// Source: Existing pattern in apps/desktop/src/lib/timer-persistence.ts
import { load } from '@tauri-apps/plugin-store';

export interface AppSettings {
  autoUpdateEnabled: boolean;   // OFF by default
  autoStartEnabled: boolean;    // OFF by default
}

const DEFAULTS: AppSettings = {
  autoUpdateEnabled: false,
  autoStartEnabled: false,
};

export async function loadSettings(): Promise<AppSettings> {
  const store = await load('settings.json', { defaults: {} });
  const saved = await store.get<AppSettings>('settings');
  return saved ?? DEFAULTS;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const store = await load('settings.json', { defaults: {} });
  await store.set('settings', settings);
  await store.save();
}
```

### Pattern 2: Updater Check (opt-in, user-triggered or startup)
**What:** Check GitHub Releases for new version, prompt user, download+install+relaunch
**When to use:** On app startup (if auto-update enabled) or manual check from settings
**Example:**
```typescript
// Source: https://v2.tauri.app/plugin/updater/
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export async function checkForUpdate(): Promise<{
  available: boolean;
  version?: string;
}> {
  const update = await check();
  if (!update) return { available: false };
  return { available: true, version: update.version };
}

export async function downloadAndInstallUpdate(): Promise<void> {
  const update = await check();
  if (!update) return;
  await update.downloadAndInstall();
  await relaunch();
}
```

### Pattern 3: Autostart Toggle
**What:** Enable/disable app launch at system login
**When to use:** Settings page toggle
**Example:**
```typescript
// Source: https://v2.tauri.app/plugin/autostart/
import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart';

export async function setAutostart(enabled: boolean): Promise<void> {
  if (enabled) {
    await enable();
  } else {
    await disable();
  }
}

export async function getAutostartStatus(): Promise<boolean> {
  return await isEnabled();
}
```

### Pattern 4: Dashboard Refresh on State Change
**What:** Trigger dashboard re-fetch when timer completes or goals change
**When to use:** After timer stop/completePhase API calls and goal create/update/complete
**Example:**
```typescript
// In timer-store.ts stop() and completePhase(), after API PATCH:
import { useDashboardStore } from './dashboard-store';

// After API call succeeds:
useDashboardStore.getState().fetchDashboard();

// In goals-store.ts, already calls fetchGoals() after mutations
// Add dashboard refresh too:
useDashboardStore.getState().fetchDashboard();
```

### Anti-Patterns to Avoid
- **Polling for dashboard updates:** Don't setInterval to refetch dashboard. The app knows exactly when data changes (timer stop, goal mutation) -- trigger refresh at those points.
- **Checking for updates on every app focus:** Too aggressive. Check once at startup (if enabled) and offer manual check in settings.
- **Storing autostart state only in plugin-store:** The OS is the source of truth for autostart. Always read from `isEnabled()`, not just the persisted setting.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Auto-update with signing | Custom download+verify+replace | tauri-plugin-updater | Signature verification, platform-specific installers, rollback |
| Login item registration | Custom launchd plist or registry key | tauri-plugin-autostart | Cross-platform (macOS LaunchAgent, Windows registry, Linux autostart) |
| App relaunch after update | process.exit + re-exec | tauri-plugin-process relaunch() | Handles platform-specific process replacement |
| Settings persistence | localStorage or custom JSON file | @tauri-apps/plugin-store | Already used in project, atomic writes, app data directory |

**Key insight:** All three features (updater, autostart, process) are solved by official Tauri plugins with well-documented APIs. There is zero custom platform code needed.

## Common Pitfalls

### Pitfall 1: Updater Key Not Set During Build
**What goes wrong:** Build succeeds but produces unsigned artifacts, updater can't verify them
**Why it happens:** `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` not exported before build
**How to avoid:** Generate keys once with `pnpm tauri signer generate -- -w ~/.tauri/28khq.key`, store in CI/env
**Warning signs:** No `.sig` files alongside build artifacts

### Pitfall 2: Version Mismatch Across Files
**What goes wrong:** Updater thinks current version is different than actual, either skipping updates or re-downloading same version
**Why it happens:** Version not synchronized between `tauri.conf.json`, `Cargo.toml`, and `package.json`
**How to avoid:** All three files MUST have the same version string
**Warning signs:** Update available notification for already-installed version

### Pitfall 3: Wrong Endpoint URL Format
**What goes wrong:** Updater can't find latest.json, silently fails
**Why it happens:** Using GitHub release page URL instead of raw download URL
**How to avoid:** Use `https://github.com/{user}/{repo}/releases/latest/download/latest.json`
**Warning signs:** Network error or 404 in updater check

### Pitfall 4: Autostart Init Without Args
**What goes wrong:** App launches at login with unexpected behavior
**Why it happens:** `tauri_plugin_autostart::init()` second arg is CLI args passed at startup
**How to avoid:** Pass `None` for args (no special flags needed), or use `Some(vec![])` for empty
**Warning signs:** App crashes or behaves differently on auto-launched startup

### Pitfall 5: Dashboard Refresh Race Condition
**What goes wrong:** Dashboard shows stale data after timer completion
**Why it happens:** Dashboard refresh fires before API has persisted the new data
**How to avoid:** Call `fetchDashboard()` AFTER the API PATCH/POST promise resolves, not before
**Warning signs:** XP not updating on dashboard after session complete

### Pitfall 6: Missing Capabilities Permissions
**What goes wrong:** JS calls to plugin APIs fail silently or throw permission errors
**Why it happens:** Tauri v2 requires explicit capability permissions for all plugin commands
**How to avoid:** Add all required permissions to `src-tauri/capabilities/default.json`
**Warning signs:** Console error about missing permissions

## Code Examples

### Rust Plugin Registration (lib.rs)
```rust
// Source: https://v2.tauri.app/plugin/updater/ + https://v2.tauri.app/plugin/autostart/
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_oauth::init())
        .plugin(tauri_plugin_notification::init())
        // New plugins:
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None, // no extra CLI args
        ))
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // ... existing tray setup
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### tauri.conf.json Updater Config
```json
{
  "plugins": {
    "updater": {
      "pubkey": "GENERATED_PUBLIC_KEY_HERE",
      "endpoints": [
        "https://github.com/OWNER/REPO/releases/latest/download/latest.json"
      ]
    }
  },
  "bundle": {
    "createUpdaterArtifacts": true
  }
}
```

### Capabilities Permissions (default.json additions)
```json
{
  "permissions": [
    "updater:default",
    "autostart:allow-enable",
    "autostart:allow-disable",
    "autostart:allow-is-enabled",
    "process:allow-restart"
  ]
}
```

### Dashboard Refresh Wiring (in timer-store.ts)
```typescript
// After API PATCH resolves in stop() and completePhase():
apiFetch(`/timer/${capturedSessionId}`, { ... })
  .then(() => {
    useDashboardStore.getState().fetchDashboard();
  })
  .catch(() => {});
```

### Dashboard Refresh Wiring (in goals-store.ts)
```typescript
// After goal mutations (createGoal, updateProgress, completeGoal):
// Already calls fetchGoals() -- add dashboard refresh:
import { useDashboardStore } from './dashboard-store';

// In createGoal, updateProgress, completeGoal:
await get().fetchGoals();
useDashboardStore.getState().fetchDashboard();
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Tauri v1 updater (built-in) | Tauri v2 updater (plugin) | Tauri v2 stable (2024) | Separate plugin install required |
| Tauri v1 autostart (community) | Official tauri-plugin-autostart v2 | Tauri v2 stable (2024) | Official support, consistent API |
| Polling dashboard | Event-driven refresh via store cross-calls | N/A (project pattern) | Zero unnecessary network requests |

**Deprecated/outdated:**
- Tauri v1 built-in updater API: replaced by `tauri-plugin-updater` in v2
- CrabNebula Cloud for small projects: free tier exists but adds unnecessary complexity for <25 users

## Open Questions

1. **GitHub Repository for Releases**
   - What we know: Updater needs a GitHub repo with releases containing latest.json
   - What's unclear: Which repo will host releases (current repo or dedicated distribution repo)
   - Recommendation: Use the existing project repo. Configure endpoint as `https://github.com/OWNER/REPO/releases/latest/download/latest.json`. Placeholder the URL in config for now.

2. **Signing Key Management**
   - What we know: Keys must be generated once and stored securely
   - What's unclear: Whether CI/CD or manual builds are used for releases
   - Recommendation: Generate keys now, store path in .env (not committed). Document the key generation step. Actual release pipeline is out of scope for this phase -- just wire the plugin.

3. **Public Key Placeholder**
   - What we know: `pubkey` field in tauri.conf.json needs the generated public key
   - What's unclear: Key hasn't been generated yet
   - Recommendation: Use a placeholder string like `"REPLACE_WITH_GENERATED_PUBKEY"` and document key generation as a pre-release step.

## Sources

### Primary (HIGH confidence)
- [Tauri v2 Updater Plugin Docs](https://v2.tauri.app/plugin/updater/) - Full setup guide, JS API, config schema
- [Tauri v2 Autostart Plugin Docs](https://v2.tauri.app/plugin/autostart/) - Init, JS API, permissions
- [Tauri v2 Process Plugin Docs](https://v2.tauri.app/plugin/process/) - relaunch() API
- [Tauri v2 Autostart JS Reference](https://v2.tauri.app/reference/javascript/autostart/) - enable/disable/isEnabled API

### Secondary (MEDIUM confidence)
- [Tauri Auto-Updater GitHub Guide](https://thatgurjot.com/til/tauri-auto-updater/) - Endpoint URL format, gotchas
- [tauri-plugin-autostart crates.io](https://crates.io/crates/tauri-plugin-autostart/versions) - Latest version 2.5.1
- [@tauri-apps/plugin-process npm](https://www.npmjs.com/package/@tauri-apps/plugin-process) - Latest version 2.3.1

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All official Tauri plugins with stable v2 releases
- Architecture: HIGH - Follows exact patterns already used in project (plugin-store, Zustand stores, capabilities)
- Pitfalls: HIGH - Well-documented in official Tauri docs and community guides
- Dashboard refresh: HIGH - Simple store cross-call, no new infrastructure

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (stable Tauri v2 plugin ecosystem, 30 days)
