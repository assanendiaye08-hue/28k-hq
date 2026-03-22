# Phase 4: AI Assistant - Research

**Researched:** 2026-03-20
**Domain:** Conversational AI via OpenRouter, conversation memory management, scheduled nudges
**Confidence:** HIGH

## Summary

Phase 4 adds a Jarvis-like AI assistant to each member's private space. The codebase already has OpenRouter integration (`@openrouter/sdk` v0.9.11) with a proven `chat.send({ chatGenerationParams })` pattern used in both `ai-tags.ts` (structured output) and `briefs.ts` (free-text generation). DeepSeek V3.2 is the primary model (128K/164K context, $0.26/$0.38 per M tokens) with Qwen 3.5 Plus as fallback (1M context, $0.26/$1.56 per M tokens).

The core engineering challenge is conversation memory. With DeepSeek's 164K token context, a rolling window of recent messages plus compressed summaries of older conversations fits comfortably. The pattern is: store all messages in the database, load recent N messages verbatim, prepend a running summary of older messages as a system message, and trigger re-summarization when the summary + recent messages approach 70% of context capacity.

The nudge system extends the existing scheduler infrastructure (`SchedulerManager`, `node-cron`, timezone-aware per-member tasks). The morning brief upgrade replaces the current template-then-AI approach with a richer AI-generated brief that has access to full member context. Both are incremental extensions of working patterns.

**Primary recommendation:** Build a `ConversationMessage` model for persistent storage, a summarization service that compresses old messages on-demand, and an AI chat handler that assembles context (system prompt + summary + recent messages + member data) before each OpenRouter call. Extend the scheduler for accountability nudges with configurable intensity levels.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Character type**: Jarvis-like assistant with accountability -- sharp, efficient, has your back, calls you out when needed
- **Baseline tone**: Hustler bro energy -- direct, uses slang, keeps it real. But not a mentor/sage -- more like a personal operator
- **Push level**: Supportive challenge -- doesn't just accept "I'll do it tomorrow", but frames it as "what's blocking you?" rather than aggressive callouts
- **Name**: Mentor-esque name with assistant vibes (not Yoda-wise, more Jarvis/FRIDAY operational). Claude decides the specific name
- **Morning brief timing**: Member-chosen time with timezone support (`/setbrief 7:30 Europe/Paris`)
- **Morning brief length**: Claude's discretion -- adaptive based on how much news there is
- **Morning brief content**: Claude's discretion -- mix of personal stats, server highlights, and motivational elements as appropriate
- **Empty state (no goals set)**: Claude's discretion -- mini onboarding flow or nudge to set goals
- **Accountability level**: Member-configurable -- they choose how much accountability they want (e.g., light/medium/heavy or similar scale)
- **Nudge triggers**: Context-dependent based on accountability level -- missed check-ins, broken streaks, goal deadlines
- **Nudge frequency**: Scales with accountability level. Claude decides specific caps per level
- **Extended silence handling**: After prolonged inactivity, genuine check-in -- ask if they want to opt out or if they're still serious
- **Nudge channel**: DM only. Private, no public shaming
- **Conversation history**: Full conversation history (or as close as possible). Use summarization + retrieval to fit within model context limits
- **Model preference**: DeepSeek v3.2 via OpenRouter. Fallback to Qwen 3.5 Plus if context/capability limitations
- **Proactive references**: Yes -- AI should follow up on things member mentioned in past conversations
- **Data access**: Everything available -- profile, goals, stats, server activity, check-in history, goal completion patterns, conversation summaries
- **Data control**: `/wipe-history` command that lets members export first, then clear all conversation data. Profile and goals remain

### Claude's Discretion
- Specific AI character name (Jarvis/FRIDAY-inspired, operational not wise)
- Morning brief format and density
- Nudge frequency caps per accountability level
- How conversation summaries are generated and stored
- Empty state onboarding flow details
- Whether social proof references use names or stay anonymous

