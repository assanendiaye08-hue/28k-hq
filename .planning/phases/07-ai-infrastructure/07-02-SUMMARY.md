---
phase: 07-ai-infrastructure
plan: 02
subsystem: infra
tags: [openrouter, ai-client, callAI, model-routing, budget-enforcement]

# Dependency graph
requires:
  - phase: 07-ai-infrastructure (plan 01)
    provides: Centralized callAI function, ai-client.ts, ai-types.ts, ai-templates.ts
provides:
  - All 9 AI call sites migrated to centralized callAI
  - Zero direct OpenRouter imports outside src/shared/ai-client.ts
  - Every AI call passes memberId and feature tag for tracking
  - Every call site handles degradation with existing fallback
affects: [08-inspiration-engine, 09-smart-summaries, 10-ai-onboarding, 11-goal-hierarchy, 12-analytics-dashboard, 13-monthly-recap]

# Tech tracking
tech-stack:
  added: []
  patterns: [centralized-ai-client-pattern, callAI-migration-pattern, degradation-fallback-pattern]

key-files:
  created: []
  modified:
    - src/modules/ai-assistant/chat.ts
    - src/modules/ai-assistant/memory.ts
    - src/modules/ai-assistant/nudge.ts
    - src/modules/scheduler/briefs.ts
    - src/modules/scheduler/planning.ts
    - src/modules/checkin/ai-categories.ts
    - src/modules/checkin/commands.ts
    - src/modules/auto-feed/filter.ts
    - src/modules/profile/ai-tags.ts
    - src/modules/profile/index.ts
    - src/modules/profile/commands.ts
    - src/modules/resources/tagger.ts
    - src/modules/resources/handler.ts

key-decisions:
  - "Context budget upgraded from 100K to 1.4M tokens to leverage Grok 4.1 Fast's 2M window"
  - "System-level calls (filter, tagger) use memberId='system' to bypass budget checks"
  - "Functions needing db/memberId (ai-categories, ai-tags, tagger) had signatures expanded and all callers updated"

patterns-established:
  - "callAI migration: remove OpenRouter import, remove client instance, import callAI, replace send() with callAI(db, opts), handle result.degraded with existing fallback"
  - "System-level AI calls use memberId='system' for budget bypass"

requirements-completed: [INFRA-01]

# Metrics
duration: 9min
completed: 2026-03-20
---

# Phase 7 Plan 2: AI Call Site Migration Summary

**Migrated all 9 AI call sites across 6 modules to centralized callAI with budget enforcement, model routing, and per-feature token tracking**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-20T22:36:57Z
- **Completed:** 2026-03-20T22:46:06Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments
- Migrated chat, memory, and nudge (ai-assistant module) to centralized callAI
- Migrated briefs, planning, ai-categories, filter, ai-tags, and tagger (5 additional modules)
- Updated all callers of functions whose signatures changed (ai-categories, ai-tags, tagger)
- Upgraded memory context budget from 100K to 1.4M tokens for Grok 4.1 Fast's 2M window
- Zero direct OpenRouter imports remain in any module file
- Zero hardcoded model strings remain in any module file

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate chat, memory, and nudge (ai-assistant module)** - `38d490c` (feat)
2. **Task 2: Migrate briefs, planning, categories, filter, ai-tags, and tagger** - `15bcf18` (feat)

## Files Created/Modified
- `src/modules/ai-assistant/chat.ts` - Replaced OpenRouter client with callAI, removed PRIMARY_MODEL/FALLBACK_MODEL constants
- `src/modules/ai-assistant/memory.ts` - Replaced OpenRouter client with callAI, updated context budget to 1.4M tokens
- `src/modules/ai-assistant/nudge.ts` - Replaced OpenRouter client with callAI, degradation uses existing fallback strings
- `src/modules/scheduler/briefs.ts` - Replaced OpenRouter client with callAI, formatTemplateFallback on degradation
- `src/modules/scheduler/planning.ts` - Replaced OpenRouter client with callAI, freetext goal fallback on degradation
- `src/modules/checkin/ai-categories.ts` - Added db/memberId params, replaced with callAI
- `src/modules/checkin/commands.ts` - Updated extractCategories caller with db and memberId
- `src/modules/auto-feed/filter.ts` - Replaced OpenRouter client with callAI, memberId='system'
- `src/modules/profile/ai-tags.ts` - Added db/memberId params, replaced with callAI
- `src/modules/profile/index.ts` - Updated extractProfileTags caller with db and memberId
- `src/modules/profile/commands.ts` - Updated extractProfileTags caller with db and member.id
- `src/modules/resources/tagger.ts` - Added db param, replaced with callAI, memberId='system'
- `src/modules/resources/handler.ts` - Updated extractResourceTags caller with db

## Decisions Made
- Context budget upgraded from 100K to 1.4M tokens (and SYSTEM_PROMPT_RESERVE from 20K to 50K) to leverage Grok 4.1 Fast's 2M context window
- System-level calls (filter, tagger) use memberId='system' to bypass budget checks per ai-client implementation
- Functions that previously had no db/memberId (extractCategories, extractProfileTags, extractResourceTags) had signatures expanded; all callers updated

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- INFRA-01 is now complete: every AI call in the codebase routes through callAI() with automatic token tracking, budget enforcement, and model routing
- Ready for Plan 07-03 (admin controls and monitoring)
- All future phases can use callAI directly without any additional setup

## Self-Check: PASSED

All 13 modified files verified present. Both task commits (38d490c, 15bcf18) verified in git log. SUMMARY.md created.

---
*Phase: 07-ai-infrastructure*
*Completed: 2026-03-20*
