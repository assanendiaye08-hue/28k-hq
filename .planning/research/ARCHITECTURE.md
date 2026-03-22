# Architecture Patterns: v3.0 Conversational AI Coaching

**Domain:** Evolving Discord bot from slash-command tool to conversational AI coach
**Researched:** 2026-03-22
**Confidence:** HIGH (based on direct codebase analysis of all relevant modules)

## Executive Summary

v3.0 transforms Jarvis from a reactive assistant (responds to commands and DMs) into a proactive coach (initiates conversations, tracks patterns, adapts to each member). The existing module architecture is sound and does not need restructuring. The work is: **modify 5 existing modules, remove 1 module, add 1 new module, and update the delivery layer**. The biggest architectural change is making all bot-initiated outreach (briefs, reflections, nudges, recaps) part of the conversation history so Jarvis has continuity.

---

## Current Architecture (v2.0)

```
User DM -> ai-assistant/index.ts
  |
  +-- Timer intent?     -> timer/ module (in-memory engine + Discord UI)
  +-- Timer stop/pause? -> timer/ module
  +-- Reminder intent?  -> reminders/parser
  +-- Decompose intent? -> goals/decompose
  +-- Default           -> chat.ts -> memory.ts -> personality.ts -> ai-client.ts
                                                                        |
                                                                   OpenRouter
                                                              (Grok 4.1 Fast primary,
                                                               DeepSeek V3.2 fallback)

Proactive Outreach (scheduler module):
  SchedulerManager (per-member cron tasks)
    +-- morning brief      -> briefs.ts -> deliverNotification()
    +-- check-in reminder  -> briefs.ts -> deliverNotification()
    +-- Sunday planning    -> planning.ts (conversational DM flow)
    +-- evening nudge      -> nudge.ts -> deliverNotification()
    +-- daily reflection   -> reflection/flow.ts (conversational DM flow)
    +-- monthly reflection -> reflection/flow.ts
    +-- monthly recap      -> recap/generator.ts -> deliverNotification()
```

### Key Properties of Current Architecture

| Property | Implementation | Implications for v3.0 |
|----------|---------------|----------------------|
| Intent detection | Sequential `if` cascade in index.ts (6 checks) | Replace with cleaner intent router |
| Conversation memory | 3-tier (hot 7d/warm 30d/cold compressed) | Add topic metadata, add timer session context |
| System prompt | Built per-call from DB (personality.ts) | Add coaching mode instructions |
| Proactive outreach | Scheduler fires callbacks, each module delivers independently | Must store outreach as conversation messages |
| Private spaces | DM or CHANNEL (per member choice) | Simplify to DM-only |
| Timer | Bot in-memory engine + Discord UI buttons | Remove entirely (desktop handles timers) |
| AI calls | Centralized ai-client.ts with budget/routing | No changes needed |
| Cross-module events | EventBus (typed, sync, fire-and-forget) | Add coaching-related events |

---

## Target Architecture (v3.0)

```
User DM -> ai-assistant/index.ts
  |
  Intent Router (NEW file: intent-router.ts)
    +-- Reminder intent?     -> reminders/parser (EXISTING, unchanged)
    +-- Decompose intent?    -> goals/decompose (EXISTING, unchanged)
    +-- Check-in intent? NEW -> checkin handler (natural language)
    +-- Goal update? NEW     -> goals handler (natural language progress)
    +-- Settings change? NEW -> coaching-settings handler
    +-- Default              -> chat.ts (MODIFIED: topic hint, timer context)
                                  |
                            memory.ts (MODIFIED: timer sessions, outreach storage)
                                  |
                            personality.ts (MODIFIED: coaching tone, timer awareness)
                                  |
                            ai-client.ts (UNCHANGED)

Proactive Coaching (scheduler module, MODIFIED):
  SchedulerManager
    +-- morning brief      -> briefs.ts (MODIFIED: plain text, stored as conversation)
    +-- check-in reminder  -> briefs.ts (EXISTING, unchanged)
    +-- Sunday planning    -> planning.ts (EXISTING, unchanged)
    +-- evening nudge      -> nudge.ts (EXISTING, already stores as conversation)
    +-- daily reflection   -> reflection/flow.ts (MODIFIED: store as conversation)
    +-- weekly recap       -> NEW: recap on configurable day
    +-- monthly reflection -> reflection/flow.ts (MODIFIED: store as conversation)
    +-- monthly recap      -> recap/generator.ts (MODIFIED: store as conversation)

Per-User Coaching Config (NEW module: coaching-settings):
  +-- Feature toggles (brief, reflection, recap, nudges, reminders)
  +-- Coaching intensity override
  +-- Timer data inclusion toggle
  +-- Schedule customization
  +-- Natural language changes via Jarvis DM
```

