# Phase 21: Conversational Jarvis - Research

**Researched:** 2026-03-22
**Domain:** LLM-powered intent detection, structured data extraction, conversation state management, coaching tone calibration
**Confidence:** HIGH

## Summary

Phase 21 transforms Jarvis from a regex-based intent router into a full conversational agent that replaces slash commands with natural language DM interactions. The codebase already has the foundational architecture: a centralized AI client (`ai-client.ts`) with budget enforcement and model routing, a three-tier memory system (`memory.ts`) with hot/warm/cold context tiers, and two working examples of intent detection -- regex-based reminder parsing (`parser.ts`) and goal decomposition detection (`decompose.ts`). The task is to replace the rigid regex-based routing in `index.ts` with an LLM-powered intent classification layer that can detect check-in, goal, reminder, commitment, and brainstorming intents from natural conversation, extract structured data, and execute the corresponding database mutations after user confirmation.

The primary model (Grok 4.1 Fast) supports tool calling natively through OpenRouter, which is the correct mechanism for this phase. Rather than asking the LLM to output raw JSON and manually parsing it, tool calling lets you define functions the LLM can invoke (e.g., `log_checkin`, `create_goal`, `set_reminder`, `track_commitment`) and the model will call them with structured parameters when it detects the appropriate intent. This is more reliable than JSON schema extraction for action-oriented intents because the model is specifically trained for tool use. The existing `callAI` function in `ai-client.ts` does not currently pass `tools` to the OpenRouter SDK -- this needs to be extended, but the OpenRouter SDK (`@openrouter/sdk ^0.9.11`) and Grok 4.1 Fast both support the standard tool calling interface.

**Cost validation:** At 25 messages/member/day with Grok 4.1 Fast pricing ($0.20/M input, $0.50/M output), estimated cost is $0.05-0.06/member/day -- well within the $0.10/day budget from STATE.md. The tool calling overhead adds minimal tokens (function definitions ~500 tokens in the system prompt).

**Primary recommendation:** Use LLM tool calling for intent detection and structured extraction. The LLM receives the user message plus conversation context, and if it detects an actionable intent, it calls the appropriate tool function. The tool execution layer validates the extracted data, presents a confirmation to the user, and upon confirmation executes the DB mutation. If no tool is called, the response is treated as regular conversation.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| JARV-01 | Natural language replaces slash commands for goals, check-ins, tasks, reminders | Tool calling architecture: LLM detects intent and calls `log_checkin`, `create_goal`, `set_reminder` tools with structured params. Confirmation flow before DB mutation. |
| JARV-02 | Commitment extraction -- "I'll do X by Y" detected and tracked | `track_commitment` tool with title + deadline extraction. New Commitment DB model. chrono-node for date parsing from extracted deadline strings. |
| JARV-03 | Topic-aware context -- no bleeding between topics | Topic tagging on ConversationMessage via LLM classification. Context assembly filters by active topic. Topic switch detection in conversation flow. |
| JARV-04 | Situationally smart tone -- direct when info available, questions when user needs to think | System prompt layering with conditional sections. Accountability level already wired. Add situational directives based on data availability. |
| JARV-05 | Brainstorming mode -- structured creative thinking on request | `start_brainstorm` tool triggers multi-phase flow (diverge/cluster/evaluate). Session state tracked in memory. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @openrouter/sdk | ^0.9.11 | LLM API calls via OpenRouter | Already in use. Supports tool calling natively. |
| chrono-node | ^2.9.0 | Date/time parsing from NL | Already in use for reminder parsing. Reuse for commitment deadline extraction. |
| zod | ^4.3.6 | Schema validation | Already in bot package. Use for tool parameter validation. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Prisma (via @28k/db) | existing | Database ORM | All DB mutations for new Commitment model, topic tags on messages |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Tool calling | JSON schema structured output | Tool calling is more reliable for action intents -- the model is trained for it. JSON schema is fine for data extraction but adds manual routing overhead. |
| LLM intent classification | Regex pattern matching (current approach) | Regex is fast but brittle -- cannot handle "I finished the API today" as a check-in. LLM handles paraphrasing naturally. |
| LLM topic detection | Embedding-based semantic routing | Overkill for 5-6 intents. LLM classification is sufficient and avoids adding vector DB dependency. |

**Installation:**
```bash
# No new dependencies needed -- everything builds on existing stack
```

## Architecture Patterns

