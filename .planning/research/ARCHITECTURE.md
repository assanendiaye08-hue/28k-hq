# Architecture Research

**Domain:** Discord productivity bot ecosystem (gamified accountability server)
**Researched:** 2026-03-20
**Confidence:** HIGH

## Decision: Modular Monolith, Single Bot

Use **one bot application** with a **modular internal architecture**. Not microservices.

**Rationale:**
- 10-25 members. Microservices add operational overhead (message queues, separate deployments, distributed debugging) that is unjustifiable at this scale.
- Single maintainer. One process to monitor, one deployment pipeline, one log stream.
- Discord's rate limits (50 requests/second global) will never be hit with 25 users. Sharding starts at 2,500 servers -- irrelevant here.
- A well-structured monolith with clean module boundaries can be split later if needed (it won't be needed).

The bot uses a **module/plugin pattern** where each feature domain (goals, leaderboard, gamification, AI assistant, sessions, feeds) is an isolated module that registers its own commands, event handlers, and cron jobs against a shared bot core.

## System Overview

```
                         Discord API (Gateway + REST)
                                    |
                                    v
┌───────────────────────────────────────────────────────────────────┐
│                          Bot Core                                  │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────┐   │
│  │ Client      │  │ Command      │  │ Event                   │   │
│  │ (discord.js)│  │ Router       │  │ Dispatcher              │   │
│  └─────────────┘  └──────────────┘  └─────────────────────────┘   │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────┐   │
│  │ Scheduler   │  │ Module       │  │ Config                  │   │
│  │ (node-cron) │  │ Loader       │  │ Manager                 │   │
│  └─────────────┘  └──────────────┘  └─────────────────────────┘   │
├───────────────────────────────────────────────────────────────────┤
│                        Feature Modules                             │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────────────┐  │
│  │ Goals &   │ │ Leaderbd  │ │ Gamific.  │ │ AI Assistant      │  │
│  │ Streaks   │ │ & Ranks   │ │ (XP/Lvl)  │ │ (per-member)      │  │
│  └───────────┘ └───────────┘ └───────────┘ └───────────────────┘  │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────────────┐  │
│  │ Sessions  │ │ Daily     │ │ Content   │ │ Server            │  │
│  │ (voice)   │ │ Briefs    │ │ Feeds     │ │ Management        │  │
│  └───────────┘ └───────────┘ └───────────┘ └───────────────────┘  │
├───────────────────────────────────────────────────────────────────┤
│                        Shared Services                             │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────┐   │
│  │ Database    │  │ AI Client    │  │ Embed                   │   │
│  │ (Drizzle +  │  │ (OpenAI)     │  │ Builder                 │   │
│  │  SQLite)    │  │              │  │                         │   │
│  └─────────────┘  └──────────────┘  └─────────────────────────┘   │
└───────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **Bot Core / Client** | Connect to Discord Gateway, manage lifecycle, handle reconnects | discord.js Client with GatewayIntentBits |
| **Command Router** | Register slash commands, route interactions to modules | discord.js SlashCommandBuilder + InteractionCreate handler |
| **Event Dispatcher** | Route Discord events (voiceStateUpdate, messageCreate, etc.) to interested modules | Central event bus that modules subscribe to |
| **Scheduler** | Run cron jobs (daily briefs, streak resets, leaderboard updates) | node-cron with jobs stored in config, loaded on startup |
| **Module Loader** | Discover and initialize feature modules at startup | File-system scan of /modules/ directory, call each module's register() |
| **Config Manager** | Environment variables, feature flags, per-server settings | dotenv + typed config object |
| **Database** | All persistent state: users, goals, streaks, XP, sessions, leaderboard snapshots | SQLite via better-sqlite3, schema managed by Drizzle ORM |
| **AI Client** | Wrap OpenAI API calls, manage conversation history per user, token budgeting | OpenAI SDK with conversation context stored in DB |
| **Embed Builder** | Consistent Discord embed formatting across all modules | Shared utility functions for cards, leaderboards, progress bars |

## Recommended Project Structure

```
discord-hustler/
├── src/
│   ├── index.ts                # Entry point: create client, load modules, connect
│   ├── core/
│   │   ├── client.ts           # Discord.js client setup, intents, partials
│   │   ├── commands.ts         # Command registry and interaction router
│   │   ├── events.ts           # Event dispatcher / bus
│   │   ├── scheduler.ts        # Cron job manager
│   │   └── module-loader.ts    # Auto-discover and init modules from /modules/
│   ├── modules/
│   │   ├── goals/
│   │   │   ├── index.ts        # Module registration (commands, events, crons)
│   │   │   ├── commands.ts     # /goal set, /goal check, /goal list
│   │   │   ├── streaks.ts      # Streak calculation and reset logic
│   │   │   └── embeds.ts       # Goal-specific embed templates
│   │   ├── leaderboard/
│   │   │   ├── index.ts
│   │   │   ├── commands.ts     # /leaderboard, /rank
│   │   │   ├── calculator.ts   # Ranking algorithm, point aggregation
│   │   │   └── embeds.ts
│   │   ├── gamification/
│   │   │   ├── index.ts
│   │   │   ├── xp.ts           # XP award logic, anti-spam cooldowns
│   │   │   ├── levels.ts       # Level thresholds, role promotions
│   │   │   └── achievements.ts # Badge/achievement definitions and checks
│   │   ├── assistant/
│   │   │   ├── index.ts
│   │   │   ├── commands.ts     # /ask, /brief, /reflect
│   │   │   ├── ai-client.ts    # OpenAI wrapper, prompt templates, context mgmt
│   │   │   ├── channels.ts     # Private channel creation/management
│   │   │   └── prompts.ts      # System prompts for different assistant modes
│   │   ├── sessions/
│   │   │   ├── index.ts
│   │   │   ├── tracker.ts      # Voice state tracking, session timing
│   │   │   ├── commands.ts     # /session start, /session end, /session stats
│   │   │   └── embeds.ts
│   │   ├── briefs/
│   │   │   ├── index.ts
│   │   │   ├── generator.ts    # Compile daily brief from user data
│   │   │   ├── scheduler.ts    # Cron: morning brief, evening recap
│   │   │   └── embeds.ts
│   │   ├── feeds/
│   │   │   ├── index.ts
│   │   │   ├── commands.ts     # /resource add, /resource search
│   │   │   └── curator.ts      # Feed management, tagging by lane
│   │   └── onboarding/
│   │       ├── index.ts
│   │       ├── commands.ts     # /setup (choose lane, set goals)
│   │       └── channel-setup.ts # Create private channel, assign roles
│   ├── db/
│   │   ├── schema.ts           # Drizzle schema definitions (all tables)
│   │   ├── migrate.ts          # Migration runner
│   │   └── client.ts           # Database connection singleton
│   ├── shared/
│   │   ├── embeds.ts           # Shared embed utilities (progress bars, cards)
│   │   ├── constants.ts        # XP values, level thresholds, cooldowns
│   │   ├── permissions.ts      # Permission check helpers
│   │   └── time.ts             # Timezone helpers, duration formatting
│   └── types/
│       └── index.ts            # Shared TypeScript types
├── drizzle/
│   └── migrations/             # Generated SQL migration files
├── .env                        # BOT_TOKEN, OPENAI_API_KEY, etc.
├── drizzle.config.ts
├── tsconfig.json
├── package.json
└── data/
    └── hustler.db              # SQLite database file
```

### Structure Rationale

- **modules/**: Each feature is a self-contained directory. Adding a new feature means adding a new folder, not modifying existing code. Each module exports a `register(client, db)` function that the loader calls.
- **core/**: Infrastructure code that rarely changes. Modules depend on core; core never depends on modules.
- **db/**: Single source of truth for schema. All modules import from the same schema file so relationships between tables are explicit.
- **shared/**: Cross-cutting utilities that multiple modules need. Prevents duplication without creating circular dependencies.

## Architectural Patterns

### Pattern 1: Module Registration Pattern

**What:** Each feature module exports a standard interface that the core loader calls during startup. The module registers its slash commands, event listeners, and cron jobs.
**When to use:** Every feature module follows this pattern.
**Trade-offs:** Slightly more boilerplate per module, but enables adding/removing features by adding/deleting a folder.

**Example:**
```typescript
// modules/goals/index.ts
import { Module } from '../../core/module-loader';
import { registerGoalCommands } from './commands';
import { scheduleStreakChecks } from './streaks';

export const goalsModule: Module = {
  name: 'goals',
  register(ctx) {
    registerGoalCommands(ctx.commands);
    ctx.events.on('interactionCreate', handleGoalInteraction);
    ctx.scheduler.add('0 0 * * *', () => scheduleStreakChecks(ctx.db)); // midnight
  },
};
```

### Pattern 2: Event-Driven XP Awards

**What:** Instead of modules directly calling the gamification system, they emit domain events (e.g., "goal_completed", "session_ended") and the gamification module listens and awards XP accordingly.
**When to use:** Any time an action in one module should trigger gamification rewards.
**Trade-offs:** Loose coupling between features. Gamification rules can change without touching other modules.

**Example:**
```typescript
// modules/sessions/tracker.ts
eventBus.emit('session:ended', { userId, durationMinutes: 45 });

// modules/gamification/index.ts
eventBus.on('session:ended', ({ userId, durationMinutes }) => {
  const xp = Math.floor(durationMinutes * XP_PER_MINUTE);
  awardXP(userId, xp, 'co-working session');
});
```

### Pattern 3: Per-User Private Channels (Not Threads)

**What:** Each member gets a dedicated private text channel under a "Personal Assistants" category. The channel is visible only to that member and the bot.
**When to use:** For the AI assistant feature -- persistent, always-available, private conversations.
**Trade-offs:** Uses channel slots (500 max per guild; 25 members = 25 channels = 5% of limit -- negligible). Private channels persist better than threads (threads auto-archive and require re-opening). For a small, long-term community, dedicated channels feel more "personal" than ephemeral threads.

**Why not threads:** Threads auto-archive after inactivity (1h, 24h, 3d, or 7d). For a personal assistant that members check daily, auto-archiving is hostile UX. Private channels are permanent, always visible in the sidebar, and feel like "your space."

**Example:**
```typescript
// modules/onboarding/channel-setup.ts
async function createAssistantChannel(guild: Guild, member: GuildMember) {
  const category = guild.channels.cache.find(
    c => c.name === 'Personal Assistants' && c.type === ChannelType.GuildCategory
  );
  return guild.channels.create({
    name: `assistant-${member.user.username}`,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },        // @everyone: hidden
      { id: member.id, allow: [PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.SendMessages] },     // member: visible
      { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel,
                                          PermissionFlagsBits.SendMessages] }, // bot: visible
    ],
  });
}
```

### Pattern 4: Cooldown-Based XP Anti-Spam

**What:** XP is awarded at most once per 60-second window per user per action type. Prevents spam for XP.
**When to use:** All XP-granting actions (messages, check-ins, etc.)
**Trade-offs:** Simple and proven (MEE6, Arcane, and every major leveling bot uses this approach). May need tuning of cooldown windows.

## Data Flow

### Core Data Flows

```
1. COMMAND FLOW (User-Initiated)
   User types /goal set "Ship landing page"
       ↓
   Discord Gateway → InteractionCreate event
       ↓
   Command Router → goals module handler
       ↓
   goals/commands.ts → validate → db.insert(goals)
       ↓
   eventBus.emit('goal:created', { userId, goal })
       ↓
   gamification listens → awardXP(userId, 10, 'goal_set')
       ↓
   Reply embed → "Goal set! +10 XP"

