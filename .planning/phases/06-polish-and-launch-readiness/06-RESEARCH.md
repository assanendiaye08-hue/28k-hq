# Phase 6: Polish and Launch Readiness - Research

**Researched:** 2026-03-20
**Domain:** Auto-content feeds, notification routing, server cleanup, hardening
**Confidence:** HIGH

## Summary

Phase 6 covers four distinct areas: (1) an auto-content feed pipeline that ingests from RSS, YouTube, and Reddit, applies AI quality filtering via DeepSeek V3.2, and posts 2-4 curated items per day into Discord channels; (2) per-notification-type account routing so multi-account members can direct briefs, nudges, session alerts, and level-ups to specific linked accounts; (3) server lane cleanup to replace the hardcoded three-lane "Hustle Zones" (freelancing/ecom/content) with interest-based channels derived from member profiles; and (4) hardening for unattended 7-day operation, including member leave/rejoin handling, silent bot restart recovery, and graceful empty-state handling.

The existing codebase already has strong patterns: the module loader auto-discovers new modules, the event bus decouples features, `deliverToPrivateSpace` handles message delivery, OpenRouter integration is established with DeepSeek V3.2 as primary model, and node-cron handles scheduling. Phase 6 builds on all of these.

**Primary recommendation:** Use `rss-parser` for feed ingestion (RSS + YouTube RSS), Reddit's public `.json` endpoint for subreddit posts, and DeepSeek V3.2 structured output for content classification. Extend the existing delivery system with a per-notification-type routing layer. Perform lane cleanup as a find-and-replace across constants.ts and channels.ts, with a Prisma migration for any new schema needs.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Auto-content feeds**: Full pipeline with curated sources (RSS, YouTube, Reddit) + AI discovers additional sources + AI filters everything for quality/relevance + member voting trains filter over time
- Sources: RSS feeds, YouTube channels, Reddit subreddits, plus any additional sources AI discovers
- AI filtering via DeepSeek V3.2 -- classifies each piece as actionable/valuable vs skip (~$0.01-0.03/day)
- Quality over quantity: must pull ACTIONABLE, value-add content -- not garbage
- Frequency: 2-4 posts per day, spread across the day
- Member reactions train the filter over time (upvote/downvote learning loop)
- **Notification routing**: Per notification type granularity -- member picks which linked account gets briefs, nudges, session invites, level-ups (4-5 categories)
- Default: primary account (first linked) gets everything -- zero config needed for single-account members
- **Server lane cleanup**: Replace three-lane references (freelancing/ecom/content) with interest-based approach from member profiles
- Server structure adapts to what members actually list as interests -- no fixed lanes
- Must update: constants.ts, channel names, embeds, any hardcoded lane references
- **Hardening**: Member leave/rejoin -- offer fresh start option on rejoin
- Bot restarts: silent recovery + admin log in #bot-log channel (owner-only)
- On ready: rebuild schedules, restore voice sessions, check expired goals/seasons
- 7-day stress test: bot runs 7 days without manual intervention

### Claude's Discretion
- Auto-feed channel placement (existing resource channels vs dedicated channel)
- Notification routing UX (command design)
- Channel migration strategy for lane cleanup
- Specific hardening priorities beyond the 7-day unattended goal
- Which external sources AI should discover beyond curated list

### Deferred Ideas (OUT OF SCOPE)
None -- this is the final phase of v1.0. All ideas for v1.1 will be captured during /gsd:new-milestone.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FNDN-06 | Per-notification-type account routing -- members choose which linked account receives briefs, nudges, etc. | Extend MemberSchedule or create NotificationPreferences model; modify deliverToPrivateSpace to accept notification type and route to correct account |
| CONT-02 | Auto-feeds -- bot posts relevant content from RSS/APIs into appropriate channels | Use rss-parser for RSS+YouTube, Reddit .json API, DeepSeek V3.2 structured output for AI filtering, node-cron for scheduling, new FeedSource + FeedPost models |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| rss-parser | ^3.13.0 | Parse RSS and Atom feeds (incl. YouTube) | Most popular Node.js RSS parser, 1M+ weekly downloads, TypeScript types included, works with ESM |
| node-cron | ^4.2.1 | Schedule feed fetches and content posting | Already in project, proven pattern in scheduler module |
| @openrouter/sdk | ^0.9.11 | AI content filtering via DeepSeek V3.2 | Already in project, established pattern for structured output |
| discord.js | ^14.25.1 | Discord API for embeds, reactions, channels | Already in project |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| date-fns | ^4.1.0 | Spread posting times across the day | Already in project |
| zod | ^4.3.6 | Validate feed source configuration | Already in project |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| rss-parser | feedsmith | feedsmith is newer and faster but less battle-tested; rss-parser has more community support |
| Reddit .json endpoint | snoowrap / Reddit OAuth | OAuth gives 10x rate limit but adds complexity for read-only use; .json is sufficient for 2-4 posts/day |
| Dedicated YouTube API | YouTube RSS feeds | YouTube provides RSS at youtube.com/feeds/videos.xml?channel_id=X; no API key needed for basic feed reading |

