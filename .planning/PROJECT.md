# Discord Hustler

## What This Is

A Discord server ecosystem with custom bots and integrations that transforms a friend group of 10-25 former gamers into active hustlers. The server makes productivity, money-making, and self-improvement feel as engaging as gaming — through gamification, AI-powered accountability, competitive leaderboards, and personalized content feeds. Shipped as v1.0 MVP with 16K+ LOC TypeScript.

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
- ✓ XP engine (check-ins, goals, voice, wins, resources) — v1.0
- ✓ Rank/role progression — v1.0
- ✓ AI-powered morning briefs with full member context — v1.0
- ✓ Multi-dimensional leaderboards (XP, voice, streaks) — v1.0
- ✓ Voice session tracking with AFK detection — v1.0
- ✓ Wins/lessons channels with XP and reactions — v1.0
- ✓ Valorant-style seasonal system with archives — v1.0
- ✓ Conversational AI assistant "Ace" (DeepSeek V3.2 + Qwen fallback) — v1.0
- ✓ Accountability nudges with configurable intensity — v1.0
- ✓ Resource sharing channels with AI auto-tagging and threads — v1.0
- ✓ Lock-in sessions (instant + scheduled, private + public) — v1.0
- ✓ /mydata full JSON export — v1.0
- ✓ /deletedata hard delete with confirmation — v1.0
- ✓ Owner-blind privacy (encrypted conversations and personal data) — v1.0
- ✓ Auto-content feeds (RSS/YouTube/Reddit + AI filter) — v1.0
- ✓ Per-notification-type account routing — v1.0
- ✓ Bot hardening (restart recovery, member lifecycle, admin logging) — v1.0

### Active

- [ ] Productivity timer suite (pomodoro + proportional breaks)
- [ ] Self-evaluation/reflection flow with configurable intensity
- [ ] Idol system ("what would my idol do?")
- [ ] Enhanced content curation (more personalized, broader sources)

### Out of Scope

- Investing/trading lane — not a focus for this group right now
- Mobile app — Discord IS the platform
- Paid membership / monetization — this is for friends, not a business

## Context

- **The group**: 10-25 friends from the same city, diverse profiles (FAANG engineers, small biz owners, students, ecom, affiliate). Smart and capable but spending time gaming on Discord instead of building
- **The founder's angle**: Already a hustler making money online. Wants to pull friends into the same mindset
- **Key insight**: These are gamers — wired for competition, progression, streaks, leaderboards. The bots tap into that psychology
- **Current state**: v1.0 shipped — 16,041 LOC TypeScript, 22 slash commands, 12 modules, per-member encryption, AI assistant, auto-feeds. Ready for deployment and real-world testing
- **Tech stack**: discord.js, Prisma 7, OpenRouter (DeepSeek V3.2 + Qwen 3.5 Plus), node-cron, rss-parser, PM2

## Constraints

- **Platform**: Discord only
- **Scale**: 10-25 members — depth over breadth
- **Maintenance**: Single person — must be reliable and low-maintenance
- **Budget**: Flexible but cost-effective. AI costs ~$0.03/day via DeepSeek V3.2

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Discord as sole platform | Friends already live on Discord, zero friction | ✓ Good — all features work within Discord |
| Interest-based (not three lanes) | Group is diverse, rigid lanes don't fit | ✓ Good — replaced lanes with AI-extracted interest tags |
| Gamification-first approach | Leverage gamer psychology for behavior change | ✓ Good — XP, ranks, seasons, leaderboards all shipped |
| DeepSeek V3.2 via OpenRouter | 164K context at $0.26/M tokens — best value | ✓ Good — used for AI chat, briefs, nudges, content filtering |
| Per-member encryption | Owner-blind privacy builds trust | ✓ Good — AES-256-GCM with HKDF key derivation |
| Multi-account identity | Most members have 2+ Discord accounts | ✓ Good — unified XP, notification routing per account |
| DM-based private space | True privacy, not just "private" channels | ✓ Good — both DM and channel options available |

---
*Last updated: 2026-03-20 after v1.0 milestone*
