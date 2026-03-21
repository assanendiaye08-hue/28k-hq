# Phase 10: Smart Reminders - Research

**Researched:** 2026-03-21
**Domain:** Time-based reminder system with natural language parsing, urgency tiers, recurring schedules, and pluggable delivery
**Confidence:** HIGH

## Summary

Phase 10 adds a reminder system where members set time-based reminders via natural language DM or `/remind` slash command. chrono-node (v2.9.0) parses time expressions, producing JavaScript Date objects from phrases like "Tuesday at 3pm" or "in 2 hours". Recurring reminders ("every Monday at 9am") require a thin regex layer on top of chrono-node, since chrono explicitly does not support recurrence patterns. The existing `SchedulerManager` (node-cron 4.x with timezone support) handles recurring scheduling, while `setTimeout` handles one-shot reminders -- both patterns are already established in the codebase.

Reminders are DB-backed (Prisma model) for restart persistence. On bot ready, pending one-shot reminders are re-scheduled from DB (same pattern as timer restart recovery), and recurring reminders are rebuilt via node-cron (same pattern as brief/nudge scheduling). The notification-router's `deliverNotification` is extended with a `reminder` type for pluggable delivery. High-urgency reminders use embeds with accent color, repeat up to 3 times at 5-minute intervals, and stop when acknowledged via button or reaction.

**Primary recommendation:** Follow the timer module's architecture (in-memory Map + DB persistence + restart recovery) for one-shot reminders, and extend the scheduler module's cron pattern for recurring reminders. Use chrono-node for time parsing with a simple regex pre-filter for recurrence detection.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Both DM natural language ("remind me Tuesday 3pm to call X") AND /remind slash command
- chrono-node parses time expressions in both flows
- Recurrence via natural language ("every Monday at 9am") AND explicit /remind repeat option
- All reminders use member's timezone from MemberSchedule.timezone (default UTC if not set)
- /reminders list shows all pending + recurring reminders with IDs
- /reminders cancel [id] removes a reminder
- Skip button on recurring reminder DMs -- skips next occurrence only, doesn't cancel the series
- Pending reminders survive bot restarts (DB-backed scheduling, rebuild on ready)
- Exact as written delivery -- "remind me to call X" -> DM says "Reminder: call X". No AI embellishment, no API call per reminder
- Discord DM as the delivery backend for now
- Interface designed so Apple ecosystem (APNs, Shortcuts) can be added later without rewriting the scheduler
- Uses existing deliverNotification from notification-router where appropriate
- Acknowledgment: both emoji reaction AND "Got it" button stop repeats for high urgency

### Claude's Discretion
- Urgency UX (keyword "urgent" vs command option vs both)
- Repeat cadence for high urgency (count and interval)
- Visual distinction between low and high urgency DMs
- Whether to link reminders to active goals
- How DM natural language parsing integrates with existing timer NLP in ai-assistant/index.ts

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| REMIND-01 | Member can set time-based reminders using natural language ("remind me Tuesday at 3pm to call X") parsed via chrono-node | chrono-node v2.9.0 API with timezone reference, regex pre-filter pattern from timer module, forwardDate option for future dates |
| REMIND-02 | Reminders support urgency tiers -- low (quiet DM) and high (DM with emphasis + repeat if not acknowledged) | Embed with accent color for high urgency, plain text for low, button/reaction acknowledgment pattern from timer module, setTimeout chain for repeats |
| REMIND-03 | Member can set recurring reminders ("every Monday at 9am remind me to...") | Regex recurrence detection + chrono-node time parsing + node-cron scheduling (established SchedulerManager pattern) |
| REMIND-04 | Reminder delivery uses a pluggable backend interface -- Discord DM for now, designed for future Apple ecosystem integration | ReminderDeliveryBackend interface, DiscordReminderDelivery implementation, deliverNotification extension with 'reminder' type |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| chrono-node | 2.9.0 | Natural language date/time parsing | Locked decision. TypeScript-native, handles "Tuesday at 3pm", "in 2 hours", "next Friday", etc. |
| node-cron | 4.2.1 | Recurring reminder scheduling | Already in project. SchedulerManager uses it for briefs, nudges, planning. Supports timezone. |
| date-fns | 4.1.0 | Date arithmetic and formatting | Already in project. Used across 10+ files. TZDate for timezone handling. |
| @date-fns/tz | 1.4.1 | Timezone-aware dates | Already in project. TZDate constructor pattern established. |
| discord.js | 14.25.1 | DM delivery, embeds, buttons, reactions | Already in project. Button pattern from timer module. |
| prisma | 7.5.0 | Reminder persistence (Reminder model) | Already in project. DB-backed for restart survival. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| winston | 3.19.0 | Logging | Already in project. All modules use it. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| chrono-node | AI-based parsing via callAI | Locked out -- chrono-node is the decision. AI would cost tokens per reminder. |
| node-cron for recurring | rrule.js | rrule pulls in luxon (~68KB). Overkill for simple weekly/daily patterns. node-cron already in project. |
| Simple regex for recurrence | Full NLP recurrence library | "every Monday", "every day", "every weekday" are finite patterns. Regex + chrono covers all needed cases. |
| setTimeout for one-shot | node-schedule | Adds dependency. setTimeout is already the timer module pattern. |

