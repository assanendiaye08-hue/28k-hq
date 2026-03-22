---
phase: 23-social-layer-refinement
plan: 02
subsystem: social
tags: [voice-co-working, accountability, nudge, morning-brief, session-embeds, library-effect]

# Dependency graph
requires:
  - phase: 23-social-layer-refinement
    plan: 01
    provides: Streak two-day rule, consistency rate metric, consolidated channels
  - phase: 22-daily-rhythm
    provides: Morning brief, nudge system, reflection flow
provides:
  - Voice co-working social proof in morning briefs (live voice presence detection)
  - Enhanced session embeds with "why join?" rationale and collective focused minutes
  - Accountability delegation rules in Jarvis personality (hard truths DM-only)
  - Commitment-aware and consistency-rate-aware nudge instructions
affects: [24-desktop-enhancement]

# Tech tracking
tech-stack:
  added: []
  patterns: [accountability-delegation, voice-social-proof, celebration-only-public]

key-files:
  created: []
  modified:
    - apps/bot/src/modules/scheduler/briefs.ts
    - apps/bot/src/modules/sessions/embeds.ts
    - apps/bot/src/modules/sessions/constants.ts
    - apps/bot/src/modules/ai-assistant/nudge.ts
    - apps/bot/src/modules/ai-assistant/personality.ts
    - apps/bot/src/modules/sessions/manager.ts

key-decisions:
  - "CommunityPulse.getCommunityPulse accepts optional Client param for live voice detection -- backward compatible"
  - "generateBrief accepts optional Client param -- backward compatible with existing callers"
  - "ACCOUNTABILITY DELEGATION appended as separate section to system prompt, not inlined into character prompt"
  - "Commitment queries limited to 3 ACTIVE commitments -- keeps nudge context focused"

patterns-established:
  - "Accountability delegation: bot handles hard truths in DMs, public channels are celebration-only"
  - "Voice social proof: live voice presence shown in morning briefs to promote co-working"
  - "Collective impact metric: session summaries show participants x minutes = total focused minutes"

requirements-completed: [SOCIAL-01, SOCIAL-04]

# Metrics
duration: 4min
completed: 2026-03-22
---

# Phase 23 Plan 02: Voice Co-Working and Accountability Tone Summary

**Voice co-working promotion in morning briefs and session embeds, with data-driven accountability nudges that deliver hard truths factually in DMs only**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-22T14:17:58Z
- **Completed:** 2026-03-22T14:22:20Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Morning briefs now include live voice channel presence (who's grinding, how many) and a Lock-in section promoting co-working
- Session announcement embeds include "Why join?" rationale with 143% focus stat; session summaries show collective focused minutes
- Jarvis personality has explicit ACCOUNTABILITY DELEGATION rules: hard truths as data in DMs, never public callouts
- Nudge instructions reference specific missed/upcoming commitments and 30-day consistency rate

## Task Commits

Each task was committed atomically:

1. **Task 1: Voice co-working promotion in morning brief and session embeds** - `eafdf08` (feat)
2. **Task 2: Bot accountability tone -- hard truths in DMs, support in public** - `7513e6a` (feat)

## Files Created/Modified
- `apps/bot/src/modules/sessions/constants.ts` - Added VOICE_PROMO_LINE reusable constant
- `apps/bot/src/modules/sessions/embeds.ts` - "Why join?" field on announcements, collective impact on summaries
- `apps/bot/src/modules/scheduler/briefs.ts` - Voice presence in CommunityPulse, Lock-in section in AI instructions
- `apps/bot/src/modules/ai-assistant/personality.ts` - ACCOUNTABILITY DELEGATION section in system prompt
- `apps/bot/src/modules/ai-assistant/nudge.ts` - Commitment querying, consistency rate context, updated tone instructions
- `apps/bot/src/modules/sessions/manager.ts` - Design intent comments documenting celebration-only public pattern

## Decisions Made
- CommunityPulse and generateBrief accept optional Client parameter for live voice detection -- backward compatible, no breaking changes
- ACCOUNTABILITY DELEGATION added as a separate constant appended after reflection section -- clean separation of concerns
- Commitment queries limited to 3 active commitments to keep nudge context concise and relevant
- Voice member display names capped at 5 with "+N more" overflow indicator

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Social layer complete (2/2 plans done)
- Ready for Phase 24 (desktop enhancement)
- No blockers

## Self-Check: PASSED

All 6 files verified present. Both task commits (eafdf08, 7513e6a) confirmed in git log.

---
*Phase: 23-social-layer-refinement*
*Completed: 2026-03-22*
