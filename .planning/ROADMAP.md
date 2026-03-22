# Roadmap: Discord Hustler

## Milestones

- ✅ **v1.0 MVP** — Phases 1-6 (shipped 2026-03-20)
- ✅ **v1.1 Depth** — Phases 7-13 (shipped 2026-03-21)
- ✅ **v2.0 Desktop Companion App** — Phases 14-19 (shipped 2026-03-22)
- 🚧 **v3.0 Jarvis Coach Evolution** — Phases 20-24 (in progress)

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

<details>
<summary>✅ v2.0 Desktop Companion App (Phases 14-19) — SHIPPED 2026-03-22</summary>

- [x] Phase 14: Monorepo Restructure (2/2 plans) — completed 2026-03-21
- [x] Phase 15: REST API + Authentication (2/2 plans) — completed 2026-03-21
- [x] Phase 16: Desktop Shell + Dashboard + Goals View (3/3 plans) — completed 2026-03-21
- [x] Phase 17: Pomodoro Timer (3/3 plans) — completed 2026-03-22
- [x] Phase 18: Flowmodoro + Goals Editing (2/2 plans) — completed 2026-03-22
- [x] Phase 19: Cross-Platform Sync + Polish (2/2 plans) — completed 2026-03-22

Full details: .planning/milestones/v2.0-ROADMAP.md

</details>

### v3.0 Jarvis Coach Evolution (Phases 20-24)

**Milestone Goal:** Transform Jarvis from a slash-command assistant into a proactive conversational coach. Remove legacy modules (timer, auto-feed, private channels), shift to natural language DM interactions, add daily coaching routines with per-user settings, refine social mechanics, and enhance the desktop app with a focused Today view.

- [ ] **Phase 20: Clean Slate** - Remove legacy modules, establish focus session signaling between desktop and bot
- [ ] **Phase 21: Conversational Jarvis** - Natural language actions, commitment extraction, topic-aware context, coaching tone, brainstorming
- [ ] **Phase 22: Daily Rhythm** - Morning briefs, evening reflections, weekly planning, smart nudges, outreach budget, coaching settings
- [ ] **Phase 23: Social Layer Refinement** - Voice co-working promotion, streak redesign, channel consolidation, accountability tone
- [ ] **Phase 24: Desktop App Enhancement** - Today view, session history, who's grinding indicator

## Phase Details

### Phase 20: Clean Slate
**Goal**: Bot runs leaner with legacy modules removed, desktop app can signal focus sessions to the bot, and all private member interactions happen via DMs
**Depends on**: Phase 19 (v2.0 complete)
**Requirements**: CLEAN-01, FOCUS-02 (merged), CLEAN-02, CLEAN-03, CLEAN-04, FOCUS-01
**Success Criteria** (what must be TRUE):
  1. Bot starts and runs without the timer module -- no timer commands exist, no timer-related code remains in the bot codebase
  2. Bot starts and runs without the auto-feed module -- no RSS/YouTube/Reddit feed commands or scheduled fetches remain
  3. Only /goals, /reminders, /leaderboard, and /announce-update slash commands remain -- all others are removed
  4. No per-member private channels exist in the server -- all private interaction happens via DMs
  5. When a member starts a timer session in the desktop app, the bot receives a signal and holds non-critical messages until the session ends
**Plans**: 2 plans

Plans:
- [x] 20-01-PLAN.md -- Remove timer + auto-feed modules, strip slash commands to 4 remaining
- [ ] 20-02-PLAN.md -- DMs-only delivery refactor + focus session signaling between desktop and bot

### Phase 21: Conversational Jarvis
**Goal**: Members interact with Jarvis through natural conversation in DMs -- managing goals, check-ins, and reminders without slash commands -- with topic-aware context and a direct, objective coaching tone
**Depends on**: Phase 20
**Requirements**: JARV-01, JARV-02, JARV-03, JARV-04, JARV-05
**Success Criteria** (what must be TRUE):
  1. Member can say "I finished the API endpoints today" in DMs and Jarvis detects a check-in, confirms before logging it, and awards XP on confirmation
  2. Member can say "I'll have the landing page done by Friday" and Jarvis extracts the commitment, confirms the deadline, and tracks it -- surfacing it in future interactions
  3. When discussing fitness goals, Jarvis does not bleed in context from coding projects or unrelated topics
  4. Jarvis responds with direct, factual brevity -- no pleasantries, no filler, no faked emotions, no unsolicited life advice -- and asks questions when the member needs to think rather than volunteering answers
  5. Member can say "let's brainstorm landing page ideas" and Jarvis runs a structured creative thinking session with distinct phases (diverge, cluster, evaluate)
