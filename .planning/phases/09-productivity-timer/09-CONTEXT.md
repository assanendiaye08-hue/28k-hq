# Phase 9: Productivity Timer - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Pomodoro and proportional break timers with configurable intervals, goal/task linking, XP awards, interactive DM controls, and restart persistence. This is a personal productivity tool — members use it to structure focused work.

</domain>

<decisions>
## Implementation Decisions

### Timer Interaction Flow
- Start via both /timer command AND natural DM to Jarvis ("start a 45 min focus session on coding")
- /timer subcommands: start, pause, resume, stop, status
- Interactive buttons on the timer DM message (Pause/Resume/Stop/Skip Break) — commands as fallback
- **Persistent active timer display**: the original timer DM message gets edited at transitions (work→break, break→work) to show current state and remaining time. Always visible at bottom of DM
- DM notifications at interval transitions: "Break time! 5 min." / "Back to it!" — quiet during work periods
- /timer status shows: mode, time remaining, what you're working on, XP earned so far

### XP and Gamification
- Time-based XP: 1 XP per 5 minutes worked. 25-min pomodoro = 5 XP, 2-hour session = 24 XP
- Daily cap and partial XP: Claude's discretion on exact numbers, balancing against existing XP economy
- Minimum session length to earn XP: Claude decides (recommendation: 5 min minimum)

### Break Behavior
- Short encouraging message from Jarvis when break starts ("Nice work — 25 min locked in. Take 5.")
- Timer DM updated with break countdown
- Skip break button available — power users can go straight to next work period
- **No-return handling**: Claude's discretion. Key constraint: priority is to NOT distract the user's workflow. A gentle nudge is fine but repeated pings would be counterproductive. Auto-end after reasonable idle time is preferred over nagging
- Proportional break mode (5:1 ratio default): work freely, press pause, get a break = work_time / 5

### Social Visibility
- Claude's discretion on whether/how others see someone is in a timer session
- Should NOT create noise or notifications for other members
- Could be as subtle as a status indicator or nothing at all

### Claude's Discretion
- Daily XP cap from timers (200 like voice, or different?)
- Partial XP on early stop (proportional vs nothing)
- No-return timeout duration and behavior (auto-end vs gentle nudge)
- Social visibility approach (subtle status vs none)
- Whether timer sessions should appear in leaderboard stats
- How Jarvis parses natural language timer requests in DM

</decisions>

<specifics>
## Specific Ideas

- Timer DM is a living message — edited at transitions, always shows current state
- Buttons make it one-tap to control the timer without typing commands
- Priority is to support the user's focus, not distract them — minimal notifications during work periods
- "The inverse pomodoro" (proportional breaks) is the differentiator — most apps don't do this

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 09-productivity-timer*
*Context gathered: 2026-03-20*
