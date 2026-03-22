# Pitfalls Research

**Domain:** Conversational AI coaching evolution for Discord productivity bot
**Researched:** 2026-03-22
**Confidence:** MEDIUM (codebase analysis + domain expertise; web search unavailable for verification)

## Critical Pitfalls

### Pitfall 1: Intent Detection Regression -- Natural Language Fails Where Slash Commands Succeeded

**What goes wrong:**
Moving from `/checkin "Did 3 hours of coding"` to "Hey Jarvis, I did 3 hours of coding today" means the bot must now distinguish between a casual mention of work and an actual check-in intent. Members say "I finished my goal" in conversation, and the bot either (a) silently logs a check-in they didn't intend, or (b) misses an actual check-in because it thought it was casual chat. The current system has zero ambiguity -- `/checkin` is a check-in, period. Removing that clarity is the single biggest risk of the transition.

**Why it happens:**
Developers assume LLMs can reliably detect intent from natural language. They can -- 90% of the time. That 10% failure rate on critical actions (logging check-ins, updating goals, marking completions) erodes trust faster than any other bug. Members stop trusting the bot when it misinterprets them on something that matters.

**How to avoid:**
- Keep confirmation loops for destructive or state-changing actions. Jarvis should say "Sounds like you're checking in -- want me to log that?" before actually writing to the database
- Define a clear taxonomy of "action intents" vs "conversation intents" in the system prompt. Actions: check-in, goal update, goal completion, timer start. Conversation: everything else
- Use structured JSON output for intent classification as a separate AI call before executing actions. Do NOT have a single prompt both classify intent and generate a response
- Keep `/checkin`, `/goals`, `/leaderboard` as escape hatches per the v3.0 spec -- this is already planned correctly

**Warning signs:**
- Members start saying "no I didn't mean to check in" or "why didn't you log that?"
- XP transactions appear without explicit member confirmation
- Members revert to using slash commands because they don't trust conversational input

**Phase to address:**
Phase 1 (conversational AI core). Intent detection architecture must be designed before any action-taking conversational flow ships.

---

### Pitfall 2: Proactive Message Fatigue -- Jarvis Becomes the Annoying Friend

**What goes wrong:**
The v3.0 spec adds morning briefs, end-of-day reflections, weekly recaps, AND goal nudges on top of the existing accountability nudges. That is potentially 3-4 unsolicited messages per day per member. Members mute Jarvis's DMs within a week. Worse, Discord itself may rate-limit the bot for excessive DM activity. The current nudge system (`nudge.ts`) already has daily caps, but adding morning briefs and reflections as separate systems with their own schedules creates an additive flood nobody accounted for.

**Why it happens:**
Each proactive feature is designed in isolation. Morning briefs feel reasonable alone. Nudges feel reasonable alone. Reflections feel reasonable alone. But the member receives ALL of them, and 3-4 bot DMs per day from the same bot feels like spam -- especially when the member is busy or having an off day.

**How to avoid:**
- Implement a **global daily outreach budget** per member, not per-feature caps. Example: max 2 proactive messages per day total, regardless of type. Morning brief counts toward the same budget as a nudge
- Priority queue for outreach: morning brief > goal deadline approaching > accountability nudge > reflection prompt > weekly recap. If the budget is spent, lower-priority messages are skipped, not queued for later
- Respect "conversation already happened" -- if a member chatted with Jarvis within the last 2 hours, skip the scheduled proactive message. The conversation itself serves the same purpose
- Add a natural language "leave me alone today" that suppresses all proactive messages for 24 hours
- Track member response rate to proactive messages. If a member ignores 5 consecutive proactive messages, auto-reduce to "light" mode

**Warning signs:**
- Member response rate to proactive messages drops below 30%
- Members explicitly mute the bot (you cannot detect this via Discord API, so track response rates instead)
- Members ask "can you stop messaging me so much"

**Phase to address:**
Phase 2 (proactive coaching routines). Must be designed with a unified outreach scheduler, not as independent cron jobs per feature.

---

### Pitfall 3: Stale Context Hallucination -- Jarvis References Goals That No Longer Exist

**What goes wrong:**
The current `personality.ts` and `memory.ts` build context from live database queries, which is correct. But the warm/cold tier summaries (`compressSummary`) are AI-generated text that may reference goals, streaks, or commitments the member has since changed or abandoned. Jarvis says "How's that ecommerce store launch going?" when the member pivoted to freelancing two weeks ago. The compressed summary still mentions the old goal. Even worse: the member completed a goal, and Jarvis's cold-tier summary still references it as active because the summary was generated before completion.

