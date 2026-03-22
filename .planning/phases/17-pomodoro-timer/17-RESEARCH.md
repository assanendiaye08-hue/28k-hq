# Phase 17: Pomodoro Timer - Research

**Researched:** 2026-03-22
**Domain:** Desktop pomodoro timer with menu bar integration, alarm transitions, API sync, and persistence (Tauri v2 + React 19 + Zustand)
**Confidence:** HIGH

## Summary

Phase 17 implements the full pomodoro timer -- the core feature of the desktop app. The timer runs as a client-side state machine in a Zustand store, updating the macOS menu bar countdown every second via `TrayIcon.setTitle()`, playing alarm sounds via HTML5 Audio on work/break transitions, and syncing completed sessions to the existing Fastify API for XP awards.

The most important architectural decision is that the **timer engine runs entirely in the frontend JavaScript** (not Rust). Background throttling is already disabled in `tauri.conf.json`, and the timestamp-based time calculation pattern (computing elapsed from `Date.now() - startedAt` rather than counting interval ticks) makes the timer robust against any scheduling jitter. The Rust side is only needed for tray title updates and window focus operations, both accessible via the existing Tauri JavaScript API.

For Windows, where `setTitle()` is a no-op on the system tray, the timer displays in a small frameless always-on-top mini-window created via `new WebviewWindow()`. On macOS, clicking the tray icon opens a popover-positioned window with timer controls. The `tauri-plugin-positioner` (already installed) handles positioning near the tray.

**Primary recommendation:** Build the timer as a pure Zustand store with `setInterval` + timestamp math, update tray title from the store's tick callback, and use the existing API endpoints (POST /timer, PATCH /timer/:id) for session lifecycle. No Rust modifications needed beyond adding the notification plugin.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TMR-01 | Configure pomodoro work duration (1-180 min, default 25) | Timer setup form with validation against TIMER_DEFAULTS from @28k/shared. Stored in Zustand timer store. |
| TMR-02 | Configure break duration (1-60 min, default 5) | Same setup form. TIMER_DEFAULTS.minBreakMinutes / maxBreakMinutes provide bounds. |
| TMR-03 | Configure number of sessions to chain (1-12, or unlimited) | API already accepts `targetSessions` in POST /timer. DB schema needs migration to add the field. Stored locally + sent to API on start. |
| TMR-04 | Configure long break duration and interval (e.g., 15 min every 4 sessions) | Requires new fields in timer store: `longBreakDuration` and `longBreakInterval`. Purely client-side logic -- when `pomodoroCount % longBreakInterval === 0`, use long break instead of normal break. Schema migration needed for persistence. |
| TMR-05 | Focus description required before starting | Timer setup form with required text input. Sent as `focus` field in POST /timer. API already accepts and stores it. |
| TMR-06 | Timer countdown displays in menu bar while running | macOS: `TrayIcon.setTitle("23:45")` updated every second from setInterval. Windows: frameless mini-window. Requires `tray:default` permission (already granted). |
| TMR-07 | Click menu bar timer opens popover with controls | Tray click handler creates/shows a positioned window via tauri-plugin-positioner `Position.TrayCenter`. Popover contains pause/stop/change focus UI. |
| TMR-08 | App foreground + alarm on work interval end | `window.show()` + `window.setFocus()` + `requestUserAttention()` brings window forward. HTML5 Audio plays bundled alarm sound. |
| TMR-09 | Auto-start break or manual button | Timer store setting `autoStartBreak: boolean`. When work ends: if true, immediately transition to break countdown; if false, show "Start Break" button in transition screen. |
| TMR-10 | App foreground + alarm on break end | Same mechanism as TMR-08. Transition screen shows "Resume Work" or auto-starts next work session based on `autoStartWork` setting. |
| TMR-11 | Session data syncs to API on completion | PATCH /timer/:id with action "stop" + totalWorkedMs/totalBreakMs/pomodoroCount. API awards XP and returns xpAwarded/leveledUp/newRank in response. |
| TMR-12 | Timer state persists across app restarts | Save timer state to `@tauri-apps/plugin-store` on every state change (start, pause, resume, phase transition). On app launch, check store + GET /timer/active for recovery. |
</phase_requirements>

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Zustand | 5.x | Timer state machine store | Already used for auth-store, dashboard-store, goals-store. Timer store follows same pattern. Works outside React components (critical for tray event handlers). |
| @tauri-apps/api | 2.10.x | TrayIcon.setTitle(), WebviewWindow, window.show/focus | Already installed. Provides all tray and window APIs needed. |
| @tauri-apps/plugin-store | 2.x | Persist timer state for restart recovery | Already installed and used for auth tokens. Same `load()`/`set()`/`save()` pattern. |
| @tauri-apps/plugin-positioner | 2.x | Position popover window near tray icon | Already installed. `moveWindow(Position.TrayCenter)` positions windows correctly. |
| @28k/shared | workspace | TIMER_DEFAULTS constants (min/max/default durations) | Already shared between bot and API. Desktop imports for validation ranges. |

