# Phase 18: Flowmodoro + Goals Editing - Research

**Researched:** 2026-03-22
**Domain:** Timer mode extension (count-up flowmodoro) + Goal CRUD UI
**Confidence:** HIGH

## Summary

Phase 18 adds two features to the existing desktop app: (1) a flowmodoro timer mode that counts up instead of down, with auto-calculated breaks based on a work-to-break ratio, and (2) goal CRUD operations (create, update progress, complete) from the desktop app.

The flowmodoro feature extends the existing Phase 17 timer architecture. The Prisma schema already has `TimerMode.PROPORTIONAL` and `breakRatio` on `TimerSession`. The API already accepts `mode: 'PROPORTIONAL'` and `breakRatio` in POST /timer. The timer store needs a parallel "flowmodoro" mode path where the timer counts UP (elapsed time display) instead of DOWN (countdown). When the user stops working, break duration = workTimeMs / breakRatio.

The goals editing feature builds on existing API endpoints (POST /goals, PATCH /goals/:id) which already exist with full validation, depth enforcement, and XP award on completion. The desktop app currently has a read-only GoalTree/GoalNode. This phase adds create goal form, progress update UI, and complete action -- all calling existing API endpoints.

**Primary recommendation:** Add a `timerMode: 'pomodoro' | 'flowmodoro'` field to the timer store. The TimerSetup component gets a mode toggle. Flowmodoro mode uses a simplified start config (no work/break duration, no sessions -- just focus + ratio). The tick hook counts UP for flowmodoro. Break auto-calculation happens at pause/stop. Goals editing uses inline actions on GoalNode plus a create form modal/panel.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FLW-01 | User can start a running timer that counts up (no fixed duration) | Timer store needs `timerMode` field; start action sets `phaseDurationMs` to Infinity or uses elapsed-only tracking |
| FLW-02 | User can configure work-to-break ratio (default 5:1) | `TIMER_DEFAULTS.defaultBreakRatio` already exists (value: 5); store needs `breakRatio` config field |
| FLW-03 | When user pauses/stops work, break duration is auto-calculated from ratio | `breakDurationMs = totalWorkedMs / breakRatio`; triggers transition to break |
| FLW-04 | Running timer displays in menu bar (elapsed time, not countdown) | `updateTrayTitle()` needs to accept elapsed time display mode (count up from 0) |
| FLW-05 | Same popover controls as pomodoro (pause/stop/change focus) | Existing TimerControls component works as-is; TimerDisplay needs mode-aware rendering |
| FLW-06 | Session data syncs to API on completion | API already accepts `mode: 'PROPORTIONAL'`; stop action sends `totalWorkedMs` |
| GOAL-03 | User can create a new goal from the desktop app | API POST /goals exists with full validation; need create form UI |
| GOAL-04 | User can update progress on a measurable goal | API PATCH /goals/:id with `currentValue` exists; need inline progress UI |
| GOAL-05 | User can mark a goal as complete (triggers XP award) | API PATCH /goals/:id with `status: 'COMPLETED'` exists with XP award; need complete action button |
</phase_requirements>

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zustand | (installed) | Timer + goals state management | Already used for timer-store, goals-store |
| @tauri-apps/api | v2 | Tray, window, events | Already used throughout |
| @tauri-apps/plugin-store | v2 | Timer persistence | Already used for timer state |
| @28k/shared | internal | TIMER_DEFAULTS, XP_AWARDS | Already used, has defaultBreakRatio |
| zod | (installed) | API request validation | Already used in API routes |

### No New Libraries Needed
This phase extends existing patterns. No new dependencies required.

## Architecture Patterns

### Flowmodoro Timer Store Extension

The timer store (`timer-store.ts`) needs these additions:

1. **New field: `timerMode: 'pomodoro' | 'flowmodoro'`** -- determines behavior of start, completePhase, tray display
2. **New field: `breakRatio: number`** -- stored on config, default from TIMER_DEFAULTS.defaultBreakRatio (5)
3. **Modified `start()` action** -- in flowmodoro mode: no phaseDurationMs (or set to MAX_SAFE_INTEGER), mode='PROPORTIONAL' in API call
4. **New computed: `getElapsedMs()`** -- for flowmodoro display: `Date.now() - phaseStartedAt`
5. **Modified `completePhase()`** -- in flowmodoro mode, work completion calculates break as `totalWorkedMs / breakRatio`, then transitions to countdown break
6. **Modified `stop()`** -- in flowmodoro, stopping during work triggers break calculation offer; stopping during break ends session