**Why it happens:**
Rolling summaries are a snapshot of historical context. They compress conversation history, not live state. When live state changes (goal deleted, goal completed, streak reset), the summary is not updated. The current code only compresses messages older than 30 days -- but a goal can change in a day.

**How to avoid:**
- Never rely on summaries for current state. The system prompt already includes live goal data from the database (in `buildSystemPrompt`). Add an explicit instruction in the system prompt: "Your CURRENT STATS section is always authoritative. If the historical context mentions a goal that is not in CURRENT STATS, that goal was changed or completed -- do not reference it as active"
- When a goal is completed, deleted, or significantly modified, inject a system message into the conversation: `[SYSTEM] Goal "Launch ecom store" was completed on 2026-03-15`. This ensures the hot tier captures state transitions
- During summary compression, include a step that cross-references the summary against current active goals and removes stale references
- Add a `summaryInvalidatedAt` timestamp that triggers re-compression when member data changes significantly

**Warning signs:**
- Jarvis references goals not in the member's active goals list
- Members correct Jarvis about their current focus more than once per week
- Summaries contain outdated accountability levels or timezone references

**Phase to address:**
Phase 1 (context management). Summary staleness mitigation must be part of the core context assembly redesign.

---

### Pitfall 4: The Action Execution Gap -- Jarvis Says It Did Something But Didn't

**What goes wrong:**
In conversational mode, a member says "update my reading goal to 15 books" and Jarvis responds "Done! Updated your reading goal to 15 books." But the actual database update failed silently, or the AI generated the response without actually executing any database operation because there is no action execution layer -- just a chat response. The member trusts the confirmation, checks their goals later, and finds nothing changed.

**Why it happens:**
The current architecture (`chat.ts`) is a pure conversation pipeline: receive message, assemble context, call AI, return text. There is no mechanism for the AI to trigger database mutations. Adding tool/function calling means building an entirely new execution layer. Developers often ship the conversational interface first and add tool execution later, creating a window where Jarvis sounds capable but isn't.

**How to avoid:**
- Build the action execution layer BEFORE expanding the conversational interface. If Jarvis can't actually update goals via conversation, Jarvis should say "Use `/goals update` for that" instead of pretending
- Use function calling / tool use if the LLM supports it (Grok via OpenRouter may not support tool use -- verify before building). If not, use a two-step pattern: AI classifies intent and extracts parameters as structured JSON, then a deterministic handler executes the action
- Never let the AI generate "Done!" confirmation text. Instead: execute the action first, check success, then generate a response that includes the actual result. Pattern: `extractAction() -> executeAction() -> generateConfirmation(result)`
- Add explicit capability declarations in the system prompt: "You CAN: create goals, update goal progress, log check-ins. You CANNOT: delete goals, change settings, modify XP"

**Warning signs:**
- Members report data discrepancies between what Jarvis said and what the database shows
- AI responses include "I've updated..." phrasing without any corresponding database write in the logs
- TokenUsage shows a chat call but no corresponding data mutation

**Phase to address:**
Phase 1 (conversational AI core). The action execution pipeline is foundational -- it must exist before any "do X for me" conversational flow.

---

### Pitfall 5: Cost Explosion from Conversational Volume

**What goes wrong:**
Slash commands are inherently rate-limited by user friction -- typing `/checkin` takes deliberate effort. Conversational AI removes that friction entirely. Members who currently send 2-3 slash commands per day may send 20-30 conversational messages. With 25 members, that is potentially 500-750 AI calls per day instead of the current 50-75. At Grok 4.1 Fast pricing ($0.20/M input, $0.60/M output), the context assembly alone (sending ~50K tokens of member context per call) means each call costs roughly $0.01 input + $0.003 output. At 750 calls/day that is approximately $10/day or $300/month. The current budget target is $0.10/day per member ($75/month total for 25 members).

**Why it happens:**
Conversational interfaces invite longer, more frequent interactions. The "operator" personality encourages back-and-forth. Morning briefs, reflections, and nudges are bot-initiated AI calls that don't count against member message caps but DO consume tokens. The current 500K daily token budget per member and 50 message cap exist but may need recalibration.

