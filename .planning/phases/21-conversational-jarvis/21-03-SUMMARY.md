---
phase: 21-conversational-jarvis
plan: 03
subsystem: ai, chat
tags: [topic-filtering, brainstorming, keyword-classification, context-assembly]

# Dependency graph
requires:
  - phase: 21-conversational-jarvis
    plan: 01
    provides: "Topic field on ConversationMessage, tool calling support"
  - phase: 21-conversational-jarvis
    plan: 02
    provides: "start_brainstorm tool definition, handleChatWithTools, DM handler"
provides:
  - "Topic-tagged message storage with keyword-based classification"
  - "Topic-aware context assembly that biases toward same-topic messages"
  - "BrainstormManager with diverge/cluster/evaluate phases"
  - "Brainstorm session integration in DM handler"
affects: [22-daily-rhythm]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Keyword heuristic classification for lightweight topic tagging (no LLM cost per message)"
    - "Topic-aware context filtering: always keep last 5 messages for continuity, filter rest by topic"
    - "In-memory session management with TTL for stateful multi-message flows (brainstorm)"
    - "Phase-specific LLM system prompts for structured creative sessions"

key-files:
  created:
    - "apps/bot/src/modules/ai-assistant/brainstorm.ts"
  modified:
    - "apps/bot/src/modules/ai-assistant/memory.ts"
    - "apps/bot/src/modules/ai-assistant/chat.ts"
    - "apps/bot/src/modules/ai-assistant/index.ts"

key-decisions:
  - "Keyword heuristic classification chosen over LLM-based topic detection -- avoids extra API cost per message while handling the 80% case"
  - "Topic filtering keeps last 5 messages regardless of topic for conversation continuity"
  - "Brainstorm sessions are in-memory with 30-min TTL -- no DB persistence needed for ephemeral creative sessions"
  - "Brainstorm check placed before pending action check in DM handler -- active sessions take priority"

patterns-established:
  - "Topic classification: classifyTopic() returns category string from keyword heuristics"
  - "Brainstorm flow: startSession -> handleMessage (phase routing) -> endSession with keyword-triggered transitions"

requirements-completed: [JARV-03, JARV-05]

# Metrics
duration: 3min
completed: 2026-03-22
---

# Phase 21 Plan 03: Topic-Aware Context and Brainstorming Mode Summary

**Keyword-based topic tagging with context filtering to prevent conversation bleeding, plus structured three-phase brainstorming sessions**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-22T11:39:21Z
- **Completed:** 2026-03-22T11:42:35Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Added topic-aware message storage and context assembly that prevents conversation bleeding between unrelated topics
- Implemented lightweight keyword heuristic classification for 7 topic categories (coding, fitness, business, learning, design, content, general)
- Built BrainstormManager with three structured phases (diverge, cluster, evaluate) and LLM-powered transitions
- Wired brainstorm sessions into DM handler with proper session lifecycle and start_brainstorm tool call integration

## Task Commits

Each task was committed atomically:

1. **Task 1: Add topic-aware context to memory service** - `5064ff6` (feat)
2. **Task 2: Implement brainstorming mode with structured phases** - `7de774e` (feat)

## Files Created/Modified
- `apps/bot/src/modules/ai-assistant/memory.ts` - storeMessage accepts optional topic, assembleContext filters by topic with 5-message continuity guarantee
- `apps/bot/src/modules/ai-assistant/chat.ts` - Added classifyTopic function, both handleChat and handleChatWithTools store messages with topic tags
- `apps/bot/src/modules/ai-assistant/brainstorm.ts` - BrainstormManager with diverge/cluster/evaluate phases, keyword-triggered transitions, 30-min TTL
- `apps/bot/src/modules/ai-assistant/index.ts` - Brainstorm session check before pending actions, start_brainstorm tool creates session

## Decisions Made
- Keyword heuristic classification chosen over LLM-based topic detection to avoid extra API cost per message while covering the 80% case
- Topic filtering always keeps last 5 messages regardless of topic for conversation continuity -- prevents disorienting context jumps
- Brainstorm sessions are in-memory (Map) with 30-min TTL rather than DB-persisted -- ephemeral creative sessions don't need durability
- Brainstorm session check placed before pending action check in DM handler so active sessions take priority over stale confirmations

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 5 Phase 21 requirements (JARV-01 through JARV-05) are now implemented across the three plans
- Topic-aware context ready for future enhancement (LLM-based classification) without schema changes
- Brainstorm sessions ready for use via natural language ("let's brainstorm landing page ideas")
- Phase 22 (daily rhythm) can build on the conversational foundation: proactive outreach, daily summaries, coaching settings

## Self-Check: PASSED

- All 4 created/modified files exist on disk
- Commit 5064ff6 (Task 1) verified in git log
- Commit 7de774e (Task 2) verified in git log
- SUMMARY.md created at expected path

---
*Phase: 21-conversational-jarvis*
*Completed: 2026-03-22*
