# Roadmap: Discord Hustler

## Milestones

- ✅ **v1.0 MVP** — Phases 1-6 (shipped 2026-03-20)
- ✅ **v1.1 Depth** — Phases 7-13 (shipped 2026-03-21)
- 🚧 **v2.0 Desktop Companion App** — Phases 14-19 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-6) — SHIPPED 2026-03-20</summary>

- [x] Phase 1: Foundation and Identity (4/4 plans) — completed 2026-03-20
- [x] Phase 2: Daily Engagement Loop (3/3 plans) — completed 2026-03-20
- [x] Phase 3: Competition and Social Proof (3/3 plans) — completed 2026-03-20
- [x] Phase 4: AI Assistant (2/2 plans) — completed 2026-03-20
- [x] Phase 5: Content, Sessions, and Trust (3/3 plans) — completed 2026-03-20
- [x] Phase 6: Polish and Launch Readiness (3/3 plans) — completed 2026-03-20

Full details: .planning/milestones/v1.0-ROADMAP.md

</details>

<details>
<summary>✅ v1.1 Depth (Phases 7-13) — SHIPPED 2026-03-21</summary>

- [x] Phase 7: AI Infrastructure (3/3 plans) — completed 2026-03-20
- [x] Phase 8: Inspiration System (2/2 plans) — completed 2026-03-20
- [x] Phase 9: Productivity Timer (3/3 plans) — completed 2026-03-21
- [x] Phase 10: Smart Reminders (2/2 plans) — completed 2026-03-21
- [x] Phase 11: Goal Hierarchy (3/3 plans) — completed 2026-03-21
- [x] Phase 12: Self-Evaluation and Reflection (3/3 plans) — completed 2026-03-21
- [x] Phase 13: Monthly Progress Recap (1/1 plan) — completed 2026-03-21

Full details: .planning/milestones/v1.1-ROADMAP.md

</details>

### v2.0 Desktop Companion App (Phases 14-19)

**Milestone Goal:** Extend the platform from Discord-only to a three-app system (bot + API + desktop) with a Tauri desktop companion app providing menu bar timer, goal hierarchy views, and daily dashboard.

- [x] **Phase 14: Monorepo Restructure** - Extract shared packages, move bot to apps/bot, pnpm + Turborepo (completed 2026-03-21)
- [x] **Phase 15: REST API + Authentication** - Fastify server with Discord OAuth, JWT auth, all data endpoints (1/2 plans complete) (completed 2026-03-21)
- [x] **Phase 16: Desktop Shell + Dashboard + Goals View** - Tauri app with auth, system tray, dashboard, read-only goals (completed 2026-03-21)
- [x] **Phase 17: Pomodoro Timer** - Full pomodoro mode with menu bar countdown, popover controls, transitions, sync (completed 2026-03-22)
- [ ] **Phase 18: Flowmodoro + Goals Editing** - Count-up timer mode and goal CRUD from desktop app
- [ ] **Phase 19: Cross-Platform Sync + Polish** - Bot-desktop timer/goal sync, auto-updater, autostart

### Phase 14: Monorepo Restructure
**Goal**: Codebase is organized as a Turborepo + pnpm monorepo with shared packages, and the existing bot runs identically from its new location
**Depends on**: Nothing (first phase of v2.0)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04
**Success Criteria**:
  1. `pnpm dev --filter bot` starts the Discord bot identically to pre-migration state
  2. `packages/db` exports Prisma client importable by bot and API without TS2742 errors
  3. `packages/shared` exports XP engine, rank constants, timer constants, brand colors
  4. `pnpm install` resolves all dependencies in strict mode
**Plans:** 2/2 plans complete

Plans:
- [ ] 14-01-PLAN.md — Monorepo skeleton (pnpm, Turborepo, tsconfig) + extract packages/db
- [ ] 14-02-PLAN.md — Extract packages/shared, move bot to apps/bot, scaffold api/desktop, update deploy

