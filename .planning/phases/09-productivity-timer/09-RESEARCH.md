# Phase 9: Productivity Timer - Research

**Researched:** 2026-03-21
**Domain:** Timer state management, Discord DM interactions, button components, XP economy
**Confidence:** HIGH

## Summary

Phase 9 adds a personal productivity timer system with two modes: Pomodoro (structured work/break cycles) and Proportional Break (work freely, get a proportional break). The timer lives in DMs as a persistent, editable message with interactive buttons (Pause/Resume/Stop/Skip Break). Timer sessions award XP and are persisted for stats.

The codebase already has strong patterns for everything this phase needs: in-memory session tracking with DB persistence (voice-tracker), XP awarding with daily caps (xp/engine), DM delivery (notification-router/delivery), event-driven module communication (event bus), and cron-based scheduling (scheduler/manager). The timer module follows these patterns closely, adding a new `TIMER_SESSION` XP source and a `TimerSession` Prisma model.

The most significant architectural decision is how to handle button interactions. The current `interactionCreate` handler in `index.ts` only routes `ChatInputCommand` and `Autocomplete` interactions. Timer buttons on persistent DM messages need a global `isButton()` handler since collectors with timeouts cannot work for multi-hour timer sessions. This requires adding button routing to `index.ts` (or via the event bus) -- a small but necessary infrastructure change.

**Primary recommendation:** Model the timer module after voice-tracker (in-memory Map for active state, DB persistence on end), add a global button interaction handler via the event bus, and extend the XP source enum with `TIMER_SESSION`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Start via both /timer command AND natural DM to Jarvis ("start a 45 min focus session on coding")
- /timer subcommands: start, pause, resume, stop, status
- Interactive buttons on the timer DM message (Pause/Resume/Stop/Skip Break) -- commands as fallback
- Persistent active timer display: the original timer DM message gets edited at transitions (work->break, break->work) to show current state and remaining time
- DM notifications at interval transitions: "Break time! 5 min." / "Back to it!" -- quiet during work periods
- /timer status shows: mode, time remaining, what you're working on, XP earned so far
- Time-based XP: 1 XP per 5 minutes worked. 25-min pomodoro = 5 XP, 2-hour session = 24 XP
- Short encouraging message from Jarvis when break starts ("Nice work -- 25 min locked in. Take 5.")
- Timer DM updated with break countdown
- Skip break button available -- power users can go straight to next work period
- Proportional break mode (5:1 ratio default): work freely, press pause, get a break = work_time / 5
- No-return handling: priority is to NOT distract the user's workflow. A gentle nudge is fine but repeated pings would be counterproductive. Auto-end after reasonable idle time is preferred over nagging

### Claude's Discretion
- Daily XP cap from timers (recommendation: 200, matching voice cap)
- Partial XP on early stop (recommendation: proportional -- if you worked 12 min, get 2 XP)
- Minimum session length to earn XP (recommendation: 5 min, matching voice tracker)
- No-return timeout duration and behavior (recommendation: auto-end after 15 min past break, single gentle DM)
- Social visibility approach (recommendation: none -- timer is a personal tool, no noise for others)
- Whether timer sessions should appear in leaderboard stats (recommendation: yes, as a separate dimension)
- How Jarvis parses natural language timer requests in DM (recommendation: structured output via AI with json_schema)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TIMER-01 | Member can start a pomodoro timer with configurable work/break lengths (default 25/5) via /timer command | /timer start subcommand with work/break duration options, in-memory ActiveTimer state machine, DM message with buttons |
| TIMER-02 | Member can start a proportional break timer -- work as long as you want, press pause, get a break relative to time worked (default 5:1 ratio) | Separate timer mode ("proportional"), pause triggers break calculation, same DM/button infrastructure |
| TIMER-03 | Member can define what they're working on when starting a timer -- tied to an active goal or free-text description | /timer start has optional "focus" string option and "goal" autocomplete option, stored in ActiveTimer |
| TIMER-04 | Timer sessions award XP on completion and are tracked for stats (duration, what was worked on) | New TIMER_SESSION XP source, TimerSession Prisma model, awardXP() call on session end |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| discord.js | ^14.25.1 | Button components, DM messages, message editing | Already in project, handles all Discord API interactions |
| node-cron | ^4.2.1 | Scheduling periodic checks (idle timeout) | Already in project, used by scheduler module |
| @prisma/client | ^7.5.0 | Database persistence for completed timer sessions | Already in project, all data models use Prisma |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| date-fns | ^4.1.0 | Duration formatting, time calculations | Already in project, for "25:00 remaining" display |
| @date-fns/tz | ^1.4.1 | Timezone-aware daily XP cap checks | Already in project, for daily cap reset at member's midnight |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| In-memory Map | Redis | Redis is overkill for <20 concurrent timers in a friends-only server; Map matches voice-tracker pattern |
| setTimeout chains | node-cron intervals | setTimeout is simpler for single timer ticks; cron for periodic idle checks |
| Global button handler | Per-message collectors | Collectors timeout; timer buttons must work indefinitely across bot restarts |