### New (Must Add)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @tauri-apps/plugin-notification | 2.x | OS notification on phase transitions | Fallback notification when window is hidden. Supports custom sounds on macOS. |

### Nothing Else Needed
| Problem | Why No Library | Use Instead |
|---------|----------------|-------------|
| Audio playback | HTML5 `new Audio()` works perfectly in Tauri's webview | Bundle .mp3/.wav files in `public/sounds/`, play via `new Audio('/sounds/alarm.mp3')` |
| Timer state machine | Simple enough for a Zustand store with 5 states | No state machine library (XState is overkill for a linear state graph) |
| Progress ring SVG | Pure SVG with `stroke-dashoffset` animation | No charting library needed |
| Countdown formatting | `Math.floor(ms/60000)` + `(ms/1000%60).toString().padStart(2,'0')` | No date library needed for MM:SS |

**Installation:**
```bash
# In apps/desktop/
pnpm add @tauri-apps/plugin-notification

# In apps/desktop/src-tauri/Cargo.toml, add:
# tauri-plugin-notification = "2"

# In apps/desktop/src-tauri/src/lib.rs, add:
# .plugin(tauri_plugin_notification::init())
```

## Architecture Patterns

### Recommended Project Structure (New Files)
```
apps/desktop/src/
  stores/
    timer-store.ts         # Zustand timer state machine (core engine)
  pages/
    TimerPage.tsx           # Timer setup form + running timer display
  components/
    timer/
      TimerSetup.tsx        # Configuration form (work/break/sessions/focus)
      TimerDisplay.tsx      # Countdown ring + time display + controls
      TimerControls.tsx     # Pause/Resume/Stop/Change Focus buttons
      TimerTransition.tsx   # Work->Break or Break->Work transition screen
      ProgressRing.tsx      # SVG circular progress indicator
      SessionDots.tsx       # Visual session counter (dots/pills)
  hooks/
    use-timer-tick.ts       # setInterval hook that drives countdown + tray update
    use-timer-audio.ts      # Preloads and plays alarm sounds
    use-timer-persistence.ts # Saves/restores timer state to plugin-store
  lib/
    timer-tray.ts           # TrayIcon.getById + setTitle/setTooltip helpers
    timer-notifications.ts  # Window focus + alarm + notification on transitions
apps/desktop/src-tauri/
  src/lib.rs                # Add notification plugin registration
  capabilities/default.json # Add notification + tray permissions
apps/desktop/public/
  sounds/
    alarm-chime.mp3         # Default alarm sound (~50KB)
    alarm-bell.mp3          # Alternative alarm sound
    alarm-digital.mp3       # Alternative alarm sound
```

### Pattern 1: Timer State Machine (Zustand Store)

**What:** A single Zustand store manages the entire timer lifecycle. States: `idle`, `setup`, `working`, `on_break`, `paused`, `transition` (between work/break). The store holds all timer configuration and runtime state.

**When to use:** This is the only timer state management pattern for the app.

