# Phase 7: AI Infrastructure - Research

**Researched:** 2026-03-20
**Domain:** AI client centralization, token tracking, budget enforcement, tiered memory, model routing
**Confidence:** HIGH

## Summary

Phase 7 centralizes the bot's AI interactions -- currently scattered across 8 files with 7 independent OpenRouter client instances -- into a single shared client with per-request token tracking, per-member daily budgets, admin cost visibility, tiered memory (hot/warm/cold), and hot-swappable model routing.

The existing codebase already uses `@openrouter/sdk` v0.9.11 with the `chat.send()` method. The SDK's `ChatResponse` type includes a `usage` field with `promptTokens`, `completionTokens`, and `totalTokens` -- this is the primary mechanism for token tracking. The generation ID returned in each response can also be used with the `generations.getGeneration()` SDK method to retrieve exact USD cost via `totalCost`. The BotConfig key-value store already exists in the schema and is used by leaderboard and season modules -- it will store the active model config for hot-swapping.

**Primary recommendation:** Build a centralized `src/shared/ai-client.ts` module that wraps `@openrouter/sdk`, handles model routing, captures token usage from every response, stores it in a new `TokenUsage` DB table, enforces per-member daily budgets, and provides template fallbacks when budgets are exceeded. All 8 existing call sites then import from this shared module instead of creating their own OpenRouter instances.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Default daily budget: 500K tokens per member (~$0.10/day) -- generous, only catches abuse
- Daily budget only, no monthly -- simple enough for 10-25 member scale
- Silent degradation when budget hit -- AI responses become template-based (still useful, just not AI-generated). Member doesn't see an error or message about limits. Resets at midnight member's timezone
- Admin can override per-member budgets via /cost set-budget @user -- raise for power users, lower for suspicious accounts
- /cost command shows: Today's total tokens + per-member breakdown (top users, estimated cost), Month-to-date running total, daily average, projected monthly cost, Per-feature breakdown (chat vs briefs vs content filtering vs nudges)
- No automatic spike alerts (skip #bot-log alerts for now)
- Protected data (never compressed): Member's inspirations (who they admire and why), All active goals at any level
- Compression aggressiveness: Conservative -- keep more detail in weekly summaries, higher-level monthly summaries. With Grok's 2M window, we have headroom
- Transparency: Never mention compressed memory to the member -- seamless experience
- Grok 4.1 Fast as primary for everything -- chat, briefs, nudges, content filtering, structured output
- DeepSeek V3.2 as fallback -- only used when Grok fails or is unavailable
- Hot-swappable: /admin set-model command changes the active model immediately for new requests, no restart needed
- Model config stored in BotConfig (DB), not .env -- enables runtime switching

### Claude's Discretion
- What additional data should be protected from compression (personal details, reflection insights, etc.)
- Exact token tracking implementation (per-request middleware vs response parsing)
- How tiered memory assembles prompts -- exact hot/warm/cold boundaries and summarization triggers
- /cost command embed design and layout

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INFRA-01 | Centralize all OpenRouter API calls through a single shared client with per-request token tracking | SDK `ChatResponse.usage` provides `promptTokens/completionTokens/totalTokens`. 8 files with 7 independent client instances identified. Centralize into `src/shared/ai-client.ts` |
| INFRA-02 | Per-member daily token budgets with graceful degradation (template fallback, not hard block) | New `TokenUsage` table tracks per-request tokens by member + feature. Budget check before each call, template fallback on exceed. 500K/day default, midnight reset in member's timezone |
| INFRA-03 | Admin /cost command showing total tokens used, per-member breakdown, and estimated cost | Aggregate `TokenUsage` table with DB queries. Grok pricing: $0.20/M input, $0.50/M output. DeepSeek: $0.26/M input, $0.38/M output. Show in Discord embed |
| INFRA-04 | Tiered memory system (hot/warm/cold) -- recent data verbatim, weekly patterns summarized, historical compressed | Evolve existing `ConversationSummary` into tiered system. Grok 2M context = ~500K words, so most members won't need compression for months. Build the machinery anyway as insurance |
| INFRA-05 | Configurable model per use case -- swappable without code changes | Store in `BotConfig` table (already exists). `/admin set-model` command updates DB key. AI client reads from DB on each request (with brief in-memory cache) |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @openrouter/sdk | ^0.9.11 | OpenRouter API client | Already installed and used across 8 files. `chat.send()` returns `ChatResponse` with `usage` field |
| @prisma/client | ^7.5.0 | Database ORM | Already used throughout. New `TokenUsage` and `MemberAIBudget` models needed |
| discord.js | ^14.25.1 | Discord embeds for /cost command | Already installed |
| @date-fns/tz | ^1.4.1 | Timezone-aware budget resets | Already installed, used for midnight calculations |
| zod | ^4.3.6 | Runtime validation of model config | Already installed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| winston | ^3.19.0 | Logging AI calls, budget enforcement, model routing | Already installed, consistent with codebase |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| OpenRouter SDK `usage` field | OpenRouter `/api/v1/generation` endpoint | Generation endpoint gives exact USD cost but requires async follow-up call per request -- overkill when we can compute cost from token counts + known pricing |
| In-memory token budget cache | DB-only budget checks | DB-only is simpler but adds latency per AI call. In-memory cache with periodic DB flush is better for hot path |

**Installation:**
```bash
# No new packages needed -- everything is already installed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  shared/
    ai-client.ts        # Centralized OpenRouter client (NEW)
    ai-templates.ts      # Template fallbacks for budget degradation (NEW)
    ai-types.ts          # Shared types for AI operations (NEW)
  modules/
    ai-assistant/
      chat.ts            # MODIFY: import from shared/ai-client
      memory.ts          # MODIFY: evolve into tiered memory, import from shared/ai-client
      nudge.ts           # MODIFY: import from shared/ai-client
    auto-feed/
      filter.ts          # MODIFY: import from shared/ai-client
    checkin/
      ai-categories.ts   # MODIFY: import from shared/ai-client
    profile/
      ai-tags.ts         # MODIFY: import from shared/ai-client
    resources/
      tagger.ts          # MODIFY: import from shared/ai-client
    scheduler/
      briefs.ts          # MODIFY: import from shared/ai-client
      planning.ts        # MODIFY: import from shared/ai-client
    ai-admin/             # NEW module
      commands.ts         # /cost, /admin set-model, /cost set-budget
      index.ts
```

### Pattern 1: Centralized AI Client with Token Tracking
**What:** Single exported function that wraps every OpenRouter call, captures token usage from the response, stores it, and enforces budgets.
**When to use:** Every AI interaction in the codebase.
**Example:**
```typescript
// src/shared/ai-client.ts
import { OpenRouter } from '@openrouter/sdk';
import type { ChatGenerationTokenUsage } from '@openrouter/sdk/esm/models/chatgenerationtokenusage.js';

export type AIFeature = 'chat' | 'brief' | 'nudge' | 'filter' | 'categories' | 'tags' | 'planning' | 'summary';

interface AICallOptions {
  memberId: string;
  feature: AIFeature;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  responseFormat?: object;  // For structured JSON output
}

interface AICallResult {
  content: string | null;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
  model: string;
  degraded: boolean;  // true if template fallback was used
}

// Single shared client instance
let client: OpenRouter | null = null;

function getClient(): OpenRouter { ... }

// Model config cached from BotConfig DB, refreshed periodically
let modelConfig: { primary: string; fallback: string; updatedAt: number } | null = null;

async function getModelConfig(db: ExtendedPrismaClient): Promise<{ primary: string; fallback: string }> {
  // Read from BotConfig, cache for 60 seconds
}

export async function callAI(db: ExtendedPrismaClient, options: AICallOptions): Promise<AICallResult> {
  // 1. Check daily budget for member
  // 2. If over budget, return { content: null, degraded: true }
  // 3. Get model config (primary/fallback) from DB cache
  // 4. Try primary model
  // 5. If primary fails, try fallback
  // 6. Extract usage from response.usage (ChatGenerationTokenUsage)
  // 7. Store TokenUsage record in DB
  // 8. Return result
}
```

### Pattern 2: Token Usage Storage
**What:** Dedicated DB table recording every AI call's token usage for cost visibility and budget enforcement.
**When to use:** Automatically on every AI call through the centralized client.
**Example:**
```prisma
// New Prisma model
model TokenUsage {
  id               String   @id @default(cuid())
  memberId         String
  feature          String   // 'chat', 'brief', 'nudge', 'filter', etc.
  model            String   // 'x-ai/grok-4.1-fast', 'deepseek/deepseek-v3.2'
  promptTokens     Int
  completionTokens Int
  totalTokens      Int
  estimatedCostUsd Float    // Computed from tokens * model pricing
  createdAt        DateTime @default(now())

  @@index([memberId, createdAt])
  @@index([createdAt])
  @@index([feature])
}

// Per-member budget override (null = use default 500K)
model MemberAIBudget {
  id              String @id @default(cuid())
  memberId        String @unique
  dailyTokenLimit Int    // Override for this member

  member Member @relation(fields: [memberId], references: [id], onDelete: Cascade)
}
```

### Pattern 3: Budget Enforcement with Silent Degradation
**What:** Before each AI call, check if the member has exceeded their daily token budget. If yes, the caller gets `{ content: null, degraded: true }` and uses a template fallback instead.
**When to use:** Built into the centralized `callAI()` function.
**Example:**
```typescript
// Budget check: aggregate today's usage for this member
async function checkBudget(db: ExtendedPrismaClient, memberId: string): Promise<boolean> {
  const schedule = await db.memberSchedule.findUnique({ where: { memberId } });
  const timezone = schedule?.timezone ?? 'UTC';
  const todayStart = startOfDay(new TZDate(new Date(), timezone));

  const todayUsage = await db.tokenUsage.aggregate({
    _sum: { totalTokens: true },
    where: { memberId, createdAt: { gte: todayStart } },
  });

  const budget = await db.memberAIBudget.findUnique({ where: { memberId } });
  const limit = budget?.dailyTokenLimit ?? 500_000;

  return (todayUsage._sum.totalTokens ?? 0) < limit;
}
```

### Pattern 4: Model Config Hot-Swap via BotConfig
**What:** Store active model identifiers in the existing `BotConfig` key-value table. Read on each request (with short-lived cache). `/admin set-model` writes new values.
**When to use:** Model routing decisions in the centralized client.
**Example:**
```typescript
// BotConfig keys:
// 'ai_primary_model' -> 'x-ai/grok-4.1-fast'
// 'ai_fallback_model' -> 'deepseek/deepseek-v3.2'

// Admin command handler:
await db.botConfig.upsert({
  where: { key: 'ai_primary_model' },
  create: { key: 'ai_primary_model', value: newModel },
  update: { value: newModel },
});

// Clear cached config so next AI call picks up the change
resetModelConfigCache();
```

### Pattern 5: Tiered Memory Assembly
**What:** Assemble AI prompts with context tiers -- hot (verbatim recent data), warm (weekly summaries), cold (monthly compressed). Protected data (inspirations, active goals) is always included verbatim regardless of tier.
**When to use:** The `assembleContext()` function in memory.ts when building the messages array for chat.
**Example:**
```typescript
interface TieredContext {
  // Always included verbatim (protected)
  inspirations: string[];      // Never compressed
  activeGoals: string[];       // Never compressed
  personalDetails: string[];   // Reflection breakthroughs, key personal info

  // Hot: last 7 days of data, verbatim
  recentMessages: Array<{ role: string; content: string }>;
  recentCheckIns: string[];

  // Warm: weekly summaries (last 30 days, excluding hot)
  weeklySummaries: string[];

  // Cold: monthly compressed (everything older)
  monthlySummary: string | null;
}
```

### Anti-Patterns to Avoid
- **Multiple OpenRouter client instances:** The current pattern of `let openrouterClient: OpenRouter | null = null` repeated in 7+ files creates untracked calls. All must route through one place.
- **Hardcoded model strings:** `'deepseek/deepseek-v3.2'` appears as a literal in 8 files. Must come from config.
- **Token estimation via `text.length / 4`:** The existing `estimateTokens()` function in memory.ts is a rough approximation. Real token counts from `response.usage` are now available from the SDK -- use those for cost tracking.
- **Blocking budget checks with no fallback:** Never let a budget check cause the user-facing feature to fail. Always have template fallbacks ready.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token counting | Character-based estimation (`text.length / 4`) | SDK's `response.usage.promptTokens` / `completionTokens` | SDK returns actual model tokenizer counts -- accurate for billing |
| Cost estimation | Manual price calculation for each model | Model pricing lookup table + token counts | Pricing changes; isolate it to one config object |
| OpenRouter client management | Per-file lazy singleton pattern | Single shared module export | Consistency, single point of control |
| Template fallback generation | Ad-hoc fallback strings in each file | Centralized template fallback module | Each feature already has fallbacks scattered across the codebase -- consolidate |

**Key insight:** The existing codebase already has fallback patterns in every AI call site (e.g., `fallbackResult()` in ai-categories.ts, `formatTemplateFallback()` in briefs.ts, hardcoded strings in nudge.ts). These existing fallbacks become the template degradation path -- no new fallback logic needed, just a centralized trigger.

## Common Pitfalls

### Pitfall 1: Race Condition on Budget Checks
**What goes wrong:** Two simultaneous AI calls for the same member both check budget, both pass, both consume tokens, member exceeds budget by 2x.
**Why it happens:** Budget check and token recording are not atomic.
**How to avoid:** Use the existing per-member lock pattern (`withMemberLock` in chat.ts) for budget-sensitive features. For non-critical features (content filtering, tagging), allow slight budget overshoot -- it's not billing, just abuse prevention.
**Warning signs:** Budget breaches significantly above the 500K limit.

### Pitfall 2: Model Config Cache Staleness
**What goes wrong:** Admin runs `/admin set-model` but the next 60 seconds of AI calls still use the old model.
**Why it happens:** In-memory cache of BotConfig model values.
**How to avoid:** Keep cache TTL short (30-60 seconds). The `/admin set-model` command can also explicitly clear the cache. This is acceptable since model switching is rare and a 60-second delay is fine.
**Warning signs:** Admin reports model didn't change immediately.

### Pitfall 3: Token Usage Table Growth
**What goes wrong:** TokenUsage table grows unbounded -- every AI call creates a row.
**Why it happens:** No archival strategy.
**How to avoid:** Add a `createdAt` index and plan for monthly archival/pruning of rows older than 90 days. At 10-25 members with ~50 AI calls/day each, that's ~1,250 rows/day = ~37K/month -- very manageable for PostgreSQL. No immediate concern, but index properly.
**Warning signs:** Slow /cost queries after months of usage.

### Pitfall 4: Breaking Existing Fallback Behavior
**What goes wrong:** Centralized client returns `{ degraded: true }` but calling code doesn't handle it, resulting in "null" being sent to Discord.
**Why it happens:** Incomplete migration of call sites.
**How to avoid:** Each call site must check `result.degraded` and use its existing fallback. The centralized client doesn't generate fallbacks -- it signals degradation. The caller is responsible for fallback content.
**Warning signs:** Members see "null" or empty messages from the bot.

### Pitfall 5: Timezone-Aware Budget Reset Complexity
**What goes wrong:** Budget resets use UTC midnight instead of member's local midnight, causing confusion.
**Why it happens:** Using `startOfDay(new Date())` instead of timezone-aware date.
**How to avoid:** Already solved in the codebase -- use `startOfDay(new TZDate(new Date(), timezone))` consistently. The pattern exists in chat.ts and briefs.ts.
**Warning signs:** Members in UTC+ timezones see budget reset at unexpected times.

### Pitfall 6: OpenRouter SDK Response Type Mismatch
**What goes wrong:** `response.usage` is undefined, code crashes trying to access `.promptTokens`.
**Why it happens:** The `usage` field is typed as optional (`ChatGenerationTokenUsage | undefined`) in the SDK. Some models or error responses may not include it.
**How to avoid:** Always null-check `response.usage` before accessing token counts. If missing, log a warning and skip token tracking for that call (don't block the response).
**Warning signs:** Uncaught TypeError on `.promptTokens`.

## Code Examples

### Extracting Token Usage from SDK Response
```typescript
// Source: @openrouter/sdk v0.9.11 ChatResponse type definition
// File: node_modules/@openrouter/sdk/esm/models/chatresponse.d.ts
const completion = await client.chat.send({
  chatGenerationParams: {
    model: 'x-ai/grok-4.1-fast',
    messages,
    stream: false,
  },
});

// ChatResponse.usage is optional -- always null-check
if (completion.usage) {
  const { promptTokens, completionTokens, totalTokens } = completion.usage;
  // Store in TokenUsage table
}
```

### Cost Calculation from Token Counts
```typescript
// Model pricing (as of March 2026, from OpenRouter)
const MODEL_PRICING: Record<string, { inputPerM: number; outputPerM: number }> = {
  'x-ai/grok-4.1-fast': { inputPerM: 0.20, outputPerM: 0.50 },
  'deepseek/deepseek-v3.2': { inputPerM: 0.26, outputPerM: 0.38 },
};

function estimateCostUsd(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;
  return (promptTokens / 1_000_000) * pricing.inputPerM +
         (completionTokens / 1_000_000) * pricing.outputPerM;
}
```

### BotConfig Read Pattern (Existing Codebase)
```typescript
// Source: src/modules/leaderboard/channel-sync.ts
// Already established pattern for BotConfig usage
const config = await db.botConfig.findUnique({ where: { key: 'ai_primary_model' } });
const primaryModel = config?.value ?? 'x-ai/grok-4.1-fast';
```

### Existing Fallback Patterns to Preserve
```typescript
// ai-categories.ts: returns { categories: ['general'], goalHints: [] }
// briefs.ts: calls formatTemplateFallback(template)
// nudge.ts: uses hardcoded nudge string with member name
// ai-tags.ts: calls fallbackExtraction(rawAnswers)
// filter.ts: returns empty array (no unfiltered content)
// planning.ts: returns [{ title: text, type: 'freetext' }]
// chat.ts: returns "My circuits are a bit fried right now..."
// resources/tagger.ts: returns { topic: 'Resource', tags: [] }
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| DeepSeek V3.2 as primary (164K context) | Grok 4.1 Fast as primary (2M context) | Phase 7 decision | 12x context window increase, most members' full history fits without compression |
| `estimateTokens(text.length / 4)` | SDK `response.usage.promptTokens` real counts | Available in @openrouter/sdk | Accurate tracking replaces estimation |
| Per-file OpenRouter client singletons | Single centralized client | Phase 7 | All tracking, routing, budget enforcement in one place |
| Hardcoded model strings | DB-stored configurable models | Phase 7 | Runtime model switching without restarts |

**Deprecated/outdated:**
- `qwen/qwen3.5-plus-02-15` as fallback model (currently in chat.ts) -- replaced by `deepseek/deepseek-v3.2` as fallback per user decision
- `estimateTokens()` function in memory.ts -- still useful for pre-call budget estimation but should not be used for cost tracking

## Open Questions

1. **Token budget for system-level calls (no member context)**
   - What we know: Content filtering (`auto-feed/filter.ts`) operates at the system level, not tied to a specific member
   - What's unclear: Should these tokens count against any member's budget?
   - Recommendation: Track as feature='filter' with a synthetic memberId='system'. Don't count against any member's budget, but show in admin /cost totals.

2. **Memory compression trigger thresholds**
   - What we know: Grok 4.1 Fast has 2M context window. At ~4 chars/token, that's ~500K words. Most members won't hit this for months.
   - What's unclear: Exact thresholds for when to trigger warm/cold compression.
   - Recommendation: Hot = last 7 days verbatim. Warm = 8-30 days, weekly summaries. Cold = 30+ days, monthly summary. With 2M context, the warm/cold tiers are insurance and can be tuned later. Use conservative compression (keep more detail).

3. **Protected data enumeration beyond inspirations and goals**
   - What we know: User said "inspirations" and "active goals" are always protected. Claude has discretion for additional items.
   - What's unclear: Exact list of protected fields.
   - Recommendation: Also protect: display name, work style, current focus, reflection breakthroughs (when Phase 12 adds them), timezone, accountability level. These are identity-defining and should never be summarized away.

## Sources

### Primary (HIGH confidence)
- `@openrouter/sdk` v0.9.11 type definitions -- `ChatResponse`, `ChatGenerationTokenUsage`, `GetGenerationData` types inspected directly from installed `node_modules`
- Existing codebase -- 8 files with OpenRouter calls identified and analyzed
- Prisma schema -- existing `BotConfig`, `ConversationMessage`, `ConversationSummary` models reviewed

### Secondary (MEDIUM confidence)
- [OpenRouter API Reference](https://openrouter.ai/docs/api/reference/overview) -- response format and generation endpoint
- [Grok 4.1 Fast on OpenRouter](https://openrouter.ai/x-ai/grok-4.1-fast) -- $0.20/M input, $0.50/M output, 2M context
- [DeepSeek V3.2 on OpenRouter](https://openrouter.ai/deepseek/deepseek-v3.2) -- $0.26/M input, $0.38/M output, 164K context
- [OpenRouter TypeScript SDK docs](https://openrouter.ai/docs/sdks/typescript) -- `chat.send()` and `callModel()` patterns

### Tertiary (LOW confidence)
- None -- all findings verified against installed SDK types or official docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new packages needed, all tools already in use
- Architecture: HIGH -- clear pattern of centralization, existing codebase provides migration map
- Pitfalls: HIGH -- identified from actual codebase patterns and SDK type analysis
- Tiered memory: MEDIUM -- thresholds are discretionary, Grok's 2M context means compression rarely triggers

**Research date:** 2026-03-20
**Valid until:** 2026-04-20 (stable domain -- OpenRouter SDK, Prisma patterns well-established)
