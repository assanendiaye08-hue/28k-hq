# Stack Research: Conversational AI Coaching (v3.0)

**Domain:** Conversational AI coaching bot with proactive outreach and smart context management
**Researched:** 2026-03-22
**Confidence:** HIGH

**Scope:** This document covers ONLY what is needed for v3.0: pure conversational AI (no slash commands for core interactions), proactive coaching routines (cron-based DM outreach), smart context management (topic awareness, no irrelevant bleeding), and per-user coaching settings persistence. The validated v1.0/v1.1/v2.0 stack is not re-evaluated.

---

## Key Finding: Zero New Dependencies Required

After thorough analysis of the existing codebase (2,500+ LOC across 8 core files), every capability required for v3.0 is achievable with the current stack. The architecture already has the exact patterns needed -- they just need to be extended.

| v3.0 Capability | Existing Infrastructure | What Changes |
|-----------------|------------------------|--------------|
| Pure conversational AI | `index.ts` DM handler + intent detection chain | Add intent handlers for check-in, goals, settings |
| Proactive scheduling | `SchedulerManager` + `node-cron` per-member tasks | Add 2-3 new routine types (EOD, weekly recap, goal nudges) |
| Smart context | `memory.ts` tiered context assembly | Add topic column + topic-filtered queries |
| Coaching settings | `MemberSchedule` model + `/settings` command | Extend model with new fields + NL settings parsing |

---

## Existing Stack (Integration Context Only)

| Technology | Version | Role in v3.0 |
|------------|---------|--------------|
| discord.js | ^14.25.1 | DM message handling, typing indicators, message delivery |
| @openrouter/sdk | ^0.9.11 | All AI calls via centralized `callAI()` |
| node-cron | ^4.2.1 | Per-member scheduled coaching routines |
| Prisma 7 | ^7.5.0 | Data persistence, schema migrations |
| chrono-node | ^2.9.0 | NLP date/time parsing for reminders |
| date-fns + @date-fns/tz | ^4.1.0 / ^1.4.1 | Timezone-aware scheduling |
| zod | ^4.3.6 | Structured AI response validation |
| winston | ^3.19.0 | Logging |

---

## Detailed Analysis by Capability

### 1. Pure Conversational AI -- Intent Detection via Existing `callAI`

**Current state:** `ai-assistant/index.ts` (353 LOC) already handles DMs with an intent detection chain:
```
isTimerStopRequest → isTimerPauseRequest → isTimerResumeRequest → isTimerRequest → isReminderRequest → isDecompositionRequest → handleChat (fallback)
```

Each detector is a simple regex function. The pattern is proven and debuggable.

**What to add:**

| New Intent | Detection Method | Handler |
|-----------|-----------------|---------|
| Check-in intent | Regex: `/^(check.?in|daily update|here'?s what i did)/i` | Parse content, create CheckIn via Prisma, award XP |
| Goal CRUD intent | Regex: `/^(set goal|new goal|update goal|complete goal)/i` + AI fallback | Route to goal creation/update/completion handlers |
| Settings intent | Regex: `/^(set |change |update ).*(timezone|accountability|brief|nudge)/i` | Parse and update MemberSchedule |
| Fallback classification | `callAI` with structured JSON response | For ambiguous messages that don't match any regex |

**Why NOT a separate NLP library (nlp.js, compromise, Rasa, Botpress):**
- Grok 4.1 Fast handles intent classification better than any local NLP at this scale
- The existing regex-first, AI-fallback pattern handles 80% of cases without an API call
- Adding a library means maintaining two NLP systems (library + Grok) with conflicting results
- 10-25 users does not justify NLP infrastructure

**Fallback intent classification pattern (single AI call, not a two-step pipeline):**

```typescript
// Only reached when no regex matches -- use callAI inline
const result = await callAI(db, {
  memberId,
  feature: 'chat',
  messages: [
    { role: 'system', content: systemPrompt + '\n\nIf the user is trying to check in, set a goal, or change settings, respond with the action AND the conversational response. Use this JSON structure at the end of your response on its own line: [ACTION:checkin|goal|settings|none]' },
    ...contextMessages,
    { role: 'user', content: userMessage },
  ],
});
// Parse action tag from response, route accordingly
```