**Example:**
```typescript
// apps/desktop/src/stores/timer-store.ts
import { create } from 'zustand';

type TimerPhase = 'idle' | 'working' | 'on_break' | 'paused' | 'transition';

interface TimerConfig {
  workDuration: number;      // minutes
  breakDuration: number;     // minutes
  longBreakDuration: number; // minutes
  longBreakInterval: number; // every N sessions
  targetSessions: number | null;
  autoStartBreak: boolean;
  autoStartWork: boolean;
  focus: string;
  goalId: string | null;
}

interface TimerState {
  phase: TimerPhase;
  config: TimerConfig;
  // Runtime state
  sessionId: string | null;      // API session ID
  phaseStartedAt: number | null; // Date.now() when current phase started
  phaseDurationMs: number;       // Total duration of current phase in ms
  totalWorkedMs: number;
  totalBreakMs: number;
  pomodoroCount: number;
  prePausePhase: 'working' | 'on_break' | null;
  pauseRemainingMs: number | null;
  // Actions
  start: (config: TimerConfig) => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => Promise<void>;
  transitionToBreak: () => void;
  transitionToWork: () => void;
  tick: () => TimerTickResult;  // called every second
  restore: (saved: SavedTimerState) => void;
}
```

### Pattern 2: Timestamp-Based Countdown (Not Interval Counting)

**What:** Never count `setInterval` ticks to track time. Instead, store the `Date.now()` when each phase started and the total phase duration. On each tick, compute `remaining = phaseDurationMs - (Date.now() - phaseStartedAt)`. This is self-correcting: even if a tick fires late (50ms jitter, system sleep), the displayed time is always accurate.

**When to use:** Every time remaining time is calculated.

**Example:**
```typescript
// Inside the timer store's tick() method
tick: () => {
  const now = Date.now();
  const elapsed = now - state.phaseStartedAt!;
  const remaining = Math.max(0, state.phaseDurationMs - elapsed);

  if (remaining <= 0) {
    // Phase complete -- trigger transition
    return { remaining: 0, completed: true };
  }

  return { remaining, completed: false };
}
```

### Pattern 3: Tray Title Update from Store Subscription

**What:** A React hook or standalone function subscribes to the timer store and calls `TrayIcon.setTitle()` on each tick. On macOS this shows countdown text next to the tray icon. On Windows it is a no-op (handled by mini-window instead).

**When to use:** When the timer is in `working` or `on_break` phase.

**Example:**
```typescript
// apps/desktop/src/lib/timer-tray.ts
import { TrayIcon } from '@tauri-apps/api/tray';

let trayIcon: TrayIcon | null = null;

export async function updateTrayTitle(remainingMs: number | null) {
  if (!trayIcon) {
    trayIcon = await TrayIcon.getById('main');
  }
  if (!trayIcon) return;

  if (remainingMs === null || remainingMs <= 0) {
    await trayIcon.setTitle(null); // Clear title when idle
    return;
  }

  const minutes = Math.floor(remainingMs / 60000);
  const seconds = Math.floor((remainingMs % 60000) / 1000);
  const display = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  await trayIcon.setTitle(display);
}
```

### Pattern 4: Popover Window for Timer Controls

**What:** When the user clicks the tray icon during a running timer, show a small frameless window positioned near the tray with timer controls (pause/stop/change focus). This replaces the current main-window-toggle behavior during active timers.

**When to use:** When timer is active and user clicks tray.

**Example:**
```typescript
// Creating the popover window from JavaScript
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { moveWindow, Position } from '@tauri-apps/plugin-positioner';

async function showTimerPopover() {
  let popover = await WebviewWindow.getByLabel('timer-popover');

  if (!popover) {
    popover = new WebviewWindow('timer-popover', {
      url: '/timer-popover',       // React route for popover UI
      width: 320,
      height: 400,
      decorations: false,
      alwaysOnTop: true,
      resizable: false,
      skipTaskbar: true,
      focus: true,
    });

    // Wait for creation, then position near tray
    popover.once('tauri://created', async () => {
      await moveWindow(Position.TrayCenter);
    });
  } else {
    await popover.show();
    await popover.setFocus();
    await moveWindow(Position.TrayCenter);
  }
}
```

### Pattern 5: Windows Mini-Window Fallback