### Recommended Project Structure
```
apps/bot/src/modules/ai-assistant/
  index.ts              # DM message handler (refactored: remove regex routing)
  chat.ts               # Core chat handler (extended: tool calling support)
  intent-tools.ts       # NEW: Tool definitions for all NL actions
  intent-executor.ts    # NEW: Confirmation flow + DB mutation execution
  personality.ts        # System prompt (extended: tone calibration, tool context)
  memory.ts             # Memory service (extended: topic tagging)
  brainstorm.ts         # NEW: Brainstorming session flow
  commands.ts           # Slash commands (kept: /ask, /wipe-history, /accountability)
```

### Pattern 1: Tool Calling for Intent Detection

**What:** Instead of regex-matching user messages against patterns, send the message to the LLM with tool definitions. When the LLM detects an actionable intent, it calls the appropriate tool. When it does not detect an intent, it responds conversationally.

**When to use:** Every DM message goes through this pipeline. The tool calling replaces the current `isReminderRequest()` and `isDecompositionRequest()` checks in `index.ts`.

**Example:**
```typescript
// intent-tools.ts -- Tool definitions
// Source: OpenRouter SDK tool calling docs + existing ai-client.ts patterns

const intentTools = [
  {
    type: 'function' as const,
    function: {
      name: 'log_checkin',
      description: 'Log a daily check-in when the user reports what they did or accomplished today',
      parameters: {
        type: 'object',
        properties: {
          activity: {
            type: 'string',
            description: 'What the user accomplished or worked on',
          },
          effort: {
            type: 'number',
            description: 'Effort level 1-5 if mentioned, null otherwise',
          },
        },
        required: ['activity'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_goal',
      description: 'Create a new goal when the user expresses wanting to achieve something by a deadline',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Concise goal title' },
          deadline: { type: 'string', description: 'Deadline as natural language (e.g., "Friday", "end of month")' },
          target: { type: 'number', description: 'Numeric target if measurable, null otherwise' },
          unit: { type: 'string', description: 'Unit of measurement if measurable, null otherwise' },
        },
        required: ['title', 'deadline'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'set_reminder',
      description: 'Set a reminder when the user asks to be reminded about something at a specific time',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'What to remind about' },
          time: { type: 'string', description: 'When to fire the reminder (natural language)' },
          recurring: { type: 'string', description: 'Recurrence pattern if any (e.g., "every Monday"), null for one-time' },
        },
        required: ['content', 'time'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'track_commitment',
      description: 'Track a commitment when the user says they will do something by a specific time',
      parameters: {
        type: 'object',
        properties: {
          what: { type: 'string', description: 'What the user committed to doing' },
          by_when: { type: 'string', description: 'Deadline for the commitment' },
        },
        required: ['what', 'by_when'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'start_brainstorm',
      description: 'Start a structured brainstorming session when the user wants to explore ideas or think through a problem',
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'What to brainstorm about' },
        },
        required: ['topic'],
      },
    },
  },
];
```

### Pattern 2: Confirmation Before Mutation

**What:** When the LLM calls a tool, the system does NOT immediately execute the DB mutation. Instead, it presents a confirmation to the user, waits for approval, then executes. This is a hard requirement from REQUIREMENTS.md ("Coach helps plan, never auto-creates. Trust requires confirmation.").

**When to use:** Every tool call that creates or modifies data.

**Example:**
```typescript
// intent-executor.ts -- Confirmation flow
// Source: Existing decompose.ts confirmation pattern

interface PendingAction {
  tool: string;
  params: Record<string, unknown>;
  confirmMessage: string;
  createdAt: number;
}

// Store pending actions per member (in-memory, expires after 5 min)
const pendingActions = new Map<string, PendingAction>();

function buildConfirmation(toolName: string, params: Record<string, unknown>): string {
  switch (toolName) {
    case 'log_checkin':
      return `Logging check-in: "${params.activity}". Sound right? (yes/no)`;
    case 'create_goal':
      return `Creating goal: "${params.title}" due ${params.deadline}. Confirm? (yes/no)`;
    case 'track_commitment':
      return `Tracking: You'll "${params.what}" by ${params.by_when}. Got it? (yes/no)`;
    case 'set_reminder':
      return `Reminder: "${params.content}" at ${params.time}. Set it? (yes/no)`;
    default:
      return 'Proceed? (yes/no)';
  }
}

