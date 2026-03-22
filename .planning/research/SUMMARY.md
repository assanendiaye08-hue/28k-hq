# Project Research Summary

**Project:** Discord Hustler — Jarvis Coach Evolution (v3.0)
**Domain:** Conversational AI productivity coaching bot on Discord
**Researched:** 2026-03-22
**Confidence:** HIGH (stack, architecture from direct codebase analysis); MEDIUM (features, pitfalls — no web search available)

## Executive Summary

v3.0 transforms Jarvis from a slash-command-driven assistant into a proactive conversational coach. The core shift: members stop typing `/checkin title:...` and start saying "I finished the API endpoints today." Every interaction becomes a conversation — Jarvis detects intent, asks clarifying questions, confirms before persisting, and maintains context across morning briefs, reflections, nudges, and weekly recaps. The architecture to support this already exists in the codebase. No new npm dependencies are required. The work is extension and refactoring, not greenfield. Estimated: 5 new files, modifications to 8 existing modules, 2 Prisma migrations, ~1,165 LOC added.

The recommended build order is three phases: clean up legacy code first (remove timer module, remove private channel system), then lay the coaching foundation (context improvements, personality update, conversation continuity for all proactive outreach), then add natural language action handlers and per-user coaching settings. This order is dependency-driven — you cannot build correct coaching conversations on a personality prompt that still references slash commands and timer flows. The removal phase is also risk-free: reducing surface area before adding new complexity is always the right call.

The primary risk is trust erosion from intent misclassification. When Jarvis silently logs a check-in the member did not intend, or confirms a goal update that failed, members stop trusting the system within days. The mitigation is non-negotiable: every state-changing action requires a confirmation loop before any database write, and the `extractAction() → executeAction() → generateConfirmation(result)` pipeline must be built before any action-taking conversational handler ships. A second major risk is notification fatigue — morning briefs, nudges, reflections, and recaps added together equal 3-4 unsolicited DMs per day per member. A global daily outreach budget (max 2-3 messages/member/day across all feature types) must be designed as a single system, not bolted on per-feature.

---

## Key Findings

### Recommended Stack

The existing stack requires zero new npm packages for v3.0. Every capability maps to an already-installed dependency: `discord.js` for DM handling, `@openrouter/sdk` for AI calls via the centralized `callAI()` function, `node-cron` for proactive scheduling via `SchedulerManager`, `Prisma 7` for persistence. The only infrastructure change is two Prisma migrations: add a `topic` column to `ConversationMessage` for topic-aware context filtering, and add a `CoachingConfig` model (or extend `MemberSchedule`) with coaching feature toggles and schedule fields.

See `.planning/research/STACK.md` for full module-by-module analysis and "what NOT to add" rationale.

**Core technologies:**
- `discord.js ^14.25.1` — DM delivery, typing indicators — unchanged; already handles all message events
- `@openrouter/sdk ^0.9.11` via `callAI()` — all AI calls, budget enforcement, model routing — add new feature tags only; the client itself needs no changes
- `node-cron ^4.2.1` via `SchedulerManager` — per-member proactive outreach — extend with weekly recap, EOD reflection, goal deadline nudge task types
- `Prisma 7 ^7.5.0` — all persistence — two migrations required (topic field on ConversationMessage + CoachingConfig model)

**Explicit "do not add" decisions:**
- No LangChain or LangGraph — `callAI()` already handles everything at this scale
- No vector database (pgvector, Pinecone, ChromaDB) — topic column + WHERE clause handles context filtering for 10-25 users; PostgreSQL handles it trivially
- No Redis — in-memory `Map<>` patterns already in use; the scale does not justify another service to operate
- No separate NLP service — Grok 4.1 Fast via regex-first + AI fallback handles intent classification better than any local NLP library at this scale

### Expected Features

The research identified three tiers. Per-user coaching config is the blocking dependency — it must ship before any proactive feature goes live. Without it, there is no safe way to control outreach frequency per member.

See `.planning/research/FEATURES.md` for full analysis including competitor comparison and dependency graph.