### Flowmodoro Timer Flow
```
idle -> [start flowmodoro] -> working (counting UP)
  -> [user stops work] -> transition (show calculated break offer)
    -> [start break] -> on_break (counting DOWN, calculated duration)
      -> [break ends] -> transition (session complete or continue?)
        -> [continue] -> working (counting UP again)
        -> [done] -> idle (API sync with XP)
    -> [skip break] -> idle (API sync)
```

### Key Difference from Pomodoro
| Aspect | Pomodoro | Flowmodoro |
|--------|----------|------------|
| Work phase | Countdown (fixed duration) | Count-up (user decides when to stop) |
| Break duration | Fixed (configured) | Calculated: workTime / ratio |
| phaseDurationMs | Set on start | Not applicable for work; set for break |
| Tray display | Countdown MM:SS | Elapsed MM:SS (or H:MM:SS) |
| Sessions | Configurable count | Single session (no chaining) |
| Long breaks | Every N sessions | Not applicable |
| getRemainingMs | Used for countdown | Not used during work; used during break |

### Count-Up Tick Hook Extension

The `useTimerTick` hook needs mode awareness:
- **Pomodoro mode:** Current behavior (countdown, `getRemainingMs()`)
- **Flowmodoro mode during work:** Count UP using `getElapsedMs()`, display as elapsed time
- **Flowmodoro mode during break:** Count DOWN (same as pomodoro break)

### Tray Title for Flowmodoro

`updateTrayTitle()` currently shows countdown. For flowmodoro work phase, it shows elapsed time counting up. Two approaches:
1. **Recommended:** Add an `elapsed` parameter variant: `updateTrayTitle(remainingMs, { mode: 'elapsed' })` or a separate `updateTrayTitleElapsed(elapsedMs)`
2. The tray formatting logic is identical (H:MM:SS) -- only the semantics change (elapsed vs remaining)

### TimerSetup Mode Toggle

The TimerSetup form needs a Pomodoro/Flowmodoro mode selector (segmented control or tab). In flowmodoro mode:
- **Show:** Focus field, break ratio slider/input (default 5:1)
- **Hide:** Work duration, break duration, long break, sessions, auto-start toggles
- Focus field remains required (TMR-05 applies to both modes)

### Timer Display Mode Awareness

TimerDisplay needs to handle flowmodoro:
- **Work phase:** Show elapsed time counting UP, no progress ring (or fill-up ring), phase label "Flow"
- **Break phase:** Show countdown (calculated duration), progress ring draining, phase label "Break"
- **No session dots** (flowmodoro has no session concept)

### Goals Store Extension

The goals store (`goals-store.ts`) needs CRUD actions:

```typescript
interface GoalsState {
  // ... existing fields
  createGoal: (data: CreateGoalData) => Promise<void>;
  updateProgress: (goalId: string, currentValue: number) => Promise<void>;
  completeGoal: (goalId: string) => Promise<{ xpAwarded: number }>;
}
```

### Goals UI Components

1. **CreateGoalForm** -- form/modal for new goal creation
   - Fields: title, type (measurable/freetext), targetValue+unit (if measurable), timeframe, deadline, parentId (optional)
   - Calls POST /goals, then refreshes goal list

2. **GoalNode actions** -- inline buttons on each goal row
   - Progress update: small +/- buttons or inline input for measurable goals
   - Complete: checkmark button that calls PATCH with `status: 'COMPLETED'`
   - These appear on hover or as always-visible small icons

3. **GoalsPage "Add Goal" button** -- opens the create form