**What:** On Windows, `TrayIcon.setTitle()` does nothing (macOS-only). Instead, create a small frameless always-on-top window (120x40px) showing the countdown. Position it at the bottom-right of the screen using `setPosition()`.

**When to use:** Windows platform detection -- check `navigator.platform` or use `import { platform } from '@tauri-apps/plugin-os'`.

**Example:**
```typescript
// Windows timer display: tiny floating window
const miniWindow = new WebviewWindow('timer-mini', {
  url: '/timer-mini',  // Minimal page showing only "23:45"
  width: 140,
  height: 44,
  decorations: false,
  alwaysOnTop: true,
  resizable: false,
  skipTaskbar: true,
  transparent: true,
  x: screenWidth - 160,
  y: screenHeight - 60,
});
```

### Pattern 6: Alarm Sound via HTML5 Audio

**What:** Bundle alarm sound files in `public/sounds/`. Preload them on timer start using `new Audio()`. Play on phase transitions. HTML5 Audio works in Tauri's webview on both macOS (WKWebView) and Windows (WebView2).

**When to use:** On every work->break and break->work transition.

**Example:**
```typescript
// apps/desktop/src/hooks/use-timer-audio.ts
const alarmAudio = new Audio('/sounds/alarm-chime.mp3');
alarmAudio.preload = 'auto';

export function playAlarm() {
  alarmAudio.currentTime = 0;
  alarmAudio.play().catch(() => {
    // Autoplay may be blocked -- user interaction required first
    // In Tauri desktop apps this is rarely an issue
  });
}
```

### Pattern 7: Bring Window to Foreground on Transition

**What:** When a work or break interval completes, bring the main window to the foreground so the user sees the transition screen. Combine `show()` + `setFocus()` + `requestUserAttention()`.

**When to use:** TMR-08 and TMR-10 -- work end and break end.

**Example:**
```typescript
import { getCurrentWindow } from '@tauri-apps/api/window';

async function bringToForeground() {
  const win = getCurrentWindow();
  await win.show();
  await win.unminimize();
  await win.setFocus();
  await win.requestUserAttention(2); // 2 = Critical on Windows (flashes taskbar)
}
```

### Anti-Patterns to Avoid

- **Counting setInterval ticks for time tracking:** Never increment a counter in setInterval. Always compute from timestamps. Ticks can be delayed, bunched, or skipped.
- **Running timer logic in Rust:** The timer is a UI concern (display updates, sound playback, window focus). Rust commands add complexity without benefit since `backgroundThrottling: "disabled"` is already set.
- **Storing timer state only in memory:** Every state change must be persisted to `plugin-store` for restart recovery. Also sync to API for cross-platform visibility.
- **Using the notification plugin as the primary alarm mechanism:** Notifications can be dismissed, silenced, or blocked by system DND. Use HTML5 Audio for guaranteed sound + notifications as a supplementary fallback.
- **Creating a new Audio element on every alarm:** Preload the audio file once when timer starts. Reuse the same element, resetting `currentTime` to 0 before each play.
- **Polling the API for timer state:** The desktop app owns the timer state while it is running. Only call the API on start (POST), pause/resume/stop (PATCH), and on restore (GET /timer/active). Do not poll.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Window positioning near tray | Manual pixel math for screen edge detection | `@tauri-apps/plugin-positioner` with `Position.TrayCenter` | Already installed; handles multi-monitor, DPI, and tray position detection |
| OS notifications | Custom notification system | `@tauri-apps/plugin-notification` | Cross-platform, handles macOS notification center and Windows toast |
| Timer countdown formatting | Date library or duration parser | Inline `Math.floor(ms/60000)` + padStart | Two lines of math, no dependency needed |
| Audio playback | Tauri plugin or Rust audio | `new Audio('/sounds/file.mp3')` | HTML5 Audio works perfectly in webview, no native bridge needed |
| Persistent storage | IndexedDB or custom file IO | `@tauri-apps/plugin-store` | Already used for auth tokens, consistent API, handles file I/O and serialization |
| SVG progress ring | Canvas animation library | SVG `<circle>` with `stroke-dashoffset` CSS | 15 lines of SVG, standard pattern, no animation library needed |

