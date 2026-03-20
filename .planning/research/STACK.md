# Stack Research: v1.1 Depth -- New Feature Additions

**Domain:** Discord productivity bot -- depth features (timers, goal hierarchy, reflection, inspiration, recaps, smart reminders, cost controls)
**Researched:** 2026-03-20
**Confidence:** HIGH (versions verified via `npm show`, TypeScript/ESM compatibility confirmed, integration points validated against existing codebase)

**Scope:** This document covers ONLY new dependencies and patterns needed for v1.1 features. The validated v1.0 stack (discord.js 14.25.x, Prisma 7, OpenRouter with DeepSeek V3.2 + Qwen 3.5 Plus, node-cron 4.x, date-fns 4.x, zod 4.x, winston 3.x, PM2) is not re-evaluated.

## New Dependencies for v1.1

### chrono-node -- Natural Language Time Parsing

| Attribute | Value |
|-----------|-------|
| Package | `chrono-node` |
| Version | 2.9.0 |
| Purpose | Parse natural language time expressions for smart reminders |
| Confidence | HIGH (verified via npm, TypeScript types included, ESM exports confirmed) |

**Why:** The smart reminders feature needs to parse inputs like "remind me tomorrow at 3pm", "in 2 hours", "next Monday morning". The existing `parseDeadline()` function in `goals/commands.ts` is a hand-rolled regex parser that handles 6 formats. Smart reminders need far richer parsing -- relative times, recurring patterns, and time-of-day expressions. chrono-node handles all of these out of the box.

**Integration:**
- TypeScript types included (`dist/esm/index.d.ts`)
- ESM exports confirmed: `{ '.': { import: './dist/esm/index.js' } }`
- Zero dependencies beyond dayjs (bundled)
- Drop-in replacement for the manual `parseDeadline()` in goals too -- simplifies existing code while enabling smart reminders

**Usage pattern:**
```typescript
import * as chrono from 'chrono-node';

// Smart reminder: "remind me to review PRs tomorrow at 3pm"
const result = chrono.parseDate('tomorrow at 3pm', new Date(), { forwardDate: true });

// With timezone reference (integrates with existing MemberSchedule.timezone)
const refDate = new TZDate(new Date(), memberTimezone);
const parsed = chrono.parseDate('next Monday at 9am', refDate, { forwardDate: true });
```

**Bonus:** Can also replace the hand-rolled `parseDeadline()` in `/setgoal` for better deadline parsing ("end of next month", "next Friday at midnight", "March 30th").

---

### @napi-rs/canvas -- Server-Side Image Generation

| Attribute | Value |
|-----------|-------|
| Package | `@napi-rs/canvas` |
| Version | 0.1.97 |
| Purpose | Generate monthly progress recap images |
| Confidence | HIGH (verified via npm, TypeScript types included, zero system dependencies, 332 dependent packages) |

**Why:** Monthly progress recaps need to produce a visual summary image (progress charts, XP trends, goal completions, streak history) that members can share to #wins or social media. Discord embeds are text-only -- an image attachment is the only way to create shareable visual content. @napi-rs/canvas is the standard choice for Discord bots because it uses Skia (the same rendering engine as Chrome), requires zero system dependencies (no `apt-get install` on the server), and ships prebuilt binaries for all platforms.

**Why not alternatives:**
- `canvas` (node-canvas): Requires native system libraries (cairo, pango, libjpeg). Breaks on Railway/Docker without manual system dependency installation. @napi-rs/canvas bundles everything.
- `canvacord` (v6.0.4): Built ON TOP of @napi-rs/canvas. Uses React-like JSX/Satori for templates. Overkill abstraction for our use case -- we need a few custom chart layouts, not a template engine. Its RankCardBuilder is designed for generic Discord rank cards, not our specific recap layout. Using @napi-rs/canvas directly gives full control without the 5 extra dependencies (satori, resvg, tailwind-merge, etc.).
- `puppeteer` / `playwright`: Launches a headless browser. 200MB+ binary, 500ms+ render time, massive memory footprint. Completely wrong tool for generating a few PNG charts on a VPS.

**Integration:**
- TypeScript types included (`index.d.ts`)
- Node.js engine requirement: `>= 10` (well within our Node 22.x)
- No peer dependencies
- API is identical to HTML5 Canvas (`createCanvas`, `getContext('2d')`, `toBuffer('image/png')`)
- Result is a Buffer that goes directly to `AttachmentBuilder` in discord.js