---

## Component Boundaries

### Modules to MODIFY (5)

| Module | File(s) | What Changes | Why |
|--------|---------|-------------|-----|
| `ai-assistant` | `index.ts` | Remove timer imports (lines 32-38), remove timer handling (lines 98-258), remove private channel logic (lines 66-79), extract intent router | Timer is desktop-only, private channels removed, cleaner intent dispatch |
| `ai-assistant` | `chat.ts` | Add optional `topicHint` param to `handleChat()` | Prevents context bleeding when intent is clear |
| `ai-assistant` | `memory.ts` | Query `TimerSession` in `assembleContext()`, store topic metadata, add `storeOutreach()` helper | Desktop timer data feeds coaching context, outreach continuity |
| `ai-assistant` | `personality.ts` | Update CHARACTER_PROMPT for coaching-first posture, add coaching intensity instructions, add timer awareness, remove slash command references | Jarvis becomes coach, not command dispatcher |
| `scheduler` | `index.ts`, `manager.ts` | Add weekly recap task type, wire coaching-settings | New proactive outreach type |
| `scheduler` | `briefs.ts` | Store brief as conversation message after delivery | Jarvis needs continuity when member replies to brief |
| `reflection` | `flow.ts` | Store question + response as conversation messages | Same continuity reason |
| `shared` | `delivery.ts` | Remove CHANNEL delivery path (lines 50-59) | DMs only going forward |

### Modules to ADD (1)

| Module | Purpose |
|--------|---------|
| `coaching-settings` | Per-user coaching configuration (feature toggles, intensity, schedule, timer data inclusion) |

### Modules to REMOVE (1)

| Module | Reason | Migration |
|--------|--------|-----------|
| `timer` | Desktop app handles all timer functionality | Remove directory, remove imports from ai-assistant, keep TimerSession Prisma model |

### Files UNCHANGED

| Component | Why No Change |
|-----------|--------------|
| `ai-client.ts` | Centralized AI routing already perfect for coaching |
| `nudge.ts` | Already stores nudges as conversation messages with `[NUDGE]` marker |
| `reminders/` | Parser/scheduler unchanged, just reached via intent router instead of direct if-check |
| `goals/decompose.ts` | Decomposition flow unchanged |
| `notification-router/` | Routing logic unchanged, just delivers to DM instead of channel |
| `checkin/` module | Slash command stays as fallback; new NL check-in is in ai-assistant |
| `xp/` module | XP engine unchanged |
| `recap/generator.ts` | Content generation unchanged, just add conversation storage |

---

## New Component: Intent Router

### Problem

The current `ai-assistant/index.ts` has a 258-line cascade of `if` statements checking for timer stop, timer pause, timer resume, timer start, reminder, and decomposition intents before falling through to chat. Removing timer reduces this, but adding check-in and goal update intents grows it back.

### Solution

Extract intent classification into `ai-assistant/intent-router.ts`. Keep regex/keyword detection (fast, free, reliable). Do NOT use AI for intent classification (adds 500-1500ms latency on every message).

