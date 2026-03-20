# Pitfalls Research: v1.1 Depth Features

**Domain:** Adding productivity timers, goal hierarchy, self-evaluation, inspiration, monthly recaps, smart reminders, and rate limiting to an existing 16K LOC Discord productivity bot
**Researched:** 2026-03-20
**Confidence:** HIGH (based on deep codebase analysis of existing 18-module architecture, verified Discord bot patterns, and established productivity UX research)

## Critical Pitfalls

### Pitfall 1: Timer State Lost on Bot Restart -- The Pomodoro Amnesia Problem

**What goes wrong:**
Productivity timers (pomodoro sessions) are inherently stateful -- they track an ongoing countdown with work/break phases. If the timer state lives only in memory (setTimeout/setInterval), a PM2 restart, deploy, or crash kills every active timer silently. Members lose their focus sessions with no feedback. The existing `SchedulerManager` in `src/modules/scheduler/manager.ts` already solves this for cron-based tasks (it rebuilds from DB on startup), but timers are fundamentally different: they have arbitrary start times, variable durations, and phase transitions that cron expressions cannot represent.

**Why it happens:**
The natural implementation is `setTimeout(callback, 25 * 60 * 1000)` -- simple, clean, wrong. Node.js timers are process-local. The existing sessions module (`src/modules/sessions/manager.ts`) already uses an in-memory `activeSessions` Map with no persistence for active state, and it works because lock-in sessions survive via voice channel presence detection on restart. Timers have no such external anchor -- if the bot restarts mid-pomodoro, the timer is simply gone.

**How to avoid:**
Store timer state in the database: `memberId`, `startedAt`, `duration`, `phase` (work/break), `pausedAt`. On each phase transition, update the DB record. On bot startup, query all active timers, calculate remaining time, and re-register timeouts. This mirrors how `SchedulerManager.rebuildAll()` already works for cron tasks. Use a `TimerSession` Prisma model, not in-memory state.

**Warning signs:**
- Timer feature works perfectly until the first deploy after launch
- Members reporting "my timer just disappeared" without any error
- No `rebuildAll`-equivalent function in the timer module

**Phase to address:**
Phase 1 (Productivity Timer). Must be designed database-first from the start. Retrofitting persistence onto an in-memory timer is a rewrite.

---

### Pitfall 2: Goal Hierarchy Migration Breaks Existing Flat Goals

**What goes wrong:**
The current `Goal` model is flat -- no `parentId`, no depth concept, no hierarchy. Adding `parentId` as an optional self-referential foreign key is the obvious schema change, but it creates three integration hazards: (1) Prisma self-relations can generate erroneous UNIQUE indexes on the `parentId` column, preventing multiple children per parent. (2) Every existing query that touches goals -- `/goals`, `/progress`, `/completegoal`, goal expiry in `src/modules/goals/expiry.ts`, autocomplete in `handleGoalAutocomplete`, and the AI personality builder in `src/modules/ai-assistant/personality.ts` -- assumes a flat list. (3) The AI system prompt's `buildStatsSection()` and `buildMemberContext()` both iterate over `member.goals` as a flat array. Adding hierarchy without updating these surfaces creates inconsistent displays.

**Why it happens:**
"Just add an optional parentId" feels like a minimal change. But the Goal model is referenced in 6+ locations across 4 modules (goals, xp, scheduler/briefs, ai-assistant). Each location has implicit assumptions about flat structure -- `findMany` with no depth filtering, display logic that doesn't indent or group, autocomplete that shows all goals at one level.

**How to avoid:**
1. Review the migration SQL after `prisma migrate dev` generates it -- watch for UNIQUE constraints on `parentId`. Edit the migration to use a regular index instead if Prisma generates a unique one.
2. Make hierarchy completely optional. Existing goals with `parentId: null` must continue working identically. Zero behavioral change for members who don't want hierarchy.
3. Update all goal queries to handle depth. For flat views (autocomplete, briefs), filter to top-level goals or add `depth` display. For detailed views, show hierarchy.
4. Update `buildStatsSection()` and `buildMemberContext()` in the AI personality module to present hierarchical goals as indented/nested structures so Jarvis understands the relationship.
5. Handle cascade behavior explicitly: completing a parent goal should NOT auto-complete children (or vice versa). Completing all children could optionally prompt parent completion via Jarvis.