**Installation:**
```bash
npm install rss-parser
```

Only `rss-parser` is new. Everything else already exists in the project.

## Architecture Patterns

### Recommended Project Structure
```
src/modules/
  auto-feed/              # CONT-02: Auto-content feed system
    index.ts              # Module registration, cron schedules
    sources.ts            # Feed source fetchers (RSS, YouTube RSS, Reddit JSON)
    filter.ts             # AI quality filter (DeepSeek V3.2 structured output)
    poster.ts             # Discord embed builder + channel posting
    feedback.ts           # Reaction tracking for filter training
    constants.ts          # Source configs, timing, thresholds
  notification-router/    # FNDN-06: Per-type notification routing (or extend scheduler)
    index.ts              # Module registration, settings command additions
    router.ts             # Route notification to correct account by type
    constants.ts          # Notification type enum, defaults
  hardening/              # Bot restart recovery, member lifecycle
    index.ts              # Module registration, ready event handlers
    recovery.ts           # Schedule rebuild, voice session restore, stale check
    member-lifecycle.ts   # Leave/rejoin detection and handling
```

### Pattern 1: Feed Ingestion Pipeline
**What:** Three-stage pipeline: Fetch -> Filter -> Post
**When to use:** For every scheduled feed check (runs 4-6 times daily, posts 2-4 items)
**Example:**
```typescript
// Stage 1: Fetch from all sources
interface FeedItem {
  title: string;
  link: string;
  source: string;        // "rss" | "youtube" | "reddit"
  sourceName: string;    // Human-readable source name
  content: string;       // Description/summary
  publishedAt: Date;
  author?: string;
}

// Stage 2: AI Filter (DeepSeek V3.2 structured output)
interface FilterResult {
  keep: boolean;
  relevanceScore: number; // 0-100
  category: string;       // e.g., "tech", "business", "growth"
  reason: string;         // Why kept/skipped
}

// Stage 3: Post to Discord
// Build rich embed with source, title, link, AI-generated summary
// React with upvote/downvote emojis for feedback loop
```

### Pattern 2: Notification Type Routing
**What:** Route different notification types to different linked Discord accounts
**When to use:** Every time the bot delivers a notification (briefs, nudges, session alerts, level-ups)
**Example:**
```typescript
// Notification types
type NotificationType = 'brief' | 'nudge' | 'session_alert' | 'level_up' | 'general';

// Preferences stored per member
interface NotificationPreferences {
  memberId: string;
  // Maps notification type -> discordId of preferred account (null = primary/default)
  brief?: string | null;
  nudge?: string | null;
  sessionAlert?: string | null;
  levelUp?: string | null;
}

// Enhanced delivery function
async function deliverNotification(
  client: Client,
  db: ExtendedPrismaClient,
  memberId: string,
  type: NotificationType,
  content: DeliveryContent,
): Promise<boolean> {
  // 1. Look up notification preferences for this type
  // 2. If preference exists, deliver to that specific account
  // 3. If no preference, fall back to deliverToPrivateSpace (existing behavior)
}
```

### Pattern 3: Member Leave/Rejoin Lifecycle
**What:** Detect member leaving and offer fresh start on rejoin
**When to use:** guildMemberRemove and guildMemberAdd Discord events
**Example:**
```typescript
// On guildMemberRemove: mark member as "left" (soft state, no data deletion)
// On guildMemberAdd: check if discordId exists in DiscordAccount table
//   If yes: "Welcome back! Want to restore your old profile or start fresh?"
//   If no: normal onboarding flow
```