```typescript
// ai-assistant/intent-router.ts

export type Intent =
  | { type: 'reminder'; parsed: ParsedReminder }
  | { type: 'decomposition'; goalHint: string | null }
  | { type: 'checkin'; content: string }
  | { type: 'goal-update'; content: string }
  | { type: 'settings'; content: string }
  | { type: 'chat' };

export async function classifyIntent(
  message: string,
  memberId: string,
  db: ExtendedPrismaClient,
): Promise<Intent> {
  // Most specific first, cheapest checks first

  if (isReminderRequest(message)) {
    const schedule = await db.memberSchedule.findUnique({ where: { memberId } });
    const parsed = parseReminder(message, schedule?.timezone || 'UTC');
    if (parsed) return { type: 'reminder', parsed };
  }

  if (isDecompositionRequest(message)) {
    return { type: 'decomposition', goalHint: extractDecompositionGoalName(message) };
  }

  if (isCheckinRequest(message)) {
    return { type: 'checkin', content: message };
  }

  if (isGoalUpdateRequest(message)) {
    return { type: 'goal-update', content: message };
  }

  if (isSettingsRequest(message)) {
    return { type: 'settings', content: message };
  }

  return { type: 'chat' };
}
```

**New intent detectors needed:**
- `isCheckinRequest()` -- detects "I worked on X today", "did 3 hours of coding", "check in: finished the API"
- `isGoalUpdateRequest()` -- detects "update my goal to 15/20", "I completed the API goal", "mark SaaS goal as done"
- `isSettingsRequest()` -- detects "turn off morning briefs", "make coaching more intense", "change brief time to 9am"

All use regex/keyword matching, same pattern as existing `isReminderRequest()` and `isDecompositionRequest()`.

---

## New Component: Coaching Settings Module

### Schema Addition

```prisma
model CoachingConfig {
  id                 String   @id @default(cuid())
  memberId           String   @unique

  // Feature toggles
  morningBrief       Boolean  @default(true)
  eodReflection      Boolean  @default(true)
  weeklyRecap        Boolean  @default(true)
  goalNudges         Boolean  @default(true)
  checkinReminders   Boolean  @default(true)

  // Coaching intensity (light/medium/heavy)
  coachingIntensity  String   @default("medium")

  // Desktop timer context inclusion
  includeTimerData   Boolean  @default(true)

  // Schedule overrides (migrate from MemberSchedule)
  briefTime          String?  // HH:mm
  reflectionTime     String?  // HH:mm
  recapDay           String   @default("sunday")
  recapTime          String   @default("18:00")

  member Member @relation(fields: [memberId], references: [id], onDelete: Cascade)
}
```

### Integration with Existing Systems

The `CoachingConfig` model works alongside the existing `MemberSchedule` model, not replacing it. `MemberSchedule` handles timezone, accountability level, nudge time, and reminder times. `CoachingConfig` handles coaching-specific feature toggles and intensity.

When a member changes coaching settings (via natural language DM), the `coaching-settings` module:
1. Updates `CoachingConfig` in DB
2. Emits `scheduleUpdated` event (existing event type)
3. Scheduler rebuilds that member's cron tasks, checking `CoachingConfig` feature toggles before scheduling each task type

---

## Modified Data Flow: Conversation Continuity

### The Problem

Currently, proactive outreach messages are **not part of conversation history**:

| Outreach Type | Stored in Conversation? | Problem |
|--------------|------------------------|---------|
| Nudges | YES (with `[NUDGE]` marker) | None |
| Morning briefs | NO | When member replies to brief, Jarvis has no context of what it said |
| Reflections | NO (stored only as Reflection record) | Jarvis can't reference "last time we reflected on X" |
| Recaps | NO | No continuity |
| Planning sessions | NO (conversational but not stored) | Lost context |

### The Solution

Store all outreach as conversation messages with type markers:

```typescript
// After delivering any proactive message, store it:
await storeMessage(db, memberId, 'assistant', `[BRIEF] ${briefText}`);
await storeMessage(db, memberId, 'assistant', `[REFLECTION] ${question}`);
await storeMessage(db, memberId, 'user', `${memberResponse}`); // reflection response
await storeMessage(db, memberId, 'assistant', `[RECAP] ${recapText}`);
```

