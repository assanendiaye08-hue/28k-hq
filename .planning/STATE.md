# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-21)

**Core value:** When a member opens Discord, the environment pulls them into productive action -- not gaming. The desktop app extends this to their entire workstation.
**Current focus:** v2.0 Phase 14 - Monorepo Restructure

## Current Position

Phase: 14 of 19 (Monorepo Restructure)
Plan: 2 of 2 in current phase (COMPLETE)
Status: Phase Complete
Last activity: 2026-03-21 -- Completed 14-02 (bot migration + shared package + app scaffolds)

Progress: [##░░░░░░░░░░░░░░░░░░] 8% (v2.0) -- Phase 14 complete (1 of 6 v2.0 phases)

## Performance Metrics

**Velocity:**
- Total plans completed: 37 (18 v1.0 + 17 v1.1 + 2 v2.0)
- Average duration: 5 min
- Total execution time: 2.87 hours

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

**Recent Trend:**
- Last 5 plans: 12-02 (3 min), 12-03 (3 min), 13-01 (4 min), 14-01 (6 min), 14-02 (8 min)
- Trend: slight increase (monorepo migration is larger scope)

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

Last session: 2026-03-21
Stopped at: Completed 14-02-PLAN.md (bot migration + shared package + app scaffolds) -- Phase 14 complete
Resume file: None
