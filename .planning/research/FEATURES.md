# Feature Research

**Domain:** Desktop productivity companion app (timer, goals, dashboard) for existing Discord bot platform
**Researched:** 2026-03-21
**Confidence:** MEDIUM-HIGH (synthesis of competitor analysis across Flow, Be Focused Pro, Pomotroid, TomatoBar, Flowmo, Pomofocus; established UX patterns for menu bar apps; goal hierarchy visualization research; gamification dashboard patterns)

## Context: What the Discord Bot Already Has

The desktop app is a visual companion to an existing Discord bot (v1.1, 23,564 LOC TypeScript). These features already exist and the desktop app syncs to them via a Fastify REST API:

- Pomodoro + proportional timer with NLP starts, buttons, DM delivery
- Goal hierarchy (yearly -> quarterly -> monthly -> weekly, cascading progress, Jarvis decomposition)
- XP engine with 9 source types, streak multipliers, diminishing returns
- Rank progression (7 tiers, auto-role assignment)
- Leaderboards, seasons, voice tracking
- AI assistant "Jarvis", morning briefs, accountability nudges
- Check-ins, reminders, reflections, monthly recaps
- Inspiration system with natural Jarvis references

The desktop app does NOT replicate bot logic. It provides visual UX for features that are awkward in Discord embeds: countdown timers, goal trees, and at-a-glance dashboards.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist in any desktop productivity timer app. Missing these means the app feels unfinished.

#### Timer: Setup and Configuration

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Pomodoro mode with custom intervals** | Every competitor (Flow, Be Focused, Pomotroid, Pomofocus) offers configurable work/break/long break durations. Standard 25/5/15 is the default but users demand flexibility. | LOW | Store presets locally + sync active session to API. Common alternatives: 50/10/20 for deep work, 52/17 from DeskTime research. |
| **Number of sessions before long break** | Standard pomodoro is 4 work sessions then a long break. Be Focused Pro, Pomotroid, and Flow all let you configure this. | LOW | Default to 4. Store in local preferences. |
| **Flowmodoro mode (count-up timer)** | Flowmodoro/Flowtime technique is the established alternative for deep work. Flowmo (10K+ users) proves demand. Counts up during work, auto-calculates break as work_time/5. | MEDIUM | Requires different UI state: no countdown ring, just elapsed time. Break timer is derived (divide by 5). Must clearly indicate "you're in flow" vs "take a break now." |
| **Session naming/labeling** | Be Focused Pro, Pomofocus, and Flow all let you label what you're working on. Without this, timer sessions are meaningless data. Anti-pattern identified: apps that don't let users name sessions lose tracking value. | LOW | Text input on setup screen. Syncs to API so the bot can reference "you worked on X for 2 hours today." |
| **Preset configurations** | Quick-start without fiddling with settings. Pomofocus offers presets (25/5/15, 50/10/20). Flow has "Quick Start." Users want one-click start for their usual routine. | LOW | 2-3 built-in presets + ability to save custom presets. |

#### Timer: Running State and Menu Bar

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Menu bar countdown display** | TomatoBar, Flow, Horo, Pommie, Cherry Tomato all show remaining time in the menu bar text. This is the defining UX of a menu bar timer -- you glance up and see "14:32" without switching windows. | MEDIUM | Tauri v2 system tray supports dynamic text/icon updates. Update every second. Show "MM:SS" format. When idle, show the app icon (gold ouroboros) only. |
| **Click menu bar to expand controls** | Flow and TomatoBar: clicking the menu bar icon opens a popover with play/pause/skip/stop. Not a full window -- a compact dropdown. | MEDIUM | Tauri tray click event -> open a small positioned window anchored to tray icon. This is the primary interaction surface during a running session. |
| **Play/pause/skip/stop controls** | Every timer app has these. Pause preserves remaining time. Skip moves to next phase (work->break or break->work). Stop resets entirely. | LOW | Standard state machine: idle -> working -> break -> working -> ... -> long_break -> idle. |
| **Visual phase indicator** | Users need to know instantly: am I in work or break? Flow uses color changes. Pomotroid changes the accent color per phase. Be Focused changes the icon. | LOW | Work = gold accent, Break = muted/green accent. Visible in both menu bar icon tint and popover UI. |
| **Progress ring/arc in popover** | Flow and Pomotroid show a circular progress indicator draining as time passes. More glanceable than raw numbers. | LOW | SVG/CSS circle with stroke-dashoffset animation. Standard implementation. |
| **Session counter** | "Session 2 of 4" -- users need to know where they are in the pomodoro cycle. Pomotroid shows round indicators (dots). Be Focused shows completed/target. | LOW | Dots or "2/4" text in popover. |