**Installation:**
```bash
# No new packages needed -- all dependencies already installed
```

## Architecture Patterns

### Recommended Project Structure
```
src/modules/timer/
  index.ts          # Module registration: commands, button handler, event listeners, restart recovery
  commands.ts       # /timer slash command with subcommands (start, pause, resume, stop, status)
  engine.ts         # ActiveTimer state machine, in-memory Map, state transitions
  session.ts        # DB persistence (create TimerSession on end), XP awarding
  embeds.ts         # Timer display embeds (work mode, break mode, completed, status)
  constants.ts      # Timer defaults, XP rates, daily cap, idle timeout
  buttons.ts        # Button row builders and customId constants
  natural-language.ts  # AI-powered parsing of DM timer requests
```

### Pattern 1: In-Memory State Machine (follows voice-tracker)
**What:** Active timer state held in a `Map<string, ActiveTimer>` keyed by memberId. Transitions: WORKING -> ON_BREAK -> WORKING (pomodoro cycle) or WORKING -> ON_BREAK (proportional). Persisted to DB only on session end.
**When to use:** Always -- this is the core timer pattern.
**Example:**
```typescript
// Follows voice-tracker/tracker.ts pattern exactly
export interface ActiveTimer {
  memberId: string;
  mode: 'pomodoro' | 'proportional';
  state: 'working' | 'on_break' | 'paused';
  workDuration: number;      // minutes (default 25)
  breakDuration: number;     // minutes (default 5, or calculated for proportional)
  breakRatio: number;        // 5:1 default for proportional mode
  focus: string | null;      // free-text or goal title
  goalId: string | null;     // linked goal ID if any
  currentIntervalStart: Date;
  totalWorkedMs: number;     // accumulated work time across all intervals
  totalBreakMs: number;      // accumulated break time
  pomodoroCount: number;     // completed work intervals
  dmMessageId: string | null; // Discord message ID for the live-updating DM
  dmChannelId: string | null; // Discord DM channel ID
  startedAt: Date;
}

const activeTimers = new Map<string, ActiveTimer>();
```

### Pattern 2: Persistent DM Message with Button Rows
**What:** On timer start, send a DM with an embed showing timer state + action buttons. On state transitions (work->break, break->work), edit the same message with updated embed + buttons. Store the message ID in ActiveTimer for editing.
**When to use:** Always -- this is the primary user interface.
**Example:**
```typescript
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  EmbedBuilder, type Message
} from 'discord.js';

// Button customIds follow a namespace pattern for global handler routing
const BUTTON_IDS = {
  PAUSE: 'timer:pause',
  RESUME: 'timer:resume',
  STOP: 'timer:stop',
  SKIP_BREAK: 'timer:skip_break',
} as const;

function buildWorkButtons(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(BUTTON_IDS.PAUSE)
      .setLabel('Pause')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('⏸'),
    new ButtonBuilder()
      .setCustomId(BUTTON_IDS.STOP)
      .setLabel('Stop')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('⏹'),
  );
}

function buildBreakButtons(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(BUTTON_IDS.SKIP_BREAK)
      .setLabel('Skip Break')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('⏭'),
    new ButtonBuilder()
      .setCustomId(BUTTON_IDS.STOP)
      .setLabel('Stop')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('⏹'),
  );
}
```

