# Phase 10: Smart Reminders - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Time-based reminders set via natural language DM or /remind command, with urgency tiers (low/high), recurring schedules, skip-one-occurrence support, /reminders list+cancel management, pluggable delivery backend, and restart persistence. Reminders use member's timezone from MemberSchedule.

</domain>

<decisions>
## Implementation Decisions

### Reminder Creation UX
- Both DM natural language ("remind me Tuesday 3pm to call X") AND /remind slash command
- chrono-node parses time expressions in both flows
- Recurrence via natural language ("every Monday at 9am") AND explicit /remind repeat option
- All reminders use member's timezone from MemberSchedule.timezone (default UTC if not set)
- Urgency: Claude's discretion on UX (recommend default low, opt-in high via keyword "urgent" or command option)

### High Urgency Behavior
- Repeat cadence: Claude's discretion (recommend 3 repeats, 5 min apart)
- Acknowledgment: both emoji reaction AND "Got it" button stop repeats
- Visual emphasis: Claude's discretion (recommend embed with accent color for high urgency vs plain text for low)

### Recurring Reminder Management
- /reminders list shows all pending + recurring reminders with IDs
- /reminders cancel [id] removes a reminder
- Skip button on recurring reminder DMs — skips next occurrence only, doesn't cancel the series
- Pending reminders survive bot restarts (DB-backed scheduling, rebuild on ready)

### Reminder Tone & Content
- Exact as written — "remind me to call X" → DM says "Reminder: call X". No AI embellishment, no API call per reminder
- Goal connection: Claude's discretion on whether to suggest links to active goals

### Pluggable Delivery
- Discord DM as the delivery backend for now
- Interface designed so Apple ecosystem (APNs, Shortcuts) can be added later without rewriting the scheduler
- Uses existing deliverNotification from notification-router where appropriate

### Claude's Discretion
- Urgency UX (keyword "urgent" vs command option vs both)
- Repeat cadence for high urgency (count and interval)
- Visual distinction between low and high urgency DMs
- Whether to link reminders to active goals
- How DM natural language parsing integrates with existing timer NLP in ai-assistant/index.ts

</decisions>

<specifics>
## Specific Ideas

- "Ensure each user's timezone is correctly set" — if timezone isn't set when creating a reminder, prompt them to set it via /settings
- Reminders should feel like Jarvis is your personal assistant — reliable, on time, exactly what you asked for
- Pluggable delivery is an interface/abstraction, not a library — design the contract now, implement Apple later

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 10-smart-reminders*
*Context gathered: 2026-03-21*
