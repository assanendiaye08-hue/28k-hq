# Project Research Summary

**Project:** Discord Hustler v1.1 Depth
**Domain:** Productivity/accountability Discord bot -- depth features for existing 1.0 codebase (16K+ LOC, 19 modules)
**Researched:** 2026-03-20
**Confidence:** HIGH

## Executive Summary

Discord Hustler v1.1 adds depth to a mature, shipping v1.0 productivity bot. The seven features -- productivity timers, goal hierarchy, self-evaluation/reflection, inspiration system, monthly progress recaps, smart reminders, and AI cost controls -- are well-understood patterns with clear integration paths into the existing 19-module architecture. The codebase already has the infrastructure these features need: an EventBus for decoupled communication, a SchedulerManager for cron tasks, a notification router for delivery, an XP engine for rewards, and an AI assistant pipeline for personalized interactions. The stack additions are minimal: only two new npm packages (chrono-node for natural language time parsing, @napi-rs/canvas for recap image generation) plus Prisma schema evolution for six new models and one modified model.

The recommended approach is dependency-ordered phasing: build AI cost infrastructure first (every subsequent feature adds AI calls), then ship features from lowest-risk to highest-risk. The inspiration system is the highest-impact, lowest-effort feature and should ship early to enrich AI context for everything that follows. Goal hierarchy is the highest-risk feature because it modifies an existing, working data model used across 6+ code locations in 4 modules. Monthly recap ships last because it aggregates data from all other features and benefits from having the richest dataset.

The primary risks are: (1) AI cost explosion from multiplied feature surface area without centralized tracking, (2) goal hierarchy migration breaking existing flat goals through Prisma self-relation quirks, (3) timer state loss on bot restart if implemented with in-memory-only state, and (4) reflection fatigue from adding yet another "thing the bot asks you to do." All four risks have concrete mitigation strategies. The cost risk is structural (build tracking before features), the hierarchy risk is procedural (test migration against production data copy), the timer risk is architectural (database-first state management), and the reflection risk is design-oriented (output-first design with visible downstream integration).

---

## Key Findings

### Recommended Stack

The v1.0 stack is stable and unchanged: discord.js 14.25.x, Prisma 7, OpenRouter (DeepSeek V3.2 + Qwen 3.5 Plus), node-cron 4.x, date-fns 4.x, zod 4.x, winston 3.x, PM2. Only two new production dependencies are needed.

**New dependencies:**
- **chrono-node 2.9.0**: Natural language time parsing for smart reminders and improved goal deadline parsing. TypeScript types included, ESM exports, zero external dependencies. Replaces the hand-rolled `parseDeadline()` regex parser (6 formats) with a library handling 50+ patterns.
- **@napi-rs/canvas 0.1.97**: Server-side image generation for monthly recap charts. Skia engine, prebuilt binaries (zero system dependencies), HTML5 Canvas API compatible. Output Buffer feeds directly to discord.js AttachmentBuilder. Zero API costs.

**Explicitly not adding:** Redis/Upstash (unnecessary at 10-25 members), BullMQ/Agenda (setTimeout + DB persistence suffices), rate-limiter-flexible (HTTP-oriented, wrong abstraction), chart.js/canvacord (unnecessary abstraction layers), apns2 (defer until Apple integration phase).

**All other features use existing stack:** Pomodoro timers use setTimeout + Map, goal hierarchy uses Prisma self-relations, reflections use existing DM flow patterns + AI pipeline, inspiration is pure prompt engineering, cost controls use in-memory Map + DB counts.

### Expected Features

**Must have (table stakes):**
- **Productivity timer** -- Members already use lock-in sessions; structured focus intervals with proportional breaks are the natural next step. Configurable ratios (25/5, 50/10, custom) with XP rewards.
- **Goal hierarchy** -- Current flat goals are limiting after a few weeks. Optional yearly-to-daily decomposition with Jarvis-assisted breakdown. Backward-compatible: standalone goals work identically to v1.0.
- **Monthly progress recap** -- Members accumulate data daily but have no periodic "look how far you've come" moment. Visual summary DM with charts, shareable to #wins.
- **Smart reminders** -- Natural language ("remind me tomorrow at 2pm"), urgency tiers, pluggable delivery backend designed for future Apple ecosystem integration.

