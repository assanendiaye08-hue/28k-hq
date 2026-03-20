# Architecture Research: v1.1 Depth Features

**Domain:** Integration architecture for v1.1 features into existing Discord Hustler bot
**Researched:** 2026-03-20
**Confidence:** HIGH (based on full codebase review, not external sources)

## Existing Architecture Summary

The v1.0 codebase is a modular monolith: single Node.js process, 19 modules auto-discovered by `module-loader.ts`, all sharing a `ModuleContext` (Client, PrismaClient, CommandRegistry, EventBus, Logger). Key patterns:

- **Module registration**: Each `src/modules/<name>/index.ts` exports a Module with `register(ctx)` that wires commands, event listeners, and cron tasks.
- **EventBus**: Typed events (`BotEventMap`) for decoupled cross-module communication. Synchronous emission, handlers wrapped in try/catch.
- **SchedulerManager**: Per-member cron tasks (brief, reminder, planning, nudge) stored in-memory Map, rebuilt from DB on restart.
- **Notification delivery**: `deliverNotification()` routes by type to preferred Discord account, falls back to `deliverToPrivateSpace()`.
- **XP engine**: Atomic `$transaction` for award + increment + level-up detection. Sources typed as union enum.
- **AI pipeline**: OpenRouter SDK (DeepSeek V3.2 primary, Qwen 3.5 Plus fallback), per-member processing lock, 50-message daily cap, rolling summary compression.
- **Data model**: Prisma 7 with encryption extension. Member-centric with encrypted fields (conversations, check-in content, raw profile answers).

## New Feature Integration Map

### 1. Productivity Timer Suite

**What it is:** Pomodoro timer with proportional breaks (25/5, 50/10), focus tracking, XP rewards for completed sessions.

**Integration approach:** New module `src/modules/timer/`.

**New components:**
- `src/modules/timer/index.ts` -- Module registration
- `src/modules/timer/commands.ts` -- `/timer start`, `/timer stop`, `/timer status`
- `src/modules/timer/manager.ts` -- In-memory timer state per member (Map<memberId, TimerState>)
- `src/modules/timer/embeds.ts` -- Timer status, completion, and break embeds

**Data model changes:**
```prisma
model FocusSession {
  id              String   @id @default(cuid())
  memberId        String
  type            String   // "POMODORO_25", "POMODORO_50", "CUSTOM"
  workMinutes     Int
  breakMinutes    Int
  status          String   // "WORKING", "BREAK", "COMPLETED", "CANCELLED"
  startedAt       DateTime
  endedAt         DateTime?
  completedCycles Int      @default(0)
  xpAwarded       Int      @default(0)

  member Member @relation(fields: [memberId], references: [id], onDelete: Cascade)

  @@index([memberId, startedAt])
}
```

**Integration points:**
- **XP engine**: New `FOCUS_SESSION` source in XPSource enum. Award XP on cycle completion (not just session end -- reward the work intervals). Suggested: 15 XP per completed work cycle.
- **EventBus**: New events `timerStarted [memberId, sessionType]`, `timerCompleted [memberId, totalMinutes, cycles]`. The AI assistant can reference active/completed focus sessions in context.
- **SchedulerManager**: NOT used for timers. Timers are member-initiated, not scheduled. Use `setTimeout` for individual timer intervals (same pattern as session scheduled start). Timers are ephemeral (in-memory only during work, persisted to DB on completion).
- **Lock-in sessions**: Timer can optionally link to an active lock-in session. If the member is in a session voice channel, the timer provides structure to their session. No hard coupling -- timer works independently.
- **Notification delivery**: Break notifications and completion alerts use `deliverNotification` with a new `timer` notification type, or reuse `general`.
- **Bot restart**: Active timers are lost on restart (acceptable -- they are short-lived). Store `FocusSession` with status WORKING; on restart, mark any WORKING sessions as CANCELLED. Same pattern as lock-in session cleanup.

**Key design decision:** Timers are per-member, one active timer at a time. Discord has no persistent UI for countdowns, so the timer sends a DM when break starts and when break ends. Members can check status with `/timer status`. The timer does NOT use message editing for a live countdown (rate-limited, unnecessary complexity).