**Key insight:** The timer is deceptively simple -- it is fundamentally a state machine with 5 states, a 1-second interval, and timestamp math. The complexity is not in the timer logic but in the platform integration (tray updates, window focus, sound, persistence, API sync). Each integration point has a Tauri API or plugin that handles it. Do not over-architect the timer engine.

## Common Pitfalls

### Pitfall 1: setTitle is macOS-Only
**What goes wrong:** `TrayIcon.setTitle()` sets text next to the tray icon on macOS. On Windows, it is silently a no-op -- Windows system tray only supports icons and tooltips, not arbitrary text.
**Why it happens:** macOS menu bar and Windows system tray have fundamentally different architectures.
**How to avoid:** Detect platform at startup. macOS: use `setTitle()`. Windows: create a frameless always-on-top mini-window (Pattern 5 above). Both platforms: update tooltip via `setTooltip()` as a supplementary display.
**Warning signs:** Timer works on dev Mac, Windows testers report "I can't see the countdown."

### Pitfall 2: Timer Freezes When Window Hidden
**What goes wrong:** Without `backgroundThrottling: "disabled"`, WebKit suspends JavaScript timers when the window is hidden. `setInterval` stops firing, countdown freezes.
**Why it happens:** Default webview behavior optimizes for battery life by throttling background tabs.
**How to avoid:** Already mitigated -- `backgroundThrottling: "disabled"` is set in `tauri.conf.json`. Additionally, always use timestamp-based time calculation (Pattern 2) so even delayed ticks show correct time.
**Warning signs:** Timer shows same time after restoring a hidden window.

### Pitfall 3: Timer State Lost on App Restart
**What goes wrong:** User has a running timer, app crashes or restarts, timer is gone.
**Why it happens:** Timer state exists only in Zustand (memory). Without persistence, it disappears on process exit.
**How to avoid:** On every state change (start, pause, resume, phase transition), save the full timer state to `plugin-store`. On app launch, check: (1) local store for saved state, (2) GET /timer/active for API state. Reconstruct the timer from whichever source has data.
**Warning signs:** Users report "my timer disappeared" after system updates or crashes.

### Pitfall 4: Race Condition with Bot Timer
**What goes wrong:** User starts timer on desktop, then someone triggers a timer via the Discord bot for the same member. Two active sessions exist simultaneously.
**Why it happens:** The bot and desktop app both call different code paths to create timers.
**How to avoid:** The API already enforces one-active-per-member (POST /timer returns 409 if active session exists). The desktop must always create timers via the API, never locally-only. The bot's internal timer also goes through the same DB check. This is already handled in `apps/api/src/routes/timer.ts`.
**Warning signs:** Two timer sessions in the database for the same member with `status: 'ACTIVE'`.

### Pitfall 5: Audio Autoplay Blocked
**What goes wrong:** The alarm sound doesn't play because the webview blocks autoplay without prior user interaction.
**Why it happens:** Browser autoplay policies require a user gesture before playing audio. Tauri webviews inherit this policy.
**How to avoid:** Play a silent audio clip (or the alarm at volume 0) on timer start (which is a user-initiated action). This "warms up" the audio context. Subsequent plays during transitions work without gesture requirements.
**Warning signs:** First alarm plays fine, subsequent ones fail; or alarm never plays at all.

### Pitfall 6: Schema Migration Required for New Fields
**What goes wrong:** TMR-03 needs `targetSessions` and TMR-04 needs `longBreakDuration`/`longBreakInterval` on the TimerSession model. These fields don't exist in the current Prisma schema.
**Why it happens:** The bot's timer engine tracks `targetSessions` in memory but it is not in the database schema. Long break configuration is entirely new.
**How to avoid:** Add a Prisma schema migration at the start of the phase: `targetSessions Int?`, `longBreakDuration Int?`, `longBreakInterval Int?`. Update the API's createTimerSchema to accept these fields. The bot already reads `targetSessions` from in-memory state -- the migration just persists it.
**Warning signs:** API returns 500 because the schema doesn't match the create payload.