### Pattern 3: Global Button Interaction Handler
**What:** Add `isButton()` routing to the `interactionCreate` handler in `index.ts`. Timer module registers a button handler via the event bus. This pattern replaces per-message collectors which timeout and cannot survive bot restarts.
**When to use:** For any button that must persist beyond a short timeout (timer, future features).
**Example:**
```typescript
// In index.ts -- add to the existing interactionCreate handler:
client.on('interactionCreate', async (interaction) => {
  if (interaction.isAutocomplete()) {
    events.emit('autocomplete', interaction);
    return;
  }
  if (interaction.isButton()) {
    events.emit('buttonInteraction', interaction);
    return;
  }
  if (!interaction.isChatInputCommand()) return;
  await commands.handleInteraction(interaction, ctx);
});

// In timer/index.ts:
events.on('buttonInteraction', async (...args: unknown[]) => {
  const interaction = args[0] as ButtonInteraction;
  if (!interaction.customId.startsWith('timer:')) return;
  await handleTimerButton(interaction, db, events);
});
```

### Pattern 4: Timer Transition via setTimeout
**What:** When a work/break interval starts, schedule a `setTimeout` for the interval duration. On fire, transition the timer state and edit the DM message. Store timeout handles in the ActiveTimer for cancellation on pause/stop.
**When to use:** For automatic work->break and break->work transitions.
**Example:**
```typescript
// Store timeout references for cleanup
const timerTimeouts = new Map<string, NodeJS.Timeout>();

function scheduleTransition(
  memberId: string,
  durationMs: number,
  onTransition: () => Promise<void>,
): void {
  // Clear any existing timeout
  const existing = timerTimeouts.get(memberId);
  if (existing) clearTimeout(existing);

  const timeout = setTimeout(async () => {
    timerTimeouts.delete(memberId);
    try {
      await onTransition();
    } catch (error) {
      // Log but don't crash
    }
  }, durationMs);

  timerTimeouts.set(memberId, timeout);
}
```

### Pattern 5: Natural Language Timer Start via AI
**What:** When a DM message matches timer-like intent (detected via keywords or AI), parse it with structured output to extract mode, duration, and focus. Use the same `callAI` with `responseFormat` (json_schema) as other structured output in the codebase.
**When to use:** For DM-initiated timer starts ("start a 45 min focus session on coding").
**Example:**
```typescript
import { callAI } from '../../shared/ai-client.js';

interface TimerParseResult {
  isTimerRequest: boolean;
  mode: 'pomodoro' | 'proportional' | null;
  workMinutes: number | null;
  breakMinutes: number | null;
  focus: string | null;
}

async function parseTimerRequest(
  db: ExtendedPrismaClient,
  memberId: string,
  message: string,
): Promise<TimerParseResult> {
  const result = await callAI(db, {
    memberId,
    feature: 'chat', // or add 'timer' to AIFeature
    messages: [
      {
        role: 'system',
        content: `Parse whether this message is a timer/focus session request. Extract mode (pomodoro for structured work/break, proportional for free-form work), work duration in minutes, break duration in minutes, and what they want to focus on. If not a timer request, set isTimerRequest to false.`,
      },
      { role: 'user', content: message },
    ],
    responseFormat: {
      type: 'json_schema',
      json_schema: {
        name: 'timer_parse',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            isTimerRequest: { type: 'boolean' },
            mode: { type: ['string', 'null'], enum: ['pomodoro', 'proportional', null] },
            workMinutes: { type: ['number', 'null'] },
            breakMinutes: { type: ['number', 'null'] },
            focus: { type: ['string', 'null'] },
          },
          required: ['isTimerRequest', 'mode', 'workMinutes', 'breakMinutes', 'focus'],
          additionalProperties: false,
        },
      },
    },
  });

  return JSON.parse(result.content ?? '{"isTimerRequest": false}');
}
```

