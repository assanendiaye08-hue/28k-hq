# Phase 5: Content, Sessions, and Trust - Research

**Researched:** 2026-03-20
**Domain:** Discord bot features -- resource sharing channels, member-initiated lock-in sessions, data transparency/privacy commands
**Confidence:** HIGH

## Summary

Phase 5 introduces three distinct feature areas into the existing Discord Hustler bot: (1) resource sharing channels with AI-powered auto-tagging and discussion threads, (2) lock-in session management with both instant and scheduled modes and private/public visibility, and (3) full data transparency via /mydata export and /deletedata hard delete. All features build on the existing architecture of discord.js v14 modules, Prisma 7 with encryption extension, and OpenRouter AI integration.

The codebase already has strong patterns for all the building blocks needed: channel creation with permissions (onboarding/channel-setup.ts), AI-powered tag extraction (profile/ai-tags.ts), voice session tracking with in-memory state (voice-tracker/tracker.ts), XP awards (xp/engine.ts), private space delivery (shared/delivery.ts), and per-member encryption (db/encryption.ts). The key challenge is designing the session system's voice channel lifecycle (create, permission-gate, track, clean up) and ensuring the /deletedata command achieves true hard deletion via Prisma's existing `onDelete: Cascade` relations.

**Primary recommendation:** Three new modules (`resources`, `sessions`, `data-privacy`) following existing module patterns. Resource sharing leverages existing channel + messageCreate detection. Sessions require new Prisma models for session state and a voice channel lifecycle manager. Data privacy leverages Prisma cascade deletes plus Discord role/channel cleanup.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Resource sharing channels**: Hybrid approach -- 3-4 broad channels (#tech-resources, #business-resources, #growth-resources) as containers, bot auto-tags posts by specific interest using AI for searchability
- Anyone can post -- community-driven contributions
- Bot auto-creates a discussion thread on each resource post to keep the channel clean
- Bot reaction + auto-thread behavior -- Claude decides whether to add small XP for sharing
- **Lock-in sessions**: Both instant (/lockin) and scheduled (/schedule-session) slash commands
- Natural text trigger via DM with Ace (e.g. "start a lockin and invite @john") alongside slash commands
- **Private vs Public sessions**: Private = only invitees join and get DM'd, creator can invite mid-session. Public = invitees get DMs + bot posts in #sessions and pings @LockInSessions role
- Multiple sessions can run simultaneously in different voice channels
- Member specifies what they're working on at session start (or bot infers from active goals)
- Session end: summary posted with who attended, total time, what was worked on. XP aware of voice tracker to avoid double-counting
- No server-wide pings for individual actions -- respect focus time
- **/mydata**: Full export as JSON file DM'd to member -- ALL their data (profile, check-ins, goals, XP history, conversations, voice sessions)
- **/deletedata**: Hard delete with confirmation prompt. On confirm: all data wiped, removed from leaderboards, roles stripped. Permanent, no recovery
- **Owner-blind privacy**: Absolute -- encrypted at rest with per-member keys (extends Phase 1 encryption infra). DM conversations, private notes, raw check-in text all encrypted. DB access shows only gibberish
- Individual commands (/mydata, /deletedata) rather than unified /privacy command
- Brief privacy mention during onboarding + recovery key delivery (already partially done in Phase 1)

### Claude's Discretion
- Whether to award small XP for resource sharing (and how much)
- Resource auto-tagging implementation (AI extraction from link content or member-specified)
- Trust signal approach (footer, periodic reminder, or none)
- Session voice channel naming convention
- How bot infers "what you're working on" from active goals when member doesn't specify

### Deferred Ideas (OUT OF SCOPE)
- Server structure lane cleanup -- remove three-lane (freelancing/ecom/content) references from constants, channels, embeds. Replace with interest-based approach. MUST DO in Phase 6
- Auto-content feeds from RSS/APIs -- Phase 6 (CONT-02)
- Per-notification-type account routing -- Phase 6 (FNDN-06)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CONT-01 | Resource sharing channels organized by interest area, members can post and discuss | Broad resource channels with AI auto-tagging, auto-thread creation on each post, optional XP reward |
| SESS-01 | Member-initiated lock-in sessions -- member asks bot to schedule/start a session, bot announces and tracks attendance | /lockin (instant) and /schedule-session (scheduled) commands, private/public modes, voice channel lifecycle, attendance tracking, session summary with XP |
| TRUST-01 | /mydata command -- members can view everything the bot stores about them | JSON export of all member data tables via Prisma queries, delivered as file attachment via DM |
| TRUST-02 | Data deletion -- members can wipe all their stored data with a command | /deletedata with confirmation, cascade delete via Member record deletion, Discord role/channel cleanup |
| TRUST-03 | Owner-blind privacy -- private conversations and data members mark as private are not accessible to server admins | Already implemented via Phase 1 encryption extension -- verify all Phase 5 encrypted fields are registered, confirm DM conversations remain encrypted |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| discord.js | ^14.25.1 | Bot framework, channel/thread/voice management, permissions | Already in project, handles all Discord API interactions |
| @prisma/client | ^7.5.0 | Database ORM with cascade deletes | Already in project, all models use `onDelete: Cascade` |
| @openrouter/sdk | ^0.9.11 | AI-powered resource tagging | Already in project, same pattern as profile/ai-tags.ts |
| node-cron | ^4.2.1 | Scheduled session announcements and cleanup | Already in project, used by scheduler module |
| zod | ^4.3.6 | Input validation for session parameters | Already in project |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| date-fns + @date-fns/tz | ^4.1.0 / ^1.4.1 | Timezone-aware session scheduling | Already in project, parsing scheduled session times |
| winston | ^3.19.0 | Logging | Already in project |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom thread creation | discord-needle bot | Custom is better -- we need thread naming and bot behavior control |
| Temporary voice channel library | discord.js-temporary-channel | Custom is better -- our lifecycle is unique (permissions, session tracking, XP integration) |

**Installation:**
```bash
# No new dependencies needed -- all libraries already installed
```

## Architecture Patterns

### Recommended Project Structure
```
src/modules/
  resources/
    index.ts          # Module registration, messageCreate listener
    handler.ts        # Resource post detection, thread creation, XP
    tagger.ts         # AI-powered resource auto-tagging
    constants.ts      # Channel names, XP amount, emoji
    embeds.ts         # Resource thread welcome embed
  sessions/
    index.ts          # Module registration, commands, event listeners
    commands.ts       # /lockin, /schedule-session, /endsession slash commands
    manager.ts        # Session lifecycle (create, join, leave, end, cleanup)
    voice-channels.ts # Voice channel creation/deletion with permissions
    scheduler.ts      # Scheduled session announcement cron tasks
    constants.ts      # Session config, XP, naming conventions
    embeds.ts         # Session announcement, summary embeds
  data-privacy/
    index.ts          # Module registration
    commands.ts       # /mydata, /deletedata command builders + handlers
    exporter.ts       # Full data export as JSON
    deleter.ts        # Hard delete with cascade + Discord cleanup
    constants.ts      # Confirmation timeout, export format version
```

### Pattern 1: Resource Channel Message Detection (following wins-lessons pattern)
**What:** Listen to messageCreate events in resource channels, auto-create discussion threads, optionally award XP.
**When to use:** For all posts in #tech-resources, #business-resources, #growth-resources.
**Example:**
```typescript
// Source: Existing pattern from src/modules/wins-lessons/handler.ts
const RESOURCE_CHANNELS = ['tech-resources', 'business-resources', 'growth-resources'];

export async function handleResourcePost(
  message: Message,
  db: ExtendedPrismaClient,
  events: IEventBus,
): Promise<void> {
  if (message.author.bot) return;
  if (!message.guild) return;

  const channelName = (message.channel as TextChannel).name;
  if (!RESOURCE_CHANNELS.includes(channelName)) return;

  // Resolve member
  const account = await db.discordAccount.findUnique({
    where: { discordId: message.author.id },
  });
  if (!account) return;

  // Auto-create discussion thread
  const thread = await message.startThread({
    name: `Discuss: ${message.content.slice(0, 80).replace(/\n/g, ' ')}`,
    autoArchiveDuration: 1440, // 24 hours
    reason: 'Auto-thread for resource sharing',
  });

  // Bot reacts
  await message.react('🔗');

  // Optional: AI tag extraction for searchability
  // Award XP if configured
}
```

### Pattern 2: Voice Channel Lifecycle for Sessions
**What:** Create temporary voice channels with permission overwrites for session privacy, clean up when session ends.
**When to use:** Every time a lock-in session starts (instant or scheduled).
**Example:**
```typescript
// Source: Discord.js docs + existing onboarding/channel-setup.ts pattern
import { ChannelType, PermissionFlagsBits } from 'discord.js';

export async function createSessionVoiceChannel(
  guild: Guild,
  sessionName: string,
  creatorDiscordId: string,
  inviteeDiscordIds: string[],
  isPublic: boolean,
  botId: string,
): Promise<VoiceChannel> {
  const category = guild.channels.cache.find(
    ch => ch.type === ChannelType.GuildCategory && ch.name === 'VOICE',
  );

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: isPublic
        ? [] // Public: everyone can see
        : [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
    },
    {
      id: botId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect,
              PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers],
    },
    {
      id: creatorDiscordId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect,
              PermissionFlagsBits.MoveMembers],
    },
    ...inviteeDiscordIds.map(id => ({
      id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
    })),
  ];

  // For public sessions, also allow the @LockInSessions role
  if (isPublic) {
    const lockInRole = guild.roles.cache.find(r => r.name === 'LockInSessions');
    if (lockInRole) {
      overwrites.push({
        id: lockInRole.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
      });
    }
  }

  return guild.channels.create({
    name: sessionName,
    type: ChannelType.GuildVoice,
    parent: category ?? undefined,
    permissionOverwrites: overwrites,
    reason: `Lock-in session: ${sessionName}`,
  });
}
```

### Pattern 3: Data Export via JSON File Attachment
**What:** Gather all member data, build a JSON object, send as file via DM.
**When to use:** /mydata command.
**Example:**
```typescript
// Source: Existing /wipe-history pattern from ai-assistant/commands.ts
import { AttachmentBuilder } from 'discord.js';

export async function exportMemberData(
  db: ExtendedPrismaClient,
  memberId: string,
): Promise<Buffer> {
  const member = await db.member.findUniqueOrThrow({
    where: { id: memberId },
    include: {
      accounts: { select: { discordId: true, linkedAt: true } },
      profile: true,
      checkIns: true,
      goals: true,
      xpTransactions: true,
      voiceSessions: true,
      conversationMessages: { orderBy: { createdAt: 'asc' } },
      conversationSummary: true,
      schedule: true,
      seasonSnapshots: true,
      privateSpace: true,
    },
  });

  const exportData = {
    exportVersion: 1,
    exportedAt: new Date().toISOString(),
    member: {
      id: member.id,
      displayName: member.displayName,
      totalXp: member.totalXp,
      currentStreak: member.currentStreak,
      longestStreak: member.longestStreak,
      createdAt: member.createdAt,
      // ... all fields
    },
    // ... all related data
  };

  return Buffer.from(JSON.stringify(exportData, null, 2), 'utf-8');
}

// Usage in command handler:
const jsonBuffer = await exportMemberData(db, memberId);
const attachment = new AttachmentBuilder(jsonBuffer, {
  name: `mydata-${member.displayName}-${Date.now()}.json`,
});
await interaction.user.send({ files: [attachment] });
```

### Pattern 4: Hard Delete with Cascade
**What:** Delete the Member record and rely on Prisma cascade deletes for all relations.
**When to use:** /deletedata after confirmation.
**Example:**
```typescript
// All relations in schema.prisma use onDelete: Cascade
// Deleting the Member record cascades to:
//   DiscordAccount, MemberProfile, PrivateSpace, CheckIn, Goal,
//   XPTransaction, MemberSchedule, VoiceSession, ConversationMessage,
//   ConversationSummary, SeasonSnapshot

export async function hardDeleteMember(
  db: ExtendedPrismaClient,
  client: Client,
  memberId: string,
  guild: Guild,
): Promise<void> {
  // 1. Gather Discord IDs before deletion (for role cleanup)
  const accounts = await db.discordAccount.findMany({
    where: { memberId },
    select: { discordId: true },
  });

  // 2. Delete private space channel if exists
  const space = await db.privateSpace.findUnique({ where: { memberId } });
  if (space?.channelId) {
    try {
      const channel = await client.channels.fetch(space.channelId);
      if (channel) await channel.delete('Member data deletion');
    } catch { /* Channel may already be gone */ }
  }

  // 3. Cascade delete all data via Member record
  await db.member.delete({ where: { id: memberId } });

  // 4. Strip roles from all linked Discord accounts
  for (const account of accounts) {
    try {
      const guildMember = await guild.members.fetch(account.discordId);
      await guildMember.roles.set([]); // Remove all bot-managed roles
    } catch { /* Member may have left the server */ }
  }
}
```

### Anti-Patterns to Avoid
- **Manually deleting each relation table**: The schema already has `onDelete: Cascade` on ALL member relations. Use a single `db.member.delete()` -- do NOT write 12 separate deleteMany calls.
- **Storing session state only in the database**: Active sessions need in-memory state for real-time tracking (same pattern as voice-tracker). Use Map for active sessions, persist to DB on end.
- **Blocking on AI tagging**: Resource auto-tagging should be fire-and-forget (async, non-blocking). The thread creation and reaction are immediate; tag extraction updates the thread or a searchable index asynchronously.
- **Pinging @everyone for sessions**: Only public sessions ping the @LockInSessions opt-in role. Never ping @everyone or @here.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Thread creation from messages | Custom message splitting/linking | `message.startThread()` | Discord API handles thread lifecycle, archiving, permissions automatically |
| Cascade data deletion | Manual DELETE queries per table | `db.member.delete()` with existing `onDelete: Cascade` | Schema already configured -- 12 tables cascade automatically |
| Voice channel permissions | Manual permission bit math | `PermissionFlagsBits` + `permissionOverwrites` array | discord.js handles permission resolution, inheritance, validation |
| Scheduled session reminders | setTimeout-based scheduling | `node-cron` via existing SchedulerManager pattern | Survives bot restarts, timezone-aware, proven pattern in codebase |
| JSON data export | Manual field-by-field serialization | Prisma `include` with all relations + `JSON.stringify` | Prisma returns the complete object graph; `include` does one query per relation (batched) |

**Key insight:** The existing codebase already has solutions for every subproblem. Resource detection = wins-lessons pattern. Voice channels = onboarding/channel-setup pattern. AI tagging = profile/ai-tags pattern. Export = wipe-history pattern. The risk is not knowing what already exists and rebuilding it.

## Common Pitfalls

### Pitfall 1: Double XP from Session + Voice Tracker
**What goes wrong:** When a lock-in session runs in a voice channel, the existing voice-tracker module ALSO tracks that session and awards XP independently. Member gets XP twice.
**Why it happens:** Voice-tracker listens to `voiceStateUpdate` globally for all channels under the VOICE category. Lock-in sessions create voice channels in the same category.
**How to avoid:** The session module should coordinate with voice-tracker. Two approaches: (a) session module does NOT award voice XP, lets voice-tracker handle it exclusively; or (b) session voice channels use a different category name that voice-tracker ignores. Option (a) is simpler and more robust -- session XP only awards bonus for organizing/attending, not duplicate time-based XP.
**Warning signs:** XPTransaction records show both VOICE_SESSION and a session source for the same time period.

### Pitfall 2: Orphaned Voice Channels on Bot Crash
**What goes wrong:** Bot creates a temporary voice channel for a session, then crashes before cleanup. Channel remains forever with wrong permissions.
**Why it happens:** In-memory session state is lost on crash. Voice channel exists in Discord but bot has no reference to it.
**How to avoid:** Persist session state (including voice channel ID) to the database immediately after channel creation. On bot ready, scan for session voice channels that should have been cleaned up. Same pattern as voice-tracker's `reconstructSessions`.
**Warning signs:** Voice channels named "lockin-*" or similar accumulating in the server.

### Pitfall 3: Thread Name Conflicts
**What goes wrong:** Discord thread names have a 100-character limit. Long resource posts create threads with truncated, confusing names.
**Why it happens:** Using the full message content as thread name without truncation.
**How to avoid:** Truncate to ~80 chars, add ellipsis. If AI tagging is available, use the extracted topic as thread name instead of raw message text.
**Warning signs:** Thread names that end mid-word or mid-URL.

### Pitfall 4: /deletedata Leaving Ghost Roles
**What goes wrong:** Member data is deleted from the database, but their Discord roles (rank roles, interest tag roles) remain on the Discord account.
**Why it happens:** Database cascade only affects the database. Discord roles are external state.
**How to avoid:** Before deleting the database record, fetch all linked Discord accounts and strip roles. Also clean up the private space channel. Do Discord cleanup BEFORE database deletion (so you still have the Discord IDs).
**Warning signs:** Members who deleted their data still showing rank roles or interest tags in the server.

### Pitfall 5: Encryption Extension Not Covering New Models
**What goes wrong:** New models added in Phase 5 (e.g., LockInSession with a `description` field) are not registered in the encryption extension's ENCRYPTED_FIELDS map.
**Why it happens:** The encryption extension in db/encryption.ts has a hardcoded map of model->fields. New models don't automatically get encryption.
**How to avoid:** For any new model with personal text data, add it to ENCRYPTED_FIELDS in db/encryption.ts. Review: LockInSession.description and any resource-related text should be evaluated.
**Warning signs:** Reading a new model's text field from the database returns plaintext instead of base64-encoded ciphertext.

### Pitfall 6: DM Delivery Failure for /mydata
**What goes wrong:** Member has DMs closed, so the JSON file attachment can't be delivered.
**Why it happens:** Discord users can disable DMs from server members. The bot sending a DM may fail silently.
**How to avoid:** Try DM delivery first. If it fails, fall back to sending the file in the member's private space channel (if CHANNEL type). If both fail, reply ephemerally with instructions to enable DMs or use a private channel.
**Warning signs:** /mydata appears to succeed but member never receives the file.

## Code Examples

### Resource Post Thread Creation
```typescript
// Source: Discord.js threads guide + wins-lessons handler pattern
import { type Message, type TextChannel, ThreadAutoArchiveDuration } from 'discord.js';

export async function createResourceThread(message: Message): Promise<void> {
  // Extract a short title from the message
  const firstLine = message.content.split('\n')[0] || 'Resource';
  const threadName = firstLine.length > 80
    ? firstLine.slice(0, 77) + '...'
    : firstLine;

  const thread = await message.startThread({
    name: `Discuss: ${threadName}`,
    autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
    reason: 'Auto-thread for resource discussion',
  });

  // Send a welcome message in the thread
  await thread.send(
    `Thread created for discussion. Share your thoughts on this resource!`,
  );
}
```

### Session State Model (Prisma Schema Addition)
```prisma
// New models for Phase 5: Sessions

model LockInSession {
  id              String         @id @default(cuid())
  creatorMemberId String
  voiceChannelId  String?        // Discord voice channel ID (null if scheduled but not started)
  title           String         // What the session is about
  visibility      SessionVisibility
  status          SessionStatus  @default(PENDING)
  scheduledFor    DateTime?      // Null for instant sessions
  startedAt       DateTime?
  endedAt         DateTime?
  durationMinutes Int?

  participants    SessionParticipant[]

  @@index([status])
  @@index([creatorMemberId])
  @@index([scheduledFor])
}

model SessionParticipant {
  id        String  @id @default(cuid())
  sessionId String
  memberId  String
  role      String  @default("participant") // "creator" or "participant"
  joinedAt  DateTime @default(now())
  leftAt    DateTime?

  session LockInSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@unique([sessionId, memberId])
  @@index([memberId])
}

enum SessionVisibility {
  PUBLIC
  PRIVATE
}

enum SessionStatus {
  PENDING     // Scheduled but not started
  ACTIVE      // Currently running
  COMPLETED   // Ended normally
  CANCELLED   // Creator cancelled before starting
}
```

### XP Source Extension
```prisma
// Add to existing XPSource enum
enum XPSource {
  CHECKIN
  GOAL_COMPLETE
  STREAK_BONUS
  SETUP_BONUS
  VOICE_SESSION
  WIN_POST
  LESSON_POST
  RESOURCE_SHARE   // New: sharing a resource in resource channels
  SESSION_HOST     // New: hosting a lock-in session (optional)
}
```

### AI Resource Auto-Tagging
```typescript
// Source: Existing profile/ai-tags.ts pattern
export async function extractResourceTags(
  messageContent: string,
): Promise<{ topic: string; tags: string[] }> {
  const client = getOpenRouterClient();

  const completion = await client.chat.send({
    chatGenerationParams: {
      model: 'deepseek/deepseek-v3.2',
      messages: [
        {
          role: 'system',
          content: `Extract a short topic title (5-10 words) and 2-4 interest tags from this resource post. Tags should match common interest areas (e.g., "web development", "marketing", "ecommerce", "content creation", "freelancing", "AI tools").`,
        },
        {
          role: 'user',
          content: messageContent,
        },
      ],
      responseFormat: {
        type: 'json_schema',
        jsonSchema: {
          name: 'resource_tags',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              topic: { type: 'string' },
              tags: { type: 'array', items: { type: 'string' } },
            },
            required: ['topic', 'tags'],
            additionalProperties: false,
          },
        },
      },
      stream: false,
    },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    return { topic: 'Resource', tags: [] };
  }
  return JSON.parse(content);
}
```

### Natural Language Session Trigger (Ace DM Integration)
```typescript
// Source: Existing ai-assistant/chat.ts handleChat pattern
// The AI system prompt should include instructions about session commands.
// When Ace detects a lock-in intent, it can:
// 1. Parse the intent and mentioned users
// 2. Call the session manager directly
// 3. Respond to the user with confirmation

// Add to Ace's system prompt:
const SESSION_INSTRUCTIONS = `If the member asks you to start a lock-in or schedule a session, you can do that. Parse their intent:
- "start a lockin" or "let's lock in" -> create instant session
- "schedule a session for tomorrow at 2pm" -> create scheduled session
- "invite @name" -> add participants
Respond naturally and confirm the action was taken.`;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| discord.js v13 threads | v14 `message.startThread()` with ThreadAutoArchiveDuration enum | v14 (2022) | Simpler API, enum-based duration |
| Prisma manual cascade | `onDelete: Cascade` in schema relations | Prisma 3+ | Automatic cascade on delete -- no manual queries |
| Manual permission bit flags | `PermissionFlagsBits` PascalCase enum | discord.js v14 | Type-safe, auto-complete friendly |

**Deprecated/outdated:**
- `message.startThread()` with numeric `autoArchiveDuration` -- use `ThreadAutoArchiveDuration` enum instead
- `Permissions.FLAGS.XXXX` (v13) -- use `PermissionFlagsBits.Xxxx` (v14)
- `MessageFlags.EPHEMERAL` bitfield -- import from discord.js directly (already used in codebase)

## Discretion Recommendations

### XP for Resource Sharing
**Recommendation:** Award 15 XP per resource share with a 4-hour cooldown per member (same pattern as wins/lessons but slightly lower to reflect passive contribution vs. active achievement). Add `RESOURCE_SHARE` to XPSource enum.
**Rationale:** 15 XP is meaningful enough to encourage sharing but not so high it becomes gameable. The 4-hour cooldown prevents spam. Lower than wins (30) and lessons (35) because sharing a link is lower effort than writing about personal experiences.

### Resource Auto-Tagging Implementation
**Recommendation:** AI extraction from message content (not link content). Extract tags from the post text, any URLs mentioned, and the channel it was posted in. Do NOT fetch external URLs (slow, unreliable, rate-limited). Use the same OpenRouter structured output pattern as profile/ai-tags.ts.
**Rationale:** Members will describe what they're sharing in their post text. Fetching external URLs adds latency, failure modes, and API complexity. Tag extraction from text is fast and reliable.

### Trust Signal Approach
**Recommendation:** None (no footer, no periodic reminder). Trust is established through actions, not words. The recovery key delivery during onboarding (already done in Phase 1) is the main trust signal. Adding footers or reminders would feel corporate and undermine the casual server vibe.
**Rationale:** The target audience is friends, not customers. Over-communicating privacy features feels paranoid. If members want to see what's stored, /mydata exists. The very existence of /deletedata with hard delete IS the trust signal.

### Session Voice Channel Naming Convention
**Recommendation:** `lockin-{creator-username}` for instant sessions, `lockin-{short-title}` for scheduled sessions. Examples: `lockin-assane`, `lockin-morning-grind`. Limit to 20 characters to keep the channel list clean.
**Rationale:** Creator username gives instant identity for "who started this." For scheduled sessions, the title provides context on what's being worked on.

### Bot Inference for Session Work Topic
**Recommendation:** When member doesn't specify, query their active goals and use the most recently updated one's title. If no active goals, use their `currentFocus` from profile. If neither exists, leave it as "General lock-in."
**Rationale:** Active goals are the most likely thing someone is working on. This mirrors how the morning brief already uses goal data.

## Open Questions

1. **Session-to-Voice-Tracker Coordination**
   - What we know: Voice tracker awards XP for time in VOICE category channels. Sessions will create channels in the same category.
   - What's unclear: Should session XP be additive to voice XP, or should sessions suppress voice tracker XP for their duration?
   - Recommendation: Let voice tracker handle all time-based XP. Session module awards no separate time-based XP -- only optional small bonus for hosting (e.g., 10 XP for creating a session with 2+ participants). This avoids double-counting entirely.

2. **Scheduled Session Persistence Across Restarts**
   - What we know: Scheduled sessions need to survive bot restarts.
   - What's unclear: Should scheduled sessions be managed by the existing SchedulerManager or a separate cron system?
   - Recommendation: Store scheduled sessions in the database with `scheduledFor` timestamp. On bot ready, query upcoming sessions and create cron tasks. This is a simpler approach than integrating with the per-member SchedulerManager.

3. **Resource Channel Creation Timing**
   - What we know: The RESOURCES category exists with a single `resources` channel. Phase 5 needs 3 channels.
   - What's unclear: Should server-setup create these on startup, or should the resources module create them lazily?
   - Recommendation: Add the three resource channels to the server-setup channel definitions (CATEGORIES array). This is consistent with how all other channels are created.

## Sources

### Primary (HIGH confidence)
- **Existing codebase** -- All code patterns verified by reading source files directly
  - `src/modules/wins-lessons/handler.ts` -- message detection + reaction + XP pattern
  - `src/modules/voice-tracker/tracker.ts` -- in-memory session tracking + DB persistence
  - `src/modules/onboarding/channel-setup.ts` -- voice channel creation with permission overwrites
  - `src/modules/ai-assistant/commands.ts` -- file attachment export pattern (/wipe-history)
  - `src/db/encryption.ts` -- encryption extension ENCRYPTED_FIELDS map
  - `src/modules/profile/ai-tags.ts` -- OpenRouter structured output for tag extraction
  - `prisma/schema.prisma` -- all relations use `onDelete: Cascade`
- **Discord.js Threads Guide** -- [https://discordjs.guide/popular-topics/threads.html](https://discordjs.guide/popular-topics/threads.html) -- `message.startThread()` API
- **Discord.js Permissions Guide** -- [https://discordjs.guide/legacy/popular-topics/permissions-extended](https://discordjs.guide/legacy/popular-topics/permissions-extended) -- `PermissionFlagsBits` usage

### Secondary (MEDIUM confidence)
- **Discord.js Voice Channel Creation** -- [https://www.theyurig.com/blog/how-create-voice-channels-discord-v14](https://www.theyurig.com/blog/how-create-voice-channels-discord-v14) -- voice channel creation patterns verified against codebase
- **Prisma Cascade Deletes** -- [https://www.prisma.io/docs/orm/prisma-schema/data-model/relations/referential-actions](https://www.prisma.io/docs/orm/prisma-schema/data-model/relations/referential-actions) -- `onDelete: Cascade` behavior

### Tertiary (LOW confidence)
- None -- all findings verified against codebase or official documentation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in project, no new dependencies needed
- Architecture: HIGH -- all patterns directly replicate existing codebase patterns (wins-lessons, voice-tracker, channel-setup, ai-tags)
- Pitfalls: HIGH -- identified from direct codebase analysis (double XP from voice tracker, cascade delete behavior, encryption extension registration)
- Discretion recommendations: MEDIUM -- based on codebase patterns and project philosophy, but these are subjective decisions

**Research date:** 2026-03-20
**Valid until:** 2026-04-20 (stable -- all dependencies already locked in project)