// In chat handler: check if user's message is a confirmation response
function isConfirmation(text: string): boolean {
  return /^(yes|yeah|yep|sure|ok|do it|go ahead|confirm|y)\b/i.test(text.trim());
}

function isDenial(text: string): boolean {
  return /^(no|nah|nope|cancel|never mind|n)\b/i.test(text.trim());
}
```

### Pattern 3: Extended callAI for Tool Calling

**What:** Extend the existing `callAI` function to accept a `tools` parameter and return tool call results.

**When to use:** When making AI calls that should support tool calling (the chat handler).

**Example:**
```typescript
// ai-client.ts extension -- add tools support
// Source: OpenRouter SDK docs, existing callAI patterns

// Extend AICallOptions:
export interface AICallOptions {
  // ... existing fields ...
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: object;
    };
  }>;
}

// Extend AICallResult:
export interface AICallResult {
  // ... existing fields ...
  toolCalls?: Array<{
    id: string;
    function: {
      name: string;
      arguments: string; // JSON string
    };
  }>;
}

// In sendToModel, pass tools if provided:
if (options.tools) {
  params.tools = options.tools;
}

// After completion, extract tool calls:
const toolCalls = completion.choices[0]?.message?.tool_calls;
if (toolCalls && toolCalls.length > 0) {
  return {
    content: null,
    toolCalls: toolCalls.map(tc => ({
      id: tc.id,
      function: {
        name: tc.function.name,
        arguments: tc.function.arguments,
      },
    })),
    usage: usageObj,
    model: actualModel,
    degraded: false,
  };
}
```

### Pattern 4: Topic-Aware Context (JARV-03)

**What:** Add a `topic` field to ConversationMessage. When assembling context, only include messages with the same topic as the current conversation thread. The LLM classifies the topic of each message as part of normal processing.

**When to use:** During context assembly in `memory.ts`.

**Implementation approach:**

```
ConversationMessage {
  ...existing fields...
  topic  String?   // e.g., "fitness", "coding-project", "business", "general"
}
```

Topic classification happens in two places:
1. **On message store:** The LLM response already has context -- extract topic from the same call (add to system prompt: "classify this conversation's topic as one of: [member's active domains]")
2. **On context assembly:** Filter hot-tier messages to include only messages matching the detected topic of the current message, plus always include the last 3-5 messages regardless of topic (for continuity).

The topic is NOT a rigid category system. It is a lightweight tag derived from the conversation content. If the member is talking about their SaaS project, the topic is "saas-project". If they switch to fitness goals, the topic changes. Messages without a clear topic default to "general".

### Pattern 5: Brainstorming Mode (JARV-05)

**What:** A structured creative thinking session triggered by the `start_brainstorm` tool. Runs in three phases: diverge (generate ideas), cluster (group related ideas), evaluate (pick best options).

**When to use:** When user says "let's brainstorm X" or similar.

**Implementation approach:**
- Track brainstorm session state in an in-memory map keyed by memberId
- Each phase has its own system prompt injection
- The session runs as a multi-turn conversation within the existing chat handler
- Session state: `{ topic, phase: 'diverge'|'cluster'|'evaluate', ideas: string[], clusters: string[][] }`
- Phase transitions happen via user prompts ("ok what do we have?" triggers cluster phase, "which are best?" triggers evaluate)
- Session ends naturally when evaluation is complete or user says "done"

### Anti-Patterns to Avoid
- **Regex expansion:** Do NOT add more regex patterns to `index.ts` for new intents. The whole point is replacing regex with LLM understanding.
- **Auto-execution without confirmation:** Never create DB records from tool calls without user confirmation. The decompose.ts flow already does this correctly -- follow that pattern.
- **Separate intent classification call:** Do NOT make a separate LLM call just to classify intent. Use tool calling on the main conversation call -- the LLM decides whether to call a tool or respond conversationally in a single inference.
- **Topic taxonomy:** Do NOT create a fixed enum of topics. Let the LLM derive topics organically from conversation content.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Date/time parsing from NL | Custom regex date parser | chrono-node (already installed) | Handles "next Tuesday at 3pm", "end of month", relative dates. Hundreds of edge cases. |
| Intent classification | Pattern matching / regex | LLM tool calling | Natural language is infinitely varied. "I crushed it today" and "finished the API endpoints" both mean check-in. |
| Structured data extraction | Manual string parsing | LLM tool calling parameters | The model extracts goal titles, deadlines, measurements as typed parameters. |
| Message splitting for Discord | Custom chunking | Existing `splitMessage()` in commands.ts | Already handles 2000-char limit with smart newline splitting. |
| Streak/XP calculation | New streak logic | Existing `updateStreak()` + `calculateCheckinXP()` | Already handles grace days, decay, milestones. |

**Key insight:** The existing codebase already has robust implementations for all the downstream actions (check-ins, goals, reminders, streaks, XP). Phase 21 is about building a new front door (NL intent detection via tool calling) that routes to the existing back-end logic.

## Common Pitfalls

### Pitfall 1: Tool Call Hallucination
**What goes wrong:** The LLM calls a tool when the user is just having a casual conversation. "I had a great day" gets interpreted as a check-in.
**Why it happens:** Tool descriptions are too broad, or the system prompt doesn't establish clear boundaries.
**How to avoid:** Tool descriptions must be specific. Add a system prompt instruction: "Only call tools when the user is clearly expressing an intent to log, create, set, or track something. Casual conversation about past activities is NOT a check-in unless the user wants to log it." Include negative examples in the system prompt.
**Warning signs:** Users complaining that Jarvis keeps trying to create goals from casual statements.

### Pitfall 2: Confirmation Fatigue
**What goes wrong:** Every message triggers a confirmation dialog. Users get annoyed by constant "Did you mean X? yes/no" prompts.
**Why it happens:** The tool calling threshold is too low, or the confirmation message is too verbose.
**How to avoid:** Tool calling should have a clear intent signal. The confirmation should be terse and integrated into the conversational response, not a separate clinical prompt. Bad: "I detected a check-in intent. Activity: 'finished API'. Effort: null. Confirm? (yes/no)". Good: "Sounds like you crushed the API work. Want me to log that as today's check-in?"
**Warning signs:** Users responding "no" to more than 20% of confirmations.

### Pitfall 3: Context Window Bloat from Tools
**What goes wrong:** Adding 5+ tool definitions to every message inflates the system prompt, increasing cost and potentially degrading response quality.
**Why it happens:** Tool definitions are included on every call even when not needed.
**How to avoid:** Tool definitions are small (~500 tokens total for 5 tools). At $0.20/M input this costs $0.0001 per call. Not worth optimizing. Include tools on every chat call for simplicity.
**Warning signs:** Token usage per call exceeding 15K input tokens (currently ~10K without tools).

### Pitfall 4: Pending Action Expiry Race Condition
**What goes wrong:** User sends "remind me at 3pm to call X", gets confirmation, but before they respond "yes" they send another message that clears the pending action.
**Why it happens:** The pending action map doesn't handle interleaved messages properly.
**How to avoid:** The per-member processing lock (`withMemberLock`) in `chat.ts` already serializes messages. Pending actions should be checked first in the message handler, before any LLM call. If a pending action exists and the message is a confirmation/denial, handle it immediately.
**Warning signs:** Users confirming but action not executing.

### Pitfall 5: Topic Detection Over-Engineering
**What goes wrong:** Building a complex topic taxonomy with embeddings, clustering, and topic hierarchies -- then spending weeks debugging it.
**Why it happens:** JARV-03 sounds complex but the actual requirement is simple: "conversations don't bleed between topics."
**How to avoid:** Use a simple LLM-generated topic tag per message. During context assembly, bias toward recent messages of the same topic but always include the last 5 messages regardless. This handles 90% of bleeding cases. The remaining 10% are acceptable -- users can say "going back to the fitness topic" and Jarvis will naturally re-focus.
**Warning signs:** Spending more than 1 plan on topic detection infrastructure.

## Code Examples

### How the Refactored DM Handler Should Work

```typescript
// index.ts -- Refactored message handler
// Source: Existing index.ts pattern + tool calling extension

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.channel.isDMBased()) return;
  if (activeSetupUsers.has(message.author.id)) return;

  const account = await db.discordAccount.findUnique({
    where: { discordId: message.author.id },
  });
  if (!account) { /* guide to /setup */ return; }

  // Step 1: Check for pending confirmation
  const pending = pendingActions.get(account.memberId);
  if (pending) {
    if (isConfirmation(message.content)) {
      await executePendingAction(db, account.memberId, pending, message);
      pendingActions.delete(account.memberId);
      return;
    }
    if (isDenial(message.content)) {
      pendingActions.delete(account.memberId);
      await message.reply("No worries, cancelled.");
      return;
    }
    // Neither yes nor no -- clear pending and process as new message
    pendingActions.delete(account.memberId);
  }

  // Step 2: Send to chat handler with tool calling
  await message.channel.sendTyping();
  const result = await handleChatWithTools(db, account.memberId, message.content);

  if (result.toolCall) {
    // Tool was called -- present confirmation
    const confirmation = buildConfirmation(result.toolCall.name, result.toolCall.params);
    pendingActions.set(account.memberId, {
      tool: result.toolCall.name,
      params: result.toolCall.params,
      confirmMessage: confirmation,
      createdAt: Date.now(),
    });
    // Include the LLM's conversational framing + the confirmation
    const response = result.conversationalResponse
      ? `${result.conversationalResponse}\n\n${confirmation}`
      : confirmation;
    await message.reply(response);
  } else {
    // Regular conversation -- no tool called
    const chunks = splitMessage(result.response);
    for (const chunk of chunks) {
      await message.reply(chunk);
    }
  }
});
```

### Executing a Confirmed Action

```typescript
// intent-executor.ts -- Execute confirmed tool call
// Source: Existing checkin/commands.ts, goals/commands.ts patterns

