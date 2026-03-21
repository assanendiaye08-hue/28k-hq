# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-20)

**Core value:** When a member opens Discord, the environment pulls them into productive action -- not gaming. The server must make hustling feel like the game.
**Current focus:** Phase 10 in progress (Smart Reminders)

## Current Position

Phase: 10 of 13 (Smart Reminders)
Plan: 2 of 2
Status: Phase Complete
Last activity: 2026-03-21 -- Completed 10-02 (Reminder interaction layer)

Progress: [███████████████░░░░░] 73% (v1.1)

## Performance Metrics

**Velocity:**
- Total plans completed: 28 (18 v1.0 + 10 v1.1)
- Average duration: 5 min
- Total execution time: 2.22 hours

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

**Recent Trend:**
- Last 5 plans: 09-01 (5 min), 09-02 (9 min), 09-03 (2 min), 10-01 (3 min), 10-02 (5 min)
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

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-03-21
Stopped at: Completed 10-02-PLAN.md
Resume file: None