The markers serve two purposes:
1. **Counting**: Nudge counting already uses `[NUDGE]` prefix -- extend pattern
2. **Context trimming**: The warm-tier summarizer can recognize outreach types and summarize them appropriately ("Member received 5 morning briefs and 3 reflections last week")

### Impact on Token Budget

At current usage, a member might receive per day:
- 1 morning brief (~200 tokens)
- 1 nudge (~100 tokens)
- 1 reflection Q+A (~300 tokens)

That is ~600 tokens/day of outreach in the hot tier, well within the 1.4M context budget.

---

## Modified Data Flow: Desktop Timer Context

### Current State

`assembleContext()` in `memory.ts` builds `memberContext` from: profile, goals, schedule, check-ins, voice sessions, inspirations, reflections. It does NOT include timer sessions.

### Change

Add timer session query to `assembleContext()`:

```typescript
// In assembleContext(), after voiceSessions query:
const recentTimerSessions = await db.timerSession.findMany({
  where: {
    memberId,
    status: 'COMPLETED',
    startedAt: { gte: subDays(now, 7) },
  },
  orderBy: { startedAt: 'desc' },
  take: 10,
  select: {
    mode: true,
    focus: true,
    totalWorkedMs: true,
    pomodoroCount: true,
    startedAt: true,
  },
});
```

In `buildMemberContext()`:

```typescript
if (recentTimerSessions.length > 0) {
  lines.push('\nRecent Focus Sessions (Desktop):');
  const totalMinutes = recentTimerSessions.reduce(
    (sum, s) => sum + Math.round(s.totalWorkedMs / 60000), 0
  );
  lines.push(`  Total: ${totalMinutes} min across ${recentTimerSessions.length} sessions this week`);
  for (const session of recentTimerSessions.slice(0, 5)) {
    const date = session.startedAt.toISOString().split('T')[0];
    const mins = Math.round(session.totalWorkedMs / 60000);
    const focus = session.focus ? ` on ${session.focus}` : '';
    lines.push(`  - ${date}: ${mins} min${focus}`);
  }
}
```

This data is **protected** (never trimmed by token budget), same as goals and check-ins. Controlled by `CoachingConfig.includeTimerData` toggle.

---

## Modified Component: Personality (Coaching Tone)

### Current CHARACTER_PROMPT

```
You are Jarvis, a sharp personal operator for a productivity Discord server. Efficient, direct, you use casual language and slang naturally...
```

### Updated CHARACTER_PROMPT

```
You are Jarvis, a ruthlessly objective personal coach. You track goals, focus sessions, check-ins, and patterns. You communicate through DMs only. Your job is to help this member level up -- not through motivation speeches, but through specific, data-backed observations and suggestions. You're direct, concise, and you reference their actual data. When they're slacking, you call it out. When they're crushing it, you acknowledge it briefly and push for more. You adapt your push level to their coaching intensity setting.
```

### Updated CONVERSATION_RULES

```
Never reference slash commands except /reminders, /goals, and /leaderboard for quick lookups.
Everything else happens through natural conversation.
When the member wants to check in, log a goal update, set a reminder, or change settings, handle it conversationally.
If you see desktop timer data, reference it naturally: "You logged 2 hours on the API yesterday -- how's that going?"
When you send a morning brief, it's the start of a conversation, not a broadcast.
When a member replies to a brief, nudge, or reflection, continue the conversation naturally.
One suggestion per message. Don't overload.
```

---

## Scheduler Integration: Weekly Recap

### New Task Type in SchedulerManager

```typescript
// manager.ts -- add alongside existing scheduleBrief, scheduleNudge, etc.
scheduleWeeklyRecap(
  memberId: string,
  cronExpr: string,
  timezone: string,
  fn: () => Promise<void>,
): void {
  this.setTask(memberId, 'weekly-recap', cronExpr, timezone, fn);
}
```