**Warning signs:**
- Migration fails on production because of duplicate `parentId` values (shouldn't happen since field is new, but Prisma's unique index bug can cause issues)
- AI assistant refers to sub-goals as standalone goals with no parent context
- `/goals` command shows 15 goals in a flat list when 10 of them are sub-goals of 5 parent goals

**Phase to address:**
Phase 2 (Goal Hierarchy Refactor). This phase must include an explicit integration checklist for every file that touches the Goal model.

---

### Pitfall 3: Reflection Fatigue -- Self-Evaluation Becoming Another Chore

**What goes wrong:**
The v1.0 system already asks members to check in daily, set goals, update progress, and respond to nudges. Adding a self-evaluation/reflection flow creates yet another "thing the bot asks you to do." Members experience decision fatigue and obligation overload. The biggest insight from reflection app research: the biggest mistake is that people have great insights during reflection but no system to connect them to daily action -- the insights fade and the exercise feels pointless. If reflection doesn't visibly change what Jarvis says, what goals get suggested, or what the morning brief contains, members will do it once and never again.

**Why it happens:**
Reflection is easy to build (it's a form) but hard to make valuable. The feature gets shipped as a standalone flow that writes data to a table, but nothing reads that table. The morning brief in `src/modules/scheduler/briefs.ts` doesn't reference reflection data. The AI system prompt in `src/modules/ai-assistant/personality.ts` doesn't include reflection insights. The data exists but has no downstream consumers.

**How to avoid:**
1. Design reflection output-first: before building the UI, define exactly how reflection data feeds into (a) Jarvis's system prompt, (b) the morning brief, (c) goal suggestions, and (d) the monthly recap.
2. Make it configurable intensity. The existing `accountabilityLevel` field on `MemberSchedule` (light/medium/heavy) should control reflection depth: light = 1 question weekly, medium = 3 questions weekly, heavy = daily structured reflection.
3. Close the loop visibly. When Jarvis references a reflection ("Last week you said you were struggling with focus -- how's that going?"), the member sees the reflection was worth doing.
4. Never prompt reflection and check-in on the same notification. Batch or alternate.

**Warning signs:**
- Reflection data table grows but is never joined or queried by other modules
- Members complete reflection once during the first week, then never again
- Jarvis never references anything from reflections in conversation

**Phase to address:**
Phase 3 (Self-Evaluation/Reflection). Must be designed with downstream integration specified before any code is written.

---

### Pitfall 4: Smart Reminders Colliding with Existing Scheduler -- Two Timing Systems Fighting

**What goes wrong:**
The bot already has a comprehensive scheduling system: `SchedulerManager` handles briefs, check-in reminders, Sunday planning, and nudges via node-cron. Smart reminders (natural language, one-shot, arbitrary times) are a fundamentally different scheduling paradigm -- they're one-time events, not recurring crons. Building a second scheduling system alongside the first creates: (1) two codepaths for "send member a message at a specific time," (2) notification overlap where a smart reminder fires 5 minutes before a scheduled nudge, (3) two sets of timezone handling logic that can drift apart, and (4) two rebuild-on-restart codepaths.

**Why it happens:**
Cron-based recurring schedules and one-shot reminders feel like different features, so developers naturally build them separately. But from the member's perspective, they're the same thing: "the bot told me something at a specific time." Having two systems means two places to set quiet hours, two delivery pipelines, and two potential failure points.

**How to avoid:**
Extend `SchedulerManager` rather than building a parallel system. Add a `scheduleOneShot(memberId, fireAt, taskType, fn)` method that stores the reminder in the DB (new `Reminder` model) and registers a timeout. On bot restart, `rebuildAll` should also query pending reminders and re-register them. Route all reminder delivery through the existing `deliverNotification()` from `src/modules/notification-router/router.ts`. Add a new notification type (`'reminder'`) to the router so members can configure which account receives reminders.

**Warning signs:**
- A new `ReminderScheduler` class that duplicates timezone handling from `SchedulerManager`
- Members receiving a reminder and a nudge within minutes of each other about the same topic
- Reminder delivery bypasses the notification router (uses direct DM instead of `deliverNotification`)

**Phase to address:**
Phase 5 (Smart Reminders). Must be designed as an extension of the existing scheduler, not a parallel system.

---

### Pitfall 5: AI Cost Explosion from v1.1 Feature Surface Area

**What goes wrong:**
v1.0 has controlled AI usage: morning briefs (1/day/member), chat (50 messages/day cap), nudges (1/day), content filtering. v1.1 adds multiple new AI-consuming features: Jarvis-assisted goal decomposition, reflection analysis, inspiration system ("what would X do?"), and monthly recap generation. Each feature seems cheap in isolation ($0.001 per call), but the surface area multiplies: 25 members * (1 brief + 1 reflection analysis + occasional goal decomposition + inspiration queries + 1 monthly recap) can push costs from $0.03/day to $0.50+/day without any single feature being the culprit. The existing daily message cap (50/member) in `src/modules/ai-assistant/chat.ts` only covers direct chat -- it doesn't account for system-initiated AI calls.

**Why it happens:**
Each feature team (or each phase) adds "just one more AI call" without a unified cost accounting system. There's no global AI budget tracker. The existing `DAILY_MESSAGE_CAP = 50` in chat.ts is a per-member chat limit, not a system-wide cost control. System-initiated calls (briefs, reflections, recaps) bypass it entirely.

**How to avoid:**
1. Implement a centralized AI cost tracker before adding any v1.1 AI features. Every OpenRouter call goes through a single function that logs: memberId (or 'system'), token count, estimated cost, feature source.
2. Set a daily system-wide budget ceiling with a hard stop. When reached, degrade gracefully: skip AI-enhanced briefs (use template fallback, which already exists in `src/modules/scheduler/briefs.ts`), defer non-urgent AI calls.
3. Distinguish member-initiated vs system-initiated AI costs. Member chat has the existing 50/day cap. System calls (briefs, reflections, recaps) should have separate per-feature budgets.
4. Cache aggressively. The `briefCache` pattern in briefs.ts is good -- apply the same pattern to inspiration responses and reflection analysis.

**Warning signs:**
- OpenRouter bill jumps 5-10x after v1.1 deploy with no single feature responsible
- No function exists that can answer "how much did AI cost today?"
- Template fallbacks never trigger because no cost ceiling exists

**Phase to address:**
Phase 6 (Rate Limiting and Cost Controls). Should be built BEFORE the AI-heavy features (goal decomposition, inspiration, reflection analysis), not after.

---

### Pitfall 6: Monthly Recap Image Generation Blocking the Event Loop

**What goes wrong:**
Monthly progress recaps need visual summaries -- charts, progress bars, stat cards. Discord embeds can't render dynamic visualizations, so you need to generate images server-side (canvas/sharp) and send as attachments. Image generation with @napi-rs/canvas or node-canvas is CPU-intensive. Generating 25 custom recap images (one per member) at month-end blocks the Node.js event loop for seconds per image. During generation, the bot stops responding to commands, timers don't fire, and Discord heartbeats can be missed (causing disconnection). This is especially dangerous because recaps naturally cluster: all 25 generate within the same cron window.

**Why it happens:**
Node.js is single-threaded. Canvas rendering is synchronous CPU work. The existing bot architecture processes everything on the main thread -- all cron callbacks in `SchedulerManager`, all command handlers, all event listeners. There's no worker thread infrastructure.

**How to avoid:**
1. Use worker_threads for image generation. Spawn a worker per recap, or a worker pool with 2-3 workers.
2. Stagger recap generation across the day -- don't generate all 25 at midnight. Space them 2-5 minutes apart.
3. Use QuickChart API as an alternative to local canvas rendering for charts/graphs -- offloads CPU to an external service (free tier: 500 charts/month, sufficient for 25 members * 12 months).
4. If using local canvas, keep images simple. A stat card with text and colored bars is cheap to render. A full custom infographic with gradients and icons is expensive.
5. Consider generating recaps as rich embeds with emoji-based visualizations (progress bars using Unicode block characters) as the default, with image generation as an optional enhancement.

**Warning signs:**
- Bot goes unresponsive for 30+ seconds at the start of each month
- Discord gateway connection drops during recap generation
- PM2 marks the process as unstable due to event loop stalls

**Phase to address:**
Phase 4 (Monthly Progress Recap). Design must include a staggering strategy and either worker threads or external rendering.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Storing timer state only in memory (setTimeout) | Simple implementation, no migration needed | Every bot restart kills active timers; members lose focus sessions silently | Never -- the bot uses PM2 with auto-restart, making this guaranteed to fail |
| Building a separate reminder scheduler instead of extending SchedulerManager | Faster development, no risk of breaking existing scheduled tasks | Two timezone handling codepaths, two restart recovery systems, notification conflicts between systems | Never -- the existing SchedulerManager was designed to be extensible |
| Generating recap images synchronously on the main thread | No worker_threads complexity, simpler code | Event loop blocks during generation; bot unresponsive; Discord heartbeat missed at scale | Only if images are trivially simple (< 50ms generation) |
| Hardcoding inspiration people in the AI prompt | Works immediately, no new DB model | Can't update inspirations without code deploy; no per-member customization | First prototype only, then migrate to DB |
| Adding AI calls without cost tracking | Each feature ships faster without centralized billing | No visibility into which feature costs what; budget overruns discovered via OpenRouter invoice, not monitoring | Never -- add the tracker before the features |
| Making self-evaluation mandatory | Higher completion rates initially | Triggers obligation fatigue; members resent the bot; contradicts v1.0's opt-in philosophy | Never -- always make it configurable via accountabilityLevel |
| Skipping migration testing for goal hierarchy | Faster schema iteration | Prisma self-relation unique index bug corrupts migration; existing goal queries break in production | Never -- test migration on a copy of production data |

## Integration Gotchas

Common mistakes when connecting v1.1 features to the existing v1.0 system.

| Integration Point | Common Mistake | Correct Approach |
|-------------------|----------------|------------------|
| Goal hierarchy + AI personality (`personality.ts`) | Adding parentId to Goal model but not updating `buildStatsSection()` or `buildMemberContext()` -- Jarvis sees sub-goals as disconnected goals | Update both functions to present goals as a tree. Indent children under parents. Include parent context when referencing a sub-goal |
| Timer + XP engine | Awarding XP per pomodoro completion without diminishing returns -- members spam short pomodoros for XP | Follow the existing diminishing returns pattern from `XP_AWARDS.checkin` (25 -> 12 -> 6 -> 2). First pomodoro = full XP, subsequent same-day pomodoros decrease |
| Smart reminders + notification router | Delivering reminders via direct DM instead of through `deliverNotification()` -- bypasses member's account routing preferences | Always route through `deliverNotification(client, db, memberId, 'reminder', content)`. Add 'reminder' to the NotificationType and TYPE_TO_FIELD mapping in `src/modules/notification-router/router.ts` |
| Reflection + encryption | Storing reflection responses in cleartext when the entire system uses per-member AES-256-GCM encryption for personal data | Reflection content is personal data -- encrypt it using the same `encrypt()` from `src/shared/crypto.ts`. Follow the pattern from CheckIn.content and ConversationMessage.content |
| Inspiration system + AI context window | Adding full inspiration bios to every AI call, consuming 2K+ tokens per person per call | Store inspiration names only in DB. Let Jarvis use its training knowledge about public figures. Only include the member's relationship to the inspiration ("you admire X because Y") in the system prompt, not a biography |
| Monthly recap + season system | Generating recaps that ignore season boundaries -- showing stats that span two seasons | Query data within the current season's `startedAt`/`endedAt` boundaries. The Season model in the schema already tracks this |
| Timer + existing lock-in sessions | Building pomodoro timers as a separate concept when lock-in sessions already provide co-working infrastructure | Integrate timers INTO lock-in sessions as an optional mode. A member in a lock-in session should be able to run a pomodoro within it, with the timer visible to session participants |

## Performance Traps

Patterns that work at small scale but become problems.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Querying full goal tree with all descendants for every AI call | Slow AI response times, increased DB load | Limit tree depth to 3 levels (year -> quarter -> week). Cache the tree structure per member with 5-minute TTL | When members have 20+ goals in a deep hierarchy |
| Generating monthly recaps for all members in a single cron tick | Bot unresponsive for minutes, Discord heartbeat timeout | Stagger generation: 1 member every 2 minutes via queued processing | Immediately at 25 members with image generation |
| Loading all reminders into memory on startup | Memory grows linearly with reminder count | Only load reminders firing in the next hour. Re-query hourly | When members accumulate 100+ future reminders |
| Unbounded inspiration context in AI prompts | Token budget consumed by inspiration data, leaving less room for conversation history | Cap inspiration list at 3-5 people per member. Include only names and member's stated reason, not bios | When a member adds 10+ inspiration figures |
| Re-parsing natural language time expressions on every display | CPU waste on every /reminders list command | Parse once on creation, store as ISO datetime in DB. Display from stored datetime | Negligible at 25 users, but builds bad habits |

## Security Mistakes

Domain-specific security issues for v1.1 features.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Storing reflection/self-evaluation content unencrypted | Members share vulnerable personal assessments. If DB is compromised, deeply personal data is exposed in cleartext. This violates the "owner-blind privacy" principle established in v1.0 | Encrypt reflection content using existing per-member encryption (`encrypt()` from `src/shared/crypto.ts`). Follow the same pattern as CheckIn.content |
| AI-generated inspiration responses containing harmful advice | If a member's inspiration is a controversial figure, Jarvis might generate inappropriate content when asked "what would X do?" | Add content guardrails to inspiration prompts. Constrain Jarvis to productivity/work-ethic context only. Never let the AI roleplay as the inspiration figure |
| Rate limiting information leak | Exposing exact remaining budget/tokens to members reveals system internals that could be exploited to game the system | Show friendly messages ("you're approaching your daily limit") not exact numbers ("you have 47.3K tokens remaining") |
| Reminder content visible to other members via shared channels | If smart reminders deliver to a CHANNEL-type private space that another member can see | Reminders should always deliver via DM, never to channel-type private spaces. Override the private space preference for reminder-type notifications |
| Monthly recap images containing unencrypted personal stats shared publicly | A member shares their recap to #wins, revealing stats that are normally private | Recap images shared to public channels should show opt-in public stats only. Detailed private stats stay in the DM version |

## UX Pitfalls

Common user experience mistakes when adding these features.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Timer notifications in the wrong channel | Pomodoro "break time!" message appears in #general instead of DM, annoying everyone | All timer notifications go through notification router to member's private space. Only session-visible timers (in lock-in sessions) should post to the session's channel |
| Goal hierarchy forced on everyone | Members who like simple flat goals now have to navigate a tree structure for basic operations like `/goals` | Hierarchy is strictly optional. `/goals` shows flat list by default. Only members who explicitly create sub-goals see hierarchy. `/setgoal` works identically to v1.0 unless --parent is specified |
| Reflection prompts at bad times | Sending "how did your week go?" at 2 PM on a Tuesday when the member is deep in work | Tie reflection timing to existing schedule preferences. Use the member's brief time or create a separate reflection time preference. Never interrupt with reflection during a pomodoro session |
| Inspiration system feeling like generic motivational spam | "Here's what Steve Jobs would say about your goal!" reads like a bad LinkedIn post | Inspirations must be member-chosen, not system-assigned. Jarvis references them naturally in conversation ("you said you admire X -- they were in a similar spot when..."), not as unsolicited motivational cards |
| Monthly recap that's just a wall of numbers | Member opens a DM with 15 stat lines and no visual hierarchy | Lead with the narrative: "You completed 12 goals this month, up from 8 last month." Follow with visual summary (progress bars, charts). End with specific highlights. Keep total length under 1 Discord message |
| Too many new slash commands overwhelming autocomplete | v1.0 has 22 commands. Adding /timer, /reflection, /inspire, /remind, /recap, /setparent, /subgoals pushes to 29+ | Group related functionality into subcommands: `/timer start`, `/timer pause`, `/timer status` instead of `/starttimer`, `/pausetimer`, `/timerstatus`. Minimize top-level command additions |
| Smart reminders with no way to list or cancel | Member sets a reminder, forgets about it, can't find it, gets surprised by it days later | Always provide `/reminders` (list pending), `/cancelreminder` (remove by ID or fuzzy match). Show pending reminders in morning brief |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Productivity Timer:** Often missing restart recovery -- verify that restarting the bot mid-pomodoro resumes the timer correctly with accurate remaining time
- [ ] **Productivity Timer:** Often missing pause/resume state persistence -- verify that pausing, restarting the bot, then resuming works
- [ ] **Goal Hierarchy:** Often missing autocomplete update -- verify `/progress` and `/completegoal` autocomplete only shows leaf goals or handles parent/child correctly
- [ ] **Goal Hierarchy:** Often missing AI context update -- verify `buildSystemPrompt()` presents hierarchical goals with parent-child relationships, not flat
- [ ] **Goal Hierarchy:** Often missing `/mydata` export update -- verify the JSON export includes parent-child relationships in the goal data
- [ ] **Self-Evaluation:** Often missing downstream integration -- verify at least one other feature (brief, AI prompt, or recap) actively reads and references reflection data
- [ ] **Inspiration System:** Often missing empty state -- verify what happens when a member has no inspirations set and Jarvis tries to reference one
- [ ] **Monthly Recap:** Often missing timezone-correct month boundaries -- verify recap for March covers March 1 00:00 to March 31 23:59 in the MEMBER'S timezone, not UTC
- [ ] **Monthly Recap:** Often missing season boundary handling -- verify recap doesn't mix stats from two different seasons
- [ ] **Smart Reminders:** Often missing past-time handling -- verify "remind me at 3pm" when it's already 4pm either errors clearly or schedules for tomorrow, not silently discards
- [ ] **Smart Reminders:** Often missing notification router integration -- verify reminders use `deliverNotification()` not direct DM
- [ ] **Rate Limiting:** Often missing system-initiated call tracking -- verify briefs, reflections, and recaps count against the cost budget, not just member chat messages
- [ ] **Rate Limiting:** Often missing graceful degradation -- verify what happens when the budget is exhausted: template fallback for briefs, queued retry for recaps, friendly message for chat

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Timer state lost on restart (in-memory only) | MEDIUM | Add TimerSession DB model. Write migration to persist active timers. Add rebuildTimers() to startup. Members lose any timers active during the fix deploy, but future timers survive |
| Goal hierarchy migration breaks flat goals | HIGH | Rollback migration. Fix Prisma schema (remove erroneous unique index). Re-test on data copy. Re-deploy. If data was corrupted, restore from backup |
| Reflection data has no downstream consumers | LOW | Add reflection context to buildSystemPrompt() and brief template. No data loss, just wasted member effort during the gap |
| Two scheduling systems fighting (reminder vs cron) | HIGH | Merge reminder system into SchedulerManager. Migrate stored reminders to unified format. Significant refactor of whichever system was built second |
| AI cost overrun | LOW (financial), MEDIUM (technical) | Immediately add cost ceiling. Enable template fallbacks. Audit which features consume the most tokens. Reduce context window for non-critical calls |
| Event loop blocked by recap generation | MEDIUM | Move to worker_threads or external service. Retroactively generate failed recaps. Add staggering to prevent cluster |
| Reflection/reminder data stored unencrypted | HIGH | Write data migration to encrypt existing records in-place. Requires careful key derivation for each member. Cannot be done atomically -- must handle partial encryption state |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Timer state lost on restart | Timer phase | Test: start timer, restart bot via PM2, verify timer resumes with correct remaining time |
| Goal hierarchy migration breaks queries | Goal Refactor phase | Test: create 3-level goal tree, run /goals, /progress, verify display is correct. Check AI system prompt includes hierarchy |
| Reflection becomes dead data | Reflection phase | Audit: does any code outside the reflection module READ reflection data? If not, the feature is incomplete |
| Two scheduling systems | Reminders phase | Architecture review: is there a single SchedulerManager handling both cron tasks and one-shot reminders? |
| AI cost explosion | Rate Limiting phase (build FIRST) | Monitor: can the system answer "how much did AI cost today by feature?" If not, cost controls are incomplete |
| Event loop blocking from recaps | Recap phase | Test: trigger recap generation for all members simultaneously. Measure: does the bot remain responsive to commands during generation? |
| Encryption missed on new personal data | Every phase with new personal data | Audit per phase: are reflection responses, reminder text, evaluation scores encrypted at rest? |
| Inspiration system feels like spam | Inspiration phase | User test: show inspiration output to 3 members. Ask: "Does this feel personal or generic?" If generic, redesign |
| Notification overlap (reminder + nudge + brief) | Reminders phase | Test: set a reminder at the same time as a scheduled nudge. Verify the system either deduplicates or spaces them by at least 5 minutes |
| Slash command proliferation | Every phase adding commands | Count: after all v1.1 features, are there more than 25 top-level slash commands? If yes, consolidate into subcommand groups |
| Smart reminder delivers to wrong channel | Reminders phase | Test: set a CHANNEL-type private space, create a reminder. Verify it delivers via DM, not the channel |

## Sources

- Codebase analysis: `src/modules/scheduler/manager.ts` (SchedulerManager architecture), `src/modules/goals/` (flat goal model and all query patterns), `src/modules/ai-assistant/personality.ts` and `memory.ts` (AI context assembly), `src/modules/xp/engine.ts` and `constants.ts` (XP award patterns with diminishing returns), `src/modules/notification-router/router.ts` (delivery routing), `src/shared/crypto.ts` (encryption patterns), `src/modules/sessions/manager.ts` (in-memory state pattern for sessions) -- HIGH confidence (direct source code analysis)
- [Prisma self-relation unique index bug](https://github.com/prisma/migrate/issues/405) -- HIGH confidence (official Prisma issue tracker)
- [node-cron missed execution issues](https://github.com/node-cron/node-cron/issues/400) -- HIGH confidence (official issue tracker, confirmed bug)
- [Token-Based Rate Limiting for AI Agents](https://zuplo.com/learning-center/token-based-rate-limiting-ai-agents) -- MEDIUM confidence (industry guide, consistent with OpenRouter billing model)
- [QuickChart for Discord bots](https://quickchart.io/documentation/send-charts-discord-bot/) -- HIGH confidence (official documentation)
- [discord.js canvas guide](https://discordjs.guide/legacy/popular-topics/canvas) -- MEDIUM confidence (legacy guide, but patterns still valid)
- [OKR Mistakes and Goal Hierarchy Pitfalls](https://www.perdoo.com/resources/blog/common-okr-mistakes-and-how-to-overcome-them) -- MEDIUM confidence (practitioner guide, multiple corroborating sources)
- [Self-Reflection for Productivity](https://alexwalker7.medium.com/how-to-use-self-reflection-for-increased-productivity-techniques-for-evaluating-your-progress-and-6d6fe47b632c) -- MEDIUM confidence (practitioner analysis)
- [Discord interaction persistence after restart](https://www.answeroverflow.com/m/1021674183614279700) -- MEDIUM confidence (community discussion, verified against discord.js behavior)
- [Node.js Image Manipulation Libraries for Discord](https://medium.com/on-discord/nodejs-image-manipulation-libraries-43a3f955cc67) -- MEDIUM confidence (practitioner guide)

---
*Pitfalls research for: Discord Hustler v1.1 Depth -- adding productivity timer, goal hierarchy, self-evaluation, inspiration, monthly recaps, smart reminders, and rate limiting to existing 16K LOC bot*
*Researched: 2026-03-20*
