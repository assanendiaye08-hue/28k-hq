# Phase 3: Competition and Social Proof - Research

**Researched:** 2026-03-20
**Domain:** Discord voice tracking, leaderboard systems, message monitoring, seasonal competitive cycles
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Three separate leaderboard embeds: XP, voice hours, streaks -- each board has its own ranking
- Both #leaderboard channel (auto-updating) AND /leaderboard command for on-demand checks
- #leaderboard channel updates by editing existing messages -- NO new messages, NO notifications. The channel is for consultation, not alerts
- Minimal distraction principle applies across all of Phase 3: competition features should be available when sought, never push unwanted notifications
- Presence in voice channel counts as "locked in" -- even if muted (people legitimately work muted due to noisy mics)
- Smart AFK detection: if member goes to Discord AFK channel or shows extended inactivity, tracking stops
- Session announcements ONLY for long/noteworthy sessions -- short sessions tracked silently
- Announcements should be encouraging ("keep grinding" energy), delivered to private space not public channels
- Any message posted in #wins or #lessons counts -- the channel itself is the filter, no AI detection needed
- Bot reacts with emoji (e.g., muscle for wins, brain for lessons) and silently awards XP
- No bot reply -- just the emoji reaction. Keeps it clean
- XP amount for wins vs lessons: Claude's discretion based on community psychology
- Season duration: Claude decides based on 10-25 person group dynamics and engagement research
- What resets vs carries over: Claude decides the right balance between fresh competition and permanent progress
- Archived seasons viewable via /season [number] command for detailed past leaderboards
- #hall-of-fame channel with pinned season summaries -- permanent bragging rights
- End-of-season rewards/recognition: Claude decides what motivates without creating permanent hierarchy

### Claude's Discretion
- Leaderboard refresh cadence (must be silent edits, not new posts)
- Whether to show all members or top N + "your position"
- Voice session minimum length before counting
- AFK detection specifics (timeout duration, deafened handling)
- Session length threshold for "noteworthy" announcement
- Wins vs lessons XP balance
- Season length (1/2/3 months)
- Season reset scope (what resets, what carries)
- Season champion recognition (temporary role, just archive, etc.)

### Deferred Ideas (OUT OF SCOPE)
- AI-evaluated XP based on profile relevance
- Bot should help all productive life areas (Phase 4 scope)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| COMP-01 | Multi-dimensional leaderboards -- weekly rankings by XP, voice hours, and streaks | Prisma orderBy queries for XP/streaks on Member model; new VoiceSession model for voice hours aggregation; message editing pattern for #leaderboard channel; /leaderboard command with subcommands |
| COMP-02 | Voice session tracking -- track time spent in co-working voice channels ("hours locked in") | voiceStateUpdate Discord event + GuildVoiceStates intent; in-memory session map for active sessions + VoiceSession DB model; AFK channel detection via guild.afkChannelId; new XPSource values for voice XP |
| COMP-03 | Wins/lessons channels -- bot detects posts in #wins and #lessons, awards XP, reacts | messageCreate Discord event (already have GuildMessages + MessageContent intents); channel ID comparison; message.react() API; new XPSource values for wins/lessons |
| COMP-04 | Seasonal system -- Valorant-style seasons with leaderboard resets, past seasons archived and viewable | Season + SeasonSnapshot Prisma models; cron-driven season transitions; /season command; #hall-of-fame embed generation |
</phase_requirements>

## Summary

Phase 3 adds the competitive flywheel to the Discord Hustler server: leaderboards that members consult when they want (never pushed), voice session tracking that rewards "locking in" together, wins/lessons channels that silently celebrate effort, and a seasonal cycle that keeps competition fresh. The technical foundation from Phases 1 and 2 is solid -- the module system, event bus, XP engine, delivery utility, and Prisma schema all provide clear extension points.

The primary technical challenges are: (1) voice session tracking with in-memory state that must survive edge cases (bot restarts, Discord disconnects, channel switches, AFK detection), (2) leaderboard channel management where the bot edits existing messages rather than posting new ones (requiring stored message IDs), and (3) a seasonal system with data archival that preserves history while resetting competition. None of these require new libraries -- they are solved with discord.js v14's native APIs, Prisma queries, and the existing module/event architecture.

The biggest design risk is the one documented in PITFALLS.md: the Leaderboard Doom Loop where permanent rankings damage friendships. The user's decisions directly mitigate this -- multi-dimensional boards prevent a single permanent winner, seasonal resets prevent insurmountable gaps, and the "consultation not notification" principle prevents anxiety-inducing visibility.