### Recap Content Assembly

The weekly recap draws from all data sources:

| Data Source | What It Provides | Query |
|------------|-----------------|-------|
| Check-ins | Count, categories, streak status | `checkIn.findMany({ where: { createdAt: gte: weekStart } })` |
| Goals | Progress deltas, completions | `goal.findMany()` + compare to snapshot |
| Timer sessions (desktop) | Total focus time, session count, topics | `timerSession.findMany({ where: { startedAt: gte: weekStart } })` |
| Voice sessions | Co-working time | `voiceSession.aggregate()` |
| XP transactions | Sources of XP, total earned | `xPTransaction.findMany()` |
| Reflections | Insights from the week | `reflection.findMany()` |

The existing `recap/generator.ts` already does monthly recaps with similar data assembly. The weekly recap reuses this pattern with a shorter time window.

---

## Event Bus Changes

### Events to REMOVE

```typescript
// Remove from BotEventMap (timer module removal):
timerStarted: [memberId: string, mode: string];
timerCompleted: [memberId: string, totalWorkedMinutes: number];
timerCancelled: [memberId: string];
timerTransition: [memberId: string, type: string];
buttonInteraction: [interaction: unknown];
```

### Events to ADD

```typescript
// Add to BotEventMap:
coachingConfigUpdated: [memberId: string];
naturalCheckin: [memberId: string, checkinId: string]; // NL check-in processed
goalUpdatedViaChat: [memberId: string, goalId: string]; // NL goal update processed
```

`coachingConfigUpdated` can simply emit `scheduleUpdated` instead (scheduler already listens). Only add a separate event if other modules need to react specifically to coaching config changes.

---

## Removal Plan: Timer Module

### Files to Delete

```
apps/bot/src/modules/timer/
  index.ts
  engine.ts          -- In-memory Map, start/stop/pause/resume
  session.ts         -- DB persistence helpers
  natural-language.ts -- NLP timer parsing
  embeds.ts          -- Discord embed builders
  buttons.ts         -- Discord button builders
  commands.ts        -- /timer slash command
  constants.ts       -- Timer-specific constants (already in @28k/shared)
```

### Import Cleanup in ai-assistant/index.ts

Remove these imports (lines 32-38):
```typescript
// DELETE ALL OF THESE:
import { isTimerRequest, parseTimerRequest, isTimerStopRequest, isTimerPauseRequest, isTimerResumeRequest } from '../timer/natural-language.js';
import { getActiveTimer, stopTimer, pauseTimer, resumeTimer, scheduleTransition } from '../timer/engine.js';
import { startTimerForMember } from '../timer/index.js';
import { persistTimerSession, deleteActiveTimerRecord, updateTimerRecord } from '../timer/session.js';
import { buildTimerEmbed, buildTimerCompletedEmbed } from '../timer/embeds.js';
import { buildWorkButtons, buildBreakButtons, buildPausedButtons } from '../timer/buttons.js';
import { TIMER_DEFAULTS } from '@28k/shared';
```

### What to KEEP

- `TimerSession` Prisma model -- desktop app writes to it
- `TimerMode`, `TimerStatus` enums -- used by API routes
- Timer API routes in `apps/api/src/routes/timer.ts` -- desktop reads/writes

---

## Removal Plan: Private Channels

### Files to Modify

**`shared/delivery.ts`:**
Remove CHANNEL delivery path (lines 50-59). Simplify to:
```typescript
export async function deliverToPrivateSpace(
  client: Client,
  db: ExtendedPrismaClient,
  memberId: string,
  content: DeliveryContent,
): Promise<boolean> {
  try {
    const account = await db.discordAccount.findFirst({
      where: { memberId },
    });
    if (!account) return false;
    const user = await client.users.fetch(account.discordId);
    await user.send(content);
    return true;
  } catch {
    return false;
  }
}
```

**`ai-assistant/index.ts`:**
Remove private channel check (lines 66-79). DMs are the only input path.