2. VOICE SESSION FLOW (Passive Tracking)
   User joins #deep-work voice channel
       ↓
   voiceStateUpdate event → sessions/tracker.ts
       ↓
   Record session start: db.insert(sessions, { userId, startedAt: now })
       ↓
   User leaves voice channel
       ↓
   voiceStateUpdate → calculate duration → db.update(sessions)
       ↓
   eventBus.emit('session:ended', { userId, duration })
       ↓
   gamification → awardXP based on duration
   leaderboard → update weekly hours
       ↓
   Post summary in #wins: "X just locked in for 2h 15m (+135 XP)"

3. DAILY BRIEF FLOW (Cron-Triggered)
   Cron fires at 8:00 AM → briefs/scheduler.ts
       ↓
   For each active member:
     Query: goals (active), streaks (current), sessions (yesterday),
            rank (current position), upcoming challenges
       ↓
   Compose brief (optionally with AI summary)
       ↓
   Send embed to member's private assistant channel

4. AI ASSISTANT FLOW (Message-Triggered)
   User sends message in their #assistant-username channel
       ↓
   messageCreate event → assistant module
       ↓
   Load conversation history from DB (last N messages)
       ↓
   Build prompt: system prompt + user context (goals, streaks, stats) + history
       ↓
   OpenAI API call → response
       ↓
   Store assistant response in DB → send to channel