### Recommended Project Structure (additions only)
```
apps/desktop/src/
  components/
    timer/
      TimerSetup.tsx          # Modified: add mode toggle, flowmodoro config
      TimerDisplay.tsx         # Modified: mode-aware display (count-up vs countdown)
      FlowmodoroDisplay.tsx    # NEW: flowmodoro-specific display (optional, could be inline)
    goals/
      GoalNode.tsx             # Modified: add action buttons (progress, complete)
      GoalTree.tsx             # Unchanged
      CreateGoalForm.tsx       # NEW: goal creation form
  stores/
    timer-store.ts             # Modified: timerMode, breakRatio, flowmodoro logic
    goals-store.ts             # Modified: createGoal, updateProgress, completeGoal
  hooks/
    use-timer-tick.ts          # Modified: mode-aware tick (count-up for flowmodoro)
  lib/
    timer-tray.ts              # Modified: support elapsed time display
    timer-persistence.ts       # Modified: persist timerMode, breakRatio
```

### Anti-Patterns to Avoid
- **Separate flowmodoro store:** Do NOT create a second store. Extend the existing timer store with a mode field. Both modes share pause/resume/stop/persistence logic.
- **Duplicating API routes:** The timer API already handles PROPORTIONAL mode. Do not create separate flowmodoro endpoints.
- **Complex break chaining in flowmodoro:** Flowmodoro is one work -> one break -> done (or continue). No long break concept.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Break calculation | Custom ratio logic | Simple division: `workedMs / breakRatio` | It's one line of math, but encapsulate it in a helper for testability |
| Goal form validation | Custom validation | Zod schema (client-side mirror of API schema) | API already validates with zod; mirror it client-side for instant feedback |
| Elapsed time formatting | New formatter | Reuse `formatTime()` from use-timer-tick | Same format, just different input source |

## Common Pitfalls

### Pitfall 1: Timer Store State Explosion
**What goes wrong:** Adding flowmodoro-specific fields that conflict with pomodoro fields
**Why it happens:** Trying to reuse phaseDurationMs for count-up mode when it has no meaning
**How to avoid:** For flowmodoro work phase, set `phaseDurationMs` to 0 or Number.MAX_SAFE_INTEGER. Use `timerMode` to branch behavior in completePhase/tick hook. Do NOT add separate elapsed tracking -- derive from `Date.now() - phaseStartedAt`.
**Warning signs:** New fields like `flowElapsedMs` that duplicate what can be computed

### Pitfall 2: Persistence Format Mismatch
**What goes wrong:** Saved timer state from flowmodoro mode is restored as pomodoro (or vice versa)
**Why it happens:** `SavedTimerState` doesn't include `timerMode` or `breakRatio`
**How to avoid:** Add `timerMode` and `breakRatio` to `SavedTimerState` interface and `buildSaveState()`. The restore function must handle both modes.
**Warning signs:** App restart during flowmodoro session shows countdown instead of count-up

### Pitfall 3: Break Transition Race in Flowmodoro
**What goes wrong:** User stops flowmodoro work, break is calculated, but total worked time includes break time on resume
**Why it happens:** `totalWorkedMs` accumulation logic doesn't account for flowmodoro-specific transitions
**How to avoid:** Accumulate totalWorkedMs at the moment the user stops/pauses work (same as pomodoro pause). Break phase uses its own calculated duration as a countdown.

### Pitfall 4: Goal Create Form Missing Parent Context
**What goes wrong:** User creates a goal but can't link it to a parent goal
**Why it happens:** No parent goal selector in the create form
**How to avoid:** Add an optional parent selector (dropdown of existing active goals). The API enforces max depth (3), so the selector should show goals at depth < 3.
**Warning signs:** All goals created from desktop are top-level orphans

### Pitfall 5: Optimistic UI for Goal Actions
**What goes wrong:** User completes a goal, UI shows completed, but API fails and state is stale
**Why it happens:** No error handling on goal mutation calls
**How to avoid:** After each mutation (create/update/complete), re-fetch the goal list. Show loading state on action buttons. Display error toast on failure.

## Code Examples