### Deferred Ideas (OUT OF SCOPE)
- Advanced AI coaching with pattern recognition across weeks of data (ADVAI-01 -- future milestone)
- Per-feature opt-out for tracking (ADVAI-02 -- future milestone)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AI-01 | Conversational AI in private space -- general chat, advice, brainstorming via OpenRouter models | OpenRouter SDK already integrated; chat.send pattern proven; DeepSeek V3.2 as primary model; conversation memory via DB + summarization |
| AI-02 | Context-aware morning briefs -- AI incorporates member's goals, streak, interests, and recent activity | Existing briefs.ts provides the foundation; upgrade system prompt to include full member context + server highlights + conversation history |
| AI-03 | Accountability nudges -- evening message if member hasn't checked in that day, sent to preferred account | Existing scheduler + deliverToPrivateSpace handles timing and delivery; add accountability level to MemberSchedule; add nudge logic with configurable intensity |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @openrouter/sdk | ^0.9.11 | AI model access (DeepSeek V3.2 + Qwen 3.5 Plus) | Already in use; proven pattern in ai-tags.ts and briefs.ts |
| discord.js | ^14.25.1 | Discord bot framework, DM handling, message collection | Already in use; awaitMessages for chat flow |
| @prisma/client | ^7.5.0 | Conversation message storage, member data queries | Already in use; schema extensions needed |
| node-cron | ^4.2.1 | Scheduled nudges, brief timing | Already in use via SchedulerManager |
| @date-fns/tz | ^1.4.1 | Timezone-aware nudge scheduling | Already in use in scheduler |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| winston | ^3.19.0 | Logging for AI module | Already in use; follow existing logger pattern |
| zod | ^4.3.6 | Schema validation for AI responses | Already in use; validate structured AI outputs |

### No New Dependencies Needed
The existing stack covers all requirements. No new npm packages required.

## Architecture Patterns

### Recommended Project Structure
```
src/modules/
  ai-assistant/
    index.ts           # Module registration, command + event wiring
    commands.ts        # /ask, /wipe-history, /accountability commands
    chat.ts            # Core chat handler: context assembly + OpenRouter call
    memory.ts          # Conversation storage, retrieval, summarization
    personality.ts     # System prompt builder, character definition, tone
    nudge.ts           # Accountability nudge logic, intensity levels
    brief-upgrade.ts   # Enhanced morning brief with full AI context
```

### Pattern 1: Conversation Memory with Rolling Summarization
**What:** Store all messages in DB. On each chat turn, load recent N messages verbatim + a compressed summary of older messages. Re-summarize when approaching token limits.
**When to use:** Every AI chat interaction.

```typescript
// Memory assembly pattern
interface ConversationContext {
  systemPrompt: string;       // Character + member data
  summary: string | null;     // Compressed older conversation history
  recentMessages: Message[];  // Last N messages verbatim
  memberContext: string;      // Goals, stats, interests, recent activity
}

// Summarization trigger: when (summary tokens + recent tokens) > 70% of context limit
const CONTEXT_BUDGET = 100_000; // ~70% of DeepSeek's 164K
const RECENT_MESSAGE_CAP = 50;  // Keep last 50 messages verbatim
const SUMMARY_TRIGGER_TOKENS = 80_000; // Re-summarize when summary grows past this
```

### Pattern 2: Layered System Prompt
**What:** Build the system prompt in layers: character personality -> member profile -> current stats -> recent activity -> conversation rules.
**When to use:** Every AI call (chat, brief, nudge).

```typescript
// System prompt layers
function buildSystemPrompt(member: MemberWithContext): string {
  return [
    CHARACTER_PROMPT,           // Jarvis personality, tone, rules
    buildMemberProfile(member), // Name, interests, goals, focus
    buildCurrentStats(member),  // XP, streak, rank, recent check-ins
    buildRecentActivity(member),// Last voice sessions, wins, lessons
    CONVERSATION_RULES,         // Don't invent facts, reference past convos, etc.
  ].join('\n\n');
}
```

### Pattern 3: Event-Driven DM Chat Handler
**What:** Listen for DM messages from linked accounts, resolve to memberId, assemble context, call OpenRouter, store response, reply.
**When to use:** All conversational interactions in DMs.

```typescript
// DM message flow
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.channel.isDMBased()) return;

  const memberId = await resolveDiscordIdToMember(db, message.author.id);
  if (!memberId) return; // Not a registered member

  // Store user message
  await storeMessage(db, memberId, 'user', message.content);

  // Build context and call AI
  const context = await assembleContext(db, memberId);
  const response = await callAI(context);

  // Store and send response
  await storeMessage(db, memberId, 'assistant', response);
  await message.reply(response);
});
```