### Pattern 6: Restart Recovery from Database
**What:** On bot startup, query for active `TimerSession` records (status = 'ACTIVE'). For each, recalculate elapsed time since last known state, restore in-memory ActiveTimer, re-send DM message with updated state and buttons. Similar to voice-tracker's `reconstructSessions`.
**When to use:** Bot restart while timers are running.
**Example:**
```typescript
// On client ready:
async function reconstructTimers(
  client: Client,
  db: ExtendedPrismaClient,
  events: IEventBus,
): Promise<number> {
  const activeSessions = await db.timerSession.findMany({
    where: { status: 'ACTIVE' },
  });

  let count = 0;
  for (const session of activeSessions) {
    // Recalculate elapsed time
    const elapsedMs = Date.now() - session.lastStateChangeAt.getTime();
    // Restore in-memory state and re-send DM
    // ... (rebuild ActiveTimer from DB fields)
    count++;
  }
  return count;
}
```

### Anti-Patterns to Avoid
- **Per-message collectors for buttons:** `awaitMessageComponent` and `createMessageComponentCollector` with timeouts cannot work for timer sessions that last hours. Use a global button handler instead.
- **Editing DM messages during work period:** The spec says "quiet during work periods." Only edit at transitions (work->break, break->work, session end). No countdown ticking.
- **Blocking the event loop with interval ticking:** Do not use `setInterval` to update a countdown every second. Use `setTimeout` only for transition points.
- **Storing active timer state only in DB:** DB round-trips for every button press add latency. Keep active state in memory (Map), persist only on meaningful events (start, transitions, end).
- **Using the same collector pattern as profile/identity:** Those use `awaitMessageComponent` with 60-second timeouts -- appropriate for one-shot interactions but not for long-running timers.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| XP awarding | Custom XP logic | `awardXP()` from xp/engine.ts | Handles transactions, audit log, level-up detection atomically |
| DM delivery | Direct `user.send()` | `deliverNotification()` or `deliverToPrivateSpace()` | Respects notification preferences and private space settings |
| Daily XP cap checking | Manual date math | Follow `getTodayVoiceXP()` pattern from voice-tracker | Already handles UTC day boundaries correctly |
| Streak/rank sync | Custom role sync | Emit `levelUp` event, let xp module handle it | Existing event-driven architecture |
| Member ID resolution | Custom Discord ID lookup | `db.discordAccount.findUnique({ where: { discordId } })` | Consistent pattern across all modules |
| Time formatting | Custom string formatting | date-fns `formatDuration` or simple `${min}:${sec}` helper | Handles edge cases |

**Key insight:** The codebase already has battle-tested patterns for every supporting operation this timer needs. The only novel code is the timer state machine itself and the button interaction routing.

## Common Pitfalls

### Pitfall 1: Button Interactions Timing Out
**What goes wrong:** Discord requires a response to button interactions within 3 seconds. If your handler takes longer (DB queries, AI calls), the interaction fails with "This interaction failed."
**Why it happens:** Not deferring the interaction update before doing async work.
**How to avoid:** Always call `interaction.deferUpdate()` immediately in the button handler, then do async work, then call `interaction.editReply()` or edit the original message.
**Warning signs:** Users report "This interaction failed" when clicking timer buttons.

### Pitfall 2: Race Conditions on Rapid Button Presses
**What goes wrong:** User clicks Pause then immediately clicks Stop. Both handlers read the same in-memory state and produce inconsistent results.
**Why it happens:** No serialization of timer mutations per member.
**How to avoid:** Use the same `withMemberLock()` pattern from ai-assistant/chat.ts. Wrap all timer state mutations in a per-member promise chain.
**Warning signs:** Duplicate XP awards, sessions not ending cleanly.

### Pitfall 3: Memory Leak from Orphaned setTimeout
**What goes wrong:** Timer transition is scheduled via `setTimeout`, then user stops the timer. If the timeout is not cleared, it fires on a deleted timer and causes errors.
**Why it happens:** Not cleaning up timeout handles on stop/pause.
**How to avoid:** Store all `setTimeout` handles in a Map keyed by memberId. Clear on stop, pause, and module shutdown. Add to graceful shutdown in index.ts.
**Warning signs:** "Cannot read property of undefined" errors appearing minutes after timer stops.

