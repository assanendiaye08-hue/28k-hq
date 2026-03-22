---
phase: 10-smart-reminders
plan: 01
subsystem: reminders
tags: [chrono-node, prisma, natural-language, scheduling, discord-dm]

# Dependency graph
requires:
  - phase: 06-polish-and-launch-readiness
    provides: notification-router for delivery routing
  - phase: 09-productivity-timer
    provides: pattern reference for buttons, embeds, natural-language parsing
provides:
  - Reminder Prisma model with urgency tiers and recurrence support
  - chrono-node natural language time parser with timezone awareness
  - ReminderDeliveryBackend interface for pluggable delivery
  - DiscordReminderDelivery implementation with notification routing
  - Reminder button builders (acknowledge, skip next)
  - Low/high urgency embed builders with visual distinction
  - Notification router extended with 'reminder' type
affects: [10-smart-reminders]

# Tech tracking
tech-stack:
  added: [chrono-node]
  patterns: [pluggable-delivery-backend, two-stage-intent-parser, urgency-tiered-notifications]

key-files:
  created:
    - src/modules/reminders/constants.ts
    - src/modules/reminders/parser.ts
    - src/modules/reminders/buttons.ts
    - src/modules/reminders/embeds.ts
    - src/modules/reminders/delivery.ts
  modified:
    - prisma/schema.prisma
    - src/modules/notification-router/constants.ts
    - src/modules/notification-router/router.ts

key-decisions:
  - "chrono-node forwardDate with member timezone for future-biased time parsing"
  - "Two-stage parser: regex intent detection then chrono extraction (no AI call per parse)"
  - "Direct DM for high urgency to get message ID; deliverNotification fallback for routing"
  - "Cron expression built from chrono hour/minute + recurrence pattern day-of-week"
  - "reminderAccountId added to NotificationPreference for per-type routing"

patterns-established:
  - "ReminderDeliveryBackend interface: pluggable delivery contract for future Apple ecosystem support"
  - "Content extraction: strip intent prefix, time expression, recurrence phrase, connectors"
  - "Question rejection: QUESTION_PATTERNS checked before REMINDER_PATTERNS to avoid false positives"

requirements-completed: [REMIND-01, REMIND-02, REMIND-03, REMIND-04]

# Metrics
duration: 3min
completed: 2026-03-21
---

# Phase 10 Plan 01: Reminder Foundation Summary

**Prisma Reminder model with chrono-node parser, pluggable delivery backend, urgency-tiered embeds, and notification router extension**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-21T01:02:38Z
- **Completed:** 2026-03-21T01:06:20Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Reminder model in Prisma with urgency/status enums, recurrence (cronExpression), and restart-recovery indexes
- Two-stage natural language parser: regex keyword pre-filter + chrono-node time extraction with timezone and recurrence support
- Pluggable ReminderDeliveryBackend interface with DiscordReminderDelivery implementation using notification router
- Visually distinct delivery: plain text for low urgency, red accent embed for high urgency, "(delayed)" suffix for restart recovery
- Notification router extended with 'reminder' type across constants, labels, routable types, and field mapping

## Task Commits

Each task was committed atomically:

1. **Task 1: Prisma schema, chrono-node install, constants, and parser** - `b8c9653` (feat)
2. **Task 2: Buttons, embeds, delivery interface, and notification router extension** - `331ba71` (feat)

## Files Created/Modified
- `prisma/schema.prisma` - Added Reminder model, ReminderUrgency/ReminderStatus enums, reminderAccountId on NotificationPreference
- `src/modules/reminders/constants.ts` - Button IDs, defaults, intent patterns, recurrence patterns, urgency keywords
- `src/modules/reminders/parser.ts` - isReminderRequest intent detection + parseReminder chrono-node extraction
- `src/modules/reminders/buttons.ts` - High urgency (Got it), recurring (Skip Next), combined button builders
- `src/modules/reminders/embeds.ts` - Low urgency plain text, high urgency red embed, delayed content builders
- `src/modules/reminders/delivery.ts` - ReminderDeliveryBackend interface + DiscordReminderDelivery class
- `src/modules/notification-router/constants.ts` - Added 'reminder' to NotificationType, labels, routable types
- `src/modules/notification-router/router.ts` - Added reminder: 'reminderAccountId' to TYPE_TO_FIELD

## Decisions Made
- chrono-node with forwardDate and timezone for natural language time parsing (no AI call needed per reminder)
- Two-stage parser mirrors timer module pattern: fast regex pre-filter then structured extraction
- Direct DM for high urgency reminders to capture message ID for acknowledgment tracking; falls back to deliverNotification
- Cron expression format: `${minute} ${hour} * * ${cronDay}` built from chrono result + recurrence pattern
- Added reminderAccountId to NotificationPreference Prisma model for per-account routing

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added reminderAccountId to NotificationPreference Prisma model**
- **Found during:** Task 1 (Prisma schema)
- **Issue:** Plan noted to "Check if it already exists in schema -- if not, add it" -- it did not exist
- **Fix:** Added optional `reminderAccountId String?` field to NotificationPreference model
- **Files modified:** prisma/schema.prisma
- **Verification:** TypeScript compiles cleanly, field accessible in TYPE_TO_FIELD mapping
- **Committed in:** b8c9653 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Necessary for notification routing -- plan anticipated this addition.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All reminder building blocks ready for Plan 02 to wire into commands, scheduler, and DM handler
- Prisma migration needed before runtime (Plan 02 will handle `prisma migrate dev`)
- Parser, delivery, buttons, and embeds are importable and tested via TypeScript compilation

## Self-Check: PASSED

All 8 files verified present. Both task commits (b8c9653, 331ba71) confirmed in git log.

---
*Phase: 10-smart-reminders*
*Completed: 2026-03-21*
