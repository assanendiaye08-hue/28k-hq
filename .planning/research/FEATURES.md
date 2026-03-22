# Feature Research: AI Coaching Bot Behaviors (v3.0)

**Domain:** Proactive AI productivity coaching for small groups
**Researched:** 2026-03-22
**Confidence:** MEDIUM-HIGH (based on codebase analysis + domain expertise; no web verification available)

## Existing Foundation

Before mapping new features, here is what already exists and directly supports coaching:

| Module | What It Does | Relevance to v3.0 |
|--------|-------------|-------------------|
| `scheduler/briefs.ts` | AI morning briefs with full member context, community pulse, reflection insights | **Upgrade target** -- already works, needs conversational delivery |
| `scheduler/planning.ts` | Sunday planning: week review, NLP goal extraction, reminder config | **Upgrade target** -- conversational flow exists, needs richer recalibration |
| `ai-assistant/nudge.ts` | Accountability nudges with light/medium/heavy intensity, extended silence detection | **Upgrade target** -- add stale goal + broken streak triggers |
| `ai-assistant/personality.ts` | Layered system prompt: character + profile + stats + activity + reflections | **Direct dependency** -- all coaching behaviors inherit this context |
| `ai-assistant/memory.ts` | Hot/warm/cold tiered memory, conversation summary | **Direct dependency** -- coaching continuity requires memory |
| `ai-assistant/chat.ts` | DM chat handler with per-member lock, daily cap, context assembly | **Direct dependency** -- conversational goal setting routes through here |
| `reflection/` | Daily/weekly/monthly reflection flows with AI follow-ups and insight extraction | **Upgrade target** -- end-of-day reflection becomes next-day planning |
| `goals/hierarchy.ts` | Yearly > quarterly > monthly > weekly goal decomposition | **Direct dependency** -- goal review and recalibration operates on this |
| `recap/` | Monthly AI narrative recap with shareable output | **Exists** -- may need weekly variant |
| `MemberSchedule` model | Per-member timezone, brief/nudge/reflection times, accountability level | **Extend** -- add coaching config fields |

## Feature Landscape

### Table Stakes (Users Expect These)

Features that any AI coaching bot must have to feel like a coach, not a notification system. The existing system already handles some of these; the table below focuses on what is NEW or needs significant enhancement.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| **Proactive morning briefs with full context** | A coach starts the day with you; briefs.ts already does this but delivers as embed, not conversation | LOW | `scheduler/briefs.ts`, `personality.ts` | Shift from embed delivery to plain-text DM that invites a reply. Keep embed as fallback for /brief command. Already has community pulse, reflection weaving, goal summary. |
| **End-of-day reflection with next-day planning** | A coach checks in at EOD to close the loop; reflection/flow.ts exists but doesn't bridge to tomorrow | MEDIUM | `reflection/flow.ts`, `scheduler/manager.ts` | Extend existing reflection flow: after "how did today go?" add "what's your #1 priority tomorrow?" Store tomorrow's priority, reference it in next morning brief. |
| **Smart nudges for stale goals** | Goals that haven't been updated in days signal drift; a coach notices | LOW | `nudge.ts`, `goals/` module, `scheduler/` | Query goals where `updatedAt` is stale (configurable threshold, default 3 days). Fire nudge: "Your goal [X] hasn't moved in 3 days. Still on track, or want to adjust?" |
| **Smart nudges for broken streaks** | Losing a streak is a pivotal moment; a coach addresses it immediately | LOW | `nudge.ts`, `checkin/streak.ts` | Detect when `currentStreak` resets to 0 (was > 0 yesterday). Send a one-time "streak broke" message that reframes, not shames. |
| **Per-user coaching configuration** | Members have different tolerance for bot contact; one-size-fits-all fails | MEDIUM | `MemberSchedule` model, `scheduler/manager.ts` | Extend MemberSchedule with: `coachingFeatures` (array of enabled features), `coachingFrequency` (daily/weekdays/custom), `quietHoursStart`/`quietHoursEnd`. Expose via conversational settings ("tell Jarvis to ease up"). |
| **Conversational goal setting** | Typing `/setgoal title:... type:... target:... unit:...` is friction; a coach asks questions | MEDIUM | `ai-assistant/chat.ts`, `goals/` module | When user says "I want to read more" in DM, Jarvis asks clarifying questions: "How many books? By when?" then creates the Goal record. Already partially exists in planning.ts `extractGoalsFromText`. Generalize to work in any conversation. |
| **Weekly goal review and recalibration** | Weekly planning exists (Sunday 10am) but doesn't review progress on existing goals or suggest adjustments | MEDIUM | `scheduler/planning.ts`, `goals/hierarchy.ts` | Enhance planning session: show each active goal with progress %, ask "keep, adjust, or drop?" before setting new goals. Add AI analysis of completion patterns. |

