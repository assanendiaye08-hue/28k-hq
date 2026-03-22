# Requirements: Discord Hustler

**Defined:** 2026-03-22
**Core Value:** When a member opens Discord, the environment pulls them into productive action — not gaming.

## v3.0 Requirements

Requirements for Jarvis Coach Evolution. Each maps to roadmap phases.

### Conversational AI

- [ ] **CONV-01**: Jarvis understands natural language in DMs for all core actions (goals, check-ins, reminders, tasks)
- [ ] **CONV-02**: Action confirmation loop — Jarvis confirms before mutating data ("Set goal 'Launch funnel by March'? yes/no")
- [ ] **CONV-03**: Topic-aware context — Jarvis only references relevant goals/history per conversation topic (no context bleeding)
- [ ] **CONV-04**: Brainstorming mode — Jarvis can do structured creative thinking sessions on request

### Proactive Coaching

- [ ] **COACH-01**: Morning brief DM — recap today's plan, remind of goals/deadlines, ask focus
- [ ] **COACH-02**: End-of-day reflection DM — what was done, log progress, set up tomorrow
- [ ] **COACH-03**: Weekly review DM — week summary, goal progress, plan next week
- [ ] **COACH-04**: Smart nudges — stale goals, broken streaks, quiet periods trigger outreach
- [ ] **COACH-05**: Global daily outreach budget — max proactive DMs per day per member (prevent fatigue)

### Coaching Settings

- [ ] **SET-01**: Per-user coaching config — enable/disable each proactive feature individually
- [ ] **SET-02**: Frequency settings — daily/weekly/none for each routine
- [ ] **SET-03**: Quiet hours — time window where bot won't send proactive DMs
- [ ] **SET-04**: Coaching onboarding — setup flow asks for timezone and coaching preferences if not configured

### Task Management

- [ ] **TASK-01**: Quick tasks via conversation ("add to my to-do: fix landing page")
- [ ] **TASK-02**: Task reminders ("remind me to call supplier tomorrow at 3pm")
- [ ] **TASK-03**: Task list viewable via /tasks or asking Jarvis

### Cleanup

- [ ] **CLEAN-01**: Remove bot timer module (desktop handles timers)
- [ ] **CLEAN-02**: DMs only — remove private channel per-member system
- [ ] **CLEAN-03**: Strip most slash commands — keep only /goals, /reminders, /leaderboard, /tasks, /announce-update
- [ ] **CLEAN-04**: Resolve tone — ruthlessly objective coaching, not forced personality

## Future Requirements

### v3.1

- **CYCLE-01**: Session summaries — after desktop timer sessions, Jarvis DMs insights about work patterns
- **CYCLE-02**: Monthly narrative recap — AI-written story of the month's progress
- **CYCLE-03**: Goal decomposition via conversation — Jarvis helps break down big goals into sub-goals

## Out of Scope

| Feature | Reason |
|---------|--------|
| Automated goal creation | Coach suggests, never auto-creates. Trust requires confirmation. |
| Named member comparisons | "You're behind X" creates toxicity. Use anonymous leaderboards instead. |
| Activity/window tracking | Privacy violation. Timer data is enough. |
| Calendar integrations | Complexity too high for this milestone. Defer. |
| Mobile app | Desktop + Discord covers the use case. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| (Populated during roadmap creation) | | |

**Coverage:**
- v3.0 requirements: 18 total
- Mapped to phases: 0
- Unmapped: 18

---
*Requirements defined: 2026-03-22*
*Last updated: 2026-03-22 after initial definition*
