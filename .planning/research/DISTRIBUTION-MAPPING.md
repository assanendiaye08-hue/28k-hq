# Distribution & Integration Mapping

**Project:** Discord Hustler
**Researched:** 2026-03-22
**Mode:** First Principles -- Distribution & Integration Mapping
**Overall confidence:** HIGH (grounded in existing codebase analysis + ecosystem research)

---

## Executive Summary

The system has three delivery channels (Discord server, Jarvis DMs, Tauri desktop app) that currently overlap in goal management and have unclear boundaries around coaching touchpoints. The core problem is not "what features to build" -- most features already exist (v2.0 shipped 49 plans across 3 milestones). The problem is **which channel owns what moment in the user's day**, and how to prevent the channels from competing for attention.

The answer follows from one principle: **each channel should match the user's cognitive mode at the moment they use it**. The Discord server is for social energy (seeing others work, celebrating, competing). Jarvis DMs are for private coaching (reflection, planning, accountability). The desktop app is for execution (timer, goals-in-progress, today's priorities). They should never duplicate the same interaction. Goals live in the database; each channel shows a different *view* of goals appropriate to its context.

Integration priorities follow the same test: does this integration serve a moment in the user's day, or is it a novelty? Google Calendar is high-leverage because it tells the app *when* free blocks exist. Browser focus extensions are high-leverage because they enforce the timer's promise. Apple Watch is moderate-leverage for haptic timer alerts. Everything else (Notion, Todoist, Slack) is a gimmick for a 10-25 person friend group that already lives on Discord.

---

## The Daily Flow: Channel Mapping

This is the core deliverable. Every feature and integration decision derives from this flow.

### Wake Up --> Morning Brief (Jarvis DM)

**Channel:** Jarvis DM (bot-initiated)
**Cognitive mode:** Transitioning from sleep, needs orientation
**What happens:** Jarvis sends a personalized morning brief at the member's configured time. Contains streak status, today's priority goals, community pulse ("3 people already checked in"), and a natural follow-up on yesterday's conversations.

**Why DM, not desktop app:** The morning brief is a *push* notification -- it comes to the user, not the other way around. Discord DMs are where the user already gets messages. Opening the desktop app requires intent; the brief should arrive before intent forms.

**Current state:** Already implemented (`scheduler/briefs.ts`). Working well. v3.0 should evolve the tone toward pure conversational coaching -- less embed-heavy, more "hey, here's your day."

### Plan the Day --> Desktop App Dashboard

**Channel:** Desktop app (user-initiated)
**Cognitive mode:** Intentional, planning, executive function active
**What happens:** User opens the app (or it auto-launches on login). Dashboard shows today's priorities, weekly goals with progress, streak, rank. User reviews and adjusts goals -- adds today's tasks, marks completions, reprioritizes.

**Why desktop app, not DM:** Planning requires visual hierarchy -- seeing goals as a tree, comparing priorities, dragging to reorder. This is a *visual workspace* task. Discord embeds cannot do this. The app is the cockpit; planning happens in the cockpit.

**Current state:** Dashboard (`DashboardPage.tsx`) shows priorities, weekly goals, streak, rank, daily quote. Goals page (`GoalsPage.tsx`) provides CRUD. v3.0 should add a "today" view -- a focused list of just today's tasks pulled from the goal hierarchy.

### Work Session --> Desktop App Timer

**Channel:** Desktop app (user-initiated)
**Cognitive mode:** Deep focus, minimal interruption
**What happens:** User starts a pomodoro or flowmodoro timer. Menu bar shows countdown. App goes into minimal mode -- timer and nothing else visible. When the session ends, XP syncs to API in the background. Break timer starts automatically.

**Why desktop app only:** The timer is the most distraction-sensitive feature. It must be always-visible (menu bar) and never require switching to Discord. The bot timer module should be removed (already planned for v3.0). Desktop owns execution.

**Current state:** Fully implemented with local-first architecture, menu bar countdown, alarm transitions, XP sync. This is done.