### Differentiators (Competitive Advantage)

Features that go beyond generic coaching bots. These leverage the unique combination of Discord community + desktop timer + goal hierarchy that no other tool has.

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| **Session summaries from desktop timer data** | After a focus session (pomodoro/flowmodoro), Jarvis sends a brief: "45 min deep work. You mentioned working on [goal]. Want to log progress?" | MEDIUM | Desktop timer API (`POST /timer`), `TimerSession` model, `chat.ts` | Timer sessions already sync to DB with duration. Add webhook/event: when session completes, trigger Jarvis DM. Match session to likely goal using recent conversation context. Low-friction progress logging. |
| **Quiet period detection** | Members who go silent for 3+ days get a genuinely caring check-in, not a productivity nag | LOW | `nudge.ts` (already has `silenceThresholdDays`) | Already partially implemented via extended silence detection. Differentiate by: tracking last DM interaction (not just check-in), using warmer tone, offering to pause all coaching temporarily. |
| **Pattern-based coaching insights** | "You complete 80% of goals set on Sunday but only 30% of goals set mid-week" -- actionable patterns only a system tracking everything can surface | HIGH | All data models, AI analysis | Weekly or monthly: run pattern analysis across check-ins, goals, timer sessions, reflections. Surface 1-2 insights. High AI cost per analysis but low frequency (weekly/monthly). Defer to v3.1 if scope is tight. |
| **Community momentum nudges** | "3 people are locked in right now in voice. Want to join?" -- leverages FOMO/social proof | LOW | `voice-tracker/`, `sessions/`, `nudge.ts` | When 2+ members are in voice and a member hasn't checked in today, send a social proof nudge. Respects quiet hours. Powerful for gamers who respond to "the squad is on." |
| **Goal decomposition coaching** | When a member sets a big goal, Jarvis proactively offers to break it down using the hierarchy | LOW | `goals/decompose.ts` (already exists), `chat.ts` | Already implemented in goals module. Differentiate by making it conversational: "That's a big one. Want me to suggest sub-goals?" then create them via conversation, not slash commands. |
| **Adaptive coaching cadence** | If a member consistently ignores morning briefs but responds to evening nudges, auto-shift coaching to evenings | HIGH | `MemberSchedule`, delivery tracking, `scheduler/` | Track delivery + response rates per notification type. After 2 weeks of data, suggest cadence changes: "I notice you never respond to morning briefs. Want me to shift to evenings?" Defer to v3.1. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Automated goal creation from check-ins** | "If I mention something in check-in, make it a goal automatically" | Creates unwanted goals, removes intentionality from goal-setting, clutters goal list | Jarvis suggests: "You mentioned [X] twice this week. Want to make it a goal?" -- offer, don't auto-create |
| **Comparison nudges between members** | "Show me how I compare to others" -- gamers love competition | Named comparisons create resentment and pressure in a friend group; anonymous leaderboards already exist | Keep leaderboards anonymous. Jarvis can say "someone in the server crushed 5 goals this week" without naming names. Already enforced in personality.ts. |
| **Aggressive streak recovery mechanics** | "Let me do double check-ins to recover my streak" | Undermines the meaning of streaks, creates gaming-the-system behavior, cheapens the mechanic | Streaks reset cleanly. Jarvis reframes: "Clean slate. Day 1 of a new streak." Focus forward, not recovery. |
| **AI-generated goals** | "Jarvis should set my goals for me based on my profile" | Removes ownership and commitment; goals set by AI feel like homework | Jarvis helps decompose and refine goals the member proposes. Never originates goals. Can suggest areas based on reflections but member must confirm. |
| **Calendar/schedule integration** | "Sync with Google Calendar to know when I'm free" | Massive integration complexity, privacy concerns, scope creep, not needed for 10-25 friends | Members tell Jarvis their routine in conversation. Memory system retains it. "I work 9-5" is enough context without API integration. |
| **Real-time activity tracking** | "Track what app I'm using to know if I'm productive" | Privacy nightmare, requires agent software, technically complex, not needed at this scale | Desktop timer is the opt-in productivity signal. If the timer is running, you're working. No surveillance. Already listed as out-of-scope in PROJECT.md. |
| **Overly frequent check-ins** | "Ask me how I'm doing every hour" | Notification fatigue, becomes annoying fast, members will mute the bot | Cap at morning brief + 1 nudge + 1 reflection per day max. Let members set frequency lower. Quality over quantity. |