**Primary recommendation:** Build four new modules (voice-tracker, leaderboard, wins-lessons, season) following the existing module registration pattern, extend the Prisma schema with VoiceSession/Season/SeasonSnapshot models, add GuildVoiceStates intent, and wire everything through the event bus.

## Standard Stack

### Core (already installed -- no new dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| discord.js | ^14.25.1 | voiceStateUpdate event, message.react(), message.edit(), channel management | Already installed; provides all needed APIs for voice tracking, reactions, and message editing |
| @prisma/client | ^7.5.0 | VoiceSession, Season, SeasonSnapshot models; orderBy/aggregate queries for leaderboards | Already installed; handles all data persistence and ranking queries |
| node-cron | ^4.2.1 | Leaderboard refresh cron, season transition checks | Already installed; used by scheduler module |
| date-fns | ^4.1.0 | Duration formatting for voice sessions, season date calculations | Already installed; used throughout Phase 2 |
| winston | ^3.19.0 | Structured logging for voice tracker, leaderboard updates | Already installed; standard logging across all modules |

### Supporting (already installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @date-fns/tz | ^1.4.1 | Timezone-aware season boundaries | Season start/end calculations |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Prisma orderBy for rankings | Raw SQL with RANK() OVER | Prisma orderBy + findMany with skip/take is sufficient for 10-25 members; raw SQL only needed if we want dense ranking which is unnecessary at this scale |
| In-memory Map for active voice sessions | Redis/database polling | In-memory Map is correct for active sessions -- writing to DB on every voice state change is wasteful; persist only on session end or periodic flush |
| node-cron for leaderboard refresh | Interval-based setInterval | node-cron is already in the project and provides cron syntax consistency with scheduler module |

**Installation:**
```bash
# No new packages needed. Phase 3 uses only existing dependencies.
```

## Architecture Patterns

### Recommended Module Structure
```
src/modules/
  voice-tracker/
    index.ts           # Module registration: voiceStateUpdate listener + events
    tracker.ts         # In-memory session tracking, start/end/pause logic
    constants.ts       # MIN_SESSION_MINUTES, AFK_TIMEOUT, NOTEWORTHY_THRESHOLD, XP rates
    embeds.ts          # Session summary embed for noteworthy sessions
  leaderboard/
    index.ts           # Module registration: cron jobs + event listeners
    commands.ts        # /leaderboard [type] slash command
    calculator.ts      # Query functions: getXPLeaderboard, getVoiceLeaderboard, getStreakLeaderboard
    renderer.ts        # Embed builders for each leaderboard type
    channel-sync.ts    # Fetch/edit stored messages in #leaderboard channel
    constants.ts       # REFRESH_INTERVAL, TOP_N, channel/message ID config
  wins-lessons/
    index.ts           # Module registration: messageCreate listener
    handler.ts         # Detect #wins/#lessons messages, react, award XP
    constants.ts       # XP values, emoji constants, channel name config
  season/
    index.ts           # Module registration: cron for season check + event listeners
    commands.ts        # /season [number] slash command
    manager.ts         # Season creation, archival, snapshot generation
    hall-of-fame.ts    # #hall-of-fame embed generation and posting
    constants.ts       # SEASON_DURATION_DAYS, reset scope config
```

### Pattern 1: Voice Session State Machine
**What:** Track voice sessions using an in-memory Map keyed by memberId, with a state machine handling join/leave/switch/AFK transitions. Persist to database only on session end.
**When to use:** Voice session tracking (COMP-02).
**Example:**
```typescript
// Source: discord.js VoiceState class documentation
interface ActiveSession {
  memberId: string;
  discordId: string;
  channelId: string;
  startedAt: Date;
  pausedAt?: Date;      // Set when member enters AFK channel
  totalPausedMs: number; // Accumulated pause time
}

const activeSessions = new Map<string, ActiveSession>();

// voiceStateUpdate handler logic:
// 1. oldState.channelId === null && newState.channelId !== null -> JOIN (start session)
// 2. oldState.channelId !== null && newState.channelId === null -> LEAVE (end session)
// 3. oldState.channelId !== newState.channelId -> SWITCH (end old + start new, or AFK detection)
// 4. newState.channelId === guild.afkChannelId -> PAUSE (member moved to AFK)
```

