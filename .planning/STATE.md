# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-20)

**Core value:** When a member opens Discord, the environment pulls them into productive action -- not gaming. The server must make hustling feel like the game.
**Current focus:** v1.1 milestone COMPLETE

## Current Position

Phase: 13 of 13 (Monthly Progress Recap)
Plan: 1 of 1
Status: Complete
Last activity: 2026-03-21 - Completed quick task 3: Fix reminder routing bypass and timer remainingMs persistence regressions

Progress: [████████████████████] 100% (v1.1)

## Performance Metrics

**Velocity:**
- Total plans completed: 35 (18 v1.0 + 17 v1.1)
- Average duration: 5 min
- Total execution time: 2.64 hours

**By Phase (v1.0):**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation-and-identity | 4 | 23 min | 6 min |
| 02-daily-engagement-loop | 3 | 17 min | 6 min |
| 03-competition-and-social-proof | 3 | 13 min | 4 min |
| 04-ai-assistant | 2 | 9 min | 5 min |
| 05-content-sessions-and-trust | 3 | 11 min | 4 min |
| 06-polish-and-launch-readiness | 3 | 12 min | 4 min |

**By Phase (v1.1):**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 07-ai-infrastructure | 3/3 | 20 min | 7 min |
| 08-inspiration-system | 2/2 | 5 min | 3 min |
| 09-productivity-timer | 3/3 | 16 min | 5 min |
| 10-smart-reminders | 2/2 | 8 min | 4 min |
| 11-goal-hierarchy | 3/3 | 10 min | 3 min |
| 12-self-evaluation-and-reflection | 3/3 | 10 min | 3 min |
| 13-monthly-progress-recap | 1/1 | 4 min | 4 min |