**Usage pattern:**
```typescript
import { createCanvas, loadImage } from '@napi-rs/canvas';

// Create a recap card (800x600 image)
const canvas = createCanvas(800, 600);
const ctx = canvas.getContext('2d');

// Draw progress bars, text, charts...
ctx.fillStyle = '#f59e0b'; // Brand amber
ctx.fillRect(50, 100, progressWidth, 30);
ctx.font = '24px sans-serif';
ctx.fillText(`${member.displayName}'s Monthly Recap`, 50, 60);

// Export to Discord attachment
const buffer = canvas.toBuffer('image/png');
const attachment = new AttachmentBuilder(buffer, { name: 'recap.png' });
await channel.send({ files: [attachment] });
```

**Cost impact:** Zero. Runs locally, no API calls.

---

### No New Dependencies Needed (Use Existing Stack)

The following v1.1 features do NOT require new libraries:

| Feature | Why No New Dependency |
|---------|---------------------|
| **Productivity timer (pomodoro)** | Use `setTimeout`/`setInterval` + in-memory `Map<memberId, TimerState>`. node-cron is for scheduled recurring tasks; pomodoro is user-initiated with dynamic durations. A timer is just state management + delayed function calls. The existing `SchedulerManager` pattern (Map of memberId -> tasks) applies directly. |
| **Goal hierarchy refactor** | Prisma self-relations handle parent-child trees natively. Add `parentId String?` + `parent Goal? @relation("GoalHierarchy")` + `children Goal[] @relation("GoalHierarchy")` to the existing Goal model. No new library needed -- queries use `include: { children: true }` for one level, or `$queryRaw` with recursive CTEs for full tree traversal (rare, only for yearly->daily visualization). |
| **Self-evaluation/reflection** | Text-based flow using Discord modals (already used in onboarding) + AI analysis via existing OpenRouter integration. Store encrypted responses in a new `Reflection` Prisma model. No new tools. |
| **Inspiration system** | New Prisma model `Inspiration` with `memberId` + `name` + `context`. Jarvis personality builder adds inspirations to system prompt context. Pure data + prompt engineering -- no libraries. |
| **Per-user rate limiting / cost controls** | Build in-process with a simple `Map<memberId, { count, windowStart }>`. At 10-25 members, an in-memory sliding window is sufficient. No Redis, no `rate-limiter-flexible`. The existing daily message cap pattern in `chat.ts` (counting DB rows since `startOfDay`) already works -- extend it with configurable per-member limits stored in a new Prisma model. |
| **Smart reminder scheduling** | The existing `SchedulerManager` + `node-cron` handles cron-based scheduling. For one-shot reminders ("remind me in 2 hours"), use `setTimeout` + persist to DB for restart recovery (same pattern as scheduled lock-in sessions). |
| **Pluggable delivery backend** | Extend the existing `NotificationRouter` with a provider interface. The Discord provider is already implemented. Future Apple/APNs provider will be a separate module that implements the same interface. No library needed until the Apple integration phase. |

---

## Architecture Patterns for v1.1 (No Library Required)

### Pomodoro Timer -- In-Memory State Machine

Do NOT use node-cron for pomodoro timers. node-cron is designed for recurring scheduled tasks ("every day at 8am"). Pomodoro timers are user-initiated, dynamic-duration, interactive state machines.

**Pattern:** In-memory Map with setTimeout handles.

```typescript
interface TimerState {
  memberId: string;
  mode: 'work' | 'break';
  startedAt: Date;
  durationMs: number;
  handle: NodeJS.Timeout;
  pomodoroCount: number;
  sessionId: string; // Links to LockInSession or standalone
}

// Per-member timer storage
const activeTimers = new Map<string, TimerState>();
```

**Restart recovery:** Persist timer start time + duration to DB. On restart, calculate remaining time and recreate the setTimeout. The existing sessions module already does this pattern for scheduled lock-in sessions (lines 102-147 of `sessions/index.ts`).

### Per-User Cost Controls -- Extend Existing Pattern

The existing daily message cap in `chat.ts` counts DB rows:
```typescript
const todayMessageCount = await db.conversationMessage.count({
  where: { memberId, role: 'user', createdAt: { gte: todayStart } },
});
```

For v1.1 cost controls, make this configurable per-member:
1. Add a `CostConfig` Prisma model with `dailyMessageLimit`, `dailyAICallLimit`, `monthlyTokenBudget`
2. Add a server-wide `BotConfig` entry for global daily AI spend cap
3. Track token usage per AI call (OpenRouter response includes `usage.total_tokens`)
4. Check both per-member and global limits before each AI call

**Why not rate-limiter-flexible?** That library (v10.0.1) is designed for HTTP API rate limiting -- request/second patterns with distributed Redis backends. Our use case is per-member daily/monthly caps checked against a PostgreSQL counter. The existing pattern (DB count query) is simpler, already tested, and naturally survives restarts. Adding rate-limiter-flexible for 10-25 members introduces unnecessary abstraction.

### Pluggable Notification Delivery -- Provider Interface

Extend `notification-router/router.ts` with a delivery provider pattern:

```typescript
interface DeliveryProvider {
  name: string;
  canDeliver(memberId: string): Promise<boolean>;
  deliver(memberId: string, content: DeliveryContent): Promise<boolean>;
}

