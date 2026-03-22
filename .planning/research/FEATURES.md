# Feature Landscape: Peak Performance System

**Domain:** Sustained cognitive performance tools for knowledge workers
**Researched:** 2026-03-22

## Table Stakes

Features users expect from a system that claims to help with performance. Missing = the system feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Focus timer with interruption protection | Core value proposition; 23-min recovery cost per interruption is the #1 finding | Low (exists) | Already built (Pomodoro + Flowmodoro). Enhance with notification suppression. |
| Daily planning / morning brief | 20% more likely to hit daily goals with structured morning planning (HBR) | Low (exists) | Already built as Jarvis morning brief. Keep under 5 minutes. |
| Goal tracking with progress visibility | Meta-analysis of 138 studies: progress monitoring promotes goal attainment | Low (exists) | Already built (goal hierarchy). Add temporal anchoring ("when will you do this?"). |
| Session logging / work history | Self-monitoring has positive moderate effects on performance (36-study meta-analysis) | Low (exists) | Timer sessions auto-log. Keep tracking automatic, not manual. |
| Break reminders after focus blocks | Ultradian rhythm recovery phase (15-20 min) is when the brain consolidates | Low (exists) | Flowmodoro auto-calculates breaks. Pomodoro has built-in breaks. |
| Streak / consistency tracking | Visual evidence of consistency; Hawthorne effect on self-observation | Low (exists) | Already built. Must have grace periods (see anti-features). |

## Differentiators

Features that set the system apart. Not expected, but high-value based on research.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Evening review with open-loop closure | Zeigarnik effect: capturing unfinished tasks with completion plans protects sleep quality and frees working memory. Most productivity tools miss this. | Medium | Jarvis evening reflection exists but should explicitly prompt "what's unfinished?" and "when will you finish it?" |
| Implementation intention prompts | "When/where/how" prompts when setting goals increase follow-through from 14% to 41% (Gollwitzer). Most goal trackers only capture "what." | Low | Add to Jarvis goal decomposition: after breaking down the goal, ask when each step will happen. |
| Chronotype-adaptive nudge timing | Synchrony effect: creative and cognitive output is higher when work aligns with chronobiological peak. Most systems use fixed schedules. | High | Requires tracking when users are most productive over time, then adapting morning brief / nudge timing per user. |
| Focus fortress mode | During timer sessions, actively suppress or defer all system-generated notifications. Most productivity tools still send notifications during focus time. | Medium | Timer should signal the system to hold all nudges, check-in reminders, etc. until the session ends. |
| Sustainable pace indicators | 15-20% of people burn out within 6 months at intensities others sustain for years. A system that detects declining patterns early is uniquely valuable. | High | Track trends: declining focus hours, broken streaks, late-night sessions, skipped reviews. Jarvis flags concern privately. |
| Social co-working sessions | Social facilitation research: mere presence of others doing the same task increases motivation. Voice channel focus sessions are underrated. | Low (exists) | Lock-in sessions already exist. Frame them explicitly as "body doubling" for focus, not just accountability. |
| Transition rituals between focus blocks | Attention residue (Leroy): 15-23 min of cognitive residue after task switching. A brief end-of-session ritual (log, decide next, clear head) reduces this. | Low | After timer ends, prompt: "What did you accomplish?" and "What's next?" before starting a new session. |

## Anti-Features

Features to explicitly NOT build. Research says these hurt more than help.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Always-on notification system | Every notification during focus = 23 min recovery cost. A "helpful" nudge mid-session is actively destructive. | Batch all notifications to between focus blocks. Zero interruptions during timer sessions. |
| Daily deep work targets above 4 hours | Ericsson/Newport: 3-4 hours is the evidence-based ceiling. Setting 8-hour targets creates guilt without improving output. | Set default daily target at 3-4 hours. Celebrate hitting it. Do not imply more is better. |
| Harsh streak penalties | Punishing missed days creates anxiety that impairs performance and causes system abandonment. Individual variation is massive. | Grace periods (miss 1-2 days without breaking streak). Seasonal resets. Emphasize weekly consistency over daily perfection. |
| Forced early morning routines | Late chronotypes perform worse when forced early. Social jet lag causes real health consequences. | Let users choose when their "morning" starts. Adapt system timing to their patterns. |
| Elaborate manual tracking requirements | Time spent logging > time benefit of data. Self-tracking research shows diminishing returns from excessive data collection. | Auto-log everything possible (timer sessions, goal completions). One-tap for anything manual. |
| Competitive leaderboards as primary motivation | Competition motivates some people but creates anxiety in others. Individual variation in response to social comparison is huge. | Keep leaderboards opt-in or secondary. Primary motivation should be progress against own goals. |
| Flow state detection / gamification | Flow is inconsistent and not always the goal. Deliberate practice (non-flow, effortful) builds skill. Labeling sessions "flow" or "not flow" is counterproductive. | Track "deep work hours" as the metric. Whether it was flow or grinding, both count equally. |
| Mid-session goal/progress check-ins | Checking progress during focus breaks the focus. Attention residue from switching to meta-work is real. | All reflection and tracking happens between sessions, never during. |

## Feature Dependencies

```
Focus Timer --> Session Logging (sessions auto-log when timer completes)
Morning Brief --> Goal Hierarchy (brief surfaces today's priority goals)
Evening Review --> Goal Hierarchy + Session Log (review references both)
Weekly Planning --> Goal Hierarchy (weekly planning sets/adjusts weekly goals)
Implementation Intentions --> Goal Decomposition (temporal anchoring added to existing decomposition)
Chronotype Adaptation --> Session Logging (needs weeks of data to detect patterns)
Sustainable Pace Detection --> Session Logging + Check-ins + Streaks (needs trend data)
Focus Fortress Mode --> Timer (activated when timer starts)
```

## MVP Recommendation (for v3.0 Jarvis Coach Evolution)

Prioritize:
1. **Evening review with open-loop closure** -- highest research support, directly protects sleep and next-day performance, builds on existing reflection feature
2. **Implementation intention prompts in goal setting** -- low complexity, high impact (14% to 41% follow-through), builds on existing Jarvis decomposition
3. **Focus fortress mode** -- suppress system notifications during timer sessions, highest-leverage protection
4. **Transition rituals** -- brief end-of-session prompt, low complexity, directly addresses attention residue

Defer:
- **Chronotype-adaptive timing:** Requires significant data collection and ML; high value but high complexity. Start by letting users manually set their peak hours.
- **Sustainable pace detection:** Requires trend analysis over weeks/months. Build the data collection now, add detection later.
