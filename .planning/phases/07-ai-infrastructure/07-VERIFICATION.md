---
phase: 07-ai-infrastructure
verified: 2026-03-21T00:00:00Z
status: passed
score: 9/9 must-haves verified
re_verification: false
---

# Phase 7: AI Infrastructure Verification Report

**Phase Goal:** All AI interactions flow through a single, cost-tracked, budget-aware client with tiered memory and configurable models
**Verified:** 2026-03-21
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every AI call can route through a single shared client with token tracking | VERIFIED | `callAI()` in `src/shared/ai-client.ts` handles budget check, model routing, and fire-and-forget `db.tokenUsage.create()` on every successful call |
| 2 | A member who exceeds their daily budget receives template-based responses instead of AI-generated ones | VERIFIED | `checkBudget()` returns `false` when `used >= limit`; `callAI()` returns `{ degraded: true }` and all 9 call sites check `result.degraded` with fallback responses |
| 3 | Swapping the primary model requires only a BotConfig DB update, not code changes | VERIFIED | `getModelConfig()` reads `ai_primary_model` and `ai_fallback_model` from BotConfig with 60s TTL cache; `/admin set-model` upserts BotConfig and calls `resetModelConfigCache()` for immediate effect |
| 4 | No file in the codebase imports OpenRouter directly except src/shared/ai-client.ts | VERIFIED | `grep -r "from '@openrouter/sdk'" src/modules/` returns zero results; only `src/shared/ai-client.ts` imports the SDK |
| 5 | Every AI call passes a memberId and feature tag for tracking | VERIFIED | All 9 migrated call sites pass `memberId` (real ID or `'system'`) and one of the 9 `AIFeature` values to `callAI()` |
| 6 | Each call site handles the degraded flag by using its existing fallback | VERIFIED | All 9 files check `result.degraded \|\| !result.content` and branch to pre-existing fallback strings or empty results |
| 7 | Admin can query today's and month-to-date token costs with per-member and per-feature breakdown | VERIFIED | `handleCostToday()` uses `tokenUsage.aggregate` + `tokenUsage.groupBy(['memberId'])` + `tokenUsage.groupBy(['feature'])`; `handleCostMonth()` computes daily average and projected monthly |
| 8 | Admin can hot-swap the active AI model without restart | VERIFIED | `handleAdminSetModel()` upserts BotConfig key and calls `resetModelConfigCache()` so next `callAI()` picks up the change |
| 9 | AI prompts include tiered context — recent data verbatim, weekly summaries, monthly compressed — without losing underlying DB data | VERIFIED | `assembleContext()` loads hot (7-day verbatim), warm (8-30 day weekly heuristics), cold (30+ day AI-compressed summary); protected member context never trimmed; `compressSummary()` only deletes cold-tier rows |

**Score:** 9/9 truths verified

---

## Required Artifacts

### Plan 01 Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `src/shared/ai-client.ts` | VERIFIED | 268 lines; exports `callAI` and `resetModelConfigCache`; full budget check, model routing, token tracking implementation |
| `src/shared/ai-templates.ts` | VERIFIED | 37 lines; exports `AI_BUDGET_EXCEEDED` symbol and `estimateCostUsd` function |
| `src/shared/ai-types.ts` | VERIFIED | 63 lines; exports `AIFeature`, `AICallOptions`, `AICallResult`, `MODEL_PRICING` |
| `prisma/schema.prisma` | VERIFIED | `model TokenUsage` at line 373 with all required fields and indexes; `model MemberAIBudget` at line 390; `memberAIBudget MemberAIBudget?` relation on Member model at line 43 |

### Plan 02 Artifacts (Migration)

| Artifact | Status | Details |
|----------|--------|---------|
| `src/modules/ai-assistant/chat.ts` | VERIFIED | Imports `callAI`; handles `result.degraded` with existing fallback string |
| `src/modules/ai-assistant/nudge.ts` | VERIFIED | Imports `callAI`; handles `result.degraded` with existing fallback strings |
| `src/modules/ai-assistant/memory.ts` | VERIFIED | Imports `callAI` for `compressSummary()`; no OpenRouter import |
| `src/modules/scheduler/briefs.ts` | VERIFIED | Imports `callAI`; handles `result.degraded` with `formatTemplateFallback` |
| `src/modules/scheduler/planning.ts` | VERIFIED | Imports `callAI`; handles `result.degraded` with freetext goal fallback |
| `src/modules/checkin/ai-categories.ts` | VERIFIED | Imports `callAI`; updated signature includes `db` and `memberId`; handles `result.degraded` |
| `src/modules/auto-feed/filter.ts` | VERIFIED | Imports `callAI` with `memberId: 'system'`; handles `result.degraded` |
| `src/modules/profile/ai-tags.ts` | VERIFIED | Imports `callAI`; updated signature includes `db` and `memberId`; handles `result.degraded` |
| `src/modules/resources/tagger.ts` | VERIFIED | Imports `callAI` with `memberId: 'system'`; handles `result.degraded` |

