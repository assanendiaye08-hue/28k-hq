---
phase: 06-polish-and-launch-readiness
plan: 02
subsystem: auto-feed, ai, content-curation
tags: [rss-parser, deepseek, openrouter, node-cron, discord-embeds, reactions]

# Dependency graph
requires:
  - phase: 06-polish-and-launch-readiness
    provides: "FeedSource, FeedPost, FeedType schema models and auto-feed channel in RESOURCES category"
  - phase: 01-foundation-and-identity
    provides: "Module loader auto-discovery, OpenRouter SDK pattern, config system"
provides:
  - "RSS, YouTube RSS, and Reddit JSON feed fetchers with per-source error isolation"
  - "AI content filter using DeepSeek V3.2 structured output with 70+ relevance threshold"
  - "Discord embed poster with reaction seeding and FeedPost deduplication"
  - "Feedback collector updating vote counts from Discord reactions"
  - "Auto-feed module with 4 daily fetch cycles and 1 daily feedback sweep"
affects: [06-03]

# Tech tracking
tech-stack:
  added: [rss-parser]
  patterns:
    - "Three-stage pipeline: fetch -> filter -> post with per-stage isolation"
    - "AI classification with per-source feedback stats in prompt context"
    - "Fail-safe: never post unfiltered content if AI is unavailable"

key-files:
  created:
    - src/modules/auto-feed/constants.ts
    - src/modules/auto-feed/sources.ts
    - src/modules/auto-feed/filter.ts
    - src/modules/auto-feed/poster.ts
    - src/modules/auto-feed/feedback.ts
    - src/modules/auto-feed/index.ts
  modified:
    - package.json

key-decisions:
  - "Sequential AI classification (not parallel) to respect OpenRouter rate limits"
  - "Link-based deduplication (FeedPost.link) for cross-restart safety without sourceId dependency"
  - "Per-source approval rates included in AI classification prompts for feedback-driven learning"
  - "4 daily cron cycles posting top 1 item each for 2-4 items/day spread across the day"

patterns-established:
  - "Feed pipeline pattern: fetch -> filter -> post with empty-result short-circuiting"
  - "Source feedback loop: reaction counts -> per-source approval rates -> AI prompt context"

requirements-completed: [CONT-02]

# Metrics
duration: 3min
completed: 2026-03-20
---

# Phase 6 Plan 2: Auto-Content Feed System Summary

**RSS/YouTube/Reddit feed pipeline with DeepSeek V3.2 AI quality filter, Discord embed posting, and reaction-based feedback learning loop**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-20T20:10:32Z
- **Completed:** 2026-03-20T20:14:01Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Built three source fetchers (RSS, YouTube RSS, Reddit JSON) with per-source error isolation and 500ms Reddit rate limiting
- AI content filter using DeepSeek V3.2 structured output with 70+ relevance threshold and per-source approval rate feedback in prompts
- Rich Discord embeds with source-based colors, upvote/downvote reaction seeding, and FeedPost record creation for deduplication
- Daily feedback collector sweeps 7-day reactions to update vote counts used by AI filter
- Module runs 4 daily feed cycles (8am, 12pm, 4pm, 8pm UTC) and 1 feedback sweep (3 AM UTC)

## Task Commits

Each task was committed atomically:

1. **Task 1: Install rss-parser and build feed source fetchers with AI filter** - `08db2b3` (feat)
2. **Task 2: Feed poster, feedback collector, and module registration with cron** - `023965c` (feat)

## Files Created/Modified
- `package.json` - Added rss-parser dependency
- `src/modules/auto-feed/constants.ts` - Channel name, thresholds, schedules, FeedItem/FilterResult interfaces
- `src/modules/auto-feed/sources.ts` - fetchRSS, fetchYouTube, fetchReddit, fetchAllSources with per-source isolation
- `src/modules/auto-feed/filter.ts` - AI classification via DeepSeek V3.2 with feedback-informed prompts and 70+ threshold
- `src/modules/auto-feed/poster.ts` - Rich embed builder, reaction seeding, FeedPost record creation with deduplication
- `src/modules/auto-feed/feedback.ts` - Reaction count sweep updating FeedPost upvotes/downvotes
- `src/modules/auto-feed/index.ts` - Module registration with 5 cron jobs (4 feed + 1 feedback)

## Decisions Made
- Sequential AI classification instead of parallel to stay within OpenRouter rate limits -- each item processed one at a time with try/catch isolation
- Link-based deduplication checks FeedPost.link instead of sourceId+externalId combo because sourceId is not available at filter time -- link is unique enough and works across restarts
- Per-source approval rates (upvotes/downvotes) are included directly in the AI classification prompt as natural language context, enabling prompt-based training without fine-tuning
- Each of 4 daily cron cycles posts up to MAX_POSTS_PER_CYCLE items but in practice most cycles post 0-1 items, achieving the 2-4 items/day target

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. rss-parser has no API keys. Reddit JSON endpoint is unauthenticated. OpenRouter key already configured from prior phases.

## Next Phase Readiness
- Auto-feed module ready for production use once FeedSource records are seeded in the database
- Feedback loop will begin accumulating data as soon as posts start appearing
- Plan 03 (hardening) can build on this for restart recovery verification

## Self-Check: PASSED

All 6 created files verified on disk. Both task commits (08db2b3, 023965c) verified in git history.

---
*Phase: 06-polish-and-launch-readiness*
*Completed: 2026-03-20*
