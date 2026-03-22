# Phase 11: Goal Hierarchy - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Refactor existing flat Goal model to support optional multi-level hierarchy (yearly→quarterly→monthly→weekly, max 4 levels), cascading progress from child→parent, Jarvis-assisted goal decomposition via DM, and a tree view. Existing flat goals continue working as standalone top-level goals. Daily layer is the existing check-in system, not a separate goal level.

</domain>

<decisions>
## Implementation Decisions

### Hierarchy Creation
- Flexible — any direction. /setgoal with optional parent: option nests under an existing goal. Can create top-level and add children later
- Max 4 levels: yearly → quarterly → monthly → weekly. Daily work is captured by the existing /checkin system, not a goal level
- Jarvis proactively suggests decomposition when it notices a member could benefit ("Want me to help break that down into smaller goals?") — not forced
- Decomposition via DM conversation: Jarvis asks clarifying questions, suggests sub-goals, member approves/edits, goals created automatically

### Progress Cascading
- Claude's discretion on exact mechanics (recommend: percentage-based, auto-complete parent at 100%)
- Claude's discretion on handling expired/cancelled children (recommend: don't count toward parent, remaining children recalculate)

### Goal Tree Visualization
- Claude's discretion on format (recommend: indented text with progress bars in embed, /goals tree subcommand, ephemeral)

### Backward Compatibility
- Existing v1.0 flat goals become standalone top-level goals with no parent (parentId: null)
- All existing /goals, /setgoal, /progress, /completegoal commands continue working exactly as before for standalone goals
- New hierarchy features are purely additive — nothing breaks for members who don't use nesting

### Claude's Discretion
- Cascading mechanics (percentage vs manual)
- Expired child handling
- Tree visualization format and location
- How /goals command adapts (show flat for standalone users, tree for nested users)
- Prisma schema changes (self-referential parentId on Goal model, timeframe enum)

</decisions>

<specifics>
## Specific Ideas

- "Daily goals are more or less integrated into the weekly goals" — correct. The daily layer is the check-in system. Weekly goals are the lowest goal level. Check-ins feed progress to weekly goals.
- Jarvis should let members know it can help decompose goals when it notices they might benefit — not a forced prompt
- This is the highest-risk phase (modifies existing Goal model across 4+ modules). Backward compatibility is critical.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 11-goal-hierarchy*
*Context gathered: 2026-03-21*
