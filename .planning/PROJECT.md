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

### Active

#### v2.0 Desktop Companion App
- [ ] Monorepo restructure (Turborepo + pnpm: apps/bot, apps/desktop, apps/api, packages/db, packages/shared)
- [ ] REST API server (Fastify) on VPS — shared database access for desktop app
- [ ] Discord OAuth authentication for desktop app
- [ ] Tauri desktop app: menu bar icon (gold ouroboros), system tray presence
- [ ] Timer: Pomodoro mode (custom work/break/sessions/long break) with menu bar countdown
- [ ] Timer: Flowmodoro mode (running timer, auto-calculated break ratio)
- [ ] Timer: Full setup screen, menu bar controls, alarm + screen focus on transitions
- [ ] Goals: Nested hierarchy view (yearly → quarterly → monthly → weekly) with progress bars
- [ ] Dashboard: Today's priorities, weekly goals, streak/rank, daily operator quote
- [ ] Session data syncs to bot for XP/streak tracking
- [ ] Dark theme with gold accents (brand identity)

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
- **Current state**: v1.1 shipped — 23,564 LOC TypeScript, 35 plans, 51 requirements validated across 2 milestones. Ready for deployment and real-world testing
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
| Desktop companion app (Tauri v2) | Visual features don't belong in Discord embeds — timer, goals, dashboard need proper UI | — Pending |
| Monorepo + API architecture | Shared DB layer enables desktop, future mobile/web without rewriting backend | — Pending |
| Fastify REST API (not tRPC) | REST works with any client language (future iOS/web), tRPC locks to TypeScript | — Pending |

---
*Last updated: 2026-03-21 after v2.0 milestone definition*