// Current: DiscordDMProvider (existing behavior)
// Future: APNsProvider (Apple Push Notifications)
// Future: ShortcutsProvider (Apple Shortcuts webhook)
```

**When to add the APNs library:** Only when the Apple integration phase starts. Do not install `apns2` (v12.2.0) now. The provider interface pattern means the APNs implementation is a single file that imports the library -- no architectural coupling.

---

## Installation (v1.1 Additions Only)

```bash
# New production dependencies
npm install chrono-node @napi-rs/canvas

# That's it. No new dev dependencies needed.
```

**Total new dependency weight:**
- `chrono-node@2.9.0`: ~200KB (pure JS, bundled dayjs)
- `@napi-rs/canvas@0.1.97`: ~25MB (prebuilt Skia binary for your platform, downloaded automatically via optional dependencies)

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| NLP date parsing | chrono-node 2.9.0 | Hand-rolled regex (existing) | The existing `parseDeadline()` handles 6 formats. Smart reminders need 50+ patterns (relative times, recurring, time-of-day). Maintaining a hand-rolled parser for that scope is a rewrite risk. chrono-node is battle-tested (567 dependents), 10KB, and TypeScript-native. |
| NLP date parsing | chrono-node 2.9.0 | date-fns `parse()` | date-fns `parse()` requires a known format string. It cannot parse freeform natural language like "next Tuesday afternoon". Different tool for a different problem. |
| NLP date parsing | chrono-node 2.9.0 | Sugar.js / Sherlock | Sugar.js is a monolithic utility library (date parsing is a side feature). Sherlock is unmaintained (last commit 2019). chrono-node is focused, maintained, typed. |
| Image generation | @napi-rs/canvas 0.1.97 | canvacord 6.0.4 | Canvacord is built on @napi-rs/canvas + satori + resvg + tailwind-merge. Its RankCardBuilder is designed for generic Discord rank cards. Our recap needs custom layouts (XP trend line, goal completion grid, streak calendar). Direct canvas API gives full control with fewer deps. |
| Image generation | @napi-rs/canvas 0.1.97 | Components V2 (text-only) | Discord Components V2 containers can make nice text layouts, but cannot render charts, graphs, or progress visualizations. A monthly recap without visual charts is just another text message -- not shareable, not engaging. |
| Image generation | @napi-rs/canvas 0.1.97 | chart.js + chartjs-node-canvas | chartjs-node-canvas wraps chart.js for server-side rendering but depends on `canvas` (node-canvas) which requires system dependencies. @napi-rs/canvas avoids this entirely. Drawing simple bar/line charts with raw Canvas2D API is 50 lines of code -- chart.js's 200KB bundle is overkill for 3 chart types. |
| Rate limiting | In-memory Map + DB counts | rate-limiter-flexible 10.0.1 | rate-limiter-flexible is designed for HTTP request rate limiting at scale with Redis backends. Our use case is per-member daily caps for 10-25 people, checked against PostgreSQL. The existing `chat.ts` pattern (DB row count) already works. Adding a library introduces abstraction without benefit at this scale. |
| Rate limiting | In-memory Map + DB counts | Upstash Redis | Redis adds an external service dependency for a problem solvable with a DB query. At 10-25 members, the "check limit" query adds <1ms. Redis makes sense at 1000+ concurrent users -- not here. |
| Timer management | setTimeout + Map | BullMQ / Agenda | Job queues require Redis (BullMQ) or MongoDB (Agenda) and are designed for distributed worker patterns. A pomodoro timer is a per-user countdown -- setTimeout with DB persistence for restart recovery is the right tool. The sessions module already uses this exact pattern for scheduled sessions. |
| Timer management | setTimeout + Map | node-cron (existing) | node-cron schedules recurring tasks at fixed times ("every day at 8am"). Pomodoro timers are dynamic-duration, user-initiated, non-recurring. Wrong abstraction. |
| Goal hierarchy | Prisma self-relation | ltree (PostgreSQL extension) | PostgreSQL's `ltree` extension enables efficient materialized path queries for deep trees. But our hierarchy is max 4 levels (year -> quarter -> month -> week/day) with ~20 nodes per member. Self-referential relations with `include: { children: true }` handle this with zero configuration. ltree is for 10,000+ node trees. |
| Delivery abstraction | Interface + existing router | Notification microservice | A separate notification service adds deployment complexity, inter-service communication, and operational overhead for a 10-25 member server. A provider interface inside the existing bot process is the right abstraction until scale demands separation. |

## What NOT to Add for v1.1

| Avoid | Why | Do Instead |
|-------|-----|------------|
| Redis / Upstash | Not needed for 10-25 member rate limiting. Adds external dependency, connection management, and cost for a problem solvable with DB queries. | In-memory Map for hot-path checks, PostgreSQL for persistence |
| `apns2` or APNs library | Apple integration is a future milestone. Installing it now creates dead code and version drift. | Design the pluggable provider interface now. Add the library when building the Apple module. |
| `chart.js` / `chartjs-node-canvas` | Depends on `canvas` (system deps). Our charts are simple (bar, line, progress arc) -- 50 lines of Canvas2D, not a charting framework. | Raw @napi-rs/canvas drawing. Helper functions for `drawBarChart()`, `drawLineChart()`, `drawProgressArc()`. |
| `canvacord` | Unnecessary abstraction layer over @napi-rs/canvas. Adds satori, resvg, tailwind-merge. We need custom layouts, not pre-built card templates. | Direct @napi-rs/canvas API |
| `ioredis` / `redis` | No Redis use case at this scale. | PostgreSQL handles everything |
| `bull` / `bullmq` | Job queue for distributed workers. Our timers are in-process countdowns for 10-25 people. | setTimeout + DB persistence |
| `rate-limiter-flexible` | HTTP-oriented rate limiting library. Our rate limiting is application-level daily/monthly caps. | DB count queries (existing pattern) + in-memory Map cache |
| `agenda` / `bree` | Advanced job schedulers. node-cron + setTimeout already cover all scheduling needs. | Existing SchedulerManager + setTimeout for one-shot timers |

## Prisma Schema Additions (No New Library)

The following new models and model changes are needed purely through Prisma schema evolution:

```prisma
// Goal hierarchy -- self-relation
model Goal {
  // ... existing fields ...
  parentId  String?
  parent    Goal?   @relation("GoalHierarchy", fields: [parentId], references: [id])
  children  Goal[]  @relation("GoalHierarchy")
  depth     Int     @default(0) // 0=standalone, 1=yearly, 2=quarterly, 3=monthly, 4=weekly/daily
}