**Recent Trend:**
- Last 5 plans: 11-03 (3 min), 12-01 (4 min), 12-02 (3 min), 12-03 (3 min), 13-01 (4 min)
- Trend: stable

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v1.1 Roadmap]: Grok 4.1 Fast as primary model (2M context, $0.20/M input), DeepSeek V3.2 for structured output
- [v1.1 Roadmap]: AI infrastructure must be Phase 7 -- all other v1.1 phases depend on centralized cost tracking
- [v1.1 Roadmap]: Inspiration system early (Phase 8) -- tiny scope, enriches all subsequent AI interactions
- [v1.1 Roadmap]: Goal hierarchy late (Phase 11) -- highest risk, modifies existing data model across 4 modules
- [v1.1 Roadmap]: Monthly recap last (Phase 13) -- read-only aggregator, richer with all data sources in place
- [07-01]: Token usage stored fire-and-forget to never block AI response delivery
- [07-01]: responseFormat typed as generic object in AICallOptions, cast inside callAI for SDK compatibility
- [07-01]: Used ChatResponse import from @openrouter/sdk/models for proper overload resolution
- [07-02]: Context budget upgraded from 100K to 1.4M tokens for Grok 4.1 Fast's 2M window
- [07-02]: System-level AI calls (filter, tagger) use memberId='system' for budget bypass
- [07-02]: Functions needing db/memberId had signatures expanded with all callers updated
- [07-03]: Warm tier uses text truncation heuristic instead of AI calls to avoid expense and recursion
- [07-03]: compressSummary() only compresses messages older than 30 days, preserving warm-tier messages
- [07-03]: Token trimming priority: warm summaries first, then hot messages, then trigger compression
- [08-01]: Upsert on /inspiration add so re-adding same name updates context instead of erroring
- [08-01]: deleteMany for /inspiration remove to get count-based feedback without try/catch
- [08-01]: All /inspiration interactions use ephemeral replies (personal data)
- [08-02]: Inspirations as dedicated prompt section (not merged into profile) for conceptual clarity
- [08-02]: "What would X do?" handled purely via prompt engineering -- no command handler needed
- [08-02]: Empty inspirations return empty string to avoid cluttering prompts
- [09-01]: prePauseState field on ActiveTimer to track whether resume goes to working or on_break
- [09-01]: remainingMs field on ActiveTimer so callers can re-schedule transitions after resume
- [09-01]: Proportional break calculated from current work interval only (not cumulative totalWorkedMs)
- [09-01]: Amber/warning color for paused state distinct from success (working) and info (break)
- [09-02]: Global button routing added to index.ts between autocomplete and command checks
- [09-02]: timerTransition internal event for decoupling command handlers from transition orchestration
- [09-02]: ChannelType.DM narrowing instead of isDMBased() to avoid PartialGroupDMChannel type issues
- [09-02]: Restart recovery sends NEW DM messages instead of editing old ones (Pitfall 5)
- [09-03]: Keyword pre-filter rejects questions about timers via separate QUESTION_PATTERNS array
- [09-03]: AI parse uses member's own budget (not system) since it is member-initiated
- [09-03]: startTimerForMember reused from timer/index.ts to avoid duplicating timer start logic
- [10-01]: chrono-node forwardDate with member timezone for future-biased time parsing
- [10-01]: Two-stage parser (regex intent + chrono extraction) avoids AI calls per reminder parse
- [10-01]: Direct DM for high urgency to get message ID; deliverNotification fallback for routing
- [10-01]: Cron expression format: minute hour * * cronDay from chrono + recurrence pattern
- [10-01]: reminderAccountId added to NotificationPreference for per-type routing
- [10-02]: setTimeout overflow guard defers reminders > 24.8 days to hourly sweep
- [10-02]: skipUntil DB pattern for Skip Next: cron stays alive, one occurrence suppressed
- [10-02]: High-urgency repeat chain checks DB acknowledgment before each repeat
- [10-02]: Timer intent first, reminder intent second in AI assistant DM handler (Pitfall 7)
- [10-02]: /remind uses message option directly as content (more reliable than parser extraction)
- [11-01]: CANCELLED status not added to GoalStatus enum; MISSED children excluded from countable ratio instead
- [11-01]: events parameter optional on checkExpiredGoals for backward compat with existing scheduler caller
- [11-01]: Decomposition suggestion in CONVERSATION_RULES (prompt engineering, no command handler)
- [11-03]: responseFormat uses jsonSchema (camelCase) matching codebase convention, not json_schema from plan
- [11-03]: Decomposition intent placed third in DM handler priority: timer > reminder > decomposition > chat
- [11-03]: Max 3 edit rounds before auto-proceeding to prevent infinite DM loops
- [Phase 11-02]: Timeframe overrides deadline only when parseDeadline falls back to 7-day default (isFallbackDeadline heuristic)
- [Phase 11-02]: Tree view rendered in monospace code block for alignment in Discord embed
- [Phase 11-02]: List view filters to parentId: null and shows child counts for parent goals
- [Phase 11-02]: Timeframe string cast to GoalTimeframe enum union type since command choices restrict valid values
- [12-01]: reflectionIntensity uses String type (not enum) matching accountabilityLevel pattern
- [12-01]: Stub makeReflectionFn logs placeholder until Plan 12-02 wires real reflection DM flow
- [12-01]: Daily reflection cron at 8 PM member local time via REFLECTION_CONFIG constants
- [12-03]: Reflection insights filtered (only non-null insights shown) to keep prompts clean
- [12-03]: generateBrief accepts reflections as optional param with default empty array for backward compat
- [12-03]: Reflections embed field only shown when member has reflection data (no clutter)
- [Phase 12-02]: responseFormat uses jsonSchema (camelCase) matching codebase convention
- [Phase 12-02]: Weekly reflection chains in makePlanningFn so scheduler controls sequencing
- [Phase 12-02]: Medium intensity uses Mon/Wed/Fri (dayOfWeek 1,3,5) for 3 days/week daily reflections
- [Phase 12-02]: Fallback template questions per type when AI degrades (never fails silently)
- [Phase 12-02]: Monthly cron at 18:00 UTC on 28th queries medium+heavy members directly
- [13-01]: pendingRecaps Map bridges generator.ts and index.ts reaction listener across module files
- [13-01]: Direct DM via user.send() instead of deliverNotification to get Message object for reaction tracking
- [13-01]: Trophy emoji checked as both Unicode and name 'trophy' for custom/standard emoji compatibility
- [13-01]: Public recap shows stats + Jarvis quote only (no personal insights, reflections, or suggestions)
- [13-01]: Template fallback formats stats as clean text when AI is unavailable or budget exceeded

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 1 | Fix 7 audit bugs: encryption, role stripping, setup transaction, notification routing, skip weekly, timer recovery | 2026-03-21 | 0ef0d93 | [1-fix-7-audit-bugs-encryption-role-strippi](./quick/1-fix-7-audit-bugs-encryption-role-strippi/) |
| 2 | Fix 4 audit follow-ups: reminder message binding, session title export, setup rerun guard, timer prePauseState | 2026-03-21 | f65ca12 | [2-fix-4-audit-follow-ups-reminder-message-](./quick/2-fix-4-audit-follow-ups-reminder-message-/) |
| 3 | Fix reminder routing bypass and timer remainingMs persistence regressions | 2026-03-21 | ffc12a7 | [3-fix-reminder-routing-bypass-regression-a](./quick/3-fix-reminder-routing-bypass-regression-a/) |

## Session Continuity

Last session: 2026-03-21
Stopped at: Completed quick-3 (reminder routing bypass fix and timer remainingMs persistence)
Resume file: None
