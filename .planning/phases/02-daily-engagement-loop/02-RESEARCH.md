# Phase 2: Daily Engagement Loop - Research

**Researched:** 2026-03-20
**Domain:** Gamified daily check-in system, XP/leveling engine, goal tracking, scheduled personalized briefs -- all via Discord bot (discord.js 14.x) with PostgreSQL (Prisma 7) and AI (DeepSeek V3.2 via OpenRouter)
**Confidence:** HIGH

## Summary

Phase 2 builds the daily habit loop that gives members a reason to open Discord every day. It comprises five subsystems: (1) a private `/checkin` command with AI category extraction and flexible scoring, (2) a `/setgoal` command with measurable and free-text goals plus progress tracking, (3) an XP engine that awards points from check-ins, goal completions, streaks, and setup bonus, (4) automatic rank/role progression when XP crosses thresholds, and (5) personalized morning briefs delivered to each member's private space at their chosen time with their chosen tone.

The existing codebase provides solid foundations: the module system, event bus, encryption layer, OpenRouter integration pattern (from `ai-tags.ts`), DM conversation pattern (from `setup-flow.ts`), embed helpers, and Prisma schema with Member/MemberProfile models. Phase 2 extends this with new Prisma models (CheckIn, Goal, XPTransaction, Streak, MemberSchedule, MorningBrief), new modules (checkin, goals, xp, scheduler, briefs), and new events (checkinComplete, goalCompleted, xpAwarded, levelUp).