### Flowmodoro Start Action
```typescript
// In timer-store.ts start() action
if (timerMode === 'flowmodoro') {
  set({
    phase: 'working',
    timerMode: 'flowmodoro',
    sessionId: crypto.randomUUID(),
    phaseStartedAt: Date.now(),
    phaseDurationMs: 0, // Not used for count-up
    totalWorkedMs: 0,
    totalBreakMs: 0,
    pomodoroCount: 0,
    breakRatio: config.breakRatio ?? TIMER_DEFAULTS.defaultBreakRatio,
    focus: config.focus,
    goalId: config.goalId ?? null,
  });

  // API call with mode: 'PROPORTIONAL'
  apiFetch('/timer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'PROPORTIONAL',
      breakRatio: config.breakRatio ?? TIMER_DEFAULTS.defaultBreakRatio,
      focus: config.focus,
      goalId: config.goalId || undefined,
    }),
  }).then(res => set({ sessionId: res.id })).catch(() => {});
}
```

### Flowmodoro Break Calculation
```typescript
// When user stops working in flowmodoro mode
const elapsed = phaseStartedAt ? Date.now() - phaseStartedAt : 0;
const newTotalWorkedMs = totalWorkedMs + elapsed;
const breakDurationMs = Math.round(newTotalWorkedMs / breakRatio);

// Transition to break with calculated duration
set({
  phase: 'transition',
  transitionType: 'work_done',
  totalWorkedMs: newTotalWorkedMs,
  phaseDurationMs: breakDurationMs, // Used for break countdown
});
```

### Count-Up Tick for Flowmodoro
```typescript
// In useTimerTick, when timerMode === 'flowmodoro' && phase === 'working'
const elapsed = Date.now() - phaseStartedAt;
setElapsedMs(elapsed);
updateTrayTitleElapsed(elapsed).catch(() => {});
// No completion check -- user decides when to stop
```

### Goal Progress Update
```typescript
// In goals-store.ts
updateProgress: async (goalId: string, currentValue: number) => {
  await apiFetch(`/goals/${goalId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentValue }),
  });
  // Re-fetch to get updated tree
  get().fetchGoals();
},
```

### Goal Complete Action
```typescript
completeGoal: async (goalId: string) => {
  const result = await apiFetch<{ xpResult: { xpAwarded: number } }>(
    `/goals/${goalId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'COMPLETED' }),
    }
  );
  get().fetchGoals();
  return { xpAwarded: result.xpResult?.xpAwarded ?? 0 };
},
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate stores per mode | Single store with mode discriminator | Project pattern | Simpler state, shared persistence |
| API-first timer | Local-first timer (Phase 17 decision) | Phase 17 | Flowmodoro follows same pattern -- local state is truth, API syncs in background |

## Open Questions

1. **Flowmodoro "continue working" flow**
   - What we know: After break ends, user might want to continue another work session
   - What's unclear: Should this be a new API session or extend the existing one?
   - Recommendation: Show transition screen with "Continue" (starts new work phase, same API session) and "Done" (stops and syncs). This mirrors pomodoro's multi-session approach but without fixed durations.

2. **Goal creation form location**
   - What we know: GoalsPage has filter pills and a GoalTree
   - What's unclear: Should create form be a modal, inline panel, or separate page?
   - Recommendation: A slide-down panel above the GoalTree (within GoalsPage), toggled by an "Add Goal" button. Simpler than modal, no routing change needed.

3. **Tray elapsed vs countdown differentiation**
   - What we know: Tray shows MM:SS for pomodoro countdown
   - What's unclear: How to visually distinguish count-up from countdown in the menu bar
   - Recommendation: Prefix with a small indicator or just show elapsed time (users know which mode they're in). The tooltip can say "28K HQ - Flow: MM:SS" vs "28K HQ - MM:SS remaining".

## Sources

### Primary (HIGH confidence)
- Codebase analysis: timer-store.ts, use-timer-tick.ts, timer-tray.ts, timer-persistence.ts
- Codebase analysis: goals-store.ts, GoalNode.tsx, GoalsPage.tsx
- Codebase analysis: API routes (timer.ts, goals.ts)
- Codebase analysis: Prisma schema (TimerSession model, TimerMode enum, Goal model)
- Codebase analysis: packages/shared/src/timer-constants.ts (TIMER_DEFAULTS with defaultBreakRatio)

### Secondary (MEDIUM confidence)
- Phase 17 architecture decisions from STATE.md and additional_context

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new libraries needed, all existing patterns
- Architecture: HIGH - direct extension of Phase 17 timer store + existing goal API
- Pitfalls: HIGH - derived from reading actual code and understanding state transitions

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (stable -- internal project, no external API changes)
