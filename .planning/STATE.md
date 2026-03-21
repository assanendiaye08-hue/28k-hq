# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-21)

**Core value:** When a member opens Discord, the environment pulls them into productive action -- not gaming. The desktop app extends this to their entire workstation.
**Current focus:** v2.0 Phase 17 - Pomodoro Timer

## Current Position

Phase: 17 of 19 (Pomodoro Timer)
Plan: 1 of 3 in current phase
Status: In Progress
Last activity: 2026-03-22 -- Completed 17-01 (Timer engine foundation)

Progress: [###########░░░░░░░░░] 55% (v2.0) -- Phase 17 in progress, Plan 01 complete (4 of 6 v2.0 phases)

## Performance Metrics

**Velocity:**
- Total plans completed: 43 (18 v1.0 + 17 v1.1 + 8 v2.0)
- Average duration: 5 min
- Total execution time: 3.2 hours

**By Phase (v1.1):**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 07-ai-infrastructure | 3/3 | 20 min | 7 min |
| 08-inspiration-system | 2/2 | 5 min | 3 min |
| 09-productivity-timer | 3/3 | 16 min | 5 min |
| 10-smart-reminders | 2/2 | 8 min | 4 min |
| 11-goal-hierarchy | 3/3 | 10 min | 3 min |
| 12-self-evaluation-and-reflection | 3/3 | 10 min | 3 min |
| 13-monthly-progress-recap | 1/1 | 4 min | 4 min |

**By Phase (v2.0):**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 14-monorepo-restructure | 2/2 | 14 min | 7 min |
| 15-rest-api-authentication | 2/2 | 7 min | 4 min |
| 16-desktop-shell-dashboard-goals | 3/3 | 10 min | 3 min |
| 17-pomodoro-timer | 1/3 | 3 min | 3 min |

**Recent Trend:**
- Last 5 plans: 15-02 (4 min), 16-01 (6 min), 16-02 (2 min), 16-03 (2 min), 17-01 (3 min)
- Trend: stable (timer engine is mostly new file creation with straightforward patterns)

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v2.0 Roadmap]: Monorepo restructure must be Phase 14 -- everything depends on shared packages existing
- [v2.0 Roadmap]: API + Auth before desktop app -- desktop is a thin client that consumes the API
- [v2.0 Roadmap]: Desktop shell + dashboard before timer -- timer is most complex, validate stack with simpler features first
- [v2.0 Roadmap]: Timer sync is last phase -- hardest integration point, two processes writing same tables
- [v2.0 Roadmap]: Prisma 7 + pnpm TS2742 bug must be flushed out in Phase 14 (install @prisma/client-runtime-utils or hoist)
- [14-01]: Used Turborepo internal packages pattern (raw .ts exports, no build step for packages)
- [14-01]: Decoupled encryption from bot config -- reads process.env.MASTER_ENCRYPTION_KEY directly
- [14-01]: Prisma 7.5.0 + pnpm strict mode works without TS2742 workarounds (no hoisting needed)
- [14-01]: Prisma generates into packages/db/generated/prisma/client/ via custom output
- [14-02]: Deleted redundant bot copies of extracted files rather than keeping re-export shims
- [14-02]: Added crypto functions to @28k/db barrel export for onboarding module
- [14-02]: All bot imports use @28k/db and @28k/shared -- no relative db/shared paths remain
- [v2.0 Roadmap]: Windows has no menu bar text -- needs mini-window fallback for timer countdown display
- [15-01]: Fastify plugin pattern: fp() for infrastructure, plain async for routes (encapsulation)
- [15-01]: JWT payload: sub=memberId, did=discordId (minimal claims for identity)
- [15-01]: Refresh token rotation: delete old, create new on each refresh (prevents reuse)
- [15-01]: Per-route rate limits on auth (5/min discord, 10/min refresh) + global 100/min
- [15-02]: Timer XP uses same formula as bot: 1 XP per 5 min worked, min 5 min, daily cap 200
- [15-02]: Goal hierarchy loaded 4 levels deep using nested Prisma includes (matches bot pattern)
- [15-02]: Dashboard returns goals split into today (weekly + 7-day deadline) and weekly categories
- [15-02]: Quote rotation uses day-of-year modulo for consistent daily quote (UTC-based)
- [16-01]: Used openUrl (not open) from @tauri-apps/plugin-opener v2 -- API renamed in v2
- [16-01]: tauri-plugin-oauth start() returns port, callback URL comes via onUrl() listener
- [16-01]: @tauri-apps/plugin-store load() requires defaults:{} in v2 StoreOptions
- [16-01]: Placeholder gold circle PNGs for tray/app icons until real ouroboros assets provided
- [16-02]: Inline SVG icons for sidebar nav (2 icons, no icon library needed)
- [16-02]: Fire emoji (unicode) for streak visual instead of custom SVG
- [16-02]: Rank color from API hex integer converted to CSS hex string via toString(16).padStart(6,'0')
- [16-03]: Auto-expand depth 0 and 1 after goal fetch for immediate visibility of top-level structure
- [16-03]: Inline SVG icons for all goal status indicators (chevron, checkmark, X, clock)
- [16-03]: GoalTree groups top-level goals by timeframe with section headers when mixed
- [17-01]: Timestamp-based countdown (Date.now() - phaseStartedAt) instead of tick counting for drift-free accuracy
- [17-01]: Notification plugin added to Rust builder for phase completion alerts in Plan 02
- [17-01]: Timer persistence uses same plugin-store v2 load() with defaults:{} pattern from Phase 16

### Pending Todos

None yet.

### Blockers/Concerns

- Prisma 7 + pnpm TS2742 bug: RESOLVED -- no workaround needed, 7.5.0 works cleanly with pnpm strict mode
- Windows timer UX: mini-window approach has no Tauri ecosystem precedent, needs prototyping in Phase 17
- macOS code signing: $99/year Apple Developer certificate needed before distribution

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 1 | Fix 7 audit bugs: encryption, role stripping, setup transaction, notification routing, skip weekly, timer recovery | 2026-03-21 | 0ef0d93 | [1-fix-7-audit-bugs-encryption-role-strippi](./quick/1-fix-7-audit-bugs-encryption-role-strippi/) |
| 2 | Fix 4 audit follow-ups: reminder message binding, session title export, setup rerun guard, timer prePauseState | 2026-03-21 | f65ca12 | [2-fix-4-audit-follow-ups-reminder-message-](./quick/2-fix-4-audit-follow-ups-reminder-message-/) |
| 3 | Fix reminder routing bypass and timer remainingMs persistence regressions | 2026-03-21 | ffc12a7 | [3-fix-reminder-routing-bypass-regression-a](./quick/3-fix-reminder-routing-bypass-regression-a/) |

## Session Continuity

Last session: 2026-03-22
Stopped at: Completed 17-01-PLAN.md (Timer engine foundation with state machine, tray, persistence, audio)
Resume file: None