**Must have (v3.0 table stakes):**
- Per-user coaching configuration — accountability level tiers (light/medium/heavy) that bundle all settings; this is the foundation everything else depends on
- Conversational goal setting — detect "I want to read more" in DMs, ask clarifying questions, create Goal records without slash commands
- Enhanced morning briefs — shift from embed delivery to conversational plain-text DM that invites a reply; reference yesterday's EOD priority if set
- End-of-day reflection with next-day planning — extend existing reflection flow to capture "what's your #1 priority tomorrow?", feed that into the next morning brief
- Smart nudges: stale goals + broken streaks — two new triggers added to existing `nudge.ts` infrastructure; respect per-user coaching config
- Weekly goal review enhancement — add keep/adjust/drop step per goal to the existing Sunday planning session
- Remove bot timer module + DMs only migration — cleanup tasks already planned in PROJECT.md; reduces maintenance surface

**Should have (v3.1 differentiators):**
- Session summaries from desktop timer — when a timer session completes, Jarvis DMs "45 min deep work on API — want to log progress?"
- Community momentum nudges — "3 people are locked in voice right now" social proof nudge
- Quiet period detection enhancement — track last DM interaction (not just check-in), offer to pause all coaching temporarily

**Defer (v3.2+):**
- Pattern-based coaching insights — high AI cost per analysis; validate demand first before committing
- Adaptive coaching cadence — needs 2+ weeks of delivery tracking data before it can work
- Goal velocity tracking and coaching effectiveness scoring

**Anti-features to reject outright:**
- Automated goal creation from check-ins — removes intentionality; Jarvis should offer, never auto-create
- Aggressive streak recovery mechanics — cheapens the mechanic; reset cleanly, reframe forward, never let members game it
- AI-generated goals — removes ownership; Jarvis refines and decomposes goals the member proposes, never originates them
- Calendar/Google integration — scope creep; conversation memory handles routine context without API complexity

### Architecture Approach

The existing module architecture does not require restructuring. The v3.0 build modifies 5 existing modules, removes 1 module (timer), and adds 1 new module (coaching-settings). The single most impactful architectural change is making all bot-initiated outreach part of the conversation history — currently only nudges are stored as conversation messages (with `[NUDGE]` marker), which means Jarvis has no context when a member replies to a morning brief. Every proactive message must be stored immediately after delivery using the store-then-deliver pattern.

See `.planning/research/ARCHITECTURE.md` for component boundaries, data flow diagrams, and the complete removal plan for the timer module.

**Major components:**
1. **Intent Router** (`ai-assistant/intent-router.ts`, new file) — regex-first classification of 5 intent types: reminder, decomposition, check-in, goal-update, settings. Falls through to chat for anything ambiguous. No AI calls for classification — keeps latency under 1ms.
2. **Coaching Settings Module** (`coaching-settings/`, new module) — `CoachingConfig` Prisma model with feature toggles, intensity tiers (light/medium/heavy), schedule overrides. Natural language settings changes route here, update DB, emit `scheduleUpdated` event so SchedulerManager rebuilds cron tasks.
3. **Modified Scheduler** (`scheduler/manager.ts`) — add weekly recap, EOD reflection, and goal deadline nudge task types. All proactive delivery uses store-then-deliver: message is stored as conversation message with type marker (`[BRIEF]`, `[REFLECTION]`, `[RECAP]`) after successful delivery.
4. **Modified Memory** (`ai-assistant/memory.ts`) — add topic column query for context filtering, add timer session query in `assembleContext()` (reads desktop timer data), add `storeOutreach()` helper.
5. **Modified Personality** (`ai-assistant/personality.ts`) — update `CHARACTER_PROMPT` for coaching-first posture with intensity-aware instructions, remove all slash command references except `/reminders`, `/goals`, `/leaderboard`.

**Key patterns to follow:**
- Store-Then-Deliver: every proactive message stored as conversation message so Jarvis has continuity when the member replies
- Natural Language Action with Confirmation: detect intent via regex → confirm ("Logging that as a check-in — sound right?") → execute action → generate response that includes the actual result — never generate a "Done!" before the DB write succeeds
- Coaching-Aware System Prompt: `buildSystemPrompt()` reads `CoachingConfig` intensity and injects the matching instruction bundle (light/medium/heavy)

**Build order (validated by dependency analysis):**
- Phase A: Remove timer module, private channels, simplify delivery to DM-only
- Phase B: Coaching foundation — timer context in memory, personality update, intent router, conversation continuity for all outreach
- Phase C: Natural language action handlers + coaching-settings module + weekly recap