**Migration script:**
One-time: update all `PrivateSpace` records to `type: 'DM'`, clear `channelId`. Can keep `PrivateSpace` model in schema for now, remove in future cleanup.

---

## Patterns to Follow

### Pattern 1: Store-Then-Deliver for Outreach

**What:** Every bot-initiated message is stored as a conversation message BEFORE or immediately AFTER delivery.

**Why:** Conversation continuity. When a member replies to a morning brief, Jarvis needs to know what it said.

**Implementation:**
```typescript
async function deliverAndStore(
  client: Client,
  db: ExtendedPrismaClient,
  memberId: string,
  type: string, // 'BRIEF', 'RECAP', 'REFLECTION', etc.
  text: string,
): Promise<boolean> {
  const delivered = await deliverNotification(client, db, memberId, 'general', {
    content: text,
  });
  if (delivered) {
    await storeMessage(db, memberId, 'assistant', `[${type}] ${text}`);
  }
  return delivered;
}
```

### Pattern 2: Coaching-Aware System Prompt

**What:** The system prompt adapts based on `CoachingConfig` intensity and active features.

**Why:** A member who set coaching to "light" should get gentle suggestions, not hard pushes.

**Implementation:**
```typescript
// In personality.ts buildSystemPrompt():
const coachingConfig = await db.coachingConfig.findUnique({ where: { memberId } });
const intensity = coachingConfig?.coachingIntensity ?? 'medium';

const INTENSITY_INSTRUCTIONS: Record<string, string> = {
  light: 'Be supportive and gentle. Suggest, don\'t push. Acknowledge effort. One suggestion max per conversation.',
  medium: 'Be direct and real. Call out patterns. Push for accountability but respect their pace.',
  heavy: 'Be ruthlessly honest. Challenge excuses. Push hard. Reference data to back up every point.',
};

sections.push(INTENSITY_INSTRUCTIONS[intensity] ?? INTENSITY_INSTRUCTIONS.medium);
```

### Pattern 3: Natural Language Action with Confirmation

**What:** When Jarvis detects a check-in or goal update intent, it confirms before persisting.

**Why:** Prevents accidental data mutations from misclassified intents.

**Implementation:**
```
User: "I worked on the API for 3 hours today, got the auth endpoints done"
Jarvis: "Nice, logging that as a check-in. Categories: coding, API. Sound right?"
User: "yeah" / "no, also add backend"
Jarvis: [persists check-in] "Logged. +35 XP. Streak: 12 days."
```

This is a single AI call with a JSON response format requesting confirmation, not a multi-step flow.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: AI-Based Intent Classification

**What:** Using an LLM call to classify every incoming message's intent.
**Why bad:** Adds 500-1500ms latency to every message. Costs tokens. The 5 intent types needed (reminder, decomposition, check-in, goal update, settings) are easily detectable via regex.
**Instead:** Keep regex/keyword detection. Fall through to chat for anything ambiguous.

### Anti-Pattern 2: Topic Segmentation via Separate Conversations

**What:** Creating separate conversation threads for different topics.
**Why bad:** Over-engineering for 10-25 members. Adds DB complexity. Members don't have 50 concurrent topics.
**Instead:** Add a lightweight topic hint to the system prompt when intent is clear. Let the AI handle topic transitions naturally.

### Anti-Pattern 3: Real-Time Timer Sync via WebSocket

**What:** Building a WebSocket between desktop app and bot for real-time timer state.
**Why bad:** Coaching only needs "what did they do recently", not "what are they doing right now". Over-engineers a read-at-context-assembly-time problem.
**Instead:** Query `TimerSession` table in `assembleContext()`. Completed sessions from desktop are available within the same DB.

### Anti-Pattern 4: Removing ALL Slash Commands

**What:** Going 100% conversational with zero slash commands.
**Why bad:** `/reminders list`, `/goals`, `/leaderboard` return instant structured data. Forcing AI processing for simple lookups is slower UX.
**Instead:** Keep 3 slash commands for quick lookups. Everything else goes through natural language.