### Pattern 4: Bot Restart Recovery (Enhanced)
**What:** On client ready event, rebuild all transient state from database
**When to use:** Every bot restart
**Example:**
```typescript
// The bot already does schedule rebuild and voice session reconstruction.
// Enhance with:
// 1. Log restart to #bot-log (admin-only channel)
// 2. Check for expired goals that may have been missed during downtime
// 3. Check for expired seasons
// 4. Rebuild any pending scheduled session timers
// 5. Verify auto-feed cron tasks are running
```

### Anti-Patterns to Avoid
- **Fetching feeds too frequently:** RSS/Reddit have rate limits. YouTube RSS has no documented limit but be respectful. Fetch every 2-4 hours, not every minute.
- **Posting everything fetched:** AI filter must be aggressive. Better to post nothing than post garbage. The user explicitly stated quality > quantity.
- **Storing full article content:** Only store title, link, summary, and filter result. No need to cache full article bodies.
- **Blocking on AI filter failures:** If DeepSeek is down, skip the batch. Never post unfiltered content. Log the failure and retry next cycle.
- **Complex notification routing UX:** Keep it simple. Extend /settings with a notification-routing option, not a separate command. Single-account members should never need to touch this.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| RSS/Atom parsing | Custom XML parser | rss-parser | Handles encoding, namespaces, malformed feeds, date parsing |
| YouTube feed | YouTube Data API v3 setup | YouTube RSS (youtube.com/feeds/videos.xml?channel_id=X) | Zero auth, parsed by rss-parser, sufficient for channel monitoring |
| Reddit fetching | OAuth flow + snoowrap | fetch() with `.json` endpoint | Unauthenticated endpoint gives 100 req/10min, plenty for 4-6 daily checks |
| Cron scheduling | setInterval chains | node-cron (already used) | Handles timezone, missed jobs, named tasks |
| AI classification | Keyword matching / regex | DeepSeek V3.2 structured output via OpenRouter | Understands context, handles diverse content, already established pattern |

**Key insight:** The auto-feed system is a read-only aggregator. All the complexity is in AI filtering quality, not in fetching. Fetching is trivial -- use the simplest tool for each source.

## Common Pitfalls

### Pitfall 1: RSS Feed Encoding and Malformation
**What goes wrong:** RSS feeds from smaller sites often have invalid XML, missing dates, relative URLs, or incorrect character encoding.
**Why it happens:** No universal RSS standard enforcement. Feeds vary wildly.
**How to avoid:** Use rss-parser which handles most malformation gracefully. Wrap every feed fetch in try/catch with per-source error isolation. One broken feed should never block others.
**Warning signs:** Feed fetch returns empty items array, or dates parse as NaN.

### Pitfall 2: Reddit Rate Limiting
**What goes wrong:** Reddit's unauthenticated JSON endpoint allows only 100 requests per 10 minutes. Exceeding causes 429 errors.
**Why it happens:** Multiple subreddits fetched in rapid succession.
**How to avoid:** Batch all subreddit fetches with a small delay (500ms between requests). Cache results for at least 2 hours. The bot only needs 4-6 total fetches per day.
**Warning signs:** 429 HTTP responses, empty JSON bodies.

### Pitfall 3: AI Filter Letting Garbage Through
**What goes wrong:** DeepSeek classifies low-quality or irrelevant content as "keep" because the classification prompt is too loose.
**Why it happens:** The user's group is diverse (FAANG engineers, small biz owners, students). Generic "is this useful?" prompts are too broad.
**How to avoid:** Classification prompt must reference SPECIFIC criteria: Is this actionable? Does it provide a concrete technique, tool, or resource? Would a busy person benefit from reading this? Score 0-100 and only post items scoring 70+. Include member interest profiles in the prompt context.
**Warning signs:** Members stop reacting to feed posts. Downvote reactions outweigh upvotes.

### Pitfall 4: Notification Routing Breaking DM Delivery
**What goes wrong:** Routing to a specific Discord account that has DMs closed causes silent delivery failure.
**Why it happens:** The current deliverToPrivateSpace falls back from channel to DM to first account. Per-type routing bypasses this fallback chain.
**How to avoid:** The routing function must implement a fallback chain: preferred account -> primary account -> private space channel -> log failure. Never silently drop a notification.
**Warning signs:** Members report missing briefs or nudges after configuring routing.

### Pitfall 5: Lane Cleanup Breaking Channel Detection
**What goes wrong:** After renaming "Hustle Zones" channels, the resources module handler stops detecting resource posts because channel names changed.
**Why it happens:** RESOURCE_CHANNELS constant in resources/constants.ts hardcodes 'tech-resources', 'business-resources', 'growth-resources'.
**How to avoid:** Update RESOURCE_CHANNELS constant when channel names change. Consider making channel detection config-driven (by category) rather than name-driven.
**Warning signs:** Resource posts stop getting reactions and discussion threads.

