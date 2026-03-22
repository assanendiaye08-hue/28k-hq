# Phase 13: Monthly Progress Recap - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

AI-generated monthly progress summary DM with adaptive depth based on available data. Member can react to share condensed highlights to #wins. Read-only aggregator — pulls from check-ins, goals, timer sessions, voice hours, reflections, XP history. No new data flows created.

</domain>

<decisions>
## Implementation Decisions

### Recap Content
- Include ALL available data sources: check-in stats, streaks, XP earned, voice hours, goal progress (including hierarchy), timer session stats, reflection highlights
- **Adaptive depth:** Jarvis scales the recap to match available data. Rich data = detailed narrative + suggestions. Thin data = brief encouragement, no forced analysis
- AI prompt instruction: "Only make suggestions you have strong evidence for. If the data is thin, keep it brief and encouraging rather than making up patterns"

### Commentary Style
- Both narrative + suggestions, but suggestions must be grounded in actual data
- Narrative: story of the month ("You shifted from scattered work to focused coding sessions")
- Suggestions: forward-looking only when there's clear evidence ("Your check-in consistency dropped mid-month — try setting a morning reminder")
- Never force suggestions when data is insufficient

### Sharing to #wins
- Condensed highlights only — NOT the full private recap
- Public version shows: key stats (XP, streak, goals completed, hours focused) + one Jarvis quote
- Triggered by member reacting to their private recap DM
- Keeps it aspirational without oversharing personal details

### Claude's Discretion
- Exact recap embed layout and formatting
- Which reaction emoji triggers sharing (recommend: specific emoji like a trophy)
- Monthly cron timing (recommend: 1st of each month, morning in member's timezone)
- How to handle first month (member joined mid-month — shorter recap)
- Whether to include month-over-month comparisons when 2+ months of data exist

</decisions>

<specifics>
## Specific Ideas

- Recap depth adapts to the member, not a fixed template — someone who checked in 28 days gets a different recap than someone who checked in 5 days
- Quality of suggestions depends on data richness — better to say nothing than to give generic advice
- The shared version in #wins is social proof — seeing "John: 25 check-ins, 3 goals completed, 42 focused hours" motivates others

</specifics>

<deferred>
## Deferred Ideas

None — this is the last phase of v1.1.

</deferred>

---

*Phase: 13-monthly-progress-recap*
*Context gathered: 2026-03-21*
