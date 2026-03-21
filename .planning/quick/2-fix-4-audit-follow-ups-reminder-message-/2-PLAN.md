---
phase: quick-2
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/modules/reminders/delivery.ts
  - src/modules/data-privacy/exporter.ts
  - src/modules/onboarding/commands.ts
  - src/modules/timer/session.ts
  - src/modules/timer/index.ts
  - prisma/schema.prisma
autonomous: true
requirements: [AUDIT-FIX-1, AUDIT-FIX-2, AUDIT-FIX-3, AUDIT-FIX-4]
must_haves:
  truths:
    - "Low-urgency recurring reminder DMs return a message ID so Skip Next button resolves by dmMessageId"
    - "Session titles in /mydata export are decrypted plaintext, not ciphertext"
    - "/setup rerun after partial failure (DB exists, role missing) recovers gracefully without unique constraint error"
    - "Timer paused during break recovers with correct prePauseState from DB instead of hardcoded 'working'"
  artifacts:
    - path: "src/modules/reminders/delivery.ts"
      provides: "Direct DM path for low-urgency recurring reminders"
      contains: "user.send"
    - path: "src/modules/data-privacy/exporter.ts"
      provides: "Separate lockInSession query for decrypted titles"
      contains: "lockInSession.findMany"
    - path: "src/modules/onboarding/commands.ts"
      provides: "DB-level rerun guard checking DiscordAccount existence"
      contains: "discordAccount.findUnique"
    - path: "prisma/schema.prisma"
      provides: "prePauseState field on TimerSession model"
      contains: "prePauseState"
    - path: "src/modules/timer/session.ts"
      provides: "prePauseState persistence in create/update records"
      contains: "prePauseState"
  key_links:
    - from: "src/modules/reminders/delivery.ts"
      to: "src/modules/reminders/index.ts"
      via: "messageId return value enabling dmMessageId lookup in handleSkipNextButton"
      pattern: "messageId.*message\\.id"
    - from: "src/modules/timer/session.ts"
      to: "src/modules/timer/index.ts"
      via: "prePauseState persisted then restored during recovery"
      pattern: "prePauseState"
---

<objective>
Fix 4 validated audit follow-up bugs: (1) low-urgency recurring reminder DMs not returning message IDs for Skip Next button binding, (2) session titles exported as ciphertext in /mydata, (3) /setup rerun hitting unique constraints when DB exists but role is missing, (4) timer prePauseState lost on restart recovery.

Purpose: Close remaining audit findings from second-pass review. All fixes are validated against current code.
Output: 4 bug fixes across 6 files, with schema migration for prePauseState field.
</objective>

<execution_context>
@/Users/ceoassane/.claude/get-shit-done/workflows/execute-plan.md
@/Users/ceoassane/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/modules/reminders/delivery.ts
@src/modules/reminders/index.ts (lines 200-256 for handleSkipNextButton)
@src/modules/reminders/scheduler.ts (lines 70-110 for fireReminder)
@src/modules/data-privacy/exporter.ts
@src/modules/onboarding/commands.ts
@src/modules/timer/session.ts
@src/modules/timer/index.ts (lines 725-755 for recovery)
@src/modules/timer/engine.ts (ActiveTimer interface)
@prisma/schema.prisma (TimerSession model at line 503)
@src/db/encryption.ts (ENCRYPTED_FIELDS showing LockInSession title is encrypted)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix reminder message binding and session title export</name>
  <files>
    src/modules/reminders/delivery.ts
    src/modules/data-privacy/exporter.ts
  </files>
  <action>
**Fix 1 -- Reminder message binding (delivery.ts):**

In `deliverLowUrgency`, when `options?.buttons` is present (indicating a recurring reminder that needs Skip Next), attempt a direct DM via `user.send()` first (same pattern as `deliverHighUrgency`) to get the `Message` object and return its ID. Only fall back to `deliverNotification` (returning null messageId) if direct DM fails.

Specific changes to `deliverLowUrgency` (lines 71-97):
1. Before the existing `deliverNotification` call, check if buttons are present
2. If buttons present: look up `discordAccount` by memberId, fetch the Discord user, call `user.send()` with `{ content: text, components: [options.buttons] }`, return `{ messageId: message.id, success: true }`
3. Wrap the direct DM attempt in try/catch -- on failure, fall through to existing `deliverNotification` path
4. If no buttons (non-recurring low urgency): keep existing behavior unchanged (deliverNotification, null messageId)
5. Update the JSDoc comment on `deliverLowUrgency` to reflect that recurring low-urgency now tries direct DM for message ID

The structure should mirror `deliverHighUrgency` lines 117-133: account lookup, user.fetch, user.send, cast to Message, return messageId.

**Fix 2 -- Session title decryption in /mydata export (exporter.ts):**

The `sessionParticipation` query at line 53 uses `include: { session: true }` which loads `LockInSession` via relation -- the encryption extension does NOT fire on included/nested relations, only on direct model queries. So `sp.session.title` is ciphertext.