### Pitfall 4: Bot Restart Loses Active Timers
**What goes wrong:** In-memory Map is lost on restart. User's timer silently disappears.
**Why it happens:** Only persisting to DB on session end.
**How to avoid:** Persist an ACTIVE TimerSession record to DB on start and update on transitions. On bot ready, reconstruct from DB (same pattern as voice-tracker `reconstructSessions`). DB is the source of truth for restart recovery; Map is the fast-path.
**Warning signs:** Users report timers disappearing after bot restarts.

### Pitfall 5: DM Message ID Becomes Invalid After Restart
**What goes wrong:** Stored `dmMessageId` in the in-memory timer references a message the bot sent before restart. After restart, trying to edit it may fail if the DM channel cache is empty.
**Why it happens:** Discord client cache is cleared on restart.
**How to avoid:** On restart recovery, send a NEW DM message with current state instead of trying to edit the old one. Store the new message ID. Optionally try to fetch and delete the old message.
**Warning signs:** "Unknown Message" errors when trying to edit timer DM after restart.

### Pitfall 6: Natural Language Parser Eating Regular Chat
**What goes wrong:** Jarvis interprets "I'm going to start working on my project" as a timer start request.
**Why it happens:** Over-broad intent detection.
**How to avoid:** The AI parser should be conservative -- require explicit timer/focus/pomodoro keywords. The `isTimerRequest` field must be false for ambiguous messages. Consider a keyword pre-filter before calling AI.
**Warning signs:** Users complain that casual messages trigger timers.

### Pitfall 7: XP Source Enum Not Updated
**What goes wrong:** Adding a new `TIMER_SESSION` source in code but forgetting to add it to the Prisma `XPSource` enum causes runtime errors.
**Why it happens:** The TypeScript `XPSource` type in engine.ts is a string union that must match the Prisma enum.
**How to avoid:** Update both the Prisma schema enum AND the TypeScript type literal in xp/engine.ts. Run `prisma migrate dev` to apply.
**Warning signs:** Prisma error on `awardXP()` call with invalid enum value.

## Code Examples

### Prisma Schema Addition
```prisma
// Add to XPSource enum
enum XPSource {
  CHECKIN
  GOAL_COMPLETE
  STREAK_BONUS
  SETUP_BONUS
  VOICE_SESSION
  WIN_POST
  LESSON_POST
  RESOURCE_SHARE
  SESSION_HOST
  TIMER_SESSION    // NEW
}

// New model for completed timer sessions
model TimerSession {
  id              String       @id @default(cuid())
  memberId        String
  mode            TimerMode
  status          TimerStatus  @default(ACTIVE)
  focus           String?      // What they were working on (free text)
  goalId          String?      // Linked goal ID if any
  workDuration    Int          // Configured work interval in minutes
  breakDuration   Int          // Configured break interval in minutes
  breakRatio      Float        @default(5.0) // For proportional mode
  totalWorkedMs   Int          @default(0)   // Total work time in milliseconds
  totalBreakMs    Int          @default(0)   // Total break time in milliseconds
  pomodoroCount   Int          @default(0)   // Completed work intervals
  xpAwarded       Int          @default(0)
  startedAt       DateTime     @default(now())
  endedAt         DateTime?
  lastStateChangeAt DateTime   @default(now()) // For restart recovery
  dmMessageId     String?      // Discord message ID of the live timer DM
  dmChannelId     String?      // Discord DM channel ID
  seasonId        String?

  member  Member  @relation(fields: [memberId], references: [id], onDelete: Cascade)
  season  Season? @relation(fields: [seasonId], references: [id])

  @@index([memberId, status])
  @@index([status]) // For restart recovery query
}

enum TimerMode {
  POMODORO
  PROPORTIONAL
}

enum TimerStatus {
  ACTIVE
  COMPLETED
  CANCELLED
}
```

### XP Constants Addition
```typescript
// Add to xp/constants.ts XP_AWARDS
timer: {
  xpPer5Minutes: 1,       // 1 XP per 5 minutes of work
  dailyCap: 200,           // Match voice cap
  minSessionMinutes: 5,    // Minimum to earn XP
},
```

