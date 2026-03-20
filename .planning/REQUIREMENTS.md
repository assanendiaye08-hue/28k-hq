# Requirements: Discord Hustler

**Defined:** 2026-03-20
**Core Value:** When a member opens Discord, the environment pulls them into productive action — not gaming. The server must make hustling feel like the game.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Foundation

- [ ] **FNDN-01**: Bot framework deployed on member's VPS with reliable uptime and auto-deploy via git push
- [ ] **FNDN-02**: Discord server structure — channel categories, roles, permissions, and onboarding flow for new members
- [ ] **FNDN-03**: Member profiles — fluid/customizable interests and focus areas, not rigid lanes. Feels tailor-made per person
- [ ] **FNDN-04**: Per-member private space — member chooses DM (fully private) or private server channel (more integrated) for personal tracking and AI interaction
- [ ] **FNDN-05**: Multi-account identity system — link multiple Discord accounts to one member profile. XP/streaks/data count once per identity
- [ ] **FNDN-06**: Per-notification-type account routing — members choose which linked account receives briefs, nudges, etc.

### Daily Engagement

- [ ] **ENGAGE-01**: Daily check-in via `/checkin` — log what you did today with flexible scoring (not rigid pass/fail streaks)
- [ ] **ENGAGE-02**: Goal setting via `/setgoal` — set weekly/monthly goals with progress tracking
- [ ] **ENGAGE-03**: XP engine — earn XP from check-ins, goals completed, voice sessions, wins posted
- [ ] **ENGAGE-04**: Rank/role progression — level up from XP and unlock Discord roles automatically
- [ ] **ENGAGE-05**: Morning briefs — daily personalized message in member's private space (goals, streak status, rank, activity summary)

### Competition

- [ ] **COMP-01**: Multi-dimensional leaderboards — weekly rankings by XP, voice hours, and streaks
- [ ] **COMP-02**: Voice session tracking — track time spent in co-working voice channels ("hours locked in")
- [ ] **COMP-03**: Wins/lessons channels — bot detects posts in #wins and #lessons, awards XP, reacts
- [ ] **COMP-04**: Seasonal system — Valorant-style seasons with leaderboard resets. Past seasons archived and viewable anytime

### AI Assistant

- [ ] **AI-01**: Conversational AI in private space — general chat, advice, brainstorming via OpenRouter models
- [ ] **AI-02**: Context-aware morning briefs — AI incorporates member's goals, streak, interests, and recent activity
- [ ] **AI-03**: Accountability nudges — evening message if member hasn't checked in that day, sent to preferred account

### Content

- [ ] **CONT-01**: Resource sharing channels — organized by interest area, members can post and discuss
- [ ] **CONT-02**: Auto-feeds — bot posts relevant content from RSS/APIs into appropriate channels

### Sessions

- [ ] **SESS-01**: Member-initiated lock-in sessions — member asks bot to schedule a session, bot announces to server and tracks who attends

### Trust & Privacy

- [ ] **TRUST-01**: `/mydata` command — members can view everything the bot stores about them
- [ ] **TRUST-02**: Data deletion — members can wipe all their stored data with a command
- [ ] **TRUST-03**: Owner-blind privacy — private conversations and data members mark as private are not accessible to server admins, only to the member themselves

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Engagement

- **ADV-01**: Weekly auto-challenges — bot posts weekly challenges with XP rewards
- **ADV-02**: Skill trees — per-focus-area progression paths (e.g., freelance: first client → $1k → $5k)
- **ADV-03**: Buddy/accountability partner matching

### Advanced AI

- **ADVAI-01**: Advanced AI coaching — deeper insights, pattern recognition across weeks of data
- **ADVAI-02**: Per-feature opt-out — members can disable specific tracking (e.g., voice tracking) for themselves

## Out of Scope

| Feature | Reason |
|---------|--------|
| Investing/trading lane | Not a focus for this group right now |
| Mobile app | Discord IS the platform |
| Paid membership / monetization | This is for friends, not a business |
| Real-time chat features (beyond Discord) | Discord handles messaging natively |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FNDN-01 | — | Pending |
| FNDN-02 | — | Pending |
| FNDN-03 | — | Pending |
| FNDN-04 | — | Pending |
| FNDN-05 | — | Pending |
| FNDN-06 | — | Pending |
| ENGAGE-01 | — | Pending |
| ENGAGE-02 | — | Pending |
| ENGAGE-03 | — | Pending |
| ENGAGE-04 | — | Pending |
| ENGAGE-05 | — | Pending |
| COMP-01 | — | Pending |
| COMP-02 | — | Pending |
| COMP-03 | — | Pending |
| COMP-04 | — | Pending |
| AI-01 | — | Pending |
| AI-02 | — | Pending |
| AI-03 | — | Pending |
| CONT-01 | — | Pending |
| CONT-02 | — | Pending |
| SESS-01 | — | Pending |
| TRUST-01 | — | Pending |
| TRUST-02 | — | Pending |
| TRUST-03 | — | Pending |

**Coverage:**
- v1 requirements: 24 total
- Mapped to phases: 0
- Unmapped: 24 ⚠️

---
*Requirements defined: 2026-03-20*
*Last updated: 2026-03-20 after initial definition*