Specific changes to `exportMemberData`:
1. After the `sessionParticipation` query (line 56), add a separate direct query:
   ```
   const sessionIds = [...new Set(sessionParticipation.map(sp => sp.sessionId))];
   const sessions = sessionIds.length > 0
     ? await db.lockInSession.findMany({ where: { id: { in: sessionIds } } })
     : [];
   const sessionTitleMap = new Map(sessions.map(s => [s.id, s.title]));
   ```
2. In the `sessionParticipation` mapping (line 226-238), replace `sp.session.title` with:
   `sessionTitleMap.get(sp.sessionId) ?? sp.session.title`
   This prefers the decrypted title from the direct query, falling back to the included value.
  </action>
  <verify>
    <automated>cd "/Volumes/Vault/Discord Hustler" && npx tsc --noEmit --pretty 2>&1 | head -30</automated>
    <manual>Review delivery.ts deliverLowUrgency method mirrors deliverHighUrgency pattern for direct DM when buttons present. Review exporter.ts has separate lockInSession.findMany query and uses decrypted titles in export mapping.</manual>
  </verify>
  <done>
    - deliverLowUrgency tries direct DM (returning messageId) when buttons are present (recurring)
    - Falls back to deliverNotification with null messageId only when direct DM fails or no buttons
    - Session titles in /mydata export use decrypted values from direct lockInSession query
    - TypeScript compiles clean
  </done>
</task>

<task type="auto">
  <name>Task 2: Fix setup rerun guard and timer prePauseState recovery</name>
  <files>
    src/modules/onboarding/commands.ts
    prisma/schema.prisma
    src/modules/timer/session.ts
    src/modules/timer/index.ts
  </files>
  <action>
**Fix 3 -- /setup rerun guard (commands.ts):**

After the role check at lines 72-77 fails (member does NOT have the role), add a DB-level check before running the full setup flow.

Insert between line 77 (end of role check block) and line 79 (Step 3 comment):
1. Query `db.discordAccount.findUnique({ where: { discordId: interaction.user.id }, include: { member: true } })`
2. If the account exists (DB records created in previous partial run):
   - Try to assign the Member role: `if (memberRole) { await guildMember.roles.add(memberRole, 'Recovered from incomplete /setup'); }`
   - Reply with success: `await interaction.editReply("You're already set up! All channels should be unlocked.");`
   - `return;`
3. If the account does not exist, continue to the existing Step 3 (runSetupFlow)
4. Wrap the role assignment in try/catch -- if role assignment fails, still reply with a helpful message like "Your account exists but I couldn't assign the role. Please contact an admin."

**Fix 4 -- Timer prePauseState recovery (schema.prisma, session.ts, index.ts):**

Part A -- Schema (schema.prisma):
Add `prePauseState String?` to the TimerSession model, after the existing `timerState` field (line 509). Add a comment: `// Pre-pause state for recovery (working/on_break when paused)`

Part B -- Persistence (session.ts):
1. In `createActiveTimerRecord` (line 144 data block): add `prePauseState: timer.prePauseState,` alongside the existing `timerState: timer.state,`
2. In `updateTimerRecord` (line 173 updates type): add `prePauseState?: string | null;` to the updates parameter type

Part C -- Recovery (index.ts line 738):
Replace the hardcoded line:
```
prePauseState: restoredState === 'paused' ? 'working' : null,
```
With:
```
prePauseState: (session.prePauseState as ActiveTimer['prePauseState']) ?? (restoredState === 'paused' ? 'working' : null),
```
This restores the actual prePauseState from DB, falling back to the old heuristic only if DB value is null (pre-migration sessions).

Part D -- Run `npx prisma db push` to apply the schema change.
  </action>
  <verify>
    <automated>cd "/Volumes/Vault/Discord Hustler" && npx prisma db push --accept-data-loss 2>&1 | tail -5 && npx tsc --noEmit --pretty 2>&1 | head -30</automated>
    <manual>Verify schema.prisma has prePauseState field. Verify session.ts persists it in both create and update. Verify index.ts recovery reads it from DB with fallback.</manual>
  </verify>
  <done>
    - /setup rerun when DB records exist but role is missing: recovers gracefully, assigns role, responds with success
    - /setup rerun when DB records exist and role assignment fails: gives helpful error message
    - TimerSession schema has prePauseState String? field
    - createActiveTimerRecord persists timer.prePauseState
    - updateTimerRecord accepts prePauseState in updates
    - Recovery in index.ts reads prePauseState from DB with backward-compatible fallback
    - Schema pushed and TypeScript compiles clean
  </done>
</task>

</tasks>

<verification>
All 4 fixes verified together:
1. `npx tsc --noEmit` -- TypeScript compiles without errors
2. `npx prisma db push` -- Schema applies cleanly with new prePauseState field
3. Manual code review: each fix matches the validated pattern from audit
</verification>

<success_criteria>
- delivery.ts: low-urgency recurring reminders return messageId via direct DM
- exporter.ts: session titles decrypted via direct lockInSession query
- commands.ts: /setup checks DiscordAccount in DB before re-running full flow
- schema.prisma + session.ts + index.ts: prePauseState persisted and recovered from DB
- All TypeScript compiles clean, schema pushed
</success_criteria>

<output>
After completion, create `.planning/quick/2-fix-4-audit-follow-ups-reminder-message-/2-SUMMARY.md`
</output>