### Pattern 2: Stored Message Editing for Silent Leaderboards
**What:** On first run, the bot sends 3 messages to #leaderboard (one per board type) and stores their message IDs in a config table. On refresh, it fetches and edits those messages. No new messages, no notifications.
**When to use:** #leaderboard channel auto-updating (COMP-01).
**Example:**
```typescript
// Source: discord.js TextChannel.send() + Message.edit()
// Store message IDs in a LeaderboardConfig DB record or simple key-value store

async function refreshLeaderboard(channel: TextChannel, messageId: string, embed: EmbedBuilder) {
  try {
    const message = await channel.messages.fetch(messageId);
    await message.edit({ embeds: [embed] });
  } catch {
    // Message was deleted -- recreate and store new ID
    const newMsg = await channel.send({ embeds: [embed] });
    await saveLeaderboardMessageId(newMsg.id);
  }
}
```

### Pattern 3: Channel-Filtered Message Listener
**What:** Listen to messageCreate globally but filter by channel ID. When a message arrives in #wins or #lessons, react with the appropriate emoji and silently award XP. No bot reply.
**When to use:** Wins/lessons channel detection (COMP-03).
**Example:**
```typescript
// Source: discord.js Message.react() documentation
client.on('messageCreate', async (message) => {
  if (message.author.bot) return; // Ignore bot messages

  if (message.channelId === winsChannelId) {
    await message.react('\uD83D\uDCAA'); // muscle emoji
    // Award XP silently via awardXP() -- no reply, no public announcement
  } else if (message.channelId === lessonsChannelId) {
    await message.react('\uD83E\uDDE0'); // brain emoji
    // Award XP silently
  }
});
```

### Pattern 4: Season Archival with Snapshots
**What:** When a season ends, snapshot current leaderboard standings into a SeasonSnapshot table, then reset the tracked seasonal metrics. Lifetime XP and streaks carry over; seasonal rankings reset.
**When to use:** Season transitions (COMP-04).
**Example:**
```typescript
// End-of-season flow:
// 1. Query current leaderboard standings for all three dimensions
// 2. Create SeasonSnapshot records for each member's position
// 3. Post season summary to #hall-of-fame
// 4. Reset seasonal counters (season-scoped voice hours, season XP delta)
// 5. Create new Season record with incremented number
```

### Anti-Patterns to Avoid
- **Writing to DB on every voiceStateUpdate:** Voice state changes can fire rapidly (mute/unmute/deafen). Only persist on session end or periodic flush. Keep active session state in memory.
- **Posting new leaderboard messages instead of editing:** Creates notification noise. User explicitly requires silent edits. Store message IDs and use message.edit().
- **Using @discordjs/voice for presence tracking:** The @discordjs/voice package is for joining voice channels and playing audio. For passive voice state monitoring, use the native voiceStateUpdate event on the discord.js Client. Do NOT install @discordjs/voice.
- **Resetting Member.totalXp on season change:** Lifetime XP must carry over. Seasons only reset seasonal ranking counters. Track seasonal XP as a delta (XP earned within the season date range) not by resetting the total.
- **AI detection for wins/lessons:** User explicitly decided the channel itself is the filter. Any message in #wins counts as a win. No content analysis needed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Voice state tracking | Custom WebSocket listener for voice events | discord.js Client voiceStateUpdate event | discord.js handles Gateway connection, reconnection, and state diffing automatically |
| Leaderboard ranking | Custom sorting algorithm with position tracking | Prisma findMany with orderBy + index position | At 10-25 members, a simple query sorted by totalXp DESC with array index for position is trivially fast and correct |
| Cron scheduling | Custom setInterval with drift correction | node-cron (already installed) | Handles timezone, DST, and expression parsing; consistent with existing scheduler module |
| Duration formatting | Manual hour/minute string building | date-fns formatDuration or intervalToDuration | Handles edge cases (0 hours, singular/plural) correctly |
| Message suppression | Custom notification management | MessageFlags.SuppressNotifications for any bot messages | Built into discord.js v14 -- one flag does the work |

**Key insight:** Phase 3 adds behavioral complexity (state machines, cron cycles, multi-model queries) but zero library complexity. Every technical need is covered by discord.js v14 + Prisma + node-cron, all already installed.

## Common Pitfalls