### Plan 03 Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `src/modules/ai-admin/commands.ts` | VERIFIED | 411 lines; exports `buildCostCommand` and `buildAdminSetModelCommand`; all subcommands implemented with `PermissionFlagsBits.Administrator` |
| `src/modules/ai-admin/index.ts` | VERIFIED | 35 lines; exports default Module with name `'ai-admin'`; registers `/cost` and `/admin` commands via dynamic module loader |
| `src/modules/ai-assistant/memory.ts` | VERIFIED | Contains `HOT_WINDOW_DAYS=7`, `WARM_WINDOW_DAYS=30`, `COLD_THRESHOLD_DAYS=30`; `AssembledContext` interface includes `weeklySummaries`; `buildWeeklySummaries()` uses text truncation heuristic |
| `src/deploy-commands.ts` | VERIFIED | Imports `buildCostCommand` and `buildAdminSetModelCommand`; both added to commands array at lines 123-124; Phase 7 noted in file header |

---

## Key Link Verification

### Plan 01 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/shared/ai-client.ts` | `prisma/schema.prisma` TokenUsage | `db.tokenUsage.create(...)` | WIRED | Line 239: fire-and-forget `.catch()` pattern; line 127: `db.tokenUsage.aggregate` in budget check |
| `src/shared/ai-client.ts` | BotConfig table | `db.botConfig.findUnique` for `ai_primary_model` | WIRED | Lines 83-84: parallel `findUnique` for both model keys |

### Plan 02 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| All 9 module files | `src/shared/ai-client.ts` | `import { callAI } from '../../shared/ai-client.js'` | WIRED | All 9 files import on the correct relative path and invoke `callAI(db, { ... })` |

### Plan 03 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/modules/ai-admin/commands.ts` | TokenUsage table | `db.tokenUsage.aggregate` and `db.tokenUsage.groupBy` | WIRED | Lines 75, 84, 105 (today handler); lines 179, 196 (month handler) |
| `src/modules/ai-admin/commands.ts` | `src/shared/ai-client.ts` | `resetModelConfigCache()` after model change | WIRED | Line 23 import; line 355 call inside `handleAdminSetModel` |
| `src/modules/ai-assistant/memory.ts` | ConversationMessage + ConversationSummary | tiered `conversationMessage.findMany` | WIRED | Lines 94, 181, 191, 315, 410 — hot tier, warm tier, cold tier, and export all use separate dated queries |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| INFRA-01 | 07-01, 07-02 | Centralize all OpenRouter API calls through a single shared client with per-request token tracking | SATISFIED | `callAI()` is the single entry point; zero direct OpenRouter imports in any module file; `db.tokenUsage.create()` on every successful call |
| INFRA-02 | 07-01 | Per-member daily and monthly token budgets with graceful degradation when limits hit | SATISFIED | `checkBudget()` aggregates daily usage per member with timezone-aware boundary; custom limits via `MemberAIBudget`; silent degradation returns `{ degraded: true }` |
| INFRA-03 | 07-03 | Admin /cost command showing total tokens used, per-member breakdown, and estimated cost | SATISFIED | `/cost today` and `/cost month` commands with per-member and per-feature breakdowns in Discord embeds; `/cost set-budget` for per-member overrides |
| INFRA-04 | 07-03 | Tiered memory system (hot/warm/cold) — recent data verbatim, weekly patterns summarized, historical compressed. Nothing lost from DB | SATISFIED | `assembleContext()` loads hot (7d verbatim), warm (8-30d weekly text heuristic), cold (30d+ AI-compressed); `compressSummary()` only deletes cold-tier rows after successful compression |
| INFRA-05 | 07-01 | Configurable model per use case — swappable without code changes | SATISFIED | `getModelConfig()` reads from BotConfig with 60s cache; `resetModelConfigCache()` for immediate hot-swap; `/admin set-model` command for runtime changes |

No orphaned requirements — all 5 INFRA requirements from REQUIREMENTS.md are claimed across Plans 01-03 and verified implemented.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/modules/ai-assistant/memory.ts` | 268 | `return []` | Info | Legitimate early return when warm-tier message list is empty — not a stub |

No blocker or warning anti-patterns found. The one flagged instance is correct behaviour.

---

## Human Verification Required

### 1. Budget enforcement at runtime

**Test:** Register two members, exhaust one member's daily token budget via repeated `/ask` commands (or by manually inserting TokenUsage rows exceeding 500K tokens for today), then send another `/ask` message.
**Expected:** The bot replies with "My circuits are a bit fried right now..." or the configured fallback — not an AI-generated response. No error message or indication that a token limit was hit.
**Why human:** Budget enforcement result is a Discord message behaviour that requires live bot interaction against the real database.

### 2. /admin set-model hot-swap at runtime

**Test:** Run `/admin set-model primary x-ai/grok-4.1-fast`, then immediately send `/ask hello`. Observe the response. Then run `/admin set-model primary deepseek/deepseek-v3.2` and send another `/ask hello`.
**Expected:** Both commands succeed; the model change takes effect within 60 seconds (or immediately since cache is cleared on set-model); bot responses appear without restart.
**Why human:** Requires live bot and database to verify actual model routing.

### 3. /cost today embed formatting

**Test:** After some AI usage has been recorded, run `/cost today` as an admin.
**Expected:** A Discord embed appears with Total Tokens, Estimated Cost, Top Members, and By Feature fields, all populated with real data.
**Why human:** Discord embed rendering and field population requires visual inspection in a live Discord environment.

---

## Gaps Summary

No gaps. All 9 observable truths are verified, all artifacts exist and are substantive (not stubs), all key links are wired, all 5 requirement IDs are satisfied, TypeScript compiles clean with zero errors, and no blocker anti-patterns were found.

---

_Verified: 2026-03-21_
_Verifier: Claude (gsd-verifier)_
