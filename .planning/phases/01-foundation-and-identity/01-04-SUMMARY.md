---
phase: 01-foundation-and-identity
plan: 04
subsystem: profile
tags: [openrouter, ai-tags, structured-output, profile-visibility, account-linking, prisma-transaction, discord-roles]

# Dependency graph
requires:
  - phase: 01-foundation-and-identity/01
    provides: "Bot core, CommandRegistry, EventBus, ModuleLoader, shared types/embeds/constants"
  - phase: 01-foundation-and-identity/02
    provides: "Prisma schema (MemberProfile, DiscordAccount, LinkCode, InterestTag), encryption extension, PrismaClient"
provides:
  - "Profile module: AI tag extraction via OpenRouter, /profile command, visibility controls"
  - "Identity module: /link, /verify, /unlink commands with atomic account linking"
  - "Interest tag role management: sync and cleanup of AI-managed Discord roles"
  - "Lazy tag extraction on first /profile view + async extraction on memberSetupComplete event"
affects: [02-01, 02-02, 04-01, all-future-plans]

# Tech tracking
tech-stack:
  added: []
  patterns: [openrouter-structured-output, lazy-ai-extraction, prisma-interactive-transaction, interest-tag-role-sync, profile-visibility-toggle]

key-files:
  created:
    - src/modules/profile/ai-tags.ts
    - src/modules/profile/commands.ts
    - src/modules/profile/visibility.ts
    - src/modules/profile/index.ts
    - src/modules/identity/linking.ts
    - src/modules/identity/commands.ts
    - src/modules/identity/index.ts
    - src/modules/server-setup/interest-tags.ts
  modified: []

key-decisions:
  - "OpenRouter SDK uses camelCase API (responseFormat, jsonSchema) not snake_case -- adapted from research doc patterns"
  - "Lazy tag extraction: first /profile view triggers AI extraction if tags empty but rawAnswers exist, plus async extraction on memberSetupComplete"
  - "Interest tags created as neutral grey (0x95a5a6) Discord roles -- subtle and distinct from rank roles"
  - "Account linking uses Prisma interactive $transaction for atomic code verification + account creation"
  - "Visibility select menu allows zero selections (all fields private) via setMinValues(0)"

patterns-established:
  - "AI extraction pattern: OpenRouter structured output with json_schema + fallback to basic text splitting on failure"
  - "Visibility pattern: publicFields array on MemberProfile, getPublicProfile filters, updateVisibility validates field names"
  - "Link flow pattern: generateLinkCode -> ephemeral display -> verifyLinkCode (atomic) -> role copy from existing accounts"
  - "Interest tag lifecycle: syncInterestTags creates/increments, cleanupUnusedTags removes after 7 days of zero members"

requirements-completed: [FNDN-03, FNDN-05]

# Metrics
duration: 7min
completed: 2026-03-20
---

# Phase 1 Plan 4: AI Profile Extraction, Visibility Controls, and Account Linking Summary

**OpenRouter AI tag extraction with structured outputs, profile visibility toggles via select menu, and atomic multi-account identity linking with 5-minute code TTL**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-20T10:08:16Z
- **Completed:** 2026-03-20T10:14:58Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- AI-powered profile tag extraction via OpenRouter structured output (json_schema with strict: true) with graceful fallback to basic text splitting
- /profile command showing own full profile with edit-visibility button, or another member's public-only profile filtered by publicFields
- Interest tags automatically created as Discord roles and synced to member accounts, with 7-day cleanup for unused tags
- Complete identity linking flow: /link generates 6-char code, /verify atomically links via Prisma $transaction, /unlink with last-account protection
- Lazy extraction on first /profile view plus async extraction on memberSetupComplete event for seamless onboarding integration

## Task Commits

Each task was committed atomically:

1. **Task 1: Profile module -- AI tag extraction, /profile command, visibility control, interest tag roles** - `0ea8e1d` (feat)
2. **Task 2: Identity module -- /link, /verify, /unlink commands with atomic verification** - `2abf43f` (feat)

## Files Created/Modified
- `src/modules/profile/ai-tags.ts` - OpenRouter integration for extracting structured tags from natural language with json_schema format
- `src/modules/profile/commands.ts` - /profile command handler: own full profile or another's public profile, visibility edit via select menu
- `src/modules/profile/visibility.ts` - Profile field visibility control with validation and default public fields
- `src/modules/profile/index.ts` - Profile module registration, memberSetupComplete event listener for async tag extraction
- `src/modules/identity/linking.ts` - Account linking logic: generateLinkCode, verifyLinkCode ($transaction), unlinkAccount, getLinkedAccounts
- `src/modules/identity/commands.ts` - /link, /verify, /unlink command handlers with role copying and error handling
- `src/modules/identity/index.ts` - Identity module registration for all three commands
- `src/modules/server-setup/interest-tags.ts` - Interest tag Discord role creation, sync, and cleanup (7-day unused threshold)

## Decisions Made
- OpenRouter SDK uses camelCase property names (responseFormat, jsonSchema) not the snake_case from research doc examples -- adapted accordingly
- Implemented lazy tag extraction: if structured tags are empty but rawAnswers exist when /profile is called, triggers AI extraction inline. Also registers a memberSetupComplete listener for proactive background extraction.
- Interest tag Discord roles use neutral grey color (0x95a5a6) to visually distinguish from rank roles
- Account linking uses Prisma interactive $transaction to atomically validate code + create DiscordAccount (prevents race condition pitfall #8 from research)
- Visibility select menu uses setMinValues(0) so members can make all fields private (empty selection)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Profile and identity modules are complete and ready for use
- Phase 2 (Daily Engagement Loop) can now reference member profiles for personalized check-ins and morning briefs
- Phase 4 (AI Assistant) can use the profile tags for context-aware conversations
- The interest tag cleanup function (cleanupUnusedTags) should be wired to a scheduled task when cron/scheduler is added
- All modules compile with zero TypeScript errors and follow established patterns from Plans 01-02

## Self-Check: PASSED

All 8 created files verified present on disk. Both task commits (0ea8e1d, 2abf43f) verified in git log. TypeScript compiles with zero errors.

---
*Phase: 01-foundation-and-identity*
*Completed: 2026-03-20*