**Should have (differentiators):**
- **Self-evaluation/reflection** -- Configurable intensity (light/medium/heavy), AI-personalized questions based on actual activity, insights feed back into Jarvis context. No competitor does AI-personalized reflection.
- **Inspiration system** -- Members set people they admire; Jarvis references them naturally. Unique feature with highest impact-to-effort ratio. Tiny data model, enormous personality enrichment.
- **Rate limiting / cost controls** -- Per-member token budgets, global cost ceiling, graceful degradation. Invisible to members but critical for sustainable operation as AI feature count grows.

**Defer to v2+:**
- Apple push notification backend (design interface now, implement later)
- Deep timer analytics / heatmaps (needs months of data)
- Cross-member reflection sharing (needs trust and volume)
- AI-suggested timer presets (needs usage data)
- Shared/group timers (coordination overhead kills it for diverse groups)
- Automated goal creation from hierarchy (removes agency, violates SDT)

### Architecture Approach

The v1.1 features integrate into the existing modular monolith through three new modules (timer, reflection, reminders), one computed module (recap, no persistence), four modified modules (goals, profile, scheduler, ai-assistant), and two new shared services (ai-client, rate-limiter). The critical architectural decision is centralizing all OpenRouter calls through a single `shared/ai-client.ts` -- the current six independent client instances make cost tracking impossible and must be consolidated before adding more AI features.

**Major components:**
1. **shared/ai-client.ts** (NEW) -- Centralized OpenRouter client with token tracking, per-member budgets, global cost ceiling, and circuit breaker. All AI-consuming code routes through this.
2. **timer/manager.ts** (NEW) -- In-memory Map of active timers with DB persistence for restart recovery. Uses setTimeout, not node-cron. Follows established sessions/manager.ts pattern.
3. **Goal model extension** (MODIFIED) -- Self-referential parentId with depth/timeframe fields. Optional hierarchy, backward-compatible. All 6+ query sites across 4 modules must be updated.
4. **reflection/ module** (NEW) -- Conversational DM flows (reusing planning.ts pattern), AI-powered personalized questions, insight extraction with downstream integration into briefs and system prompt.
5. **reminders/scheduler.ts** (NEW) -- Extends SchedulerManager with one-shot scheduling (not a parallel system). chrono-node for parsing, delivery backend interface for future Apple integration.
6. **recap/generator.ts** (NEW) -- Read-only aggregation of all data sources. Image generation via @napi-rs/canvas with staggered generation to avoid event loop blocking.

### Critical Pitfalls

1. **AI cost explosion** -- v1.1 multiplies AI call surface area (reflection analysis, goal decomposition, inspiration context, recap narratives) from ~$0.03/day to potentially $0.50+/day. Build centralized cost tracker BEFORE adding features, set daily budget ceiling with graceful degradation.
2. **Goal hierarchy migration breaking flat goals** -- The Goal model is referenced in 6+ locations across 4 modules, all assuming flat structure. Prisma self-relations can generate erroneous UNIQUE indexes. Test migration on production data copy, make hierarchy completely optional with null defaults, update every query site.
3. **Timer state lost on restart** -- PM2 auto-restarts mean in-memory-only timers are guaranteed to fail. Database-first design from day one with `rebuildTimers()` on startup (same pattern as SchedulerManager.rebuildAll()).
4. **Reflection fatigue** -- Adding another "thing the bot asks you to do" risks obligation overload. Design output-first (define how reflection data feeds briefs, AI prompts, and recaps BEFORE building the UI), make intensity configurable, never prompt reflection and check-in simultaneously.
5. **Two scheduling systems fighting** -- Building a separate reminder scheduler alongside SchedulerManager creates duplicate timezone handling, notification overlap, and two restart recovery codepaths. Extend SchedulerManager with `scheduleOneShot()`, route all delivery through notification router.