This avoids a separate classification call. The main response and the intent classification happen in the same API call. Token cost: negligible (one extra line of output).

---

### 2. Proactive Coaching Routines -- Extending SchedulerManager

**Current state:** `SchedulerManager` (335 LOC) manages 5 task types per member: brief, reminder, planning, nudge, reflection. It has `rebuildAll()` for restart recovery and `updateMemberSchedule()` for live updates.

**New routine types to add:**

| Routine | Cron Pattern | Implementation Pattern | Follows |
|---------|-------------|----------------------|---------|
| End-of-day reflection DM | `{min} {hour} * * *` from `endOfDayTime` | Same as `sendBrief()` -- load context, call AI, deliver DM | `briefs.ts` pattern |
| Weekly recap | `{min} {hour} * * {day}` from `weeklyRecapDay`/`weeklyRecapTime` | Aggregate week's check-ins, goals, XP, voice time. AI narrative summary. | `briefs.ts` pattern |
| Goal deadline nudge | `0 10 * * *` (daily at 10am) | Query goals with deadlines in next 3 days, generate contextual nudge | `nudge.ts` pattern |
| Proactive follow-up | One-shot `setTimeout` after coaching conversation | When Jarvis and member discuss a commitment, schedule a follow-up check | `scheduleOneShot` pattern from reminders |

**Adding to SchedulerManager (code change, not a new dep):**

```typescript
// In manager.ts -- add new method following existing pattern:
scheduleEndOfDay(memberId: string, cronExpr: string, timezone: string, fn: () => Promise<void>): void {
  this.setTask(memberId, 'end-of-day', cronExpr, timezone, fn);
}

scheduleWeeklyRecap(memberId: string, cronExpr: string, timezone: string, fn: () => Promise<void>): void {
  this.setTask(memberId, 'weekly-recap', cronExpr, timezone, fn);
}

scheduleGoalCheck(memberId: string, cronExpr: string, timezone: string, fn: () => Promise<void>): void {
  this.setTask(memberId, 'goal-check', cronExpr, timezone, fn);
}
```

**Proactive follow-up pattern (commitment tracking):**

After a coaching conversation where the member makes a commitment ("I'll finish the landing page by Friday"), Jarvis can schedule a follow-up. This uses the existing reminder scheduler pattern:

```typescript
// During handleChat, after AI response:
// AI response includes [FOLLOWUP:2026-03-25T10:00:00|Did you finish the landing page?]
// Parse and schedule via setTimeout or node-cron one-shot
```

No new infrastructure -- reuse the `scheduleOneShot` pattern from `reminders/scheduler.ts`.

---

### 3. Smart Context Management -- Topic Tagging

**Current state:** `memory.ts` (604 LOC) assembles context in three tiers:
- Hot (0-7 days): 50 messages verbatim
- Warm (8-30 days): weekly text summaries
- Cold (30+ days): AI-compressed rolling summary
- Protected: member profile, goals, schedule (never trimmed)

The problem: ALL hot-tier messages are included regardless of topic. If a member discussed goals in the morning and asks about a timer in the afternoon, goal discussion context bleeds into the timer conversation.

**Solution -- Topic column + filtered assembly (Prisma migration, no new dep):**

```prisma
model ConversationMessage {
  // ... existing fields ...
  topic     String?   // goals, accountability, planning, reflection, casual, technical, brief, nudge
}
```

**Topic extraction approach -- zero extra API calls:**

Add to the main system prompt in `personality.ts`:

```
End every response with a topic tag on its own line: [TOPIC:goals|accountability|planning|reflection|casual|technical]
```

In `handleChat`, parse the tag from the response before storing:

```typescript
const topicMatch = responseText.match(/\[TOPIC:(\w+)\]/);
const topic = topicMatch?.[1] ?? 'casual';
const cleanResponse = responseText.replace(/\[TOPIC:\w+\]/, '').trim();
await storeMessage(db, memberId, 'assistant', cleanResponse, topic);
await storeMessage(db, memberId, 'user', userMessage, topic);
```

**Topic-aware context assembly:**

Add a `assembleContextForTopic()` variant that prioritizes messages matching the detected topic:

```typescript
// In assembleContext, when loading hot-tier messages:
// 1. Load all messages from last 7 days (existing)
// 2. If current topic is detected, move matching-topic messages to front
// 3. Trim non-matching messages first when over budget
```

This is a query change, not a new dependency. Prisma's `where: { topic: currentTopic }` handles it.

**Why NOT embeddings/vector search:**
- 10-25 users x 50 msgs/day = ~1,250 messages/day max. PostgreSQL handles this trivially.
- The 2M context window on Grok means you can include 1.4M tokens of context. That is more than any embedding retrieval system would return.
- pgvector, Pinecone, ChromaDB all add operational complexity for zero benefit at this scale.
- Topic column + WHERE clause is O(1) configuration vs. embedding pipeline setup.

**Outreach context isolation:**

When Jarvis sends a proactive message (brief, nudge, EOD prompt), tag it with the appropriate topic. When the member replies, the topic from the outreach message carries forward, preventing cross-contamination:

```typescript
// In sendBrief():
await storeMessage(db, memberId, 'assistant', briefText, 'brief');

// When member replies to the brief, their message gets tagged 'brief' too
// Context assembly loads brief-tagged messages, not yesterday's goal discussion
```

---

### 4. Per-User Coaching Settings -- Extending MemberSchedule

**Current state:** `MemberSchedule` (Prisma model) has 9 fields covering timezone, brief time/tone, reminder times, Sunday planning, accountability level, nudge time, and reflection intensity.

**New fields needed (Prisma migration):**

```prisma
model MemberSchedule {
  // ... existing 9 fields ...

  // v3.0: Proactive coaching routines
  endOfDayTime        String?   // HH:mm for EOD reflection prompt (null = disabled)
  weeklyRecapEnabled  Boolean   @default(true)
  weeklyRecapDay      Int       @default(0)  // 0=Sunday, 1=Monday, etc.
  weeklyRecapTime     String    @default("10:00") // HH:mm
  goalNudgesEnabled   Boolean   @default(true)
  proactiveFollowUps  Boolean   @default(true)

  // v3.0: Coaching style
  coachingTone        String    @default("direct") // direct, gentle, intense
  verbosity           String    @default("concise") // concise, detailed
}
```

**Why extend MemberSchedule instead of a new model:**
- All per-member configuration is already in one place
- The SchedulerManager already reads MemberSchedule for `rebuildAll()`
- Adding a second model means a second query in every scheduling operation
- 17 fields total is manageable -- not unwieldy

**Natural language settings changes:**

Members say things like "nudge me less" or "make the weekly recap shorter" in conversation. Instead of requiring slash commands:

```typescript
// In the intent detection chain, before fallback to handleChat:
if (isSettingsRequest(message.content)) {
  // Use callAI to parse the settings intent
  const result = await callAI(db, {
    memberId: account.memberId,
    feature: 'settings-parse',
    messages: [
      { role: 'system', content: 'Parse this settings change request. Respond with JSON: { "field": "accountabilityLevel|coachingTone|verbosity|...", "value": "..." }' },
      { role: 'user', content: message.content },
    ],
    responseFormat: { type: 'json_object' },
  });
  // Apply the parsed change to MemberSchedule
}
```

---

## Recommended Stack Changes Summary

### New npm Dependencies: NONE

### Database Migrations Required

| Migration | Fields | Purpose |
|-----------|--------|---------|
| Add topic to ConversationMessage | `topic String?` | Smart context filtering |
| Extend MemberSchedule | 8 new fields (see above) | Coaching settings + routine configuration |

### Code Changes by Module

