# Requirements: Discord Hustler

**Defined:** 2026-03-22
**Core Value:** A controlled environment that accelerates ambitious people already on their path -- reducing overhead, enabling focus, and leveraging positive social mechanics.

## v3.0 Requirements

### Focus Engine

- [x] **FOCUS-01**: App signals bot "in session" / "session ended" -- bot holds messages except time-critical reminders
- [ ] **~~FOCUS-02~~**: *(Merged into CLEAN-01 -- identical requirement: remove bot timer module)*

### Conversational Jarvis

- [x] **JARV-01**: Natural language in DMs replaces slash commands for core actions (goals, check-ins, tasks, reminders)
- [x] **JARV-02**: Commitment extraction -- detects "I'll do X by Y" and confirms before tracking
- [x] **JARV-03**: Topic-aware context -- no irrelevant bleeding between conversation topics
- [x] **JARV-04**: Situationally smart -- direct when it has info, questions when user needs to think. Never fakes emotions or gives unsolicited advice.
- [x] **JARV-05**: Brainstorming mode -- structured creative thinking on request

### Daily Rhythm

- [x] **RHYTHM-01**: Morning brief DM -- today's commitments, deadlines, focus prompt
- [x] **RHYTHM-02**: Evening reflection DM -- close open loops, log what was done, set tomorrow's priority
- [x] **RHYTHM-03**: Weekly planning DM (Sunday) -- week review, goal progress, next week priorities
- [x] **RHYTHM-04**: Smart nudges -- stale goals, declining patterns. Less contact when disengaged, not more.
- [x] **RHYTHM-05**: 2-3 bot-initiated touchpoints/day max across all features

### Social Layer

- [ ] **SOCIAL-01**: Voice co-working (lock-in) promoted as flagship feature
- [x] **SOCIAL-02**: Streak graceful failure -- two-day rule, consistency rate, no hard-reset to zero
- [x] **SOCIAL-03**: Server channel consolidation -- fewer channels that matter more
- [ ] **SOCIAL-04**: Bot absorbs accountability friction -- delivers hard truths so friends focus on support

### Desktop App

- [ ] **APP-01**: Today view -- focused cockpit: current priority, active timer, today's goals
- [ ] **APP-02**: Session history -- past work sessions with goal labels
- [ ] **APP-03**: "Who's grinding" indicator -- see who's working without opening Discord

### Cleanup

- [x] **CLEAN-01**: Remove bot timer module *(includes merged FOCUS-02)*
- [x] **CLEAN-02**: DMs only -- remove private channel per-member system
- [x] **CLEAN-03**: Strip most slash commands -- keep /goals, /reminders, /leaderboard, /announce-update
- [x] **CLEAN-04**: Remove auto-feed module

### Coaching Settings

- [x] **SET-01**: Per-user config -- enable/disable each proactive feature
- [x] **SET-02**: Quiet hours -- no bot messages during set window
- [x] **SET-03**: Coaching onboarding -- timezone + preferences on first interaction

## Future Requirements (v3.1+)

- **INT-01**: Google Calendar read-only integration (surface today's events in morning brief)
- **INT-02**: Browser focus extension (block distracting sites during timer sessions)
- **INT-03**: Apple Push Notifications for morning brief on mobile

## Out of Scope

| Feature | Reason |
|---------|--------|
| Automated goal creation | Coach helps plan, never auto-creates. Trust requires confirmation. |
| Named member comparisons | "You're behind X" creates toxicity. Leaderboards are anonymous rank. |
| Activity/window tracking | Privacy violation. Timer data is sufficient. |
| Calendar sync (write) | Read-only is useful, write creates SSOT conflicts. |
| Notion/Todoist sync | SSOT violation -- the system IS the source of truth. |
| Mobile app | Desktop + Discord + push notifications covers the use case. |
| Complex badge/achievement system | Overjustification effect -- XP/streaks/ranks are sufficient gamification. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOCUS-01 | Phase 20 | Complete |
| FOCUS-02 | Phase 20 | Merged into CLEAN-01 |
| JARV-01 | Phase 21 | Complete |
| JARV-02 | Phase 21 | Complete |
| JARV-03 | Phase 21 | Complete |
| JARV-04 | Phase 21 | Complete |
| JARV-05 | Phase 21 | Complete |
| RHYTHM-01 | Phase 22 | Complete |
| RHYTHM-02 | Phase 22 | Complete |
| RHYTHM-03 | Phase 22 | Complete |
| RHYTHM-04 | Phase 22 | Complete |
| RHYTHM-05 | Phase 22 | Complete |
| SOCIAL-01 | Phase 23 | Pending |
| SOCIAL-02 | Phase 23 | Complete |
| SOCIAL-03 | Phase 23 | Complete |
| SOCIAL-04 | Phase 23 | Pending |
| APP-01 | Phase 24 | Pending |
| APP-02 | Phase 24 | Pending |
| APP-03 | Phase 24 | Pending |
| CLEAN-01 | Phase 20 | Complete |
| CLEAN-02 | Phase 20 | Complete |
| CLEAN-03 | Phase 20 | Complete |
| CLEAN-04 | Phase 20 | Complete |
| SET-01 | Phase 22 | Complete |
| SET-02 | Phase 22 | Complete |
| SET-03 | Phase 22 | Complete |

**Coverage:**
- v3.0 requirements: 25 line items (24 unique -- FOCUS-02 merged into CLEAN-01)
- Mapped to phases: 24/24
- Unmapped: 0

---
*Requirements defined: 2026-03-22*
*Last updated: 2026-03-22 after roadmap creation*
