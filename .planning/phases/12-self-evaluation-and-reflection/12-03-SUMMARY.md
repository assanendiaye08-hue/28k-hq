---
phase: 12-self-evaluation-and-reflection
plan: 03
subsystem: ai-assistant, scheduler
tags: [system-prompt, tiered-memory, morning-brief, reflection, jarvis]

# Dependency graph
requires:
  - phase: 12-self-evaluation-and-reflection
    provides: Reflection Prisma model with type, question, response, insights fields
  - phase: 08-inspiration-system
    provides: buildInspirationSection pattern in personality.ts
  - phase: 07-ai-infrastructure
    provides: Tiered memory with protected data in memory.ts
provides:
  - buildReflectionSection in personality.ts for system prompt
  - Reflection insights as protected data in buildMemberContext (never trimmed)
  - Morning briefs enriched with reflection context and AI prompt guidance
  - Forward-looking suggestion guidance in CONVERSATION_RULES
  - Reflections embed field in morning brief delivery
affects: [13-monthly-recap]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reflection section follows buildInspirationSection pattern: empty array returns empty string"
    - "Protected data extension: new data types added to buildMemberContext type signature"
    - "Brief enrichment via optional parameter with default empty array for backward compat"

key-files:
  created: []
  modified:
    - src/modules/ai-assistant/personality.ts
    - src/modules/ai-assistant/memory.ts
    - src/modules/scheduler/briefs.ts

key-decisions:
  - "Reflection insights filtered (only non-null insights shown) to keep prompts clean"
  - "generateBrief accepts reflections as optional param with default empty array for backward compat"
  - "Reflections embed field only shown when member has reflection data (no clutter)"

patterns-established:
  - "Feedback loop pattern: stored data flows back into AI context via system prompt + protected memory + brief enrichment"

requirements-completed: [REFLECT-03, REFLECT-04]

# Metrics
duration: 3min
completed: 2026-03-21
---

# Phase 12 Plan 03: Jarvis Reflection Intelligence Integration Summary

**Reflection insights wired into system prompt, protected memory, and morning briefs with forward-looking suggestion guidance**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-21T02:38:07Z
- **Completed:** 2026-03-21T02:41:24Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- buildReflectionSection renders recent member reflection insights in Jarvis system prompt with natural referencing guidance
- Reflection insights included as protected data in tiered memory (never trimmed by token budget)
- Morning briefs load recent reflections, pass to AI generation with updated prompt, and show Reflections count in embed
- Forward-looking suggestion guidance added to CONVERSATION_RULES
- Nudges inherit reflection context automatically through buildSystemPrompt (no code changes needed)

## Task Commits

Each task was committed atomically:

1. **Task 1: System prompt reflection section and forward-looking guidance** - `d304d7e` (feat)
2. **Task 2: Protected memory context and brief enrichment** - `6eb5f45` (feat)

## Files Created/Modified
- `src/modules/ai-assistant/personality.ts` - buildReflectionSection function, reflections query in buildSystemPrompt, forward-looking guidance in CONVERSATION_RULES
- `src/modules/ai-assistant/memory.ts` - Reflection insights as protected data in buildMemberContext, reflections query in assembleContext, updated header comment
- `src/modules/scheduler/briefs.ts` - Reflections query in sendBrief, reflection context in generateBrief user message, updated brief AI prompt, Reflections embed field

## Decisions Made
- Reflection insights are filtered (only non-null insights displayed) to keep system prompts and memory clean
- generateBrief accepts reflections as an optional parameter with default empty array for backward compatibility with any existing callers
- Reflections embed field only added when member has reflection data, avoiding clutter for members without reflections
- Memory header comment updated from "when added in Phase 12" to reflect implementation is live

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Full reflection feedback loop is closed: reflections stored in DB flow back into every Jarvis interaction (conversations, nudges, briefs)
- Phase 13 (Monthly Recap) can aggregate reflection data for deeper monthly summaries
- All three Phase 12 plans complete: data foundation (12-01), DM flow (12-02), intelligence integration (12-03)

## Self-Check: PASSED

All 3 modified files verified present. Both task commits (d304d7e, 6eb5f45) confirmed in git log.

---
*Phase: 12-self-evaluation-and-reflection*
*Completed: 2026-03-21*