### Pitfall 1: Bot Restart Loses Active Voice Sessions
**What goes wrong:** Members are in voice channels when the bot restarts. The in-memory session map is empty, so their current session is lost.
**Why it happens:** Voice sessions live in memory because writing every state change to DB is wasteful. But memory doesn't survive restarts.
**How to avoid:** On bot ready, scan all voice channels in the guild for current members. Create session records with startedAt = now (accept the small inaccuracy of losing pre-restart time). Log a warning that sessions were reconstructed.
**Warning signs:** Members in voice showing 0 hours on the leaderboard despite being in channels all day.

### Pitfall 2: Voice Channel Switching Counted as Two Sessions
**What goes wrong:** Member switches from Co-Work 1 to Co-Work 2. The voiceStateUpdate fires with oldState.channelId = Co-Work 1 and newState.channelId = Co-Work 2. If handled naively, this ends one session and starts another, creating fragmented data.
**How to avoid:** On channel switch, check if both channels are tracked co-working channels. If so, either (a) continue the same session with an updated channelId, or (b) seamlessly end one and start another with no gap. The user cares about total "locked in" time, not per-channel breakdown.
**Warning signs:** Leaderboard showing many short sessions instead of one continuous session.

### Pitfall 3: Missing GuildVoiceStates Intent
**What goes wrong:** voiceStateUpdate event never fires. Voice tracking silently does nothing.
**Why it happens:** The current client.ts only includes Guilds, GuildMembers, GuildMessages, DirectMessages, and MessageContent intents. GuildVoiceStates is not included.
**How to avoid:** Add GatewayIntentBits.GuildVoiceStates to the intents array in src/core/client.ts. This is a non-privileged intent -- no Developer Portal changes needed.
**Warning signs:** Voice tracker module loads without errors but never receives events.

### Pitfall 4: Leaderboard Message IDs Lost or Stale
**What goes wrong:** Bot sends 3 messages to #leaderboard, stores IDs, but an admin deletes the messages or clears the channel. Next refresh fails silently.
**How to avoid:** Wrap message.edit() in try/catch. If the message is not found (DiscordAPIError 10008: Unknown Message), recreate it and store the new ID. Always verify message existence before editing.
**Warning signs:** #leaderboard channel appears empty despite the bot running.

### Pitfall 5: XP Spam from Wins/Lessons Channel
**What goes wrong:** A member posts 10 messages in #wins in rapid succession, farming XP.
**Why it happens:** No cooldown on wins/lessons XP awards.
**How to avoid:** Implement a per-member cooldown (e.g., 1 win XP award per 60 minutes) using the same pattern as check-in diminishing returns. Store last award timestamp per member per channel in memory or DB.
**Warning signs:** One member earning disproportionate XP from wins/lessons compared to actual productivity.

### Pitfall 6: Season Transition Race Condition
**What goes wrong:** Season end cron fires while a leaderboard refresh is in progress. The snapshot captures partial data, or the leaderboard shows stale post-reset data.
**How to avoid:** Season transition should be an atomic operation: (1) stop leaderboard refresh cron, (2) take snapshot, (3) reset counters, (4) restart leaderboard refresh. Use a mutex flag or Prisma transaction.
**Warning signs:** Season summary in #hall-of-fame showing incorrect final standings.