**Installation:**
```bash
npm install chrono-node
```
(All other dependencies already installed.)

## Architecture Patterns

### Recommended Project Structure
```
src/modules/reminders/
  index.ts        # Module registration, button handler, DM intent detection, restart recovery
  commands.ts     # /remind and /reminders slash commands
  parser.ts       # chrono-node parsing + recurrence regex detection
  scheduler.ts    # One-shot setTimeout scheduling + recurring cron management
  delivery.ts     # ReminderDeliveryBackend interface + Discord implementation
  embeds.ts       # Embed builders for low/high urgency reminder DMs
  buttons.ts      # Acknowledge, Skip Next button builders
  constants.ts    # Urgency defaults, repeat cadence, button IDs
```

### Pattern 1: Reminder Parsing Pipeline
**What:** Two-stage parsing similar to timer's natural-language.ts -- regex pre-filter then chrono-node extraction.
**When to use:** Both DM natural language and /remind command flows.
**Example:**
```typescript
// Stage 1: Detect reminder intent (DM only -- /remind always has intent)
const REMINDER_PATTERNS: RegExp[] = [
  /\bremind\s+me\b/i,
  /\breminder\b.*\b(to|at|on|for)\b/i,
  /\bset\s+(a\s+)?reminder\b/i,
];

// Stage 2: Detect recurrence prefix
const RECURRENCE_PATTERNS: { pattern: RegExp; cronDay: string }[] = [
  { pattern: /\bevery\s+day\b/i, cronDay: '* * *' },
  { pattern: /\bevery\s+monday\b/i, cronDay: '* * 1' },
  { pattern: /\bevery\s+tuesday\b/i, cronDay: '* * 2' },
  // ... etc for each weekday
  { pattern: /\bevery\s+weekday\b/i, cronDay: '* * 1-5' },
  { pattern: /\bevery\s+weekend\b/i, cronDay: '* * 0,6' },
];

// Stage 3: chrono-node extracts the time component
import * as chrono from 'chrono-node';

function parseReminderTime(text: string, timezone: string): Date | null {
  const ref = { instant: new Date(), timezone };
  return chrono.parseDate(text, ref, { forwardDate: true });
}
```

### Pattern 2: Dual Scheduling (One-Shot + Recurring)
**What:** One-shot reminders use setTimeout (like timer transitions). Recurring reminders use node-cron (like briefs/nudges). Both stored in DB for restart recovery.
**When to use:** Every reminder creation.
**Example:**
```typescript
// One-shot: compute delay, schedule via setTimeout
const delayMs = reminderDate.getTime() - Date.now();
if (delayMs > 0) {
  const timeout = setTimeout(() => fireReminder(reminder), delayMs);
  pendingTimeouts.set(reminder.id, timeout);
}

// Recurring: convert to cron expression, schedule via node-cron
const cronExpr = `${minutes} ${hours} ${cronDay}`;
cron.schedule(cronExpr, () => fireReminder(reminder), { timezone });
```

