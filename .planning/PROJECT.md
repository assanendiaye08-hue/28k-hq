# Discord Hustler

## What This Is

A productivity platform for 10-25 former gamers built on Discord + a native desktop companion app. Discord handles community, AI chat (Jarvis), and social proof. The desktop app (Tauri, Mac + Windows) handles visual features: Flow-style productivity timer in the menu bar, goal hierarchy views, and a daily dashboard. Both share the same database and API. Makes hustling feel like the game through gamification, AI accountability, and competitive progression.

## Core Value

When a member opens Discord, the environment pulls them into productive action — not gaming. The server must make hustling feel like the game.

## Requirements

### Validated

- ✓ Bot framework with auto-deploy, module loader, command registry, event bus — v1.0
- ✓ Server structure with channels, roles, permissions, onboarding — v1.0
- ✓ Fluid member profiles with AI-extracted interests (not rigid lanes) — v1.0
- ✓ Per-member private space (DM or server channel) — v1.0
- ✓ Multi-account identity linking (XP/data unified) — v1.0
- ✓ Per-member AES-256-GCM encryption at rest — v1.0
- ✓ Daily check-ins with flexible scoring — v1.0
- ✓ Goal setting with progress tracking — v1.0
- ✓ XP engine (check-ins, goals, voice, wins, resources, timers, reflections) — v1.0/v1.1
- ✓ Rank/role progression — v1.0
- ✓ AI-powered morning briefs with full member context — v1.0
- ✓ Multi-dimensional leaderboards (XP, voice, streaks) — v1.0
- ✓ Voice session tracking with AFK detection — v1.0
- ✓ Wins/lessons channels with XP and reactions — v1.0
- ✓ Valorant-style seasonal system with archives — v1.0
- ✓ Conversational AI assistant "Jarvis" (Grok 4.1 Fast + DeepSeek fallback) — v1.0/v1.1
- ✓ Accountability nudges with configurable intensity — v1.0
- ✓ Resource sharing channels with AI auto-tagging and threads — v1.0
- ✓ Lock-in sessions (instant + scheduled, private + public) — v1.0
- ✓ /mydata full JSON export — v1.0
- ✓ /deletedata hard delete with confirmation — v1.0
- ✓ Owner-blind privacy (encrypted conversations and personal data) — v1.0
- ✓ Auto-content feeds (RSS/YouTube/Reddit + AI filter) — v1.0
- ✓ Per-notification-type account routing — v1.0
- ✓ Bot hardening (restart recovery, member lifecycle, admin logging) — v1.0
- ✓ Centralized AI client with cost tracking and per-member token budgets — v1.1
- ✓ Tiered memory system (hot/warm/cold) with protected data — v1.1
- ✓ Configurable model routing (Grok primary, DeepSeek fallback, hot-swappable) — v1.1
- ✓ Inspiration system with natural Jarvis references — v1.1
- ✓ Productivity timer (pomodoro + proportional breaks + NLP starts) — v1.1
- ✓ Smart reminders (chrono-node NLP, urgency tiers, recurring, pluggable delivery) — v1.1
- ✓ Goal hierarchy (yearly→weekly, cascading progress, Jarvis decomposition) — v1.1
- ✓ Self-evaluation/reflection (configurable intensity, AI questions, Jarvis feedback loop) — v1.1
- ✓ Monthly progress recap (adaptive AI narrative, shareable to #wins) — v1.1

- ✓ Monorepo restructure (Turborepo + pnpm: apps/bot, apps/desktop, apps/api, packages/db, packages/shared) — v2.0
- ✓ REST API server (Fastify) on VPS with shared database — v2.0
- ✓ Discord OAuth authentication (PKCE flow, auto-registration) — v2.0
- ✓ Tauri desktop app with system tray, menu bar countdown — v2.0
- ✓ Pomodoro timer (local-first, hours+minutes config, progress ring, alarm transitions, XP sync) — v2.0
- ✓ Flowmodoro timer (count-up, auto-calculated ratio breaks) — v2.0
- ✓ Goals CRUD from desktop (create, progress update, complete with XP) — v2.0
- ✓ Dashboard (priorities, weekly goals, streak/rank, daily quote, auto-refresh) — v2.0
- ✓ Settings page (auto-updater, autostart toggles) — v2.0
- ✓ Dark theme with amber accents, macOS-native design — v2.0
- ✓ 34 automated tests (13 unit + 21 E2E API) — v2.0

### Active

#### v3.0 Jarvis Coach Evolution
- [ ] Pure conversational AI — no slash commands for core interactions, natural language in DMs
- [ ] Proactive coaching routines — morning briefs, end-of-day reflections, weekly recaps, goal nudges
- [ ] Per-user coaching settings — members configure frequency, intensity, which features are active
- [ ] Smart context management — topic-aware responses, no irrelevant context bleeding
- [ ] Remove bot timer module — desktop app handles timers now
- [ ] DMs only — remove private channel per-member system
- [ ] Keep minimal slash commands — only /reminders, /goals, /leaderboard for quick lookups
- [ ] Ruthlessly objective coaching tone — not a persona, purely focused on helping members level up

### Out of Scope

- Investing/trading lane — not a focus for this group right now
- Mobile app — future milestone after desktop proves the model
- Paid membership / monetization — this is for friends, not a business
- Activity/window tracking — future feature, not MVP
- Calendar view — not needed for MVP

## Context

- **The group**: 10-25 friends from the same city, diverse profiles (FAANG engineers, small biz owners, students, ecom, affiliate). Smart and capable but spending time gaming on Discord instead of building
- **The founder's angle**: Already a hustler making money online. Wants to pull friends into the same mindset
- **Key insight**: These are gamers — wired for competition, progression, streaks, leaderboards. The bots tap into that psychology
- **Current state**: v2.0 shipped — 6,398 LOC TypeScript (desktop + API), 49 plans, 106 requirements validated across 3 milestones. Desktop app running, API deployed to VPS
- **Future integration**: Apple ecosystem integration planned (APNs, Shortcuts) — pluggable delivery backend already in place
- **Tech stack**: discord.js, Prisma 7, OpenRouter (Grok 4.1 Fast primary + DeepSeek V3.2 fallback), node-cron, chrono-node, rss-parser, PM2

## Constraints

- **Platform**: Discord + native desktop app (Mac/Windows via Tauri)
- **Scale**: 10-25 members — depth over breadth
- **Maintenance**: Single person — must be reliable and low-maintenance
- **Budget**: Flexible but cost-effective. AI costs ~$0.10/day max per member via Grok 4.1 Fast
- **Desktop stack**: Tauri v2 (Rust shell + React frontend), Fastify API, Turborepo monorepo

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Discord as sole platform | Friends already live on Discord, zero friction | ⚠️ Revisit — expanding to desktop app for visual features |
| Interest-based (not three lanes) | Group is diverse, rigid lanes don't fit | ✓ Good |
| Gamification-first approach | Leverage gamer psychology for behavior change | ✓ Good |
| Grok 4.1 Fast via OpenRouter | 2M context at $0.20/M input — massive window + cheap | ✓ Good — switched from DeepSeek in v1.1 |
| Per-member encryption | Owner-blind privacy builds trust | ✓ Good |
| Multi-account identity | Most members have 2+ Discord accounts | ✓ Good |
| DM-based private space | True privacy, not just "private" channels | ✓ Good |
| Centralized AI client | One place for cost tracking, model routing, budget enforcement | ✓ Good — 14 call sites, zero direct OpenRouter imports |
| Tiered memory (hot/warm/cold) | Scale context without losing data | ✓ Good — Grok 2M + conservative compression |
| Pluggable delivery backend | Future Apple integration without rewrite | ✓ Good — interface ready, Discord impl shipped |

---
| Desktop companion app (Tauri v2) | Visual features don't belong in Discord embeds — timer, goals, dashboard need proper UI | ✓ Good — shipped v2.0 |
| Monorepo + API architecture | Shared DB layer enables desktop, future mobile/web without rewriting backend | ✓ Good — bot and desktop share DB seamlessly |
| Fastify REST API (not tRPC) | REST works with any client language (future iOS/web), tRPC locks to TypeScript | ✓ Good |
| Local-first timer | Timer runs locally, API syncs in background — no server dependency for start/stop | ✓ Good — eliminated all 409/stale session bugs |
| Single window (no popover) | Popover caused dual dock icons and cross-window sync complexity | ✓ Good — simpler, no sync issues |
| Server auto-cancel stale sessions | POST /timer auto-completes any existing ACTIVE session | ✓ Good — foolproof timer restart |

---
*Last updated: 2026-03-22 after v3.0 milestone definition*