async function executePendingAction(
  db: ExtendedPrismaClient,
  memberId: string,
  action: PendingAction,
  message: Message,
): Promise<void> {
  switch (action.tool) {
    case 'log_checkin': {
      const { activity, effort } = action.params as { activity: string; effort?: number };
      // Reuse existing check-in logic: extract categories, create record, update streak, award XP
      const { categories } = await extractCategories(db, memberId, activity);
      const schedule = await db.memberSchedule.findUnique({ where: { memberId } });
      const timezone = schedule?.timezone ?? 'UTC';
      // ... count today's check-ins, create CheckIn, updateStreak, calculateCheckinXP ...
      await message.reply(`Logged: "${activity}" [${categories.join(', ')}]. +${xp} XP`);
      break;
    }
    case 'create_goal': {
      const { title, deadline, target, unit } = action.params as {
        title: string; deadline: string; target?: number; unit?: string;
      };
      // Reuse parseDeadline from goals/commands.ts
      const parsedDeadline = parseDeadline(deadline);
      const goalType = target && unit ? 'MEASURABLE' : 'FREETEXT';
      await db.goal.create({
        data: { memberId, title, description: title, type: goalType,
                targetValue: target ?? null, unit: unit ?? null, deadline: parsedDeadline },
      });
      await message.reply(`Goal set: "${title}" -- due ${formatDeadline(parsedDeadline)}`);
      break;
    }
    // ... similar for set_reminder, track_commitment
  }
}
```

### System Prompt Extension for Tool Awareness

```typescript
// personality.ts -- Additional instructions for tool-aware Jarvis