## Feature Dependencies

```
Per-user coaching config
    |
    |-- enables --> Morning brief customization (time, tone, content)
    |-- enables --> Nudge frequency control (which nudges fire)
    |-- enables --> Reflection intensity (already exists, fold into config)
    |-- enables --> Quiet hours (suppress all coaching during sleep/work)

Conversational goal setting
    |-- requires --> Intent detection in chat.ts (detect "I want to..." patterns)
    |-- requires --> Goal creation from chat context (generalize extractGoalsFromText)
    |-- enhances --> Weekly goal review (review uses same conversational patterns)

End-of-day reflection + next-day planning
    |-- requires --> reflection/flow.ts extension (add tomorrow's priority step)
    |-- enhances --> Morning brief (references yesterday's EOD priority)
    |-- requires --> New DB field: Member.tomorrowPriority or similar

Smart nudges (stale goals, broken streaks, quiet periods)
    |-- requires --> Per-user coaching config (to know which nudges are enabled)
    |-- requires --> Nudge deduplication (don't send stale goal + broken streak + quiet period on same day)
    |-- enhances --> Existing nudge.ts (add new trigger types alongside missed-checkin)

Session summaries
    |-- requires --> Timer session completion event/webhook
    |-- requires --> Goal-to-session matching logic
    |-- enhances --> Check-in flow (offer to count timer session as check-in)

Weekly goal review
    |-- requires --> planning.ts enhancement (add review step before new goals)
    |-- requires --> Goal progress aggregation (% complete, days active, velocity)
    |-- enhances --> Goal hierarchy (review at each timeframe level)
```

### Dependency Notes

- **Per-user coaching config must come first:** Every other feature needs to know whether it's enabled for this member. Without config, you cannot ship nudges or reflections safely.
- **Conversational goal setting requires intent detection:** The chat handler currently does not parse for goal-setting intent. Adding this is the unlock for natural interaction.
- **End-of-day reflection enhances morning brief:** The EOD "tomorrow's priority" feeds directly into the next morning brief. Ship them together or EOD first.
- **Session summaries are independent:** They depend on timer completion events, not on other coaching features. Can ship in any order.
- **Smart nudges depend on coaching config:** Need to know which nudge types a member has enabled before sending any.

## MVP Definition

### Launch With (v3.0 Core)

- [ ] **Per-user coaching configuration** -- extend MemberSchedule with feature toggles, expose via conversational settings in DM. This is the foundation everything else depends on.
- [ ] **Conversational goal setting** -- detect goal-setting intent in chat, ask clarifying questions, create Goal records from conversation. Replaces /setgoal for most interactions.
- [ ] **Enhanced morning briefs** -- shift from embed to conversational DM. Reference yesterday's EOD priority if set. Keep existing context assembly (community pulse, reflections, goals).
- [ ] **End-of-day reflection with next-day planning** -- extend reflection flow to ask "what's your #1 tomorrow?" Store and feed into morning brief.
- [ ] **Smart nudges: stale goals + broken streaks** -- add two new nudge triggers to existing nudge system. Respect per-user coaching config.
- [ ] **Weekly goal review enhancement** -- add goal review step to existing Sunday planning: show progress, ask keep/adjust/drop per goal.
- [ ] **Remove bot timer module** -- desktop app handles timers now (already planned in PROJECT.md v3.0 requirements).
- [ ] **DMs only** -- remove private channel system, all coaching via DMs (already planned in PROJECT.md v3.0 requirements).

### Add After Validation (v3.1)

- [ ] **Session summaries from desktop timer** -- trigger when timer session completes via API event. Match to goals, offer progress logging.
- [ ] **Community momentum nudges** -- "the squad is locked in" social proof nudges when voice channels are active.
- [ ] **Quiet period detection enhancement** -- track last DM interaction, offer to pause coaching temporarily.
- [ ] **Pattern-based coaching insights** -- weekly/monthly pattern analysis across all data. High AI cost, validate demand first.

### Future Consideration (v3.2+)