### Pattern 4: Configurable Accountability Levels
**What:** Three accountability tiers that control nudge frequency, tone intensity, and trigger sensitivity.
**When to use:** Nudge scheduling and generation.

```typescript
// Accountability level definitions
const ACCOUNTABILITY_LEVELS = {
  light: {
    maxNudgesPerDay: 1,
    triggerAfterMissedDays: 2,
    tone: 'gentle reminder',
    silenceThresholdDays: 7,
  },
  medium: {
    maxNudgesPerDay: 2,
    triggerAfterMissedDays: 1,
    tone: 'direct check-in',
    silenceThresholdDays: 5,
  },
  heavy: {
    maxNudgesPerDay: 3,
    triggerAfterMissedDays: 0, // Same day
    tone: 'accountability partner -- calls it out',
    silenceThresholdDays: 3,
  },
} as const;
```

### Anti-Patterns to Avoid
- **Storing full conversation in memory:** Use DB + selective loading. In-memory maps don't survive restarts and waste RAM for inactive members
- **Single monolithic system prompt:** Layer the prompt so member context changes without regenerating the character definition
- **Summarizing on every message:** Only re-summarize when approaching token limits. Use a token counter to decide
- **Blocking DM handler:** The messageCreate handler must be non-blocking. Queue AI calls if multiple messages arrive quickly
- **Hard-coding model names:** Use constants/config for model IDs so fallback switching is trivial

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token counting | Manual string length estimation | Simple approximation: `Math.ceil(text.length / 4)` | Good enough for budget management; exact tokenization is model-specific and slow |
| Context compression | Custom truncation logic | OpenRouter's context-compression plugin as safety net | Built-in middle-out truncation handles edge cases; use as fallback behind our own summarization |
| Conversation export | Custom serialization | JSON export of ConversationMessage records | Prisma gives you typed records; JSON.stringify is sufficient for `/wipe-history` export |
| Scheduled task management | Custom cron wrapper | Existing SchedulerManager | Already handles per-member timezone-aware cron tasks with restart recovery |
| Message delivery | Custom DM/channel logic | Existing `deliverToPrivateSpace()` | Already handles DM vs channel preference with fallback |

**Key insight:** The codebase already has 80% of the infrastructure needed. The AI assistant is primarily new business logic (conversation memory, personality, nudge rules) layered on existing plumbing (OpenRouter SDK, scheduler, delivery, Prisma).

## Common Pitfalls

### Pitfall 1: Token Budget Blowout
**What goes wrong:** System prompt + summary + recent messages + member context exceeds model context, causing API errors or truncation
**Why it happens:** Member context grows (many goals, long check-in history), conversation summary accumulates
**How to avoid:** Token budget accounting before every API call. Reserve 4K for output, 20K for system prompt + member context, allocate remainder to summary + recent messages. Truncate oldest recent messages first if over budget
**Warning signs:** API errors with "context length exceeded", degraded response quality

### Pitfall 2: DM Permission Errors
**What goes wrong:** Bot can't send DMs to members who have DMs disabled or haven't interacted with the bot recently
**Why it happens:** Discord requires mutual server membership and DM permissions
**How to avoid:** Wrap all DM sends in try/catch (existing `deliverToPrivateSpace` already does this). For nudges, fail silently and log. Never crash on delivery failure
**Warning signs:** Delivery returns false, nudge logs show consistent failures for specific members

### Pitfall 3: Runaway AI Costs
**What goes wrong:** Active members trigger hundreds of AI calls per day through rapid chatting
**Why it happens:** No rate limiting on chat interactions
**How to avoid:** Per-member daily message cap (e.g., 50 messages/day for chat, separate from brief/nudge). Show remaining count in responses. Reset at midnight in member's timezone
**Warning signs:** OpenRouter bill spikes, single member consuming disproportionate API credits

### Pitfall 4: Stale Conversation Summaries
**What goes wrong:** AI references outdated information because summary wasn't refreshed after significant changes
**Why it happens:** Summary compression loses recent nuance
**How to avoid:** Always include recent messages verbatim (last 50). Summary is for older context only. When member updates goals or profile, inject a synthetic "context updated" message into conversation history
**Warning signs:** AI references completed goals as active, uses outdated interests

