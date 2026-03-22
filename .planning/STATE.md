# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-22)

**Core value:** When a member opens Discord, the environment pulls them into productive action -- not gaming.
**Current focus:** v3.0 Phase 22 - Daily Rhythm

## Current Position

Phase: 22 of 24 (Daily Rhythm)
Plan: 1 of 3 in current phase
Status: Phase 22 in progress
Last activity: 2026-03-22 -- Completed 22-01: Outreach budget, coaching config, conversational briefs

Progress: [█████░░░░░] 50% (v3.0 -- 6/12 plans)

## Performance Metrics

**Velocity:**
- Total plans completed: 55 (18 v1.0 + 17 v1.1 + 14 v2.0 + 6 v3.0)
- Average duration: 5 min
- Total execution time: 3.62 hours

**By Phase (v3.0):**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 20-clean-slate | 2/2 | 9 min | 4.5 min |
| 21-conversational-jarvis | 3/3 | 10 min | 3.3 min |
| 22-daily-rhythm | 1/3 | 3 min | 3 min |
| 23-social-layer | 0/2 | - | - |
| 24-desktop-enhancement | 0/2 | - | - |

**Recent Trend:**
- Last 5 plans: 20-02 (5 min), 21-01 (3 min), 21-02 (4 min), 21-03 (3 min), 22-01 (3 min)
- Trend: Phase 22 in progress (1/3 plans)

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v3.0 Roadmap]: 5-phase structure -- clean slate, conversational AI, daily rhythm, social layer, desktop enhancement
- [v3.0 Roadmap]: CLEAN-01 and FOCUS-02 merged (both "remove bot timer module") -- FOCUS-02 retired
- [v3.0 Roadmap]: Coaching settings (SET-01..03) placed in Phase 22 alongside daily rhythm -- settings must exist when proactive features ship
- [v3.0 Roadmap]: Phase 23 (social) and Phase 24 (desktop) are relatively independent -- could run in either order
- [v3.0 Roadmap]: No new npm dependencies -- everything builds on existing stack
- [20-01]: Removed timer event types from core event bus -- no emitters/listeners remain after module deletion
- [20-01]: Kept auto-feed channel name in server-setup template -- cosmetic, Phase 23 will consolidate channels
- [20-02]: Reminders bypass focus session gate (user-set, time-critical)
- [20-02]: deliverToPrivateSpace kept as backward-compatible alias for deliverDM
- [20-02]: PrivateSpace record still created during onboarding (type DM) for existing code references
- [20-02]: All focus API calls are fire-and-forget -- timer works offline
- [21-01]: OpenRouter params cast to Record<string,unknown> for tools field (SDK type lacks it)
- [21-01]: Tool calls extracted via type assertion on completion message (SDK types may not include tool_calls)
- [21-01]: TOOL_AWARENESS_PROMPT exported for potential reuse in other prompt builders
- [21-02]: Reuse existing checkin/reminder/goal logic in executor -- keeps NL actions consistent with slash commands
- [21-02]: Brainstorm tool defined but defers to Plan 03 -- no confirmation needed
- [21-02]: Private channel check removed from DM handler -- DM-only after Phase 20
- [21-02]: Tool descriptions include negative examples to minimize false positives
- [21-03]: Keyword heuristic topic classification over LLM-based -- avoids API cost per message
- [21-03]: Topic filtering keeps last 5 messages regardless of topic for continuity
- [21-03]: Brainstorm sessions in-memory with 30-min TTL -- no DB persistence for ephemeral sessions
- [21-03]: Brainstorm check before pending action check -- active sessions take priority
- [22-01]: Gate functions (checkAndIncrementOutreach, isQuietHours) are standalone exports -- user-initiated replies never consume budget
- [22-01]: Brief stored as ConversationMessage with topic 'brief' -- reply support via existing assembleContext pipeline
- [22-01]: enableReflection checked independently from reflectionIntensity -- toggle vs frequency are separate concerns

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 21: Verify whether Grok 4.1 Fast supports function/tool calling via OpenRouter before designing action execution pipeline
- Phase 21: Validate cost model at conversational volume (20-30 msgs/member/day) against $0.10/day budget
- Phase 22: Verify Discord DM rate limits for staggered proactive outreach to 25 members
- macOS code signing: $99/year Apple Developer certificate needed before distribution (carried from v2.0)

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 1 | Fix 7 audit bugs: encryption, role stripping, setup transaction, notification routing, skip weekly, timer recovery | 2026-03-21 | 0ef0d93 | [1-fix-7-audit-bugs-encryption-role-strippi](./quick/1-fix-7-audit-bugs-encryption-role-strippi/) |
| 2 | Fix 4 audit follow-ups: reminder message binding, session title export, setup rerun guard, timer prePauseState | 2026-03-21 | f65ca12 | [2-fix-4-audit-follow-ups-reminder-message-](./quick/2-fix-4-audit-follow-ups-reminder-message-/) |
| 3 | Fix reminder routing bypass and timer remainingMs persistence regressions | 2026-03-21 | ffc12a7 | [3-fix-reminder-routing-bypass-regression-a](./quick/3-fix-reminder-routing-bypass-regression-a/) |

## Session Continuity

Last session: 2026-03-22
Stopped at: Completed 22-01-PLAN.md -- Outreach budget, coaching config, conversational briefs
Resume file: None