| Module | Change | New Files | LOC Estimate |
|--------|--------|-----------|-------------|
| `ai-assistant/index.ts` | Add check-in, goal, settings intent handlers | 0 (extend existing) | +150 |
| `ai-assistant/chat.ts` | Topic extraction from AI response | 0 (modify existing) | +20 |
| `ai-assistant/memory.ts` | Topic-aware `assembleContext` variant | 0 (modify existing) | +60 |
| `ai-assistant/personality.ts` | Topic tag instruction in system prompt | 0 (modify existing) | +5 |
| `scheduler/manager.ts` | Add EOD, weekly recap, goal check task types | 0 (extend existing) | +30 |
| `scheduler/` | Weekly recap generator | 1 new file | ~200 |
| `scheduler/` | EOD reflection DM generator | 1 new file | ~150 |
| `scheduler/` | Goal deadline nudge | 1 new file | ~100 |
| `ai-assistant/` | Natural language check-in handler | 1 new file | ~150 |
| `ai-assistant/` | Natural language goal handler | 1 new file | ~200 |
| `ai-assistant/` | Natural language settings handler | 1 new file | ~100 |
| **Total** | | **5 new files** | **~1,165 LOC** |

### Modules to Remove

| Module | Action | Reason |
|--------|--------|--------|
| Timer module (`modules/timer/`) | Delete entirely | Desktop app handles timers now |
| Timer intent detection in `index.ts` | Remove `isTimerRequest`, `isTimerStopRequest`, etc. | No longer relevant |
| Private channel support in `index.ts` | Remove `privateSpace` lookup + `isPrivateChannel` logic | DMs only |
| `/checkin` command | Remove command registration | Natural language replaces it |
| `/setgoal` command | Remove command registration | Natural language replaces it |
| `/ask` command | Remove command registration | DMs are the primary interface |
| Keep: `/reminders`, `/goals`, `/leaderboard` | Retain as quick-lookup commands | Stated requirement |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| LangChain / LangGraph | Massive abstraction over simple prompt-response flows. `callAI` is 285 lines and does everything. LangChain adds 50+ transitive dependencies for chain/agent patterns you will not use. | `callAI()` directly |
| Vector database (pgvector, Pinecone, ChromaDB) | 10-25 users, 50 msgs/day. PostgreSQL WHERE clauses handle this trivially. Vector search adds embedding generation costs ($), pipeline complexity, and operational burden for zero benefit. | Prisma queries with `topic` column |
| Redis | In-memory `Map<>` already works (see `briefCache`, `processingLocks`). 10-25 users fit in process memory. Adding Redis means another service to deploy, monitor, and debug. | `Map<string, ...>` patterns |
| Bull/BullMQ job queue | `node-cron` + `setTimeout` handles all scheduling. Job queues add Redis as a hard dependency. At 10-25 users with 5-8 cron tasks each, you have ~200 cron tasks max. `node-cron` handles this without breaking a sweat. | SchedulerManager + node-cron |
| XState / state machine library | The intent detection chain (if/else in `index.ts`) is linear and debuggable. State machines add abstraction for flows that are not actually stateful -- each message is processed independently. | Intent detection functions |
| Separate NLP service (Rasa, Botpress, nlp.js) | Grok 4.1 Fast handles intent classification better than any local NLP library. Adding a second NLP system creates conflicting classification results and doubles the maintenance surface. | Regex detection + `callAI` fallback |
| OpenAI SDK (direct) | OpenRouter already provides model flexibility, automatic fallback, and unified billing. Switching to direct OpenAI removes the DeepSeek fallback path. | @openrouter/sdk (existing) |
| Conversation state machine / dialog system | Coaching conversations are open-ended, not form-filling workflows. A dialog manager (slots, intents, entities) is designed for transactional bots ("book a flight"), not coaching ("how do I stay motivated"). | Free-form AI conversation via `handleChat` |

---

## Alternatives Considered