### Pitfall 5: Race Conditions in DM Handler
**What goes wrong:** Member sends multiple messages quickly; bot processes them out of order or generates duplicate responses
**Why it happens:** Async message handler has no per-member queue
**How to avoid:** Per-member processing lock (simple Map<string, Promise>). Queue messages and process sequentially per member. Multiple members can still process in parallel
**Warning signs:** Out-of-order responses, AI responding to first message when second was already sent

### Pitfall 6: Nudge Spam After Bot Downtime
**What goes wrong:** Bot restarts after being down for hours; all pending nudges fire simultaneously
**Why it happens:** Cron tasks fire on schedule regardless of whether earlier ones were missed
**How to avoid:** Track last nudge timestamp per member in DB. Before sending, check if a nudge was already sent today. The existing `sendCheckinReminder` already checks if member checked in today -- extend this pattern
**Warning signs:** Members receive multiple nudges in quick succession after bot restart

## Code Examples

### OpenRouter Chat Call (existing pattern from codebase)
```typescript
// Source: src/modules/profile/ai-tags.ts, src/modules/scheduler/briefs.ts
const client = getOpenRouterClient(); // Lazy singleton

const completion = await client.chat.send({
  chatGenerationParams: {
    model: 'deepseek/deepseek-v3.2',
    messages: [
      { role: 'system' as const, content: systemPrompt },
      // ... conversation history
      { role: 'user' as const, content: userMessage },
    ],
    stream: false,
  },
});

const content = completion.choices[0]?.message?.content;
```

### Message Storage Schema
```prisma
// New model for conversation history
model ConversationMessage {
  id        String   @id @default(cuid())
  memberId  String
  role      String   // 'user', 'assistant', 'system'
  content   String   // Encrypted at rest
  createdAt DateTime @default(now())

  member Member @relation(fields: [memberId], references: [id], onDelete: Cascade)

  @@index([memberId, createdAt])
}

// New model for compressed conversation summaries
model ConversationSummary {
  id           String   @id @default(cuid())
  memberId     String   @unique
  summary      String   // Encrypted compressed summary text
  messageCount Int      // How many messages are summarized
  updatedAt    DateTime @updatedAt

  member Member @relation(fields: [memberId], references: [id], onDelete: Cascade)
}
```

### MemberSchedule Extension
```prisma
// Add to existing MemberSchedule model
model MemberSchedule {
  // ... existing fields ...
  accountabilityLevel String  @default("medium") // "light", "medium", "heavy"
  nudgeTime           String? // HH:mm for evening nudge (null = no nudge)
  lastNudgeAt         DateTime? // Prevent duplicate nudges
}
```

### Conversation Context Assembly
```typescript
async function assembleContext(
  db: ExtendedPrismaClient,
  memberId: string,
): Promise<ConversationContext> {
  // 1. Load member with full context
  const member = await db.member.findUniqueOrThrow({
    where: { id: memberId },
    include: {
      profile: true,
      goals: { where: { status: { in: ['ACTIVE', 'EXTENDED'] } } },
      schedule: true,
      checkIns: { orderBy: { createdAt: 'desc' }, take: 5 },
    },
  });

  // 2. Load conversation summary
  const summary = await db.conversationSummary.findUnique({
    where: { memberId },
  });

  // 3. Load recent messages
  const recentMessages = await db.conversationMessage.findMany({
    where: { memberId },
    orderBy: { createdAt: 'desc' },
    take: RECENT_MESSAGE_CAP,
  });

  // 4. Build system prompt with member context
  const systemPrompt = buildSystemPrompt(member);

  // 5. Estimate tokens and trim if needed
  const estimatedTokens = estimateTokens(systemPrompt, summary?.summary, recentMessages);
  if (estimatedTokens > CONTEXT_BUDGET) {
    // Trim oldest recent messages first
    // If still over, trigger re-summarization
  }

  return {
    systemPrompt,
    summary: summary?.summary ?? null,
    recentMessages: recentMessages.reverse(), // Chronological order
    memberContext: buildMemberContextString(member),
  };
}
```