---

## Implications for Roadmap

Based on combined research, suggested phase structure (7 phases, continuing from existing v1.0 phases 1-4):

### Phase 5: AI Cost Infrastructure
**Rationale:** Every subsequent v1.1 feature adds AI calls. Without centralized cost tracking, there is zero visibility into spend. The existing 6 independent OpenRouter client instances are v1.0 debt that compounds with every new AI feature. This is the foundation phase.
**Delivers:** Centralized ai-client.ts, AIUsage tracking model, per-member and global budgets, graceful degradation with template fallbacks, `/admin ai-usage` dashboard.
**Addresses:** Rate limiting / cost controls (FEATURES.md), Anti-Pattern 1: Separate OpenRouter Clients (ARCHITECTURE.md)
**Avoids:** AI cost explosion (PITFALLS.md Critical #5)
**Risk:** LOW -- straightforward refactor, all 6 call sites follow identical patterns.

### Phase 6: Inspiration System
**Rationale:** Highest impact-to-effort ratio of all v1.1 features. Tiny data model (one new table, 3 commands), but immediately enriches every AI interaction for all subsequent features. Once inspirations are in the system prompt, reflections, briefs, nudges, and planning all benefit.
**Delivers:** Inspiration model, `/inspiration add/remove/list` commands, system prompt injection in personality.ts, natural inspiration references in all AI outputs.
**Addresses:** Inspiration system (FEATURES.md differentiator)
**Avoids:** Inspiration feeling like generic motivational spam (PITFALLS.md UX) -- member-chosen, contextual references only.
**Risk:** LOW -- additive only, no modifications to existing behavior.

### Phase 7: Productivity Timer Suite
**Rationale:** Independent feature with clear boundaries and an established pattern to follow (sessions/manager.ts). Feeds data to monthly recap. Integrates with lock-in sessions naturally.
**Delivers:** FocusSession model, `/timer start/stop/status/preset` commands, in-memory manager with DB persistence, proportional break calculation, XP integration (FOCUS_SESSION source), timer notifications via notification router.
**Addresses:** Productivity timer (FEATURES.md table stakes), proportional break calculation (FEATURES.md differentiator)
**Avoids:** Timer state lost on restart (PITFALLS.md Critical #1) -- database-first with rebuildTimers() on startup.
**Risk:** LOW -- follows established session manager pattern.

### Phase 8: Smart Reminders
**Rationale:** Standalone feature, no dependency on other v1.1 features. Uses chrono-node which also improves existing goal deadline parsing. The pluggable delivery backend establishes the interface for future Apple integration without requiring it now.
**Delivers:** Reminder model, `/remind` with natural language parsing, urgency tiers (LOW/NORMAL/HIGH/CRITICAL), delivery backend interface + Discord implementation, restart recovery, reschedule limits with Jarvis accountability.
**Uses:** chrono-node 2.9.0 (STACK.md), extended SchedulerManager (ARCHITECTURE.md)
**Avoids:** Two scheduling systems fighting (PITFALLS.md Critical #4) -- extends SchedulerManager rather than building parallel system.
**Risk:** MEDIUM -- time parsing edge cases, urgency-based repeat delivery adds state management.

### Phase 9: Goal Hierarchy Refactor
**Rationale:** Highest-risk feature -- modifies an existing, working data model referenced across 4 modules. Benefits from lessons learned in earlier phases. Reflections and recaps are richer when hierarchy exists, but both can function without it. Shipping later gives more stability runway.
**Delivers:** Goal model migration (parentId, depth, timeframe), updated `/setgoal` with optional parent, tree view in `/goals`, progress rollup, Jarvis-assisted decomposition, updated AI context with hierarchical goal display.
**Addresses:** Goal hierarchy (FEATURES.md table stakes), Jarvis-assisted decomposition (FEATURES.md differentiator)
**Avoids:** Hierarchy migration breaking flat goals (PITFALLS.md Critical #2) -- nullable defaults, explicit integration checklist, migration tested on production data copy.
**Risk:** HIGH -- schema migration on existing data, 6+ query sites to update, Prisma self-relation unique index bug potential.

### Phase 10: Self-Evaluation / Reflection
**Rationale:** Benefits from goal hierarchy being in place (reflections reference goal progress) and inspiration context being available. Extends SchedulerManager with new task types. Requires careful prompt engineering for quality AI-generated questions.
**Delivers:** Reflection and ReflectionSettings models, configurable intensity (light/medium/heavy), conversational DM flows, AI-personalized questions based on actual activity, insight extraction, downstream integration into briefs and system prompt, XP rewards (REFLECTION source).
**Addresses:** Self-evaluation flow (FEATURES.md differentiator)
**Avoids:** Reflection fatigue (PITFALLS.md Critical #3) -- output-first design, configurable intensity, visible loop closure in Jarvis responses.
**Risk:** MEDIUM -- prompt engineering quality, SchedulerManager extension, ensuring downstream integration is not forgotten.

### Phase 11: Monthly Progress Recap
**Rationale:** Pure read-only aggregation. Must come last because it summarizes data from ALL other v1.1 features. Building it earlier means missing data sources (timer hours, reflection moods, goal hierarchy progress). Richer when all data is flowing.
**Delivers:** Recap module, data aggregation queries, visual recap image via @napi-rs/canvas, multi-embed DM delivery, share-to-#wins button, month-over-month comparison, on-demand `/recap` command.
**Uses:** @napi-rs/canvas 0.1.97 (STACK.md), staggered generation (ARCHITECTURE.md)
**Avoids:** Event loop blocking from image generation (PITFALLS.md Critical #6) -- staggered generation across the day, potential worker_threads, timezone-correct month boundaries.
**Risk:** LOW -- read-only queries, no state mutations, established embed patterns.

### Phase Ordering Rationale

- **Cost infrastructure first** because it is the one cross-cutting concern that every other feature depends on. Adding AI features before tracking is the #1 pitfall identified across all research.
- **Inspiration second** because it enriches all subsequent AI interactions at near-zero implementation cost. Every feature built after inspiration benefits from richer Jarvis personality.
- **Timer and reminders before goal hierarchy** because they are independent features with clear boundaries and lower risk. Goal hierarchy is a refactor of existing code, inherently riskier, and benefits from the team having "warmed up" on simpler features.
- **Goal hierarchy before reflection** because reflections are richer when they can reference the goal tree ("You completed 3 of 5 weekly goals under your Q2 target").
- **Recap last** because it is a read-only aggregator that benefits from the maximum amount of data being available.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 9 (Goal Hierarchy):** Prisma self-relation migration needs careful testing. Cascade behavior (child expiry when parent expires) needs explicit design decisions. AI decomposition prompt engineering needs iteration.
- **Phase 10 (Reflection):** Prompt engineering for personalized questions is iterative. The downstream integration points (briefs, system prompt, recap) need explicit wiring specifications in the plan.
- **Phase 8 (Smart Reminders):** chrono-node edge cases (ambiguous times, timezone inference) need testing against real member input patterns. Delivery backend interface needs to be future-proof for Apple integration without over-engineering.

Phases with standard patterns (skip research-phase):
- **Phase 5 (Cost Infrastructure):** Well-documented OpenRouter response format. Centralized client is a straightforward refactor. Token tracking is arithmetic.
- **Phase 6 (Inspiration):** Tiny scope. Three CRUD commands plus prompt engineering. No new patterns.
- **Phase 7 (Timer):** Follows existing sessions/manager.ts pattern exactly. setTimeout + Map + DB persistence is established.
- **Phase 11 (Recap):** Read-only aggregation queries. @napi-rs/canvas has HTML5 Canvas API. Embed construction follows existing patterns.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Only 2 new packages, both verified via npm with version pinning, TypeScript types, and ESM compatibility confirmed. All other features use existing stack. |
| Features | MEDIUM-HIGH | Feature definitions solid, well-researched against competitors. Reflection and inspiration are novel enough that UX validation during implementation is warranted. |
| Architecture | HIGH | Based on full codebase review of 19 modules and ~16K LOC. Integration points identified against actual code, not theoretical patterns. Build order driven by real dependency analysis. |
| Pitfalls | HIGH | Every pitfall traced to specific files and code patterns in the existing codebase. Prevention strategies reference existing working patterns (SchedulerManager.rebuildAll, sessions/manager.ts). |

**Overall confidence:** HIGH

### Gaps to Address

- **Recap image design:** The research identifies @napi-rs/canvas as the tool and staggered generation as the pattern, but the actual visual design of recap cards (layout, charts, colors) is not specified. This is a design decision for the recap phase plan.
- **Reflection question quality:** AI-personalized reflection questions are the core value of the feature, but prompt engineering is iterative. The phase plan should include a prompt testing/iteration step before building the full flow.
- **Goal decomposition UX:** Whether Jarvis-assisted goal breakdown is a slash command flow or conversational flow needs a design decision during the goal hierarchy phase. Research supports conversational, but the implementation complexity differs.
- **chrono-node timezone handling:** chrono-node accepts a reference date for timezone context. How this integrates with the existing `MemberSchedule.timezone` field needs validation during the reminders phase.
- **Event loop impact of @napi-rs/canvas:** Staggered generation and worker_threads are documented mitigations, but actual render times for the specific recap layout need benchmarking during implementation.

---

## Sources

### Primary (HIGH confidence)
- Full codebase analysis: 19 modules, ~16K LOC, `prisma/schema.prisma`, all module entry points
- [chrono-node npm](https://www.npmjs.com/package/chrono-node) -- v2.9.0 verified, TypeScript types, ESM exports
- [@napi-rs/canvas npm](https://www.npmjs.com/package/@napi-rs/canvas) -- v0.1.97 verified, zero system deps, 332 dependents
- [Prisma self-relations docs](https://www.prisma.io/docs/orm/prisma-schema/data-model/relations/self-relations) -- Self-referential pattern confirmed
- [Apple Push Notification Service docs](https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns) -- APNs architecture for future integration
- [OpenRouter API docs](https://openrouter.ai/docs/api/reference/limits) -- Rate limits, token usage response format
- [QuickChart Discord integration](https://quickchart.io/documentation/send-charts-discord-bot/) -- Chart generation patterns
- [Prisma self-relation unique index bug (#405)](https://github.com/prisma/migrate/issues/405) -- Migration hazard confirmed

### Secondary (MEDIUM confidence)
- [DeskTime 52/17 study](https://desktime.com/blog/52-17-updated) -- Work-break ratio research
- [OKR guides (Atlassian, Quantive, Mooncamp)](https://www.atlassian.com/agile/agile-at-scale/okr) -- Goal hierarchy patterns
- [Weekly reflection frameworks (WeekPlan, Quenza)](https://weekplan.net/12-weekly-reflection-questions-to-supercharge-your-progress) -- Reflection prompt design
- [Token-based rate limiting for AI (Zuplo)](https://zuplo.com/learning-center/token-based-rate-limiting-ai-agents) -- Per-user token budget patterns
- [Pomodoro meta-analysis (TextExpander)](https://textexpander.com/blog/pomodoro-technique-productivity) -- "Structure matters more than exact ratio"
- [Discord interaction persistence (AnswerOverflow)](https://www.answeroverflow.com/m/1021674183614279700) -- Restart recovery patterns

### Tertiary (LOW confidence)
- Competitor feature analysis (Pomomo, StudyLion, Focusmate, Todoist) -- feature presence confirmed, implementation details inferred
- Pomodoro ratio meta-analysis -- consensus on flexible intervals, but original study quality varies
- Discord bot canvas guide (discordjs.guide/legacy) -- legacy guide, patterns still valid but API details may have shifted

---
*Research completed: 2026-03-20*
*Ready for roadmap: yes*
