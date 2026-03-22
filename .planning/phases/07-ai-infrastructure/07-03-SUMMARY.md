---
phase: 07-ai-infrastructure
plan: 03
subsystem: infra
tags: [ai-admin, cost-tracking, model-management, tiered-memory, context-assembly, discord-commands]

# Dependency graph
requires:
  - phase: 07-ai-infrastructure (plan 01)
    provides: "Centralized callAI, TokenUsage table, MemberAIBudget model, MODEL_PRICING, resetModelConfigCache"
  - phase: 07-ai-infrastructure (plan 02)
    provides: "All call sites migrated to callAI, memory.ts using centralized client"
provides:
  - "/cost command with today, month, set-budget subcommands for AI cost visibility"
  - "/admin set-model command for hot-swapping primary/fallback AI models"
  - "ai-admin module following standard Module pattern"
  - "Tiered context assembly (hot/warm/cold) with protected data in memory.ts"
  - "Weekly summary heuristic for warm-tier context without AI calls"
affects: [08-inspiration-engine, 09-smart-summaries, 10-ai-onboarding, 11-goal-hierarchy, 12-analytics-dashboard, 13-monthly-recap]

# Tech tracking
tech-stack:
  added: []
  patterns: ["tiered context assembly (hot 7d verbatim / warm 8-30d weekly summaries / cold 30d+ compressed)", "protected data pattern for never-trimmed member context", "admin commands with PermissionFlagsBits.Administrator", "weekly message bucketing by ISO week for warm-tier summaries"]

key-files:
  created: [src/modules/ai-admin/commands.ts, src/modules/ai-admin/index.ts]
  modified: [src/modules/ai-assistant/memory.ts, src/modules/ai-assistant/chat.ts, src/deploy-commands.ts]

key-decisions:
  - "Warm tier uses text truncation heuristic (first 200 chars) instead of AI calls to avoid expense and recursion"
  - "compressSummary() only compresses messages older than 30 days, preserving warm-tier messages for weekly assembly"
  - "Token trimming priority: warm summaries first, then hot messages (oldest first, keep min 10), then trigger compression"

patterns-established:
  - "Tiered context: hot (verbatim) -> warm (weekly summaries) -> cold (AI-compressed) with protected data always included"
  - "Admin commands use ephemeral deferred replies for all subcommands"
  - "Cost visibility via TokenUsage aggregate/groupBy queries with member name resolution"

requirements-completed: [INFRA-03, INFRA-04]

# Metrics
duration: 5min
completed: 2026-03-20
---

# Phase 7 Plan 03: Admin Controls and Tiered Memory Summary

**Admin /cost and /admin set-model commands with tiered hot/warm/cold context assembly and protected member data in memory system**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-20T22:50:34Z
- **Completed:** 2026-03-20T22:55:34Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Admin cost visibility with /cost today (per-member and per-feature token breakdown), /cost month (MTD totals with projected cost), and /cost set-budget (daily token limit override)
- Admin model management with /admin set-model for hot-swapping primary/fallback AI models via BotConfig with immediate cache reset
- Tiered memory system: hot tier (7-day verbatim), warm tier (8-30 day weekly summaries), cold tier (30+ day AI-compressed) with protected data that is never trimmed

## Task Commits

Each task was committed atomically:

1. **Task 1: Admin cost visibility and model management commands** - `4dbdcb4` (feat)
2. **Task 2: Tiered memory system (hot/warm/cold) with protected data** - `1845a2b` (feat)

## Files Created/Modified
- `src/modules/ai-admin/commands.ts` - /cost and /admin set-model command builders and handlers with TokenUsage aggregate queries
- `src/modules/ai-admin/index.ts` - Module registration following standard Module pattern
- `src/modules/ai-assistant/memory.ts` - Tiered context assembly with HOT/WARM/COLD constants, weekly summary builder, updated compressSummary
- `src/modules/ai-assistant/chat.ts` - Updated to include weeklySummaries as "Recent weeks" context in AI messages
- `src/deploy-commands.ts` - Added buildCostCommand and buildAdminSetModelCommand to command registration

## Decisions Made
- Warm tier weekly summaries use a text truncation heuristic (first 200 chars of concatenated messages per week) rather than AI calls, avoiding expense and potential recursive AI calls within the memory service
- compressSummary() now only targets messages older than WARM_WINDOW_DAYS (30 days), keeping warm-tier messages intact for weekly assembly rather than compressing everything outside the recent 50
- Token budget trimming explicitly protects memberContext (never trimmed), then drops warm summaries before hot messages, preserving the most recent conversation context as highest value

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 5 INFRA requirements complete (INFRA-01 through INFRA-05 across Plans 01-03)
- Phase 7 AI Infrastructure is fully delivered: centralized AI client, all call sites migrated, admin controls, tiered memory
- Ready for Phase 8 (Inspiration Engine) which can use callAI directly and benefits from the tiered context system
- Future phases (Phase 12 reflections, Phase 8 inspirations) can add data to the protected-data list without code changes

## Self-Check: PASSED

All files verified present. All commits verified in git log.

---
*Phase: 07-ai-infrastructure*
*Completed: 2026-03-20*
