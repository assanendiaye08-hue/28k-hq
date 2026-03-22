# Phase 2: Daily Engagement Loop - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Daily check-in system with flexible scoring, goal setting with progress tracking, XP engine with rank/role progression, and personalized morning briefs. This is the daily habit loop that makes members come back to Discord instead of opening a game.

</domain>

<decisions>
## Implementation Decisions

### Check-in Experience
- Private only — check-ins go to the member's private space, never posted publicly
- Quick + optional format: one required field ("what did you do?") + optional effort rating
- AI extracts categories from free text (like profile setup) — no forced categorization
- Custom check-in schedules per member: members set their own reminder times, timezone-aware, changeable anytime
- Weekly planning prompt: every Sunday the bot asks members to set their coming week's check-in schedule and goals
- Multiple check-ins per day allowed — Claude decides how XP scales (avoid spam incentive)

### XP Economy
- Fully public — everyone sees everyone's XP and level
- XP sources in Phase 2: check-ins, goals completed, streak bonuses, setup completion bonus
- Level-up notifications must feel rewarding and encouraging, NEVER annoying or spammy — subtle celebration, not notification noise
- XP curve and streak mechanics: Claude's discretion based on gaming psychology (research flagged: game tutorial speed early, then logarithmic)
- Streak decay vs loss: Claude decides based on psychology research (pitfalls research warned against rigid streaks — use flexible scoring)

### Morning Briefs
- Member-chosen tone — during setup or via settings, members pick their preferred brief style (coach, chill friend, data-first, etc.)
- Member-set send time — each member configures when their brief arrives, changeable anytime
- Content includes: today's schedule (check-in reminders, sessions), streak & rank status, active goals + progress
- Does NOT include community pulse (who's active, who checked in) — that's social/competition territory (Phase 3)
- AI vs template approach: Claude's discretion (hybrid recommended — template structure + AI personal touch keeps costs near-zero while feeling personal)

### Goal Structure
- Both measurable and free text goals: measurable when possible ("5 cold emails" → track 2/5), free text when qualitative ("learn Figma basics")
- Soft cap on active goals — bot suggests limiting to 3-5 but doesn't hard-block
- Expired goals get an extend option — bot asks "extend this goal?" before archiving to missed
- Weekly planning session: bot prompts every Sunday to set goals and schedule for the coming week
- Goal completion earns bonus XP (more than a check-in — hitting targets should feel significant)

### Claude's Discretion
- XP amounts per activity and leveling curve design
- Streak multiplier mechanics and decay rules
- Morning brief implementation (AI-generated vs template vs hybrid)
- Exact check-in reminder scheduling implementation
- How level-up celebrations look (embed style, where they appear)
- Sunday planning session flow and questions

</decisions>

<specifics>
## Specific Ideas

- Check-in reminders should feel like a personal assistant, not a nagging app — "Hey, you said you'd check in at 3pm. How'd it go?" not "YOU MISSED YOUR CHECK-IN"
- The weekly Sunday planning session should feel like sitting down with a coach, not filling out a form
- XP/level-up should feel like a game achievement notification — brief, satisfying, not intrusive
- The whole system must work without any public visibility — a member who never looks at leaderboards should still find value in the private loop (briefs → goals → check-ins → progress)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-daily-engagement-loop*
*Context gathered: 2026-03-20*