### Pitfall 7: Deafened Members and AFK Detection
**What goes wrong:** A member self-deafens (can't hear anything) while in a voice channel. Should this count as "locked in" or as AFK?
**Why it matters:** The user decided muted counts (noisy mic rationale). But deafened is different -- you can't hear anyone, which suggests you're not co-working.
**How to avoid:** Decision (Claude's discretion): self-deafened members remain tracked. Rationale: some people deafen while focusing deeply with their own music. The only AFK signal should be moving to the AFK channel. This keeps the rule simple and avoids false negatives.
**Warning signs:** Members complaining about unfair tracking rules.

## Code Examples

Verified patterns from the existing codebase and discord.js documentation:

### Adding GuildVoiceStates Intent
```typescript
// src/core/client.ts -- ADD GatewayIntentBits.GuildVoiceStates
import { Client, GatewayIntentBits, Partials } from 'discord.js';

export function createClient(): Client {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildVoiceStates, // NEW: Required for voiceStateUpdate
    ],
    partials: [
      Partials.Channel,
      Partials.Message,
    ],
  });
}
```

### Voice State Change Detection
```typescript
// Source: discord.js voiceStateUpdate event documentation
// Voice tracker module registers this on the discord.js client directly

client.on('voiceStateUpdate', (oldState, newState) => {
  const memberId = newState.id; // Discord user ID
  const oldChannel = oldState.channelId;
  const newChannel = newState.channelId;
  const guild = newState.guild;
  const afkChannelId = guild.afkChannelId; // null if no AFK channel configured

  if (!oldChannel && newChannel) {
    // JOINED a voice channel
    if (newChannel !== afkChannelId) {
      startSession(memberId, newChannel);
    }
  } else if (oldChannel && !newChannel) {
    // LEFT all voice channels
    endSession(memberId);
  } else if (oldChannel && newChannel && oldChannel !== newChannel) {
    // SWITCHED channels
    if (newChannel === afkChannelId) {
      pauseSession(memberId); // Moved to AFK
    } else if (oldChannel === afkChannelId) {
      resumeSession(memberId); // Returned from AFK
    } else {
      // Switched between tracked channels -- continue session
      updateSessionChannel(memberId, newChannel);
    }
  }
});
```

### Leaderboard Query (XP)
```typescript
// Source: Prisma findMany with orderBy
// Simple and sufficient for 10-25 members

async function getXPLeaderboard(db: ExtendedPrismaClient, limit: number = 10) {
  const members = await db.member.findMany({
    orderBy: { totalXp: 'desc' },
    take: limit,
    select: {
      id: true,
      displayName: true,
      totalXp: true,
      currentStreak: true,
    },
  });

  return members.map((m, index) => ({
    position: index + 1,
    ...m,
  }));
}
```

### Voice Hours Leaderboard Query (Seasonal)
```typescript
// Source: Prisma aggregate with date filtering
// Sum voice session durations within a season date range

async function getVoiceLeaderboard(
  db: ExtendedPrismaClient,
  seasonStart: Date,
  seasonEnd: Date,
  limit: number = 10,
) {
  const results = await db.voiceSession.groupBy({
    by: ['memberId'],
    where: {
      startedAt: { gte: seasonStart },
      endedAt: { lte: seasonEnd, not: null },
    },
    _sum: { durationMinutes: true },
    orderBy: { _sum: { durationMinutes: 'desc' } },
    take: limit,
  });

  // Enrich with member display names
  const memberIds = results.map(r => r.memberId);
  const members = await db.member.findMany({
    where: { id: { in: memberIds } },
    select: { id: true, displayName: true },
  });
  const memberMap = new Map(members.map(m => [m.id, m.displayName]));

  return results.map((r, index) => ({
    position: index + 1,
    memberId: r.memberId,
    displayName: memberMap.get(r.memberId) ?? 'Unknown',
    totalMinutes: r._sum.durationMinutes ?? 0,
  }));
}
```

### Wins/Lessons Message Handler
```typescript
// Source: discord.js Message.react() documentation

async function handleWinsLessonsMessage(message: Message, db: ExtendedPrismaClient) {
  if (message.author.bot) return;

  const isWins = message.channelId === WINS_CHANNEL_ID;
  const isLessons = message.channelId === LESSONS_CHANNEL_ID;
  if (!isWins && !isLessons) return;

  // Resolve member from Discord ID
  const account = await db.discordAccount.findUnique({
    where: { discordId: message.author.id },
  });
  if (!account) return; // Not a registered member

  // Check cooldown (prevent XP spam)
  if (isOnCooldown(account.memberId, isWins ? 'win' : 'lesson')) return;

  // React with appropriate emoji -- no reply
  const emoji = isWins ? '\uD83D\uDCAA' : '\uD83E\uDDE0'; // muscle / brain
  await message.react(emoji);

  // Award XP silently
  const xp = isWins ? XP_AWARDS.win : XP_AWARDS.lesson;
  const source = isWins ? 'WIN_POST' : 'LESSON_POST';
  const result = await awardXP(db, account.memberId, xp, source,
    `Posted in #${isWins ? 'wins' : 'lessons'}`);

  // Emit events for other modules
  events.emit('xpAwarded', account.memberId, xp, result.newTotal, source);
  if (result.leveledUp && result.newRank && result.oldRank) {
    events.emit('levelUp', account.memberId, result.newRank, result.oldRank, result.newTotal);
  }
}
```

### Editing Existing Leaderboard Messages
```typescript
// Source: discord.js Message.edit() + channel.messages.fetch()

async function updateLeaderboardChannel(
  client: Client,
  channelId: string,
  messageIds: { xp: string; voice: string; streaks: string },
  embeds: { xp: EmbedBuilder; voice: EmbedBuilder; streaks: EmbedBuilder },
) {
  const channel = await client.channels.fetch(channelId);
  if (!channel?.isTextBased()) return;
  const textChannel = channel as TextChannel;

  for (const [type, messageId] of Object.entries(messageIds)) {
    const embed = embeds[type as keyof typeof embeds];
    try {
      const msg = await textChannel.messages.fetch(messageId);
      await msg.edit({ embeds: [embed] });
    } catch {
      // Message deleted -- recreate
      const newMsg = await textChannel.send({ embeds: [embed] });
      // Store new message ID in DB
    }
  }
}
```

### Event Bus Extensions (New Events for Phase 3)
```typescript
// Add to src/core/events.ts BotEventMap:

// Phase 3: Competition and Social Proof
voiceSessionStarted: [memberId: string, channelId: string];
voiceSessionEnded: [memberId: string, durationMinutes: number, channelId: string];
winPosted: [memberId: string, messageId: string];
lessonPosted: [memberId: string, messageId: string];
seasonEnded: [seasonNumber: number];
seasonStarted: [seasonNumber: number];
```

## Discretion Recommendations

These are areas the user left to Claude's discretion. Research-backed recommendations follow.

### Leaderboard Refresh Cadence
**Recommendation:** Every 15 minutes via cron.
**Rationale:** Frequent enough that leaderboards feel "live" when consulted. Infrequent enough to avoid rate limit concerns. Editing 3 messages every 15 minutes = 12 API calls/hour, well within Discord's 50 req/sec limit. The cron expression: `*/15 * * * *`.

### Leaderboard Display Format
**Recommendation:** Show top 10 + the viewing member's position (if not in top 10) on the /leaderboard command. Show top 10 only in the #leaderboard channel (no personalization possible for a static message).
**Rationale:** With 10-25 members, top 10 covers 40-100% of the group. Adding "Your position: #14" on the command gives personal relevance without cluttering the static channel display.

### Voice Session Minimum Length
**Recommendation:** 5 minutes minimum before a session is recorded and counts toward leaderboard/XP.
**Rationale:** Prevents accidental join/leave from polluting data. Most legitimate co-working sessions last 15+ minutes. 5 minutes catches intentional short check-ins while filtering noise.

### AFK Detection Specifics
**Recommendation:**
- Moving to guild AFK channel: immediately pause session (use guild.afkChannelId).
- Server-deafened by admin: pause session (suggests admin intervention for inactivity).
- Self-deafened: continue tracking (user decided muted counts; deafened is similar -- deep focus).
- Self-muted: continue tracking (user explicitly decided this).
- No additional timeout-based AFK detection beyond Discord's built-in AFK channel feature.
**Rationale:** The guild's AFK channel is Discord's native mechanism for "this person is idle." Piggyback on it rather than building a custom inactivity timer. Simple rules are easier to explain to members.

### Noteworthy Session Threshold
**Recommendation:** 90 minutes (1.5 hours).
**Rationale:** Most co-working sessions for focused work run 1-3 hours. 90 minutes is long enough to be genuinely noteworthy without being so high that announcements are rare. A 2-hour session should feel celebrated; a 30-minute pop-in should not.

### Wins vs Lessons XP Balance
**Recommendation:** Wins = 30 XP, Lessons = 35 XP. Per-member cooldown of 1 award per type per 2 hours.
**Rationale:** Lessons are slightly more valuable because sharing what went wrong requires vulnerability and is more useful to the group. The user's decision notes that "sharing lessons should be encouraged, not penalized." Making lessons worth slightly more than wins subtly encourages sharing failures alongside successes. The cooldown prevents spam while allowing multiple genuine posts per day.

### Season Length
**Recommendation:** 2 months (approximately 8-9 weeks).
**Rationale:** Based on Valorant's competitive system (each "Act" runs ~2 months), gaming psychology research showing engagement drops at 8-12 weeks, and the 10-25 person group size. 1 month is too short for meaningful competition to develop. 3 months is too long -- engagement decays and insurmountable gaps form. 2 months gives enough time for meaningful competition while keeping resets frequent enough that falling behind is recoverable.

### Season Reset Scope
**Recommendation:**
- **Resets:** Seasonal leaderboard positions, seasonal voice hours counter, seasonal XP delta tracking.
- **Carries over:** Member.totalXp (lifetime), Member.currentStreak, Member.longestStreak, all XPTransaction records, all VoiceSession records (historical data).
- **How it works:** Leaderboards are computed from data within the current season's date range. No data is deleted -- seasonal rankings are calculated by filtering XP transactions and voice sessions by date.
**Rationale:** This is the cleanest approach because it requires zero destructive operations. Leaderboards become date-range queries. Season 1 data is always available because the raw records remain in the database. There is no "reset" operation that could go wrong -- just a new season with a start date.

### Season Champion Recognition
**Recommendation:** Temporary "Season X Champion" Discord role (gold color, displayed above rank roles) that lasts for the first week of the next season, then is auto-removed. Permanent recognition in #hall-of-fame only.
**Rationale:** A temporary role gives bragging rights without creating permanent hierarchy (user's explicit concern). One week is long enough to enjoy the recognition but short enough that it doesn't create a lasting social divide. The #hall-of-fame pinned summary provides permanent historical recognition that members can revisit.

## Schema Extensions

### New Models
```prisma
// Voice session tracking -- one record per completed session
model VoiceSession {
  id              String    @id @default(cuid())
  memberId        String
  channelId       String    // Discord voice channel ID
  startedAt       DateTime
  endedAt         DateTime?
  durationMinutes Int?      // Calculated on session end (excludes paused time)
  seasonId        String?   // Links to Season for easy seasonal queries

  member Member  @relation(fields: [memberId], references: [id], onDelete: Cascade)
  season Season? @relation(fields: [seasonId], references: [id])

  @@index([memberId, startedAt])
  @@index([seasonId])
}

// Season definition -- represents a competitive period
model Season {
  id        String   @id @default(cuid())
  number    Int      @unique // Season 1, 2, 3...
  startedAt DateTime
  endedAt   DateTime?
  active    Boolean  @default(true)

  voiceSessions VoiceSession[]
  snapshots     SeasonSnapshot[]

  @@index([active])
}

// Season snapshot -- archived leaderboard positions at season end
model SeasonSnapshot {
  id              String @id @default(cuid())
  seasonId        String
  memberId        String
  dimension       String // "xp", "voice", "streaks"
  position        Int    // Final leaderboard position
  value           Int    // XP earned, minutes tracked, streak length at season end

  season Season @relation(fields: [seasonId], references: [id], onDelete: Cascade)
  member Member @relation(fields: [memberId], references: [id], onDelete: Cascade)

  @@unique([seasonId, memberId, dimension])
  @@index([seasonId])
}

// Stored message IDs for leaderboard channel auto-updating
model BotConfig {
  key   String @id
  value String
}
```

### XPSource Enum Extension
```prisma
enum XPSource {
  CHECKIN
  GOAL_COMPLETE
  STREAK_BONUS
  SETUP_BONUS
  VOICE_SESSION   // NEW: XP from co-working voice sessions
  WIN_POST        // NEW: XP from posting in #wins
  LESSON_POST     // NEW: XP from posting in #lessons
}
```

### Member Model Extension
```prisma
model Member {
  // ... existing fields ...

  // NEW: Phase 3 relations
  voiceSessions  VoiceSession[]
  seasonSnapshots SeasonSnapshot[]
}
```

## Voice XP Formula

**Recommendation:** 1 XP per 3 minutes of tracked voice time, with a daily cap of 200 XP from voice sessions.

| Session Length | XP Earned | Notes |
|---------------|-----------|-------|
| 5 min (minimum) | 1 XP | Just over threshold |
| 30 min | 10 XP | Short focus session |
| 1 hour | 20 XP | Standard session |
| 2 hours | 40 XP | Solid co-work block |
| 4 hours | 80 XP | Deep work marathon |
| 8+ hours | 200 XP (cap) | Daily cap prevents AFK farming |

**Rationale:** Voice XP should supplement, not dominate. A 2-hour voice session (40 XP) is worth more than a second check-in (12 XP) but less than a goal completion (75-100 XP). This keeps the incentive hierarchy: completing goals > first check-in > voice sessions > posting wins/lessons. The daily cap of 200 prevents someone from joining voice and going AFK all day to farm XP.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate @discordjs/voice for all voice features | Native voiceStateUpdate for tracking, @discordjs/voice only for playing audio | discord.js v14 (2022+) | Voice presence tracking needs zero additional packages |
| Discord message sending generates notifications | MessageFlags.SuppressNotifications flag available | discord.js v14.8+ (2023) | Bot can send messages silently; however for editing existing messages, edits never generate notifications anyway |
| Manual message pinning for persistent content | Bot-managed message editing for live content | Standard pattern | Editable messages are better than pins for auto-updating content |

**Deprecated/outdated:**
- @discordjs/voice for presence tracking: Unnecessary overhead. Only use if the bot needs to join voice and play audio. Passive voice state monitoring uses the native discord.js Client event.

## Open Questions

1. **Channel ID Discovery for #wins, #lessons, #leaderboard, #hall-of-fame**
   - What we know: SERVER_CATEGORIES in constants.ts defines channel names including "wins" and "lessons" under "The Hub" category. The leaderboard and hall-of-fame channels do not exist yet.
   - What's unclear: Whether to look up channels by name at runtime or store channel IDs in BotConfig/environment variables.
   - Recommendation: Create #leaderboard and #hall-of-fame during module initialization (like server-setup does for other channels). Look up channel IDs by name from the guild cache. Store the #leaderboard message IDs in BotConfig for persistence across restarts. This is more resilient than hardcoded IDs.

2. **Autocomplete Interaction Handler**
   - What we know: The current interactionCreate handler in index.ts only handles `isChatInputCommand()`. The /leaderboard command with a "type" option or /season with a number option may benefit from autocomplete.
   - What's unclear: Whether autocomplete interactions need explicit routing.
   - Recommendation: For /leaderboard, use string choices (predefined: "xp", "voice", "streaks") rather than autocomplete -- simpler and sufficient for 3 fixed options. For /season, use an integer option with optional autocomplete listing available seasons.

3. **First Season Bootstrapping**
   - What we know: There's no Season data yet. The system needs to handle the "no active season" state.
   - What's unclear: Should Season 1 be created automatically on first bot startup after Phase 3, or via an admin command?
   - Recommendation: Auto-create Season 1 on bot ready if no active season exists. This avoids a manual step and makes the system self-bootstrapping. Log the creation clearly.

## Sources

### Primary (HIGH confidence)
- [discord.js VoiceState Class (v14.19.3)](https://discord.js.org/docs/packages/discord.js/14.19.3/VoiceState:Class) - Voice state properties: channelId, selfMute, selfDeaf, serverMute, serverDeaf, suppress, selfVideo, streaming
- [discord.js Guild Class (v14.25.1)](https://discord.js.org/docs/packages/discord.js/14.25.1/Guild:Class) - Guild.afkChannelId and Guild.afkTimeout properties for AFK channel detection
- [discord.js MessageFlags Enum (v14.19.2)](https://discord.js.org/docs/packages/discord.js/14.19.2/MessageFlags:Enum) - SuppressNotifications flag for silent messages
- [discord.js Message Class (v14.18.0)](https://discord.js.org/docs/packages/discord.js/14.18.0/Message:class) - message.react() and message.edit() methods
- [Prisma Aggregation Documentation](https://www.prisma.io/docs/orm/prisma-client/queries/aggregation-grouping-summarizing) - groupBy with _sum, orderBy for leaderboard queries
- [Prisma Raw SQL / TypedSQL](https://www.prisma.io/docs/orm/prisma-client/using-raw-sql/typedsql) - RANK() window function via raw SQL if needed

### Secondary (MEDIUM confidence)
- [Valorant Season Schedule (GameLeap)](https://www.gameleap.com/articles/valorant-season-and-act-schedule-explained-2025-update) - Valorant acts run ~2 months each, with rank resets
- [discord.js v14 Events Cheatsheet](https://gist.github.com/Iliannnn/f4985563833e2538b1b96a8cb89d72bb) - voiceStateUpdate event parameters and behavior
- [Discord Study Bot (GitHub)](https://github.com/shubhayu-64/Discord-Study-Bot) - Reference implementation for study-time-based leaderboard with daily/weekly/monthly breakdowns

### Tertiary (LOW confidence)
- Community patterns for leaderboard refresh cadence (15-30 minutes is common consensus across Discord bot communities)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new dependencies; all APIs verified against official discord.js v14 docs
- Architecture: HIGH - Follows established module pattern from Phases 1-2; voice tracking is a well-understood pattern
- Pitfalls: HIGH - Voice session edge cases (restart, switch, AFK) are documented extensively in Discord bot communities; leaderboard DOM loop risk covered in project PITFALLS.md
- Discretion recommendations: MEDIUM - Based on gaming psychology research (Valorant seasons) and community size analysis, but optimal values will need tuning in practice

**Research date:** 2026-03-20
**Valid until:** 2026-04-20 (30 days -- stable domain, discord.js v14 is mature)
