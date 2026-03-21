---
phase: quick-3
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/modules/reminders/delivery.ts
  - prisma/schema.prisma
  - src/modules/timer/session.ts
  - src/modules/timer/index.ts
  - src/modules/timer/commands.ts
autonomous: true
requirements: [QUICK-3-ROUTING, QUICK-3-REMAINING-MS]

must_haves:
  truths:
    - "Low-urgency recurring reminder DMs respect reminderAccountId routing preference"
    - "High-urgency reminder DMs respect reminderAccountId routing preference"
    - "Paused timer remainingMs is persisted to DB and restored on recovery"
    - "Resumed timer clears remainingMs in DB after scheduling transition"
  artifacts:
    - path: "src/modules/reminders/delivery.ts"
      provides: "Routing-aware direct DM delivery"
      contains: "notificationPreference.findUnique"
    - path: "prisma/schema.prisma"
      provides: "remainingMs column on TimerSession"
      contains: "remainingMs"
    - path: "src/modules/timer/session.ts"
      provides: "remainingMs in create/update record types"
      contains: "remainingMs"
    - path: "src/modules/timer/index.ts"
      provides: "remainingMs persistence on pause/resume and recovery"
      contains: "remainingMs"
  key_links:
    - from: "src/modules/reminders/delivery.ts"
      to: "NotificationPreference"
      via: "db.notificationPreference.findUnique"
      pattern: "notificationPreference\\.findUnique"
    - from: "src/modules/timer/index.ts"
      to: "src/modules/timer/session.ts"
      via: "updateTimerRecord with remainingMs"
      pattern: "remainingMs"
---

<objective>
Fix two regressions: (1) reminder delivery bypasses routing preferences by using discordAccount.findFirst instead of checking NotificationPreference.reminderAccountId, and (2) timer remainingMs is never persisted to DB so paused timers lose their remaining interval time on recovery.

Purpose: Ensure multi-account members receive reminders on their preferred account, and paused timers can correctly resume after bot restart.
Output: Patched delivery.ts, schema.prisma, session.ts, index.ts, commands.ts
</objective>

<execution_context>
@/Users/ceoassane/.claude/get-shit-done/workflows/execute-plan.md
@/Users/ceoassane/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/modules/reminders/delivery.ts
@src/modules/notification-router/router.ts
@prisma/schema.prisma
@src/modules/timer/engine.ts
@src/modules/timer/session.ts
@src/modules/timer/index.ts
@src/modules/timer/commands.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix reminder delivery to respect routing preferences</name>
  <files>src/modules/reminders/delivery.ts</files>
  <action>
In `deliverLowUrgency` (lines 86-103), replace the `discordAccount.findFirst` lookup with a NotificationPreference lookup that respects `reminderAccountId`:

1. Before the `if (options?.buttons)` block (line 86), the pattern stays the same but the account resolution changes.
2. Inside the `if (options?.buttons)` try block, replace lines 88-93 with:
   - Query `this.db.notificationPreference.findUnique({ where: { memberId } })`
   - If `prefs?.reminderAccountId` is set, use that as `targetDiscordId`
   - If no preference, fall back to `this.db.discordAccount.findFirst({ where: { memberId } })` and use `account.discordId`
   - Then `this.client.users.fetch(targetDiscordId)` and send the message

Apply the SAME fix to `deliverHighUrgency` (lines 129-173) which has the identical `discordAccount.findFirst` bypass at lines 141-143. Replace with the same preference-then-fallback pattern.

The exact replacement for the direct DM section in BOTH methods:
```ts
let targetDiscordId: string | null = null;

const prefs = await this.db.notificationPreference.findUnique({
  where: { memberId },
});
if (prefs?.reminderAccountId) {
  targetDiscordId = prefs.reminderAccountId;
} else {
  const account = await this.db.discordAccount.findFirst({
    where: { memberId },
  });
  targetDiscordId = account?.discordId ?? null;
}

if (targetDiscordId) {
  const user = await this.client.users.fetch(targetDiscordId);
  // ... send message with appropriate content/components ...
}
```