### Timer Embed Example
```typescript
function buildTimerEmbed(timer: ActiveTimer): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(timer.state === 'working' ? BRAND_COLORS.success : BRAND_COLORS.info)
    .setTitle(timer.state === 'working' ? 'Focus Mode' : 'Break Time')
    .setTimestamp();

  if (timer.focus) {
    embed.setDescription(`Working on: **${timer.focus}**`);
  }

  const workedMin = Math.floor(timer.totalWorkedMs / 60_000);
  const xpSoFar = Math.floor(workedMin / 5);

  embed.addFields(
    { name: 'Mode', value: timer.mode === 'pomodoro' ? 'Pomodoro' : 'Free Flow', inline: true },
    { name: 'Worked', value: `${workedMin} min`, inline: true },
    { name: 'XP Earned', value: `${xpSoFar} XP`, inline: true },
  );

  if (timer.mode === 'pomodoro') {
    embed.addFields(
      { name: 'Intervals', value: `${timer.pomodoroCount} completed`, inline: true },
      { name: 'Work/Break', value: `${timer.workDuration}/${timer.breakDuration} min`, inline: true },
    );
  }

  return embed;
}
```

### Member Relation Update
```typescript
// Add to Member model in schema.prisma
timerSessions TimerSession[]

// Add to Season model relations
timerSessions TimerSession[]
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-message collectors for buttons | Global interactionCreate button handler | discord.js v14+ best practice | Buttons survive indefinitely, no timeout issues |
| awaitMessageComponent with timeout | Event bus routing for component interactions | Current project pattern | Consistent with autocomplete routing pattern |
| Store timer only in memory | Hybrid: memory for active state, DB for restart recovery | Standard for production bots | Timers survive bot restarts |

**Deprecated/outdated:**
- `message.isDM()`: Use `channel.isDMBased()` instead (discord.js v14)
- Collector-based button handlers for long-running interactions: Use global handler

## Open Questions

1. **Daily XP cap interaction with voice sessions**
   - What we know: Voice has a 200 XP daily cap. Timer will have its own cap.
   - What's unclear: Should they share a combined cap or be independent?
   - Recommendation: Independent caps -- a member in voice AND using timer is doubly productive and should be rewarded for both. This is also simpler to implement (separate `getTodayTimerXP()` query).

2. **Timer + Voice session overlap**
   - What we know: A user could have a timer running while in a voice co-work channel.
   - What's unclear: Should both award XP simultaneously?
   - Recommendation: Yes -- they're tracking different things (voice = co-working presence, timer = structured focus). The daily caps prevent abuse.

3. **AI feature taxonomy for timer parsing**
   - What we know: The `AIFeature` type in ai-types.ts needs a new entry.
   - What's unclear: Should timer parsing use 'chat' or get its own 'timer' feature?
   - Recommendation: Add 'timer' to `AIFeature` -- keeps cost tracking granular and allows separate budget analysis.

4. **Event bus event types for timer**
   - What we know: The `BotEventMap` in events.ts should get timer events.
   - What's unclear: Exact event names.
   - Recommendation: Add `timerStarted`, `timerCompleted`, `timerCancelled`, `buttonInteraction` to the event map.

## Sources

### Primary (HIGH confidence)
- **Codebase analysis** -- Direct reading of voice-tracker, xp, ai-assistant, scheduler, notification-router, and shared modules
- **Prisma schema** -- Current data model with all existing enums and relations
- **discord.js v14.25.1** -- Package.json confirms version, patterns verified against codebase usage

### Secondary (MEDIUM confidence)
- [discord.js Guide - Component Interactions](https://discordjs.guide/interactive-components/interactions.html) -- Global handler pattern for buttons
- [discord.js Guide - Collectors](https://discordjs.guide/popular-topics/collectors) -- Why collectors are NOT suitable for long-running interactions
- [discord.js v14 Message API](https://discord.js.org/docs/packages/discord.js/14.18.0/Message:class) -- Message editing in DMs

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All libraries already in the project, no new dependencies
- Architecture: HIGH -- Following established voice-tracker pattern exactly, well-understood codebase
- Pitfalls: HIGH -- Based on direct codebase analysis and known discord.js behaviors
- Natural language parsing: MEDIUM -- AI structured output approach is proven in codebase but timer-specific parsing untested

**Research date:** 2026-03-21
**Valid until:** 2026-04-21 (stable -- no fast-moving dependencies)