### Pattern 3: Pluggable Delivery Backend
**What:** Interface that abstracts how reminders reach the user. Discord DM now, Apple APNs later.
**When to use:** Every reminder delivery.
**Example:**
```typescript
interface ReminderDeliveryBackend {
  deliver(
    memberId: string,
    content: string,
    urgency: 'low' | 'high',
  ): Promise<{ messageId: string | null; success: boolean }>;
}

class DiscordReminderDelivery implements ReminderDeliveryBackend {
  async deliver(memberId: string, content: string, urgency: 'low' | 'high') {
    // Uses deliverNotification from notification-router
    // Returns messageId for high-urgency tracking (reaction/button ack)
  }
}
```

### Pattern 4: Restart Recovery (DB-Backed)
**What:** On bot ready, query all pending reminders from DB, re-schedule them.
**When to use:** Every bot startup.
**Example:**
```typescript
// Same pattern as timer restart recovery in timer/index.ts
client.once('ready', async () => {
  // One-shot: query WHERE fireAt > now AND status = 'PENDING'
  const pending = await db.reminder.findMany({
    where: { status: 'PENDING', fireAt: { gt: new Date() } },
  });
  for (const r of pending) {
    scheduleOneShot(r); // setTimeout with remaining delay
  }

  // Recurring: query WHERE recurrence IS NOT NULL AND status = 'ACTIVE'
  const recurring = await db.reminder.findMany({
    where: { status: 'ACTIVE', cronExpression: { not: null } },
  });
  for (const r of recurring) {
    scheduleRecurring(r); // node-cron with timezone
  }
});
```

### Pattern 5: High-Urgency Acknowledgment
**What:** High-urgency reminders repeat until acknowledged. Button click or emoji reaction stops repeats.
**When to use:** When urgency is 'high'.
**Example:**
```typescript
// After delivering high-urgency reminder:
// 1. Store the DM message ID
// 2. Schedule repeat chain via setTimeout (3 repeats, 5 min apart)
// 3. Listen for button click (reminder:ack) or reaction on the message
// 4. On ack: clear pending repeats, update DB

const BUTTON_IDS = {
  ACKNOWLEDGE: 'reminder:ack',
  SKIP_NEXT: 'reminder:skip',
} as const;
```

