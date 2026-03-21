---
phase: quick-fix
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - src/db/encryption.ts
  - src/modules/data-privacy/exporter.ts
  - src/modules/data-privacy/deleter.ts
  - src/modules/onboarding/commands.ts
  - src/modules/notification-router/commands.ts
  - src/modules/reminders/scheduler.ts
  - src/modules/reminders/index.ts
  - src/modules/timer/session.ts
  - src/modules/timer/index.ts
  - prisma/schema.prisma
autonomous: true
requirements: [AUDIT-01, AUDIT-02, AUDIT-03, AUDIT-04, AUDIT-05, AUDIT-06, AUDIT-07]

must_haves:
  truths:
    - "Reflection model's response and insights fields are encrypted/decrypted transparently"
    - "/mydata export decrypts all encrypted fields (not just Member includes)"
    - "/deletedata only strips bot-managed roles, not user's other server roles"
    - "/setup DB writes are atomic -- partial setup cannot leave orphan records"
    - "/notifications set reminder routes to correct DB field"
    - "Skip-next on weekly reminders skips ~7 days, not ~23 hours"
    - "Timer recovery restores actual timer state (working/on_break/paused) not always 'working'"
  artifacts:
    - path: "src/db/encryption.ts"
      provides: "Reflection in ENCRYPTED_FIELDS, clarifying comment on extractMemberIdFromResult"
      contains: "Reflection"
    - path: "src/modules/data-privacy/exporter.ts"
      provides: "Separate queries per encrypted model for decryption"
    - path: "src/modules/data-privacy/deleter.ts"
      provides: "Bot-managed role filtering instead of strip-all"
    - path: "src/modules/onboarding/commands.ts"
      provides: "db.$transaction wrapping all DB writes, channel cleanup on failure"
    - path: "src/modules/notification-router/commands.ts"
      provides: "reminder entry in TYPE_TO_FIELD"
      contains: "reminder"
    - path: "src/modules/reminders/scheduler.ts"
      provides: "Cron-aware skip duration (daily vs weekly)"
    - path: "prisma/schema.prisma"
      provides: "timerState field on TimerSession"
      contains: "timerState"
    - path: "src/modules/timer/session.ts"
      provides: "timerState persistence in create/update"
    - path: "src/modules/timer/index.ts"
      provides: "Recovery reads persisted timerState"
  key_links:
    - from: "src/db/encryption.ts"
      to: "src/modules/data-privacy/exporter.ts"
      via: "encryption extension fires on separate model queries"
      pattern: "db\\.(memberProfile|checkIn|goal|conversationMessage|conversationSummary|reflection)\\."
    - from: "src/modules/reminders/index.ts"
      to: "src/modules/reminders/scheduler.ts"
      via: "skipNextOccurrence call with cronExpression param"
      pattern: "skipNextOccurrence.*cronExpression"
    - from: "src/modules/timer/session.ts"
      to: "src/modules/timer/index.ts"
      via: "timerState persisted and restored on recovery"
      pattern: "timerState"
---

<objective>
Fix 7 audit bugs across encryption, data privacy, notification routing, reminders, and timer recovery.

Purpose: Close all identified audit issues before production readiness.
Output: All 7 fixes applied, build passes, no regressions.
</objective>

<execution_context>
@/Users/ceoassane/.claude/get-shit-done/workflows/execute-plan.md
@/Users/ceoassane/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/db/encryption.ts
@src/modules/data-privacy/exporter.ts
@src/modules/data-privacy/deleter.ts
@src/modules/onboarding/commands.ts
@src/modules/notification-router/commands.ts
@src/modules/notification-router/constants.ts
@src/modules/reminders/scheduler.ts
@src/modules/reminders/index.ts
@src/modules/timer/session.ts
@src/modules/timer/engine.ts
@src/modules/timer/index.ts
@src/shared/constants.ts
@src/modules/sessions/constants.ts
@prisma/schema.prisma
</context>

<tasks>