Do NOT change the notification router fallback paths (lines 105-119 and 158-172) -- those already route correctly via deliverNotification.
  </action>
  <verify>
    <automated>cd "/Volumes/Vault/Discord Hustler" && npx tsc --noEmit --pretty 2>&1 | head -30</automated>
    <manual>Grep delivery.ts for discordAccount.findFirst -- should appear 0 times in direct DM paths (only in fallback inside the preference lookup)</manual>
  </verify>
  <done>Both deliverLowUrgency and deliverHighUrgency check NotificationPreference.reminderAccountId before falling back to primary discordAccount. TypeScript compiles clean.</done>
</task>

<task type="auto">
  <name>Task 2: Persist timer remainingMs to DB for paused recovery</name>
  <files>prisma/schema.prisma, src/modules/timer/session.ts, src/modules/timer/index.ts, src/modules/timer/commands.ts</files>
  <action>
**Step 1: Schema** -- In `prisma/schema.prisma`, add `remainingMs Int?` to the TimerSession model after the `prePauseState` field (line 510). Then run `npx prisma db push` to apply.

**Step 2: session.ts createActiveTimerRecord** -- At line 151 (after `prePauseState: timer.prePauseState`), add: `remainingMs: timer.remainingMs,`

**Step 3: session.ts updateTimerRecord type** -- In the `updates` parameter type (line 176-185), add `remainingMs?: number | null;` alongside the existing optional fields.

**Step 4: index.ts handleButtonPause** (line 330-335) -- Add `remainingMs: timer.remainingMs` to the updateTimerRecord call. The engine already computed remainingMs in pauseTimer().

**Step 5: index.ts handleButtonResume** (line 368-373) -- Add `remainingMs: null` to the updateTimerRecord call. The remainingMs has been consumed to schedule the transition.

**Step 6: commands.ts handlePause** (line 285-288) -- Add `timerState: timer.state, prePauseState: timer.prePauseState, remainingMs: timer.remainingMs` to the updateTimerRecord call. Currently this call is missing timerState and prePauseState too (the button handler includes them but the slash command handler does not).

**Step 7: commands.ts handleResume** (line 339-342) -- Add `timerState: timer.state, prePauseState: timer.prePauseState, remainingMs: null` to the updateTimerRecord call. Same gap as pause -- button handler has these fields, slash command handler does not.

**Step 8: index.ts reconstructTimers** (line 753) -- Change `remainingMs: null` to `remainingMs: session.remainingMs ?? null` so recovered paused timers retain their remaining interval time.

**Step 9: index.ts reconstructTimers scheduling** (around line 787-797) -- The existing code already handles scheduling for working and on_break states. For paused timers (line 798 comment), no scheduling is needed since the user must press Resume. But when they do resume, the restored `remainingMs` will be used by the button resume handler to schedule the correct transition. No change needed here.
  </action>
  <verify>
    <automated>cd "/Volumes/Vault/Discord Hustler" && npx prisma db push --accept-data-loss 2>&1 | tail -5 && npx tsc --noEmit --pretty 2>&1 | head -30</automated>
    <manual>Verify session.remainingMs is read in reconstructTimers and that pause/resume handlers in both index.ts and commands.ts persist/clear remainingMs</manual>
  </verify>
  <done>TimerSession schema has remainingMs Int? column. Pause persists remainingMs to DB (both button and slash command paths). Resume clears it. Recovery reads it. TypeScript compiles clean and schema is pushed.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` compiles with no errors
2. `grep -n "discordAccount.findFirst" src/modules/reminders/delivery.ts` shows findFirst only inside the fallback branch of the preference lookup (not as the primary lookup)
3. `grep -n "remainingMs" src/modules/timer/session.ts` shows it in both createActiveTimerRecord data and updateTimerRecord type
4. `grep -n "remainingMs" src/modules/timer/index.ts` shows it in pause updateTimerRecord call, resume updateTimerRecord call, and reconstructTimers restore
5. `grep -n "remainingMs" src/modules/timer/commands.ts` shows it in both handlePause and handleResume updateTimerRecord calls
6. `grep -n "remainingMs" prisma/schema.prisma` shows the field on TimerSession model
</verification>

<success_criteria>
- Reminder DMs to multi-account members route to the account specified by reminderAccountId
- Timer remainingMs survives bot restart for paused timers
- All 5 modified files compile cleanly with no TypeScript errors
- Schema migration applied successfully
</success_criteria>

<output>
After completion, create `.planning/quick/3-fix-reminder-routing-bypass-regression-a/3-SUMMARY.md`
</output>