```

### State Management

All state lives in SQLite. There is no in-memory state that matters beyond the current process lifecycle. On restart, the bot reloads everything from the database.

The one exception: active voice sessions. On startup, the bot checks who is currently in voice channels and creates session records for them (backfilling from the time the bot came online, not from when they actually joined -- accept this small inaccuracy).

## Database Schema Concept

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│    users     │     │    goals     │     │    streaks       │
├──────────────┤     ├──────────────┤     ├──────────────────┤
│ discord_id PK│────<│ user_id FK   │     │ user_id FK       │
│ username     │     │ title        │     │ type (daily/goal)│
│ lane         │     │ description  │     │ current_count    │
│ xp           │     │ status       │     │ longest_count    │
│ level        │     │ lane         │     │ last_activity_at │
│ created_at   │     │ deadline     │     │ started_at       │
└──────────────┘     │ created_at   │     └──────────────────┘
       │             └──────────────┘            │
       │                                         │
       │             ┌──────────────┐            │
       ├────────────<│  sessions    │            │
       │             ├──────────────┤            │
       │             │ user_id FK   │            │
       │             │ started_at   │            │
       │             │ ended_at     │            │
       │             │ duration_min │            │
       │             │ type (voice/ │            │
       │             │  focus/pair) │            │
       │             └──────────────┘            │
       │                                         │
       │             ┌──────────────┐            │
       ├────────────<│  check_ins   │>───────────┘
       │             ├──────────────┤
       │             │ user_id FK   │
       │             │ date         │
       │             │ goals_done[] │
       │             │ reflection   │
       │             │ mood         │
       │             └──────────────┘
       │
       │             ┌──────────────┐
       ├────────────<│  xp_log      │
       │             ├──────────────┤
       │             │ user_id FK   │
       │             │ amount       │
       │             │ reason       │
       │             │ source_module│
       │             │ created_at   │
       │             └──────────────┘
       │
       │             ┌──────────────────┐
       └────────────<│ ai_conversations │
                     ├──────────────────┤
                     │ user_id FK       │
                     │ channel_id       │
                     │ role (user/asst) │
                     │ content          │
                     │ tokens_used      │
                     │ created_at       │
                     └──────────────────┘
```

