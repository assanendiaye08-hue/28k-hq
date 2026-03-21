# Requirements: Discord Hustler

**Defined:** 2026-03-20
**Core Value:** When a member opens Discord, the environment pulls them into productive action -- not gaming. The server must make hustling feel like the game.

## v1.1 Requirements

Requirements for v1.1 Depth milestone. Each maps to roadmap phases.

### AI Infrastructure

- [x] **INFRA-01**: Centralize all OpenRouter API calls through a single shared client with per-request token tracking
- [x] **INFRA-02**: Per-member daily and monthly token budgets -- configurable, with graceful degradation when limits hit (template fallback, not hard block)
- [x] **INFRA-03**: Admin /cost command showing total tokens used, per-member breakdown, and estimated cost
- [x] **INFRA-04**: Tiered memory system (hot/warm/cold) -- recent data verbatim, weekly patterns summarized, historical compressed. Nothing lost from DB, only prompt assembly is tiered
- [x] **INFRA-05**: Configurable model per use case -- chat (large context model), structured output (json_schema model), fallback. Swappable without code changes

### Productivity Timer

- [x] **TIMER-01**: Member can start a pomodoro timer with configurable work/break lengths (default 25/5) via /timer command
- [x] **TIMER-02**: Member can start a proportional break timer -- work as long as you want, press pause, get a break relative to time worked (default 5:1 ratio)
- [x] **TIMER-03**: Member can define what they're working on when starting a timer -- tied to an active goal or free-text description
- [x] **TIMER-04**: Timer sessions award XP on completion and are tracked for stats (duration, what was worked on)

### Goal Hierarchy

- [x] **GOAL-01**: Member can set goals at any level (yearly, quarterly, monthly, weekly, daily) -- optional depth, not forced
- [x] **GOAL-02**: Child goals cascade progress to parent goals -- completing a weekly goal updates the monthly goal it belongs to
- [ ] **GOAL-03**: Jarvis can help decompose a big goal into smaller sub-goals through a conversational DM flow
- [ ] **GOAL-04**: Member can view their goal tree showing the hierarchy and progress at each level

### Self-Evaluation

- [ ] **REFLECT-01**: Member can configure reflection intensity (light: 1/week, medium: 3-4/week + monthly, heavy: daily + weekly + monthly)
- [ ] **REFLECT-02**: Jarvis asks AI-personalized reflection questions based on the member's actual activity -- not generic templates
- [ ] **REFLECT-03**: Reflection data feeds back into Jarvis's context -- referenced in briefs, nudges, and conversations to give targeted suggestions
- [ ] **REFLECT-04**: Reflection responses inform Jarvis's forward-looking suggestions (what to focus on next week, patterns to break, strengths to lean into)

### Inspiration

- [x] **INSP-01**: Member can set 1-3 inspirations (people they admire) via /inspiration command with optional context about why
- [x] **INSP-02**: Member can ask Jarvis "what would [inspiration] do?" and get a response in that person's spirit
- [x] **INSP-03**: Jarvis naturally references member's inspirations in briefs and nudges when contextually relevant -- not forced or spammy

### Smart Reminders

- [x] **REMIND-01**: Member can set time-based reminders using natural language ("remind me Tuesday at 3pm to call X") parsed via chrono-node
- [x] **REMIND-02**: Reminders support urgency tiers -- low (quiet DM) and high (DM with emphasis + repeat if not acknowledged)
- [x] **REMIND-03**: Member can set recurring reminders ("every Monday at 9am remind me to...")
- [x] **REMIND-04**: Reminder delivery uses a pluggable backend interface -- Discord DM for now, designed for future Apple ecosystem integration

### Monthly Recap

- [ ] **RECAP-01**: Member receives a monthly progress recap via DM -- AI-generated commentary on patterns, growth, and suggestions based on the month's data
- [ ] **RECAP-02**: Member can react to share their recap to #wins channel -- social proof and motivation

## v2 Requirements

Deferred to future release.

### Advanced Engagement

- **ADV-01**: Weekly auto-challenges -- bot posts weekly challenges with XP rewards
- **ADV-02**: Skill trees -- per-focus-area progression paths
- **ADV-03**: Buddy/accountability partner matching

### Advanced AI

- **ADVAI-01**: Advanced AI coaching -- deeper pattern recognition across weeks of data
- **ADVAI-02**: Per-feature opt-out -- members can disable specific tracking

### Platform Integration

- **PLAT-01**: Apple ecosystem integration -- APNs push notifications, Shortcuts actions
- **PLAT-02**: Enhanced content curation -- more personalized per-member, AI discovers sources

## Out of Scope

| Feature | Reason |
|---------|--------|
| Investing/trading lane | Not a focus for this group |
| Mobile app | Discord IS the platform (Apple integration is notification-level only) |
| Paid membership / monetization | This is for friends, not a business |
| Visual chart images for recap | AI commentary is sufficient -- avoids canvas dependency complexity |
| Voice channel integration for timers | Timer is a solo tool, voice tracking already handles co-working |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 7 | Complete |
| INFRA-02 | Phase 7 | Complete |
| INFRA-03 | Phase 7 | Complete |
| INFRA-04 | Phase 7 | Complete |
| INFRA-05 | Phase 7 | Complete |
| INSP-01 | Phase 8 | Complete |
| INSP-02 | Phase 8 | Complete |
| INSP-03 | Phase 8 | Complete |
| TIMER-01 | Phase 9 | Complete |
| TIMER-02 | Phase 9 | Complete |
| TIMER-03 | Phase 9 | Complete |
| TIMER-04 | Phase 9 | Complete |
| REMIND-01 | Phase 10 | Complete |
| REMIND-02 | Phase 10 | Complete |
| REMIND-03 | Phase 10 | Complete |
| REMIND-04 | Phase 10 | Complete |
| GOAL-01 | Phase 11 | Complete |
| GOAL-02 | Phase 11 | Complete |
| GOAL-03 | Phase 11 | Pending |
| GOAL-04 | Phase 11 | Pending |
| REFLECT-01 | Phase 12 | Pending |
| REFLECT-02 | Phase 12 | Pending |
| REFLECT-03 | Phase 12 | Pending |
| REFLECT-04 | Phase 12 | Pending |
| RECAP-01 | Phase 13 | Pending |
| RECAP-02 | Phase 13 | Pending |

**Coverage:**
- v1.1 requirements: 26 total
- Mapped to phases: 26
- Unmapped: 0

---
*Requirements defined: 2026-03-20*
*Last updated: 2026-03-20 after roadmap creation*
