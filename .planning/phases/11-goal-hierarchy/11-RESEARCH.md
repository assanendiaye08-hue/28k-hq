# Phase 11: Goal Hierarchy - Research

**Researched:** 2026-03-21
**Domain:** Prisma self-referential schema refactor, cascading progress, AI-assisted decomposition
**Confidence:** HIGH

## Summary

Phase 11 is the highest-risk phase in v1.1 because it modifies the existing `Goal` model -- a model referenced across 12+ files spanning 6 modules (goals, checkin, xp, ai-assistant, data-privacy, scheduler, timer, hardening). The refactor adds optional hierarchy (parentId self-relation, timeframe enum, depth tracking) to the existing flat goal model while maintaining backward compatibility for all existing commands and module integrations.

The schema change is a Prisma self-referential one-to-many relation (`parentId` + `parent`/`children` fields) with a `GoalTimeframe` enum. Prisma does not support recursive `include` queries, but with a fixed max depth of 4 levels (yearly/quarterly/monthly/weekly), manual nested includes are trivially feasible. The DM decomposition flow reuses the established `awaitMessages` pattern from `setup-flow.ts` and `planning.ts`.

**Primary recommendation:** Work from the schema outward -- migrate the Goal model first (backward-compatible, parentId nullable), update all consuming modules to tolerate new fields, then build new features (cascading progress, tree view, decomposition) on top.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Flexible hierarchy -- any direction. /setgoal with optional parent: option nests under an existing goal. Can create top-level and add children later
- Max 4 levels: yearly, quarterly, monthly, weekly. Daily work is captured by the existing /checkin system, not a goal level
- Jarvis proactively suggests decomposition when it notices a member could benefit ("Want me to help break that down into smaller goals?") -- not forced
- Decomposition via DM conversation: Jarvis asks clarifying questions, suggests sub-goals, member approves/edits, goals created automatically
- Existing v1.0 flat goals become standalone top-level goals with no parent (parentId: null)
- All existing /goals, /setgoal, /progress, /completegoal commands continue working exactly as before for standalone goals
- New hierarchy features are purely additive -- nothing breaks for members who don't use nesting

### Claude's Discretion
- Cascading mechanics (percentage vs manual)
- Expired child handling
- Tree visualization format and location
- How /goals command adapts (show flat for standalone users, tree for nested users)
- Prisma schema changes (self-referential parentId on Goal model, timeframe enum)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| GOAL-01 | Member can set goals at any level (yearly, quarterly, monthly, weekly, daily) -- optional depth, not forced | Prisma GoalTimeframe enum, /setgoal extended with `parent` and `timeframe` options, standalone goals unaffected |
| GOAL-02 | Child goals cascade progress to parent goals -- completing a weekly goal updates the monthly goal it belongs to | Percentage-based cascading from children, recalculated on child completion/progress events |
| GOAL-03 | Jarvis can help decompose a big goal into smaller sub-goals through a conversational DM flow | awaitMessages DM pattern (established in setup-flow.ts, planning.ts), AI structured output for sub-goal extraction |
| GOAL-04 | Member can view their goal tree showing the hierarchy and progress at each level | /goals tree subcommand with nested Prisma include (max 4 levels), indented text embed with progress bars |

</phase_requirements>

## Standard Stack

### Core (Already in Project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @prisma/client | ^7.5.0 | Self-referential Goal relation, queries | Already used everywhere, supports self-relations natively |
| discord.js | ^14.25.1 | Slash commands, embeds, DM conversations, autocomplete | Already used everywhere |
| date-fns | ^4.1.0 | Deadline calculation for timeframe-based goals | Already used in goals/commands.ts |
| @date-fns/tz | ^1.4.1 | Timezone-aware date calculations | Already used in scheduler |

### Supporting (Already in Project)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @openrouter/sdk | ^0.9.11 | AI-assisted decomposition (via callAI) | Decomposition DM flow, proactive suggestions |
| winston | ^3.19.0 | Logging | Standard project logger |

### No New Dependencies Needed
This phase requires zero new packages. All functionality is achievable with the existing stack.

## Architecture Patterns

