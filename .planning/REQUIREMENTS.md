# Requirements: Discord Hustler

**Defined:** 2026-03-20
**Core Value:** When a member opens Discord, the environment pulls them into productive action — not gaming. The server must make hustling feel like the game.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Foundation

- [x] **FNDN-01**: Bot framework deployed on member's VPS with reliable uptime and auto-deploy via git push
- [x] **FNDN-02**: Discord server structure — channel categories, roles, permissions, and onboarding flow for new members
- [x] **FNDN-03**: Member profiles — fluid/customizable interests and focus areas, not rigid lanes. Feels tailor-made per person
- [x] **FNDN-04**: Per-member private space — member chooses DM (fully private) or private server channel (more integrated) for personal tracking and AI interaction
- [x] **FNDN-05**: Multi-account identity system — link multiple Discord accounts to one member profile. XP/streaks/data count once per identity
- [x] **FNDN-06**: Per-notification-type account routing — members choose which linked account receives briefs, nudges, etc.

### Daily Engagement

- [x] **ENGAGE-01**: Daily check-in via `/checkin` — log what you did today with flexible scoring (not rigid pass/fail streaks)
- [x] **ENGAGE-02**: Goal setting via `/setgoal` — set weekly/monthly goals with progress tracking
- [x] **ENGAGE-03**: XP engine — earn XP from check-ins, goals completed, voice sessions, wins posted
- [x] **ENGAGE-04**: Rank/role progression — level up from XP and unlock Discord roles automatically
- [x] **ENGAGE-05**: Morning briefs — daily personalized message in member's private space (goals, streak status, rank, activity summary)

### Competition

- [x] **COMP-01**: Multi-dimensional leaderboards — weekly rankings by XP, voice hours, and streaks
- [x] **COMP-02**: Voice session tracking — track time spent in co-working voice channels ("hours locked in")
- [x] **COMP-03**: Wins/lessons channels — bot detects posts in #wins and #lessons, awards XP, reacts
- [x] **COMP-04**: Seasonal system — Valorant-style seasons with leaderboard resets. Past seasons archived and viewable anytime

### AI Assistant

- [x] **AI-01**: Conversational AI in private space — general chat, advice, brainstorming via OpenRouter models
- [x] **AI-02**: Context-aware morning briefs — AI incorporates member's goals, streak, interests, and recent activity
- [x] **AI-03**: Accountability nudges — evening message if member hasn't checked in that day, sent to preferred account

### Content

- [x] **CONT-01**: Resource sharing channels — organized by interest area, members can post and discuss
- [x] **CONT-02**: Auto-feeds — bot posts relevant content from RSS/APIs into appropriate channels

### Sessions

- [x] **SESS-01**: Member-initiated lock-in sessions — member asks bot to schedule a session, bot announces to server and tracks who attends

### Trust & Privacy

- [x] **TRUST-01**: `/mydata` command — members can view everything the bot stores about them
- [x] **TRUST-02**: Data deletion — members can wipe all their stored data with a command
- [x] **TRUST-03**: Owner-blind privacy — private conversations and data members mark as private are not accessible to server admins, only to the member themselves
- [x] **TRUST-04**: Per-member data encryption — private data encrypted with per-member keys at rest. Members receive a personal recovery key via DM for independent data export/decryption. Raw database access reveals only encrypted blobs

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
| FNDN-01 | Phase 1: Foundation and Identity | Complete |
| FNDN-02 | Phase 1: Foundation and Identity | Complete |
| FNDN-03 | Phase 1: Foundation and Identity | Complete |
| FNDN-04 | Phase 1: Foundation and Identity | Complete |
| FNDN-05 | Phase 1: Foundation and Identity | Complete |
| FNDN-06 | Phase 6: Polish and Launch Readiness | Complete |
| ENGAGE-01 | Phase 2: Daily Engagement Loop | Complete |
| ENGAGE-02 | Phase 2: Daily Engagement Loop | Complete |
| ENGAGE-03 | Phase 2: Daily Engagement Loop | Complete |
| ENGAGE-04 | Phase 2: Daily Engagement Loop | Complete |
| ENGAGE-05 | Phase 2: Daily Engagement Loop | Complete |
| COMP-01 | Phase 3: Competition and Social Proof | Complete |
| COMP-02 | Phase 3: Competition and Social Proof | Complete |
| COMP-03 | Phase 3: Competition and Social Proof | Complete |
| COMP-04 | Phase 3: Competition and Social Proof | Complete |
| AI-01 | Phase 4: AI Assistant | Complete |
| AI-02 | Phase 4: AI Assistant | Complete |
| AI-03 | Phase 4: AI Assistant | Complete |
| CONT-01 | Phase 5: Content, Sessions, and Trust | Complete |
| CONT-02 | Phase 6: Polish and Launch Readiness | Complete |
| SESS-01 | Phase 5: Content, Sessions, and Trust | Complete |
| TRUST-01 | Phase 5: Content, Sessions, and Trust | Complete |
| TRUST-02 | Phase 5: Content, Sessions, and Trust | Complete |
| TRUST-03 | Phase 5: Content, Sessions, and Trust | Complete |
| TRUST-04 | Phase 1: Foundation and Identity | Complete |

**Coverage:**
- v1 requirements: 25 total
- Mapped to phases: 25
- Unmapped: 0

---
*Requirements defined: 2026-03-20*
*Last updated: 2026-03-20 after completing FNDN-03 and FNDN-05 in Plan 01-04*