// Self-evaluation / reflection
model Reflection {
  id          String   @id @default(cuid())
  memberId    String
  content     String   // Encrypted
  mood        Int?     // 1-5 scale
  intensity   String   @default("standard") // "light", "standard", "deep"
  period      String   // "daily", "weekly", "monthly"
  insights    String?  // AI-generated insights (encrypted)
  createdAt   DateTime @default(now())
  member      Member   @relation(...)
}

// Inspiration figures
model Inspiration {
  id          String   @id @default(cuid())
  memberId    String
  name        String   // "Naval Ravikant", "Elon Musk", etc.
  context     String?  // Encrypted -- why they admire this person
  createdAt   DateTime @default(now())
  member      Member   @relation(...)
}

// Smart reminders
model Reminder {
  id          String        @id @default(cuid())
  memberId    String
  content     String        // Encrypted
  triggerAt   DateTime
  urgency     String        @default("normal") // "low", "normal", "high", "critical"
  recurring   String?       // Cron expression if recurring, null if one-shot
  status      ReminderStatus @default(PENDING)
  deliveredAt DateTime?
  createdAt   DateTime      @default(now())
  member      Member        @relation(...)
}

// Per-member cost/rate configuration
model CostConfig {
  id                 String @id @default(cuid())
  memberId           String @unique
  dailyMessageLimit  Int    @default(50)  // Current hardcoded cap, now configurable
  monthlyTokenBudget Int?   // Optional monthly token cap
  member             Member @relation(...)
}