### Pitfall 6: Bot Restart During Active Feed Cycle
**What goes wrong:** Bot restarts mid-way through a feed posting cycle, causing duplicate posts when it comes back up.
**Why it happens:** No deduplication. The bot fetches and posts, but doesn't track what was already posted before crash.
**How to avoid:** Store posted item links/IDs in DB (FeedPost model). On each cycle, check if an item was already posted before sending to Discord. The DB is the source of truth, not in-memory state.
**Warning signs:** Duplicate content appearing in feed channels after restarts.

## Code Examples

### RSS + YouTube Feed Fetching
```typescript
// Source: rss-parser npm docs + YouTube RSS format
import Parser from 'rss-parser';

const parser = new Parser({
  timeout: 10000, // 10s timeout per feed
  maxRedirects: 3,
});

// RSS feed
const rssFeed = await parser.parseURL('https://example.com/feed.xml');
for (const item of rssFeed.items) {
  // item.title, item.link, item.contentSnippet, item.isoDate
}

// YouTube channel feed (same parser!)
const ytFeed = await parser.parseURL(
  'https://www.youtube.com/feeds/videos.xml?channel_id=UC_x5XG1OV2P6uZZ5FSM9Ttw'
);
for (const item of ytFeed.items) {
  // item.title, item.link (youtube.com/watch?v=...), item.isoDate
}
```

### Reddit JSON Fetching
```typescript
// Source: Reddit .json endpoint (no auth required)
interface RedditPost {
  title: string;
  url: string;
  selftext: string;
  score: number;
  created_utc: number;
  permalink: string;
  author: string;
}

async function fetchSubreddit(subreddit: string, sort: string = 'hot', limit: number = 10): Promise<RedditPost[]> {
  const url = `https://www.reddit.com/r/${subreddit}/${sort}.json?limit=${limit}`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'DiscordHustlerBot/1.0' },
  });

  if (!response.ok) throw new Error(`Reddit API ${response.status}`);

  const data = await response.json();
  return data.data.children.map((child: { data: RedditPost }) => child.data);
}
```

### AI Content Filter (DeepSeek V3.2 Structured Output)
```typescript
// Source: Established OpenRouter pattern from ai-tags.ts and nudge.ts
const completion = await openrouterClient.chat.send({
  chatGenerationParams: {
    model: 'deepseek/deepseek-v3.2',
    messages: [
      {
        role: 'system' as const,
        content: `You are a content curator for a productivity Discord server. Members are diverse: FAANG engineers, small business owners, students, ecom operators, content creators.

Classify each content item. A "keep" item must be:
- ACTIONABLE: provides a concrete technique, tool, strategy, or resource
- RELEVANT: useful to at least one member profile type
- NOT garbage: no clickbait, no fluff, no obvious self-promotion

Return a JSON classification.`,
      },
      {
        role: 'user' as const,
        content: `Classify this content:\nTitle: ${item.title}\nSource: ${item.sourceName}\nSummary: ${item.content?.slice(0, 500)}`,
      },
    ],
    responseFormat: {
      type: 'json_schema' as const,
      jsonSchema: {
        name: 'content_filter',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            keep: { type: 'boolean' },
            relevanceScore: { type: 'number' },
            category: { type: 'string' },
            reason: { type: 'string' },
          },
          required: ['keep', 'relevanceScore', 'category', 'reason'],
          additionalProperties: false,
        },
      },
    },
    stream: false,
  },
});
```

### Reaction-Based Feedback Loop
```typescript
// Source: discord.js reaction collector pattern
// After posting a feed item, add upvote/downvote reactions
const message = await channel.send({ embeds: [feedEmbed] });
await message.react('\u{1F44D}'); // thumbs up
await message.react('\u{1F44E}'); // thumbs down

// Track reactions on a collector or periodic sweep
// Store vote counts in FeedPost record for future filter training
```

### Enhanced Delivery with Notification Type
```typescript
// Extend existing deliverToPrivateSpace pattern
import { deliverToPrivateSpace, type DeliveryContent } from '../../shared/delivery.js';

type NotificationType = 'brief' | 'nudge' | 'session_alert' | 'level_up' | 'general';