### 2. Goal Hierarchy Refactor

**What it is:** Optional yearly > quarterly > monthly > weekly > daily goal nesting. Jarvis assists in breaking down high-level goals. Existing flat goals remain valid.

**Integration approach:** Modify existing `src/modules/goals/` module. This is a schema migration + command update, not a new module.

**Data model changes:**
```prisma
model Goal {
  // ... existing fields ...

  // NEW: hierarchy fields
  parentId    String?  // Self-referential for nesting
  depth       Int      @default(0) // 0=standalone/yearly, 1=quarterly, 2=monthly, 3=weekly, 4=daily
  timeframe   String?  // "YEARLY", "QUARTERLY", "MONTHLY", "WEEKLY", "DAILY", null=standalone

  // Relations
  parent   Goal?  @relation("GoalHierarchy", fields: [parentId], references: [id], onDelete: SetNull)
  children Goal[] @relation("GoalHierarchy")

  @@index([parentId])
}
```

**Integration points:**
- **Existing commands**: `/setgoal` gains optional `parent` parameter (autocomplete from active goals). `/goals` adds tree view when hierarchy exists, stays flat for standalone goals. `/completegoal` optionally rolls up progress to parent.
- **AI assistant (Jarvis)**: `buildSystemPrompt()` in `personality.ts` already loads active goals. Change the goal section to render as a tree when hierarchy exists. Jarvis should reference parent goals when discussing daily tasks ("this feeds into your Q2 goal of X").
- **Sunday planning**: `planning.ts` becomes hierarchy-aware. When a member has yearly/quarterly goals, the planning prompt becomes "What weekly goals feed into your quarterly goals?" instead of a blank slate.
- **EventBus**: New event `goalHierarchyUpdated [memberId]`. When a child goal completes, check if parent's children are all complete and prompt the member.
- **XP engine**: No change to XP amounts. Parent goal completion remains a separate manual action (you don't auto-complete a yearly goal because all quarterly goals finished -- the member confirms).
- **Morning briefs**: Brief template shows top-level focus ("Yearly: launch SaaS | This week: build landing page, 3/5 cold emails").

**Key design decision:** Hierarchy is opt-in. Members who use `/setgoal` without a parent get standalone goals exactly like v1.0. The hierarchy adds depth for members who want it. This avoids breaking the simple flow.

### 3. Self-Evaluation / Reflection System

**What it is:** Configurable reflection prompts (daily quick, weekly deep, monthly review) with AI analysis of patterns.

**Integration approach:** New module `src/modules/reflection/`.

**New components:**
- `src/modules/reflection/index.ts` -- Module registration
- `src/modules/reflection/commands.ts` -- `/reflect` (manual trigger), `/reflection-settings`
- `src/modules/reflection/prompts.ts` -- Reflection prompt templates by intensity
- `src/modules/reflection/analyzer.ts` -- AI-powered pattern analysis across reflections

**Data model changes:**
```prisma
model Reflection {
  id          String   @id @default(cuid())
  memberId    String
  type        String   // "DAILY_QUICK", "WEEKLY_DEEP", "MONTHLY_REVIEW"
  content     String   // Encrypted -- member's reflection text
  mood        Int?     // 1-5 self-rating
  insights    String[] // AI-extracted patterns (cleartext for queries)
  xpAwarded   Int      @default(0)
  createdAt   DateTime @default(now())

  member Member @relation(fields: [memberId], references: [id], onDelete: Cascade)

  @@index([memberId, createdAt])
  @@index([memberId, type])
}

model ReflectionSettings {
  id               String  @id @default(cuid())
  memberId         String  @unique
  dailyEnabled     Boolean @default(false)
  weeklyEnabled    Boolean @default(true)
  monthlyEnabled   Boolean @default(true)
  dailyTime        String? // HH:mm
  intensity        String  @default("medium") // "light", "medium", "deep"

  member Member @relation(fields: [memberId], references: [id], onDelete: Cascade)
}
```

**Integration points:**
- **SchedulerManager**: Add reflection tasks. Daily reflections scheduled like check-in reminders. Weekly reflections piggyback on Sunday planning (extend `planning.ts` with a reflection step at the beginning, not a separate flow). Monthly reflections at month boundary.
- **AI assistant (Jarvis)**: Reflection insights feed into `buildSystemPrompt()`. Jarvis references past reflections: "Last week you said you were procrastinating on outreach -- how's that going?" The analyzer identifies recurring themes across reflections.
- **Morning briefs**: If daily reflection is enabled, the brief can include a one-line prompt ("Today's reflection: What's the ONE thing that'll move the needle?").
- **EventBus**: New events `reflectionCompleted [memberId, type]`. The XP module listens to award reflection XP.
- **XP engine**: New `REFLECTION` source. Suggested: 10 XP daily, 25 XP weekly, 50 XP monthly (lower than goals -- reflection is introspective, not output-driven).
- **Check-in module**: Reflections are NOT check-ins. They coexist. Check-ins are "what did you do today?" Reflections are "how do you feel about what you did?"
- **Data privacy**: Reflection content encrypted like conversation messages. Insights (AI-extracted keywords) are cleartext for pattern queries.

**Key design decision:** Reflections are conversational DM flows (same pattern as Sunday planning), not slash command forms. The intensity setting controls prompt depth: light = 1 question, medium = 2-3 questions, deep = guided 5-question session.

### 4. Inspiration System

**What it is:** Members set people they admire. Jarvis naturally references them ("What would [inspiration] do?").

**Integration approach:** Extension to profile module + AI personality layer. NOT a separate module.

**Data model changes:**
```prisma
model Inspiration {
  id          String   @id @default(cuid())
  memberId    String
  name        String   // "Naval Ravikant", "Elon Musk", etc.
  reason      String?  // Encrypted -- why this person inspires them
  createdAt   DateTime @default(now())

  member Member @relation(fields: [memberId], references: [id], onDelete: Cascade)

  @@index([memberId])
}
```

**Integration points:**
- **Profile module**: New `/inspiration add`, `/inspiration remove`, `/inspiration list` commands. Cap at 5 inspirations per member.
- **AI assistant (personality.ts)**: `buildSystemPrompt()` loads the member's inspirations and injects them: "This member admires: Naval Ravikant (for clear thinking), David Goggins (for discipline). When relevant, naturally reference what these people would do or have said. Don't force it -- only when the conversation naturally allows it."
- **Morning briefs**: Occasionally include an inspiration reference in the brief prompt context. Jarvis decides when it's natural.
- **Nudges**: When a member is slacking, the nudge can reference their inspiration ("Goggins wouldn't skip today. Neither should you."). This is handled by adding inspiration context to the nudge prompt in `nudge.ts`.
- **EventBus**: No new events needed. Inspirations are profile data, read on demand by AI contexts.
- **Sunday planning**: Planning prompt can include "What would [inspiration] prioritize this week?" when the member has inspirations set.

**Key design decision:** Inspirations are injected into AI prompts, not into a separate system. The AI naturally weaves them in. No separate "inspiration of the day" feature -- that would feel automated and fake. The references come from Jarvis contextually.

### 5. Monthly Progress Recap

**What it is:** Visual summary DM at month-end showing stats, trends, highlights. Shareable to #wins.

**Integration approach:** New module `src/modules/recap/`.

**New components:**
- `src/modules/recap/index.ts` -- Module registration
- `src/modules/recap/generator.ts` -- Data aggregation + embed building
- `src/modules/recap/commands.ts` -- `/recap` (view last month), `/recap share` (post to #wins)
- `src/modules/recap/embeds.ts` -- Multi-embed recap layout

**Data model changes:** None. Recaps are computed from existing data (check-ins, goals, XP transactions, voice sessions, reflections). No persistence needed -- regenerate on demand.

**Integration points:**
- **SchedulerManager**: Schedule monthly recap delivery on the 1st of each month (global cron, not per-member). Iterate all members with schedules and deliver.
- **Notification delivery**: Use `deliverNotification` with new `recap` type (or reuse `general`).
- **XP engine**: Read-only. Queries XPTransaction for monthly totals by source.
- **Goals module**: Count completed goals, completion rate, hierarchy progress.
- **Check-in module**: Count check-ins, streak data, category distribution.
- **Voice tracker**: Total voice minutes for the month.
- **Reflection module**: Aggregate mood ratings, top insights.
- **Wins/lessons**: Count posts, extract highlights.
- **Discord embeds**: Multi-embed message (Discord allows up to 10 embeds per message). Layout: header with headline stats, goal progress, activity breakdown, mood trend (if reflections exist), comparison to previous month.
- **Share flow**: `/recap share` posts a condensed version to #wins channel with the member's name. Others can react. This awards WIN_POST XP (reusing existing logic).

**Key design decision:** Recaps are NOT image-based. Discord embeds with structured fields look cleaner, are accessible, and avoid image generation complexity. No canvas/sharp dependency. Embeds with Unicode progress bars and emoji indicators are sufficient.

### 6. Smart Reminders

**What it is:** Natural language time-based reminders ("remind me to follow up with John in 3 hours"), urgency tiers, pluggable delivery backend for future Apple integration.

**Integration approach:** New module `src/modules/reminders/`.

**New components:**
- `src/modules/reminders/index.ts` -- Module registration
- `src/modules/reminders/commands.ts` -- `/remind` with natural language time parsing
- `src/modules/reminders/scheduler.ts` -- Reminder scheduling engine
- `src/modules/reminders/parser.ts` -- Natural language time + urgency parsing
- `src/modules/reminders/delivery.ts` -- Pluggable delivery backend interface

**Data model changes:**
```prisma
model Reminder {
  id          String    @id @default(cuid())
  memberId    String
  content     String    // Encrypted -- what to remind about
  urgency     String    @default("NORMAL") // "LOW", "NORMAL", "HIGH", "CRITICAL"
  scheduledAt DateTime  // When to fire
  deliveredAt DateTime? // When actually delivered (null = pending)
  snoozedTo   DateTime? // If snoozed, new delivery time
  status      String    @default("PENDING") // "PENDING", "DELIVERED", "SNOOZED", "CANCELLED"
  recurring   String?   // Cron expression for recurring reminders (null = one-shot)
  createdAt   DateTime  @default(now())

  member Member @relation(fields: [memberId], references: [id], onDelete: Cascade)

  @@index([memberId, status])
  @@index([scheduledAt, status])
  @@index([status])
}
```

**Integration points:**
- **SchedulerManager**: Reminders do NOT use SchedulerManager's per-member cron tasks. Reminders are individual scheduled events, more like lock-in session timers (setTimeout). On startup, load all PENDING reminders and schedule them. Use a dedicated reminder scheduler that manages its own timeout queue.
- **AI assistant (Jarvis)**: Jarvis can create reminders through conversation ("remind me to call John tomorrow at 3pm"). Parse reminder intents from chat messages in `handleChat` and call reminder creation. This is a stretch feature -- v1.1 can start with just the `/remind` command.
- **Notification delivery**: New `reminder` notification type in NotificationType union. Critical urgency reminders repeat if not acknowledged (re-deliver after 5 minutes up to 3 times).
- **Delivery backend abstraction**: Create a `DeliveryBackend` interface:
  ```typescript
  interface DeliveryBackend {
    name: string;
    canDeliver(memberId: string): Promise<boolean>;
    deliver(memberId: string, content: DeliveryContent, urgency: string): Promise<boolean>;
  }
  ```
  v1.1 ships with `DiscordDeliveryBackend` (wraps existing deliverNotification). Future Apple integration adds `APNsDeliveryBackend`. The reminder module tries backends in priority order.
- **EventBus**: New event `reminderDelivered [memberId, reminderId]`.
- **Bot restart**: Load all PENDING reminders from DB where `scheduledAt > now()` and reschedule. Overdue reminders (scheduledAt <= now, still PENDING) are delivered immediately. Same restart-resilience pattern as lock-in sessions.

**Key design decision:** Pluggable backend is the architecture's forward-looking investment. For v1.1, only Discord delivery exists, but the abstraction is in place. Urgency tiers affect delivery: LOW = normal DM, NORMAL = DM with embed, HIGH = DM + repeat if unacknowledged, CRITICAL = DM + repeat + potential mention in a channel.

### 7. Rate Limiting / Cost Controls

**What it is:** Per-member and global AI call budgeting, cost tracking, circuit breaker for runaway spend.

**Integration approach:** New shared service `src/shared/ai-client.ts` that wraps all OpenRouter calls. NOT a module -- it's infrastructure that all AI-using code calls through.

**New components:**
- `src/shared/ai-client.ts` -- Centralized OpenRouter client with rate limiting
- `src/shared/rate-limiter.ts` -- Token bucket rate limiter

**Data model changes:**
```prisma
model AIUsage {
  id          String   @id @default(cuid())
  memberId    String?  // Null for system calls (briefs, nudges)
  feature     String   // "chat", "brief", "nudge", "goal_extract", "tag_extract", "reflection", "recap"
  model       String   // "deepseek/deepseek-v3.2", etc.
  inputTokens Int
  outputTokens Int
  costCents   Int      // Cost in hundredths of a cent for precision
  createdAt   DateTime @default(now())

  @@index([memberId, createdAt])
  @@index([feature, createdAt])
  @@index([createdAt])
}
```

**Integration points:**
- **All AI callers**: Currently there are 6 independent `getOpenRouterClient()` initializations (chat.ts, briefs.ts, planning.ts, nudge.ts, ai-tags.ts, memory.ts). Replace ALL of them with a single `getAIClient()` from `src/shared/ai-client.ts` that:
  1. Tracks input/output tokens from completion responses
  2. Logs AIUsage records
  3. Enforces per-member daily token budget (configurable, default ~100K tokens/day for chat, unlimited for system calls)
  4. Enforces global daily cost ceiling (e.g., $1/day -- at $0.26/M tokens this is ~3.8M tokens)
  5. Returns a circuit breaker error if budget exceeded
- **Config**: Add `AI_DAILY_BUDGET_CENTS` and `AI_PER_MEMBER_DAILY_TOKENS` to env config.
- **Chat module (existing daily cap)**: The existing 50-message cap in chat.ts is a proxy for cost control. Replace with token-based budgeting from the centralized client. The 50-message cap remains as a UX guardrail, but the real cost control happens at the token level.
- **Admin visibility**: New `/admin ai-usage` command showing today's costs, per-feature breakdown, per-member top consumers. Owner-only.
- **EventBus**: New event `aiUsageBudgetExceeded [memberId | 'global', budgetType]` for alerting.

**Key design decision:** Centralize the OpenRouter client. Having 6 independent instances is a v1.0 debt. The shared client makes cost tracking trivial and prevents any single feature from monopolizing the AI budget.

## Component Boundary Diagram

```
                           Discord API (Gateway + REST)
                                      |
                                      v
 ┌────────────────────────────────────────────────────────────────────────┐
 │                            Bot Core                                    │
 │  Client  |  CommandRegistry  |  EventBus  |  Logger                    │
 └────────────────────────────────────────────────────────────────────────┘
          |                                              |
          v                                              v
 ┌─────────────────┐                          ┌─────────────────────────┐
 │  Shared Services │                          │  Database (Prisma 7)    │
 │                  │                          │                         │
 │  ai-client.ts   │ <-- NEW: centralized AI   │  + FocusSession         │
 │  rate-limiter.ts│ <-- NEW: token budgeting  │  + Goal.parentId/depth  │
 │  delivery.ts    │                           │  + Reflection            │
 │  embeds.ts      │                           │  + ReflectionSettings    │
 │  crypto.ts      │                           │  + Inspiration           │
 │  constants.ts   │                           │  + Reminder              │
 │  types.ts       │                           │  + AIUsage               │
 └─────────────────┘                          └─────────────────────────┘
          |
          v
 ┌────────────────────────────────────────────────────────────────────────┐
 │                        Feature Modules (auto-discovered)               │
 │                                                                        │
 │  EXISTING (19 modules):                                                │
 │    ai-assistant  auto-feed   checkin      data-privacy  goals          │
 │    hardening     identity    leaderboard  notification-router          │
 │    onboarding    profile     resources    scheduler     season         │
 │    server-setup  sessions    voice-tracker wins-lessons  xp            │
 │                                                                        │
 │  NEW (3 modules):                    MODIFIED (4 modules):             │
 │    timer/        -- focus sessions     goals/     -- hierarchy          │
 │    reflection/   -- self-eval          profile/   -- inspirations       │
 │    reminders/    -- smart reminders    scheduler/ -- reflection tasks   │
 │                                        ai-assistant/ -- context enrich │
 │                                                                        │
 │  NEW (1 computed, no persistence):                                     │
 │    recap/        -- monthly summaries                                  │
 └────────────────────────────────────────────────────────────────────────┘
```

## Data Flow Changes

### Current Flow (v1.0)
```
Member action --> Module handler --> DB write --> EventBus emit --> Listeners react
                                                    |
                                                    v
                                            XP award, rank sync,
                                            notification delivery
```

### New Flows (v1.1)

**Timer flow:**
```
/timer start --> timer/manager.ts (in-memory state) --> setTimeout for intervals
   |                                                         |
   v                                                         v
FocusSession WORKING in DB                     Break/completion notification via deliverNotification
   |                                                         |
   v                                                         v
On completion: FocusSession COMPLETED        EventBus: timerCompleted --> XP award
```

**Goal hierarchy flow:**
```
/setgoal --parent=<id> --> goals/commands.ts --> DB create with parentId
   |
   v
/completegoal --> DB update status --> Check siblings complete
   |                                         |
   v                                         v
EventBus: goalCompleted              Optional: prompt parent completion
```

**Reflection flow:**
```
Scheduled trigger (SchedulerManager) --> DM conversation flow
   |                                          |
   v                                          v
Member responds --> AI extracts insights --> DB create Reflection
   |                                               |
   v                                               v
EventBus: reflectionCompleted            AI context enriched for future prompts
   |
   v
XP award (REFLECTION source)
```

**Reminder flow:**
```
/remind "call John at 3pm" --> parser.ts --> DB create Reminder PENDING
   |                                              |
   v                                              v
reminder/scheduler.ts --> setTimeout       On fire: DeliveryBackend.deliver()
   |                                              |
   v                                              v
Bot restart: reload PENDING from DB        deliverNotification() [Discord backend]
                                                  |
                                                  v
                                           Future: APNs backend
```

**AI cost tracking flow (cross-cutting):**
```
Any AI call --> shared/ai-client.ts --> Check token budget
   |                                        |
   v                                   Budget OK?
OpenRouter API call                    YES --> proceed
   |                                   NO  --> return budget error
   v
Response --> Extract token counts --> Log AIUsage record
```

## EventBus Extensions

New events to add to `BotEventMap` in `core/events.ts`:

```typescript
// v1.1: Timer
timerStarted: [memberId: string, sessionType: string];
timerCompleted: [memberId: string, totalMinutes: number, cycles: number];

// v1.1: Goal hierarchy
goalHierarchyUpdated: [memberId: string];

// v1.1: Reflection
reflectionCompleted: [memberId: string, type: string];

// v1.1: Reminders
reminderDelivered: [memberId: string, reminderId: string];

// v1.1: Cost control
aiUsageBudgetExceeded: [entityId: string, budgetType: string];
```

## XP Source Extensions

Add to Prisma `XPSource` enum and TypeScript union:

```
FOCUS_SESSION   -- Completing pomodoro work cycles
REFLECTION      -- Completing reflection sessions
```

## Notification Type Extensions

Add to `NotificationType` union in `notification-router/constants.ts`:

```typescript
export type NotificationType =
  | 'brief' | 'nudge' | 'session_alert' | 'level_up' | 'general'
  | 'timer'      // NEW: focus session breaks/completions
  | 'reminder'   // NEW: smart reminder delivery
  | 'recap'      // NEW: monthly recap delivery
  | 'reflection' // NEW: reflection prompts
  ;
```

## Patterns to Follow

### Pattern 1: Conversational DM Flow (Reuse)

**Established by:** `planning.ts` (Sunday planning), `setup-flow.ts` (onboarding)
**Reuse for:** Reflection prompts, reminder creation via Jarvis

```typescript
// Send prompt, await response with timeout, process, repeat
const response = await awaitResponse(dm, authorId);
if (response === null) { await sendTimeoutMessage(dm); return; }
```

### Pattern 2: In-Memory State + DB Persistence (Reuse)

**Established by:** `sessions/manager.ts` (activeSessions Map), `voice-tracker/` (active voice state)
**Reuse for:** Timer manager (activeTimers Map), Reminder scheduler (pendingTimers Map)

```typescript
// In-memory for fast access during active state
const activeTimers = new Map<string, TimerState>();
// DB for persistence across restarts
// On restart: load from DB, reconstruct in-memory state
```

### Pattern 3: AI with Structured Output (Reuse)

**Established by:** `ai-tags.ts`, `planning.ts` (goal extraction)
**Reuse for:** Reflection insight extraction, reminder time parsing from Jarvis chat

```typescript
responseFormat: {
  type: 'json_schema',
  jsonSchema: { name: '...', strict: true, schema: { ... } }
}
```

### Pattern 4: Callback Factory for Scheduler (Reuse)

**Established by:** `scheduler/index.ts` (`makeBriefFn`, `makeReminderFn`, etc.)
**Reuse for:** Reflection scheduled tasks, monthly recap tasks

```typescript
function makeReflectionFn(client: Client, db: ExtendedPrismaClient) {
  return (memberId: string) => () => sendReflectionPrompt(client, db, memberId);
}
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Separate OpenRouter Clients

**What:** Each file creating its own `getOpenRouterClient()` singleton.
**Why bad:** 6 independent clients make cost tracking impossible. Any new AI feature adds another untracked client.
**Instead:** Centralize in `shared/ai-client.ts`. All AI calls go through one client with built-in usage tracking.

### Anti-Pattern 2: Direct DB Queries in AI Prompts

**What:** Building system prompts by loading data inline in the personality builder.
**Why bad:** As more features add data (inspirations, reflections, timer stats), `buildSystemPrompt()` grows into a monolithic query.
**Instead:** Each module exports a `getAIContext(memberId)` function returning its context snippet. The personality builder calls all of them and assembles.

### Anti-Pattern 3: Overloading SchedulerManager

**What:** Adding timer intervals and reminder schedules to the per-member cron task system.
**Why bad:** SchedulerManager is designed for recurring daily tasks (briefs, reminders, nudges). Timers fire every 25 minutes. One-shot reminders fire once. Mixing these creates scheduling complexity.
**Instead:** Timers use `setTimeout` (short-lived, per-session). One-shot reminders use `setTimeout` with restart recovery from DB. Only recurring reminders (if implemented) use cron.

### Anti-Pattern 4: Image-Based Recaps

**What:** Using canvas/sharp to render recap images.
**Why bad:** Adds heavy native dependencies (canvas requires system libraries), increases deployment complexity for a single maintainer, images aren't accessible.
**Instead:** Discord embeds with Unicode progress bars, structured fields, and conditional sections. Looks professional, zero dependencies.

## Suggested Build Order

Build order is driven by dependency analysis and risk level:

### Phase 1: AI Cost Infrastructure (Foundation)
**Build:** `shared/ai-client.ts`, `shared/rate-limiter.ts`, `AIUsage` model, refactor all 6 OpenRouter client instances.

**Rationale:** Every subsequent feature adds AI calls. Without centralized cost tracking, v1.1 has no spend visibility. This MUST come first because:
1. Goal hierarchy uses AI for breakdown assistance
2. Reflections use AI for insight extraction
3. Recap generation uses AI for narrative
4. Reminder parsing uses AI for natural language
5. Timer completion messages may use AI for personalization

**Risk:** LOW -- straightforward refactor. All existing OpenRouter call sites are identical in pattern.

### Phase 2: Goal Hierarchy Refactor
**Build:** Schema migration (parentId, depth, timeframe), update `/setgoal`, `/goals`, `/completegoal` commands, update AI context.

**Rationale:** This is a schema migration on an existing table, so it must happen early before other features start depending on the Goal model. Reflections reference goals. Recaps summarize goals. The hierarchy must be stable first.

**Risk:** MEDIUM -- schema migration on existing data. Use `@default` and nullable fields for backwards compatibility.

### Phase 3: Inspiration System
**Build:** `Inspiration` model, `/inspiration` commands, inject into `buildSystemPrompt()`.

**Rationale:** Small scope, no dependencies on other v1.1 features, enriches AI context for all subsequent features. Once inspirations are in the prompt, reflections, briefs, nudges, and planning all benefit.

**Risk:** LOW -- additive only, no modifications to existing behavior.

### Phase 4: Productivity Timer
**Build:** `timer/` module, `FocusSession` model, commands, in-memory manager, XP integration.

**Rationale:** Independent feature with clear boundaries. Depends on AI client (Phase 1) for completion messages. Does not depend on goals, reflections, or reminders.

**Risk:** LOW -- follows established session manager pattern.

### Phase 5: Self-Evaluation / Reflection
**Build:** `reflection/` module, `Reflection` + `ReflectionSettings` models, DM flows, AI insight extraction, scheduler integration.

**Rationale:** Depends on AI client (Phase 1) for insight extraction. Benefits from inspiration context (Phase 3). Benefits from goal hierarchy (Phase 2) for "how did you progress on your goals?" prompts.

**Risk:** MEDIUM -- extends SchedulerManager with new task types, requires careful prompt engineering for quality insights.

### Phase 6: Smart Reminders
**Build:** `reminders/` module, `Reminder` model, natural language parser, delivery backend abstraction, scheduler.

**Rationale:** Most complex new feature. Depends on AI client (Phase 1) for natural language parsing. The pluggable delivery backend is forward-looking architecture that doesn't block v1.1 but positions for Apple integration.

**Risk:** MEDIUM -- time parsing is fiddly, restart recovery must be tested, urgency-based repeat delivery adds state management.

### Phase 7: Monthly Progress Recap
**Build:** `recap/` module, data aggregation, multi-embed builder, share-to-wins flow.

**Rationale:** Pure read-only aggregation of all other features. Must come LAST because it summarizes data from goals (Phase 2), timer sessions (Phase 4), reflections (Phase 5), and reminders (Phase 6). Building it earlier means missing data sources.

**Risk:** LOW -- read-only queries, no state mutations, follows established embed patterns.

## Schema Migration Strategy

All v1.1 schema changes should be done in a single Prisma migration:

1. **New tables** (additive, zero risk): FocusSession, Reflection, ReflectionSettings, Inspiration, Reminder, AIUsage
2. **Modified tables** (requires care): Goal (add parentId, depth, timeframe -- all nullable/defaulted)
3. **Enum additions** (additive): XPSource += FOCUS_SESSION, REFLECTION

Run `prisma migrate dev --name v1.1-depth-features` once all schema changes are defined. Do NOT run separate migrations per feature -- Prisma migrations should be batched.

## Member Model Relation Additions

```prisma
model Member {
  // ... existing relations ...

  // v1.1 additions
  focusSessions       FocusSession[]
  reflections         Reflection[]
  reflectionSettings  ReflectionSettings?
  inspirations        Inspiration[]
  reminders           Reminder[]
}
```

## Scalability Notes

At 10-25 members, none of these features have scalability concerns. The only thing to watch:

| Feature | Concern | At 25 Members | Mitigation |
|---------|---------|---------------|------------|
| Timers | In-memory Map size | 25 entries max | Trivial |
| Reminders | setTimeout count | ~100 pending max | Trivial |
| AI costs | Token consumption | ~$0.05-0.10/day | Budget ceiling in ai-client |
| Monthly recap | DB query load | 25 queries/month | Run sequentially, not parallel |
| Reflection | Prompt frequency | 25-75 DMs/week | Staggered by member timezone |

## Sources

- Full codebase review of `/Volumes/Vault/Discord Hustler/src/` (19 modules, ~16K LOC)
- Prisma schema at `prisma/schema.prisma`
- Existing architectural patterns from v1.0 modules (sessions, scheduler, AI assistant, goals)
- Project context from `.planning/PROJECT.md`
- Accumulated decisions from `.planning/STATE.md`