### Key Schema Decisions

- **users.xp and users.level**: Denormalized for fast leaderboard queries. The xp_log table is the source of truth; xp/level on users is a computed cache updated on every XP award.
- **xp_log**: Append-only audit trail. Never delete rows. Enables "how did I earn XP this week?" queries and debugging.
- **streaks**: Separate from check_ins because streak logic (reset on miss, longest tracking) is its own concern.
- **ai_conversations**: Store conversation history in DB, not in memory. Load last N messages when building context for OpenAI. Prune old messages periodically to control token costs.
- **sessions**: Track voice channel time. The `type` field distinguishes solo focus, pair programming, and group co-working.

## Discord Server Structure

### Channel Categories and Channels

```
HUSTLER HQ (Server)
│
├── GENERAL
│   ├── #welcome              (read-only, rules + onboarding instructions)
│   ├── #announcements        (read-only, admin/bot announcements)
│   ├── #general-chat         (free talk, off-topic)
│   └── #wins                 (bot posts wins, members share achievements)
│
├── THE GRIND
│   ├── #daily-check-in       (bot-managed, members post daily check-ins)
│   ├── #accountability       (public goal tracking, bot posts streak updates)
│   ├── #leaderboard          (read-only, bot posts weekly/monthly leaderboards)
│   └── #challenges           (active challenges, bot-managed)
│
├── LANES
│   ├── #freelancing           (discussion for freelancing/skills lane)
│   ├── #ecom                  (discussion for ecom/dropshipping lane)
│   ├── #content-creation      (discussion for content/social media lane)
│   └── #resources             (curated links, tools, tutorials by lane)
│
├── CO-WORKING (Voice)
│   ├── Deep Work 1            (voice, camera-on co-working)
│   ├── Deep Work 2            (voice, camera-on co-working)
│   ├── Pair Up                (voice, 2-person limit for pair work)
│   └── Chill Grind            (voice, music/lo-fi + working)
│
├── PERSONAL ASSISTANTS (Hidden from @everyone)
│   ├── #assistant-alice       (private: Alice + bot only)
│   ├── #assistant-bob         (private: Bob + bot only)
│   └── ... (one per member, created during onboarding)
│
└── ADMIN
    ├── #bot-logs              (admin-only, bot debug/audit logs)
    └── #admin-chat            (admin-only discussion)
```