### Anti-Patterns to Avoid
- **AI call per reminder delivery:** The decision is "exact as written" -- no AI embellishment. Never call callAI when firing a reminder.
- **Storing timezone on Reminder model:** Use MemberSchedule.timezone. Don't duplicate it -- timezone changes should apply to all reminders automatically.
- **In-memory only scheduling:** All reminders MUST be persisted to DB before scheduling. If the bot crashes between schedule and persist, the reminder is lost forever.
- **One-shot reminders with very long delays:** setTimeout has a 2^31-1ms limit (~24.8 days). For reminders more than 24 days out, use a sweep pattern (check every hour for upcoming reminders) or re-schedule daily.
- **Blocking on reminder delivery:** Use fire-and-forget pattern for delivery (try/catch, log failure, don't block other reminders).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Date/time parsing from text | Custom regex for "3pm", "next Tuesday" | chrono-node | Edge cases: "next Tuesday" vs "this Tuesday", AM/PM, relative dates, timezone offsets |
| Timezone-aware date arithmetic | Manual UTC offset math | date-fns + @date-fns/tz (TZDate) | DST transitions, leap seconds, IANA timezone database |
| Cron scheduling with timezone | Custom interval calculator | node-cron 4.x | Already in project, handles DST, IANA timezones |
| Button interactions | Raw interactionCreate listener | Event bus pattern (ctx.events.on('buttonInteraction')) | Already established in timer module, prevents coupling |
| DM delivery with fallback | Direct user.send() | deliverNotification from notification-router | Handles multi-account routing, private space fallback |

**Key insight:** The project already has all the scheduling infrastructure (SchedulerManager, setTimeout, node-cron). The only new dependency is chrono-node for NLP date parsing. Everything else composes existing patterns.

## Common Pitfalls

### Pitfall 1: setTimeout 32-bit Overflow
**What goes wrong:** setTimeout uses a signed 32-bit integer for delay. Values over 2,147,483,647ms (~24.8 days) cause the timeout to fire immediately.
**Why it happens:** Node.js clamps the value to 1 and fires the callback right away.
**How to avoid:** For reminders more than 24 days out, don't use setTimeout directly. Instead, schedule a "reminder sweep" that runs hourly (like goal expiry check) and picks up reminders whose fireAt is within the next hour.
**Warning signs:** Reminder fires immediately instead of in the future.

### Pitfall 2: chrono-node Past vs Future Dates
**What goes wrong:** Without `{ forwardDate: true }`, "Friday at 3pm" on a Saturday resolves to the PAST Friday, not the upcoming one.
**Why it happens:** chrono-node defaults to the most recent matching date.
**How to avoid:** Always pass `{ forwardDate: true }` in the parsing options.
**Warning signs:** Reminder fires immediately or in the past.

### Pitfall 3: Timezone Mismatch Between Parse and Schedule
**What goes wrong:** chrono-node parses "3pm" in the member's timezone, but the resulting Date object is in UTC. If the scheduler doesn't account for this, reminders fire at the wrong time.
**Why it happens:** chrono-node's timezone parameter affects interpretation, but the output Date is always UTC.
**How to avoid:** Pass the member's timezone as the `timezone` field in chrono-node's ParsingReference. The returned Date will be correct in UTC. For recurring cron jobs, pass the timezone to node-cron's `{ timezone }` option (already the pattern in SchedulerManager).
**Warning signs:** Reminders are off by the member's UTC offset.

### Pitfall 4: Race Condition on Button Acknowledgment
**What goes wrong:** Member clicks "Got it" on a high-urgency reminder, but the next repeat fires before the ack is processed.
**Why it happens:** Button interaction handler and the setTimeout repeat fire concurrently.
**How to avoid:** Use a per-reminder lock (same pattern as timer's per-member lock with withMemberLock). When ack is received, clear all pending repeat timeouts and mark acknowledged in DB before responding.
**Warning signs:** Member gets a repeat after clicking acknowledge.

### Pitfall 5: Recurring Reminder Skip Loses Next Occurrence
**What goes wrong:** "Skip next" on a recurring reminder accidentally stops the entire series, or skips multiple occurrences.
**Why it happens:** The skip implementation deletes the cron task instead of just suppressing one firing.
**How to avoid:** Use a `skipUntil` timestamp on the Reminder record. When the cron fires, check if `skipUntil > now`. If so, silently skip and clear the `skipUntil` field. The cron task stays alive.
**Warning signs:** After skipping once, the recurring reminder never fires again.

### Pitfall 6: Missing Timezone Prompt
**What goes wrong:** Member creates a reminder but has no timezone set (MemberSchedule doesn't exist or timezone is "UTC" default). "3pm" fires at 3pm UTC, which is wrong for them.
**Why it happens:** Not all members have configured their timezone.
**How to avoid:** When creating a reminder, check MemberSchedule.timezone. If not set or is "UTC", warn the member and suggest /settings to set timezone. Still create the reminder (don't block), but make the warning visible.
**Warning signs:** Reminders consistently fire at wrong times for members who haven't set timezone.

### Pitfall 7: DM Intent Collision with Timer NLP
**What goes wrong:** "remind me to start a timer at 3pm" triggers both the timer NLP and the reminder NLP.
**Why it happens:** Both the timer and reminder keyword filters match the message.
**How to avoid:** Order of operations in ai-assistant/index.ts: check timer intent FIRST (existing behavior), then check reminder intent. The timer check is more specific (requires "timer/pomodoro/focus session" keywords). If timer matches, it takes priority. Reminder intent uses "remind me" as the primary keyword, which won't match timer patterns.
**Warning signs:** Message creates a timer instead of a reminder, or vice versa.

### Pitfall 8: Expired One-Shot Reminders After Restart
**What goes wrong:** Bot restarts, queries pending reminders, but some have fireAt in the past. These were missed during downtime.
**Why it happens:** Bot was offline when the reminder should have fired.
**How to avoid:** On restart recovery, if `fireAt < now`, fire the reminder immediately with a note: "Reminder (delayed): [content]". Don't silently drop missed reminders.
**Warning signs:** Member never receives their reminder.

## Code Examples

### chrono-node Parsing with Timezone
```typescript
// Source: chrono-node README (https://github.com/wanasit/chrono)
import * as chrono from 'chrono-node';

// Parse "Tuesday at 3pm" in member's timezone
const memberTimezone = 'America/New_York';
const result = chrono.parse('remind me Tuesday at 3pm to call X', {
  instant: new Date(),
  timezone: memberTimezone,
}, { forwardDate: true });

if (result.length > 0) {
  const fireAt = result[0].start.date(); // UTC Date object
  const text = 'call X'; // extracted from message
}
```

### chrono-node ParsedResult Inspection
```typescript
// Source: chrono-node README
const results = chrono.parse('remind me in 2 hours to stretch', {
  instant: new Date(),
  timezone: 'America/New_York',
}, { forwardDate: true });

const parsed = results[0];
console.log(parsed.text);   // "in 2 hours"
console.log(parsed.index);  // position in input string
console.log(parsed.start.date()); // the resolved Date
console.log(parsed.start.isCertain('hour')); // true
```

### Extracting Reminder Content from Natural Language
```typescript
// Pattern: Strip the time expression from the message to get the reminder content.
// chrono-node returns `index` and `text` on each result, so we can slice it out.
function extractContent(message: string, parsed: chrono.ParsedResult[]): string {
  // Remove "remind me" prefix
  let content = message.replace(/\bremind\s+me\b/i, '').trim();
  // Remove the parsed time expression
  for (const result of parsed) {
    content = content.replace(result.text, '').trim();
  }
  // Remove leading "to" if present
  content = content.replace(/^\s*to\s+/i, '').trim();
  return content;
}
// "remind me Tuesday at 3pm to call X" -> "call X"
```

### Extending Notification Router for Reminders
```typescript
// Add 'reminder' to NotificationType in notification-router/constants.ts
export type NotificationType =
  | 'brief'
  | 'nudge'
  | 'session_alert'
  | 'level_up'
  | 'reminder'   // NEW
  | 'general';

// Add to TYPE_TO_FIELD in router.ts
const TYPE_TO_FIELD: Record<string, string> = {
  brief: 'briefAccountId',
  nudge: 'nudgeAccountId',
  session_alert: 'sessionAlertAccountId',
  level_up: 'levelUpAccountId',
  reminder: 'reminderAccountId',  // NEW -- optional, add to schema
};
```

### Prisma Reminder Model
```prisma
model Reminder {
  id             String         @id @default(cuid())
  memberId       String
  content        String         // What to remind -- exact text
  urgency        ReminderUrgency @default(LOW)
  fireAt         DateTime?      // Next fire time (null for recurring with cron)
  cronExpression String?        // For recurring (e.g., "0 9 * * 1")
  status         ReminderStatus @default(PENDING)
  skipUntil      DateTime?      // For skip-next on recurring
  repeatCount    Int            @default(0)  // How many high-urgency repeats sent
  acknowledged   Boolean        @default(false)
  dmMessageId    String?        // Last DM message ID for ack tracking
  createdAt      DateTime       @default(now())

  member Member @relation(fields: [memberId], references: [id], onDelete: Cascade)

  @@index([memberId, status])
  @@index([status, fireAt])
}

enum ReminderUrgency {
  LOW
  HIGH
}

enum ReminderStatus {
  PENDING    // One-shot, waiting to fire
  ACTIVE     // Recurring, actively scheduled
  FIRED      // One-shot, delivered
  CANCELLED  // Cancelled by member
}
```

### Button Builders for Reminder DMs
```typescript
// Pattern matches timer/buttons.ts
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export const BUTTON_IDS = {
  ACKNOWLEDGE: 'reminder:ack',
  SKIP_NEXT: 'reminder:skip',
} as const;

// High-urgency reminder: "Got it" button
export function buildHighUrgencyButtons(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(BUTTON_IDS.ACKNOWLEDGE)
      .setLabel('Got it')
      .setStyle(ButtonStyle.Success),
  );
}

// Recurring reminder: "Skip Next" button
export function buildRecurringButtons(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(BUTTON_IDS.SKIP_NEXT)
      .setLabel('Skip Next')
      .setStyle(ButtonStyle.Secondary),
  );
}

// Recurring + high urgency: both buttons
export function buildRecurringHighUrgencyButtons(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(BUTTON_IDS.ACKNOWLEDGE)
      .setLabel('Got it')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(BUTTON_IDS.SKIP_NEXT)
      .setLabel('Skip Next')
      .setStyle(ButtonStyle.Secondary),
  );
}
```

### High-Urgency Embed vs Low-Urgency Plain Text
```typescript
import { EmbedBuilder } from 'discord.js';
import { BRAND_COLORS } from '../../shared/constants.js';

// Low urgency: plain text DM
function buildLowUrgencyContent(content: string): string {
  return `Reminder: ${content}`;
}

// High urgency: embed with error/accent color
function buildHighUrgencyEmbed(content: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(BRAND_COLORS.error)  // Red accent for urgency
    .setTitle('Urgent Reminder')
    .setDescription(content)
    .setTimestamp();
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Moment.js for dates | date-fns + TZDate | 2020+ | Project already uses date-fns. No moment. |
| Bull/BullMQ for job queuing | setTimeout + DB persistence | N/A | Project doesn't use Redis. In-process scheduling with DB backup is the pattern. |
| AI-based reminder parsing | chrono-node deterministic parsing | Locked decision | No token cost per reminder, deterministic results |

**Deprecated/outdated:**
- chrono-node v1: Replaced by v2 (TypeScript rewrite). Ensure `import * as chrono from 'chrono-node'` (not named imports from subpaths).
- moment-timezone: Replaced by @date-fns/tz in this project.

## Open Questions

1. **Urgency Detection Strategy**
   - What we know: Both keyword ("urgent") and /remind command option are viable
   - What's unclear: Should DM natural language support "urgently remind me" or only the slash command?
   - Recommendation: Support both. Regex for "urgent/urgently/important" keyword in DM, plus explicit `/remind` urgency option. Default LOW.

2. **Goal Linking**
   - What we know: Context says "Claude's discretion on whether to suggest links to active goals"
   - What's unclear: How to match reminder content to goals without an AI call
   - Recommendation: Skip goal linking for now. It would require either AI or fuzzy matching per reminder, adding complexity for marginal benefit. Can be added in a future enhancement.

3. **Reminder List Display Format**
   - What we know: /reminders list shows all pending + recurring with IDs
   - What's unclear: How to display IDs in a user-friendly way (cuid is long)
   - Recommendation: Use last 6 chars of cuid as short ID. Or assign a sequential integer per member (simpler for users to type in /reminders cancel).

## Sources

### Primary (HIGH confidence)
- [chrono-node GitHub README](https://github.com/wanasit/chrono) - API, timezone support, forwardDate, ParsedResult shape
- [node-cron npm](https://www.npmjs.com/package/node-cron) - v4.2.1 timezone scheduling
- Project codebase - timer module (engine.ts, natural-language.ts, buttons.ts, session.ts, index.ts), scheduler module (manager.ts, index.ts), notification-router (router.ts, constants.ts), shared/delivery.ts, prisma/schema.prisma

### Secondary (MEDIUM confidence)
- [chrono-node npm page](https://www.npmjs.com/package/chrono-node) - Version 2.9.0 confirmation
- [rrule.js GitHub](https://github.com/jkbrzt/rrule) - Evaluated and rejected (pulls luxon, overkill for this use case)

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - chrono-node is locked, all other libs already in project
- Architecture: HIGH - follows established timer and scheduler module patterns exactly
- Pitfalls: HIGH - identified from direct codebase analysis (setTimeout limit, chrono-node forwardDate, restart recovery) and established JavaScript scheduling patterns
- Delivery interface: MEDIUM - pluggable design is straightforward but Apple integration details are deferred to v2

**Research date:** 2026-03-21
**Valid until:** 2026-04-21 (stable libraries, project-specific patterns unlikely to change)
