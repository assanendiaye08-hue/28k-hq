# Phase 12: Self-Evaluation and Reflection - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Configurable-intensity reflection system (light/medium/heavy) with AI-personalized questions based on actual activity data, delivered via DM conversation. Reflection responses stored in DB, fed into Jarvis context for smarter forward-looking suggestions in briefs, nudges, and chat. Weekly reflection integrates with existing Sunday planning session.

</domain>

<decisions>
## Implementation Decisions

### Delivery & Timing
- Evening DM prompt for daily reflections (like nudges)
- Weekly reflections integrate with existing Sunday planning session — "Before we plan next week, how did this week go?"
- Monthly reflections at month end
- All delivered via DM conversation — Jarvis asks, member replies naturally

### Intensity Levels
- **Light:** 1 reflection per week (Sunday, integrated with planning)
- **Medium:** 3-4 per week (Sunday weekly + 2-3 evening daily) + monthly
- **Heavy:** Daily evening reflection + weekly Sunday + monthly
- Configurable via existing /settings or /accountability (Claude's discretion on UX)

### Question Style
- Open-ended conversation — Jarvis asks a question, member replies naturally, Jarvis acknowledges and may ask one follow-up. Feels like talking to a coach, not filling a form
- Questions based on actual activity data ONLY (goals, check-ins, timer sessions, streaks, voice hours). Never probes personal life unless member brought it up in conversation
- AI-personalized — not generic templates. "You spent 80% of your timer sessions on coding but your top goal is client outreach. What's going on?" vs "How was your week?"

### Feedback Loop into Jarvis
- Reflection responses stored in a Reflection model (or similar)
- Included in Jarvis's tiered memory as warm/protected data
- Referenced in morning briefs: "Last week you said mornings are your most productive time — today's brief is hitting your inbox early"
- Referenced in nudges: "You reflected that you tend to slack after hitting a goal. You just completed one yesterday — stay sharp"
- Forward-looking suggestions: "Based on your reflections, your biggest blocker is context switching. This week, try blocking 2-hour focus sessions on one thing"

### Claude's Discretion
- Exact question generation approach (system prompt engineering)
- Where reflection intensity is configured (existing /settings vs new command)
- How many follow-up questions per reflection (recommend: 1 max)
- How reflection data is structured in the Jarvis system prompt
- Monthly reflection format (deeper review or just a longer weekly)

</decisions>

<specifics>
## Specific Ideas

- Reflection is "structured self-awareness" — Jarvis asks questions based on what actually happened, not generic prompts
- Key insight for gamers-turned-hustlers: they're great at grinding but often lack awareness of whether they're grinding on the RIGHT thing. Reflection closes that gap
- Weekly reflection is the core — daily and monthly are intensity add-ons
- The feedback loop is what makes this valuable — reflection data makes every other Jarvis interaction smarter

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 12-self-evaluation-and-reflection*
*Context gathered: 2026-03-21*