**Primary recommendation:** Build the XP engine and streak tracker as foundational services first (they are consumed by everything else), then layer check-ins and goals on top, and finally wire up the scheduler + morning briefs as the last piece since they depend on all other data being in place.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Check-ins are private only -- delivered to member's private space, never posted publicly
- Quick + optional format: one required field ("what did you do?") + optional effort rating
- AI extracts categories from free text (like profile setup) -- no forced categorization
- Custom check-in schedules per member: members set their own reminder times, timezone-aware, changeable anytime
- Weekly planning prompt: every Sunday the bot asks members to set their coming week's check-in schedule and goals
- Multiple check-ins per day allowed -- avoid spam incentive with diminishing XP
- XP is fully public -- everyone sees everyone's XP and level
- XP sources in Phase 2: check-ins, goals completed, streak bonuses, setup completion bonus
- Level-up notifications must feel rewarding and encouraging, NEVER annoying or spammy -- subtle celebration, not notification noise
- Morning briefs: member-chosen tone (coach, chill friend, data-first, etc.)
- Morning briefs: member-set send time, changeable anytime
- Morning brief content includes: today's schedule (check-in reminders, sessions), streak & rank status, active goals + progress
- Morning briefs do NOT include community pulse (who's active, who checked in) -- that is Phase 3
- Goals: both measurable ("5 cold emails" -> track 2/5) and free text ("learn Figma basics")
- Soft cap on active goals -- bot suggests limiting to 3-5 but does not hard-block
- Expired goals get an extend option -- bot asks "extend this goal?" before archiving to missed
- Weekly Sunday planning session: bot prompts every Sunday to set goals and schedule for the coming week
- Goal completion earns bonus XP (more than a check-in -- hitting targets should feel significant)
- AI model: DeepSeek V3.2 via OpenRouter

### Claude's Discretion
- XP amounts per activity and leveling curve design
- Streak multiplier mechanics and decay rules
- Morning brief implementation (AI-generated vs template vs hybrid)
- Exact check-in reminder scheduling implementation
- How level-up celebrations look (embed style, where they appear)
- Sunday planning session flow and questions

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ENGAGE-01 | Daily check-in via `/checkin` -- log what you did today with flexible scoring (not rigid pass/fail streaks) | Check-in module with private DM/channel delivery, AI category extraction via OpenRouter, flexible 1-5 effort rating, diminishing XP for multiple daily check-ins |
| ENGAGE-02 | Goal setting via `/setgoal` -- set weekly/monthly goals with progress tracking | Goal module with measurable + free-text goal types, `/setgoal`, `/goals`, `/progress` commands, soft cap advisory, expiry extend flow |
| ENGAGE-03 | XP engine -- earn XP from check-ins, goals completed, voice sessions, wins posted | XP service with transaction log, four Phase 2 sources (check-ins, goals, streaks, setup bonus), streak multiplier, diminishing returns |
| ENGAGE-04 | Rank/role progression -- level up from XP and unlock Discord roles automatically | Role sync service using existing RANK_PROGRESSION constants, automatic role assignment/removal on level change, level-up celebration embed |
| ENGAGE-05 | Morning briefs -- daily personalized message in member's private space (goals, streak status, rank, activity summary) | Scheduler module with per-member timezone-aware cron jobs, hybrid AI+template brief generation, delivery to private space (DM or channel) |
</phase_requirements>

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| discord.js | 14.25.1 | Discord API -- commands, embeds, roles, DM delivery | Already in use, battle-tested |
| @prisma/client | 7.5.0 | Database ORM -- new models for check-ins, goals, XP, schedules | Already in use, schema extension is straightforward |
| @openrouter/sdk | 0.9.11 | AI API -- category extraction from check-ins, morning brief generation | Already in use, pattern established in ai-tags.ts |
| date-fns | 4.1.0 | Date manipulation -- streak calculations, scheduling logic, relative time | Already installed |
| node-cron | 3.x | Scheduling -- morning briefs, check-in reminders, Sunday planning prompts | Already in STACK.md; not yet installed |
| zod | 4.3.6 | Validation -- command inputs, AI response parsing, goal definitions | Already in use |
| winston | 3.19.0 | Logging -- all module operations | Already in use |

### New Dependencies Needed
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @date-fns/tz | latest | Timezone-aware date operations -- per-member local time for briefs, reminders, streak resets | Required for ENGAGE-05 (per-member send times) and ENGAGE-01 (timezone-aware streak tracking) |
| node-cron | 4.x | Scheduled task runner with timezone support | Required for ENGAGE-05 (morning briefs), check-in reminders, Sunday planning prompts. Use `createTask` for per-member scheduling with `timezone` option. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| node-cron for per-member scheduling | Single minutely cron + DB query approach | Single cron is simpler but less precise timing. For 10-25 members, per-member tasks are fine. If member count grows past 100, switch to single-cron-with-DB-query pattern. |
| AI-generated briefs | Pure template briefs | Templates are cheaper and faster but feel robotic. Hybrid approach (template structure + AI personal touch on 1-2 sentences) keeps costs near-zero while feeling personal. DeepSeek V3.2 at $0.26/M input tokens makes full AI briefs viable for 25 members (~$0.01/day). |
| Storing XP as a running total | XP transaction log | Transaction log is slightly more storage but enables audit trail, source attribution, and easy recalculation. Critical for debugging and future features (seasonal resets). |

**Installation:**
```bash
npm install node-cron @date-fns/tz
npm install -D @types/node-cron  # node-cron 4.x may include types; check
```

## Architecture Patterns

### Recommended Module Structure
```
src/modules/
  checkin/
    index.ts           # Module registration, event wiring
    commands.ts         # /checkin command handler
    ai-categories.ts   # AI category extraction from check-in text
    reminder.ts        # Check-in reminder scheduling
  goals/
    index.ts           # Module registration
    commands.ts        # /setgoal, /goals, /progress, /completegoal
    expiry.ts          # Goal expiry checker + extend prompt
  xp/
    index.ts           # Module registration, event listeners
    engine.ts          # XP award logic, diminishing returns, streak multiplier
    rank-sync.ts       # Role assignment on level change
    constants.ts       # XP amounts, level thresholds, multiplier tables
  scheduler/
    index.ts           # Module registration, task management
    manager.ts         # Per-member cron task lifecycle (create, update, destroy)
    briefs.ts          # Morning brief generation (hybrid AI + template)
    planning.ts        # Sunday planning session flow
```

### Pattern 1: XP Transaction Log
**What:** Every XP award is recorded as an immutable transaction row with source, amount, and timestamp. The member's total XP is a derived value (sum of transactions) cached on the Member model for fast reads.
**When to use:** All XP operations.
**Why:** Enables audit trail, source attribution, streak bonus calculation, and future seasonal resets (filter transactions by date range).

```typescript
// XP award pattern -- used by all XP sources
async function awardXP(
  db: ExtendedPrismaClient,
  memberId: string,
  amount: number,
  source: XPSource,
  description: string,
): Promise<{ newTotal: number; leveledUp: boolean; newRank?: string }> {
  // Use Prisma transaction for atomicity
  return db.$transaction(async (tx) => {
    // 1. Create transaction record
    await tx.xpTransaction.create({
      data: { memberId, amount, source, description },
    });

    // 2. Update cached total
    const member = await tx.member.update({
      where: { id: memberId },
      data: { totalXp: { increment: amount } },
    });

    // 3. Check for level-up
    const oldRank = getRankForXP(member.totalXp - amount);
    const newRank = getRankForXP(member.totalXp);
    const leveledUp = oldRank.name !== newRank.name;

    return { newTotal: member.totalXp, leveledUp, newRank: leveledUp ? newRank.name : undefined };
  });
}
```

### Pattern 2: Per-Member Scheduler with Manager
**What:** A SchedulerManager class that maintains a Map of memberId -> ScheduledTask. Tasks are created/updated/destroyed as members change their preferences. On bot restart, tasks are rebuilt from the database.
**When to use:** Morning briefs, check-in reminders, Sunday planning prompts.
**Why:** node-cron 4.x `createTask` with timezone support handles per-member scheduling cleanly. For 10-25 members, individual tasks are fine (no need for a single-cron-with-query pattern).

```typescript
import cron from 'node-cron';

class SchedulerManager {
  private tasks = new Map<string, cron.ScheduledTask>();

  schedule(memberId: string, cronExpr: string, timezone: string, fn: () => Promise<void>): void {
    // Stop existing task if any
    this.tasks.get(memberId)?.stop();

    const task = cron.createTask(cronExpr, async () => {
      try { await fn(); } catch (e) { logger.error(`Scheduled task failed for ${memberId}:`, e); }
    }, { timezone, name: `brief-${memberId}` });

    task.start();
    this.tasks.set(memberId, task);
  }

  unschedule(memberId: string): void {
    this.tasks.get(memberId)?.stop();
    this.tasks.delete(memberId);
  }

  rebuildAll(schedules: MemberSchedule[]): void {
    for (const s of schedules) {
      this.schedule(s.memberId, s.cronExpression, s.timezone, () => sendBrief(s.memberId));
    }
  }
}
```

### Pattern 3: Private Space Delivery
**What:** A reusable function that delivers a message to a member's private space (DM or private channel), handling both space types transparently.
**When to use:** Check-in responses, goal updates, morning briefs, reminders, level-up notifications.
**Why:** The PrivateSpace model already exists. Every Phase 2 feature needs to deliver private messages.

```typescript
async function deliverToPrivateSpace(
  client: Client,
  db: ExtendedPrismaClient,
  memberId: string,
  content: { embeds?: EmbedBuilder[]; content?: string },
): Promise<boolean> {
  const space = await db.privateSpace.findUnique({ where: { memberId } });
  if (!space) return false;

  if (space.type === 'CHANNEL' && space.channelId) {
    const channel = await client.channels.fetch(space.channelId);
    if (channel?.isTextBased()) {
      await (channel as TextChannel).send(content);
      return true;
    }
  }

  // DM fallback or DM preference
  const account = await db.discordAccount.findFirst({ where: { memberId } });
  if (!account) return false;
  const user = await client.users.fetch(account.discordId);
  await user.send(content);
  return true;
}
```

### Pattern 4: Event-Driven XP Awards
**What:** Check-in and goal modules emit events. The XP module listens and awards XP. The rank-sync module listens for xpAwarded and handles role changes.
**When to use:** All XP-triggering actions.
**Why:** Decouples modules. The check-in module does not need to know about XP amounts -- it just emits `checkinComplete`. Matches the existing `memberSetupComplete` pattern.

```
checkinComplete -> XP module awards check-in XP -> emits xpAwarded
goalCompleted   -> XP module awards goal XP   -> emits xpAwarded
xpAwarded       -> Rank sync checks for level-up -> assigns role, emits levelUp
levelUp         -> Sends celebration to private space
```

### Pattern 5: Hybrid AI + Template Morning Briefs
**What:** Build the brief from real data (streak count, goal progress, rank, schedule) into a structured template, then pass it to DeepSeek V3.2 with the member's preferred tone to "humanize" it into 3-5 sentences. Falls back to the raw template if AI fails.
**When to use:** Morning brief generation.
**Why:** Pure templates feel robotic. Pure AI risks hallucination and cost. Hybrid gives personality at near-zero cost (~$0.01/day for 25 members with DeepSeek V3.2 at $0.26/M input tokens).

```typescript
async function generateBrief(member: MemberBriefData): Promise<string> {
  const template = buildBriefTemplate(member); // structured data
  try {
    const client = getOpenRouterClient();
    const result = await client.chat.send({
      chatGenerationParams: {
        model: 'deepseek/deepseek-v3.2',
        messages: [
          { role: 'system', content: `You are a ${member.briefTone} morning brief writer. Keep it to 3-5 sentences. Be concise, warm, and motivating. Use the data provided -- never invent facts.` },
          { role: 'user', content: `Write a morning brief for this member:\n${JSON.stringify(template)}` },
        ],
        stream: false,
      },
    });
    return result.choices[0]?.message?.content || formatTemplateFallback(template);
  } catch {
    return formatTemplateFallback(template);
  }
}
```

### Anti-Patterns to Avoid
- **XP for chat messages:** Rewards talking, not working. Creates spam incentive. Fundamentally misaligned with core value.
- **Binary pass/fail streaks:** Research shows users are 3.2x more likely to abandon goals after initial setbacks with rigid tracking. Use flexible scoring with grace days.
- **Public check-in posting:** Research shows public accountability suppresses commitment-making by 20%. Keep check-ins private.
- **Global timezone for daily resets:** Each member's streak must reset at their local midnight, not UTC midnight.
- **Synchronous AI calls in command handlers:** Always `deferReply()` before any AI or DB operation. Discord requires response within 3 seconds.
- **Hardcoded XP values throughout code:** Centralize in a constants file so tuning the economy does not require hunting through modules.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Timezone-aware date math | Manual UTC offset calculations | `@date-fns/tz` TZDate + date-fns v4 `in` context option | DST transitions, leap seconds, IANA timezone database updates -- all handled |
| Cron scheduling | setTimeout/setInterval chains | node-cron 4.x with `createTask` and timezone option | Drift-free, survives event loop stalls, timezone-aware |
| JSON Schema validation on AI responses | Manual try/catch JSON.parse | OpenRouter structured output (`response_format.json_schema` with `strict: true`) | Guaranteed valid JSON structure from AI |
| Rate limiting AI calls | Manual token counting | Per-member daily AI call counter in DB | Simple, auditable, adjustable |
| Discord role management edge cases | Manual role add/remove without error handling | Wrap in try/catch with role existence checks + permission checks | Roles can be deleted by admins, bot may lack permission, race conditions on multiple level-ups |

**Key insight:** The OpenRouter structured output pattern is already proven in `ai-tags.ts`. Reuse the exact same pattern for check-in category extraction and brief data structuring.

## Common Pitfalls

### Pitfall 1: Streak Anxiety and Binary Collapse
**What goes wrong:** Rigid daily streaks create an all-or-nothing psychology where one missed day destroys accumulated motivation. Over 80% of fitness app users abandon within 3 months.
**Why it happens:** The "what-the-hell effect" -- once a streak breaks, motivation drops below baseline.
**How to avoid:**
- Use flexible scoring: 1-5 effort rating where any activity counts
- Implement grace days: 1-2 per week where missing does not break the streak
- Streak decay instead of instant loss: a missed day reduces the multiplier by 1 step rather than resetting to zero
- "Comeback bonus" XP for returning after missing days
- Display streak as secondary to actual progress metrics
**Warning signs:** Zero-effort check-ins just to maintain streak; anxiety messages about "almost forgetting"

### Pitfall 2: Overjustification -- XP Replacing Intrinsic Motivation
**What goes wrong:** Members optimize for points rather than actual productive work. "How many points is this worth?" becomes the decision framework.
**Why it happens:** Extrinsic rewards crowd out intrinsic motivation (Deci, 1971). Gamers are highly attuned to reward loops.
**How to avoid:**
- XP reflects real progress, not proxy activities
- Goal completion XP is much higher than check-in XP (reward outcomes, not attendance)
- Diminishing returns on multiple daily check-ins (first = full XP, second = 50%, third+ = 10%)
- Never make XP the primary framing -- show progress toward goals first, XP second
**Warning signs:** Activity clustering around highest-XP actions; minimum-viable check-ins

### Pitfall 3: Spam Incentive from Multiple Daily Check-Ins
**What goes wrong:** Allowing unlimited check-ins with full XP each creates a spam loop where members post trivial updates for XP farming.
**Why it happens:** No diminishing returns = linear XP for linear effort (lowest quality effort).
**How to avoid:**
- Diminishing XP curve: 1st check-in = 100% XP, 2nd = 50%, 3rd = 25%, 4th+ = 10% (flat)
- AI extracts categories; duplicate-category check-ins in same day get reduced XP
- Track per-day check-in count in the CheckIn model
**Warning signs:** Multiple one-word check-ins per day from same member

### Pitfall 4: AI Cost Runaway on Morning Briefs
**What goes wrong:** 25 members * daily brief * 500 input tokens + 200 output tokens = trivial cost at DeepSeek V3.2 pricing ($0.26/M input), but if prompts grow or members trigger re-generation, costs can spike.
**Why it happens:** No per-member daily AI call limits; prompt templates that include too much context.
**How to avoid:**
- Keep brief prompts under 500 tokens (structured data only, not raw text)
- Cache brief if regenerated same day (no reason to generate twice)
- Daily AI call counter per member (cap at 5 for Phase 2)
- Template fallback always available if AI fails or budget exceeded
**Warning signs:** OpenRouter monthly bill exceeding $5 for 25 members

### Pitfall 5: Timezone Bugs in Streak Tracking
**What goes wrong:** Member in a different timezone checks in at 11pm local time but system counts it as next day (UTC), breaking their streak or double-counting.
**Why it happens:** All date comparisons use UTC without converting to member's local timezone.
**How to avoid:**
- Store member timezone in DB (MemberSchedule model)
- All streak calculations use `@date-fns/tz` TZDate with member's timezone
- "Today" is always computed relative to member's local midnight
- node-cron tasks use member's timezone for reminder delivery
**Warning signs:** Members in non-UTC timezones reporting incorrect streak counts

### Pitfall 6: Race Conditions on XP Award + Level-Up
**What goes wrong:** Two simultaneous check-ins or a check-in + goal completion race each other, causing double level-up notifications or incorrect XP totals.
**Why it happens:** Non-atomic read-modify-write on the totalXp field.
**How to avoid:**
- Use Prisma `$transaction` for all XP awards (atomic increment + read)
- Level-up check happens inside the transaction, not after
- If two events trigger simultaneously, the second transaction sees the correct post-increment total
**Warning signs:** Duplicate level-up messages; XP total not matching sum of transactions

## Code Examples

### Prisma Schema Extensions (New Models for Phase 2)

```prisma
// Add to existing Member model
model Member {
  // ... existing fields ...
  totalXp      Int      @default(0)
  currentStreak Int     @default(0)
  longestStreak Int     @default(0)
  lastCheckInAt DateTime?

  // New relations
  checkIns       CheckIn[]
  goals          Goal[]
  xpTransactions XPTransaction[]
  schedule       MemberSchedule?
}

model CheckIn {
  id          String   @id @default(cuid())
  memberId    String
  content     String   // Encrypted -- what the member did
  effortRating Int?    // Optional 1-5 effort self-rating
  categories  String[] // AI-extracted categories (cleartext for queries)
  xpAwarded   Int      @default(0)
  dayIndex    Int      // Which check-in this is today (1st, 2nd, etc.)
  createdAt   DateTime @default(now())

  member Member @relation(fields: [memberId], references: [id], onDelete: Cascade)

  @@index([memberId, createdAt])
}

model Goal {
  id          String     @id @default(cuid())
  memberId    String
  title       String     // Goal title
  description String?    // Encrypted -- detailed description
  type        GoalType   // MEASURABLE or FREETEXT
  targetValue Int?       // For measurable goals (e.g., 5 cold emails)
  currentValue Int       @default(0) // Current progress
  unit        String?    // Unit of measurement (e.g., "emails", "pages")
  status      GoalStatus @default(ACTIVE)
  deadline    DateTime   // When the goal expires
  xpAwarded   Int        @default(0) // XP given on completion
  createdAt   DateTime   @default(now())
  completedAt DateTime?
  extendedAt  DateTime?  // If member chose to extend

  member Member @relation(fields: [memberId], references: [id], onDelete: Cascade)

  @@index([memberId, status])
  @@index([deadline, status])
}

enum GoalType {
  MEASURABLE
  FREETEXT
}

enum GoalStatus {
  ACTIVE
  COMPLETED
  MISSED
  EXTENDED
}

model XPTransaction {
  id          String   @id @default(cuid())
  memberId    String
  amount      Int      // XP amount (always positive)
  source      XPSource // What triggered this award
  description String   // Human-readable description
  createdAt   DateTime @default(now())

  member Member @relation(fields: [memberId], references: [id], onDelete: Cascade)

  @@index([memberId, createdAt])
  @@index([source])
}

enum XPSource {
  CHECKIN
  GOAL_COMPLETE
  STREAK_BONUS
  SETUP_BONUS
}

model MemberSchedule {
  id             String  @id @default(cuid())
  memberId       String  @unique
  timezone       String  @default("UTC") // IANA timezone string
  briefTime      String? // HH:mm format for morning brief (null = no brief)
  briefTone      String  @default("coach") // coach, chill, data-first, etc.
  reminderTimes  String[] // Array of HH:mm strings for check-in reminders
  sundayPlanning Boolean @default(true) // Whether to receive Sunday planning prompt

  member Member @relation(fields: [memberId], references: [id], onDelete: Cascade)
}
```

### XP Economy Constants (Claude's Discretion -- Recommended Values)

```typescript
// Source: gaming psychology research + Duolingo-style early-reward pattern
export const XP_AWARDS = {
  checkin: {
    base: 25,               // First check-in of the day
    secondMultiplier: 0.5,   // 2nd check-in = 12 XP
    thirdMultiplier: 0.25,   // 3rd check-in = 6 XP
    diminishedMultiplier: 0.1, // 4th+ = 2 XP (anti-spam)
  },
  goal: {
    measurableComplete: 100,  // Completing a measurable goal
    freetextComplete: 75,     // Completing a free-text goal
    progressUpdate: 10,       // Each progress increment on measurable goal
  },
  streak: {
    dailyBonus: 5,            // Bonus XP per day of current streak (5, 10, 15...)
    milestoneBonus: {         // Extra bonus at streak milestones
      7: 50,    // 1 week
      14: 100,  // 2 weeks
      30: 250,  // 1 month
      60: 500,  // 2 months
      90: 1000, // 3 months
    },
  },
  setupBonus: 50,             // One-time bonus for completing /setup
} as const;

// Streak mechanics (flexible scoring, not binary)
export const STREAK_CONFIG = {
  graceDaysPerWeek: 2,        // Can miss 2 days per week without breaking streak
  decayRate: 0.5,             // Missing beyond grace days halves streak multiplier (not reset)
  recoverBonus: 15,           // XP bonus for "coming back" after missing days
  maxMultiplier: 3.0,         // Streak multiplier caps at 3x
  multiplierGrowth: 0.1,      // +0.1x per consecutive day (1.0 -> 1.1 -> 1.2 ... -> 3.0)
} as const;
```

### Event Bus Extensions

```typescript
// Add to BotEventMap in core/events.ts
export type BotEventMap = {
  // Existing
  memberSetupComplete: [memberId: string, discordId: string];
  accountLinked: [memberId: string, newDiscordId: string];
  profileUpdated: [memberId: string];

  // Phase 2 additions
  checkinComplete: [memberId: string, checkinId: string, dayIndex: number];
  goalCompleted: [memberId: string, goalId: string, goalType: GoalType];
  goalProgressUpdated: [memberId: string, goalId: string, newValue: number];
  xpAwarded: [memberId: string, amount: number, newTotal: number, source: XPSource];
  levelUp: [memberId: string, newRank: string, oldRank: string, newTotal: number];
  scheduleUpdated: [memberId: string]; // Triggers scheduler rebuild for this member
};
```

### Check-In AI Category Extraction (Reuses ai-tags.ts Pattern)

```typescript
// Same OpenRouter structured output pattern already proven in ai-tags.ts
const completion = await client.chat.send({
  chatGenerationParams: {
    model: 'deepseek/deepseek-v3.2',
    messages: [
      {
        role: 'system',
        content: `Extract 1-3 activity categories from this check-in. Categories should be concise (1-3 words).
Examples: "coding", "cold outreach", "content creation", "learning", "client work", "design".
Also determine if any numeric goals are mentioned (e.g., "sent 5 emails" -> goalHint: { count: 5, unit: "emails" }).`,
      },
      { role: 'user', content: checkinText },
    ],
    responseFormat: {
      type: 'json_schema',
      jsonSchema: {
        name: 'checkin_categories',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            categories: { type: 'array', items: { type: 'string' } },
            goalHints: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  count: { type: 'number' },
                  unit: { type: 'string' },
                },
                required: ['count', 'unit'],
                additionalProperties: false,
              },
            },
          },
          required: ['categories', 'goalHints'],
          additionalProperties: false,
        },
      },
    },
    stream: false,
  },
});
```

### Level-Up Celebration Embed (Subtle, Not Spammy)

```typescript
// Delivered to member's private space only. Not posted publicly.
function buildLevelUpEmbed(displayName: string, newRank: typeof RANK_PROGRESSION[number], totalXp: number): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(newRank.color)
    .setTitle(`Level Up!`)
    .setDescription(`**${displayName}**, you just hit **${newRank.name}**`)
    .addFields(
      { name: 'Total XP', value: `${totalXp.toLocaleString()}`, inline: true },
      { name: 'Next Rank', value: getNextRankInfo(totalXp), inline: true },
    )
    .setFooter({ text: 'Keep grinding.' })
    .setTimestamp();
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| node-cron 3.x `schedule()` with `scheduled: false` | node-cron 4.x `createTask()` with `timezone` option | 2025 | Cleaner API, built-in timezone, `setTime()` for dynamic rescheduling |
| date-fns-tz (separate package) | @date-fns/tz with TZDate (first-class v4) | date-fns 4.0 (2024) | TZDate works with all date-fns functions natively; 761B minimal |
| OpenRouter basic JSON mode | OpenRouter `response_format.json_schema` with `strict: true` | 2024-2025 | Guaranteed valid JSON structure, no manual parsing needed |
| discord.js Embed only | discord.js Components V2 (containers, sections) | March 2025 | Richer message layouts for briefs and level-ups, but Embeds still work and are simpler for Phase 2 |

**Deprecated/outdated:**
- `node-cron` 3.x options `scheduled` and `runOnInit` are removed in 4.x -- use `createTask()` instead
- `date-fns-tz` (third-party) still works but `@date-fns/tz` is the official replacement with date-fns v4
- discord.js v15 dev preview exists but is NOT production-ready -- stay on v14

## XP Curve Design (Claude's Discretion -- Recommended)

The existing `RANK_PROGRESSION` in `constants.ts` defines thresholds: 0, 100, 500, 2000, 5000, 15000. This is a good exponential curve that matches the "fast early, slow later" principle from game design research.

**Leveling speed analysis at recommended XP rates:**
- **Rookie -> Grinder (100 XP):** ~3-4 days of daily check-ins (25 XP/day + streak bonus). Fast -- creates early satisfaction.
- **Grinder -> Hustler (500 XP):** ~2 weeks with check-ins + a goal or two. Still achievable, members feel progress.
- **Hustler -> Boss (2000 XP):** ~1-2 months with consistent activity. Marks real commitment.
- **Boss -> Mogul (5000 XP):** ~3-4 months. Top tier requires sustained effort.
- **Mogul -> Legend (15000 XP):** ~8-12 months. Prestigious. Only the most dedicated reach this.

This curve follows the "game tutorial" principle: levels 1-2 come fast to hook the player, then each subsequent level requires meaningfully more effort.

## Streak Mechanics Design (Claude's Discretion -- Recommended)

Based on pitfall research (streak anxiety, binary collapse, Duolingo data):

**Flexible Scoring Model:**
1. Each calendar day (in member's timezone) is a "check-in window"
2. Any check-in in that window counts as an active day
3. Members get 2 grace days per week (Mon-Sun cycle) -- these are automatic, not requested
4. Missing a day beyond grace days does NOT reset the streak to zero -- it reduces the streak multiplier by one step (e.g., 1.5x -> 1.4x)
5. Only 7 consecutive days of zero activity resets the streak counter
6. "Comeback bonus" of 15 XP when a member returns after missing days

**Streak Multiplier:**
- Starts at 1.0x
- Increases by 0.1x per consecutive active day (capped at 3.0x)
- Grace days maintain current multiplier (do not increase it)
- Missing beyond grace days decreases multiplier by 0.5x per missed day (floor at 1.0x)
- Applied to check-in XP only (not goal completion XP)

## Sunday Planning Session Design (Claude's Discretion -- Recommended)

**Flow:** DM conversation pattern (same as setup-flow.ts) triggered every Sunday at 10:00am member's local time.

1. Bot sends: "Hey [name], it's planning time. Quick check -- how did last week go? (1-5, or just tell me)"
2. Member responds
3. Bot sends: "What are your goals for this week? You can set up to 5."
4. Member responds with goals (AI extracts structured goals from natural language)
5. Bot sends: "When should I remind you to check in this week? Give me times like '9am, 3pm' or 'keep the same as last week'"
6. Member responds
7. Bot confirms: summary embed with goals set, reminder times, and motivational closer

**Why conversational:** User specified "feels like sitting down with a coach, not filling out a form." The existing `runSetupFlow` DM conversation pattern + `awaitMessages` approach is the right model.

## Open Questions

1. **Check-in content encryption**
   - What we know: Raw answers in MemberProfile are encrypted. Check-in content is similarly private.
   - What's unclear: Should check-in `content` field be encrypted like `rawAnswers`? Categories are cleartext for queries.
   - Recommendation: Yes, encrypt `content` field. Add 'CheckIn' to ENCRYPTED_FIELDS map in encryption.ts. Categories stay cleartext since they are AI-extracted summaries, not raw personal text.

2. **Goal `description` encryption**
   - What we know: Goal title needs to be queryable/displayable. Description may contain personal details.
   - What's unclear: Should description be encrypted?
   - Recommendation: Encrypt `description` but keep `title` cleartext. Title is short and functional ("5 cold emails this week"). Description is where personal context lives.

3. **Member timezone collection**
   - What we know: Need timezone for streak calculations, reminders, and briefs.
   - What's unclear: When to collect timezone -- during setup, during first check-in, or via a settings command?
   - Recommendation: Default to UTC. Add `/settings timezone` command. Also prompt during Sunday planning session if timezone is still UTC. Do NOT add to initial setup flow -- it is already 6 questions.

## Sources

### Primary (HIGH confidence)
- Existing codebase: `src/modules/profile/ai-tags.ts` -- OpenRouter structured output pattern verified working
- Existing codebase: `src/modules/onboarding/setup-flow.ts` -- DM conversation pattern verified working
- Existing codebase: `src/shared/constants.ts` -- RANK_PROGRESSION already defined with thresholds
- Existing codebase: `prisma/schema.prisma` -- Schema extension patterns clear
- [OpenRouter Structured Outputs Guide](https://openrouter.ai/docs/guides/features/structured-outputs) -- JSON schema structured output with strict mode
- [DeepSeek V3.2 on OpenRouter](https://openrouter.ai/deepseek/deepseek-v3.2) -- $0.26/M input, $0.38/M output, 163K context window
- [date-fns v4 timezone support](https://blog.date-fns.org/v40-with-time-zone-support/) -- TZDate first-class timezone support
- [node-cron npm](https://www.npmjs.com/package/node-cron) -- v4.x createTask, timezone, setTime API

### Secondary (MEDIUM confidence)
- [GameDesign Math: RPG Level-based Progression](https://www.davideaversa.it/blog/gamedesign-math-rpg-level-based-progression/) -- Exponential vs logarithmic XP curves
- [Designing A Streak System UX/Psychology (Smashing Magazine, 2026)](https://www.smashingmagazine.com/2026/02/designing-streak-system-ux-psychology/) -- Flexible scoring, grace days
- [Streaks and Milestones for Gamification (Plotline)](https://www.plotline.so/blog/streaks-for-gamification-in-mobile-apps/) -- 2.3x daily engagement at 7+ day streak
- [How Streaks Leverages Gamification (Trophy)](https://trophy.so/blog/streaks-gamification-case-study) -- Streak freezes, dual system reduces 30-day churn by 35%
- [Duolingo Gamification Analysis](https://www.youngurbanproject.com/duolingo-case-study/) -- 9M+ users with 1-year streaks
- [Discord Using XP Systems](https://discord.com/safety/using-xp-systems) -- Official Discord guidance on XP system best practices

### Tertiary (LOW confidence)
- [Discord.JS-Leveling-Bot GitHub](https://github.com/roefinoavrililo/Discord.JS-Leveling-Bot) -- Open source reference for level-up role assignment pattern

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in use or established in stack research
- Architecture: HIGH -- patterns directly extend existing codebase patterns (event bus, module system, OpenRouter, DM conversations)
- XP curve design: MEDIUM -- based on game design research but untested for this specific audience; may need tuning
- Streak mechanics: MEDIUM -- based on behavioral research (Duolingo, Smashing Magazine) but novel flexible-decay approach needs validation
- Pitfalls: HIGH -- well-documented in existing PITFALLS.md research + additional behavioral science sources

**Research date:** 2026-03-20
**Valid until:** 2026-04-20 (30 days -- stack is stable, behavioral patterns are well-established)
