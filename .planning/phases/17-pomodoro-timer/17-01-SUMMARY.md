---
phase: 17-pomodoro-timer
plan: 01
subsystem: timer
tags: [zustand, tauri, tray-icon, plugin-store, pomodoro, prisma]

requires:
  - phase: 16-desktop-shell-dashboard-goals
    provides: "Tauri desktop app shell with auth, Zustand stores, and apiFetch client"
  - phase: 15-rest-api-authentication
    provides: "REST API with timer CRUD routes and JWT auth"
provides:
  - "Zustand timer store with full pomodoro state machine (start/pause/resume/stop/completePhase/restore)"
  - "Tray helper for macOS menu bar MM:SS countdown"
  - "Timer persistence layer for restart recovery via plugin-store"
  - "Audio helper for alarm playback"
  - "React tick hook driving 1-second interval with tray updates"
  - "TimerSession schema with targetSessions/longBreakDuration/longBreakInterval fields"
  - "Notification plugin registered in Rust and JS"
affects: [17-02, 17-03, timer-ui, timer-sync]

tech-stack:
  added: [tauri-plugin-notification, "@tauri-apps/plugin-notification", "@tauri-apps/api/tray"]
  patterns: [timestamp-based-countdown, plugin-store-persistence, tray-title-countdown]

key-files:
  created:
    - apps/desktop/src/stores/timer-store.ts
    - apps/desktop/src/lib/timer-tray.ts
    - apps/desktop/src/lib/timer-persistence.ts
    - apps/desktop/src/lib/timer-audio.ts
    - apps/desktop/src/hooks/use-timer-tick.ts
  modified:
    - packages/db/prisma/schema.prisma
    - apps/desktop/src-tauri/Cargo.toml
    - apps/desktop/src-tauri/src/lib.rs
    - apps/desktop/src-tauri/capabilities/default.json
    - apps/api/src/routes/timer.ts

key-decisions:
  - "Timestamp-based countdown (Date.now() - phaseStartedAt) instead of tick counting for drift-free accuracy"
  - "Notification plugin added to Rust builder for phase completion alerts in Plan 02"
  - "Timer persistence uses plugin-store v2 load() with defaults:{} pattern established in Phase 16"

patterns-established:
  - "Timer state machine: idle -> working -> on_break -> paused -> transition with deterministic transitions"
  - "buildSaveState helper extracts serializable subset from Zustand store for persistence"
  - "TrayIcon.getById('main') cached for repeated setTitle calls without re-lookup"

requirements-completed: [TMR-01, TMR-02, TMR-03, TMR-04, TMR-05, TMR-12]

duration: 3min
completed: 2026-03-22
---

# Phase 17 Plan 01: Timer Engine Foundation Summary

**Zustand pomodoro state machine with timestamp-based countdown, tray MM:SS display, plugin-store persistence, and API integration for long breaks and target sessions**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-21T23:36:16Z
- **Completed:** 2026-03-21T23:39:15Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- Full pomodoro state machine in Zustand with start/pause/resume/stop/completePhase/restore/transitionToBreak/transitionToWork actions
- TimerSession schema extended with targetSessions, longBreakDuration, longBreakInterval nullable fields
- Notification plugin registered in Rust + JS for future phase completion alerts
- Tray helper updates macOS menu bar with MM:SS countdown every second
- Persistence layer saves/loads timer state to plugin-store for restart recovery
- React tick hook drives 1-second interval with automatic phase completion detection

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema migration + notification plugin + API update** - `a05e0ae` (feat)
2. **Task 2: Timer store, tray helper, persistence, audio, and tick hook** - `6e66418` (feat)

## Files Created/Modified
- `apps/desktop/src/stores/timer-store.ts` - Zustand store with full pomodoro lifecycle state machine
- `apps/desktop/src/lib/timer-tray.ts` - TrayIcon.setTitle helper for macOS countdown display
- `apps/desktop/src/lib/timer-persistence.ts` - Save/load/clear timer state via plugin-store
- `apps/desktop/src/lib/timer-audio.ts` - HTML5 Audio preload and playback for alarm sounds
- `apps/desktop/src/hooks/use-timer-tick.ts` - React hook driving 1s interval with tray and phase completion
- `packages/db/prisma/schema.prisma` - Added 3 nullable fields to TimerSession model
- `apps/desktop/src-tauri/Cargo.toml` - Added tauri-plugin-notification dependency
- `apps/desktop/src-tauri/src/lib.rs` - Registered notification plugin in builder chain
- `apps/desktop/src-tauri/capabilities/default.json` - Added timer windows and notification/tray/window permissions
- `apps/api/src/routes/timer.ts` - Extended createTimerSchema with longBreakDuration/longBreakInterval

## Decisions Made
- Timestamp-based countdown (Date.now() - phaseStartedAt) for drift-free accuracy instead of counting interval ticks
- Notification plugin registered now for use in Plan 02 phase completion alerts
- Timer persistence uses same plugin-store v2 load() with defaults:{} pattern from Phase 16
- Database push deferred to VPS deployment (schema validates locally, no local Postgres)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Regenerated Prisma client after schema change**
- **Found during:** Task 1 (schema migration)
- **Issue:** API TypeScript compilation failed because Prisma client was stale after adding new schema fields
- **Fix:** Ran `npx prisma generate` to regenerate client types
- **Files modified:** packages/db/generated/ (gitignored)
- **Verification:** `npx tsc --noEmit` passes clean in apps/api
- **Committed in:** a05e0ae (part of Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Standard Prisma workflow step. No scope creep.

## Issues Encountered
- Database push (`prisma db push`) failed because PostgreSQL runs on the VPS, not locally. Schema validates via `prisma validate`. Push will happen on VPS after git pull.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Timer engine complete with all store actions, ready for UI components in Plan 02
- Notification plugin registered for phase completion alerts
- Tray countdown helper ready for real-time display
- Audio helper ready (actual sound file to be added later)

---
*Phase: 17-pomodoro-timer*
*Completed: 2026-03-22*