**How to avoid:**
- Recalculate the cost model for conversational volume BEFORE shipping. Model: (avg messages/day/member) x (avg context tokens) x (price per token) x members
- Reduce context assembly cost: not every message needs the full 50K+ token context. Quick replies ("thanks", "ok", "lol") can use a lightweight context (last 5 messages + member name only). Route based on message complexity
- Cache the system prompt per member with a TTL (it changes infrequently). Currently `buildSystemPrompt` does 7 database queries every single call. Cache for 5 minutes
- Consider DeepSeek V3.2 as primary for simple conversational turns (much cheaper) and Grok 4.1 Fast only for complex coaching conversations that need the full context
- Proactive messages (briefs, nudges, reflections) should use the fallback model by default -- they are generated text, not conversations needing deep context

**Warning signs:**
- Daily estimated cost exceeds $0.15/member consistently
- Token usage per member doubles after conversational mode launches
- Budget degradation kicks in for active members before end of day

**Phase to address:**
Phase 1 (before launch). Cost model validation and lightweight routing must be designed alongside the conversational core.

---

### Pitfall 6: The Uncanny Valley of Coaching Tone

**What goes wrong:**
The v3.0 spec says "ruthlessly objective coaching tone -- not a persona." But the existing `personality.ts` defines Jarvis as "a sharp personal operator with hustler energy, casual language and slang." These are contradictory. If you ship both, Jarvis oscillates between "Yo bro you crushed it" in casual chat and cold analytical coaching in morning briefs. Members find it jarring. Alternatively, if you strip the personality entirely, Jarvis becomes generic ChatGPT -- boring, members stop engaging.

**Why it happens:**
"Ruthlessly objective" and "personality with hustler energy" are genuinely in tension. The team hasn't resolved which one wins. When different features (chat, briefs, nudges, reflections) are built by different prompts at different times, they each lean differently on this spectrum.

**How to avoid:**
- Decide once: Jarvis has personality BUT is objective about data. The personality is the delivery vehicle, the objectivity is the content. "Your streak is at 12 days but your weekly goals are 0/3 -- real talk, something's off" is both personality AND objectivity
- Create a single canonical tone guide (5-7 bullet points max) that every prompt inherits. Currently `CHARACTER_PROMPT` serves this role but needs updating for v3.0's coaching emphasis
- All proactive messages (briefs, nudges, reflections) should use the same `buildSystemPrompt` as chat -- not separate system prompts. Currently `nudge.ts` already does this correctly
- Test tone consistency: generate 10 sample outputs across all features (chat, brief, nudge, reflection) and read them in sequence. Do they sound like the same entity?

**Warning signs:**
- Members describe Jarvis differently ("sometimes he's chill, sometimes he's weird")
- Different proactive features feel like they come from different bots
- Members engage with chat but ignore proactive messages (or vice versa) due to tone mismatch

**Phase to address:**
Phase 1 (personality redesign). Tone must be locked before any new feature prompts are written.

---

### Pitfall 7: DM-Only Migration Breaks Discoverability