#### Timer: Transitions and Notifications

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **OS notification on phase transition** | Every competitor sends a native notification when work ends or break ends. TomatoBar calls them "discreet actionable notifications." Stretchly warns 30 seconds before break. | LOW | Tauri notification API. "Work session complete -- time for a break!" with action buttons (Start Break / Skip Break). |
| **Alarm sound on transition** | Be Focused Pro, Pomotroid, and Flow all play a sound. Multiple alarm sound options is common. Volume control is expected. | LOW | Bundle 3-4 alarm sounds. Default to a clean chime, not jarring. Let user pick in settings. |
| **Auto-start next phase (optional)** | Be Focused Pro and Pomofocus offer auto-start for breaks and/or work sessions. Some users want seamless flow, others want manual control. Must be configurable. | LOW | Two toggles: "Auto-start breaks" and "Auto-start work sessions." Default both OFF (manual control is safer default). |

#### Timer: Data and Sync

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Session sync to bot** | The whole point of the desktop app -- timer data feeds back to the Discord bot for XP, streak tracking, and Jarvis context. When a session completes, POST to API. | MEDIUM | Depends on API layer. Must handle offline gracefully (queue and retry). Session data: start_time, end_time, duration, mode (pomodoro/flowmodoro), label, completed (bool). |
| **Today's session count and total focus time** | Pomofocus, Be Focused, and Flow all show daily stats. Users want "I did 6 sessions / 3h 10m today" at minimum. | LOW | Aggregate from local session log + API response. Display in popover footer. |

#### Goals: Hierarchy Visualization

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Nested list view with expand/collapse** | The standard tree view pattern (Synergita, Viva Goals, Mooncamp). Yearly goals expand to show quarterly, which expand to monthly, which expand to weekly. Indentation communicates hierarchy. | MEDIUM | React tree component. Read-only in MVP -- goals are created via Discord bot / Jarvis. The desktop app visualizes, it doesn't create. This avoids duplicating complex bot logic. |
| **Progress bars at each level** | Every OKR/goal tree tool shows progress per node. Cascading: if 3 of 4 weekly goals are done, monthly shows 75%. xViz and Mooncamp both do this. | MEDIUM | Progress data comes from API. Render as horizontal bar or percentage. Color-code: gold for on-track, amber for at-risk, red for behind. |
| **Current period highlighting** | Users need to instantly see "this week's goals" vs the full hierarchy. The current week/month/quarter should be visually prominent. | LOW | Bold/highlight the active time period. Collapse completed/future periods by default. |

#### Dashboard: At-a-Glance View

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Today's priorities** | The "daily priorities" pattern from dashboard planners. Show the member's active weekly goals + any daily tasks. This is what you see when you open the app. | LOW | Fetch from API: active goals for current week. Display as checklist. |
| **Weekly goal progress** | Extension of priorities -- shows completion percentage for the week. Momentum Dash and physical dashboard planners both put weekly overview front-and-center. | LOW | Progress bar or fraction (3/5 goals complete). |
| **Current streak and rank** | Gamification visibility. Habitica, Todoist (Karma), Duolingo all surface streak/rank prominently. These already exist in the bot -- just display them. | LOW | Fetch from API: current_streak, rank_name, rank_icon. Display as badge/card. |
| **Daily operator quote** | Momentum Dash shows daily quotes. The bot already has an inspiration system. Surface one rotating quote daily, ideally from the member's configured inspirations. | LOW | Fetch from API or bundle a curated list. One quote per day, changes at midnight. |