| Category | Recommendation | Alternative | When to Use Alternative |
|----------|---------------|-------------|------------------------|
| Intent classification | Regex-first + inline AI fallback | Dedicated lightweight classification model call | If Grok latency exceeds 2s consistently (monitor, don't preoptimize) |
| Topic storage | PostgreSQL `topic` column on ConversationMessage | Separate `ConversationTopic` table with many-to-many | If conversations frequently span multiple topics simultaneously -- unlikely for 1:1 coaching |
| Settings persistence | Extend MemberSchedule with 8 new fields | Separate `MemberCoachingPrefs` model | If MemberSchedule exceeds ~20 fields total and query performance degrades |
| Context filtering | Topic-based Prisma WHERE clause | Embedding similarity search | Only if you scale past 100+ concurrent users (explicit non-goal) |
| Proactive follow-ups | `setTimeout` / one-shot cron, stored in Reminder table | Event-driven triggers via Prisma middleware | If you need real-time reactions to data changes (e.g., instant congrats on goal completion) |
| Coaching tone control | `coachingTone` field with 3 options | Free-text tone description stored in DB | If users want highly specific tone control ("like my friend Dave but more intense") |

---

## Integration with Existing AI Client

The centralized `callAI()` function (285 LOC in `ai-client.ts`) requires zero modifications for v3.0. All new features use it via new `feature` tags for automatic cost tracking:

| v3.0 Feature | `callAI` feature tag | Budget Impact |
|--------------|---------------------|---------------|
| Conversational check-in | `'chat'` (existing) | None -- same as current chat |
| Conversational goal CRUD | `'chat'` (existing) | None |
| Settings parsing | `'settings-parse'` (new) | Minimal -- small prompt, small response |
| EOD reflection prompt | `'eod-reflection'` (new) | ~500 tokens/call, 1x/day/member |
| Weekly recap | `'weekly-recap'` (new) | ~2,000 tokens/call, 1x/week/member |
| Goal deadline nudge | `'goal-nudge'` (new) | ~300 tokens/call, at most 1x/day/member |
| Topic classification | N/A -- inline in main chat response | Zero extra calls |

**Estimated cost impact:** At 25 members, all new proactive routines add roughly $0.02-0.05/day total via Grok 4.1 Fast ($0.20/M input tokens). Well within the $0.10/day/member budget.

---

## Installation

```bash
# No new packages to install.
# Only database migration needed:

cd /Volumes/Vault/Discord\ Hustler/packages/db
pnpm prisma migrate dev --name add-coaching-v3-fields
```

---

## Version Compatibility

No new packages, so no compatibility matrix needed. All existing packages are current as of 2026-03-22.

---

## Sources

- Codebase: `apps/bot/src/shared/ai-client.ts` -- centralized AI client, budget enforcement, model routing (285 LOC)
- Codebase: `apps/bot/src/modules/ai-assistant/memory.ts` -- tiered memory (hot/warm/cold), context assembly, compression (604 LOC)
- Codebase: `apps/bot/src/modules/ai-assistant/chat.ts` -- per-member locked chat handler (166 LOC)
- Codebase: `apps/bot/src/modules/ai-assistant/index.ts` -- DM handler with intent detection chain (353 LOC)
- Codebase: `apps/bot/src/modules/ai-assistant/personality.ts` -- system prompt builder with layered sections (301 LOC)
- Codebase: `apps/bot/src/modules/ai-assistant/nudge.ts` -- accountability nudge with configurable intensity (258 LOC)
- Codebase: `apps/bot/src/modules/scheduler/manager.ts` -- per-member cron task lifecycle manager (335 LOC)
- Codebase: `apps/bot/src/modules/scheduler/briefs.ts` -- hybrid AI+template morning brief generation (506 LOC)
- Codebase: `apps/bot/src/modules/reminders/scheduler.ts` -- one-shot + recurring reminder scheduling (452 LOC)
- Codebase: `packages/db/prisma/schema.prisma` -- MemberSchedule, ConversationMessage models
- Codebase: `apps/bot/package.json` -- current dependency list (12 deps, 4 devDeps)

---
*Stack research for: Discord Hustler v3.0 Conversational AI Coaching*
*Researched: 2026-03-22*