### Mid-Day Check-In --> Jarvis DM (bot-initiated or user-initiated)

**Channel:** Jarvis DM
**Cognitive mode:** Taking a break, reflecting on progress
**What happens:** Either the user messages Jarvis naturally ("done with my morning block, crushed it"), or Jarvis sends a configured reminder if the user hasn't checked in by their reminder time. The check-in is conversational in v3.0 -- no `/checkin` slash command needed. Jarvis extracts categories and scores from natural language.

**Why DM:** Check-ins are private, personal, and conversational. They are the core coaching interaction. The server should never see raw check-in data. DMs are where vulnerability lives.

**Current state:** `/checkin` slash command exists. v3.0 evolves this to natural conversation -- Jarvis parses "I coded for 4 hours and hit the gym" into structured data without requiring a form.

### See Others Working --> Discord Server Voice Channels

**Channel:** Discord server
**Cognitive mode:** Seeking social energy, accountability through presence
**What happens:** User joins "The Lab" or "The Office" voice channel. Camera optional. Muted by default. The act of being in a voice channel with others creates the "library effect" -- silent co-presence that reduces procrastination. Voice tracker awards XP passively. Other members see who is in voice channels, creating social proof.

**Why server:** This is the only channel that requires other people. Body doubling is inherently social. The server provides ambient presence -- seeing 3 people in "The Lab" at 10 AM creates pull.

**Current state:** Two voice channels exist (The Lab, The Office). Voice tracker with AFK detection, XP awards (1 XP/3 min, 200/day cap). Lock-in sessions provide structured group work. This is solid.

### Share a Win or Lesson --> Discord Server Channels

