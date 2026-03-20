# Stack Research

**Domain:** Discord productivity/gamification bots and integrations
**Researched:** 2026-03-20
**Confidence:** HIGH (core stack verified via official docs and npm; supporting libraries verified via multiple sources)

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | 22.x LTS (22.22.x) | Runtime | discord.js 14.25.x requires Node 22.12.0+. Use 22.x LTS for stability and long-term support (EOL April 2027). Node 24.x LTS is available but 22.x has wider ecosystem testing. |
| TypeScript | 5.7+ | Language | Type safety across the entire bot codebase. Catches Discord API misuse at compile time. Every major discord.js template in 2025-2026 uses TypeScript. Not optional for a project this complex. |
| discord.js | 14.25.1 | Discord API wrapper | The dominant Discord library for Node.js with 55% market share among JS Discord frameworks, 2M+ weekly npm downloads. v14 is the stable production branch. Do NOT use v15 (dev preview, breaking changes, not production-ready). |
| PostgreSQL | 16+ | Primary database | Relational integrity for leaderboards, streaks, goals, user data. Supports complex queries (rankings with window functions, streak calculations). Free tier on Railway. SQLite is tempting for small scale but lacks concurrent write support -- a problem when multiple bot commands hit the DB simultaneously. |
| Prisma ORM | 7.x | Database access layer | Full TypeScript type safety, auto-generated client from schema, declarative migrations. Prisma 7 dropped the Rust engine entirely (pure TypeScript now), resulting in 3.4x faster queries and 90% smaller bundle. Best DX for Discord bot development where you want to iterate fast on schema. |

### AI Integration

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| @anthropic-ai/sdk | 0.80.x | Claude API access | Direct SDK for Claude API. Personal AI assistant feature requires conversational AI with strong reasoning. Claude excels at accountability coaching, goal analysis, and personalized feedback. Use claude-sonnet-4-20250514 for the assistant (balances cost, speed, and quality for a 10-25 member server). |
| AI SDK (@ai-sdk/anthropic) | 3.0.x | Unified AI abstraction (optional) | Vercel's AI SDK provides streaming, tool use, and provider switching. Use ONLY if you want provider flexibility (swap Claude for GPT for specific tasks). For a focused Claude integration, the direct SDK is simpler. |