export async function deliverNotification(
  client: Client,
  db: ExtendedPrismaClient,
  memberId: string,
  type: NotificationType,
  content: DeliveryContent,
): Promise<boolean> {
  // Check for per-type routing preference
  const prefs = await db.notificationPreference.findUnique({
    where: { memberId },
  });

  const preferredAccountId = prefs?.[type] ?? null;

  if (preferredAccountId) {
    // Try delivering to the specified account
    try {
      const user = await client.users.fetch(preferredAccountId);
      await user.send(content);
      return true;
    } catch {
      // Fall through to default delivery
    }
  }

  // Default: use existing delivery (private space -> first account DM)
  return deliverToPrivateSpace(client, db, memberId, content);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| YouTube Data API v3 for feeds | YouTube RSS (no auth) | Always available | No API key needed, parsed by same rss-parser library |
| Reddit OAuth for read-only | Reddit .json endpoint | 2023+ (rate limited but sufficient) | Simpler, no token management, 100 req/10min is plenty |
| Hardcoded three lanes | Dynamic interest-based channels | Phase 6 decision | Removes rigid structure, adapts to member interests |
| Single delivery target | Per-notification-type routing | Phase 6 (FNDN-06) | Multi-account members get fine-grained control |

**Deprecated/outdated:**
- YouTube Data API v2: Deprecated since April 2015. Do not use.
- reddit.com/r/.rss format: Works but returns Atom XML. The .json endpoint is simpler for programmatic access.

## Schema Changes Needed

### New Models
```prisma
/// Source configuration for auto-content feeds.
model FeedSource {
  id        String     @id @default(cuid())
  name      String     // Human-readable name
  type      FeedType   // RSS, YOUTUBE, REDDIT
  url       String     // Feed URL or subreddit name
  active    Boolean    @default(true)
  channelId String?    // Discord channel to post in (null = default feed channel)
  createdAt DateTime   @default(now())

  posts     FeedPost[]
}

/// Posted feed items -- for deduplication and feedback tracking.
model FeedPost {
  id             String   @id @default(cuid())
  sourceId       String
  externalId     String   // URL or unique ID from source
  title          String
  link           String
  category       String?  // AI-assigned category
  relevanceScore Int?     // AI relevance score 0-100
  upvotes        Int      @default(0)
  downvotes      Int      @default(0)
  messageId      String?  // Discord message ID for reaction tracking
  postedAt       DateTime @default(now())

  source FeedSource @relation(fields: [sourceId], references: [id], onDelete: Cascade)

  @@unique([sourceId, externalId])
  @@index([postedAt])
}

enum FeedType {
  RSS
  YOUTUBE
  REDDIT
}

/// Per-member notification routing preferences.
model NotificationPreference {
  id             String  @id @default(cuid())
  memberId       String  @unique
  briefAccountId String? // Discord account ID for briefs (null = default)
  nudgeAccountId String? // Discord account ID for nudges
  sessionAlertAccountId String? // For session invites
  levelUpAccountId      String? // For level-up notifications

  member Member @relation(fields: [memberId], references: [id], onDelete: Cascade)
}
```

### Model Updates
```prisma
// Add to Member model relations:
// notificationPreference NotificationPreference?
```

## Lane Cleanup Scope

Files requiring changes to remove three-lane (freelancing/ecom/content) references:

| File | What to Change |
|------|---------------|
| `src/shared/constants.ts` | Remove `hustle` category from SERVER_CATEGORIES (lines 62-69) |
| `src/modules/server-setup/channels.ts` | No "Hustle Zones" in CATEGORIES array (already uses own CATEGORIES) -- but check if constants.ts is referenced elsewhere |
| `src/modules/onboarding/setup-flow.ts` | Line 59: Remove "ecom, freelancing" from question hint text (already generic enough: "coding, content creation, ecom, freelancing, design, whatever" -> make more open) |
| `src/modules/resources/constants.ts` | RESOURCE_CHANNELS may need updating if resource channel names change |
| Embed text anywhere | Search for "freelancing", "ecom", "content creation" as hardcoded strings |

**Recommendation for channel placement (Claude's Discretion):** Create a single `#auto-feed` channel under the RESOURCES category. This keeps auto-posted content separate from member-shared resources, making it clear which is curated by AI and which by humans. Members can still discuss via auto-created threads.

**Recommendation for channel migration (Claude's Discretion):** Repurpose with renames rather than recreate. Less disruption, preserves message history. Rename "Hustle Zones" to something like "Topics" or remove it entirely if resources category covers everything.

## Hardening Checklist

### Bot Restart Recovery (already partially implemented)
The codebase already handles:
- Schedule rebuild on ready (scheduler/index.ts lines 87-108)
- Voice session reconstruction on ready (voice-tracker/index.ts lines 155-170)
- Leaderboard channel init on ready (leaderboard/index.ts lines 33-45)
- Season module initialization

**Still needed:**
1. Admin log channel (#bot-log) -- create on setup, post restart notifications
2. Check for expired goals that may have been missed during downtime
3. Check for scheduled sessions that passed their start time during downtime
4. Verify auto-feed scheduled tasks are registered
5. Log restart with timestamp and summary of recovered state

### Member Leave/Rejoin
- `guildMemberRemove`: Log the event. Do NOT delete data (user chose to leave Discord server, not delete their data -- that's what /deletedata is for).
- `guildMemberAdd`: Check if `DiscordAccount` exists for this discordId. If yes, this is a rejoin. Send a DM: "Welcome back! Your profile is still here. Want to pick up where you left off, or start fresh with /setup?" If they choose fresh start, run /deletedata flow first, then /setup.
- Edge case: member was linked via alt account, primary account leaves. The identity system handles this -- data persists under memberId, not discordId.

### Empty State Handling
- Leaderboard with 0 members: Show "No rankings yet -- check in to get on the board!"
- Auto-feed with 0 sources configured: Skip posting cycle silently
- Season with no snapshots: "This season is just getting started"
- All already handled well in existing codebase; verify and add where missing

## Open Questions

1. **AI Source Discovery**
   - What we know: User wants AI to "actively DISCOVER new relevant sources" beyond curated ones
   - What's unclear: How aggressive should discovery be? What constitutes a "discovered" source -- does AI suggest URLs for admin approval, or auto-add them?
   - Recommendation: Start with admin-approved workflow. AI suggests sources in #bot-log, admin uses a command to approve/reject. Auto-adding unknown feeds is risky for quality control.

2. **Feedback Loop Training Mechanism**
   - What we know: Member reactions (upvote/downvote) should train the filter over time
   - What's unclear: How to incorporate feedback into the AI prompt. Pure prompt engineering (include past feedback in context) vs. stored scoring adjustments per source?
   - Recommendation: Store per-source and per-category success rates (upvote ratio). Include these stats in the classification prompt: "This source has a 72% approval rate. Posts in 'tech' category from this source average 85% approval." This is prompt-based training, no fine-tuning needed.

3. **Resource Channel Consolidation**
   - What we know: Three resource channels (tech-resources, business-resources, growth-resources) exist. Lane cleanup removes the three-lane assumption.
   - What's unclear: Should resource channels be consolidated into fewer channels? Or keep three but rename them?
   - Recommendation: Keep the three resource channels but consider renaming to be less lane-specific (e.g., "tools-and-tech", "money-and-business", "growth-and-learning") or let interest tags drive the channel names dynamically.

## Sources

### Primary (HIGH confidence)
- rss-parser npm package (https://www.npmjs.com/package/rss-parser) - API, TypeScript support, ESM compatibility
- YouTube RSS feed format (https://www.youtube.com/feeds/videos.xml?channel_id=X) - verified active as of 2025
- Reddit .json API (https://www.reddit.com/r/{subreddit}.json) - unauthenticated endpoint, 100 req/10min
- Existing codebase: All module patterns, delivery system, AI integration, schema verified by direct reading

### Secondary (MEDIUM confidence)
- discord.js reaction collectors for feedback loop
- node-cron scheduling patterns (established in project)

### Tertiary (LOW confidence)
- AI source discovery patterns -- no established standard, recommendation is pragmatic approach

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - rss-parser is well-established, YouTube RSS is documented, Reddit .json is widely used, all other deps already in project
- Architecture: HIGH - All patterns extend existing codebase conventions (module structure, event bus, delivery system, OpenRouter integration)
- Pitfalls: HIGH - Based on direct codebase analysis (found hardcoded channel names, delivery fallback chain, restart recovery gaps)
- Lane cleanup scope: HIGH - Exhaustive grep of codebase found all three-lane references
- Schema changes: MEDIUM - New models follow existing conventions but exact field set may adjust during planning

**Research date:** 2026-03-20
**Valid until:** 2026-04-20 (30 days -- stable technologies, no fast-moving APIs)