<task type="auto">
  <name>Task 1: Encryption layer and data privacy fixes</name>
  <files>
    src/db/encryption.ts
    src/modules/data-privacy/exporter.ts
    src/modules/data-privacy/deleter.ts
    src/modules/onboarding/commands.ts
  </files>
  <action>
    **1a. Add Reflection to ENCRYPTED_FIELDS** (src/db/encryption.ts:25-32)

    Add `Reflection: ['response', 'insights']` to the ENCRYPTED_FIELDS map at line 31 (after ConversationSummary entry). These are the two personal text fields on the Reflection model.

    **1b. Add clarifying comment to extractMemberIdFromResult** (src/db/encryption.ts:223-224)

    At line 223 (the array branch comment), expand the comment to clarify WHY the array assumption is safe:
    ```
    // Array of results -- use first item's memberId.
    // Safe: Prisma queries with encrypted models always filter by memberId,
    // so all rows in a result set belong to the same member.
    ```

    **1c. Fix /mydata exporter** (src/modules/data-privacy/exporter.ts)

    The current single `member.findUniqueOrThrow` with `include` does NOT trigger the encryption extension for included relations -- the extension only fires on direct model queries. Replace with:

    1. Keep the member query but remove encrypted-model includes (remove: profile, checkIns, goals, conversationMessages, conversationSummary, reflections). Keep non-encrypted includes (accounts, xpTransactions, voiceSessions, schedule, seasonSnapshots, privateSpace, notificationPreference, timerSessions, reminders, inspirations).
    2. Add separate queries for each encrypted model:
       - `db.memberProfile.findUnique({ where: { memberId } })`
       - `db.checkIn.findMany({ where: { memberId }, orderBy: { createdAt: 'asc' } })`
       - `db.goal.findMany({ where: { memberId }, orderBy: { createdAt: 'asc' } })`
       - `db.conversationMessage.findMany({ where: { memberId }, orderBy: { createdAt: 'asc' } })`
       - `db.conversationSummary.findUnique({ where: { memberId } })`
       - `db.reflection.findMany({ where: { memberId }, orderBy: { createdAt: 'asc' } })`
    3. Use the separate query results instead of `member.profile`, `member.checkIns`, etc. in the export object construction. Field mappings stay identical.
    4. Also add `reminderAccountId` to the notificationPreference export section (line 176-178) since it was missed.

    **1d. Fix role stripping in deleter** (src/modules/data-privacy/deleter.ts:58-70)

    Replace "strip ALL roles" logic with bot-managed-role-only stripping. Currently lines 63-66 remove every role except @everyone. Change to:

    1. Build a Set of bot-managed role names:
       - `'Member'` (the gating role)
       - All rank names from RANK_PROGRESSION: `'Rookie', 'Grinder', 'Hustler', 'Boss', 'Mogul', 'Legend'`
       - `LOCKIN_ROLE_NAME` ('LockInSessions') from sessions/constants
       - Season champion roles: any role whose name starts with `'Season '`
    2. Before the loop, fetch InterestTag roleIds from DB: `db.interestTag.findMany({ select: { roleId: true } })` and add those roleIds to a Set.
    3. In the filter, only remove roles where `botManagedNames.has(role.name) || role.name.startsWith('Season ') || interestTagRoleIds.has(role.id)`.
    4. Add imports: `RANK_PROGRESSION` from `../../shared/constants.js`, `LOCKIN_ROLE_NAME` from `../sessions/constants.js`.
    5. Add `db` parameter to the function signature (it already receives it).

    **1e. Wrap /setup DB writes in transaction** (src/modules/onboarding/commands.ts:105-228)

    Restructure the success path (lines 104-233):

    1. Create the Discord channel FIRST (outside transaction) since it's an external call -- lines 162-173 stay before the transaction.
    2. Wrap all DB writes in `db.$transaction(async (tx) => { ... })`:
       - `tx.member.create(...)` (line 112-118)
       - `tx.member.update(...)` for recovery key hash (line 132-135)
       - `tx.discordAccount.create(...)` (line 138-143)
       - `tx.memberProfile.create(...)` (line 149-159)
       - `tx.privateSpace.create(...)` (line 175-181)
       - `tx.memberSchedule.create(...)` (line 221-225)
       - Return `{ memberRecord, recoveryKey }` from the transaction
    3. The encryption salt, key derivation, and recovery key generation (lines 109-131) happen INSIDE the transaction (they are pure computation + one tx.member calls).
    4. If the transaction throws and a Discord channel was created, clean it up: `if (channelId) { await client.channels.fetch(channelId).then(ch => ch?.delete()).catch(() => {}) }`.
    5. DM sending (lines 184-197) and role assignment (lines 199-205) happen AFTER the transaction succeeds -- they are non-critical and idempotent.
    6. The `events.emit('memberSetupComplete', ...)` stays after transaction success.
  </action>
  <verify>
    <automated>cd "/Volumes/Vault/Discord Hustler" && npx tsc --noEmit 2>&1 | head -30</automated>
    <manual>Verify ENCRYPTED_FIELDS has Reflection entry, exporter uses separate queries, deleter filters bot roles only, onboarding uses $transaction</manual>
  </verify>
  <done>
    - Reflection fields encrypted/decrypted transparently
    - /mydata export decrypts all 6 encrypted models via separate queries
    - /mydata export includes reminderAccountId in notificationPreference
    - extractMemberIdFromResult has clarifying comment
    - /deletedata only removes bot-managed roles (Member, ranks, LockInSessions, Season *, interest tag roles)
    - /setup DB writes are atomic via $transaction with channel cleanup on failure
  </done>
</task>

