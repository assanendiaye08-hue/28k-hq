# Phase 3: Competition and Social Proof - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Multi-dimensional leaderboards (XP, voice hours, streaks), voice session tracking with XP rewards, wins/lessons channels with bot detection and XP, and Valorant-style seasonal system with archived past seasons. This adds the competitive flywheel that taps into the group's gamer instincts.

</domain>

<decisions>
## Implementation Decisions

### Leaderboard Display
- Three separate leaderboard embeds: XP, voice hours, streaks — each board has its own ranking
- Both #leaderboard channel (auto-updating) AND /leaderboard command for on-demand checks
- #leaderboard channel updates by editing existing messages — NO new messages, NO notifications. The channel is for consultation, not alerts
- Minimal distraction principle applies across all of Phase 3: competition features should be available when sought, never push unwanted notifications

### Voice Tracking Rules
- Presence in voice channel counts as "locked in" — even if muted (people legitimately work muted due to noisy mics)
- Smart AFK detection: if member goes to Discord AFK channel or shows extended inactivity, tracking stops
- Session announcements ONLY for long/noteworthy sessions — short sessions tracked silently
- Announcements should be encouraging ("keep grinding" energy), delivered to private space not public channels

### Wins/Lessons Flow
- Any message posted in #wins or #lessons counts — the channel itself is the filter, no AI detection needed
- Bot reacts with emoji (e.g., 💪 for wins, 🧠 for lessons) and silently awards XP
- No bot reply — just the emoji reaction. Keeps it clean
- XP amount for wins vs lessons: Claude's discretion based on community psychology (sharing lessons should be encouraged, not penalized)

### Seasonal System
- Season duration: Claude decides based on 10-25 person group dynamics and engagement research
- What resets vs carries over: Claude decides the right balance between fresh competition and permanent progress
- Archived seasons viewable via /season [number] command for detailed past leaderboards
- #hall-of-fame channel with pinned season summaries — permanent bragging rights
- End-of-season rewards/recognition: Claude decides what motivates without creating permanent hierarchy

### Claude's Discretion
- Leaderboard refresh cadence (must be silent edits, not new posts)
- Whether to show all members or top N + "your position"
- Voice session minimum length before counting
- AFK detection specifics (timeout duration, deafened handling)
- Session length threshold for "noteworthy" announcement
- Wins vs lessons XP balance
- Season length (1/2/3 months)
- Season reset scope (what resets, what carries)
- Season champion recognition (temporary role, just archive, etc.)

</decisions>

<specifics>
## Specific Ideas

- Leaderboards should feel like checking a scoreboard at a gym — you go look when you want, it doesn't come to you
- Voice tracking announcement for long sessions: brief, encouraging, private-space delivery — "2h 15m locked in. That's how you do it."
- #hall-of-fame should feel permanent and prestigious — Season 1 champion should still be visible years later
- The whole competitive layer should add energy without adding noise

</specifics>

<deferred>
## Deferred Ideas

- **AI-evaluated XP based on profile relevance**: Instead of flat XP per activity, AI evaluates what the member actually did relative to their profile/goals to determine XP earned. Would enhance the XP engine to reward meaningful work over just showing up. Touches Phase 2 (XP engine) + Phase 4 (AI).
- **Bot should help all productive life areas**: The AI assistant should support health, work, school, fitness — any productive activity, not just money-making. Should NOT help with time-wasting/distractions. Applies to Phase 4 (AI assistant personality and scope).

</deferred>

---

*Phase: 03-competition-and-social-proof*
*Context gathered: 2026-03-20*
