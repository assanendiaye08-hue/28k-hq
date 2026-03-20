# Feature Research

**Domain:** v1.1 Depth features for productivity/accountability Discord community
**Researched:** 2026-03-20
**Confidence:** MEDIUM-HIGH (synthesis of productivity research, competitor patterns, Discord ecosystem, and existing codebase analysis)

## Context: What v1.0 Already Has

This research covers ONLY the six v1.1 features. The following already exist and are stable:

- Daily check-ins with AI category extraction, flexible scoring, streak tracking
- Goals (weekly/monthly, MEASURABLE + FREETEXT types, auto-completion, expiry flow)
- XP engine with 9 source types, streak multipliers, diminishing returns
- Rank progression (7 tiers, auto-role assignment)
- Multi-dimensional leaderboards (XP, voice, streaks) with 2-min debounced refresh
- Voice session tracking with AFK detection
- Wins/lessons channels with XP
- Valorant-style seasonal system with snapshots and archives
- AI assistant "Jarvis" (DeepSeek V3.2 + Qwen fallback, 100K context budget, 50-msg daily cap)
- Accountability nudges with light/medium/heavy intensity
- Resource channels with AI auto-tagging
- Lock-in sessions (instant + scheduled, public + private, voice channel creation)
- Auto-content feeds (RSS/YouTube/Reddit with AI filter)
- Notification router (per-type account routing, DM delivery with fallback)
- Privacy controls (AES-256-GCM encryption, /mydata export, /deletedata hard delete)
- Bot hardening (restart recovery, member lifecycle, admin logging)

---

## Feature Landscape

### Table Stakes (Members Expect These in v1.1)

