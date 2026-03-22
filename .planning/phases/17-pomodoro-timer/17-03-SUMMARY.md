---
phase: 17-pomodoro-timer
plan: 03
subsystem: timer
tags: [transitions, alarms, notifications, xp-sync, local-first]

requires:
  - phase: 17-pomodoro-timer
    plan: 02
    provides: "Timer UI with setup form, display, sidebar nav"
provides:
  - "Phase transition screens (work_done, break_done, session_complete)"
  - "Alarm sound and foreground notifications on phase completion"
  - "XP award display on session completion"
  - "Local-first timer architecture (server syncs in background)"
  - "Automated timer store unit tests (7 tests)"
  - "E2E API timer tests (8 scenarios)"

key-files:
  created:
    - apps/desktop/src/components/timer/TimerTransition.tsx
    - apps/desktop/src/lib/timer-notifications.ts
    - apps/desktop/public/sounds/alarm-chime.mp3
    - apps/desktop/src/__tests__/timer-store.test.ts
  modified:
    - apps/desktop/src/stores/timer-store.ts
    - apps/desktop/src/components/timer/TimerDisplay.tsx
    - apps/desktop/src/pages/TimerPage.tsx
    - apps/desktop/src/lib/timer-tray.ts
    - apps/desktop/src/hooks/use-timer-tick.ts
    - apps/desktop/src/api/auth.ts
    - apps/desktop/src/App.tsx
    - apps/desktop/src-tauri/src/lib.rs
    - apps/desktop/src-tauri/tauri.conf.json
    - apps/desktop/src-tauri/capabilities/default.json
    - apps/api/src/routes/timer.ts
    - apps/api/src/routes/auth.ts
  deleted:
    - apps/desktop/src/components/timer/TimerPopover.tsx

decisions:
  - title: "Removed popover window"
    choice: "Single main window instead of separate popover"
    reason: "Popover caused second dock icon, cross-window sync complexity, and visual inconsistency"
  - title: "Local-first timer"
    choice: "Timer runs entirely locally, server syncs in background"
    reason: "Server dependency caused 409 conflicts, stale sessions, and timer start failures"
  - title: "Server auto-cancels stale sessions"
    choice: "POST /timer auto-completes any existing active session"
    reason: "Client PATCH to stop was unreliable, leaving orphaned ACTIVE sessions"
  - title: "Auth refresh doesn't rotate tokens"
    choice: "Refresh endpoint returns same token instead of rotating"
    reason: "Token rotation caused lockouts when client failed to save rotated token"
  - title: "Auto-register members on desktop login"
    choice: "API creates Member + DiscordAccount if not found during OAuth"
    reason: "No members existed in DB, blocking desktop app testing"

## Self-Check: PASSED

- [x] Transition screens render for work_done, break_done, session_complete
- [x] Alarm sound plays on phase completion
- [x] Window comes to foreground on phase completion
- [x] XP awarded on session stop (verified: 5 XP for 25 min work)
- [x] Timer stop/restart works reliably (local-first, no server dependency)
- [x] Menu bar countdown synced with app display (matching ceil rounding)
- [x] Paused timer shows frozen time in menu bar
- [x] Session restore from persistence on app restart
- [x] 7 unit tests passing (timer store logic)
- [x] 8 E2E API tests passing (server-side timer operations)
---

## Summary

Completed the timer transition system, alarm notifications, and XP sync. Extensively debugged and refactored during human verification:

1. **Transitions**: TimerTransition component handles work_done (start break), break_done (resume work), and session_complete (XP display) states
2. **Local-first rewrite**: Timer start/stop/pause/resume are now synchronous — state updates instantly, API syncs in background
3. **Popover removed**: Eliminated separate popover window in favor of single main window, fixing dock icon duplication
4. **Auth fixes**: Session restore on reload, non-rotating refresh tokens, auto-member registration
5. **Tray sync**: Menu bar and app display use identical formatting (ceil rounding), paused state shown
6. **Testing**: 7 unit tests for store logic + 8 E2E API tests covering all timer scenarios
7. **Icons**: Generated proper 28K HQ branded icons (amber circle)
8. **Server resilience**: POST /timer auto-cancels stale sessions, eliminating 409 conflicts
