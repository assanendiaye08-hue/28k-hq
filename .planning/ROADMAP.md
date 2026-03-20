# Roadmap: Discord Hustler

## Milestones

- ✅ **v1.0 MVP** -- Phases 1-6 (shipped 2026-03-20)
- 🚧 **v1.1 Depth** -- Phases 7-13 (in progress)

## Phases

<details>
<summary>v1.0 MVP (Phases 1-6) -- SHIPPED 2026-03-20</summary>

- [x] Phase 1: Foundation and Identity (4/4 plans) -- completed 2026-03-20
- [x] Phase 2: Daily Engagement Loop (3/3 plans) -- completed 2026-03-20
- [x] Phase 3: Competition and Social Proof (3/3 plans) -- completed 2026-03-20
- [x] Phase 4: AI Assistant (2/2 plans) -- completed 2026-03-20
- [x] Phase 5: Content, Sessions, and Trust (3/3 plans) -- completed 2026-03-20
- [x] Phase 6: Polish and Launch Readiness (3/3 plans) -- completed 2026-03-20

Full details: .planning/milestones/v1.0-ROADMAP.md

</details>

### v1.1 Depth (In Progress)

**Milestone Goal:** Make the server deeper and stickier -- structured goal planning, focused work sessions, self-reflection, inspiration, progress visibility, and smart reminders.

- [ ] **Phase 7: AI Infrastructure** - Centralize AI client, cost tracking, tiered memory, configurable models
- [ ] **Phase 8: Inspiration System** - Members set people they admire, Jarvis references them naturally
- [ ] **Phase 9: Productivity Timer** - Pomodoro and proportional break timers with XP integration
- [ ] **Phase 10: Smart Reminders** - Natural language time-based reminders with urgency tiers
- [ ] **Phase 11: Goal Hierarchy** - Optional yearly-to-daily goal decomposition with Jarvis-assisted breakdown
- [ ] **Phase 12: Self-Evaluation and Reflection** - Configurable intensity reflection flows with AI-personalized questions
- [ ] **Phase 13: Monthly Progress Recap** - AI-generated monthly summary DM, shareable to #wins

## Phase Details

### Phase 7: AI Infrastructure
**Goal**: All AI interactions flow through a single, cost-tracked, budget-aware client with tiered memory and configurable models
**Depends on**: Phase 6 (v1.0 complete)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05
**Success Criteria** (what must be TRUE):
  1. Every AI call in the codebase routes through the centralized client -- no direct OpenRouter calls remain
  2. Admin can run /cost and see per-member token usage and estimated dollar cost for current day and month
  3. When a member exceeds their daily token budget, AI responses gracefully degrade to template fallbacks instead of failing silently or hard-blocking
  4. AI prompts for any member include tiered context -- recent data verbatim, weekly patterns summarized, historical data compressed -- without losing any underlying DB data
  5. Swapping the primary model (e.g., DeepSeek to Grok) requires only a config change, not code changes
**Plans**: TBD

### Phase 8: Inspiration System
**Goal**: Members can set people they admire and Jarvis weaves those inspirations naturally into AI interactions
**Depends on**: Phase 7
**Requirements**: INSP-01, INSP-02, INSP-03
**Success Criteria** (what must be TRUE):
  1. Member can add up to 3 inspirations with optional context about why they admire each person via /inspiration command
  2. Member can ask Jarvis "what would [inspiration] do?" and receive a response grounded in that person's known philosophy and style
  3. Jarvis references a member's inspirations in morning briefs and nudges when contextually relevant -- without forcing it into every message
**Plans**: TBD

### Phase 9: Productivity Timer
**Goal**: Members can run structured focus sessions with configurable work/break intervals that award XP and track what was worked on
**Depends on**: Phase 7
**Requirements**: TIMER-01, TIMER-02, TIMER-03, TIMER-04
**Success Criteria** (what must be TRUE):
  1. Member can start a pomodoro timer with custom work/break lengths (default 25/5) and receives notifications when intervals end
  2. Member can start a proportional break timer -- work freely, then press pause to get a break proportional to time worked (default 5:1 ratio)
  3. Member can specify what they are working on when starting a timer -- either linked to an active goal or as free-text -- and this shows in their timer status
  4. Completed timer sessions award XP and are persisted for stats (duration, description, timestamps)
  5. Active timers survive bot restarts -- members do not lose their running sessions when PM2 auto-restarts
**Plans**: TBD