**Plans**: TBD

Plans:
- [ ] 21-01: TBD
- [ ] 21-02: TBD
- [ ] 21-03: TBD

### Phase 22: Daily Rhythm
**Goal**: Jarvis proactively coaches members through daily and weekly routines -- morning orientation, evening closure, weekly planning, smart nudges -- all respecting per-user settings and a hard cap on bot-initiated messages
**Depends on**: Phase 21
**Requirements**: RHYTHM-01, RHYTHM-02, RHYTHM-03, RHYTHM-04, RHYTHM-05, SET-01, SET-02, SET-03
**Success Criteria** (what must be TRUE):
  1. Member receives a morning brief DM at their configured time showing today's commitments, upcoming deadlines, and a focus prompt -- and can reply conversationally to adjust priorities
  2. Member receives an end-of-day reflection DM that closes open loops, logs what was accomplished, and captures tomorrow's top priority
  3. Member receives a Sunday weekly review DM summarizing the week's goal progress and prompting next week's priorities
  4. Member with a stale goal (no progress in 5+ days) receives a nudge -- but a member who has been disengaged gets fewer nudges, not more
  5. No member receives more than 2-3 bot-initiated DMs per day across all feature types combined, and members can configure quiet hours, enable/disable individual features, and set preferences through a coaching onboarding flow on first interaction
**Plans**: TBD

Plans:
- [ ] 22-01: TBD
- [ ] 22-02: TBD
- [ ] 22-03: TBD

### Phase 23: Social Layer Refinement
**Goal**: The Discord server structure is tightened -- fewer channels that matter more, voice co-working promoted as the flagship social feature, streaks redesigned to encourage consistency without punishment, and the bot absorbs accountability friction so friends can focus on support
**Depends on**: Phase 22
**Requirements**: SOCIAL-01, SOCIAL-02, SOCIAL-03, SOCIAL-04
**Success Criteria** (what must be TRUE):
  1. Voice co-working (lock-in sessions) is prominently featured in the server -- visible as the primary social productivity activity, not buried among other features
  2. A member who misses one day of their streak does not reset to zero -- the system tracks consistency rate and applies a two-day grace rule, preserving historical progress
  3. The server has fewer, higher-signal channels -- resource channels consolidated, private spaces category removed, channel layout makes the server feel focused rather than sprawling
  4. When a member has declining activity or missed commitments, the bot delivers the hard truth directly in DMs so that friends in public channels focus on celebration and support rather than confrontation
**Plans**: TBD

Plans:
- [ ] 23-01: TBD
- [ ] 23-02: TBD

### Phase 24: Desktop App Enhancement
**Goal**: The desktop app gains a focused Today view for execution mode, session history for review, and a community presence indicator so members can see who is working without opening Discord
**Depends on**: Phase 20 (focus signaling), Phase 22 (daily rhythm data)
**Requirements**: APP-01, APP-02, APP-03
**Success Criteria** (what must be TRUE):
  1. Member opens the desktop app and sees a Today view showing their current priority, active timer status, and today's goals -- stripped to essentials, glanceable in 2 seconds
  2. Member can view their past work sessions with goal labels and duration -- a simple history, not an analytics dashboard
  3. Member can see which community members are currently in a voice channel or running a timer session, without opening Discord -- the "library effect" indicator
**Plans**: TBD

Plans:
- [ ] 24-01: TBD
- [ ] 24-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 20 -> 21 -> 22 -> 23 -> 24

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-6 | v1.0 | 18/18 | Complete | 2026-03-20 |
| 7-13 | v1.1 | 17/17 | Complete | 2026-03-21 |
| 14-19 | v2.0 | 14/14 | Complete | 2026-03-22 |
| 20. Clean Slate | v3.0 | 1/2 | In Progress | - |
| 21. Conversational Jarvis | v3.0 | 0/3 | Not started | - |
| 22. Daily Rhythm | v3.0 | 0/3 | Not started | - |
| 23. Social Layer Refinement | v3.0 | 0/2 | Not started | - |
| 24. Desktop App Enhancement | v3.0 | 0/2 | Not started | - |