Features that feel like natural next steps. Members will wonder "why can't I do this?" once they've used v1.0 for a few weeks.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Productivity timer (pomodoro)** | Members already use /lockin for co-working sessions. Once you track voice time, people want structured focus intervals with breaks. Every serious productivity tool has timers. | MEDIUM | Extends the existing lock-in/voice session system. Must integrate with XP engine (timer completion awards XP). Standard 25/5 is the default but configurable ratios are essential -- research shows 52/17 and 50/10 outperform classic pomodoro for many users. |
| **Goal hierarchy (yearly to daily)** | Current goals are flat (title + deadline). Once members set weekly goals for a month, they want yearly vision that breaks down. "I want to make $100K this year" should decompose into monthly/weekly targets. | HIGH | Refactors existing Goal model. Must be OPTIONAL depth -- not everyone wants yearly goals. The hierarchy is: Yearly (optional) -> Quarterly (optional) -> Monthly -> Weekly -> Daily tasks (optional). Each level inherits from parent. Jarvis should help decompose. |
| **Monthly progress recap** | Members accumulate data daily but have no periodic "look how far you've come" moment. Gamers expect end-of-season summaries (like Valorant's act rank badges). Monthly is the natural cadence. | MEDIUM | Aggregates existing data (check-ins, goals, XP, voice hours, streaks) into a visual DM. Should be shareable to #wins for social proof. Uses QuickChart or chartjs-node-canvas for chart images embedded via AttachmentBuilder. |
| **Smart reminders** | Current system has fixed check-in reminders at set times. Members will want arbitrary reminders: "remind me to follow up with client tomorrow at 2pm." Natural language is the expected UX. | MEDIUM | New reminder model in DB. Natural language time parsing via chrono-node (well-maintained, TypeScript, 2.9.0). Must support urgency tiers and the pluggable delivery backend for future Apple/APNs integration. |

### Differentiators (What Makes v1.1 Special)

Features that go beyond "expected" into "this server actually understands productivity psychology."

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Self-evaluation/reflection flow** | Most productivity tools track what you DID but never ask "how did it go?" and "what would you change?". Regular reflection is the mechanism that converts activity into growth. Research shows weekly self-review between coaching sessions strengthens accountability and provides richer data. Jarvis becomes a coach, not just a tracker. | MEDIUM | Configurable intensity: light (1-2 questions weekly), medium (3-4 questions weekly + monthly deep dive), heavy (daily micro-reflection + weekly + monthly). AI-generated questions personalized to member's goals and recent activity. Results feed back into Jarvis's context for smarter coaching. |
| **Inspiration system ("What would X do?")** | No productivity tool or Discord bot does this. Members set people they admire (Elon Musk, their successful uncle, a YouTuber they follow). Jarvis naturally references these inspirations in nudges and briefs: "You said you admire Alex Hormozi -- he'd tell you to stop overthinking and ship it." This makes accountability feel personal, not generic. | LOW | Simple data model: array of inspiration names + optional context per member. The complexity is in Jarvis's prompt engineering, not the feature itself. The AI personality system already exists -- this adds a new section to the system prompt. Very high impact-to-effort ratio. |
| **Proportional break calculation** | Instead of rigid 25/5 pomodoro, the timer calculates proportional breaks based on actual work duration. Work 50 minutes? Get a 10-minute break (1:5 ratio). Work 90 minutes? Get an 18-minute break. This respects different work styles (deep workers vs. sprint workers) rather than forcing one cadence. | LOW | Pure logic on top of the timer. The ratio is configurable per member. Default 1:5 (work:break). Research supports flexible intervals over rigid ones -- the key is the break happens, not that it's exactly 5 minutes. |
| **Jarvis-assisted goal decomposition** | When a member sets a yearly goal like "make $100K from freelancing," Jarvis helps break it down: "$100K/year = $8,333/month = ~$2,083/week. At your current rate of $50/hour, that's ~42 billable hours/week. Let's set a monthly goal of $8,333 revenue." This makes the hierarchy actionable, not aspirational. | MEDIUM | Leverages existing AI assistant infrastructure. New command or conversational flow where Jarvis generates child goals from a parent. Member approves/edits before creation. The AI context already includes goals -- this adds a structured decomposition prompt. |
| **Rate limiting and cost controls** | Invisible to members but critical for the operator. Per-member AI token budgets, daily API call caps, cost tracking per feature. Prevents runaway costs as usage grows. Current system has a 50-msg daily cap but no token-level tracking. | MEDIUM | New middleware layer. Track tokens per AI call (OpenRouter returns usage in response). Daily/monthly budgets per member. Alert owner when costs spike. Graceful degradation (fall back to template briefs when budget exhausted). Essential for sustainable operation. |

### Anti-Features (Deliberately NOT Building in v1.1)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Shared/group timers** | "Let's all do pomodoro together in voice." Seems like natural group feature. | Coordination overhead kills it. Members have different focus durations, different break needs. Forcing sync means the fastest finisher waits and the slowest feels pressured. Group timers work in study groups (all doing same thing) but not in diverse productivity groups (one is coding, another is doing sales calls). | Personal timers that show status in voice channel name or bot message. Members see "3 people in focus mode" without being forced into the same cadence. Social presence without schedule coupling. |
| **Complex reflection scoring/grading** | "Rate your week 1-10 and track the trend." Quantifying reflection seems like good data. | Turning reflection into a number defeats its purpose. Members optimize for the score, not the insight. "How do I get a 9 this week?" replaces "What actually went wrong?" The introspective benefit comes from the narrative, not the metric. | Qualitative reflection with optional effort rating (already exists in check-ins). Jarvis can identify patterns across reflections without reducing them to scores. AI-detected trends ("You've mentioned energy problems 3 weeks in a row") are more useful than self-assigned numbers. |
| **Public inspiration/role-model display** | "Show everyone who I admire on my profile." Feels like community bonding. | Creates judgment dynamics. "You admire THAT person?" Inspiration is deeply personal. Public display invites debate about role models instead of using them as motivation tools. Also clutters profiles. | Inspirations are private -- only visible to Jarvis and the member. They influence AI behavior silently. The member experiences it as "Jarvis gets me" without others knowing or judging the source. |
| **Automated goal creation from hierarchy** | "If yearly goal is $100K, auto-create all monthly/weekly goals." Full automation sounds efficient. | Removes agency. Members need to CHOOSE their weekly targets because context changes. Maybe January is slow (holidays) and July is peak season. Auto-generated goals that don't match reality create failure cascades. Research on SDT: autonomy is critical for intrinsic motivation. | Jarvis SUGGESTS goals based on hierarchy math, but member must confirm each one. The suggestion accelerates goal-setting; the confirmation preserves ownership. Use a conversational flow, not a batch-create. |
| **Reminder snoozing with infinite delays** | "Snooze this reminder for later." Standard in every reminder app. | In an accountability context, snoozing is procrastination with a button. "Remind me later" becomes "never." The whole point of a smart reminder is that it fires at the right time with the right urgency. | Allow ONE reschedule per reminder (not snooze -- explicit new time). If rescheduled twice, Jarvis notes it: "This is the third time you've pushed back 'follow up with client.' Want to just cancel it or commit to a time?" Accountability, not accommodation. |
| **Extremely detailed timer analytics** | "Show me my focus pattern by hour, day of week, with heatmaps." Data nerd appeal. | For 10-25 members, the data volume is too small for meaningful statistical patterns for months. Building complex analytics before having data is premature optimization. Also, analysis paralysis -- members spend more time analyzing productivity than being productive. | Monthly recap covers aggregate timer stats (total focus hours, average session length, best day). Individual session data available via /mystats. Deep analytics deferred to v2+ when data volume justifies it. |

---

## Feature Deep Dives

### 1. Productivity Timer Suite

**What it does:** A personal pomodoro-style timer that runs inside Discord with configurable work/break ratios, proportional break calculation, integration with lock-in sessions, and XP rewards.

**Expected behavior:**
- `/timer start [duration]` begins a focus interval (default 25 min)
- `/timer break` starts a proportional break
- `/timer stop` ends the current timer
- `/timer preset [name]` loads a saved preset (e.g., "deep-work" = 50/10, "sprint" = 25/5)
- Timer status shown via bot message that updates (edit, not new message)
- Completing a full work interval awards XP (TIMER_COMPLETE source type)
- Breaking early awards no XP (prevents gaming)
- Integration with existing lock-in sessions: starting a timer while in a lock-in session is natural, not conflicting

**Work-break ratio research:**
- Classic Pomodoro: 25 work / 5 break (1:5 ratio)
- DeskTime 52/17 study: 52 work / 17 break (~1:3 ratio) -- highest productivity in their dataset
- 50/10 protocol: popular with developers
- Meta-analysis finding: "Time-structured interventions consistently improved focus" -- the structure matters more than the exact ratio
- Recommendation: Default 25/5, allow custom. Proportional break = work_duration / ratio. Default ratio 5:1. After 4 intervals, suggest a long break (15-30 min).

**Complexity:** MEDIUM
- New DB model for timer state (or in-memory with persistence on restart)
- Timer tick mechanism (setInterval or setTimeout chain)
- Message editing for status updates
- New XP source type
- Preset storage per member

**Dependencies on existing:**
- XP engine (new TIMER_COMPLETE source)
- Notification router (timer completion alerts)
- Lock-in sessions module (coexistence, not conflict)
- Member schedule (timezone for display)

### 2. Goal Hierarchy Refactor

**What it does:** Transforms the flat goal system into an optional multi-level hierarchy where yearly goals decompose into quarterly, monthly, weekly, and daily targets. Jarvis assists with decomposition.

**Expected behavior:**
- `/setgoal` gains an optional `parent` parameter (autocomplete from existing goals)
- `/goals` displays hierarchy with indentation (yearly -> monthly -> weekly)
- Goal progress rolls up: completing child goals contributes to parent progress
- Hierarchy depth is member's choice -- you can still set a standalone weekly goal
- Jarvis can be asked to help decompose: "Hey Jarvis, I want to make $100K this year. Help me break it down."
- Existing goals remain valid (backward compatible -- they become "top-level" goals)

**OKR/hierarchy patterns from research:**
- Nested cadences: Vision (years) -> Strategic (annual) -> Tactical (quarterly) -> Operational (monthly/weekly)
- For personal productivity, the sweet spot is: Yearly vision (optional) -> Monthly targets -> Weekly goals
- Daily tasks are too granular for a Discord bot -- that's what a to-do app is for. But optional daily breakdown for members who want it.
- Weekly check-ins against monthly goals are the accountability rhythm
- Key insight from OKR research: the hierarchy exists for ALIGNMENT, not micromanagement. A weekly goal should clearly connect to a monthly goal, which connects to the yearly vision.

**Schema changes:**
- Goal model gains `parentId` (self-referential, nullable)
- Goal model gains `timeframe` enum: YEARLY, QUARTERLY, MONTHLY, WEEKLY, DAILY (default WEEKLY for backward compat)
- Progress rollup: percentage of completed children = parent progress (for FREETEXT parents)
- Measurable parents: sum of children's currentValue vs parent's targetValue

**Complexity:** HIGH
- Schema migration with backward compatibility
- Recursive goal display (tree rendering in embeds)
- Progress rollup logic
- AI decomposition flow (conversational or command-based)
- Autocomplete for parent selection
- Expiry logic changes (children expire with parent? independently?)

**Dependencies on existing:**
- Goal module (refactor, not replace)
- AI assistant (decomposition prompts added to personality)
- Scheduler (weekly review of hierarchy alignment)

### 3. Self-Evaluation/Reflection Flow

**What it does:** Periodic reflection prompts delivered by Jarvis at configurable intensity. Weekly reflection is the core cadence. Monthly deep dive for pattern recognition.

**Expected behavior:**
- Member configures intensity via `/settings reflection [light|medium|heavy]`
- Light: 1 question weekly (Friday/Saturday), e.g., "What's the one thing you're most proud of this week?"
- Medium: 3-4 questions weekly + monthly deep dive (4-6 questions)
- Heavy: Daily micro-reflection (1 question) + weekly (4 questions) + monthly (6 questions)
- Questions are AI-generated based on member's actual week (goals hit/missed, check-in patterns, voice hours)
- Responses are stored (encrypted) and feed back into Jarvis's context
- Monthly deep dive includes trend analysis: "You've mentioned 'time management' as a challenge in 3 of the last 4 reflections."
- Jarvis adapts coaching based on reflection themes

**Question framework research:**
- Weekly: "What did I accomplish?", "What got in my way?", "What will I do differently?", "What am I grateful for?" (WeekPlan framework)
- Monthly: "What patterns do I see?", "Am I still aligned with my bigger goals?", "What should I stop/start/continue?" (coaching worksheet pattern)
- AI-powered personalization: instead of generic templates, Jarvis crafts questions from actual data. "You completed 3 of 5 goals this week. The two you missed were both related to client outreach. What's making outreach hard right now?"
- Key insight: the value is in the ASKING, not the tracking. Members who pause to reflect weekly outperform those who just grind.

**Complexity:** MEDIUM
- New ReflectionEntry model (encrypted content, weekNumber, type: DAILY/WEEKLY/MONTHLY)
- Reflection scheduler (added to existing cron system)
- AI prompt engineering for personalized questions
- Settings extension (reflection intensity)
- Reflection data feeding back into personality.ts system prompt

**Dependencies on existing:**
- AI assistant (question generation, response processing)
- Scheduler (cron timing for reflection delivery)
- Notification router (DM delivery)
- Check-in data, goal data, voice data (for personalized questions)
- Encryption extension (reflections are personal data)

### 4. Inspiration System

**What it does:** Members set people they admire. Jarvis references them naturally in nudges, briefs, and conversations. "What would [inspiration] do?" becomes a coaching tool.

**Expected behavior:**
- `/inspiration add [name] [context]` -- e.g., `/inspiration add "Alex Hormozi" "Built Gym Launch, $100M+ business, aggressive execution"`
- `/inspiration remove [name]`
- `/inspiration list` -- shows your inspirations (private, ephemeral)
- Jarvis weaves inspirations into responses naturally:
  - Nudge: "You admire David Goggins -- he wouldn't let a rainy Tuesday stop him. Get that check-in done."
  - Brief: "Your inspiration Alex Hormozi talks about speed of implementation. You've been planning that project for 2 weeks -- maybe it's time to ship."
  - Conversation: When member says "I don't know if I should launch yet," Jarvis might say "You told me you admire Naval for his bias toward action. What would he say about waiting?"
- Max 5 inspirations per member (keeps it focused)
- Inspirations are NEVER shown publicly or to other members

**Implementation:**
- Simple: array of `{ name: string, context: string }` stored on MemberProfile (or new model)
- The "magic" is prompt engineering in personality.ts -- add an INSPIRATIONS section to the system prompt
- Jarvis references them probabilistically (not every message) to feel natural
- Context string helps Jarvis make relevant references (knowing Hormozi is about business execution vs. Goggins is about discipline)

**Complexity:** LOW
- Tiny data model change
- 3 simple slash commands
- Prompt engineering in existing personality builder
- No new infrastructure, no new cron jobs, no complex logic

**Dependencies on existing:**
- AI assistant personality.ts (add inspiration section to system prompt)
- MemberProfile or new Inspiration model
- Encryption (inspiration context may be personal)

### 5. Monthly Progress Recap

**What it does:** A comprehensive visual summary of the member's month, delivered as a DM with an embedded chart image. Optionally shareable to #wins.

**Expected behavior:**
- Auto-delivered on the 1st of each month (or last day of month) via cron
- Also available on-demand: `/recap [month]`
- Contains:
  - Total XP earned this month (with comparison to previous month)
  - Goals set vs completed (completion rate)
  - Total focus hours (voice + timer sessions)
  - Streak status (current, longest this month)
  - Check-in consistency (days checked in / days in month)
  - Rank progress (start of month vs end)
  - Top 3 check-in categories (what they worked on most)
  - A chart: line graph of daily XP over the month, or bar chart of weekly activity
- "Share to #wins" button that posts a public version (less detail, more celebratory)
- Chart generated server-side, sent as Discord attachment

**Chart generation approach:**
- QuickChart API (hosted, no dependencies, Chart.js-based, free tier sufficient for 25 members) -- RECOMMENDED
- Alternative: chartjs-node-canvas (local, requires canvas system deps, more control)
- QuickChart wins because: zero system dependencies, works in any deployment, free tier handles this volume easily, Chart.js config is well-documented

**Complexity:** MEDIUM
- Data aggregation queries (existing tables, no new models needed)
- Chart generation (QuickChart API call or local canvas)
- Embed construction with AttachmentBuilder for chart image
- Cron job for monthly delivery
- Optional share-to-channel button (interaction handler)
- Comparison to previous month (query previous month's data)

**Dependencies on existing:**
- XP transactions (aggregation queries)
- Check-ins (count and categories)
- Goals (completion rate)
- Voice sessions (total hours)
- Notification router (DM delivery)
- Scheduler (cron for monthly trigger)
- Wins-lessons module (share button posts to #wins)

### 6. Smart Reminders

**What it does:** Natural language reminder system with urgency tiers and a pluggable delivery backend designed for future Apple ecosystem integration.

**Expected behavior:**
- `/remind [what] [when]` -- e.g., `/remind "follow up with client" "tomorrow at 2pm"`
- Natural language time parsing: "in 2 hours", "tomorrow morning", "next Monday at 9am", "end of week"
- Urgency tiers:
  - LOW: delivered at scheduled time, no follow-up
  - MEDIUM (default): delivered at scheduled time, one follow-up if not acknowledged
  - HIGH: delivered at scheduled time, follow-up every 30 minutes until acknowledged (max 3)
- `/reminders` -- list active reminders
- `/remind cancel [id]` -- cancel a reminder
- Reminders delivered via notification router (DM by default)
- Pluggable delivery backend interface:
  ```typescript
  interface ReminderDeliveryBackend {
    deliver(memberId: string, reminder: Reminder): Promise<boolean>;
    canDeliver(memberId: string): Promise<boolean>;
  }
  ```
  - DiscordDeliveryBackend (ships with v1.1)
  - ApplePushDeliveryBackend (future -- APNs via HTTP/2)
  - Member chooses delivery backend per reminder or as default

**Time parsing:**
- chrono-node (npm: chrono-node@2.9.0) is the standard. TypeScript support, well-maintained, handles English natural language dates reliably. Supports relative ("in 2 hours"), absolute ("March 25 at 3pm"), and casual ("tomorrow morning", "next week").
- Current codebase already has hand-rolled time parsing in sessions/commands.ts and goals/commands.ts -- chrono-node replaces all of it with a single, robust solution.
- One reschedule allowed per reminder. Second reschedule triggers Jarvis accountability note.

**Complexity:** MEDIUM
- New Reminder model (memberId, content, scheduledFor, urgency, status, deliveryBackend)
- chrono-node integration for parsing
- Cron-based delivery (check every minute for due reminders)
- Delivery backend interface + Discord implementation
- Acknowledgment tracking (member reacts or responds to dismiss)
- Reschedule limit logic

**Dependencies on existing:**
- Notification router (delivery mechanism)
- Scheduler (cron for checking due reminders)
- Member schedule (timezone for time parsing context)
- AI assistant (Jarvis comments on reschedule patterns)

### 7. Rate Limiting and Cost Controls (Infrastructure)

**What it does:** Per-member and global token/cost tracking for AI API calls, with budgets, alerts, and graceful degradation.

**Expected behavior:**
- Invisible to members (they never see "you're out of budget")
- Per-member daily token budget (e.g., 50K tokens/day)
- Global monthly cost ceiling (e.g., $10/month alert, $20/month hard cap)
- Token tracking: OpenRouter responses include `usage.prompt_tokens` and `usage.completion_tokens`
- When member hits daily budget: fall back to template briefs, shorter AI responses, or queue for next day
- When global ceiling approaches: reduce AI features progressively (disable auto-feed filtering first, then nudge AI, then brief AI, keep chat as last to degrade)
- Owner dashboard via `/admin costs` showing per-member and total spend
- Alert via DM to owner when daily/monthly thresholds crossed

**Current state:**
- 50-message daily cap per member (checked in chat.ts)
- No token tracking
- No cost tracking
- AI costs ~$0.03/day currently (very low with DeepSeek V3.2 at $0.26/M tokens)

**Why build it now:**
- v1.1 adds MORE AI features (reflection questions, goal decomposition, personalized recap commentary, reminder accountability notes)
- Each new AI feature multiplies token usage
- Cost grows linearly with members and feature usage
- Building the tracking infrastructure now prevents surprise costs later
- Graceful degradation is better designed upfront than bolted on during a cost crisis

**Complexity:** MEDIUM
- New CostTracking model or append to XPTransaction-style log
- Middleware wrapper around OpenRouter calls that records usage
- Budget checking before AI calls
- Degradation priority ordering
- Admin command for cost dashboard
- Alert system (reuses notification router)

**Dependencies on existing:**
- AI assistant (all AI call sites need the middleware)
- Scheduler (daily budget reset cron)
- Notification router (owner alerts)
- Config (budget thresholds stored in BotConfig)

---

## Feature Dependencies (v1.1)

```
[Rate Limiting / Cost Controls] (INFRASTRUCTURE -- build first)
    ^
    |-- required by --> [All AI features below]

[Goal Hierarchy Refactor]
    ^
    |-- enhances --> [Self-Evaluation Flow] (reflections reference goal progress)
    |-- enhances --> [Monthly Recap] (goal tree completion rates)
    |-- enhanced by --> [Inspiration System] (Jarvis uses inspirations during decomposition)

[Inspiration System] (standalone, no hard dependencies)
    |-- enhances --> [AI Assistant personality] (prompt enrichment)
    |-- enhances --> [Self-Evaluation Flow] (inspiration-referenced questions)
    |-- enhances --> [Nudges] (inspiration-referenced motivation)

[Productivity Timer]
    |-- feeds --> [XP Engine] (new TIMER_COMPLETE source)
    |-- feeds --> [Monthly Recap] (focus hours data)
    |-- coexists with --> [Lock-In Sessions] (timer inside a session)

[Self-Evaluation Flow]
    |-- requires --> [AI Assistant] (question generation)
    |-- requires --> [Scheduler] (cron delivery)
    |-- feeds --> [Monthly Recap] (reflection themes for recap commentary)
    |-- feeds --> [AI personality context] (reflection data enriches Jarvis)

[Monthly Progress Recap]
    |-- requires --> [All data sources] (XP, goals, check-ins, voice, timer)
    |-- requires --> [QuickChart or chart library] (image generation)
    |-- optionally feeds --> [Wins channel] (share button)

[Smart Reminders]
    |-- requires --> [chrono-node] (time parsing)
    |-- requires --> [Notification Router] (delivery)
    |-- designed for --> [Future Apple integration] (pluggable backend)
```

### Dependency Notes

- **Rate limiting should go first** because every other v1.1 feature adds AI calls. Building cost controls before adding features prevents surprise costs and establishes the monitoring infrastructure that all AI features pass through.
- **Inspiration system has the best effort-to-impact ratio.** Tiny data model, 3 commands, prompt engineering. Can ship in a single plan. Immediately makes Jarvis feel more personal.
- **Goal hierarchy is the highest-risk refactor** because it changes an existing, working data model. Must be backward compatible. Existing flat goals must continue working without modification.
- **Monthly recap depends on timer data existing** for the "focus hours" stat. If timer ships first, recap is richer. If recap ships first, focus hours section is empty (acceptable -- just omit it).
- **Smart reminders are fully independent** of other v1.1 features. Could ship in any order. The pluggable delivery backend is future-proofing, not a current dependency.

---

## MVP Definition (v1.1 Scope)

### Must Ship (v1.1 Launch)

These features define what "v1.1 Depth" means. Without them, the milestone is incomplete.

- [ ] **Productivity timer** -- Configurable work/break with proportional calculation and XP integration. Members need this to structure their lock-in sessions.
- [ ] **Goal hierarchy refactor** -- Optional parent-child goals with Jarvis-assisted decomposition. This is the "depth" in "v1.1 Depth."
- [ ] **Self-evaluation flow** -- Weekly reflection at configurable intensity. Converts activity tracking into growth coaching.
- [ ] **Inspiration system** -- Set role models, Jarvis references them. Highest impact per line of code.
- [ ] **Monthly progress recap** -- Visual summary with chart, shareable. Members need periodic "look how far you've come" moments.
- [ ] **Smart reminders** -- Natural language, urgency tiers, pluggable delivery. Fills the obvious gap of "remind me to do X."

### Should Ship (v1.1 or fast-follow)

- [ ] **Rate limiting / cost controls** -- Per-member token budgets, cost tracking, graceful degradation. Critical for sustainable operation but invisible to members.

### Defer to v1.2+

- [ ] **Apple push notification backend** -- The pluggable interface ships in v1.1; the APNs implementation waits for actual Apple integration work.
- [ ] **Deep timer analytics** -- Heatmaps, focus pattern analysis. Needs months of data first.
- [ ] **Cross-member reflection sharing** -- Opt-in sharing of reflection themes. Needs trust and data volume.
- [ ] **AI-suggested timer presets** -- Jarvis learns your optimal focus duration. Needs timer usage data.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority | Phase Order |
|---------|------------|---------------------|----------|-------------|
| Rate limiting / cost controls | LOW (invisible) | MEDIUM | P1 (infra) | First |
| Inspiration system | HIGH | LOW | P1 | Second |
| Productivity timer suite | HIGH | MEDIUM | P1 | Third |
| Smart reminders | HIGH | MEDIUM | P1 | Fourth |
| Goal hierarchy refactor | HIGH | HIGH | P1 | Fifth |
| Self-evaluation flow | HIGH | MEDIUM | P1 | Sixth |
| Monthly progress recap | MEDIUM-HIGH | MEDIUM | P1 | Seventh (needs data from other features) |

**Priority key:**
- P1: Must have for v1.1 -- defines the milestone's value proposition
- P2: Fast-follow -- ship within weeks of v1.1
- P3: Future consideration -- needs v1.1 to be stable and generating data

**Phase ordering rationale:**
1. Rate limiting first -- all subsequent AI features pass through it
2. Inspiration second -- tiny scope, immediate AI enrichment for everything after
3. Timer third -- standalone, feeds data to recap, integrates with sessions
4. Reminders fourth -- standalone, uses chrono-node that could benefit goal deadline parsing too
5. Goal hierarchy fifth -- biggest refactor, benefits from lessons learned in earlier plans
6. Self-evaluation sixth -- benefits from goal hierarchy being in place (reflections reference goal tree)
7. Monthly recap last -- benefits from ALL other features being live (richer data to summarize)

---

## Competitor Feature Analysis (v1.1 Features)

| Feature | Pomomo/StudyLion | Focusmate | Todoist/TickTick | Reflection App | **Our Approach** |
|---------|------------------|-----------|------------------|----------------|------------------|
| Timer | Group pomodoro in voice, rigid 25/5 | 50-min sessions with partner | Task-based pomodoro | None | Personal timer with configurable ratios, proportional breaks, XP integration. Not group-synced. |
| Goal hierarchy | None | None | Projects -> tasks (2 levels) | None | Optional 5-level hierarchy (yearly to daily) with AI-assisted decomposition. OKR-inspired. |
| Self-reflection | None | Post-session reflection (basic) | None | AI-generated questions, journals | AI-personalized questions based on actual week data. Configurable intensity. Feeds coaching context. |
| Inspiration system | None | None | None | None | **Unique.** No competitor does this. Jarvis references personal role models. |
| Monthly recap | Weekly/monthly stat exports | None | Productivity reports (premium) | Weekly/monthly/annual reviews | Visual chart image in DM, shareable to server. Gamification framing (month-over-month comparison). |
| Smart reminders | None | Session reminders only | Full NLP reminders | Journal reminders | NLP reminders with urgency tiers and pluggable delivery (designed for Apple ecosystem extension). |
| Cost controls | N/A (no AI) | N/A | N/A | N/A | Per-member token budgets, graceful degradation. Essential for AI-heavy bot sustainability. |

**Key insight:** The inspiration system and AI-personalized reflections are genuine differentiators that no competitor offers. The timer and reminders are table stakes done well. The goal hierarchy fills a gap that even dedicated productivity apps handle poorly.

---

## Sources

### Productivity Timer Research
- [Pomodoro Technique - Wikipedia](https://en.wikipedia.org/wiki/Pomodoro_Technique) -- Standard 25/5 methodology (HIGH confidence)
- [DeskTime 52/17 Study](https://desktime.com/blog/52-17-updated) -- Alternative work-break ratio research (MEDIUM confidence)
- [50/10 Protocol for Developers](https://pomodo.io/blog/developers-50-10-pomodoro-timer/) -- Developer-focused timing (MEDIUM confidence)
- [Pomodoro Technique Meta-Analysis](https://textexpander.com/blog/pomodoro-technique-productivity) -- "Time-structured interventions consistently improved focus" (MEDIUM confidence)
- [Pomomo Discord Bot](https://github.com/benjamonnguyen/Pomomo) -- Implementation patterns for Discord pomodoro (MEDIUM confidence)

### Goal Hierarchy Research
- [OKR Guide - Atlassian](https://www.atlassian.com/agile/agile-at-scale/okr) -- OKR framework overview (HIGH confidence)
- [OKR Cadence Guide - Quantive](https://quantive.com/resources/articles/okr-cycle) -- Nested cadences (MEDIUM confidence)
- [Mooncamp OKR Guide 2026](https://mooncamp.com/okr) -- Annual vs quarterly OKR patterns (MEDIUM confidence)
- [OKRs for Individuals - Todoist](https://www.todoist.com/productivity-methods/okrs-objectives-key-results) -- Personal OKR application (MEDIUM confidence)

### Self-Evaluation Research
- [Weekly Reflection Questions - WeekPlan](https://weekplan.net/12-weekly-reflection-questions-to-supercharge-your-progress) -- Reflection prompt frameworks (MEDIUM confidence)
- [Self-Reflection Practice - DEV Community](https://dev.to/maxpatiiuk/how-i-use-self-reflection-to-stay-on-track-daily-weekly-monthly-and-yearly-1n1f) -- Multi-cadence reflection patterns (MEDIUM confidence)
- [Coaching Worksheets - Quenza](https://quenza.com/blog/coaching-worksheets-for-accountability/) -- Accountability worksheet design (MEDIUM confidence)
- [Weekly Reflection Prompts - Growthalista](https://www.growthalista.com/blog/weekly-reflection-prompts) -- Anti-burnout reflection design (MEDIUM confidence)

### Monthly Recap / Gamification
- [QuickChart Discord Integration](https://quickchart.io/documentation/send-charts-discord-bot/) -- Chart generation for Discord bots (HIGH confidence)
- [Progress Bars in Gamification - Trophy](https://trophy.so/blog/progress-bars-feature-gamification-examples) -- Visual progress patterns (MEDIUM confidence)
- [Gamification Design 2025 - Arounda](https://arounda.agency/blog/gamification-in-product-design-in-2024-ui-ux) -- Current gamification UI patterns (MEDIUM confidence)

### Smart Reminders
- [chrono-node - npm](https://www.npmjs.com/package/chrono-node) -- Natural language date parser (HIGH confidence -- well-maintained, TypeScript)
- [Smart Type - Any.do](https://support.any.do/smart-type/) -- NLP reminder UX patterns (MEDIUM confidence)
- [Apple Push Notification Service](https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns) -- APNs architecture for future integration (HIGH confidence)

### Rate Limiting
- [OpenRouter Rate Limits](https://openrouter.ai/docs/api/reference/limits) -- API limits documentation (HIGH confidence)
- [Token-Based Rate Limiting for AI - Zuplo](https://zuplo.com/learning-center/token-based-rate-limiting-ai-agents) -- Per-user token budget patterns (MEDIUM confidence)
- [Discord Rate Limits](https://docs.discord.com/developers/topics/rate-limits) -- Discord API rate limit handling (HIGH confidence)

---
*Feature research for: Discord Hustler v1.1 -- Depth features (timer, goals, reflection, inspiration, recap, reminders, cost controls)*
*Researched: 2026-03-20*