### Per-Member Processing Lock
```typescript
// Prevent race conditions on concurrent DM messages
const processingLocks = new Map<string, Promise<void>>();

async function handleDMMessage(memberId: string, message: Message): Promise<void> {
  const existing = processingLocks.get(memberId) ?? Promise.resolve();

  const next = existing.then(async () => {
    try {
      await processChat(memberId, message);
    } finally {
      // Clean up if this was the last queued task
      if (processingLocks.get(memberId) === next) {
        processingLocks.delete(memberId);
      }
    }
  });

  processingLocks.set(memberId, next);
  await next;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Fixed context windows (4K-8K) | 128K-1M context windows | 2024-2026 | Less aggressive summarization needed; can keep more messages verbatim |
| Separate embedding DB for retrieval | Rolling summaries sufficient for <100K conversations | 2025+ | Vector DB (Pinecone, etc.) overkill for personal assistant with manageable history |
| GPT-3.5 for summarization | Use same model for both summarization and chat | Current | DeepSeek V3.2 is cheap enough ($0.26/M input) that a separate summarization model adds complexity without meaningful cost savings |
| OpenAI/Anthropic direct SDKs | OpenRouter as model router | Current | Existing codebase uses @openrouter/sdk; single API key, easy model switching |

**Key insight:** With DeepSeek V3.2 at 164K context and $0.26/M input tokens, the token budget is generous enough that most members' full conversation history will fit without summarization for weeks. Summarization becomes important only for highly active members or after months of use.

## Open Questions

1. **AI Character Name**
   - What we know: Must be Jarvis/FRIDAY-inspired, operational not wise
   - Recommendation: "Ace" -- short, hustler-coded, operational feel, easy to type in DMs. Alternatives: "Rex", "Nova", "Dash"

2. **Discord DM Rate Limits**
   - What we know: Discord has rate limits on DM sends. The bot already sends briefs and reminders via DMs
   - What's unclear: Exact rate limit thresholds for DM message creation per user per minute
   - Recommendation: Implement a 1-second minimum delay between bot responses. Discord typically allows 5 messages/5 seconds per channel

3. **Conversation Export Format**
   - What we know: `/wipe-history` should let members export first
   - Recommendation: JSON array of `{ role, content, timestamp }` objects, sent as a Discord file attachment before deletion

4. **Morning Brief Upgrade vs Replace**
   - What we know: Current briefs.ts works with template + AI generation
   - Recommendation: Upgrade in-place. The existing `sendBrief` function gains access to conversation history and server highlights. No separate module needed -- enhance the existing brief builder with richer context

## Sources

### Primary (HIGH confidence)
- Codebase: `src/modules/profile/ai-tags.ts` -- OpenRouter SDK usage pattern with structured output
- Codebase: `src/modules/scheduler/briefs.ts` -- AI brief generation with DeepSeek V3.2
- Codebase: `src/modules/scheduler/manager.ts` -- Per-member cron task management
- Codebase: `src/shared/delivery.ts` -- Private space message delivery
- Codebase: `prisma/schema.prisma` -- Current database schema

### Secondary (MEDIUM confidence)
- [OpenRouter DeepSeek V3.2 page](https://openrouter.ai/deepseek/deepseek-v3.2) -- 164K context, $0.26/$0.38 pricing
- [OpenRouter Qwen 3.5 Plus page](https://openrouter.ai/qwen/qwen3.5-plus-02-15) -- 1M context, $0.26/$1.56 pricing
- [OpenRouter Message Transforms docs](https://openrouter.ai/docs/guides/features/message-transforms) -- Context compression plugin
- [Agenta: Context Length Management Techniques](https://agenta.ai/blog/top-6-techniques-to-manage-context-length-in-llms) -- Rolling window + summarization patterns
- [Maxim: Context Window Management Strategies](https://www.getmaxim.ai/articles/context-window-management-strategies-for-long-context-ai-agents-and-chatbots/) -- Layered memory architecture

### Tertiary (LOW confidence)
- Discord DM rate limits -- based on general community knowledge, not official docs. Needs validation during implementation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in use, no new dependencies
- Architecture: HIGH -- extends proven codebase patterns (scheduler, delivery, OpenRouter)
- Conversation memory: MEDIUM -- summarization pattern is well-documented but implementation details (token counting accuracy, summary quality) need tuning during development
- Pitfalls: HIGH -- based on both codebase analysis and established patterns
- Model pricing/context: MEDIUM -- from OpenRouter pages, may change

**Research date:** 2026-03-20
**Valid until:** 2026-04-20 (stable domain; model pricing may shift)