### Recommended Project Structure (Changes Only)
```
prisma/
  schema.prisma              # Add parentId, timeframe, depth to Goal model
src/modules/goals/
  commands.ts                # Extend /setgoal with parent+timeframe options, /goals tree subcommand
  index.ts                   # Register new autocomplete handlers
  expiry.ts                  # Update to handle parent goals with children
  hierarchy.ts               # NEW: cascading progress logic, tree building
  decompose.ts               # NEW: Jarvis DM decomposition flow
```

### Pattern 1: Self-Referential Prisma Relation
**What:** Add `parentId`, `parent`, and `children` fields to the Goal model
**When to use:** The core schema change that enables the entire hierarchy

```prisma
// Source: https://www.prisma.io/docs/orm/prisma-schema/data-model/relations/self-relations
model Goal {
  // ... existing fields unchanged ...

  // Phase 11: Goal Hierarchy
  parentId    String?        // FK to parent goal (null = standalone/top-level)
  timeframe   GoalTimeframe? // Timeframe level (null = legacy standalone)
  depth       Int            @default(0) // 0 = top-level, 1-3 = nested depth

  parent      Goal?          @relation("GoalHierarchy", fields: [parentId], references: [id], onDelete: SetNull)
  children    Goal[]         @relation("GoalHierarchy")

  // ... existing relations unchanged ...

  @@index([parentId])  // NEW: fast child lookups
}

enum GoalTimeframe {
  YEARLY
  QUARTERLY
  MONTHLY
  WEEKLY
}
```

**Key decisions in the schema:**
- `parentId` is nullable -- existing goals become standalone (null) with zero migration effort
- `timeframe` is nullable -- existing goals keep null, new hierarchical goals get a timeframe
- `depth` is Int @default(0) -- enforced in application code (max 3, i.e., 4 levels: 0-3)
- `onDelete: SetNull` -- if a parent is deleted/cancelled, children become standalone rather than being deleted. This is safer than Cascade for user data.
- Named relation `"GoalHierarchy"` required for self-referential disambiguation

### Pattern 2: Fixed-Depth Nested Include (Tree Queries)
**What:** Query full goal tree using manually nested Prisma includes
**When to use:** /goals tree, Jarvis context assembly, brief data

Prisma does not support recursive includes. With max 4 levels, use fixed-depth nesting:

```typescript
// Load full tree for a member (4 levels deep)
const goals = await db.goal.findMany({
  where: {
    memberId,
    parentId: null, // Top-level goals only
    status: { in: ['ACTIVE', 'EXTENDED'] },
  },
  include: {
    children: {
      include: {
        children: {
          include: {
            children: true, // Level 3 (weekly under monthly under quarterly under yearly)
          },
        },
      },
    },
  },
  orderBy: { deadline: 'asc' },
});
```

This is a well-known pattern for fixed-depth Prisma trees. Build a reusable `goalTreeInclude` constant to keep it DRY.

### Pattern 3: DM Conversation Flow (awaitMessages)
**What:** Multi-turn DM conversation for goal decomposition
**When to use:** Jarvis-assisted decomposition (/decompose command or proactive suggestion)

```typescript
// Follows the exact pattern from scheduler/planning.ts and onboarding/setup-flow.ts
async function awaitResponse(dm: DMChannel, authorId: string): Promise<string | null> {
  try {
    const collected = await dm.awaitMessages({
      filter: (msg: Message) => msg.author.id === authorId,
      max: 1,
      time: 5 * 60 * 1000, // 5-minute timeout
      errors: ['time'],
    });
    return collected.first()?.content ?? null;
  } catch {
    return null;
  }
}
```

### Pattern 4: Percentage-Based Cascading Progress (Recommended)
**What:** Parent goal progress is automatically computed from children's completion status
**When to use:** When any child goal is completed, has progress updated, or status changes

```typescript
// Cascading logic in hierarchy.ts
async function recalculateParentProgress(
  db: ExtendedPrismaClient,
  parentId: string,
  events: IEventBus,
): Promise<void> {
  const parent = await db.goal.findUnique({
    where: { id: parentId },
    include: { children: true },
  });
  if (!parent || parent.children.length === 0) return;

  // Only count active/completed children (not cancelled/missed)
  const countable = parent.children.filter(c =>
    ['ACTIVE', 'EXTENDED', 'COMPLETED'].includes(c.status)
  );
  if (countable.length === 0) return;

  const completedCount = countable.filter(c => c.status === 'COMPLETED').length;

  // For measurable parent: set currentValue as percentage (0-100)
  // For freetext parent: track completion ratio
  const percentage = Math.round((completedCount / countable.length) * 100);

  // Update parent progress
  await db.goal.update({
    where: { id: parentId },
    data: { currentValue: percentage },
  });

  // Auto-complete parent if all children are complete
  if (completedCount === countable.length) {
    // Parent auto-completes -- award XP, emit event
    // ...
  }

  // Recurse up the tree
  if (parent.parentId) {
    await recalculateParentProgress(db, parent.parentId, events);
  }
}
```