### Pitfall 7: Popover Window Stacks or Duplicates
**What goes wrong:** Each tray click creates a new popover window instead of toggling the existing one.
**Why it happens:** `new WebviewWindow()` creates a new window every time. Without checking for an existing window first, duplicates accumulate.
**How to avoid:** Always call `WebviewWindow.getByLabel('timer-popover')` first. If it exists, toggle visibility. If not, create it. Close the popover on blur (focus lost) to keep the UX clean.
**Warning signs:** Multiple small windows appear in the taskbar or stack on screen.

## Code Examples

### Timer Store Skeleton
```typescript
// Source: Pattern based on existing Zustand stores in the project
import { create } from 'zustand';
import { apiFetch } from '../api/client';
import { TIMER_DEFAULTS } from '@28k/shared';

type TimerPhase = 'idle' | 'working' | 'on_break' | 'paused' | 'transition';

interface TimerStore {
  phase: TimerPhase;
  sessionId: string | null;
  phaseStartedAt: number | null;
  phaseDurationMs: number;
  totalWorkedMs: number;
  totalBreakMs: number;
  pomodoroCount: number;
  prePausePhase: 'working' | 'on_break' | null;
  pauseRemainingMs: number | null;
  // Config
  workDuration: number;
  breakDuration: number;
  longBreakDuration: number;
  longBreakInterval: number;
  targetSessions: number | null;
  autoStartBreak: boolean;
  autoStartWork: boolean;
  focus: string;
  goalId: string | null;
  // Computed
  getRemainingMs: () => number;
  isLongBreak: () => boolean;
  // Actions
  start: (config: Partial<TimerStore>) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: () => Promise<void>;
  completePhase: () => void;
}

export const useTimerStore = create<TimerStore>((set, get) => ({
  phase: 'idle',
  sessionId: null,
  phaseStartedAt: null,
  phaseDurationMs: 0,
  totalWorkedMs: 0,
  totalBreakMs: 0,
  pomodoroCount: 0,
  prePausePhase: null,
  pauseRemainingMs: null,
  workDuration: TIMER_DEFAULTS.defaultWorkMinutes,
  breakDuration: TIMER_DEFAULTS.defaultBreakMinutes,
  longBreakDuration: 15,
  longBreakInterval: 4,
  targetSessions: null,
  autoStartBreak: false,
  autoStartWork: false,
  focus: '',
  goalId: null,

  getRemainingMs: () => {
    const { phase, phaseStartedAt, phaseDurationMs, pauseRemainingMs } = get();
    if (phase === 'paused') return pauseRemainingMs ?? 0;
    if (!phaseStartedAt) return 0;
    return Math.max(0, phaseDurationMs - (Date.now() - phaseStartedAt));
  },

  isLongBreak: () => {
    const { pomodoroCount, longBreakInterval } = get();
    return longBreakInterval > 0 && pomodoroCount > 0 && pomodoroCount % longBreakInterval === 0;
  },

  start: async (config) => {
    // 1. Set config from form
    // 2. POST /timer to create API session
    // 3. Set phase to 'working', phaseStartedAt, phaseDurationMs
    // 4. Save to plugin-store for persistence
  },

  pause: async () => {
    // 1. Calculate remaining ms from timestamp
    // 2. Accumulate worked/break time
    // 3. PATCH /timer/:id with action 'pause'
    // 4. Save to plugin-store
  },

  resume: async () => {
    // 1. PATCH /timer/:id with action 'resume'
    // 2. Restore pre-pause phase with remaining ms
    // 3. Save to plugin-store
  },

  stop: async () => {
    // 1. PATCH /timer/:id with action 'stop'
    // 2. Handle XP response (show award in UI)
    // 3. Reset to idle
    // 4. Clear plugin-store timer data
    // 5. Clear tray title
  },

  completePhase: () => {
    // 1. If working -> transition to break (or long break)
    // 2. If on_break -> transition to work (or complete if targetSessions reached)
    // 3. Play alarm, bring window to foreground
    // 4. Update pomodoroCount, totalWorkedMs/totalBreakMs
    // 5. Save to plugin-store
  },
}));
```