### Phase 15: REST API + Authentication
**Goal**: Fastify REST API running with Discord OAuth, JWT auth, and all timer/goals/dashboard/quote endpoints
**Depends on**: Phase 14
**Requirements**: API-01, API-02, API-03, API-04, API-05, API-06, AUTH-01, AUTH-02, AUTH-03
**Plans:** 2/2 plans complete

Plans:
- [x] 15-01-PLAN.md — API server foundation with Fastify plugins, Discord OAuth + JWT auth, health check
- [ ] 15-02-PLAN.md — Timer CRUD, goals hierarchy, dashboard aggregation, daily quote endpoints

### Phase 16: Desktop Shell + Dashboard + Goals View
**Goal**: Tauri app boots, authenticates, shows dashboard and goal hierarchy with dark+gold theme
**Depends on**: Phase 15
**Requirements**: APP-01, APP-02, APP-03, APP-04, APP-05, AUTH-04, DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, GOAL-01, GOAL-02
**Plans:** 3/3 plans complete

Plans:
- [x] 16-01-PLAN.md — Scaffold Tauri v2 app with system tray, Discord OAuth login, dark+gold theme
- [x] 16-02-PLAN.md — Dashboard page with priorities, weekly goals, streak, rank, and quote cards
- [x] 16-03-PLAN.md — Goals page with recursive tree view, progress bars, and timeframe filtering

### Phase 17: Pomodoro Timer
**Goal**: Full pomodoro timer with menu bar countdown, popover controls, alarm transitions, API sync, persistence
**Depends on**: Phase 16
**Requirements**: TMR-01, TMR-02, TMR-03, TMR-04, TMR-05, TMR-06, TMR-07, TMR-08, TMR-09, TMR-10, TMR-11, TMR-12
**Plans:** 3/3 plans complete

Plans:
- [ ] 17-01-PLAN.md — Timer engine: Zustand store, schema migration, tray helper, persistence, audio
- [ ] 17-02-PLAN.md — Timer UI: setup form, running display, popover window, tray click routing
- [ ] 17-03-PLAN.md — Timer transitions: alarm foreground, work/break screens, API sync with XP

### Phase 18: Flowmodoro + Goals Editing
**Goal**: Count-up timer mode with auto-calculated breaks, plus goal CRUD from desktop app
**Depends on**: Phase 17
**Requirements**: FLW-01, FLW-02, FLW-03, FLW-04, FLW-05, FLW-06, GOAL-03, GOAL-04, GOAL-05
**Plans:** 2 plans

Plans:
- [ ] 18-01-PLAN.md — Flowmodoro timer mode: store extension, count-up tick, tray elapsed, setup toggle, display
- [ ] 18-02-PLAN.md — Goals editing: create form, inline progress update, complete action with XP feedback

### Phase 19: Cross-Platform Sync + Polish
**Goal**: Bot-desktop timer/goal sync, one-timer enforcement, real-time dashboard, auto-updater, autostart
**Depends on**: Phase 18
**Requirements**: SYNC-01, SYNC-02, SYNC-03, SYNC-04, GOAL-06, DASH-06, APP-06, APP-07

Full details: .planning/milestones/v2.0-ROADMAP.md

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-6 | v1.0 | 18/18 | Complete | 2026-03-20 |
| 7-13 | v1.1 | 17/17 | Complete | 2026-03-21 |
| 14. Monorepo Restructure | 2/2 | Complete    | 2026-03-21 | - |
| 15. REST API + Auth | 2/2 | Complete    | 2026-03-21 | - |
| 16. Desktop Shell + Dashboard | 3/3 | Complete    | 2026-03-21 | - |
| 17. Pomodoro Timer | 3/3 | Complete    | 2026-03-22 | - |
| 18. Flowmodoro + Goals | v2.0 | 0/2 | Not started | - |
| 19. Sync + Polish | v2.0 | 0/2 | Not started | - |
