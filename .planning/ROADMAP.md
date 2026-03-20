# Roadmap: Discord Hustler

## Overview

Transform a Discord server into a gamified productivity environment that makes hustling feel like the game for 10-25 former gamers. The build progresses from a deployable bot with server structure and member identity, through the daily engagement loop that makes people come back, into competitive and social layers that create the flywheel, then a personal AI assistant that ties it all together with intelligence, and finally sessions, content feeds, and trust controls that round out the experience.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation and Identity** - Bot framework, server structure, member profiles with multi-account identity, private spaces, and per-member data encryption
- [ ] **Phase 2: Daily Engagement Loop** - Check-ins, goals, XP engine, rank progression, and morning briefs that make the server a daily habit
- [ ] **Phase 3: Competition and Social Proof** - Leaderboards, voice tracking, wins/lessons channels, and seasonal system that make hustling competitive
- [ ] **Phase 4: AI Assistant** - Conversational AI per member via OpenRouter, context-aware briefs, and accountability nudges
- [ ] **Phase 5: Content, Sessions, and Trust** - Resource feeds, lock-in sessions, and member data transparency/privacy controls
- [ ] **Phase 6: Polish and Tuning** - Auto-content feeds, notification routing refinement, and end-to-end hardening before launch

## Phase Details

### Phase 1: Foundation and Identity
**Goal**: Members can join the server, create a fluid profile with their interests, link multiple Discord accounts to one identity, and have a private space for personal tracking
**Depends on**: Nothing (first phase)
**Requirements**: FNDN-01, FNDN-02, FNDN-03, FNDN-04, FNDN-05, TRUST-04
**Success Criteria** (what must be TRUE):
  1. Bot is running on VPS with auto-deploy via git push, and stays up after restart
  2. Discord server has organized channel categories, roles, and a clear onboarding flow that a new member can follow without help
  3. Member can set up a fluid profile with customizable interests and focus areas (not rigid lane assignment)
  4. Member can choose between DM-based or private-channel-based personal space, and the bot communicates with them there
  5. Member can link multiple Discord accounts to a single identity so XP and data are unified across accounts
  6. Private member data is encrypted at rest with per-member keys; member receives a personal recovery key via DM; raw DB access reveals only encrypted blobs
**Plans:** 4 plans

Plans:
- [ ] 01-01-PLAN.md -- Project scaffolding, bot core, module loader, command router
- [ ] 01-02-PLAN.md -- Database schema, per-member encryption, deployment pipeline
- [ ] 01-03-PLAN.md -- Server structure, onboarding flow, private spaces
- [ ] 01-04-PLAN.md -- AI profile extraction, visibility controls, account linking

### Phase 2: Daily Engagement Loop
**Goal**: Members have a reason to open Discord every day -- they check in, track goals, earn XP, see their rank progress, and receive a personalized morning brief
**Depends on**: Phase 1
**Requirements**: ENGAGE-01, ENGAGE-02, ENGAGE-03, ENGAGE-04, ENGAGE-05
**Success Criteria** (what must be TRUE):
  1. Member can run `/checkin` to log daily activity with flexible scoring (not rigid pass/fail)
  2. Member can run `/setgoal` to create weekly or monthly goals and see progress toward them
  3. Member earns XP from check-ins and completed goals, and can see their total XP
  4. Member's Discord role automatically updates when they level up through XP thresholds
  5. Member receives a morning brief in their private space with their goals, streak status, rank, and recent activity
**Plans**: TBD

Plans:
- [ ] 02-01: TBD
- [ ] 02-02: TBD
- [ ] 02-03: TBD

### Phase 3: Competition and Social Proof
**Goal**: Members compete on visible leaderboards, earn XP from voice co-working and sharing wins, and play within a seasonal system that keeps competition fresh
**Depends on**: Phase 2
**Requirements**: COMP-01, COMP-02, COMP-03, COMP-04
**Success Criteria** (what must be TRUE):
  1. Member can view weekly leaderboards ranked by XP, voice hours, and streaks -- multiple dimensions prevent a single permanent winner
  2. Time spent in co-working voice channels is automatically tracked and awards XP
  3. Posts in #wins and #lessons are detected by the bot, awarded XP, and reacted to
  4. Seasons run on a defined cycle with leaderboard resets, and past seasons are archived and viewable anytime
**Plans**: TBD

Plans:
- [ ] 03-01: TBD
- [ ] 03-02: TBD

### Phase 4: AI Assistant
**Goal**: Each member has a personal AI assistant in their private space that knows their goals, history, and context -- powered by OpenRouter
**Depends on**: Phase 2
**Requirements**: AI-01, AI-02, AI-03
**Success Criteria** (what must be TRUE):
  1. Member can have a natural conversation with an AI assistant in their private space for advice, brainstorming, and general chat
  2. Morning briefs incorporate AI-generated personalization using the member's goals, streak, interests, and recent activity (not just template fill-in)
  3. Member receives an evening nudge if they haven't checked in that day, sent to their preferred account
**Plans**: TBD

Plans:
- [ ] 04-01: TBD
- [ ] 04-02: TBD

### Phase 5: Content, Sessions, and Trust
**Goal**: Members can share and discover resources, schedule co-working sessions, and have full transparency and control over their data
**Depends on**: Phase 3, Phase 4
**Requirements**: CONT-01, SESS-01, TRUST-01, TRUST-02, TRUST-03
**Success Criteria** (what must be TRUE):
  1. Resource sharing channels exist organized by interest area, and members can post and discuss in them
  2. Member can ask the bot to schedule a lock-in session; the bot announces it to the server and tracks who attends
  3. Member can run `/mydata` and see everything the bot stores about them
  4. Member can wipe all their stored data with a single command
  5. Private conversations and data marked as private are not accessible to server admins -- only to the member themselves
**Plans**: TBD

Plans:
- [ ] 05-01: TBD
- [ ] 05-02: TBD
- [ ] 05-03: TBD

### Phase 6: Polish and Launch Readiness
**Goal**: Auto-content feeds are running, notification routing is dialed in across linked accounts, and the system is hardened for daily use by the full group
**Depends on**: Phase 5
**Requirements**: FNDN-06, CONT-02
**Success Criteria** (what must be TRUE):
  1. Bot automatically posts relevant content from RSS/APIs into appropriate channels on a schedule
  2. Members can configure which of their linked accounts receives each notification type (briefs, nudges, session alerts)
  3. The full system runs for 7 days without manual intervention and handles edge cases gracefully (member leaves/rejoins, bot restart, empty leaderboard states)
**Plans**: TBD

Plans:
- [ ] 06-01: TBD
- [ ] 06-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6
Note: Phases 3 and 4 can execute in parallel after Phase 2 completes.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation and Identity | 2/4 | In Progress | - |
| 2. Daily Engagement Loop | 0/3 | Not started | - |
| 3. Competition and Social Proof | 0/2 | Not started | - |
| 4. AI Assistant | 0/2 | Not started | - |
| 5. Content, Sessions, and Trust | 0/3 | Not started | - |
| 6. Polish and Launch Readiness | 0/2 | Not started | - |
