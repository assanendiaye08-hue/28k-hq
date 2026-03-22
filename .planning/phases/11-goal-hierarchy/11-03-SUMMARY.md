---
phase: 11-goal-hierarchy
plan: 03
subsystem: goals, ai-assistant
tags: [decomposition, dm-flow, awaitMessages, structured-output, callAI]

# Dependency graph
requires:
  - phase: 11-goal-hierarchy
    provides: Goal hierarchy schema (parentId, depth, timeframe), validateGoalDepth, getTimeframeDeadline
  - phase: 07-ai-infrastructure
    provides: callAI centralized client with json_schema structured output
  - phase: 10-smart-reminders
    provides: DM handler intent priority (timer > reminder > decomposition > chat)
provides:
  - DM-based goal decomposition flow (runDecompositionFlow) in decompose.ts
  - Natural language decomposition intent detection (isDecompositionRequest) in decompose.ts
  - Goal name extraction from messages (extractDecompositionGoalName) in decompose.ts
  - AI-assisted 2-5 sub-goal suggestions with member approval/edit/cancel
  - Decomposition intent wired into AI assistant DM handler
affects: [ai-assistant, goals]

# Tech tracking
tech-stack:
  added: []
  patterns: [dm-conversation-flow, awaitMessages-timeout, ai-structured-goal-decomposition]

key-files:
  created:
    - src/modules/goals/decompose.ts
  modified:
    - src/modules/ai-assistant/index.ts

key-decisions:
  - "responseFormat uses jsonSchema (camelCase) matching codebase convention, not json_schema from plan"
  - "Decomposition intent placed third in DM handler priority: timer > reminder > decomposition > chat"
  - "Max 3 edit rounds before auto-proceeding to prevent infinite DM loops"

patterns-established:
  - "Decomposition DM flow: select goal > choose timeframe > AI suggests > member approves/edits > batch create"
  - "Fuzzy goal matching by title (case-insensitive includes) for natural DM interaction"

requirements-completed: [GOAL-03]

# Metrics
duration: 3min
completed: 2026-03-21
---

# Phase 11 Plan 03: AI-Assisted Goal Decomposition DM Flow Summary

**DM conversation flow for Jarvis-assisted goal decomposition with AI-suggested sub-goals, member approval/editing, and batch creation linked to parent**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-21T01:55:29Z
- **Completed:** 2026-03-21T01:58:19Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- decompose.ts provides full DM decomposition flow: goal selection (fuzzy match or numbered list), timeframe choice, AI suggestion via callAI with structured output, member approval/edit loop, and batch sub-goal creation
- isDecompositionRequest() detects natural language patterns like "break down", "decompose", "sub-goals", "split up", with goal-context awareness for generic phrases
- AI assistant DM handler now routes decomposition intent to runDecompositionFlow before regular chat, maintaining timer > reminder > decomposition > chat priority

## Task Commits

Each task was committed atomically:

1. **Task 1: Create decompose.ts DM flow with AI-assisted sub-goal generation** - `c01dade` (feat)
2. **Task 2: Wire decomposition intent detection into AI assistant DM handler** - `a5ede03` (feat)

## Files Created/Modified
- `src/modules/goals/decompose.ts` - Full DM decomposition flow: intent detection, goal name extraction, awaitMessages conversation, AI sub-goal suggestions, approval/edit loop, batch DB creation
- `src/modules/ai-assistant/index.ts` - Import decompose functions, add decomposition intent check between reminder and regular chat

## Decisions Made
- Used `jsonSchema` (camelCase) in responseFormat to match existing codebase convention (ai-tags.ts, planning.ts) rather than `json_schema` (snake_case) from the plan
- Placed decomposition intent as third priority in DM handler (timer > reminder > decomposition > chat) per plan specification
- Max 3 edit rounds on suggestion list to prevent infinite conversation loops, then auto-proceed with current list

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected responseFormat key naming from json_schema to jsonSchema**
- **Found during:** Task 1
- **Issue:** Plan specified `json_schema` as the key for structured output schema, but codebase consistently uses `jsonSchema` (camelCase)
- **Fix:** Used `jsonSchema` to match existing pattern in ai-tags.ts, planning.ts, and other call sites
- **Files modified:** src/modules/goals/decompose.ts
- **Verification:** npx tsc --noEmit passes (no errors in decompose.ts)
- **Committed in:** c01dade (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary fix -- using snake_case would not match the SDK's expected camelCase key format.

## Issues Encountered
- Pre-existing TypeScript errors in src/modules/goals/commands.ts (from plan 11-02 changes). These are unrelated to this plan's scope and do not affect decompose.ts or ai-assistant/index.ts compilation.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Goal decomposition flow complete -- members can DM Jarvis to break down goals into AI-suggested sub-goals
- All three 11-goal-hierarchy plans now complete (schema, commands, decomposition)
- Goal hierarchy system fully operational: create, view tree, decompose via DM

## Self-Check: PASSED

All files verified present. Both task commits (c01dade, a5ede03) verified in git log.

---
*Phase: 11-goal-hierarchy*
*Completed: 2026-03-21*