### Critical Pitfalls

See `.planning/research/PITFALLS.md` for recovery strategies and a pitfall-to-phase mapping table.

1. **Intent Detection Regression** — a 10% misclassification rate on state-changing actions (check-in, goal update) erodes trust faster than any other bug. Prevention: confirmation loop before every database write; never auto-persist from a single ambiguous message. This is a Phase 1 design requirement, not a v3.1 refinement.

2. **Proactive Message Fatigue** — morning brief + nudge + reflection + recap = 3-4 unsolicited DMs per day. Prevention: global daily outreach budget per member (max 2-3 messages/day across all feature types, not per-feature caps); priority queue (brief > goal deadline > nudge > reflection > recap); if member chatted with Jarvis in last 2 hours, skip the scheduled proactive message.

3. **Stale Context Hallucination** — warm/cold tier summaries are historical snapshots; when a goal is completed or abandoned, the compressed summary still references it as active. Prevention: system prompt instruction "CURRENT STATS is always authoritative"; inject system messages on goal state transitions; cross-reference summaries against live goals during compression.

4. **Action Execution Gap** — `chat.ts` is a pure conversation pipeline with no database mutation capability. Adding "conversational goal update" without an execution layer means Jarvis says "Done!" but nothing changed. Prevention: build `extractAction() → executeAction() → generateConfirmation(result)` pipeline before any action-taking handler ships. This is the most dangerous single mistake available in this build.

5. **Cost Explosion from Conversational Volume** — slash commands rate-limit themselves via friction; conversational AI invites 10x more messages. At 25 members doing 20-30 messages/day, cost could reach ~$10/day vs. the $75/month target. Prevention: lightweight context routing for simple messages, cache `buildSystemPrompt()` results (currently 7 DB queries per call), consider DeepSeek V3.2 as primary for simple turns. Design this before shipping conversational mode.

---

## Implications for Roadmap

Based on combined research, three phases are suggested. The architecture research provided a concrete build order (Phase A/B/C) that maps directly to roadmap phases. The dependency ordering is strict — do not reorder.

### Phase 1: Clean Slate + Coaching Foundation

**Rationale:** Removal is risk-free and must precede new features. Cannot build correct coaching conversations on a codebase that still imports timer modules and routes private channel messages. Coaching foundation (personality, context, conversation continuity) is a prerequisite for every natural language feature — if the system prompt still references slash commands, every conversational handler built on top of it will have tone inconsistency baked in.

**Delivers:**
- Working bot with timer module (8 files, ~380 LOC) and private channel logic removed
- Updated Jarvis personality with coaching-first posture, consistent across all features
- Intent router (`intent-router.ts`) extracted from `index.ts`, structured for action handlers
- All proactive outreach stored as conversation messages (conversation continuity when members reply to briefs, reflections, recaps)
- Timer session data from desktop app surfaced in Jarvis context via `assembleContext()` query
- Topic-aware context filtering (topic column migration + topic-tagged message storage and retrieval)

**Addresses from FEATURES.md:** DMs-only migration, timer module removal, enhanced morning briefs (conversation storage prerequisite)

**Pitfalls to prevent here:** Coaching tone uncanny valley (lock CHARACTER_PROMPT before writing any new feature prompts), stale context hallucination (add "CURRENT STATS is authoritative" instruction + goal state transition system messages), cost explosion (design lightweight context routing and system prompt caching before any conversational volume lands)

### Phase 2: Natural Language Actions + Coaching Settings

**Rationale:** With the foundation in place, add the interaction layer. The intent router (Phase 1) is the prerequisite for action handlers. Coaching settings must come before proactive features — without knowing which features a member has enabled, it is not safe to send proactive messages at any frequency. The action execution pipeline must be built and verified before any "do X for me" conversational handler goes live.

**Delivers:**
- `CoachingConfig` Prisma model + migration (feature toggles, intensity tiers, schedule overrides)
- `coaching-settings/` module with natural language settings changes that persist across bot restarts
- Conversational check-in handler with `extractAction() → executeAction() → generateConfirmation(result)` pipeline and XP integration
- Conversational goal update handler with same validation rules as `/goals update`
- Global daily outreach budget enforcer (single system, not per-feature caps), priority queue logic
- Per-user coaching configuration exposed via natural language DM ("Jarvis, ease up on the nudges")

