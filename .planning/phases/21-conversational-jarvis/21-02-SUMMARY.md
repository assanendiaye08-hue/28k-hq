---
phase: 21-conversational-jarvis
plan: 02
subsystem: ai, chat
tags: [tool-calling, llm, intent-detection, confirmation-flow, chrono-node]

# Dependency graph
requires:
  - phase: 21-conversational-jarvis
    plan: 01
    provides: "Tool calling support in AI client, ToolDefinition type, 'intent' AIFeature"
provides:
  - "5 intent tool definitions for NL actions (log_checkin, create_goal, set_reminder, track_commitment, start_brainstorm)"
  - "Confirmation-before-mutation executor with PendingAction map and TTL"
  - "handleChatWithTools function that calls AI with tools and returns structured result"
  - "Refactored DM handler: pending check first, then tool-calling chat, regex routing removed"
affects: [21-03, 22-daily-rhythm]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Confirmation-before-mutation: LLM detects intent -> present confirmation -> user confirms -> execute DB mutation"
    - "PendingAction map keyed by memberId with 5-min TTL for confirmation state"
    - "Tool-calling chat parallel to plain chat -- same pipeline, different callAI options"

key-files:
  created:
    - "apps/bot/src/modules/ai-assistant/intent-tools.ts"
    - "apps/bot/src/modules/ai-assistant/intent-executor.ts"
  modified:
    - "apps/bot/src/modules/ai-assistant/chat.ts"
    - "apps/bot/src/modules/ai-assistant/index.ts"

key-decisions:
  - "Reuse existing checkin/reminder/goal logic in executor rather than duplicating -- keeps behavior consistent with slash commands"
  - "Brainstorm tool defined but executor defers to Plan 03 -- no confirmation needed for brainstorm"
  - "Private channel check removed from DM handler -- DM-only after Phase 20 cleanup"
  - "Tool call descriptions include negative examples to minimize false positives"

patterns-established:
  - "Confirmation flow: LLM tool call -> buildConfirmation -> pendingActions.set -> user yes/no -> executePendingAction"
  - "handleChatWithTools returns ChatWithToolsResult with optional toolCall field"

requirements-completed: [JARV-01, JARV-02]

# Metrics
duration: 4min
completed: 2026-03-22
---

# Phase 21 Plan 02: NL Intent Detection and Action Pipeline Summary

**LLM tool-calling intent detection with confirmation-before-mutation executor, replacing regex-based routing in DM handler**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-22T11:32:55Z
- **Completed:** 2026-03-22T11:36:36Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Built 5 tool definitions with carefully worded descriptions to minimize false positive intent detection
- Implemented confirmation-before-mutation flow with PendingAction map, TTL expiration, and yes/no detection
- Added handleChatWithTools alongside handleChat for tool-calling DM conversations
- Refactored DM handler to use LLM tool calling instead of regex-based reminder/decomposition routing

## Task Commits

Each task was committed atomically:

1. **Task 1: Create intent tools and executor with confirmation flow** - `cc82432` (feat)
2. **Task 2: Create tool-calling chat handler and refactor DM handler** - `d302972` (feat)

## Files Created/Modified
- `apps/bot/src/modules/ai-assistant/intent-tools.ts` - 5 tool definitions (log_checkin, create_goal, set_reminder, track_commitment, start_brainstorm) with specific descriptions
- `apps/bot/src/modules/ai-assistant/intent-executor.ts` - PendingAction map, isConfirmation/isDenial, buildConfirmation, executePendingAction with reused business logic
- `apps/bot/src/modules/ai-assistant/chat.ts` - Added handleChatWithTools and ChatWithToolsResult type alongside existing handleChat
- `apps/bot/src/modules/ai-assistant/index.ts` - Refactored DM handler: pending check first, tool-calling chat, no regex routing

## Decisions Made
- Reused existing checkin/reminder/goal business logic in the executor rather than duplicating it, ensuring NL actions behave identically to slash commands
- Brainstorm tool is defined but the executor defers actual brainstorm handling to Plan 03
- Private channel check removed from DM handler since all interaction is DM-only after Phase 20
- Tool call descriptions include negative examples ("Do NOT call this when...") to reduce false positives

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Intent detection pipeline fully operational for DM conversations
- Brainstorm tool defined but deferred to Plan 03 for actual brainstorm flow implementation
- Confirmation flow ready for all action types
- handleChat preserved for /ask slash command (no tools, plain conversation)

## Self-Check: PASSED

- All 4 created/modified files exist on disk
- Commit cc82432 (Task 1) verified in git log
- Commit d302972 (Task 2) verified in git log
- SUMMARY.md created at expected path

---
*Phase: 21-conversational-jarvis*
*Completed: 2026-03-22*