- [ ] **Adaptive coaching cadence** -- auto-adjust timing based on response rates. Needs 2+ weeks of delivery tracking data.
- [ ] **Goal velocity tracking** -- predict goal completion likelihood based on progress rate. Surface "at this pace, you'll miss your deadline by 3 days."
- [ ] **Coaching effectiveness scoring** -- measure which coaching interventions lead to goal completions. Meta-analysis layer.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority | Rationale |
|---------|------------|---------------------|----------|-----------|
| Per-user coaching config | HIGH | MEDIUM | P1 | Foundation for all coaching; prevents over-notifying and member annoyance |
| Conversational goal setting | HIGH | MEDIUM | P1 | Core v3.0 requirement -- natural language replaces slash commands |
| Enhanced morning briefs | HIGH | LOW | P1 | Existing code does 90% of the work; shift delivery format |
| End-of-day reflection + planning | HIGH | MEDIUM | P1 | Closes the daily coaching loop; builds on existing reflection flow |
| Smart nudges (stale/streak) | MEDIUM | LOW | P1 | Two new triggers added to existing nudge infrastructure |
| Weekly goal review | MEDIUM | MEDIUM | P1 | Enhances existing planning session; critical for goal recalibration |
| Remove bot timer + DMs only | MEDIUM | LOW | P1 | Cleanup tasks already planned; reduces maintenance surface |
| Session summaries | MEDIUM | MEDIUM | P2 | Valuable but requires timer-to-bot event pipeline; can ship after core |
| Community momentum nudges | MEDIUM | LOW | P2 | Low effort, fun, but not core coaching |
| Pattern-based insights | HIGH | HIGH | P3 | Most differentiated feature but highest complexity and AI cost |
| Adaptive coaching cadence | MEDIUM | HIGH | P3 | Needs delivery tracking data first; cannot ship until v3.0 runs for weeks |

## Competitor Feature Analysis

| Feature | Generic AI Coach (ChatGPT/Claude) | Habit Apps (Streaks, Habitica) | Accountability Bots (Discord) | Our Approach |
|---------|-----------------------------------|-------------------------------|------------------------------|--------------|
| Proactive outreach | None -- user must initiate | Push notifications (generic) | Scheduled reminders (rigid) | AI-personalized, context-aware DMs at member's preferred time |
| Goal tracking | Conversational but no persistence | Rigid habit tracking | Slash command based | Hierarchical goals with conversational CRUD + persistent tracking |
| Community awareness | None | Server-wide leaderboards | Basic leaderboards | Community pulse in briefs, social proof nudges, anonymous comparisons |
| Personalization | Per-conversation only | Settings toggles | Minimal | Per-member coaching config + tiered memory + reflection insights |
| Reflection/self-eval | Only if user asks | Post-completion surveys | None | Scheduled reflections with AI follow-ups, insight extraction, cross-session continuity |
| Timer integration | None | None | Basic bot timers | Desktop app timer syncs to DB, future session summaries from Jarvis |
| Streak mechanics | None | Core mechanic but isolated | Basic streak counting | Streak multiplier affects XP, broken streak handling, gamer psychology |

## Key Design Principles for Coaching Features

1. **Coach, not nanny.** Every outreach must feel like it is helping, not surveilling. If a member does not respond, back off. Never send more than the configured maximum contacts per day.

2. **Conversations, not commands.** v3.0's core shift is from `/setgoal title:...` to "hey Jarvis, I want to start reading more." The AI handles extraction and confirmation. Slash commands remain for quick lookups only (/goals, /reminders, /leaderboard).

3. **Context continuity.** Morning brief references yesterday's reflection. Weekly review references this week's check-ins. Nudges reference specific stale goals by name. The tiered memory system makes this possible without re-asking.

4. **Opt-in depth.** Light users get morning briefs and weekly planning. Heavy users get daily reflections, proactive nudges, session summaries. The coaching config lets members choose their depth.

5. **Gamer psychology.** Streaks, XP, ranks, leaderboards already exist. Coaching features should reinforce these mechanics, not compete with them. A nudge about a broken streak leverages loss aversion. A session summary offers XP for logging.

## Sources

- Codebase analysis: `apps/bot/src/modules/scheduler/`, `apps/bot/src/modules/ai-assistant/`, `apps/bot/src/modules/reflection/`, `apps/bot/src/modules/goals/`
- Data model: `packages/db/prisma/schema.prisma` (MemberSchedule, Goal, Reflection, TimerSession models)
- Project requirements: `.planning/PROJECT.md` v3.0 active requirements
- Confidence note: WebSearch was unavailable for this research session. Feature landscape is based on domain expertise and deep codebase analysis. Competitor analysis is directional, not exhaustive. Overall confidence: MEDIUM-HIGH.

---
*Feature research for: AI Coaching Bot Behaviors (v3.0)*
*Researched: 2026-03-22*
