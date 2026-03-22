# Phase 1: Foundation and Identity - Research

**Researched:** 2026-03-20
**Domain:** Discord bot framework, server structure, member profiles with AI-powered setup, multi-account identity, per-member encryption, VPS deployment
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Onboarding Flow:**
- New member lands in #welcome (only visible channel) -- everything else is locked
- #welcome contains: short hustler manifesto (not cringe) + quick overview of how the server works + CTA to run `/setup`
- `/setup` triggers a smooth interactive flow or modal form (Claude's discretion on which works better)
- After setup completes, all server channels unlock -- feels like "unlocking" the server
- Channels are gated via Discord roles -- bot assigns a "Member" role on setup completion

**Profile Design:**
- Bot asks natural guided questions during setup to map the member comprehensively (interests, current situation, goals, what they want to learn)
- AI (via OpenRouter) processes answers behind the scenes -- extracts structured tags and categories from natural language responses
- Both raw answers (for AI context in conversations) and structured tags (for leaderboards/feeds/matching) are stored
- Members update their profile two ways: `/profile` command for structured edits, or naturally through AI conversation in their private space ("I'm pivoting to content creation")
- Partial profile visibility -- members control which parts are public vs private. Other members can view public parts via `/profile @user`

**Account Linking:**
- Code-based verification: run `/link` on account A -> get a time-limited code -> run `/verify [code]` on account B within 5 minutes
- Seamless identity -- all linked accounts treated exactly the same. Same name on leaderboards, same XP, no primary/secondary distinction
- Cap at 3-5 linked accounts per member (Claude decides exact number)
- Self-service unlinking via `/unlink` -- member can remove any linked account themselves

**Server Layout:**
- Minimal/clean with hub elements -- few channels by default, relevant ones surface based on member's interests
- Voice channels: 1-2 permanent always-on rooms (for spontaneous co-working) + on-demand channels created for scheduled sessions
- Role system: hustler-themed rank names (Grinder -> Hustler -> Boss -> Mogul, etc.) + AI-managed interest tags
- Interest tags are dynamically created/normalized by the AI -- "video editing" and "editing" merge into one. Roles with 0 members are auto-cleaned up

**Per-Member Encryption:**
- Private data encrypted at rest with per-member keys
- Member receives a personal recovery key via DM during setup
- Raw database access reveals only encrypted blobs
- Bot process can decrypt at runtime (necessary for features) but direct DB access cannot

### Claude's Discretion
- Exact setup flow implementation (modal form vs sequential prompts -- pick what works best in Discord)
- Exact profile setup questions (as long as they map the member comprehensively)
- Specific channel names and category organization
- Rank name progression and XP thresholds
- Account link cap (3 or 5)
- Recovery key format and delivery UX
- Encryption implementation details

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FNDN-01 | Bot framework deployed on member's VPS with reliable uptime and auto-deploy via git push | VPS deployment section: bare git repo + post-receive hook + PM2 process manager |
| FNDN-02 | Discord server structure -- channel categories, roles, permissions, and onboarding flow for new members | Architecture patterns: permission overwrites, role hierarchy, channel gating via "Member" role |
| FNDN-03 | Member profiles -- fluid/customizable interests and focus areas, not rigid lanes | Profile design: sequential DM flow with AI tag extraction via OpenRouter structured outputs |
| FNDN-04 | Per-member private space -- member chooses DM or private server channel for personal tracking and AI interaction | Architecture: private channel creation with permission overwrites, DM channel fallback |
| FNDN-05 | Multi-account identity system -- link multiple Discord accounts to one member profile | Account linking: code-based verification with time-limited codes, identity table design |
| TRUST-04 | Per-member data encryption -- private data encrypted with per-member keys at rest | Encryption section: custom Prisma 7 query extension with AES-256-GCM, per-member key derivation |
</phase_requirements>

## Summary

Phase 1 establishes the entire technical foundation: a Discord bot deployed on a VPS with auto-deploy, a server structure that gates content behind an onboarding flow, AI-powered member profiles, multi-account identity linking, per-member private spaces, and per-member encryption at rest. This is the most architecturally significant phase because every future phase builds on these patterns.

The core stack is discord.js 14.25.x on Node.js 22 LTS with TypeScript, PostgreSQL via Prisma 7, and OpenRouter for AI-powered profile tag extraction. The bot follows a modular monolith architecture where each feature domain is an isolated module that registers its own commands, events, and scheduled tasks against a shared bot core. Deployment uses a bare git repository on the VPS with a post-receive hook that checks out code, installs dependencies, runs migrations, and restarts via PM2.

The most technically nuanced piece is per-member encryption. Since `prisma-field-encryption` does NOT support Prisma 7 (it caps at Prisma 6.13.0), encryption must be built as a custom Prisma client extension using the `$extends` query component. This is straightforward: intercept write operations to encrypt marked fields with AES-256-GCM using a per-member derived key, and intercept reads to decrypt. The master encryption key lives in environment variables; per-member keys are derived using HKDF with the member's unique salt. Members receive a recovery key (base64-encoded derived key) via DM during setup.

**Primary recommendation:** Build the bot core (client, module loader, command router) and database schema first, then layer on onboarding, profiles, account linking, private spaces, and encryption as separate modules. Use sequential DM prompts (not modals) for the profile setup flow -- modals are limited to 5 text inputs and cannot convey the conversational "talking to a person" feel the user wants.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| discord.js | 14.25.1 | Discord API wrapper | Dominant Node.js Discord library, 2M+ weekly npm downloads, v14 is stable production branch |
| Node.js | 22.x LTS | Runtime | Required by discord.js 14.25.x (minimum 22.12.0). LTS until April 2027 |
| TypeScript | 5.7+ | Language | Type safety across bot codebase. Catches Discord API misuse at compile time |
| PostgreSQL | 16+ | Primary database | Relational integrity for member data, profiles, linked accounts. Handles concurrent writes from bot commands |
| Prisma | 7.x | ORM/Database access | Full TypeScript type safety, auto-generated client, declarative migrations. Pure TypeScript engine (no Rust binary), 3.4x faster queries |
| @openrouter/sdk | 0.9.x | AI model access | OpenRouter SDK for structured output extraction from natural language profile answers. Access to 300+ models |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | 3.x | Runtime validation | Validate slash command inputs, AI structured outputs, profile data before DB writes |
| winston | 3.x | Structured logging | Production logging with levels, file rotation, JSON output. Essential for solo-maintained VPS bot |
| date-fns | 4.x | Date manipulation | Timezone handling for per-member features, code expiry calculations |
| dotenv | 16.x | Environment variables | Local development env var loading. VPS uses real environment variables |
| pm2 | 5.x | Process manager | Keep bot alive on VPS, auto-restart on crash, log management |

### Development Tools
| Tool | Version | Purpose |
|------|---------|---------|
| tsx | latest | Run TypeScript directly in development (`tsx watch src/index.ts`) |
| tsup | latest | Production build (esbuild-based bundler) |
| vitest | latest | Testing command handlers, encryption logic, profile parsing |
| ESLint + @typescript-eslint | latest | Lint discord.js anti-patterns |
| Prettier | latest | Consistent formatting |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @openrouter/sdk | OpenAI SDK with baseUrl override | OpenRouter is OpenAI-compatible, so OpenAI SDK works too. But @openrouter/sdk has native structured output support and model routing. Use the dedicated SDK. |
| PM2 | systemd | systemd is lighter but PM2 provides log management, cluster mode, and ecosystem file for Node.js specifically. Better for solo maintainer. |
| Sequential DM prompts | Modal forms | Modals limited to 5 text inputs, feel like filling a form. DM prompts allow unlimited questions, natural conversation flow, and AI can adapt follow-up questions. Use DM prompts. |
| Custom Prisma extension for encryption | prisma-field-encryption | prisma-field-encryption does NOT support Prisma 7. Must build custom extension. |

**Installation:**
```bash
# Core
npm install discord.js @openrouter/sdk @prisma/client zod winston date-fns dotenv

# Dev dependencies
npm install -D typescript tsx tsup prisma vitest @types/node eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser prettier

# VPS process manager (install globally on server)
npm install -g pm2
```

```bash
# Initialize Prisma with PostgreSQL
npx prisma init --datasource-provider postgresql

# After schema changes
npx prisma generate
npx prisma migrate dev
```

## Architecture Patterns

### Recommended Project Structure
```
discord-hustler/
  src/
    index.ts                  # Entry: create client, load modules, connect
    core/
      client.ts               # Discord.js client setup, intents, partials
      commands.ts              # Slash command registry + interaction router
      events.ts                # Event dispatcher / bus
      scheduler.ts             # Cron job manager (node-cron)
      module-loader.ts         # Auto-discover and init modules from /modules/
      config.ts                # Typed config from environment variables
    modules/
      onboarding/
        index.ts               # Module registration
        commands.ts            # /setup command
        setup-flow.ts          # Sequential DM conversation flow
        channel-setup.ts       # Private channel creation, role assignment
        welcome.ts             # Welcome message content
      profile/
        index.ts               # Module registration
        commands.ts            # /profile command (view/edit)
        ai-tags.ts             # OpenRouter integration for tag extraction
        visibility.ts          # Public/private profile field control
      identity/
        index.ts               # Module registration
        commands.ts            # /link, /verify, /unlink commands
        linking.ts             # Code generation, verification, account linking
      server-setup/
        index.ts               # Module registration
        channels.ts            # Category/channel creation
        roles.ts               # Role hierarchy creation
        permissions.ts         # Permission overwrite management
        interest-tags.ts       # AI-managed interest role creation/cleanup
    db/
      schema.prisma            # Prisma schema (all tables)
      client.ts                # PrismaClient singleton with encryption extension
      encryption.ts            # Custom encryption extension for Prisma 7
      seed.ts                  # Seed data (default roles, channels)
    shared/
      constants.ts             # All configurable values (rank thresholds, limits)
      embeds.ts                # Shared embed/component builders
      crypto.ts                # AES-256-GCM encrypt/decrypt, key derivation
      permissions.ts           # Permission check helpers
      types.ts                 # Shared TypeScript types
    deploy-commands.ts         # Standalone script to register slash commands
  prisma/
    migrations/                # Generated migration files
  ecosystem.config.cjs         # PM2 configuration
  tsconfig.json
  package.json
  .env                         # Local development secrets
  .env.example                 # Template for required env vars
  .gitignore                   # MUST include .env
```

### Pattern 1: Module Registration Pattern
**What:** Each feature module exports a standard interface that the core loader calls during startup. The module registers its slash commands, event listeners, and cron jobs.
**When to use:** Every feature module follows this pattern.

```typescript
// src/core/module-loader.ts
import type { Client } from 'discord.js';
import type { PrismaClient } from '@prisma/client';

export interface ModuleContext {
  client: Client;
  db: PrismaClient;
  commands: Map<string, CommandHandler>;
  events: EventEmitter;
}

export interface Module {
  name: string;
  register(ctx: ModuleContext): void | Promise<void>;
}

// src/modules/onboarding/index.ts
import type { Module } from '../../core/module-loader';
import { setupCommand } from './commands';

export const onboardingModule: Module = {
  name: 'onboarding',
  register(ctx) {
    ctx.commands.set('setup', setupCommand);
    ctx.client.on('guildMemberAdd', (member) => handleNewMember(ctx, member));
  },
};
```

### Pattern 2: Sequential DM Setup Flow (Recommendation)
**What:** The `/setup` command triggers a sequential conversation in the member's DMs using `awaitMessages()` collectors. The bot asks questions one at a time, each response triggers the next question. After all answers are collected, AI processes them via OpenRouter to extract structured tags.
**When to use:** For the profile setup flow. This is the recommended approach over modals.
**Why not modals:** Discord modals are limited to 5 TextInput fields maximum (hard limit, no workaround). The profile setup needs to ask about interests, current situation, goals, what they want to learn, and more. Modals also feel like "filling out a form" which contradicts the user's requirement that setup should "feel like talking to a person."

```typescript
// src/modules/onboarding/setup-flow.ts
async function runSetupFlow(member: GuildMember): Promise<ProfileAnswers> {
  const dmChannel = await member.createDM();
  const answers: ProfileAnswers = {};

  const questions = [
    { key: 'situation', prompt: "What's your current hustle? What are you working on right now?" },
    { key: 'interests', prompt: "What areas are you most into? (coding, content, ecom, freelancing, etc.)" },
    { key: 'goals', prompt: "What's the main thing you're trying to achieve in the next 3 months?" },
    { key: 'learn', prompt: "What do you want to learn or get better at?" },
    { key: 'style', prompt: "How do you like to work? (solo grinder, needs accountability, loves competition, etc.)" },
  ];

  for (const q of questions) {
    await dmChannel.send(q.prompt);
    const collected = await dmChannel.awaitMessages({
      filter: (m) => m.author.id === member.id,
      max: 1,
      time: 300_000, // 5 minute timeout per question
      errors: ['time'],
    });
    answers[q.key] = collected.first()!.content;
  }

  return answers;
}
```

### Pattern 3: Per-Member Private Channel Creation
**What:** Each member gets a dedicated private text channel visible only to them and the bot.
**When to use:** When member chooses "private channel" as their private space during setup.

```typescript
// src/modules/onboarding/channel-setup.ts
import { ChannelType, PermissionFlagsBits, type Guild, type GuildMember } from 'discord.js';

async function createPrivateChannel(guild: Guild, member: GuildMember): Promise<TextChannel> {
  const category = guild.channels.cache.find(
    c => c.name === 'Private Spaces' && c.type === ChannelType.GuildCategory
  );

  return guild.channels.create({
    name: `space-${member.user.username}`,
    type: ChannelType.GuildText,
    parent: category?.id,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      { id: guild.members.me!.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
    ],
  });
}
```

### Pattern 4: Code-Based Account Linking
**What:** Member runs `/link` on Account A, bot generates a 6-character alphanumeric code stored in DB with 5-minute TTL. Member runs `/verify CODE` on Account B. Bot validates code, links accounts under one identity.
**When to use:** For the multi-account identity system.

```typescript
// src/modules/identity/linking.ts
import crypto from 'node:crypto';

function generateLinkCode(): string {
  return crypto.randomBytes(3).toString('hex').toUpperCase(); // e.g., "A3F2B1"
}

// Store in DB: { code, requester_discord_id, expires_at: now + 5min, used: false }
// On /verify: lookup code, check not expired, check not used, link accounts
```

### Pattern 5: Custom Prisma 7 Encryption Extension
**What:** Since prisma-field-encryption does NOT support Prisma 7, build a custom Prisma client extension using `$extends` query component that intercepts reads/writes on encrypted fields.
**When to use:** For all private member data (profile answers, AI conversations, personal notes).

```typescript
// src/db/encryption.ts
import { PrismaClient } from '@prisma/client';
import { encrypt, decrypt } from '../shared/crypto';

// Fields that should be encrypted, keyed by model name
const ENCRYPTED_FIELDS: Record<string, string[]> = {
  MemberProfile: ['rawAnswers', 'privateNotes'],
  AIConversation: ['content'],
};

export function withEncryption(prisma: PrismaClient) {
  return prisma.$extends({
    query: {
      $allOperations({ model, operation, args, query }) {
        if (!model || !ENCRYPTED_FIELDS[model]) return query(args);

        const fields = ENCRYPTED_FIELDS[model];

        // Encrypt on writes
        if (args.data && ['create', 'update', 'upsert'].some(op => operation.includes(op))) {
          for (const field of fields) {
            if (args.data[field]) {
              const memberId = args.data.memberId ?? args.where?.memberId;
              args.data[field] = encrypt(args.data[field], memberId);
            }
          }
        }

        // Execute query, then decrypt results
        return query(args).then((result) => {
          if (result && typeof result === 'object') {
            decryptFields(result, fields);
          }
          return result;
        });
      },
    },
  });
}
```

### Anti-Patterns to Avoid
- **Storing bot token in source code:** Use .env file, add .env to .gitignore. If token is ever committed, regenerate immediately in Discord Developer Portal.
- **Giving bot Administrator permission:** Grant only specific permissions needed (Manage Channels, Manage Roles, Send Messages, View Channels, etc.). Administrator = full server control on any vulnerability.
- **Using modals for comprehensive profile setup:** Limited to 5 inputs, feels like a form. Use sequential DM conversation instead.
- **Storing encryption keys in the database:** Master key must be in environment variables only. Per-member derived keys are computed at runtime, never stored.
- **Creating all channels at startup:** Create channels lazily as members onboard. Avoid overwhelming the server with 20+ empty channels on day one.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Discord API interactions | Raw WebSocket/REST client | discord.js 14.25.x | Rate limiting, reconnection, caching, type safety all handled |
| Database migrations | Raw SQL migration scripts | Prisma Migrate | Type-safe schema evolution, rollback, migration history |
| AI structured output parsing | Regex/manual JSON parsing | OpenRouter structured outputs (`response_format: json_schema`) | Handles malformed responses, validates against schema, fixes common issues |
| Process management on VPS | Custom restart scripts | PM2 | Auto-restart, log rotation, startup scripts, cluster mode, monitoring |
| Slash command registration | Manual REST API calls | discord.js REST + Routes helpers | Handles rate limits, deduplication, proper error handling |
| Input validation | Manual if/else chains | zod schemas | Composable, type-inferred, descriptive error messages |

**Key insight:** This phase has a lot of infrastructure (deployment, encryption, AI integration, Discord permissions). Each area has well-established tools that handle edge cases you won't anticipate. The risk is not in the individual pieces but in how they compose -- focus engineering effort on the integration layer, not on reimplementing solved problems.

## Common Pitfalls

### Pitfall 1: Discord Modal 5-Input Limit
**What goes wrong:** Developers try to use a modal for profile setup, hit the 5 TextInput limit, then either compromise on the number of questions or chain multiple modals in a confusing way.
**Why it happens:** Modals seem like the obvious choice for "collecting info from users." Discord hard-limits modals to 5 ActionRows with 1 TextInput each. This will never increase (confirmed by Discord API team).
**How to avoid:** Use sequential DM conversation with `awaitMessages()` collectors. No input limit, feels like talking to a person, AI can adapt follow-up questions based on previous answers.
**Warning signs:** Trying to fit comprehensive profile questions into 5 fields, or chaining 3+ modals together.

### Pitfall 2: prisma-field-encryption Incompatible with Prisma 7
**What goes wrong:** Developer installs prisma-field-encryption assuming it works with the latest Prisma, then gets runtime errors or type mismatches.
**Why it happens:** prisma-field-encryption supports Prisma 4.7.0 through 6.13.0 only. Prisma 7 removed middleware support (which the extension relied on in older versions) and changed the client extension API.
**How to avoid:** Build a custom Prisma client extension using `$extends` with the query component. The pattern is straightforward (intercept writes to encrypt, intercept reads to decrypt). See the encryption extension pattern above.
**Warning signs:** Import errors, type mismatches, or "middleware is not a function" errors after installing prisma-field-encryption with Prisma 7.

### Pitfall 3: Interaction Response Timeout (3 Seconds)
**What goes wrong:** `/setup` command calls OpenRouter AI before responding to the interaction. OpenRouter takes 2-8 seconds. Discord kills the interaction after 3 seconds with "This interaction failed."
**Why it happens:** Discord requires an initial response to slash command interactions within 3 seconds. AI API calls, database operations, and channel creation all take longer.
**How to avoid:** Always `await interaction.deferReply()` immediately for any command that does async work. Then use `interaction.editReply()` when the work is done. For the setup flow, defer the reply, send a DM to start the conversation, and edit the original reply to say "Check your DMs!"
**Warning signs:** "This interaction failed" errors, especially on AI-related commands.

### Pitfall 4: Missing DM Permissions / Closed DMs
**What goes wrong:** Bot tries to DM a member for setup but the member has DMs disabled for the server. The DM silently fails or throws an unhandled error.
**Why it happens:** Discord allows users to disable DMs from server members. Many users have this enabled by default.
**How to avoid:** Wrap `member.createDM()` and `dmChannel.send()` in try-catch. If DMs fail, fall back to an ephemeral reply in the server channel explaining how to enable DMs, or offer an alternative flow (modal-based abbreviated version).
**Warning signs:** Setup flow "works in testing" but fails for real members who haven't enabled DMs.

### Pitfall 5: Encryption Key Loss = Permanent Data Loss
**What goes wrong:** Master encryption key is lost (env var accidentally removed, server rebuild without backup). All encrypted member data becomes permanently unrecoverable.
**Why it happens:** Per-member keys are derived from the master key. No master key = no derived keys = no decryption.
**How to avoid:** (1) Document the master key backup procedure. (2) Store a copy of the master key outside the VPS (e.g., password manager). (3) The recovery key given to members IS their derived key -- it allows them to decrypt their own data independently even if the bot is gone. (4) Consider a key escrow pattern where the master key is split across 2-3 trusted locations.
**Warning signs:** No documented backup procedure for the master encryption key.

### Pitfall 6: Channels/Roles Not Created in Correct Order
**What goes wrong:** Bot tries to create channels with permission overwrites referencing roles that don't exist yet. Or tries to assign a role that hasn't been created.
**Why it happens:** Discord API calls are async. If channel creation and role creation run in parallel, role IDs may not be available when channels reference them.
**How to avoid:** Create roles first, await their creation, then create channels with permission overwrites referencing those role IDs. Use a deterministic setup order: roles -> categories -> channels -> permission overwrites.
**Warning signs:** "Unknown Role" errors, channels without proper permissions.

### Pitfall 7: OpenRouter SDK is ESM-Only
**What goes wrong:** Developer tries to `require('@openrouter/sdk')` in a CommonJS file and gets an ERR_REQUIRE_ESM error.
**Why it happens:** @openrouter/sdk is published as ESM only.
**How to avoid:** Ensure your project uses ESM (`"type": "module"` in package.json, or `.mts` file extensions). With TypeScript and tsup, this should be the default configuration. If you must use CJS, use `await import('@openrouter/sdk')`.
**Warning signs:** ERR_REQUIRE_ESM errors at startup.

### Pitfall 8: Account Linking Race Conditions
**What goes wrong:** Two people try to verify with the same code simultaneously, or the same code is used twice.
**Why it happens:** Code verification check and code consumption are not atomic.
**How to avoid:** Use a database transaction for the verify operation: within a single transaction, check code validity, mark it as used, and create the account link. Use `prisma.$transaction()` for atomic operations.
**Warning signs:** Duplicate account links, codes being used more than once.

## Code Examples

Verified patterns from official sources:

### Discord.js Client Setup with Required Intents
```typescript
// Source: discord.js docs - GatewayIntentBits
import { Client, GatewayIntentBits, Partials } from 'discord.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,              // Guild/channel events
    GatewayIntentBits.GuildMembers,        // Member join/leave (PRIVILEGED)
    GatewayIntentBits.GuildMessages,       // Message events in guilds
    GatewayIntentBits.DirectMessages,      // DM events (for setup flow)
    GatewayIntentBits.MessageContent,      // Read message content (PRIVILEGED)
  ],
  partials: [
    Partials.Channel,                      // Required for DM events
    Partials.Message,                      // Required for uncached messages
  ],
});
```

### Slash Command Registration Script
```typescript
// Source: discord.js guide - Command Deployment
import { REST, Routes } from 'discord.js';

const commands = [
  new SlashCommandBuilder().setName('setup').setDescription('Set up your profile and unlock the server'),
  new SlashCommandBuilder().setName('profile').setDescription('View or edit your profile'),
  new SlashCommandBuilder().setName('link').setDescription('Generate a code to link another Discord account'),
  new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Verify an account link code')
    .addStringOption(opt => opt.setName('code').setDescription('The 6-character link code').setRequired(true)),
  new SlashCommandBuilder().setName('unlink').setDescription('Unlink a Discord account from your identity'),
];

const rest = new REST().setToken(process.env.BOT_TOKEN!);
// Guild-specific for development (instant update)
await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands.map(c => c.toJSON()) });
// Global for production (up to 1 hour cache)
await rest.put(Routes.applicationCommands(clientId), { body: commands.map(c => c.toJSON()) });
```

### AES-256-GCM Per-Member Encryption
```typescript
// Source: Node.js crypto docs + verified pattern
import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;      // 96 bits recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 16;

// Derive a per-member key from master key using HKDF
export function deriveMemberKey(masterKey: Buffer, memberId: string): Buffer {
  return crypto.hkdfSync('sha256', masterKey, memberId, 'discord-hustler-member-key', 32);
}

export function encrypt(plaintext: string, memberKey: Buffer): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, memberKey, iv);
  let encrypted = cipher.update(plaintext, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Pack: iv + authTag + ciphertext as base64
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decrypt(packed: string, memberKey: Buffer): string {
  const buffer = Buffer.from(packed, 'base64');
  const iv = buffer.subarray(0, IV_LENGTH);
  const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, memberKey, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString('utf8');
}

// Recovery key = base64-encoded per-member key (given to member via DM)
export function generateRecoveryKey(memberKey: Buffer): string {
  return memberKey.toString('base64url'); // URL-safe base64
}
```

### OpenRouter Structured Output for Tag Extraction
```typescript
// Source: OpenRouter docs - Structured Outputs
import { OpenRouter } from '@openrouter/sdk';

const openrouter = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!,
});

interface ProfileTags {
  interests: string[];
  currentFocus: string;
  goals: string[];
  learningAreas: string[];
  workStyle: string;
}

async function extractProfileTags(rawAnswers: Record<string, string>): Promise<ProfileTags> {
  const completion = await openrouter.chat.send({
    model: 'anthropic/claude-sonnet-4-20250514',
    messages: [
      {
        role: 'system',
        content: `You extract structured profile tags from natural language answers.
Normalize similar concepts (e.g., "video editing" and "editing videos" -> "video editing").
Keep tags concise (1-3 words each). Return valid JSON matching the schema.`,
      },
      {
        role: 'user',
        content: `Extract tags from these profile answers:\n${JSON.stringify(rawAnswers, null, 2)}`,
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'profile_tags',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            interests: { type: 'array', items: { type: 'string' } },
            currentFocus: { type: 'string' },
            goals: { type: 'array', items: { type: 'string' } },
            learningAreas: { type: 'array', items: { type: 'string' } },
            workStyle: { type: 'string' },
          },
          required: ['interests', 'currentFocus', 'goals', 'learningAreas', 'workStyle'],
          additionalProperties: false,
        },
      },
    },
    stream: false,
  });

  return JSON.parse(completion.choices[0].message.content!) as ProfileTags;
}
```

### VPS Post-Receive Hook for Auto-Deploy
```bash
#!/bin/bash
# /var/repo/discord-hustler.git/hooks/post-receive
TARGET="/var/www/discord-hustler"
GIT_DIR="/var/repo/discord-hustler.git"
BRANCH="main"

while read oldrev newrev ref
do
  if [ "$ref" = "refs/heads/$BRANCH" ]; then
    echo "Deploying $BRANCH to production..."
    git --work-tree=$TARGET --git-dir=$GIT_DIR checkout -f $BRANCH

    cd $TARGET
    echo "Installing dependencies..."
    npm ci --production=false

    echo "Building..."
    npm run build

    echo "Running migrations..."
    npx prisma migrate deploy

    echo "Restarting bot..."
    pm2 restart discord-hustler || pm2 start ecosystem.config.cjs

    echo "Deploy complete!"
  fi
done
```

### PM2 Ecosystem Configuration
```javascript
// ecosystem.config.cjs
module.exports = {
  apps: [{
    name: 'discord-hustler',
    script: './dist/index.js',
    env: {
      NODE_ENV: 'production',
    },
    max_restarts: 10,
    restart_delay: 5000,
    watch: false,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }],
};
```

## Database Schema Design

### Core Tables for Phase 1
```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// Core identity - one per real person
model Member {
  id            String          @id @default(cuid())
  displayName   String          // Chosen display name
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt

  // Relations
  accounts      DiscordAccount[]
  profile       MemberProfile?
  privateSpace  PrivateSpace?
  encryptionSalt String         // Unique salt for key derivation
  recoveryKeyHash String        // Hash of recovery key (to verify, not to decrypt)
}

// Discord accounts linked to a member identity
model DiscordAccount {
  discordId     String          @id // Discord user snowflake ID
  memberId      String
  linkedAt      DateTime        @default(now())

  member        Member          @relation(fields: [memberId], references: [id], onDelete: Cascade)

  @@index([memberId])
}

// Member profile - stores both raw answers (encrypted) and structured tags
model MemberProfile {
  id            String          @id @default(cuid())
  memberId      String          @unique

  // Encrypted fields (raw natural language answers)
  rawAnswers    String          // Encrypted JSON of { situation, interests, goals, learn, style }

  // Structured tags (NOT encrypted - needed for queries, matching, leaderboards)
  interests     String[]        // AI-extracted interest tags
  currentFocus  String          // Primary focus area
  goals         String[]        // AI-extracted goal tags
  learningAreas String[]        // What they want to learn
  workStyle     String          // How they prefer to work

  // Visibility control
  publicFields  String[]        // Which fields are visible to other members

  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt

  member        Member          @relation(fields: [memberId], references: [id], onDelete: Cascade)
}

// Private space preference per member
model PrivateSpace {
  id            String          @id @default(cuid())
  memberId      String          @unique
  type          SpaceType       // DM or CHANNEL
  channelId     String?         // Discord channel ID if type is CHANNEL

  member        Member          @relation(fields: [memberId], references: [id], onDelete: Cascade)
}

enum SpaceType {
  DM
  CHANNEL
}

// Account linking codes (temporary, TTL-based)
model LinkCode {
  id            String          @id @default(cuid())
  code          String          @unique // 6-char alphanumeric
  requesterId   String          // Discord ID of account requesting link
  expiresAt     DateTime        // Created + 5 minutes
  used          Boolean         @default(false)

  @@index([code, expiresAt])
}

// Interest tag roles managed by AI
model InterestTag {
  id            String          @id @default(cuid())
  name          String          @unique // Normalized tag name
  roleId        String?         // Discord role ID (null if not yet created)
  memberCount   Int             @default(0)
  createdAt     DateTime        @default(now())
  lastUsedAt    DateTime        @default(now())
}
```

### Schema Design Decisions
- **Member vs DiscordAccount separation:** A Member is one real person. DiscordAccount maps Discord snowflake IDs to a Member. This enables multi-account identity where all accounts point to the same Member.
- **Encrypted rawAnswers, unencrypted tags:** Raw natural language answers contain personal detail and must be encrypted. Structured tags (interests, goals) are extracted summaries needed for queries/matching and are stored in cleartext. This is a deliberate tradeoff.
- **publicFields array:** Members control which profile fields are visible. The array stores field names (e.g., `["interests", "currentFocus"]`). Fields not in this array are private.
- **LinkCode with TTL:** Codes expire after 5 minutes. A scheduled cleanup job deletes expired/used codes periodically.
- **InterestTag with memberCount:** Enables the AI-managed cleanup of tags with 0 members. Track count incrementally rather than counting relations.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| discord.js middleware (v13) | Client extensions (`$extends`) in v14 | v14 (2022) | All interceptors use extension pattern |
| Prisma Rust engine | Pure TypeScript engine (Prisma 7) | Jan 2026 | 3.4x faster queries, 90% smaller bundle, no native binary issues |
| Prisma middlewares | Prisma client extensions (`$extends`) | Prisma 4.16+ (deprecated 6.14+) | Middleware removed in Prisma 6.14+. Must use extensions. |
| OpenAI SDK for OpenRouter | @openrouter/sdk native SDK | 2025 | Native structured output support, model routing, no base URL hack |
| Prefix commands (!command) | Slash commands | Discord 2022 | Prefix commands deprecated. Message Content intent increasingly restricted |
| Discord embeds only | Components V2 (containers, sections) | March 2025 | Richer visual layouts for profiles, leaderboards |

**Deprecated/outdated:**
- `prisma-field-encryption`: Does NOT support Prisma 7 (caps at 6.13.0). Build custom extension instead.
- `discord.js v15`: Dev preview, not production-ready. Stick with v14.25.x.
- `Moment.js`: Deprecated, bloated. Use date-fns.

## Open Questions

1. **OpenRouter SDK stability (@openrouter/sdk 0.9.x)**
   - What we know: The SDK is in beta (version 0.9.x). The npm page states "there may be breaking changes between versions without a major version update."
   - What's unclear: Whether the API surface will change before 1.0. Whether structured output support is fully stable.
   - Recommendation: Pin to exact version in package.json (e.g., `"@openrouter/sdk": "0.9.11"`). If stability becomes an issue, fall back to the OpenAI SDK with `baseURL: "https://openrouter.ai/api/v1"` which is a stable, supported compatibility mode.

2. **Account link cap: 3 or 5?**
   - What we know: User said "3-5, Claude decides." Most users have 1-2 accounts. Power users might have 3 (mobile, desktop, alt).
   - What's unclear: Whether 3 is too restrictive for edge cases.
   - Recommendation: Set cap at 5. It is trivial to lower later but awkward to raise (would need to communicate the change). 5 accounts is generous enough that no one will hit it legitimately, and the DB cost of extra rows is negligible.

3. **Private space: DM vs private channel default**
   - What we know: User decided "member's choice." DMs are fully private but limited (no thread support, no rich formatting context). Private channels are more integrated but use a channel slot.
   - What's unclear: What happens when a member who chose DM later wants channel features, or vice versa.
   - Recommendation: Default to private channel (better experience, more features). Offer DM as an opt-in alternative. Allow switching at any time via `/profile` settings. 25 channels out of 500 max = 5% of limit, negligible.

4. **Recovery key UX**
   - What we know: Member receives a recovery key via DM during setup. The key is their per-member derived encryption key.
   - What's unclear: Best format for the recovery key (raw base64 is ugly/confusing for non-technical users).
   - Recommendation: Use base64url encoding (URL-safe, no padding) prefixed with a human-readable marker: `DHKEY-<base64url>`. Wrap in a Discord code block for copy-paste. Include a brief explanation: "Save this key somewhere safe. If the bot is ever lost, this key can decrypt your personal data."

## Sources

### Primary (HIGH confidence)
- [discord.js Official Documentation (14.25.1)](https://discord.js.org/docs) - Client setup, intents, modals, permission overwrites, slash commands
- [discord.js Guide - Modals](https://github.com/discordjs/guide/blob/main/guide/interactions/modals.md) - ModalBuilder, TextInputBuilder, 5 ActionRow limit
- [discord.js Guide - Command Deployment](https://discordjs.guide/creating-your-bot/command-deployment.html) - REST API slash command registration
- [Discord API Discussions #5963](https://github.com/discord/discord-api-docs/discussions/5963) - Confirmed 5-input modal limit will not increase
- [Prisma 7 Announcement](https://www.prisma.io/blog/announcing-prisma-orm-7-0-0) - Pure TypeScript engine, no Rust binary
- [Prisma Client Extensions - Query Component](https://www.prisma.io/docs/orm/prisma-client/client-extensions/query) - $extends query hooks for encryption
- [Node.js Crypto Documentation](https://nodejs.org/api/crypto.html) - AES-256-GCM, HKDF, createCipheriv
- [OpenRouter Documentation - Quickstart](https://openrouter.ai/docs/quickstart) - SDK installation, chat.send API
- [OpenRouter Documentation - Structured Outputs](https://openrouter.ai/docs/guides/features/structured-outputs) - response_format json_schema mode

### Secondary (MEDIUM confidence)
- [prisma-field-encryption GitHub](https://github.com/47ng/prisma-field-encryption) - Confirmed Prisma 4.7.0-6.13.0 support range, NOT Prisma 7
- [DigitalOcean - Auto Deploy with Git VPS](https://www.digitalocean.com/community/tutorials/how-to-set-up-automatic-deployment-with-git-with-a-vps) - Bare repo + post-receive hook pattern
- [GitHub Gist - AES-256-GCM Node.js](https://gist.github.com/rjz/15baffeab434b8125ca4d783f4116d81) - Encrypt/decrypt pattern verified against Node.js docs
- [GitHub Gist - Simple Git Deploy](https://gist.github.com/noelboss/3fe13927025b89757f8fb12e9066f2fa) - Post-receive hook deployment script
- [@openrouter/sdk npm](https://www.npmjs.com/package/@openrouter/sdk) - Version 0.9.11, ESM-only, beta status

### Tertiary (LOW confidence)
- [GitHub Gist - Auto Deploy Discord Bot with systemd + GitHub Actions](https://gist.github.com/HenrySpartGlobal/1e6c782d8f32e0818885e1c717347ed8) - Alternative deploy pattern, Python-focused but concepts transferable

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries verified via official docs/npm, versions confirmed
- Architecture: HIGH - Modular monolith pattern well-established for Discord bots at this scale, Prisma 7 extension API verified
- Pitfalls: HIGH - Discord modal limit confirmed by Discord team, Prisma 7 incompatibility with field-encryption verified, encryption patterns verified against Node.js crypto docs
- Encryption: MEDIUM - Custom Prisma extension pattern is sound but novel (not a pre-built library). Requires careful testing.
- OpenRouter SDK: MEDIUM - Beta (0.9.x), ESM-only. Stable fallback exists (OpenAI SDK compatibility mode).

**Research date:** 2026-03-20
**Valid until:** 2026-04-20 (30 days - stable ecosystem, no major releases expected)