**Recommended cascading mechanics (Claude's Discretion):**
- Parent progress = (completed children / countable children) * 100
- Expired/cancelled children are excluded from the ratio (remaining children recalculate)
- When all countable children complete, parent auto-completes
- Cascading recurses up the tree (child completes -> monthly updates -> quarterly updates -> yearly updates)
- XP is awarded per-goal on completion (not double-counted from parent)

### Pattern 5: Proactive Decomposition Suggestion
**What:** Jarvis suggests decomposition when contextually appropriate
**When to use:** In the buildSystemPrompt/buildMemberContext when goals have long timeframes and no children

```typescript
// Add to personality.ts or a new instruction section
const DECOMPOSITION_INSTRUCTION = `If the member has a yearly or quarterly goal with no sub-goals, and you sense they could benefit from breaking it down, naturally suggest: "Want me to help break that down into smaller goals? Just say 'decompose [goal name]' or I can start the conversation." Don't force it -- offer once, respect their choice.`;
```

### Anti-Patterns to Avoid
- **Recursive DB queries in a loop:** Never query child goals one-by-one. Always use nested includes or fetch all member goals in one query and build the tree in memory.
- **Cascade delete on self-relation:** Use SetNull, not Cascade. If a parent goal is deleted, children should become standalone, not be silently deleted.
- **Modifying existing command signatures:** Keep /setgoal, /goals, /progress, /completegoal backward-compatible. Add optional params, don't remove or rename existing ones.
- **Storing computed parent progress in a separate table:** Just use `currentValue` on the parent goal itself. A parent with children gets its currentValue from cascading, not from manual /progress updates.
- **AI-dependent tree rendering:** The tree view must work without AI (use structured embed formatting), never depend on an AI call to render the tree.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tree data structure | Custom tree class | Prisma nested include + recursive in-memory formatting | Fixed depth of 4 makes Prisma include trivially sufficient |
| Progress bar rendering | New progress bar code | Existing `buildProgressBar()` from goals/commands.ts | Already handles measurable goals, just add indentation for tree |
| DM conversation flow | Custom message listener | `awaitMessages` pattern from setup-flow.ts / planning.ts | Battle-tested, handles timeouts, filters by author |
| AI-assisted goal extraction | Custom NLP | `callAI` with json_schema structured output | Same pattern as planning.ts `extractGoalsFromText` |
| Deadline calculation | Custom date math | Existing `parseDeadline()` + date-fns | Already supports "end of week", "3 months", etc. |

**Key insight:** The project already has every building block needed -- the work is integration and careful refactoring, not greenfield development.

## Common Pitfalls

### Pitfall 1: Breaking Existing Goal Queries Across Modules
**What goes wrong:** Adding `parentId`/`children` to the Goal model breaks existing queries that don't expect these fields, or worse, changes the behavior of existing `findMany` to inadvertently include/exclude goals.
**Why it happens:** 12+ files query the Goal model. Any query that doesn't filter by `parentId: null` will start returning child goals mixed with top-level goals.
**How to avoid:** Phase 1 of the plan must identify EVERY file that queries `db.goal.*` and verify backward compatibility. Most existing queries already filter by `memberId + status` which is fine -- child goals have the same memberId and status. The `/goals` command is the main one that needs to adapt (show standalone goals flat, show hierarchical goals as trees).
**Warning signs:** After schema change, existing /goals command shows child goals as separate entries alongside their parent. Test /goals before and after to catch this.

### Pitfall 2: Encryption Extension on New Fields
**What goes wrong:** The encryption extension in `db/encryption.ts` has a hardcoded map (`ENCRYPTED_FIELDS`) listing which fields are encrypted on each model. New fields on Goal that should be encrypted (e.g., description) are already handled, but adding NEW text fields that aren't in the encrypted fields map would store them in cleartext.
**Why it happens:** Forgetting to update `ENCRYPTED_FIELDS` when adding new string fields to an encrypted model.
**How to avoid:** The new fields (`parentId`, `timeframe`, `depth`) are not personal text data -- they are structural metadata and should NOT be encrypted. No changes needed to encryption.ts. But document this decision explicitly.

### Pitfall 3: Goal Expiry with Hierarchy
**What goes wrong:** The `checkExpiredGoals()` function in `expiry.ts` and `runRecoveryChecks()` in `hardening/recovery.ts` currently mark expired ACTIVE goals as MISSED or EXTENDED. If a parent goal has active children, expiring the parent independently creates an orphaned state where children are active but parent is MISSED.
**Why it happens:** Expiry logic doesn't know about hierarchy.
**How to avoid:** When expiring a parent goal, either also expire its children (cascade expiry down) or only expire leaf goals and let parent status follow children. Recommendation: expire leaf goals normally, and parent status is always derived from children -- a parent is "MISSED" only if all its children are missed/cancelled, not by deadline alone.

### Pitfall 4: XP Double-Counting
**What goes wrong:** Completing a child goal awards XP, then cascading completion of the parent awards XP again for the "same work."
**Why it happens:** Goal completion XP is awarded in `commands.ts` when a goal's status changes to COMPLETED.
**How to avoid:** Award XP for each individual goal completion (child and parent separately) -- this is intentional and correct. Setting a parent goal IS additional work/planning. But reduce parent auto-completion XP to be smaller than manually completing a goal (e.g., 50 XP for auto-completed parent vs 100 for manual). Document the XP policy clearly.

### Pitfall 5: Timer goalId References
**What goes wrong:** TimerSession.goalId references a Goal by ID. If hierarchy changes Goal IDs or the goal is a parent, the timer session's goalId reference could point to a goal that no longer makes sense.
**Why it happens:** Timer sessions link to goals via a plain string goalId (no FK constraint).
**How to avoid:** No change needed -- goalId is a plain string reference, not a foreign key. Parent goals don't lose their IDs. Timer sessions should link to leaf goals (the specific work being done), which is the natural behavior.

### Pitfall 6: Data Export Missing Hierarchy Fields
**What goes wrong:** The `exportMemberData()` function in `data-privacy/exporter.ts` exports goals but doesn't include the new hierarchy fields (parentId, timeframe, depth, children).
**Why it happens:** The export function has a hardcoded field mapping for goals.
**How to avoid:** Update `exporter.ts` to include `parentId`, `timeframe`, and `depth` in the goal export. Include children as nested objects or as a flat list with parentId references.

### Pitfall 7: AI Context Assembly Missing Hierarchy
**What goes wrong:** `buildMemberContext()` in `memory.ts` and `buildStatsSection()` in `personality.ts` both display goals as flat lists. After hierarchy is added, Jarvis doesn't understand goal relationships.
**Why it happens:** These functions query active goals and display them linearly.
**How to avoid:** Update both functions to show goals with hierarchy context. E.g., indent children under parents, or annotate "sub-goal of [parent title]". This is essential for Jarvis to provide meaningful advice about goal progress.

### Pitfall 8: /progress on Parent Goals
**What goes wrong:** A member tries to use /progress to manually update a parent goal's currentValue, but the cascading logic immediately overwrites it based on children's status.
**Why it happens:** Parent goals with children derive their progress from children, but /progress allows manual updates.
**How to avoid:** In the /progress handler, check if the goal has children. If it does, block manual progress updates with a message like "This goal's progress is calculated from its sub-goals. Update your sub-goals instead." Allow /progress only on leaf goals or standalone goals.

## Code Examples

### Schema Migration (Prisma)
```prisma
// Add to existing Goal model in prisma/schema.prisma
model Goal {
  id           String         @id @default(cuid())
  memberId     String
  title        String
  description  String?
  type         GoalType
  targetValue  Int?
  currentValue Int            @default(0)
  unit         String?
  status       GoalStatus     @default(ACTIVE)
  deadline     DateTime
  xpAwarded    Int            @default(0)
  createdAt    DateTime       @default(now())
  completedAt  DateTime?
  extendedAt   DateTime?

  // Phase 11: Goal Hierarchy
  parentId     String?
  timeframe    GoalTimeframe?
  depth        Int            @default(0)

  parent       Goal?          @relation("GoalHierarchy", fields: [parentId], references: [id], onDelete: SetNull)
  children     Goal[]         @relation("GoalHierarchy")

  member Member @relation(fields: [memberId], references: [id], onDelete: Cascade)

  @@index([memberId, status])
  @@index([deadline, status])
  @@index([parentId])
}

enum GoalTimeframe {
  YEARLY
  QUARTERLY
  MONTHLY
  WEEKLY
}
```

### Extended /setgoal Command
```typescript
// Add to buildSetgoalCommand() in commands.ts
cmd.addStringOption((opt) =>
  opt
    .setName('parent')
    .setDescription('Nest under an existing goal')
    .setRequired(false)
    .setAutocomplete(true),
);
cmd.addStringOption((opt) =>
  opt
    .setName('timeframe')
    .setDescription('Goal timeframe')
    .setRequired(false)
    .addChoices(
      { name: 'Yearly', value: 'YEARLY' },
      { name: 'Quarterly', value: 'QUARTERLY' },
      { name: 'Monthly', value: 'MONTHLY' },
      { name: 'Weekly', value: 'WEEKLY' },
    ),
);
```

### Tree View Rendering
```typescript
// Indented text embed for /goals tree
function renderGoalTree(
  goals: GoalWithChildren[],
  indent: number = 0,
): string {
  const lines: string[] = [];
  const prefix = '  '.repeat(indent);
  const connector = indent > 0 ? '|- ' : '';

  for (const goal of goals) {
    const timeframeTag = goal.timeframe ? `[${goal.timeframe}] ` : '';
    const statusBadge = goal.status === 'EXTENDED' ? ' [EXT]' : '';

    let progressStr: string;
    if (goal.children && goal.children.length > 0) {
      // Parent: show child-derived percentage
      const completed = goal.children.filter(c => c.status === 'COMPLETED').length;
      progressStr = `${completed}/${goal.children.length} sub-goals`;
    } else if (goal.type === 'MEASURABLE' && goal.targetValue) {
      progressStr = `${goal.currentValue}/${goal.targetValue} ${goal.unit ?? ''}`;
    } else {
      progressStr = goal.status;
    }

    lines.push(`${prefix}${connector}${timeframeTag}${goal.title}: ${progressStr}${statusBadge}`);

    if (goal.children && goal.children.length > 0) {
      lines.push(renderGoalTree(goal.children, indent + 1));
    }
  }

  return lines.join('\n');
}
```

### Decomposition DM Flow (AI-Assisted)
```typescript
// Follows scheduler/planning.ts pattern
async function runDecompositionFlow(
  client: Client,
  db: ExtendedPrismaClient,
  memberId: string,
  goalId: string,
  events: IEventBus,
): Promise<void> {
  const goal = await db.goal.findUniqueOrThrow({
    where: { id: goalId },
    include: { member: { include: { accounts: { take: 1 }, schedule: true } } },
  });

  // Open DM
  const discordId = goal.member.accounts[0].discordId;
  const user = await client.users.fetch(discordId);
  const dm = await user.createDM();

  // Step 1: Ask about breakdown
  await dm.send(
    `Let's break down "${goal.title}" into smaller goals.\n\n` +
    `What timeframe makes sense for the sub-goals? (quarterly, monthly, or weekly)`
  );

  const timeframeResponse = await awaitResponse(dm, discordId);
  if (!timeframeResponse) { /* timeout handling */ return; }

  // Step 2: Use AI to suggest sub-goals
  const result = await callAI(db, {
    memberId,
    feature: 'planning',
    messages: [
      { role: 'system', content: `Break down this goal into 2-5 sub-goals...` },
      { role: 'user', content: `Goal: ${goal.title}\nTimeframe: ${timeframeResponse}` },
    ],
    responseFormat: { /* json_schema for sub-goals */ },
  });

  // Step 3: Present suggestions, let member edit/approve
  // Step 4: Create sub-goals linked to parent
}
```

## Cross-Cutting Impact Map

**This is the critical reference for the planner.** Every file that touches the Goal model:

| File | How It Uses Goal | Change Needed |
|------|------------------|---------------|
| `prisma/schema.prisma` | Goal model definition | Add parentId, timeframe, depth, parent, children, GoalTimeframe enum, @@index |
| `src/modules/goals/commands.ts` | /setgoal, /goals, /progress, /completegoal handlers + autocomplete | Add parent+timeframe to /setgoal, tree view to /goals, block /progress on parents with children |
| `src/modules/goals/index.ts` | Module registration, autocomplete routing | Add autocomplete for parent option, register new subcommands |
| `src/modules/goals/expiry.ts` | checkExpiredGoals -- marks expired goals MISSED/EXTENDED | Consider hierarchy: only expire leaf goals, parent status follows |
| `src/modules/goals/hierarchy.ts` | **NEW** | Cascading progress, tree query helpers, depth validation |
| `src/modules/goals/decompose.ts` | **NEW** | Jarvis DM decomposition conversation flow |
| `src/modules/ai-assistant/memory.ts` | buildMemberContext -- lists active goals | Update to show hierarchy (indent children, show timeframes) |
| `src/modules/ai-assistant/personality.ts` | buildStatsSection -- lists active goals | Update to show hierarchy context |
| `src/modules/ai-assistant/nudge.ts` | References goal titles in nudge messages | No change needed (titles still work) |
| `src/modules/ai-assistant/chat.ts` | Calls assembleContext + buildSystemPrompt | No direct change (inherits from memory.ts + personality.ts updates) |
| `src/modules/ai-assistant/index.ts` | DM handler for natural language | May add decomposition intent detection ("break down my yearly goal") |
| `src/modules/scheduler/briefs.ts` | sendBrief -- queries active goals for morning brief | Update MemberBriefData type to include hierarchy info |
| `src/modules/scheduler/planning.ts` | Sunday planning -- creates weekly goals | Consider linking new weekly goals to existing monthly/quarterly parents |
| `src/modules/data-privacy/exporter.ts` | exportMemberData -- exports all goals | Add parentId, timeframe, depth to export |
| `src/modules/data-privacy/deleter.ts` | hardDeleteMember -- cascades via Member delete | No change needed (onDelete: Cascade on Member handles it) |
| `src/modules/hardening/recovery.ts` | runRecoveryChecks -- marks expired goals MISSED | Update to be hierarchy-aware (same consideration as expiry.ts) |
| `src/modules/timer/commands.ts` | /timer start goal option -- autocomplete active goals | No change needed (autocomplete queries by memberId+status) |
| `src/modules/timer/session.ts` | persistTimerSession -- stores goalId | No change needed (goalId is a plain string) |
| `src/modules/xp/constants.ts` | XP_AWARDS.goal values | Consider adding parent auto-complete XP value |
| `src/modules/xp/engine.ts` | awardXP function | No change needed |
| `src/modules/checkin/ai-categories.ts` | GoalHint extraction from check-ins | No change needed (goal hints are title-based) |
| `src/modules/profile/ai-tags.ts` | Profile goals (separate from Goal model) | No change needed (different concept) |
| `src/core/events.ts` | goalCompleted, goalProgressUpdated events | No change needed (events carry goalId, not structure) |
| `src/deploy-commands.ts` | Registers slash commands | Redeploy commands after /setgoal changes |
| `src/db/encryption.ts` | ENCRYPTED_FIELDS map for Goal model | No change needed (new fields are structural, not personal text) |

## Recommendations for Discretion Areas

### Cascading Mechanics: Percentage-Based (RECOMMENDED)
- Parent `currentValue` = percentage of completed countable children (0-100)
- Countable = children with status ACTIVE, EXTENDED, or COMPLETED (not MISSED, CANCELLED)
- When expired/cancelled children are removed from the count, remaining children recalculate
- When all countable children complete (100%), parent auto-completes
- XP on auto-complete: 50 XP (half of manual complete) to reward planning without double-counting

### Expired Child Handling: Exclude from Parent Ratio (RECOMMENDED)
- MISSED/CANCELLED children are excluded from the parent's completion ratio
- If a parent has 3 children and 1 is cancelled, the parent needs 2/2 = 100% of remaining to auto-complete
- If ALL children are expired/cancelled, parent stays at its current status (does not auto-complete or auto-fail)

### Tree Visualization: Indented Text Embed (RECOMMENDED)
- `/goals` shows flat list for members with no hierarchy (backward compatible)
- `/goals tree` shows full tree with indentation and progress at each level
- Use Discord embed with monospace-like formatting:
```
[YEARLY] Build a SaaS product: 1/3 sub-goals
  |- [QUARTERLY] Launch MVP by June: 2/4 sub-goals
  |  |- [MONTHLY] Design landing page: COMPLETED
  |  |- [MONTHLY] Build auth system: 3/5 endpoints
  |  |- [MONTHLY] Set up payments: ACTIVE
  |  |- [MONTHLY] Beta test with 10 users: 0/10 users
  |- [QUARTERLY] Get 100 paying users: 0/100 users
  |- [QUARTERLY] Hit $1K MRR: ACTIVE
```
- Keep it ephemeral (personal data)

### /goals Command Adaptation (RECOMMENDED)
- `/goals` (no args): show standalone goals flat (backward compatible), show top-level goals of trees with child count
- `/goals tree`: show full tree with all nested goals
- This way existing members see no change, hierarchy users get the tree view on demand

## State of the Art

| Old Approach (v1.0) | New Approach (v1.1 Phase 11) | Impact |
|---------------------|------------------------------|--------|
| Flat goals with no nesting | Optional hierarchy with parentId | Goals can be organized but don't have to be |
| Manual progress tracking only | Cascading progress from children | Parent goals update automatically |
| Manual goal creation only | AI-assisted decomposition | Jarvis helps break big goals into manageable pieces |
| Flat goal list display | Tree view with progress at each level | Visual hierarchy of goals |
| No timeframe tracking | GoalTimeframe enum | Goals have explicit timeframe context |

## Open Questions

1. **Should the Sunday planning session auto-link new weekly goals to existing monthly goals?**
   - What we know: `planning.ts` creates weekly goals during Sunday planning
   - What's unclear: Should it detect if the member has active monthly goals and offer to link?
   - Recommendation: In a future iteration, not in initial Phase 11. Keep planning session changes minimal.

2. **What deadline should auto-derive for timeframe-based goals?**
   - What we know: YEARLY = end of year, QUARTERLY = end of quarter, etc.
   - What's unclear: Should the user still manually set deadlines, or should timeframe auto-set them?
   - Recommendation: Timeframe provides a suggested deadline but user can override. If no deadline given and timeframe is set, auto-calculate (endOfYear, endOfQuarter, endOfMonth, endOfWeek).

3. **Should the decomposition be a slash command or purely DM-triggered?**
   - What we know: CONTEXT.md says "DM conversation" and "proactive suggestion"
   - What's unclear: Should there also be a `/decompose` slash command?
   - Recommendation: Both. A `/decompose` command for intentional use + natural language detection in DM handler ("break down my yearly goal") for conversational access. Proactive suggestion lives in the AI personality prompt.

## Sources

### Primary (HIGH confidence)
- [Prisma Self-Relations Documentation](https://www.prisma.io/docs/orm/prisma-schema/data-model/relations/self-relations) - One-to-many self-relation schema pattern
- [Prisma One-to-Many Relations](https://www.prisma.io/docs/orm/prisma-schema/data-model/relations/one-to-many-relations) - Foreign key and referential action patterns
- Project codebase (all files listed in Cross-Cutting Impact Map) - Current Goal model usage across 12+ files

### Secondary (MEDIUM confidence)
- [Prisma Recursive Tree Queries Discussion](https://github.com/prisma/prisma/issues/3725) - Confirmed no recursive include support; manual nesting needed
- [Prisma Nested Children Discussion](https://github.com/prisma/prisma/discussions/16817) - Fixed-depth include pattern validation

### Tertiary (LOW confidence)
- None -- all findings verified with official docs and codebase.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All tools already in the project, zero new dependencies
- Architecture: HIGH - Self-referential relation is textbook Prisma, DM patterns reuse existing code
- Pitfalls: HIGH - Identified through exhaustive codebase mapping of every file touching Goal model
- Cascading mechanics: MEDIUM - Recommended approach, but implementation details TBD

**Research date:** 2026-03-21
**Valid until:** 2026-04-21 (stable -- Prisma 7 relation patterns unlikely to change)