#### General App UX

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Dark theme** | Pomotroid offers 37 themes (all dark-first). Flow uses dark UI. Developers and power users expect dark mode. The brand is dark + gold. | LOW | Single dark theme at launch. Dark background (#1a1a1a-ish), gold accents (#FFD700 or similar). No light mode needed for this audience. |
| **Discord OAuth login** | The app is useless without knowing who the user is. OAuth is the standard pattern for "log in with Discord." | MEDIUM | Tauri deep link handler for OAuth callback. Exchange code for token via API. Store token securely in OS keychain via Tauri's secure storage. |
| **Minimize to tray / run in background** | Pomotroid, TomatoBar, and Flow all run as tray-only apps. Closing the window should NOT quit the app -- it should keep the timer running in the menu bar. | LOW | Tauri supports this natively. Set `visible: false` on window close, keep tray icon active. |
| **Global keyboard shortcut** | TomatoBar, Be Focused Pro, and Pomotroid all offer global hotkeys (start/pause/skip without switching windows). Flow offers customizable shortcuts. | LOW | Tauri global shortcut plugin. Default: Cmd+Shift+F to toggle timer. Configurable. |
| **Launch at login (optional)** | Common for menu bar apps. User opts in via settings. | LOW | Tauri auto-start plugin. Default OFF. |

---

### Differentiators (Competitive Advantage)

Features that set this app apart from standalone timer apps. The key differentiator is the Discord bot integration -- no other timer app feeds into a gamified community system.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Live XP/streak feedback on session complete** | When you finish a pomodoro, you see "+50 XP" and your streak counter tick up. No standalone timer does this. Forest gives you coins; this gives you real community XP that affects your rank and leaderboard position. The dopamine hit of seeing XP animate on completion reinforces the habit loop. | MEDIUM | POST session to API, receive XP delta and new streak in response. Animate the XP gain in the popover or as a toast notification. Depends on API returning calculated XP. |
| **Flowmodoro with proportional break ratio** | Flow and Pomofocus are pomodoro-only. Flowmo exists but is web/mobile-only. Very few desktop apps offer flowmodoro. The bot already supports proportional timers -- the desktop app surfaces this as a first-class mode with a proper count-up UI and auto-calculated break display. | MEDIUM | The bot already calculates breaks. Desktop app needs: count-up display, "suggested break: X min" display when user stops, and break countdown timer. Differentiator because most desktop timer apps are pomodoro-only. |
| **Jarvis context enrichment** | Timer sessions feed context to Jarvis. When a member asks "how was my day?", Jarvis knows they did 4 pomodoro sessions on "client project" totaling 2.5 hours. No standalone timer enriches an AI coach. | LOW | This happens on the bot side via session sync. The desktop app just needs to send clean session data. The value is in the ecosystem, not the app code itself. |
| **Goal tree with bot-driven decomposition** | The goal hierarchy in the desktop app is READ from the bot's AI-decomposed goals (Jarvis breaks yearly goals into quarterly/monthly/weekly). Users create goals conversationally in Discord; the desktop app shows the beautiful tree. This is fundamentally different from manually typing goals into a tree widget. | LOW | Read-only tree is simpler to build than a full goal editor. The AI decomposition is the differentiator, and it already exists in the bot. |
| **Community-aware dashboard** | The dashboard shows your rank relative to others, your position on the leaderboard, your streak compared to your longest. Solo timer apps show your data; this shows your data in context of a competitive community. | MEDIUM | API needs endpoints for: rank, leaderboard_position, longest_streak. Dashboard renders these as cards. The social proof aspect is the differentiator. |
| **Screen focus on work->break transition** | When a work session ends, bring the app window to front with a prominent "Take a break" screen. Flow does "fullscreen breaks" as a premium feature. This is more assertive than a notification and harder to ignore. | LOW | Tauri window.setFocus() + show a break screen overlay. Make it optional (some users hate being interrupted). Default ON. |
| **Ticking/ambient sound during focus** | Pomotroid's ticking sound is praised by ADHD users. Flow offers a metronome. Optional ambient audio during work sessions creates a "focus ritual" cue. | LOW | Bundle 2-3 ambient sounds (soft tick, white noise, lo-fi static). Toggle in settings. Play via HTML5 Audio. Not a music player -- just a focus cue. |

---

### Anti-Features (Explicitly Do NOT Build)

Features that seem good but create problems for this specific app and audience.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Goal creation/editing in desktop app** | "I should be able to create goals anywhere" | Duplicates complex bot logic (Jarvis decomposition, cascading progress, goal types). Two editors = two sources of truth = sync conflicts. The bot has NLP goal creation, AI decomposition, and validation -- rebuilding this in React is months of work for marginal value. | Goals are read-only in desktop app. Create/edit via Discord bot. Add a "Open in Discord" button that deep-links to the bot DM. |
| **App/website blocking** | Be Focused Pro and Flow offer distraction blocking. Seems like a natural fit for a focus timer. | Requires elevated OS permissions (accessibility, kernel extensions on macOS). Fragile across OS versions. Not the core value prop -- the community/gamification is the motivator, not forced blocking. Adds massive complexity (browser extension, app firewall). | The social accountability (leaderboard, streaks, Jarvis nudges) is the "blocker." If users want app blocking, recommend Focus (Apple's built-in) or Cold Turkey alongside. |
| **Built-in task manager / to-do list** | "I need to track what to work on during pomodoros" | Scope creep. The bot already has goals. Adding a task manager creates a third system (alongside goals and session labels). Be Focused Pro combines tasks + timer and the result is a cluttered UI. | Session labels ("working on: client project") + goal tree view provide enough context. Tasks live in whatever tool the user already uses (Notion, Todoist, etc.). |
| **Detailed analytics / statistics dashboard** | Pomofocus and Be Focused Pro show charts, heatmaps, history. Users love data. | For 10-25 users with a Discord bot, analytics belong in Jarvis (ask "how was my week?" and get a narrative) and monthly recaps (already built). Building chart views in the desktop app duplicates the recap system and adds significant UI complexity. | Show today's stats in the popover (sessions, total focus time). Weekly/monthly analytics via bot's monthly recap and Jarvis queries. |
| **Multiple themes / theme customization** | Pomotroid has 37 themes. Users love customization. | This is a community tool for 10-25 friends, not a public product. Theme customization is engineering time that doesn't move the needle. The brand IS dark + gold. | Single dark theme with gold accents. Polished and consistent. |
| **Calendar integration / scheduling** | "I want to schedule pomodoro blocks in my calendar" | Out of scope per PROJECT.md. Adds complexity (OAuth for Google/Apple Calendar, sync logic, timezone handling). The app is a timer companion, not a calendar. | If users want calendar blocking, they do it manually. The timer is for execution, not planning. |
| **Sync/cloud storage for app settings** | "My settings should sync between my Mac and Windows machine" | Almost nobody in a 10-25 person group has both. Adds cloud storage dependency and sync conflict resolution. Timer preferences are trivial to re-set. | Local-only preferences. Settings take 30 seconds to configure. |
| **Activity/window tracking** | "Track which apps I use during focus sessions" | Explicitly out of scope per PROJECT.md. Requires invasive OS permissions. Privacy concern for a friend group. | Session labels provide enough context without surveillance. Future milestone if proven valuable. |
| **Music/Spotify integration** | "Play focus music during sessions" | Scope creep. Users already have Spotify/Apple Music open. Building an integration adds API complexity for minimal value. | Optional ticking/ambient sound for focus cue only. Users manage their own music. |

---

## Feature Dependencies

```
[Discord OAuth Login]
    |
    +--requires--> [API Server Running]
    |                  |
    |                  +--requires--> [Monorepo Structure with shared DB package]
    |
    +--enables--> [Session Sync to Bot]
    |                 |
    |                 +--enables--> [XP/Streak Feedback on Completion]
    |                 +--enables--> [Jarvis Context Enrichment]
    |
    +--enables--> [Goal Hierarchy View]
    |                 |
    |                 +--requires--> [API Endpoint: GET /goals/:memberId]
    |
    +--enables--> [Dashboard View]
                      |
                      +--requires--> [API Endpoints: goals, streak, rank, quote]

[Menu Bar Timer (Pomodoro)]
    |
    +--independent--> [Can run without API / login for local-only use]
    |
    +--enhanced-by--> [Session Sync] (when logged in)
    |
    +--enhanced-by--> [XP Feedback] (when logged in)

[Flowmodoro Mode]
    |
    +--requires--> [Timer State Machine] (shared with Pomodoro)
    |
    +--requires--> [Different UI State] (count-up vs countdown)

[Screen Focus on Transition]
    |
    +--requires--> [Timer State Machine]
    |
    +--enhances--> [Phase Transition Notifications]

[Goal Tree View]
    |
    +--requires--> [Discord OAuth Login]
    |
    +--requires--> [API: Goal hierarchy data with cascading progress]
    |
    +--read-only--> [Bot manages goal creation/decomposition]

[Dashboard]
    |
    +--requires--> [Discord OAuth Login]
    |
    +--aggregates--> [Goals, Streak, Rank, Quote data from API]
```

### Dependency Notes

- **Timer can work offline:** The timer core (countdown, sounds, notifications) must work without API connectivity. Session data queues locally and syncs when connection is restored. This means timer UX is fully independent of login/API state.
- **Goals and Dashboard require auth:** These views are meaningless without member-specific data. They require Discord OAuth and a working API.
- **Flowmodoro requires shared timer infrastructure:** Both pomodoro and flowmodoro use the same state machine (idle/working/break), notification system, and menu bar display. They differ only in: countdown vs count-up, fixed vs auto-calculated breaks.
- **XP feedback requires API round-trip:** POST session -> receive XP delta. If API is down, show session completion without XP feedback, sync later.

---

## MVP Definition

### Launch With (v2.0)

Minimum viable desktop companion. Must feel complete for the timer use case and useful for goals/dashboard.

- [ ] **Discord OAuth login** -- gate for all personalized features
- [ ] **Pomodoro timer with custom intervals** -- the core use case; work/break/long break/sessions configurable
- [ ] **Menu bar countdown display** -- the defining UX; glance-up time remaining
- [ ] **Popover controls** -- click tray icon for play/pause/skip/stop + progress ring + session counter
- [ ] **Phase transition notifications + alarm sound** -- without these the timer is useless
- [ ] **Session sync to bot API** -- the whole point; feeds XP, streaks, Jarvis
- [ ] **Goal hierarchy view (read-only)** -- nested list with progress bars, expand/collapse
- [ ] **Dashboard: priorities, weekly goals, streak, rank, quote** -- the landing screen
- [ ] **Dark theme with gold accents** -- brand identity
- [ ] **Minimize to tray / background running** -- menu bar app behavior
- [ ] **Global keyboard shortcut (start/pause)** -- power user expectation

### Add After Validation (v2.x)

Features to add once the core timer + sync loop is proven with real users.

- [ ] **Flowmodoro mode** -- add when users request it or pomodoro proves too rigid; trigger: users complaining about forced breaks during deep work
- [ ] **Live XP animation on session complete** -- add once API XP calculation is stable; trigger: API is reliable enough for real-time feedback
- [ ] **Screen focus on break transition** -- add when users report ignoring notifications; trigger: skip-break rate is high
- [ ] **Ticking/ambient sounds during focus** -- add as polish; trigger: user requests
- [ ] **Preset management (save custom presets)** -- add when users have settled on their preferred intervals; trigger: users manually re-entering settings
- [ ] **Auto-start next phase toggle** -- add as preference; trigger: users requesting seamless flow
- [ ] **Launch at login** -- add as preference; trigger: users wanting the app always available

### Future Consideration (v3+)

Features to defer until the desktop app model is proven.

- [ ] **Community-aware dashboard (leaderboard position, rank comparison)** -- deferred because it requires API endpoints that don't exist yet and the social proof is already in Discord
- [ ] **Session history / basic stats view** -- deferred because monthly recaps and Jarvis handle retrospectives; only build if users explicitly want desktop-side history
- [ ] **Goal progress updates from desktop** -- deferred because creating a goal editor is scope creep; start with read-only and see if users request write access
- [ ] **Multiple timer presets per task type** -- deferred because Be Focused Pro shows this adds clutter; start simple

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Pomodoro timer (custom intervals) | HIGH | LOW | P1 |
| Menu bar countdown | HIGH | MEDIUM | P1 |
| Popover controls (play/pause/skip/stop) | HIGH | MEDIUM | P1 |
| Phase transition notifications + sound | HIGH | LOW | P1 |
| Session sync to API | HIGH | MEDIUM | P1 |
| Discord OAuth login | HIGH | MEDIUM | P1 |
| Dark theme + gold accents | MEDIUM | LOW | P1 |
| Minimize to tray | MEDIUM | LOW | P1 |
| Goal hierarchy view (read-only) | MEDIUM | MEDIUM | P1 |
| Dashboard (priorities, streak, rank, quote) | MEDIUM | LOW | P1 |
| Global keyboard shortcut | MEDIUM | LOW | P1 |
| Flowmodoro mode | MEDIUM | MEDIUM | P2 |
| Live XP feedback animation | HIGH | MEDIUM | P2 |
| Screen focus on transition | MEDIUM | LOW | P2 |
| Ticking/ambient sounds | LOW | LOW | P2 |
| Auto-start next phase | LOW | LOW | P2 |
| Preset management | LOW | LOW | P2 |
| Launch at login | LOW | LOW | P2 |
| Community dashboard (leaderboard) | MEDIUM | HIGH | P3 |
| Session history view | LOW | MEDIUM | P3 |
| Goal editing from desktop | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must have for launch (v2.0)
- P2: Should have, add after core is validated (v2.x)
- P3: Nice to have, future consideration (v3+)

---

## Competitor Feature Analysis

| Feature | Flow (Mac) | Be Focused Pro | Pomotroid | TomatoBar | Flowmo | Our Approach |
|---------|-----------|----------------|-----------|-----------|--------|--------------|
| **Menu bar countdown** | Yes, primary UX | Yes | No (tray icon only) | Yes | No (web/mobile) | Yes -- primary UX like Flow |
| **Pomodoro custom intervals** | Yes | Yes, per-task | Yes | Yes | No (flowmodoro only) | Yes, global defaults + presets |
| **Flowmodoro mode** | No | No | No | No | Yes (only mode) | Yes -- dual mode is differentiator |
| **Phase transition sound** | Yes (metronome + alarm) | Yes (multiple sounds) | Yes (tick + alarm) | Yes (optional) | Yes | Yes, 3-4 bundled sounds |
| **Global shortcut** | Yes (customizable) | Yes | Yes | Yes | No | Yes, Cmd+Shift+F default |
| **Session labeling** | Yes ("custom title") | Yes (full task manager) | No | No | Yes (with task integrations) | Yes, simple text label |
| **Statistics** | Yes (tags, charts, CSV) | Yes (reports, CSV) | Yes (heatmap, charts) | No | Yes (day/week/year) | Minimal in-app; detailed stats via bot recaps |
| **App/web blocking** | Yes (premium) | Yes | No | No | No | No -- use Apple Focus or Cold Turkey |
| **Theme customization** | Limited | No | 37 themes | No | No | No -- single dark+gold theme |
| **Cross-device sync** | iCloud | iCloud | No (local only) | No | Account-based | Discord account via API |
| **Gamification (XP/streak)** | No | No | No | No | No | Yes -- core differentiator |
| **AI coach integration** | No | No | No | No | No | Yes -- Jarvis enrichment |
| **Community/social** | No | No | No | No | No | Yes -- leaderboard, rank |
| **OS support** | Mac only | Mac + iOS + Watch | Mac + Win + Linux | Mac only | Web + iOS + Android | Mac + Windows (Tauri) |

### Key Competitive Insight

Every competitor is a standalone timer. None integrate with a community, AI coach, or gamification system. The desktop app's value is not in being a better timer (Flow is excellent) -- it's in being the visual layer for a productivity ecosystem. The timer is the Trojan horse; the XP, streaks, and Jarvis context are the actual value.

---

## Sources

- [Flow App Features](https://www.flow.app/features) -- Mac menu bar timer, metronome, statistics, app blocking (premium)
- [Flow App Changelog](https://www.flow.app/changelog) -- Tag management, CSV export, Control Center widget (2026)
- [Pomotroid](https://pomotroid.org/) -- Tauri 2 + Svelte, 37 themes, tray icon progress arc, global shortcuts
- [Pomotroid GitHub](https://github.com/Splode/pomotroid) -- Open source, built with Tauri v2
- [Be Focused Pro (App Store)](https://apps.apple.com/us/app/be-focused-pro-focus-timer/id961632517) -- Task management, per-task intervals, app blocking, Shortcuts integration
- [TomatoBar GitHub](https://github.com/ivoronin/TomatoBar) -- Minimal menu bar timer, global hotkey, sandboxed, URL scheme
- [Flowmo](https://flowmo.io/) -- Flowmodoro timer, x/5 break ratio, 10K+ users, task integrations
- [Flowtime Technique Guide (Taskade)](https://www.taskade.com/blog/flowtime-technique-guide) -- Flowmodoro technique deep dive
- [Pomofocus](https://pomofocus.io/) -- Web-based pomodoro, clean UX reference
- [Common Pomodoro Mistakes (FocusTimers)](https://focustimers.io/blog/pomodoro/common-pomodoro-mistakes) -- Anti-patterns: skipping breaks, rigid intervals, phone as timer
- [Gamification in Productivity Apps (Trophy)](https://trophy.so/blog/productivity-gamification-examples) -- XP, streaks, ranks, badges patterns across 20+ apps
- [Tauri v2 System Tray](https://v2.tauri.app/learn/system-tray/) -- TrayIconBuilder, menu events, icon updates
- [Tauri v2 Multi-Window and System Tray Guide (Oflight)](https://www.oflight.co.jp/en/columns/tauri-v2-multi-window-system-tray) -- Multi-window management, tray menus, global shortcuts
- [Mooncamp Goal Tree](https://mooncamp.com/docs/goal-tree) -- Visual goal hierarchy with OKR tree view
- [Tree Data UI Design (Retool)](https://retool.com/blog/designing-a-ui-for-tree-data) -- Best practices for tree view components
- [Momentum Dash](https://momentumdash.com/) -- Daily quotes on dashboard, focus-oriented landing page

---
*Feature research for: Desktop productivity companion app (28K HQ v2.0)*
*Researched: 2026-03-21*
