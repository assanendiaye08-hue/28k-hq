---
phase: 07-ai-infrastructure
plan: 01
subsystem: infra
tags: [openrouter, ai, token-tracking, budget, prisma, model-routing]

# Dependency graph
requires:
  - phase: 01-foundation-and-identity
    provides: "Prisma schema with Member model, BotConfig key-value store"
  - phase: 04-ai-assistant
    provides: "OpenRouter SDK usage pattern, conversation models"
provides:
  - "Centralized callAI function with budget check, model routing, token tracking"
  - "TokenUsage and MemberAIBudget Prisma models"
  - "Shared AI types (AIFeature, AICallOptions, AICallResult)"
  - "Model pricing table and cost estimation function"
  - "resetModelConfigCache for hot-swap model changes"
affects: [07-02-migration, 07-03-admin-commands, 08-inspiration, 09-accountability, 10-reflection]

# Tech tracking
tech-stack:
  added: []
  patterns: ["centralized AI client with primary/fallback model chain", "fire-and-forget token usage storage", "DB-backed model config with TTL cache", "timezone-aware daily budget enforcement"]

key-files:
  created: [src/shared/ai-client.ts, src/shared/ai-types.ts, src/shared/ai-templates.ts]
  modified: [prisma/schema.prisma]

key-decisions:
  - "Used ChatResponse type import from @openrouter/sdk/models for proper overload resolution"
  - "responseFormat typed as generic object in AICallOptions, cast to SDK union type inside callAI for flexibility"
  - "Token usage stored fire-and-forget (.catch) to never block AI response delivery"

patterns-established:
  - "callAI(db, options) pattern: all AI calls route through single function with automatic budget check and token tracking"
  - "Silent degradation: { degraded: true } signals callers to use template fallbacks without messaging the member"
  - "System calls use memberId='system' to bypass budget checks"

requirements-completed: [INFRA-01, INFRA-02, INFRA-05]

# Metrics
duration: 6min
completed: 2026-03-20
---

# Phase 7 Plan 01: AI Client Foundation Summary

**Centralized AI client wrapping OpenRouter with per-member daily budget enforcement, primary/fallback model routing from BotConfig, and per-request token tracking to TokenUsage table**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-20T22:27:52Z
- **Completed:** 2026-03-20T22:33:24Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Centralized AI client (ai-client.ts) with callAI and resetModelConfigCache exports, replacing the pattern of 7 independent OpenRouter instances
- TokenUsage and MemberAIBudget Prisma models with proper indexes for cost visibility and budget enforcement queries
- Shared type system (AIFeature, AICallOptions, AICallResult) and cost estimation utilities ready for all consumer call sites

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema extensions and shared AI types** - `02c73d4` (feat)
2. **Task 2: Centralized AI client with budget enforcement and model routing** - `0df3a2d` (feat)

## Files Created/Modified
- `prisma/schema.prisma` - Added TokenUsage and MemberAIBudget models with indexes, memberAIBudget relation on Member
- `src/shared/ai-client.ts` - Centralized callAI function with budget check, model routing, and token tracking
- `src/shared/ai-types.ts` - AIFeature, AICallOptions, AICallResult types and MODEL_PRICING constant
- `src/shared/ai-templates.ts` - AI_BUDGET_EXCEEDED symbol and estimateCostUsd function

## Decisions Made
- Used `ChatResponse` type import from `@openrouter/sdk/models` with `ChatGenerationParams` for proper SDK overload resolution (stream: false narrows return type)
- `responseFormat` kept as generic `object` in `AICallOptions` interface for maximum flexibility across call sites (cast to SDK union type inside callAI)
- Token usage storage uses fire-and-forget `.catch()` pattern to never block AI response delivery to the member

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed TypeScript overload resolution for OpenRouter SDK**
- **Found during:** Task 2 (AI client implementation)
- **Issue:** Using `Record<string, unknown>` for chat params caused TypeScript to resolve the wrong overload (union of ChatResponse | EventStream), losing type safety on `.choices` and `.usage`
- **Fix:** Created a `sendToModel` helper with `ChatGenerationParams & { stream: false }` typed parameter, and cast `responseFormat` to `ChatGenerationParams['responseFormat']`
- **Files modified:** src/shared/ai-client.ts
- **Verification:** `npx tsc --noEmit` compiles clean
- **Committed in:** 0df3a2d (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Type fix was necessary for TypeScript compilation. No scope creep.

## Issues Encountered
None beyond the SDK type resolution documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Centralized AI client ready for Plan 02 (migration of all 8 existing call sites to callAI)
- All types exported for consumer modules to import
- Plan 03 (admin /cost command) can query TokenUsage table for cost visibility

## Self-Check: PASSED

All files verified present. All commits verified in git log.

---
*Phase: 07-ai-infrastructure*
*Completed: 2026-03-20*