<task type="auto">
  <name>Task 2: Notification routing, reminder skip, and timer recovery fixes</name>
  <files>
    src/modules/notification-router/commands.ts
    src/modules/reminders/scheduler.ts
    src/modules/reminders/index.ts
    prisma/schema.prisma
    src/modules/timer/session.ts
    src/modules/timer/index.ts
  </files>
  <action>
    **2a. Add reminder to TYPE_TO_FIELD** (src/modules/notification-router/commands.ts:89-94)

    Add `reminder: 'reminderAccountId'` to the TYPE_TO_FIELD map at line 94 (after level_up entry). The type is already in ROUTABLE_TYPES and constants -- only the commands.ts mapping was missed.

    **2b. Fix skipNextOccurrence for weekly reminders** (src/modules/reminders/scheduler.ts:339-353)

    Current implementation always uses 23 hours regardless of frequency. Fix:

    1. Change function signature to accept optional `cronExpression` param:
       ```typescript
       export async function skipNextOccurrence(
         reminderId: string,
         db: ExtendedPrismaClient,
         cronExpression?: string | null,
       ): Promise<void>
       ```
    2. Determine skip duration based on cron expression:
       - Parse the cron day-of-week field (5th field, 0-indexed from position 4). Cron format is `minute hour * * dayOfWeek`.
       - If cronExpression is null/undefined OR day-of-week field is `*` (daily): use 23 hours (23 * 60 * 60 * 1000)
       - If day-of-week field is a specific day (e.g., `1` for Monday = weekly): use 6 days 23 hours (((6 * 24) + 23) * 60 * 60 * 1000)
       - Simple heuristic: `const isWeekly = cronExpression?.split(' ')[4] !== '*'`
       - `const skipMs = isWeekly ? (6 * 24 + 23) * 3600_000 : 23 * 3600_000`
    3. Update the comment to explain the cron-aware logic.

    **2c. Update skipNextOccurrence callers** (src/modules/reminders/index.ts:243, 251)

    Both call sites in `handleSkipNextButton` have the reminder object with `cronExpression` available. Pass it:
    - Line 243: `await skipNextOccurrence(fallbackReminder.id, db, fallbackReminder.cronExpression);`
    - Line 251: `await skipNextOccurrence(reminder.id, db, reminder.cronExpression);`

    **2d. Add timerState to Prisma schema** (prisma/schema.prisma:503)

    Add `timerState String?` field to the TimerSession model, after the `focus` field (line 508 area):
    ```prisma
    timerState        String?      // Persisted timer state for recovery (working/on_break/paused)
    ```
    Then run `npx prisma db push` to apply the schema change.

    **2e. Persist timerState in session.ts** (src/modules/timer/session.ts)

    In `createActiveTimerRecord` (line 137-165):
    - Add `timerState: timer.state` to the create data object (after the `focus` field).

    In `updateTimerRecord` (line 171-190):
    - Add `timerState?: string` to the updates type (line 174-181).
    - This allows callers to pass timerState on state transitions.

    **2f. Restore persisted state in timer recovery** (src/modules/timer/index.ts:728-746)

    In the recovery section where ActiveTimer is reconstructed (around line 728):
    - Change `state: 'working'` (line 731) to use the persisted state:
      ```typescript
      state: (session.timerState as ActiveTimer['state']) ?? 'working',
      ```
    - This restores the actual state (working/on_break/paused) instead of always defaulting to 'working'.
    - If the recovered state is 'paused', also set `prePauseState` to 'working' as a safe default (the exact pre-pause state is lost but working is the safest assumption).

    **2g. Persist timerState on state transitions**

    Find where `updateTimerRecord` is called in `src/modules/timer/index.ts` during state transitions (pause, resume, break, work). Add `timerState: timer.state` to each updateTimerRecord call's update object so the DB stays in sync with in-memory state.
  </action>
  <verify>
    <automated>cd "/Volumes/Vault/Discord Hustler" && npx prisma db push --accept-data-loss 2>&1 | tail -5 && npx tsc --noEmit 2>&1 | head -30</automated>
    <manual>Verify TYPE_TO_FIELD has reminder, skipNextOccurrence uses cron-aware duration, timer recovery uses persisted state</manual>
  </verify>
  <done>
    - /notifications set type:reminder correctly maps to reminderAccountId DB field
    - skipNextOccurrence uses 23h for daily, 6d23h for weekly based on cron expression
    - Both callers pass cronExpression to skipNextOccurrence
    - TimerSession model has timerState field
    - createActiveTimerRecord and updateTimerRecord persist timerState
    - Timer recovery restores persisted state instead of hardcoded 'working'
    - State transitions update timerState in DB
    - prisma db push succeeds, tsc --noEmit passes
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` -- zero type errors
2. `npx prisma db push` -- schema applies cleanly
3. `grep -n 'Reflection' src/db/encryption.ts` -- shows Reflection in ENCRYPTED_FIELDS
4. `grep -n 'reminder' src/modules/notification-router/commands.ts` -- shows reminder in TYPE_TO_FIELD
5. `grep -n 'timerState' prisma/schema.prisma src/modules/timer/session.ts src/modules/timer/index.ts` -- shows timerState across all three files
6. `grep -n 'transaction' src/modules/onboarding/commands.ts` -- shows $transaction usage
7. `grep -n 'RANK_PROGRESSION\|LOCKIN_ROLE_NAME\|interestTag' src/modules/data-privacy/deleter.ts` -- shows bot-managed role filtering
</verification>

<success_criteria>
- All 7 audit bugs fixed
- TypeScript compilation passes with zero errors
- Prisma schema pushes cleanly
- No behavioral regressions in unrelated code
</success_criteria>

<output>
After completion, create `.planning/quick/1-fix-7-audit-bugs-encryption-role-strippi/1-SUMMARY.md`
</output>