### Timer Tick Hook
```typescript
// Source: Standard React interval hook pattern + Tauri tray API
import { useEffect, useRef } from 'react';
import { useTimerStore } from '../stores/timer-store';
import { updateTrayTitle } from '../lib/timer-tray';

export function useTimerTick() {
  const phase = useTimerStore((s) => s.phase);
  const getRemainingMs = useTimerStore((s) => s.getRemainingMs);
  const completePhase = useTimerStore((s) => s.completePhase);
  const remainingRef = useRef(0);

  useEffect(() => {
    if (phase !== 'working' && phase !== 'on_break') {
      // Clear tray title when not actively timing
      updateTrayTitle(null);
      return;
    }

    const interval = setInterval(() => {
      const remaining = getRemainingMs();
      remainingRef.current = remaining;

      // Update tray title
      updateTrayTitle(remaining);

      // Check for phase completion
      if (remaining <= 0) {
        completePhase();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [phase, getRemainingMs, completePhase]);

  return remainingRef;
}
```

### Persist and Restore Timer State
```typescript
// Source: Pattern from existing auth token persistence in apps/desktop/src/api/client.ts
import { load } from '@tauri-apps/plugin-store';

const STORE_FILE = 'timer-state.json';

interface SavedTimerState {
  phase: string;
  sessionId: string;
  phaseStartedAt: number;
  phaseDurationMs: number;
  totalWorkedMs: number;
  totalBreakMs: number;
  pomodoroCount: number;
  prePausePhase: string | null;
  pauseRemainingMs: number | null;
  config: Record<string, unknown>;
}

export async function saveTimerState(state: SavedTimerState) {
  const store = await load(STORE_FILE, { defaults: {} });
  await store.set('timerState', state);
  await store.save();
}

export async function loadTimerState(): Promise<SavedTimerState | null> {
  const store = await load(STORE_FILE, { defaults: {} });
  return await store.get<SavedTimerState>('timerState') ?? null;
}

export async function clearTimerState() {
  const store = await load(STORE_FILE, { defaults: {} });
  await store.delete('timerState');
  await store.save();
}
```