### Anti-Pattern 5: Separate Coaching Engine Module

**What:** Building a standalone "coaching-engine" module that orchestrates all coaching logic.
**Why bad:** The coaching pipeline is already distributed across existing modules (briefs, reflections, nudges, recaps). A central orchestrator would duplicate logic and add an abstraction layer with no benefit.
**Instead:** Enhance existing modules in place. The `CoachingConfig` model is the only new coordination point.

---

## Suggested Build Order

Based on dependency analysis and risk ordering:

### Phase A: Clean Slate (no new features, just removal + cleanup)
1. Remove `timer/` module directory
2. Remove timer imports from `ai-assistant/index.ts`
3. Remove timer events from `events.ts`
4. Remove private channel logic from `ai-assistant/index.ts`
5. Simplify `delivery.ts` to DM-only
6. Verify bot still works with all remaining modules

### Phase B: Coaching Foundation (context + personality changes)
1. Add timer session query to `memory.ts` `assembleContext()`
2. Update `personality.ts` CHARACTER_PROMPT and CONVERSATION_RULES
3. Create `ai-assistant/intent-router.ts` (extract from index.ts)
4. Refactor `ai-assistant/index.ts` to use intent router
5. Store briefs as conversation messages (`briefs.ts`)
6. Store reflections as conversation messages (`reflection/flow.ts`)
7. Store recaps as conversation messages (`recap/generator.ts`)

### Phase C: Natural Language Actions + Settings
1. Create `CoachingConfig` Prisma model + migration
2. Create `coaching-settings/` module
3. Add natural language check-in intent detection + handler
4. Add natural language goal update intent detection + handler
5. Add natural language settings change intent detection + handler
6. Add weekly recap task type to scheduler

### Build Order Rationale

- **Phase A first** because removal is risk-free and creates a cleaner codebase to build on
- **Phase B second** because coaching context + personality are prerequisites for natural language actions (Jarvis needs the right tone before handling check-ins conversationally)
- **Phase C third** because it depends on both the intent router (Phase B) and coaching config schema

---

## Scalability Considerations

| Concern | At 10 users | At 25 users | At 100 users (future) |
|---------|-------------|-------------|----------------------|
| AI cost per day | ~$1.00 | ~$2.50 | Need model downgrade or response caching |
| Outreach storage (conversation messages) | ~600 tokens/user/day | Negligible vs 1.4M budget | Still fine |
| Timer session queries in context | 1 query per chat message | Negligible | Add index on (memberId, startedAt, status) |
| Cron task count | ~60 tasks (add recap) | ~150 tasks | node-cron handles thousands |
| Intent classification | <1ms (regex) | <1ms | Still regex, still <1ms |
| Daily message cap | 50 msgs/member | Same | May need adjustment if coaching is chatty |

---

## Sources

- Direct codebase analysis of all files referenced above (HIGH confidence)
- `ai-assistant/index.ts` -- 353 lines, current intent cascade (HIGH confidence)
- `ai-assistant/memory.ts` -- 604 lines, tiered context system (HIGH confidence)
- `ai-assistant/personality.ts` -- 301 lines, system prompt builder (HIGH confidence)
- `ai-assistant/nudge.ts` -- 258 lines, nudge delivery pattern (HIGH confidence)
- `scheduler/manager.ts` -- 335 lines, cron task lifecycle (HIGH confidence)
- `scheduler/index.ts` -- 312 lines, module wiring (HIGH confidence)
- `scheduler/briefs.ts` -- 506 lines, brief generation (HIGH confidence)
- `shared/delivery.ts` -- 75 lines, DM/channel delivery (HIGH confidence)
- `shared/ai-client.ts` -- 285 lines, centralized AI routing (HIGH confidence)
- `core/events.ts` -- 98 lines, event bus (HIGH confidence)
- `core/module-loader.ts` -- 68 lines, dynamic module loading (HIGH confidence)
- `packages/db/prisma/schema.prisma` -- Full schema review (HIGH confidence)