### Role Hierarchy

```
Server Owner (full permissions)
    └── Admin (manage server, manage roles, manage channels)
        └── Hustler (base member role -- access to all non-admin areas)
            └── Lane roles (cosmetic, used for pings):
                ├── Freelancer
                ├── E-Com
                └── Creator
            └── Rank roles (cosmetic, awarded by bot based on level):
                ├── Legend (Level 50+)
                ├── Grinder (Level 25+)
                ├── Hustler (Level 10+)
                ├── Rookie (Level 1+)
                └── Newbie (Level 0, default)
```

### Permission Model

| Role | What They Can Do | What They Cannot Do |
|------|------------------|---------------------|
| @everyone | See #welcome only | See any other channel |
| Hustler | See all non-admin channels, send messages, join voice, use slash commands | Manage channels, manage roles, see admin channels |
| Admin | Everything Hustler can + manage channels, manage roles, see #bot-logs, #admin-chat | Delete the server |
| Bot | Send messages everywhere, manage channels, manage roles, manage threads, read message history, connect to voice | Admin-level destructive actions |
| Lane roles | No extra permissions (cosmetic) | Mentionable for targeted pings |
| Rank roles | No extra permissions (cosmetic) | Displayed in member list as badge of progress |

**Key permission patterns:**
- #leaderboard, #announcements, #wins: Bot has Send Messages; members have View + Add Reactions only (no sending -- keeps it clean).
- #daily-check-in: Members can send messages but not see message history older than their own (use slow mode + bot cleanup).
- Personal assistant channels: Only the specific member + bot can see/send.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| **OpenAI API** | REST via official SDK, called from assistant module | Use gpt-4o-mini for cost efficiency at this scale. Budget ~$5-15/month for 25 users. Store conversation context in DB, send last 10-20 messages as context window. |
| **Discord API** | discord.js v14 via Gateway (WebSocket) + REST | Gateway for real-time events. REST for channel creation, role management. Intents needed: Guilds, GuildMembers, GuildMessages, MessageContent, GuildVoiceStates, GuildPresences. |

### Internal Module Communication

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Any module -> Gamification | Event bus: emit domain events, gamification subscribes | Loose coupling. Gamification is a "listener" module, never called directly. |
| Goals -> Streaks | Direct function call within goals module | Tightly coupled by design -- streaks are a sub-feature of goals. |
| Briefs -> All data modules | Direct DB queries | Briefs module reads from goals, sessions, streaks, users tables to compile the daily brief. Read-only cross-module access. |
| Onboarding -> Channels, Roles | Direct discord.js API calls | Onboarding is the only module that creates channels and assigns roles. |
| Leaderboard -> Users, XP, Sessions | Direct DB queries + cron | Leaderboard reads from multiple tables but writes only to its own snapshot table for historical data. |