**Channel:** Discord server (#wins, #lessons)
**Cognitive mode:** Social, celebratory, reflective
**What happens:** User posts a win or lesson in the appropriate channel. Bot reacts with emoji, awards XP. Other members see it, react, discuss in threads. The leaderboard updates.

**Why server:** Wins and lessons are social signals. They need an audience. Posting a win in DMs has no social payoff. The server channels provide visibility and community reinforcement.

**Current state:** Fully implemented with XP, reactions, cooldowns. Leaderboard channel auto-updates. This works.

### End of Day --> Jarvis DM (bot-initiated)

**Channel:** Jarvis DM
**Cognitive mode:** Winding down, reflective
**What happens:** At the member's configured reflection time, Jarvis initiates an end-of-day reflection. Intensity varies by member preference (off/light/medium/heavy). Jarvis asks a personalized question based on the day's activity, waits for response, provides acknowledgment and forward-looking suggestion. XP awarded for completing reflection.

**Why DM:** Reflection is deeply personal. It requires vulnerability and honesty. The server is not the place for "I procrastinated all afternoon and I'm not sure why." DMs provide safety.

**Current state:** Fully implemented with DAILY/WEEKLY/MONTHLY cycles, configurable intensity, AI-generated questions, insight extraction. This is one of the strongest features.

### Weekly Planning --> Jarvis DM (bot-initiated, Sunday)

**Channel:** Jarvis DM
**Cognitive mode:** Strategic, looking ahead
**What happens:** Sunday planning session. Weekly reflection first (how did last week go?), then planning (what are this week's priorities?). Jarvis prompts goal decomposition if yearly goals lack sub-goals.

**Why DM:** Same as reflection -- private, conversational, requires thought. The app dashboard *shows* goals; the DM *coaches* goal-setting.

**Current state:** Implemented via `scheduler/planning.ts` with configurable Sunday planning toggle.

### Community Pulse --> Discord Server

**Channel:** Discord server (#general, #leaderboard, #accountability)
**Cognitive mode:** Social, competitive, community-oriented
**What happens:** Members chat, compare progress, discuss challenges. Leaderboard shows multi-dimensional rankings (XP, voice, streaks). Seasonal system creates time-boxed competition. Auto-feed posts curated content.

**Why server:** Everything here requires multiple people seeing the same thing. Competition needs a public stage.

**Current state:** All implemented. Strong foundation.

---

## Channel Ownership Rules

These are the definitive boundaries. Every feature request should be tested against these rules.

| Rule | Rationale |
|------|-----------|
| **The app SHOWS, the DM COACHES, the server SOCIALIZES** | Matches cognitive modes. Visual workspace vs. conversation vs. community. |
| **Goals are stored once, displayed everywhere** | Database is the single source of truth. App shows editable tree. DM references goals conversationally. Server shows anonymized progress on leaderboards. |
| **Push goes to DMs, pull comes from the app** | Morning briefs, nudges, reflections, reminders push to DMs because they arrive before intent. The app serves intent -- user opens it when they want to work. |
| **Voice channels are server-only** | Body doubling requires co-presence. This is inherently a Discord server feature. |
| **Timer is app-only** | Post-v3.0, the bot timer module is removed. Desktop app owns the execution loop. Timer data syncs to API for XP and leaderboard. |
| **Check-ins move to DM conversation** | v3.0 drops `/checkin` as the primary interface. Users talk to Jarvis naturally, and Jarvis extracts check-in data. The slash command remains as a fallback. |
| **No server-private data** | Check-ins, reflections, goals with personal notes, coaching conversations -- all DM-only. Server channels only show public-facing data (leaderboard rankings, win/lesson posts, session participation). |
| **Slash commands are quick lookups, not workflows** | `/leaderboard`, `/goals`, `/reminders` remain for glanceable info in Discord. But the *workflow* for managing goals is in the app; the *workflow* for coaching is in DMs. |

---

## Discord Server: Channel Structure Recommendations

### Keep (High-Value)

| Channel | Category | Why Keep |
|---------|----------|----------|
| #welcome | WELCOME | First impression, manifesto |
| #general | THE GRIND | Community conversation, the heartbeat |
| #wins | THE GRIND | Social proof, celebration, high engagement |
| #lessons | THE GRIND | Vulnerability, learning, community depth |
| #accountability | THE GRIND | Public commitments, peer pressure |
| The Lab (voice) | VOICE | Co-working, body doubling, library effect |
| The Office (voice) | VOICE | Alternative vibe, quieter option |
| #leaderboard | THE GRIND | Auto-updating competition board |
| #auto-feed | RESOURCES | Curated content, passive value |

### Evaluate (Moderate-Value)

| Channel | Current Category | Recommendation |
|---------|-----------------|----------------|
| #sessions | THE GRIND | Keep but simplify. Lock-in session announcements are useful for "anyone want to work together?" but don't need a dedicated channel if volume is low. Could merge into #general with a tag/thread system. |
| #tech-resources | RESOURCES | Keep only if members actually post here. If all sharing happens via auto-feed, remove and let #auto-feed cover it. |
| #business-resources | RESOURCES | Same evaluation as tech-resources. |
| #growth-resources | RESOURCES | Same evaluation. Three resource channels for 10-25 people is likely over-structured. |

### Recommended Changes

1. **Consolidate resources.** Three resource channels for a 10-25 person server is too many. Merge into a single `#resources` channel. Auto-feed gets its own channel (already exists). Members can share manually in `#resources`.

2. **Add an #active-now channel** (or repurpose #sessions). Bot auto-posts when someone starts a voice session or timer session. Creates "live activity" feed that shows the library effect without requiring voice. Example: "Alex started a 50-min flow session" or "3 people are in The Lab right now." This is the digital equivalent of seeing people studying in the library.

3. **Remove PRIVATE SPACES category** (already planned for v3.0). All private interaction moves to DMs. The per-member private channels added complexity without enough value.

### Voice Channel Design

**Current:** Two voice channels (The Lab, The Office).
**Recommendation:** Keep exactly two. More channels fragment presence -- if 3 people split across 3 channels, nobody gets body doubling benefit. Two channels create natural density:

- **The Lab** -- Silent co-working. Mics off by default. For deep focus.
- **The Office** -- Light conversation OK during breaks. Social working.

**Add:** A "Session in Progress" stage channel for scheduled lock-in sessions. When someone uses `/lockin`, a temporary voice channel appears, visible in the channel list. This creates urgency and visibility ("oh there's a session happening, let me join"). Channel auto-deletes when session ends. This already exists in the sessions module.

---

## Jarvis DM: Coaching Cadence Design

### The Right Touchpoint Frequency

Research shows 2-3 daily touchpoints is the sweet spot for AI coaching engagement. More causes notification fatigue; fewer loses the coaching thread.

**Recommended daily cadence:**

| Time | Touchpoint | Initiated By | Tone |
|------|-----------|--------------|------|
| Morning (user-configured) | Morning brief | Bot | Energizing, orienting. "Here's your day." |
| Midday (user-configured) | Check-in reminder | Bot (conditional) | Gentle nudge, only if not checked in. "How's it going?" |
| Evening (user-configured) | Reflection prompt | Bot (conditional) | Thoughtful, retrospective. "What worked today?" |

**Plus on-demand:** User can message Jarvis anytime. Natural conversation about goals, progress, challenges, planning.

### When to Reach Out vs. Wait

**Reach out when:**
- Scheduled touchpoint time arrives (morning brief, check-in reminder, reflection)
- Streak is at risk and user hasn't checked in by their nudge time
- A goal deadline is approaching (24h warning)
- Weekly planning session (Sunday)
- Monthly recap (1st of month)

**Wait when:**
- User already checked in today (skip the reminder)
- User was active in the last 2 hours (they don't need a nudge)
- User has explicitly set accountability to "light" (respect the boundary)
- User is in a voice session (they're working -- don't interrupt)

**Critical rule:** Never send more than 3 bot-initiated messages in a day. Even at "heavy" accountability, 3 is the ceiling. Every message must pass the test: "Would this message make someone *more* productive, or just make them feel surveilled?"

### What Makes People Respond vs. Ignore

| Drives Response | Kills Response |
|----------------|----------------|
| Specific references to their goals/activity ("You said you'd finish the API this week -- how's that going?") | Generic messages ("Time to check in!") |
| Brevity (1-3 sentences for nudges) | Walls of text |
| Personality and warmth | Robotic phrasing |
| Agency ("Want me to help break that down?" not "You should break that down") | Commands and demands |
| Natural timing (not interrupting deep work) | Interruptions during work hours |
| Acknowledging when they're doing well | Only showing up when they're failing |

**Current implementation quality:** High. The nudge system already has accountability levels, tone adaptation, silence detection, and fallback messages. v3.0's shift to pure conversation will make this even better.

---

## Desktop App: The Cockpit Instruments

### What Belongs in the App

The app should show exactly what a pilot needs at a glance. No more, no less.

| Instrument | Purpose | Priority |
|------------|---------|----------|
| **Timer** (existing) | Execute work sessions. Pomodoro and flowmodoro. Menu bar countdown. | P0 -- shipped |
| **Today's Priorities** (existing) | What to work on right now. Pulled from goal hierarchy. | P0 -- shipped |
| **Weekly Goals** (existing) | Context for today's priorities. Progress bars. | P0 -- shipped |
| **Streak & Rank** (existing) | Gamification motivation at a glance. | P0 -- shipped |
| **Daily Quote** (existing) | Inspiration. Low cognitive load. | P1 -- shipped |
| **Quick Goal Update** (existing) | Mark progress without leaving the cockpit. | P0 -- shipped |

### What to Consider Adding

| Instrument | Purpose | Priority | Rationale |
|------------|---------|----------|-----------|
| **"Today" Focus View** | A stripped-down view showing ONLY today's active tasks + timer. No weekly goals, no rank, no quote. Just the work. | P1 | When you're in a flow session, the dashboard has too much information. A focus view reduces to: what am I working on + how long have I been working. |
| **Session History** | Today's completed timer sessions with durations. | P2 | "I worked 3h42m today across 4 sessions" is motivating. Simple list, not a complex analytics page. |
| **Active Now Indicator** | Small badge showing how many community members are currently in voice channels or have active timer sessions. | P2 | Library effect in the app. "2 people working right now" creates ambient accountability without requiring Discord. |

### What Does NOT Belong in the App

| Anti-Feature | Why Not |
|--------------|---------|
| **Chat with Jarvis** | Coaching belongs in DMs. Adding chat to the app duplicates the DM channel and splits conversation history. Keep the app distraction-free. |
| **Leaderboard** | Competition belongs on the server where others can see. Leaderboard in the app is solo viewing with no social energy. |
| **Wins/Lessons posting** | Social sharing belongs on the server. The app is for work, not social. |
| **Full analytics dashboard** | Too much data creates analysis paralysis. Monthly recaps (via DM) handle retrospective analytics. The app stays present-focused. |
| **Notification center** | The app should not become another inbox. DMs handle notifications. The app is a workspace, not a notification surface. |
| **Calendar view** | Out of scope per PROJECT.md. Even as an integration, showing calendar in the app adds complexity for marginal value. The user already has their calendar open. |

### Design Principle

The app should feel like a **physical desk timer** -- minimal, focused, always visible, never demanding attention. The user should be able to glance at it in 2 seconds and know: what they're working on, how long they've been working, and what's next. Everything else is noise.

---

## Integration Assessment

Evaluated by leverage (does this serve a real moment in the daily flow?) and complexity (maintenance cost for a single developer).

### Tier 1: High Leverage, Worth Building

| Integration | Serves Which Moment | How It Works | Complexity |
|-------------|---------------------|--------------|------------|
| **Google Calendar (read-only)** | Morning planning | Desktop app reads today's calendar events to show free blocks alongside goals. User can plan timer sessions around meetings. API is mature, OAuth via `tauri-plugin-google-auth` is proven. | Medium -- OAuth setup, API calls, display. No write-back needed. |
| **Browser Focus Extension** | Work session execution | When a timer session starts in the desktop app, a companion Chrome/Firefox extension blocks distracting sites. When timer ends (break), sites unblock. Communication via local WebSocket or native messaging. | Medium -- separate extension codebase, but the pattern is well-established (Otto, FlowLock, etc.) |
| **Apple Push Notifications (APNs)** | Coaching touchpoints | Push morning briefs, nudges, and reflection prompts to iPhone/Apple Watch when Discord app isn't open. Pluggable delivery backend already exists in the notification router. | Medium -- requires Apple Developer account, server-side APNs integration. But the architecture is ready (`deliverNotification` already abstracts delivery). |

### Tier 2: Moderate Leverage, Build Later

| Integration | Assessment | Why Not Now |
|-------------|-----------|-------------|
| **Apple Watch Complications** | Timer countdown on wrist. Haptic tap when session ends. Glanceable streak/rank. | Requires watchOS companion app. High development cost for a "nice to have." Wait until mobile app exists. |
| **Apple Shortcuts** | "Hey Siri, start a focus session" triggers timer via URL scheme. | Tauri supports URL schemes. Low complexity but niche usage. Build after core v3.0. |
| **Slack Notifications** | Some members may use Slack for work. Forward morning briefs there. | Only useful if members actually use Slack. Survey first. |

### Tier 3: Low Leverage, Do Not Build

| Integration | Why Skip |
|-------------|---------|
| **Notion Sync** | Friends group, not enterprise. Nobody needs goals in Notion AND the app. Single source of truth means pick one -- and the app is the one. |
| **Todoist Sync** | Same as Notion. The app's goal/task system IS the task manager. Syncing to Todoist creates two sources of truth, which is the exact problem SSOT research warns against. |
| **Spotify/Music Integration** | Gimmick. Users already have Spotify open. Adding a music widget to the app is scope creep. |
| **GitHub Integration** | Tracks code commits as productivity metric. Sounds cool, is useless. Commit count is not a meaningful productivity signal. |
| **Mobile App** | Explicitly out of scope per PROJECT.md. APNs covers the "reach user on mobile" need without a full app. |
| **Activity/Window Tracking** | Explicitly out of scope per PROJECT.md. Also surveillance-adjacent, which conflicts with the owner-blind privacy philosophy. |

### Integration Decision Framework

For any future integration proposal, apply this test:

1. **Which moment in the daily flow does this serve?** If you can't name a specific moment, it's a gimmick.
2. **Does this create a second source of truth?** If yes, don't build it. Data lives in one place.
3. **Would a member notice if it stopped working?** If not, it's not high-leverage.
4. **Can a single developer maintain it?** If it requires monitoring a third-party API for breaking changes, the maintenance cost may exceed the value.

---

## Preventing Channel Overlap

This is the most important section. Overlap is what kills multi-channel systems.

### The Goal Overlap Problem

Goals currently live in:
- Desktop app (Goals page -- full CRUD, tree view)
- Bot (slash commands: `/setgoal`, `/goals`, `/progress`)
- Jarvis DMs (conversational goal-setting, decomposition)

**Resolution:** The database is the single source of truth. Each channel provides a *different interface* to the same data:

| Channel | Goal Interface | Operations |
|---------|---------------|------------|
| Desktop app | Visual tree with drag-and-drop, progress bars, inline editing | Full CRUD (create, read, update, complete, delete) |
| Jarvis DM | Conversational. "I want to launch my app by June" -> Jarvis creates goal, suggests decomposition | Create, update progress conversationally, get coaching on goals |
| Server | `/goals` slash command for quick read-only view. Leaderboard shows goal completion rates anonymously. | Read-only summary |

**Key rule:** The desktop app is the *primary* goal management interface. Jarvis DMs are the *coaching* interface for goals. The server shows *social* views of goals. All write to the same database.

### The Timer Overlap Problem

Timer currently lives in:
- Desktop app (pomodoro/flowmodoro, menu bar countdown)
- Bot (timer module with `/timer start`, `/timer stop`)

**Resolution:** v3.0 removes the bot timer module. Desktop app owns timer execution. Bot reads timer data (via API) for context in coaching ("You've done 3 sessions today, nice") but does not start/stop timers.

### The Notification Overlap Problem

The user could receive:
- Morning brief (DM)
- Check-in reminder (DM)
- Nudge (DM)
- Reflection prompt (DM)
- Goal deadline warning (DM)
- Session invite (DM)
- Desktop app notification (system notification from Tauri)

**Resolution:** All coaching notifications go through Jarvis DMs via the notification router. The desktop app uses system notifications ONLY for timer events (session end, break end). The app never sends coaching/motivation notifications -- that's Jarvis's job.

| Notification Type | Channel | Justification |
|-------------------|---------|--------------|
| Morning brief | DM | Push -- comes before intent |
| Check-in reminder | DM | Push -- coaching |
| Accountability nudge | DM | Push -- coaching |
| Reflection prompt | DM | Push -- coaching |
| Goal deadline | DM | Push -- coaching |
| Timer session end | Desktop (system notif) | Execution context -- user is working at the computer |
| Break end | Desktop (system notif) | Execution context |
| Session invite | DM | Social -- comes from another member |
| Level up | DM | Celebration -- personal |
| Leaderboard update | Server channel | Social -- public |

---

## The Complete Day: Channel Choreography

```
06:30  [DM]     Jarvis: Morning brief arrives. Streak, goals, community pulse.
06:35  [APP]    User opens app. Sees dashboard: priorities, weekly goals, streak.
06:40  [APP]    User adjusts today's goals. Starts 50-min flowmodoro.
06:40  [APP]    Menu bar: countdown timer running.
07:30  [APP]    Timer alarm. Break starts. XP syncs in background.
07:30  [DM]     (No message -- user is managing themselves)
07:35  [APP]    Break ends. User starts another session.
09:00  [SERVER] User joins The Lab voice channel. 2 others already there.
09:00  [APP]    Timer running + voice session passive tracking.
10:00  [DM]     User messages Jarvis: "Good session, coded the auth flow"
10:00  [DM]     Jarvis: "Nice. That's 3 sessions today. Auth flow was on your
                 weekly list -- you're ahead. Want to keep going or switch focus?"
12:00  [DM]     (If user hasn't checked in) Jarvis: gentle reminder
14:00  [SERVER] User posts in #wins: "Auth flow shipped!"
14:00  [SERVER] Bot reacts with emoji, awards XP.
18:00  [APP]    User glances at dashboard: 5 sessions, 4h12m focused today.
20:00  [DM]     Jarvis: Reflection prompt. "What worked today?"
20:05  [DM]     User reflects. Jarvis acknowledges, extracts insights.
21:00  [SERVER] User hangs out in #general. Casual chat. Sees leaderboard.
```

No moment in this day involves two channels competing for the same task. Each channel activates at the right moment for the right cognitive mode.

---

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Channel boundaries | HIGH | Derived from first principles (cognitive modes) + codebase analysis of existing implementations |
| Daily flow mapping | HIGH | Based on existing scheduler/briefs/reflection code + productivity research |
| Server channel recommendations | MEDIUM | Channel consolidation advice based on 10-25 person group size. May need adjustment if group grows. |
| Voice channel design | HIGH | Body doubling research is well-established. Two channels create density. |
| DM coaching cadence | HIGH | Aligns with existing nudge/accountability system design. 2-3 touchpoints/day supported by engagement research. |
| Desktop app scope | HIGH | Current implementation is already well-scoped. Recommendations are incremental. |
| Tier 1 integrations | MEDIUM | Google Calendar and browser extension feasibility verified through docs. APNs architecture ready. Implementation complexity estimates may vary. |
| Tier 3 integration rejections | HIGH | Strong rationale grounded in SSOT principle and maintenance cost for solo developer. |

---

## Sources

- Codebase analysis: `apps/bot/src/modules/` (25 modules analyzed), `apps/desktop/src/pages/` (5 pages), `apps/api/src/routes/` (6 routes)
- Body doubling research: [bodydoubling.com](https://bodydoubling.com/how-to-discord/), [Focusmate design principles](https://chadd.org/attention-article/focusmate-virtual-coworking/), [Cohorty](https://www.cohorty.app/blog/body-doubling-for-adhd-virtual-co-working-that-actually-works)
- Notification fatigue: [Zigpoll notification frequency study](https://www.zigpoll.com/content/how-do-varying-notification-frequencies-impact-user-engagement-and-perceived-value-within-mobile-project-management-applications), [Instagram notification ranking (InfoQ)](https://www.infoq.com/news/2025/09/instagram-notification-ranking/)
- Discord server structure: [Discord community best practices 2025](https://www.influencers-time.com/build-a-successful-discord-community-best-practices-2025/), [Discord channel ideas](https://superprofile.bio/blog/channels-discord-ideas)
- Flow state app design: [Flow app](https://www.flow.app/), [MindDock](https://minddock.app/)
- Single source of truth: [Anthill SSOT](https://anthill.co.uk/insights/solve-your-productivity-problems/), [Unito SSOT critique](https://unito.io/blog/single-source-of-truth-possible/)
- Tauri Google Calendar: [tauri-plugin-google-auth (crates.io)](https://crates.io/crates/tauri-plugin-google-auth), [OAuth in Tauri (Medium)](https://medium.com/@Joshua_50036/implementing-oauth-in-tauri-3c12c3375e04)
- AI coaching engagement: [Rocky.ai](https://www.rocky.ai/), [AI coaching apps review](https://www.theleadershipcoachinglab.com/blog/ai-coaching-apps-review)
- Browser focus extensions: [Otto](https://ottoapp.me/), [Blaawk](https://blaawk.com/)