const TOOL_AWARENESS_PROMPT = `
You have access to tools for logging check-ins, creating goals, setting reminders,
tracking commitments, and starting brainstorming sessions. ONLY call these tools when
the user is clearly expressing an intent to:
- LOG what they accomplished (check-in)
- SET or CREATE a new goal
- SET a reminder for a specific time
- COMMIT to doing something by a deadline
- BRAINSTORM or explore ideas on a topic

Do NOT call tools for:
- Casual conversation about past or future activities
- Questions about their goals, reminders, or progress
- Discussing strategies or advice
- Expressing feelings or venting

When you do call a tool, also provide a brief conversational response that acknowledges
what the user said. The system will append a confirmation prompt automatically.

TOPIC AWARENESS:
Classify each conversation exchange with a topic tag. When the user switches topics,
acknowledge the switch naturally. Do not bring up information from unrelated topics
unless the user explicitly connects them.
`;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Regex intent detection | LLM tool calling | 2024-2025 (mainstream) | Handles paraphrasing, ambiguity, multi-intent. No brittle pattern maintenance. |
| Separate intent classifier + executor | Single call with tool calling | 2025 | One LLM call instead of two. Lower latency, lower cost. |
| JSON schema output for actions | Native tool calling | 2025 | More reliable -- models are specifically trained for tool use. Better error handling. |
| Fixed conversation context | Topic-aware context filtering | 2025 | Prevents context bleeding. Higher quality responses in multi-topic conversations. |

**Deprecated/outdated:**
- Regex-based intent detection for more than 2-3 intents: brittle, high maintenance, cannot handle paraphrasing
- Separate intent classification LLM call before action: unnecessary latency and cost when tool calling handles both

