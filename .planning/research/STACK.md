# Technology Stack: Peak Performance Principles

**Project:** Discord Hustler v3.0 (Jarvis Coach Evolution)
**Researched:** 2026-03-22

## Context

This research is about first principles of human performance, not technology choices. The existing tech stack (discord.js, Tauri, Fastify, Prisma, OpenRouter) is already validated and appropriate. This file documents how the research findings map to implementation within the existing stack.

## No Stack Changes Required

The peak performance research does not suggest any technology changes. The findings are about behavioral patterns, coaching logic, and feature design -- all implementable within the current architecture.

| Existing Technology | Research Alignment | Notes |
|--------------------|--------------------|-------|
| Tauri v2 (desktop app) | Focus protection requires a dedicated surface separate from distracting environments (browser, Discord) | Correct choice. Desktop app IS the focus fortress. |
| Discord.js (bot) | Social accountability and coaching happen best in a platform where users already spend time | Correct choice. DMs for coaching, server for social proof. |
| Fastify (API) | Shared backend enables consistent data across focus (desktop) and social (Discord) surfaces | Correct choice. Session data, goals, XP flow through one truth layer. |
| Prisma (database) | Single source of truth for all tracking, goals, streaks, and coaching data | Correct choice. |
| OpenRouter / Grok 4.1 Fast | AI coaching requires large context window for personalized responses based on member history | Correct choice. 2M context supports rich coaching conversations. |
| node-cron | Scheduled coaching routines (morning briefs, evening reviews) need reliable timing | Correct choice. |

## Implementation Considerations from Research

### Notification Queue System

**Research basis:** Focus fortress mode requires batching all notifications during active timer sessions.

**Implementation:** Add a simple notification queue (in-memory or database-backed) that:
1. Checks for active timer session before sending any notification
2. Queues notifications if session is active
3. Delivers queued notifications when session completes (via API webhook or polling)

This is a feature within the existing stack, not a new technology.

### Coaching Configuration Schema

**Research basis:** Individual variation requires per-user coaching settings.

**Implementation:** Extend the existing member settings in Prisma with coaching preferences:
- `coachingIntensity`: minimal | moderate | aggressive
- `dayStartTime`: user's preferred "morning" hour
- `weeklyPlanDay`: preferred day for weekly planning prompt
- `peakHoursStart` / `peakHoursEnd`: self-reported or system-detected peak hours
- `streakGraceDays`: number of allowed skip days (default: 1)

### Session Transition Data

**Research basis:** End-of-session transition rituals reduce attention residue.

**Implementation:** Extend timer session schema to include optional post-session fields:
- `completionNote`: brief text on what was accomplished
- `nextAction`: what the user plans to do next
- `sessionQuality`: optional 1-3 self-rating

These fields are captured by the desktop app when a timer session ends.

### Trend Detection for Sustainability

**Research basis:** Detecting declining patterns early prevents burnout.

**Implementation:** Periodic (weekly) aggregation query on session data:
- Average daily focus hours (rolling 7-day)
- Session time distribution (are sessions getting later at night?)
- Check-in completion rate trend
- Streak break frequency

This feeds into Jarvis's weekly recap and can trigger gentle concern prompts. No ML required -- simple threshold-based heuristics on existing data.

## Sources

- No new technology sources needed. All implementation maps to existing stack.
- Research sources documented in PEAK-PERFORMANCE.md and SUMMARY.md.