### Phase 10: Smart Reminders
**Goal**: Members can set time-based reminders in natural language with urgency levels and recurring schedules
**Depends on**: Phase 7
**Requirements**: REMIND-01, REMIND-02, REMIND-03, REMIND-04
**Success Criteria** (what must be TRUE):
  1. Member can set a reminder using natural language time expressions ("remind me Tuesday at 3pm to call X") and the bot correctly parses and schedules it
  2. Reminders support urgency tiers -- low urgency delivers a quiet DM, high urgency delivers an emphasized DM with repeat if not acknowledged
  3. Member can set recurring reminders ("every Monday at 9am remind me to...") that fire on schedule indefinitely until cancelled
  4. Reminder delivery uses a pluggable backend interface -- Discord DM implementation now, designed so Apple push notifications can be added later without rewriting the scheduler
  5. Pending reminders survive bot restarts and fire at their scheduled times after recovery
**Plans**: TBD

### Phase 11: Goal Hierarchy
**Goal**: Members can organize goals in an optional hierarchy (yearly to daily) with cascading progress and Jarvis-assisted decomposition
**Depends on**: Phase 7
**Requirements**: GOAL-01, GOAL-02, GOAL-03, GOAL-04
**Success Criteria** (what must be TRUE):
  1. Member can set goals at any level (yearly, quarterly, monthly, weekly, daily) and optionally nest them under parent goals -- standalone goals continue working exactly as in v1.0
  2. Completing a child goal automatically updates progress on its parent goal, cascading up the hierarchy
  3. Member can ask Jarvis to help break down a big goal into smaller sub-goals through a conversational DM flow, and the resulting sub-goals are created and linked automatically
  4. Member can view their goal tree showing the full hierarchy with progress percentages at each level
**Plans**: TBD

### Phase 12: Self-Evaluation and Reflection
**Goal**: Members receive AI-personalized reflection prompts at their chosen intensity, and their responses feed back into Jarvis for smarter suggestions
**Depends on**: Phase 7, Phase 11
**Requirements**: REFLECT-01, REFLECT-02, REFLECT-03, REFLECT-04
**Success Criteria** (what must be TRUE):
  1. Member can configure reflection intensity -- light (1/week), medium (3-4/week + monthly), or heavy (daily + weekly + monthly) -- and receives prompts on that schedule
  2. Reflection questions are personalized based on the member's actual recent activity (goals worked on, timer sessions, check-in patterns) -- not generic templates
  3. Past reflection responses appear in Jarvis's context and are referenced in morning briefs, nudges, and conversations -- the member can see the feedback loop working
  4. Jarvis uses reflection data to make forward-looking suggestions (what to focus on next week, patterns to break, strengths to lean into) that feel specific to the member
**Plans**: TBD

### Phase 13: Monthly Progress Recap
**Goal**: Members receive a comprehensive monthly progress summary they can review privately and optionally share for social proof
**Depends on**: Phase 7, Phase 12
**Requirements**: RECAP-01, RECAP-02
**Success Criteria** (what must be TRUE):
  1. Member receives a monthly recap DM with AI-generated commentary covering patterns, growth areas, and suggestions -- drawing from check-ins, goals, timer sessions, reflections, and XP data for the month
  2. Member can react to their recap to share it to #wins channel -- providing social proof and motivation for the group
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 7 -> 8 -> 9 -> 10 -> 11 -> 12 -> 13
(Phases 8, 9, 10 all depend only on Phase 7 and could theoretically parallelize, but execute sequentially for solo dev)

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation and Identity | v1.0 | 4/4 | Complete | 2026-03-20 |
| 2. Daily Engagement Loop | v1.0 | 3/3 | Complete | 2026-03-20 |
| 3. Competition and Social Proof | v1.0 | 3/3 | Complete | 2026-03-20 |
| 4. AI Assistant | v1.0 | 2/2 | Complete | 2026-03-20 |
| 5. Content, Sessions, and Trust | v1.0 | 3/3 | Complete | 2026-03-20 |
| 6. Polish and Launch Readiness | v1.0 | 3/3 | Complete | 2026-03-20 |
| 7. AI Infrastructure | v1.1 | 0/0 | Not started | - |
| 8. Inspiration System | v1.1 | 0/0 | Not started | - |
| 9. Productivity Timer | v1.1 | 0/0 | Not started | - |
| 10. Smart Reminders | v1.1 | 0/0 | Not started | - |
| 11. Goal Hierarchy | v1.1 | 0/0 | Not started | - |
| 12. Self-Evaluation and Reflection | v1.1 | 0/0 | Not started | - |
| 13. Monthly Progress Recap | v1.1 | 0/0 | Not started | - |