// Pomodoro timer sessions (for persistence across restarts)
model TimerSession {
  id              String   @id @default(cuid())
  memberId        String
  mode            String   // "work" or "break"
  durationMinutes Int
  startedAt       DateTime
  pomodoroCount   Int      @default(0)
  sessionId       String?  // Optional link to LockInSession
  member          Member   @relation(...)
}
```

## Version Compatibility (New Packages)

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| chrono-node@2.9.0 | Node.js >= 12.20.0 | Well within our Node 22.x. ESM + CJS dual exports. TypeScript types included. |
| @napi-rs/canvas@0.1.97 | Node.js >= 10 | Prebuilt binaries for darwin-arm64, linux-x64, win32-x64. Auto-detected via optional dependencies. No manual configuration. |
| chrono-node@2.9.0 | TypeScript 5.x | Types at `dist/esm/index.d.ts`. No version constraints. |
| @napi-rs/canvas@0.1.97 | TypeScript 5.x | Types at `index.d.ts`. Full Canvas2D API typing. |
| chrono-node@2.9.0 | Prisma 7.x | No interaction. Parses dates that become `DateTime` fields in Prisma. |
| @napi-rs/canvas@0.1.97 | discord.js 14.x | Output Buffer feeds directly into `AttachmentBuilder`. No compatibility issues. |

## Cost Impact of v1.1

| Item | Change | Estimate |
|------|--------|----------|
| AI API costs | More AI calls (reflection analysis, inspiration context, recap summaries) | +$0.02-0.05/day (~$1-1.50/mo) |
| @napi-rs/canvas | CPU-only, runs locally | $0 |
| chrono-node | CPU-only, runs locally | $0 |
| Database | More tables, more rows per member | Negligible at 10-25 members |
| **v1.1 net increase** | | **~$1-2/mo** |

Current v1.0 AI costs are ~$0.03/day via DeepSeek V3.2. The new features (reflection AI analysis, inspiration context injection, recap summaries) add more AI calls but are still low-volume (10-25 members, once daily/weekly/monthly). With per-member cost controls, spending is bounded.

## Sources

- [chrono-node on npm](https://www.npmjs.com/package/chrono-node) -- Version 2.9.0 verified via `npm show`. TypeScript types and ESM exports confirmed. HIGH confidence.
- [chrono-node GitHub](https://github.com/wanasit/chrono) -- 567 dependents, active maintenance, comprehensive test suite. HIGH confidence.
- [@napi-rs/canvas on npm](https://www.npmjs.com/package/@napi-rs/canvas) -- Version 0.1.97 verified via `npm show`. 332 dependents. Zero system deps. HIGH confidence.
- [@napi-rs/canvas GitHub](https://github.com/Brooooooklyn/canvas) -- Skia-based, prebuilt binaries, HTML5 Canvas API compatible. HIGH confidence.
- [canvacord on npm](https://www.npmjs.com/package/canvacord) -- Version 6.0.4. Dependencies include @napi-rs/canvas, satori, resvg, tailwind-merge. Confirmed higher abstraction than needed. HIGH confidence.
- [rate-limiter-flexible on npm](https://www.npmjs.com/package/rate-limiter-flexible) -- Version 10.0.1. Confirmed HTTP-oriented with Redis/Memory backends. Not suited for our per-member daily cap pattern. MEDIUM confidence.
- [Prisma self-relations documentation](https://www.prisma.io/docs/orm/prisma-schema/data-model/relations/self-relations) -- Confirmed one-to-many self-relation pattern for goal hierarchy. HIGH confidence.
- [Prisma tree structures support (Issue #4562)](https://github.com/prisma/prisma/issues/4562) -- Confirmed no native recursive query support; raw SQL CTEs needed for deep traversal. MEDIUM confidence.
- [apns2 on npm](https://www.npmjs.com/package/apns2) -- Version 12.2.0. HTTP/2 + JWT auth. Node >= 20. Confirmed viable for future Apple integration but not needed now. MEDIUM confidence.
- [Discord Pomodoro Bot Examples](https://github.com/cademirci/pomodoro-bot) -- Confirmed setTimeout-based timer pattern is standard for Discord bots. MEDIUM confidence.
- [Node.js Timers Documentation](https://nodejs.org/en/docs/guides/timers-in-node) -- setTimeout/setInterval behavior, timer object references for cancellation. HIGH confidence.
- Existing codebase analysis (package.json, schema.prisma, scheduler/manager.ts, notification-router/router.ts, ai-assistant/chat.ts, goals/commands.ts) -- Integration points verified against actual code. HIGH confidence.

---
*Stack research for: Discord Hustler v1.1 Depth -- new feature additions*
*Researched: 2026-03-20*