**Addresses from FEATURES.md:** Per-user coaching configuration (P1), conversational goal setting (P1), smart nudges — stale goals + broken streaks (P1)

**Pitfalls to prevent here:** Intent detection regression (confirmation loop on every state-changing action, target >95% correct classification before shipping), action execution gap (pipeline built and end-to-end tested before any action handler goes live), settings explosion (tier bundles only; individual overrides as JSON blob, not column proliferation), DM discoverability failure (Jarvis initiates first DM to new members; onboarding redesign alongside channel removal from Phase 1)

### Phase 3: Proactive Coaching Routines

**Rationale:** Proactive features depend on coaching settings (Phase 2) to know what each member has enabled. Building them last means they inherit the global outreach budget enforcer, the coaching-aware system prompt, and conversation continuity — all outputs of Phases 1 and 2. Weekly recap reuses the existing `recap/generator.ts` pattern with a shorter time window, making it the lowest-risk new proactive feature.

**Delivers:**
- End-of-day reflection with next-day planning (extend `reflection/flow.ts`, add tomorrow's priority DB field, reference in next morning brief)
- Weekly goal review enhancement (add keep/adjust/drop step to Sunday planning session)
- Weekly recap task type in SchedulerManager (new file following `recap/generator.ts` pattern, ~200 LOC)
- EOD reflection DM generator (new file following `briefs.ts` pattern, ~150 LOC)
- Goal deadline nudge (new file following `nudge.ts` pattern, ~100 LOC)
- All proactive messages staggered across 30-minute window to avoid Discord DM rate limits

**Addresses from FEATURES.md:** End-of-day reflection + next-day planning (P1), weekly goal review (P1), all remaining P1 proactive features

**Pitfalls to prevent here:** Proactive message fatigue (global outreach budget from Phase 2 enforced here; verify no member receives >3 proactive messages/day across all feature types combined), bot restart recovery (verify all cron tasks re-register via `rebuildAll()` after PM2 restart; verify "stop morning briefs" NL opt-out persists across restarts)

### Phase Ordering Rationale

- **Removal before addition:** Timer module (8 files) is intertwined with the intent detection cascade in `index.ts`. Removing it before building new intent handlers prevents building on top of code about to be deleted.
- **Personality before actions:** Every action handler generates AI responses. If CHARACTER_PROMPT still says "sharp personal operator with hustler energy" while handlers expect a coaching posture, tone inconsistency is baked in from day one across all features.
- **Settings before proactive:** The global outreach budget depends on knowing each member's configured tier. Without settings, every proactive feature must use hardcoded defaults, which will be wrong for some members and will trigger opt-out conversations.
- **Foundation before differentiators:** Session summaries (requires timer event pipeline to bot), community momentum nudges, and adaptive cadence all depend on v3.0 core functioning reliably. They are v3.1 scope.

### Research Flags

Phases likely needing deeper research during planning:

- **Phase 2 — Action Execution Pipeline (Grok tool calling):** It is not confirmed whether Grok 4.1 Fast supports function/tool calling via OpenRouter. If it does not, the two-step pattern (classify intent as structured JSON in one call, execute deterministically, generate confirmation) is the fallback — but it must be explicitly designed. Do not assume tool calling is available; validate against OpenRouter's capability matrix before designing the execution layer.
- **Phase 2 — Cost Model Validation:** The $0.02-0.05/day estimate for proactive features is solid. The conversational volume cost at 20-30 messages/member/day is a projection. Run a cost model calculation using actual token counts from current chat logs before committing to Phase 2 scope and the 500K daily token budget per member.
- **Phase 3 — Discord DM Rate Limits:** Staggering 25 morning briefs across a 30-minute window is the assumed mitigation for Discord rate limits. The exact rate limits for bot DMs need verification against Discord developer docs before Phase 3 implementation.

Phases with standard patterns (skip deeper research):

- **Phase 1 — Timer Module Removal:** Straightforward file deletion + import cleanup. All affected files and exact import paths are documented in ARCHITECTURE.md. No research needed.
- **Phase 1 — Conversation Continuity (store-then-deliver):** The `[NUDGE]` marker pattern already exists and is proven in `nudge.ts`. Extending it to briefs and reflections is pattern duplication, not novel work.
- **Phase 3 — Weekly Recap:** Reuses `recap/generator.ts` pattern with a shorter time window. Monthly recap is already proven in production; weekly is a configuration change, not new architecture.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Based on direct codebase analysis of all 8 core files and `package.json`. No new dependencies required — verified. Build order based on verified module dependencies. |
| Features | MEDIUM-HIGH | Based on codebase analysis and domain expertise. Competitor analysis is directional (6 competitors, no web search for verification). Feature prioritization is sound but external market validation unavailable. |
| Architecture | HIGH | Based on direct codebase analysis of all affected modules (353 LOC index.ts, 604 LOC memory.ts, 335 LOC manager.ts, 506 LOC briefs.ts, etc.). Build order is dependency-driven and verifiable from the code. |
| Pitfalls | MEDIUM | Based on domain expertise and codebase analysis. Architectural pitfalls (intent regression, action execution gap) are verifiable. Cost model and Discord rate limit specifics need external validation. |

**Overall confidence:** HIGH for build order, architecture decisions, and zero-new-dependency stance. MEDIUM for cost projections and feature market fit.

### Gaps to Address

- **OpenRouter tool/function calling support for Grok 4.1 Fast:** Not verified. If not supported, the action execution pattern changes design significantly. Validate against OpenRouter capability docs before designing Phase 2 action handlers.
- **Actual AI cost at conversational volume:** Run a cost calculation against actual current chat log token counts before committing Phase 2 scope. The 500K daily token budget may need recalibration for conversational volume vs. command-response volume.
- **Discord DM rate limits at scale:** The stagger-across-30-minutes mitigation is assumed sufficient for 25 members. Verify exact limits before Phase 3 implementation.
- **`buildSystemPrompt` caching:** Currently runs 7 DB queries per call. A 5-minute member-scoped TTL cache is recommended in PITFALLS.md but not yet designed. This should be addressed in Phase 1 or early Phase 2, not as a late optimization.
- **`withMemberLock` coverage for proactive messages:** All new proactive handlers (EOD, weekly recap, goal nudge) must acquire the existing member lock before any database mutations. Verify this is enforced in each handler's implementation, not just in the chat path.

---

## Sources

### Primary (HIGH confidence — direct codebase analysis)
- `apps/bot/src/modules/ai-assistant/index.ts` — intent cascade, DM handler (353 LOC)
- `apps/bot/src/modules/ai-assistant/memory.ts` — tiered context assembly, compression (604 LOC)
- `apps/bot/src/modules/ai-assistant/personality.ts` — system prompt builder, 7 DB queries per call (301 LOC)
- `apps/bot/src/modules/ai-assistant/chat.ts` — per-member locked chat handler (166 LOC)
- `apps/bot/src/modules/ai-assistant/nudge.ts` — proactive nudge delivery, daily caps, silence detection (258 LOC)
- `apps/bot/src/modules/scheduler/manager.ts` — per-member cron task lifecycle (335 LOC)
- `apps/bot/src/modules/scheduler/briefs.ts` — morning brief generation (506 LOC)
- `apps/bot/src/shared/ai-client.ts` — centralized AI routing, budget enforcement (285 LOC)
- `packages/db/prisma/schema.prisma` — full schema: MemberSchedule, ConversationMessage, TimerSession, Goal models
- `apps/bot/package.json` — current dependency list (12 deps, 4 devDeps)
- `.planning/PROJECT.md` — v3.0 active requirements

### Secondary (MEDIUM confidence — domain expertise, no external verification)
- Competitor feature analysis in FEATURES.md — directional, not exhaustive
- Cost model projections — based on published OpenRouter pricing, not verified against actual usage logs
- Notification fatigue thresholds — based on domain knowledge, not user research with this specific group

### Gaps requiring external validation
- OpenRouter capability matrix for Grok 4.1 Fast tool/function calling
- Discord developer docs on DM rate limits for bots
- Actual per-call token costs at projected conversational volume

---
*Research completed: 2026-03-22*
*Ready for roadmap: yes*
