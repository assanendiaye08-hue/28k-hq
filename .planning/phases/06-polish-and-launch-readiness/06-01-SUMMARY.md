---
phase: 06-polish-and-launch-readiness
plan: 01
subsystem: notifications, database, server-setup
tags: [prisma, notification-routing, slash-commands, multi-account, feed-curation]

# Dependency graph
requires:
  - phase: 01-foundation-and-identity
    provides: "Member model, DiscordAccount linking, private space delivery"
  - phase: 02-daily-engagement-loop
    provides: "deliverToPrivateSpace callers (briefs, check-ins, goals)"
  - phase: 04-ai-assistant
    provides: "nudge.ts caller for deliverToPrivateSpace"
provides:
  - "NotificationPreference model for per-type account routing"
  - "FeedSource, FeedPost, FeedType models for content curation"
  - "deliverNotification function with fallback chain"
  - "/notifications command with view/set/reset subcommands"
  - "auto-feed channel in RESOURCES category"
affects: [06-02, 06-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Notification routing: deliverNotification wraps deliverToPrivateSpace with per-type account preferences"
    - "Type-to-field mapping pattern for dynamic Prisma field access"

key-files:
  created:
    - src/modules/notification-router/constants.ts
    - src/modules/notification-router/router.ts
    - src/modules/notification-router/commands.ts
    - src/modules/notification-router/index.ts
  modified:
    - prisma/schema.prisma
    - src/shared/constants.ts
    - src/shared/delivery.ts
    - src/modules/server-setup/channels.ts
    - src/modules/onboarding/setup-flow.ts
    - src/modules/scheduler/briefs.ts
    - src/modules/ai-assistant/nudge.ts
    - src/modules/xp/index.ts
    - src/modules/voice-tracker/index.ts
    - src/modules/goals/expiry.ts
    - src/modules/checkin/commands.ts
    - src/deploy-commands.ts

key-decisions:
  - "NotificationType uses string union (not enum) for lightweight type safety without Prisma enum migration"
  - "General notifications (voice summaries, goal expiry, check-in confirmations) skip preference lookup for efficiency"
  - "auto-feed channel added alongside existing resource channels (not replacing them) per research recommendation"

patterns-established:
  - "deliverNotification as the standard for all recurring notifications -- deliverToPrivateSpace reserved for one-off deliveries"

requirements-completed: [FNDN-06]

# Metrics
duration: 5min
completed: 2026-03-20
---

# Phase 6 Plan 1: Notification Router and Schema Migration Summary

**Per-notification-type account routing with deliverNotification, Phase 6 schema models (NotificationPreference, FeedSource, FeedPost), and Hustle Zones removal**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-20T20:01:43Z
- **Completed:** 2026-03-20T20:07:34Z
- **Tasks:** 2
- **Files modified:** 16

## Accomplishments
- Schema extended with 3 new models (NotificationPreference, FeedSource, FeedPost), 1 enum (FeedType), and 1 relation (Member.notificationPreference)
- deliverNotification function routes to member's preferred Discord account per notification type, with graceful fallback to deliverToPrivateSpace
- All 8 recurring notification callers migrated from deliverToPrivateSpace to deliverNotification (only data-privacy/commands.ts retains direct deliverToPrivateSpace usage for file exports)
- /notifications command with view/set/reset subcommands registered (23 total commands)
- Hustle Zones category removed from SERVER_CATEGORIES; auto-feed channel added to RESOURCES
- Setup-flow interests hint updated to lane-agnostic examples

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema migration, lane cleanup, and notification router core** - `afb0382` (feat)
2. **Task 2: Wire notification routing into all callers and /notifications command** - `d9cb2a3` (feat)

## Files Created/Modified
- `prisma/schema.prisma` - Added NotificationPreference, FeedSource, FeedPost models and FeedType enum
- `src/modules/notification-router/constants.ts` - NotificationType union, labels, ROUTABLE_TYPES array
- `src/modules/notification-router/router.ts` - deliverNotification with preference lookup and fallback
- `src/modules/notification-router/commands.ts` - /notifications view/set/reset subcommands
- `src/modules/notification-router/index.ts` - Module registration for auto-discovery
- `src/shared/constants.ts` - Removed Hustle Zones category
- `src/shared/delivery.ts` - Added deprecation note pointing to notification-router
- `src/modules/server-setup/channels.ts` - Added auto-feed channel to RESOURCES category
- `src/modules/onboarding/setup-flow.ts` - Updated interests hint to lane-agnostic examples
- `src/modules/scheduler/briefs.ts` - Migrated 2 calls to deliverNotification('brief')
- `src/modules/ai-assistant/nudge.ts` - Migrated 1 call to deliverNotification('nudge')
- `src/modules/xp/index.ts` - Migrated 1 call to deliverNotification('level_up')
- `src/modules/voice-tracker/index.ts` - Migrated 2 calls to deliverNotification('general')
- `src/modules/goals/expiry.ts` - Migrated 1 call to deliverNotification('general')
- `src/modules/checkin/commands.ts` - Migrated 1 call to deliverNotification('general')
- `src/deploy-commands.ts` - Added /notifications (23 total commands)

## Decisions Made
- NotificationType uses a string union type ('brief' | 'nudge' | 'session_alert' | 'level_up' | 'general') instead of a Prisma enum -- lightweight, no migration needed, matches the DB field structure directly
- 'general' type notifications bypass preference lookup entirely for efficiency since they are not user-routable
- auto-feed channel added alongside existing resource channels rather than replacing them, keeping human-shared and AI-curated content separate per research recommendation

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Database server not running locally, so `prisma db push` could not execute. Schema validated successfully via `prisma generate` and `tsc --noEmit`. Push will succeed on next deployment when DB is available.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- NotificationPreference model ready for member routing configuration
- FeedSource/FeedPost/FeedType models ready for Plan 02 (auto-feed curation)
- deliverNotification established as the standard notification pathway
- auto-feed channel ready for content posting in Plan 02

---
*Phase: 06-polish-and-launch-readiness*
*Completed: 2026-03-20*