### Infrastructure

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Railway | - | Hosting + Database | Best DX for Discord bot hosting. $5/mo Hobby plan with included PostgreSQL (no separate DB add-on pricing). Git-push deploys, environment variables UI, logs dashboard. A Node.js bot + PostgreSQL runs ~$10-15/mo. For a friend group project with one maintainer, this DX-to-cost ratio is unbeatable. |
| Upstash Redis | - | Caching + rate limiting (Phase 2+) | Serverless Redis with free tier (10K commands/day). Use for caching leaderboard computations, rate limiting AI API calls, and cooldown tracking. Not needed at launch but critical once AI assistant is active (prevent API cost blowouts). |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node-cron | 3.x | Scheduled tasks | Daily check-in reminders, streak resets at midnight, weekly leaderboard summaries. Lightweight, cron-syntax based, no external dependencies. |
| @discordjs/voice | 0.17.x | Voice channel features | Co-working presence detection (who's in voice channels). Only needed for the "locking in together" feature. |
| dotenv | 16.x | Environment variables | Local development. Railway handles env vars in production, but you need dotenv for local dev. |
| zod | 3.x | Runtime validation | Validate user inputs from slash commands, form modals, and AI responses before DB writes. Pairs naturally with TypeScript. |
| winston | 3.x | Structured logging | Production-grade logging with log levels, file rotation, and structured JSON output. Essential for debugging a bot you maintain solo. |
| date-fns | 4.x | Date manipulation | Streak calculations, timezone handling for daily resets, scheduling displays. Lightweight, tree-shakeable, no Moment.js bloat. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| tsx | TypeScript execution | Run TypeScript directly without separate compile step. Use for development (`tsx watch src/index.ts`). |
| tsup | Bundling for production | Fast esbuild-based bundler. Produces clean JS for production deployment. Simpler than configuring raw esbuild or webpack. |
| ESLint + @typescript-eslint | Linting | Catch common discord.js anti-patterns and TypeScript issues. Use flat config (eslint.config.mjs). |
| Prettier | Formatting | Consistent code style. Single maintainer still benefits -- reduces cognitive load when revisiting code months later. |
| vitest | Testing | Fast, TypeScript-native test runner. Use for testing command handlers, leaderboard calculations, streak logic in isolation. |

## Installation

```bash
# Core
npm install discord.js @anthropic-ai/sdk @prisma/client

# Supporting
npm install node-cron zod winston date-fns dotenv

# Dev dependencies
npm install -D typescript tsx tsup prisma vitest @types/node eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser prettier
```

```bash
# Initialize Prisma with PostgreSQL
npx prisma init --datasource-provider postgresql

# Generate client after schema changes
npx prisma generate

# Run migrations
npx prisma migrate dev
```

## Discord API Capabilities Relevant to This Project

### Slash Commands (PRIMARY interaction model)
- Up to 100 global slash commands per application
- Subcommands and subcommand groups for organizing (e.g., `/streak check`, `/streak history`)
- Autocomplete for dynamic options (e.g., lane selection, member lookup)
- Ephemeral responses for private feedback (personal stats, AI assistant replies)

### Components V2 (March 2025 -- USE THIS)
- **Containers**: Visually distinct rounded boxes with accent colors. Perfect for leaderboard cards, daily briefings, streak displays.
- **Sections**: Side-by-side text + accessory (thumbnail or button). Ideal for member profiles with avatar + stats.
- **Media Galleries**: 1-10 images/videos. Use for progress screenshots, content sharing.
- **Separators**: Visual dividers within messages. Clean leaderboard formatting.
- Activated per-message with `IS_COMPONENTS_V2` flag (1 << 15).

### Privileged Intents (REQUIRED)
- **Guild Members**: Required for tracking who joins/leaves, member list access. Enable in Developer Portal.
- **Message Content**: Required ONLY if reading message content (e.g., for AI context in channels). For a server under 75 members, toggle on in Developer Portal without application.
- **Guild Presences**: Needed for online/idle/DND status tracking. Enable if building presence-based features.

### Threads
- Use for AI assistant conversations (create a thread per check-in, keeps channels clean)
- Auto-archive after inactivity (1 hour, 24 hours, 3 days, or 1 week)

### Scheduled Events
- Native Discord feature for co-working sessions, accountability check-ins
- Members get notifications, shows in server sidebar

### Rate Limits
- 50 requests/second global limit (interaction responses are exempt)
- Slash command responses must be sent within 3 seconds (defer for longer operations like AI calls)
- discord.js handles rate limit queuing automatically

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Runtime | Node.js 22 LTS | Bun 1.x | Bun is faster but discord.js compatibility has had historical issues. Node.js is the battle-tested runtime for discord.js with zero compatibility concerns. Not worth the risk for a solo-maintainer project. |
| Discord library | discord.js 14.x | discord.py (Python) | Python is better for pure AI/ML, but this project is a Discord bot with AI features, not an AI project with Discord features. Node.js ecosystem is stronger for Discord bots (larger community, more templates, faster event-driven I/O). |
| Discord library | discord.js 14.x | discord.js 15.x (dev) | v15 is dev preview with breaking changes (ESM-only, new WebSocket internals). Not production-ready. Stick with v14 stable until v15 reaches stable release. |
| ORM | Prisma 7 | Drizzle ORM | Drizzle offers better raw SQL control and lighter weight, but Prisma's schema-first DX, auto-generated client, and comprehensive documentation win for a solo developer who needs to iterate fast. Prisma 7's pure-TypeScript engine closed the performance gap. |
| ORM | Prisma 7 | Raw SQL (pg driver) | Tempting for "simplicity" but quickly becomes unmaintainable. No type safety, manual migration tracking, no generated types. False economy for a project with 10+ tables (users, goals, streaks, leaderboards, check-ins, lanes, challenges, etc.). |
| Database | PostgreSQL | SQLite | SQLite breaks under concurrent writes from multiple bot command handlers. PostgreSQL handles this natively. Railway includes PostgreSQL at no extra cost. SQLite's simplicity advantage vanishes when you need window functions for leaderboard rankings. |
| Database | PostgreSQL | MongoDB | Leaderboard rankings, streak calculations, and accountability data are inherently relational. MongoDB would require denormalization and application-level joins that PostgreSQL handles natively. |
| Hosting | Railway | Fly.io | Fly.io has a better free tier but requires CLI-first workflow, Dockerfile knowledge, and more ops overhead. Railway's git-push deploy and integrated PostgreSQL is better for a solo maintainer who wants to focus on features, not infrastructure. |
| Hosting | Railway | VPS (DigitalOcean, Hetzner) | Cheaper at ~$5/mo but requires manual server management, process managers (pm2), manual PostgreSQL setup, SSL, backups. Not worth the ops burden for a friend group project. |
| AI | Claude (Anthropic) | OpenAI GPT-4o | Both are capable. Claude's conversational style and longer context window make it slightly better for the accountability coach persona. More importantly: Anthropic's SDK is clean, pricing is competitive, and the assistant only serves 10-25 people (cost is negligible either way). |
| Scheduling | node-cron | BullMQ | BullMQ is overkill for this scale. It requires Redis and adds complexity for job persistence. node-cron handles all scheduling needs (daily resets, weekly summaries, check-in reminders) for a 10-25 member server. Add BullMQ only if you need reliable job retry/persistence later. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| discord.js v15 (dev) | Dev preview, breaking changes, not production-ready | discord.js 14.25.x (stable) |
| Prefix commands (!command) | Discord deprecated prefix commands for bots. Message Content intent increasingly restricted. Slash commands are the official path forward. | Slash commands + Components V2 |
| MEE6 / existing bots | Pre-built bots cannot provide custom AI assistants, custom gamification tied to specific lanes, or the deep integration this project needs. They also lock features behind paid tiers. | Custom bot built to the exact spec |
| Moment.js | Deprecated, bloated (300KB+), mutable API leads to bugs | date-fns (tree-shakeable, immutable, ~10KB used) |
| Sequelize | Older ORM with weaker TypeScript support, verbose syntax, poor migration DX compared to Prisma | Prisma 7 |
| TypeORM | Active-Record pattern fights with TypeScript's strengths. Known for silent query bugs and poor migration reliability. | Prisma 7 |
| Express.js (for the bot) | A Discord bot is NOT a web server. No HTTP routes needed. Adding Express adds unnecessary complexity and attack surface. | Only add a web server if you build a dashboard later (and use it as a separate service). |
| JSON file storage | No concurrent access safety, no querying, no migrations, no backups. Works for 5 minutes then becomes a nightmare. | PostgreSQL via Prisma |

## Stack Patterns by Variant

**If AI costs become a concern:**
- Add Upstash Redis for response caching (cache repeated questions)
- Implement per-user daily AI interaction limits (configurable)
- Use Claude Haiku for simple queries, Sonnet for complex coaching
- Model routing: simple lookups (haiku) vs. deep analysis (sonnet)

**If you add a web dashboard later:**
- Add Next.js as a separate service on Railway
- Share the same PostgreSQL database
- Use Discord OAuth2 for authentication (members log in with Discord)
- Keep the bot and dashboard as separate deployable services

**If the group grows beyond 25 members:**
- PostgreSQL handles this with zero changes
- Add connection pooling (Prisma handles this automatically)
- Consider Upstash Redis for leaderboard caching
- No sharding needed until 2,500+ servers (irrelevant for single-server use)

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| discord.js@14.25.x | Node.js >= 22.12.0 | Hard requirement. Will not run on Node 20 or earlier. |
| prisma@7.x | Node.js >= 18.18.0 | Compatible with Node 22.x. Pure TypeScript engine (no Rust binary). |
| @anthropic-ai/sdk@0.80.x | Node.js >= 18.x | Uses native fetch. Compatible with Node 22.x. |
| typescript@5.7.x | All packages listed | Strict mode recommended. Enable `strict: true` in tsconfig. |
| node-cron@3.x | Node.js >= 14.x | Lightweight, no compatibility concerns. |

## Cost Estimate (Monthly)

| Service | Plan | Estimated Cost | Notes |
|---------|------|----------------|-------|
| Railway (Bot + PostgreSQL) | Hobby | $10-15/mo | $5 base + usage. Bot + DB within this range at 10-25 members. |
| Anthropic Claude API | Pay-per-use | $5-20/mo | Sonnet at ~$3/1M input tokens. 25 members with daily check-ins = low volume. Highly variable based on AI usage patterns. |
| Upstash Redis | Free tier | $0/mo | 10K commands/day free. More than enough for caching at this scale. |
| Domain (optional) | - | $0-12/yr | Only needed if adding a web dashboard. |
| **Total** | | **$15-35/mo** | Flexible on Anthropic usage. Can cap with daily limits. |

## Sources

- [discord.js Official Documentation (14.25.1)](https://discord.js.org/docs) -- Verified Node.js 22.12.0+ requirement, package versions, API coverage. HIGH confidence.
- [discord.js GitHub Releases](https://github.com/discordjs/discord.js/releases) -- Verified v14.25.1 as latest stable (Nov 2024). HIGH confidence.
- [discord.js v15 Migration Guide](https://v15.discordjs.guide/additional-info/updating-from-v14) -- Confirmed v15 is dev preview, not production-ready. HIGH confidence.
- [Discord Developer Documentation - Rate Limits](https://discord.com/developers/docs/topics/rate-limits) -- 50 req/s global, interaction exemptions. HIGH confidence.
- [Discord Developer Documentation - Privileged Intents](https://support-dev.discord.com/hc/en-us/articles/6207308062871-What-are-Privileged-Intents) -- Guild Members, Message Content, Presences. HIGH confidence.
- [Discord Components V2](https://docs.discord.com/developers/components/reference) -- Containers, Sections, Media Galleries. March 2025 release. HIGH confidence.
- [Prisma 7 Announcement](https://www.prisma.io/blog/announcing-prisma-orm-7-0-0) -- Rust-free, TypeScript-only engine. HIGH confidence.
- [Prisma vs Drizzle Comparison (MakerKit, 2026)](https://makerkit.dev/blog/tutorials/drizzle-vs-prisma) -- DX vs performance tradeoffs. MEDIUM confidence.
- [@anthropic-ai/sdk on npm](https://www.npmjs.com/package/@anthropic-ai/sdk) -- Version 0.80.0, actively maintained. HIGH confidence.
- [Railway Pricing Documentation](https://docs.railway.com/pricing) -- $5/mo Hobby, usage-based, integrated PostgreSQL. MEDIUM confidence (pricing may change).
- [Railway vs Fly.io Comparison](https://docs.railway.com/platform/compare-to-fly) -- DX comparison, deployment models. MEDIUM confidence.
- [Node.js Release Schedule](https://nodejs.org/en/about/previous-releases) -- v22.x LTS (active), v24.x LTS (current). HIGH confidence.
- [Discord Bot Database Choices 2025](https://friendify.net/blog/discord-bot-database-choices-sqlite-postgres-mongo-2025.html) -- SQLite limitations, PostgreSQL recommendation. MEDIUM confidence.
- [Discord Bot Hosting Comparison 2026](https://clawdhost.net/blog/best-discord-bot-hosting-2026/) -- Railway, Fly.io, VPS comparisons. MEDIUM confidence.

---
*Stack research for: Discord Hustler -- productivity/gamification bot ecosystem*
*Researched: 2026-03-20*