## Open Questions

1. **Tool calling with Grok 4.1 Fast via existing OpenRouter SDK version (^0.9.11)**
   - What we know: Grok 4.1 Fast supports tool calling. OpenRouter standardizes the tool calling interface. The SDK docs show tool calling API.
   - What's unclear: Whether SDK version 0.9.11 supports the `tools` parameter in `chat.send()` -- the docs reference newer SDK patterns like `callModel()` with `tool()` helper.
   - Recommendation: Test adding `tools` to the existing `chat.send()` params object. The raw API format (`tools: [{ type: 'function', function: {...} }]`) should work regardless of SDK version since it is a pass-through to the OpenRouter API. If the SDK type does not include `tools`, cast the params or update the SDK.

2. **Pending action persistence across bot restarts**
   - What we know: In-memory pending action map is lost on restart.
   - What's unclear: Whether this matters in practice (5-minute expiry, bot rarely restarts mid-conversation).
   - Recommendation: Start with in-memory. If it causes issues, add a `PendingAction` table. Low priority.

3. **Topic classification token cost**
   - What we know: Adding topic classification to the system prompt adds ~50 tokens.
   - What's unclear: Whether the LLM will reliably include topic tags in its response without structured output enforcement.
   - Recommendation: Do NOT use structured output for topic tagging. Instead, extract the topic from the conversation content after the fact -- the LLM response already demonstrates topic understanding. Store the topic tag on message save by running a lightweight classification on the message pair.

## DB Schema Changes

### New: Commitment Model

```prisma
model Commitment {
  id          String           @id @default(cuid())
  memberId    String
  title       String           // What they committed to
  deadline    DateTime         // When they said they'd do it by
  status      CommitmentStatus @default(ACTIVE)
  sourceMessageId String?      // ConversationMessage ID where commitment was detected
  createdAt   DateTime         @default(now())
  completedAt DateTime?

  member Member @relation(fields: [memberId], references: [id], onDelete: Cascade)

  @@index([memberId, status])
  @@index([deadline, status])
}

enum CommitmentStatus {
  ACTIVE
  COMPLETED
  MISSED
  CANCELLED
}
```

### Modified: ConversationMessage

```prisma
model ConversationMessage {
  // ... existing fields ...
  topic  String?  // LLM-derived topic tag (e.g., "saas-project", "fitness", "general")
}
```

## Sources

### Primary (HIGH confidence)
- [OpenRouter Tool Calling Documentation](https://openrouter.ai/docs/guides/features/tool-calling) - Full tool calling flow, request/response format, TypeScript examples
- [OpenRouter TypeScript SDK Tools](https://openrouter.ai/docs/sdks/typescript/call-model/tools) - SDK-level tool calling API with Zod schemas
- [Grok 4.1 Fast Model Card](https://openrouter.ai/x-ai/grok-4.1-fast) - Confirmed tool calling support, 2M context, $0.20/$0.50 pricing
- Existing codebase: `ai-client.ts`, `chat.ts`, `memory.ts`, `personality.ts`, `parser.ts`, `decompose.ts` - Current architecture patterns

### Secondary (MEDIUM confidence)
- [Intent Detection using LLM](https://dswithmac.com/posts/intent-detection/) - Zod schema + structured output pattern for intent classification
- [Context Window Management Strategies](https://www.getmaxim.ai/articles/context-window-management-strategies-for-long-context-ai-agents-and-chatbots/) - Topic-aware context filtering approaches
- [LLM Function Calling Guide](https://martinfowler.com/articles/function-call-LLM.html) - Martin Fowler's function calling architecture patterns

### Tertiary (LOW confidence)
- [Intent Classification Techniques 2026](https://labelyourdata.com/articles/machine-learning/intent-classification) - General NLP intent classification landscape (not specific to this use case)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Uses only existing dependencies, no new packages needed
- Architecture: HIGH - Tool calling is the standard pattern for LLM-powered action execution, Grok 4.1 Fast supports it natively, codebase already has the foundational patterns
- Pitfalls: HIGH - Based on analysis of existing codebase patterns and common LLM integration issues
- Cost model: HIGH - Verified pricing from OpenRouter model card, arithmetic confirms budget viability
- Topic-aware context: MEDIUM - Approach is sound but topic classification reliability needs validation in practice

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (stable domain -- tool calling is a mature pattern)