## Anti-Patterns

### Anti-Pattern 1: Multiple Bot Applications

**What people do:** Create separate bot apps for each feature (one for leveling, one for AI, one for tracking).
**Why it's wrong:** Multiple bots means multiple tokens, multiple gateway connections, no shared state, members see 3-5 bots in the sidebar, and coordinating between bots requires an external message broker. Massively over-engineered for 25 users.
**Do this instead:** One bot, modular internals. All features share one database and one gateway connection.

### Anti-Pattern 2: Using Threads for Personal Assistants

**What people do:** Create private threads for per-user AI conversations to avoid using channel slots.
**Why it's wrong:** Threads auto-archive after inactivity (1h to 7d depending on server boost level). Members would need to re-open their thread constantly. Archived threads disappear from the sidebar, making the assistant feel "gone." Thread history is harder to maintain persistently.
**Do this instead:** Dedicated private channels. 25 channels out of 500 max is only 5% of the limit. The "personal space" feeling is worth the channel cost.

### Anti-Pattern 3: Storing State in Memory

**What people do:** Keep XP, streaks, and session data in JavaScript objects/Maps.
**Why it's wrong:** Bot crash = all data lost. Bot restart = all streaks reset. No persistence across deployments.
**Do this instead:** SQLite for everything. Read from DB on every query. The bot should be stateless except for the discord.js client connection. SQLite handles thousands of reads/second easily at this scale.

### Anti-Pattern 4: Hardcoding XP Values and Thresholds

**What people do:** Scatter magic numbers like `xp += 15` and `if (level >= 10)` throughout the codebase.
**Why it's wrong:** Tuning gamification is iterative. You will change XP rates, level thresholds, and cooldowns many times. Hunting through 8 modules to update numbers is error-prone.
**Do this instead:** Centralize all gamification constants in `shared/constants.ts`. Reference them everywhere. Consider making some configurable via slash commands for admins.

### Anti-Pattern 5: Monolithic Command Handler

**What people do:** Put all slash command handlers in a single file with a giant switch/if-else block.
**Why it's wrong:** Becomes unmaintainable past 10 commands. Merge conflicts when working on different features. No encapsulation.
**Do this instead:** Each module registers its own commands. The command router dispatches by command name to the owning module.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| **10-25 members (target)** | Single process, SQLite, one VPS. This architecture handles it with massive headroom. No optimization needed. |
| **25-100 members** | Same architecture works fine. Might want to add message queuing for AI requests if OpenAI latency causes event loop blocking (use worker threads or a simple job queue). Consider PostgreSQL if complex queries get slow. |
| **100-500 members** | Consider splitting AI assistant into a separate worker process communicating via Redis queue. SQLite starts struggling with concurrent writes -- migrate to PostgreSQL. Add connection pooling. |
| **500+ members** | Unlikely for a friend group. But: PostgreSQL mandatory, Redis for caching leaderboards, separate worker processes for AI and voice tracking, consider sharding the Discord client. |

### Scaling Priorities (for this project)

1. **First bottleneck will be OpenAI costs**, not architecture. At 25 active users each sending 10 messages/day to their AI assistant, that is ~250 API calls/day. With gpt-4o-mini, this costs roughly $0.10-0.50/day. Manageable, but worth monitoring.
2. **Second bottleneck will be bot responsiveness** if AI calls are synchronous. Use async/await properly and consider a typing indicator while waiting for OpenAI responses.
3. **Architecture will never be the bottleneck** at this scale. Do not pre-optimize.

## Suggested Build Order

Build order is driven by dependency chains and the need to get the server feeling "alive" quickly.