### Required Capability Permissions
```json
{
  "identifier": "default",
  "description": "Default capability set for the 28K HQ desktop app",
  "windows": ["main", "timer-popover", "timer-mini"],
  "permissions": [
    "core:default",
    "store:default",
    "positioner:default",
    "opener:default",
    "tray:default",
    "notification:default",
    "core:window:allow-show",
    "core:window:allow-hide",
    "core:window:allow-set-focus",
    "core:window:allow-close",
    "core:window:allow-is-visible",
    "core:window:allow-create",
    "core:window:allow-set-always-on-top",
    "core:window:allow-request-user-attention",
    "core:window:allow-unminimize",
    "core:window:allow-set-size",
    "core:window:allow-set-position"
  ]
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Tauri v1 `SystemTray` builder | Tauri v2 `TrayIconBuilder` in `setup()` | Tauri 2.0 (Oct 2024) | Already using v2 pattern in `lib.rs` |
| `setInterval` counting ticks | Timestamp-based `Date.now() - startedAt` | Industry best practice | Eliminates drift from throttling, jitter, system sleep |
| Electron IPC for timer state | Tauri events + JS TrayIcon API | Tauri v2 | No need for Rust commands -- JS API covers everything |
| Custom notification sound via Rust | HTML5 Audio in webview | Tauri v2 webview improvements | Simpler, works on both platforms without native bridge |

**Deprecated/outdated:**
- Tauri v1 `tauri::SystemTray`: replaced by `tauri::tray::TrayIconBuilder` in v2
- `@tauri-apps/api/window` `appWindow` singleton: replaced by `getCurrentWindow()` in v2

## Open Questions

1. **Windows Mini-Window Stability**
   - What we know: `WebviewWindow` supports frameless + always-on-top. The positioner plugin has `TrayCenter` but it is designed for tray-anchored windows.
   - What's unclear: How well a 140x44 window renders React content. Whether the window flickers during rapid position/content updates.
   - Recommendation: Build macOS tray title first (trivial, well-documented). Add Windows mini-window as a second pass. If mini-window is too complex, fall back to tooltip-only display on Windows with full controls in the main window.

2. **Schema Migration Timing**
   - What we know: `targetSessions`, `longBreakDuration`, `longBreakInterval` need adding to the TimerSession model. The bot code already uses `targetSessions` in memory.
   - What's unclear: Whether to add all three fields now or defer long break fields until the store logic needs them.
   - Recommendation: Add all three in a single migration at the start of Phase 17. Adding later forces a second migration. The fields are nullable so they don't break existing records.

3. **Popover vs Main Window for Timer Controls**
   - What we know: The requirement says "click menu bar timer opens popover." A popover is a small window near the tray, not the full main window.
   - What's unclear: Whether the timer setup page should be in the main window (navigated via sidebar) or in the popover.
   - Recommendation: Timer setup (configuration form) lives in the main window at `/timer` route (accessed from sidebar). The popover shows only runtime controls (pause/stop, countdown, progress ring) when timer is active. This mirrors Flow app behavior.

4. **Tray Click Behavior Change**
   - What we know: Currently left-clicking the tray toggles the main window. With timer popover, click behavior should change when timer is active.
   - What's unclear: Whether to modify the Rust tray handler or handle it in JavaScript.
   - Recommendation: Keep Rust tray handler simple (emit event on click). Handle the routing logic in JavaScript: if timer active, show popover; if timer idle, toggle main window. This avoids Rust code changes.

## Sources

### Primary (HIGH confidence)
- [Tauri v2 TrayIcon JavaScript API](https://v2.tauri.app/reference/javascript/api/namespacetray/) - setTitle, setTooltip, setIcon, setMenu methods verified. `tray:default` permission includes `allow-set-title`.
- [Tauri v2 System Tray Guide](https://v2.tauri.app/learn/system-tray/) - TrayIcon creation, click event handling, menu events.
- [Tauri v2 WebviewWindow API](https://v2.tauri.app/reference/javascript/api/namespacewebviewwindow/) - Constructor with decorations, alwaysOnTop, skipTaskbar options. Methods: show(), hide(), setFocus(), requestUserAttention().
- [Tauri v2 Calling Frontend from Rust](https://v2.tauri.app/develop/calling-frontend/) - `app.emit()` for Rust-to-JS events, `listen()` in JavaScript.
- [Tauri v2 Core Permissions](https://v2.tauri.app/reference/acl/core-permissions/) - Full list of tray:allow-*, window:allow-* permissions.
- [Tauri v2 Notification Plugin](https://v2.tauri.app/plugin/notification/) - Sound support on macOS/Windows, installation instructions.
- [Tauri Plugin Positioner](https://v2.tauri.app/plugin/positioner/) - `moveWindow(Position.TrayCenter)` for tray-anchored windows.
- [Tauri v2 Window Customization](https://v2.tauri.app/learn/window-customization/) - Frameless, always-on-top configuration.

### Secondary (MEDIUM confidence)
- [TauriTutorials: Building a System Tray App](https://tauritutorials.com/blog/building-a-system-tray-app-with-tauri) - Practical positioner + tray toggle pattern with focus-loss auto-hide.
- [TauriTutorials: Creating Windows in Tauri](https://tauritutorials.com/blog/creating-windows-in-tauri) - WebviewWindowBuilder Rust examples with always_on_top, decorations(false), skip_taskbar(true).
- [Tauri GitHub Discussion #9601](https://github.com/orgs/tauri-apps/discussions/9601) - Creating windows from JavaScript in Tauri v2.

### Tertiary (LOW confidence)
- [Tauri Issue #3322](https://github.com/tauri-apps/tauri/issues/3322) - `set_title` feature request history (confirmed implemented for macOS only).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already installed or are official Tauri plugins with verified APIs
- Architecture: HIGH - Timer state machine pattern proven in bot's engine.ts, Zustand stores established in the desktop app, tray/window APIs verified in official docs
- Pitfalls: HIGH - Background throttling already mitigated, timestamp pattern documented in project's PITFALLS.md, race condition handled by existing API enforcement

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (stable -- Tauri v2 and all dependencies are mature releases)