**What goes wrong:**
The v3.0 spec moves to "DMs only -- remove private channel per-member system." But new members who join the Discord server have no idea they can DM Jarvis. Current flow uses private channels that are visible in the server sidebar -- members see them and use them. DMs are invisible to other members, so there is no social proof that anyone is using Jarvis. The onboarding flow must explicitly teach DM interaction, and if it fails (member skips onboarding, doesn't read instructions), the member never discovers the core product.

**Why it happens:**
DMs are a better privacy model (the v1.0 decision was correct) but worse for discoverability. Developers assume members will figure it out. With 10-25 friends, you might be right -- but even friends need clear onboarding.

**How to avoid:**
- Jarvis should initiate the first DM to a new member after setup, not wait for the member to reach out. "Hey [name], I'm Jarvis -- your operator. DM me anytime to check in, set goals, or just talk strategy. I'll also send you morning briefs and accountability nudges here"
- Keep a `#jarvis-tips` channel in the server that shows anonymized examples of what Jarvis can do. Not conversations -- just capabilities
- If a member hasn't DM'd Jarvis within 3 days of setup, send a single DM prompt: "Hey, haven't heard from you yet. Just a reminder -- DM me here for anything productivity-related"
- Consider keeping `/ask` as a server-channel command that responds ephemerally. This gives members a way to interact with Jarvis without remembering to DM

**Warning signs:**
- New members have zero conversation messages after 7 days
- Members ask in public channels how to talk to Jarvis
- Conversation adoption rate is below 80% of active members

**Phase to address:**
Phase 2 (DM migration). Onboarding redesign should happen alongside the channel removal.

---

### Pitfall 8: Per-User Settings Explosion

**What goes wrong:**
The v3.0 spec says "per-user coaching settings -- members configure frequency, intensity, which features are active." With morning briefs, nudges, reflections, recaps, and coaching style, that is potentially 10+ settings per member. Members never configure them. Worse, the default settings are wrong for some members (a "heavy" accountability member who hates morning briefs, or a "light" member who wants weekly recaps). You end up either (a) over-configurable and nobody touches it, or (b) under-configurable and members can't opt out of features they dislike.

**Why it happens:**
Feature teams add a setting for every preference instead of designing good defaults. The current system already has `accountabilityLevel` (light/medium/heavy) which maps to specific nudge behavior -- this pattern works. Trying to expose individual knobs for each feature breaks the abstraction.

**How to avoid:**
- Keep the existing accountability level pattern: 3 tiers that bundle all settings. "Light" = 1 proactive message/day max, morning briefs only on request, no reflection prompts. "Medium" = 2 proactive messages/day, morning briefs daily, weekly reflection. "Heavy" = 3 proactive messages/day, morning briefs + evening recap, reflection prompts after goals complete
- Only add individual feature toggles if members explicitly request them after trying the tier system. Start with zero individual toggles
- Allow natural language opt-out: "Jarvis, stop sending morning briefs" should work and persist. This is easier than a settings UI and feels natural in a conversational system
- Store overrides as a simple JSON blob per member, not as a proliferation of database columns

**Warning signs:**
- Settings table grows to 10+ columns per member
- Members ask "how do I change [setting]" frequently
- Default settings cause opt-out conversations more than once per member

**Phase to address:**
Phase 2 (per-user settings). Design the tier system first, add individual overrides later only if needed.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Single AI call for intent + response | Simpler code, fewer API calls | Can't retry action without regenerating response, intent classification tied to response quality | Never for state-changing actions. OK for pure information queries |
| Hardcoded system prompt per feature | Quick to ship each feature | Prompts diverge, tone inconsistency, maintenance burden as features grow | Only during prototyping -- consolidate before v3.0 GA |
| Fire-and-forget action execution | Fast response to user | Silent failures, no retry, member sees "done" but action failed | Never -- always confirm action success before responding |
| Separate cron jobs per proactive feature | Easy to develop independently | No global rate limiting, message floods, impossible to prioritize | Only during early development with manual testing |
| Storing settings as individual DB columns | Type-safe, easy queries | Schema migration for every new setting, column proliferation | For the 3 core settings (level, timezone, nudgeTime). Use JSON for the rest |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| OpenRouter tool/function calling | Assuming all models support it | Verify Grok 4.1 Fast supports tools via OpenRouter before building. If not, use two-step pattern (classify intent as JSON, then execute) |
| Discord DM rate limits | Sending proactive messages to all members simultaneously | Stagger proactive messages across a 30-minute window. Discord rate limits DM creation (not existing DM channels) |
| Discord message length | Assuming AI responses fit in 2000 chars | Already handled by `splitMessage` in commands.ts -- ensure the conversational DM handler also splits. Multi-message responses in DMs feel natural |
| Grok 2M context window | Sending full context on every call | Current context assembly handles this with tiers. But proactive messages (briefs, nudges) should use minimal context -- they don't need 30 days of conversation history |
| Prisma concurrent writes | Multiple proactive features updating the same member record simultaneously | Use the existing `withMemberLock` pattern from chat.ts for ALL member-scoped operations, including proactive message delivery |
| AI response parsing | Trusting AI to return valid JSON for structured actions | Always wrap JSON.parse in try-catch. Use Zod or similar for schema validation. Retry with a simpler prompt on parse failure, never crash |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full context assembly for every message | Slow response times (>3s), high DB query count | Cache assembled context per member (5-min TTL), invalidate on data changes | >10 messages/member/hour with 25 members |
| `buildSystemPrompt` runs 7 queries per call | Database connection pool exhaustion under load | Cache system prompt with member-scoped TTL, batch parallel queries (already uses Promise.all in some places) | >50 concurrent AI calls |
| Proactive messages trigger context assembly | 25 morning briefs at 8 AM each do full context assembly simultaneously | Use lightweight context for proactive messages (member name + active goals only). Stagger sends over 30 minutes | 25 members all in the same timezone |
| Conversation message table growth | Slow queries on `conversationMessage` table | Already handled by compression. Add composite index on (memberId, createdAt) if not present. Monitor table size | >100K messages total (unlikely at 25 members but possible after months of conversational usage) |
| Summary compression triggered during chat | User waits 5-10 seconds for response while compression runs | Make compression async/background, never block the chat response path | When a member's cold tier exceeds 1000 messages |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| AI-executed actions bypass permission checks | Member asks Jarvis to modify another member's goals via social engineering ("update Ahmed's reading goal") | Action execution layer must verify memberId matches the requesting member. Never accept member references in natural language as authorization |
| Natural language "delete my data" without confirmation | AI interprets casual statement as deletion request, wipes conversation history | Require explicit confirmation for any destructive action. Keep `/deletedata` as the only hard-delete path. System prompt must say "Never delete data without explicit 'yes' confirmation" |
| Prompt injection via member messages | Member crafts a message that overrides Jarvis's system prompt to extract other members' data or bypass budget limits | System prompt already isolates per-member context. Add input sanitization for known injection patterns. Monitor for responses that include system prompt content |
| Proactive messages leak encrypted data in plain text | Morning brief references encrypted reflection content, sent as plain text DM | Ensure proactive message generators use the same decryption + re-encryption pipeline. Better: proactive messages should reference summaries, not raw encrypted fields |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No visual indicator of what Jarvis can do conversationally | Members treat Jarvis as a generic chatbot, missing productivity features | First DM includes a capability card: "I can help with: check-ins, goals, timer, reflections. Just tell me what you need" |
| AI response latency feels broken in DMs | Members see typing indicator for 3-5 seconds with no response and think bot is down | Send `channel.sendTyping()` immediately when message received, before context assembly begins |
| Jarvis asks too many clarifying questions | Feels like filling out a form, not having a conversation | Default to the most likely interpretation and confirm: "Logging that as a check-in -- coding for 3 hours. Sound right?" instead of "Did you mean to check in? What category? How long?" |
| Morning brief is generic and not actionable | Members skip it after day 3 | Brief must reference specific active goals and upcoming deadlines. "Your weekly goal 'Ship landing page' is at 0/1 -- today's the day?" beats "Good morning! What are you working on today?" |
| Proactive message arrives at bad times | 8 AM brief arrives while member is sleeping (timezone misconfiguration), 9 PM nudge arrives during dinner | Use member's configured timezone (already in `MemberSchedule`). Allow time window preferences. Never send proactive messages between 10 PM and 7 AM local time |
| Jarvis responds to every single message | Short messages like "ok" or "thanks" get full AI responses, feels excessive | Detect low-effort messages and either skip response or send a brief acknowledgment without an AI call. Save the budget for real conversations |

## "Looks Done But Isn't" Checklist

- [ ] **Conversational check-in:** Often missing category extraction from natural language -- verify AI extracts categories consistent with `/checkin` format and the XP engine scores correctly
- [ ] **Goal update via chat:** Often missing validation (negative values, exceeding target, wrong goal ID) -- verify same validation rules as `/goals update` apply to conversational updates
- [ ] **Morning brief delivery:** Often missing timezone handling -- verify brief sends at member's local morning, not server time. Current nudge system handles this but new brief system must too
- [ ] **Natural language opt-out:** Often missing persistence -- verify "stop morning briefs" is stored and respected across bot restarts (PM2 restart recovery)
- [ ] **DM conversation history:** Often missing multi-account handling -- verify conversation is tied to memberId not discordId, so linked accounts share conversation history
- [ ] **Proactive message scheduling:** Often missing bot restart recovery -- verify scheduled messages resume after PM2 restart. Current cron jobs may not survive restarts cleanly
- [ ] **Cost tracking for proactive messages:** Often missing proactive calls in token tracking -- verify morning briefs, nudges, and reflections all route through `callAI` with correct feature tags
- [ ] **Action confirmation flow:** Often missing timeout handling -- if member never responds to "Want me to log that?", the pending action should expire after 5 minutes, not hang forever
- [ ] **Conversation context after actions:** Often missing context update after action execution -- if Jarvis just logged a check-in, the next message's context assembly should reflect the new check-in in recent activity

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Intent misclassification shipped | LOW | Add confirmation step for state-changing intents. No data loss, just UX friction increase |
| Notification fatigue (members muted bot) | MEDIUM | Cannot detect mute via Discord API. Send a server announcement about new quiet settings. Members who muted must manually unmute -- you need to give them a reason to |
| Stale context hallucination | LOW | Inject correction messages into conversation history. Update summary compression to cross-reference live data. Add system prompt guardrail |
| Action execution without verification | HIGH | Audit all action logs against database state. Revert incorrect mutations. Members lose trust -- requires personal outreach to affected members |
| Cost explosion | LOW | Immediately enable DeepSeek as primary for chat, keep Grok for coaching-heavy calls only. Reduce context assembly size. Budget enforcement already exists |
| Tone inconsistency | LOW | Update CHARACTER_PROMPT once, all features inherit via `buildSystemPrompt`. Test with 10 sample outputs across features |
| DM discoverability failure | LOW | Send a one-time server announcement + Jarvis-initiated DMs to all members. Retroactive fix is easy |
| Settings explosion | MEDIUM | Migrate individual columns back to JSON blob or tier bundles. Requires schema migration but no data loss |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Intent detection regression | Phase 1 (conversational core) | Test: send 20 ambiguous messages, verify correct intent classification rate >95% and all state-changing intents get confirmation prompts |
| Proactive message fatigue | Phase 2 (proactive routines) | Verify: global daily outreach budget exists, no member receives >3 proactive messages/day across all features combined |
| Stale context hallucination | Phase 1 (context management) | Test: complete a goal, then chat -- verify Jarvis does not reference it as active. Check that system prompt includes "CURRENT STATS is authoritative" instruction |
| Action execution gap | Phase 1 (conversational core) | Test: request a goal update via conversation, verify database reflects the change AND response confirms actual result (not hallucinated confirmation) |
| Cost explosion | Phase 1 (before launch) | Verify: cost model spreadsheet shows <$0.15/member/day at projected conversational volume. Lightweight routing exists for simple messages |
| Coaching tone uncanny valley | Phase 1 (personality redesign) | Review: generate 10 sample outputs across all features (chat, brief, nudge, reflection), read in sequence -- they must sound like the same entity |
| DM discoverability | Phase 2 (DM migration) | Verify: 100% of members receive an onboarding DM within 1 minute of setup. Track adoption: >80% of members should have >0 conversations within 7 days |
| Settings explosion | Phase 2 (per-user settings) | Verify: settings use tier bundles (light/medium/heavy), individual overrides stored as JSON blob, total DB columns for settings stays under 5 |

## Sources

- Codebase analysis: `apps/bot/src/modules/ai-assistant/chat.ts` -- current chat pipeline architecture, per-member locking, daily message cap (50), context assembly flow
- Codebase analysis: `apps/bot/src/modules/ai-assistant/memory.ts` -- tiered memory system (hot/warm/cold), token budgets (1.4M context, 50K system prompt reserve), summary compression logic
- Codebase analysis: `apps/bot/src/modules/ai-assistant/personality.ts` -- CHARACTER_PROMPT definition, system prompt builder with 7 DB queries per call, tone definition
- Codebase analysis: `apps/bot/src/modules/ai-assistant/nudge.ts` -- current proactive messaging (accountability levels, daily caps, silence detection, notification routing)
- Codebase analysis: `apps/bot/src/modules/ai-assistant/commands.ts` -- current slash command interface (/ask, /wipe-history, /accountability), message splitting
- Codebase analysis: `apps/bot/src/shared/ai-client.ts` -- centralized AI client with budget enforcement (500K daily tokens), model routing (Grok primary, DeepSeek fallback), cost tracking
- Domain knowledge: conversational AI coaching patterns, Discord bot development constraints, LLM cost management, notification fatigue research
- Note: web search was unavailable for this research session. Confidence is MEDIUM. Key areas to validate during implementation: (1) OpenRouter tool/function calling support for Grok 4.1 Fast, (2) actual per-call cost at projected conversational volume, (3) Discord DM rate limits for proactive messaging at scale

---
*Pitfalls research for: Discord Hustler v3.0 Jarvis Coach Evolution*
*Researched: 2026-03-22*