```
Phase 1: Foundation (must build first -- everything depends on this)
├── Bot core (client, command router, event dispatcher, module loader)
├── Database schema + migrations
├── Server structure (categories, channels, roles)
└── Onboarding module (role assignment, lane selection)

Phase 2: Core Loop (the daily engagement hook)
├── Goals & Streaks module (set goals, track completion, maintain streaks)
├── Daily Check-in system
├── Daily Briefs module (morning brief to private channels)
└── Gamification module (XP awards, levels, rank roles)

Phase 3: Competition & Visibility (makes it feel like a game)
├── Leaderboard module (weekly/monthly rankings, #leaderboard channel)
├── Voice session tracking (co-working time logged and rewarded)
└── Wins feed (#wins channel automation)

Phase 4: Intelligence (high-value but higher complexity)
├── AI Assistant module (personal channels, OpenAI integration)
├── AI-powered daily briefs (personalized summaries)
└── AI accountability check-ins

Phase 5: Polish & Engagement
├── Content Feeds module (curated resources by lane)
├── Challenges system (weekly/monthly community challenges)
└── Achievements/badges
```

**Build order rationale:**
- Phase 1 is infrastructure. Cannot build anything without it.
- Phase 2 creates the daily habit loop -- without this, the server has no pull. Members need a reason to come back every day.
- Phase 3 adds the competitive/social layer that makes gamers stick. Leaderboards + visible progress = engagement flywheel.
- Phase 4 is the most technically complex (AI integration, conversation management, prompt engineering) but also the most differentiated. It requires stable infrastructure and a working gamification layer to reference user stats.
- Phase 5 is enhancement. The server can work without it. Build when the core loop is proven.

## Sources

- [Discord Official Documentation - Channel Resource](https://docs.discord.com/developers/resources/channel) -- Channel types, permission overwrites, guild limits (HIGH confidence)
- [Discord Official Documentation - Rate Limits](https://docs.discord.com/developers/topics/rate-limits) -- 50 req/sec global, per-route limits (HIGH confidence)
- [Discord Roles and Permissions](https://support.discord.com/hc/en-us/articles/214836687-Discord-Roles-and-Permissions) -- Role hierarchy, permission inheritance (HIGH confidence)
- [Discord Channel Categories 101](https://support.discord.com/hc/en-us/articles/115001580171-Channel-Categories-101) -- Category structure, 50 channels per category (HIGH confidence)
- [Discord Account and Server Caps](https://support.discord.com/hc/en-us/articles/33694251638295-Discord-Account-Caps-Server-Caps-and-More) -- 500 channel limit per guild (HIGH confidence)
- [Architecting Discord Bot the Right Way - DEV Community](https://dev.to/itsnikhil/architecting-discord-bot-the-right-way-383e) -- Microservices vs monolith tradeoffs (MEDIUM confidence)
- [Building a Multifunctional Discord Bot - DEV Community](https://dev.to/j3ffjessie/building-a-multifunctional-discord-bot-a-comprehensive-technical-deep-dive-3kf6) -- Multi-feature bot patterns (MEDIUM confidence)
- [Discord Private Threads Guide - Mava](https://www.mava.app/blog/discord-private-threads-everything-you-need-to-know) -- Thread vs channel tradeoffs (MEDIUM confidence)
- [Discord Voice Timer Bot - DanoGlez](https://danoglez.com/blog/discord-voice-timer-bot/) -- Voice tracking implementation patterns (MEDIUM confidence)
- [Advanced Discord Bot Development Strategies](https://arnauld-alex.com/building-a-production-ready-discord-bot-architecture-beyond-discordjs) -- Production bot architecture (MEDIUM confidence)
- [discord.js Guide - Storing Data with Sequelize](https://discordjs.guide/sequelize/) -- Database patterns for discord.js bots (MEDIUM confidence)
- [OpenAI Assistants Discord Bot - VoloBuilds](https://github.com/VoloBuilds/openai-assistants-discord-bot) -- Per-channel AI session management (MEDIUM confidence)

---
*Architecture research for: Discord Hustler -- gamified productivity bot ecosystem*
*Researched: 2026-03-20*
