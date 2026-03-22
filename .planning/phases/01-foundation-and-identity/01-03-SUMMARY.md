---
phase: 01-foundation-and-identity
plan: 03
subsystem: discord
tags: [discord.js, channels, roles, permissions, onboarding, dm-flow, encryption, private-spaces, slash-commands]

# Dependency graph
requires:
  - phase: 01-foundation-and-identity/01
    provides: "Bot core, module loader, command registry, event bus, shared types/constants/embeds"
  - phase: 01-foundation-and-identity/02
    provides: "Prisma schema, PrismaClient with encryption extension, crypto utilities"
provides:
  - "Server structure module: 5 categories, 7 text channels, 2 voice channels, 7 roles (6 ranks + Member)"
  - "Onboarding module: /setup command with conversational DM flow"
  - "Private space creation: DM-based or private channel under PRIVATE SPACES category"
  - "Permission gating: all channels except #welcome locked behind Member role"
  - "Welcome embed: hustler manifesto with brand colors and /setup CTA"
  - "Recovery key delivery via DM in DHKEY-<base64url> format"
affects: [01-04, 02-01, 04-01, all-future-plans]

# Tech tracking
tech-stack:
  added: []
  patterns: [dm-conversation-flow, awaitMessages-with-timeout, permission-overwrites, category-based-channel-gating, idempotent-server-setup]

key-files:
  created:
    - src/modules/server-setup/index.ts
    - src/modules/server-setup/channels.ts
    - src/modules/server-setup/roles.ts
    - src/modules/server-setup/permissions.ts
    - src/modules/onboarding/index.ts
    - src/modules/onboarding/commands.ts
    - src/modules/onboarding/setup-flow.ts
    - src/modules/onboarding/channel-setup.ts
    - src/modules/onboarding/welcome.ts
  modified: []

key-decisions:
  - "Used plan-specified channel structure (WELCOME, THE GRIND, RESOURCES, VOICE, PRIVATE SPACES) instead of constants.ts SERVER_CATEGORIES which had a different layout"
  - "Setup flow uses awaitMessages with 5-min timeout per question rather than modals (more conversational, matches the 'talking to a person' requirement)"
  - "Space preference parsing: '2', 'channel', or 'server' maps to CHANNEL; everything else defaults to DM"
  - "Recovery key hash stored in Member record for verification; actual key only sent once via DM"
  - "Default public profile fields: interests and currentFocus (conservative default, member can change later)"

patterns-established:
  - "DM flow pattern: createDM -> send question -> awaitMessages(filter, max:1, time:5min) -> acknowledge -> next question"
  - "Channel gating pattern: category-level permissionOverwrites deny @everyone, allow Member role"
  - "Private channel pattern: channel under PRIVATE SPACES with per-member + bot permission overwrites"
  - "Idempotent setup pattern: check by name before creating roles/channels, skip if exists"

requirements-completed: [FNDN-02, FNDN-04]

# Metrics
duration: 5min
completed: 2026-03-20
---

# Phase 1 Plan 3: Server Structure and Onboarding Flow Summary

**Server channel/role structure with permission gating, conversational DM-based /setup flow, private space creation, encrypted profile storage, and recovery key delivery**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-20T10:08:26Z
- **Completed:** 2026-03-20T10:13:15Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Server structure module: 5 categories (WELCOME, THE GRIND, RESOURCES, VOICE, PRIVATE SPACES), 7 text channels, 2 voice channels (The Lab, The Office), and 7 roles (6 rank + Member gate role)
- Full /setup onboarding flow: 5 natural conversational questions via DM with varied acknowledgments, plus private space preference choice
- Complete DB record creation pipeline: Member (with encryption salt), DiscordAccount, MemberProfile (encrypted rawAnswers), PrivateSpace -- all in a single /setup execution
- Private channel creation under PRIVATE SPACES category with correct permission overwrites (member + bot only)
- Recovery key (DHKEY-xxx) generated from derived member key and sent via DM

## Task Commits

Each task was committed atomically:

1. **Task 1: Server structure module -- channels, roles, and permissions** - `31e8895` (feat)
2. **Task 2: Onboarding flow -- /setup command, DM conversation, private space creation** - `938d349` (feat)

## Files Created/Modified
- `src/modules/server-setup/index.ts` - Module registration: on ready -> setup roles+channels, on guildMemberAdd -> welcome message
- `src/modules/server-setup/channels.ts` - Channel/category creation with permission overwrites, idempotent
- `src/modules/server-setup/roles.ts` - Rank progression roles + Member gate role, created highest-first for hierarchy
- `src/modules/server-setup/permissions.ts` - Helper functions: gateChannelBehindRole, makeChannelReadOnly, createPrivateOverwrite
- `src/modules/onboarding/index.ts` - Module registration: /setup command + new member DM prompt
- `src/modules/onboarding/commands.ts` - /setup handler: defer -> DM flow -> DB writes -> encryption -> role assign -> recovery key
- `src/modules/onboarding/setup-flow.ts` - Sequential DM conversation: 5 questions + space preference with timeout handling
- `src/modules/onboarding/channel-setup.ts` - Private channel creation under PRIVATE SPACES with member+bot overwrites
- `src/modules/onboarding/welcome.ts` - Welcome embed with hustler manifesto, server mechanics overview, and /setup CTA

## Decisions Made
- Used the channel structure from the plan (WELCOME, THE GRIND, RESOURCES, VOICE, PRIVATE SPACES) rather than the SERVER_CATEGORIES constant from Plan 01, which had a different layout (The Hub, Hustle Zones, Lock In). The plan's structure is cleaner and matches the user's "minimal/clean" preference.
- DM conversation approach with awaitMessages instead of Discord modals -- modals are limited to 5 fields and feel like forms, while sequential DMs feel like talking to a person as the context doc requires.
- Recovery key hash stored in the Member record via SHA-256 for future verification, while the actual key is sent only once via DM and never stored in plaintext.
- Default public profile fields set to ["interests", "currentFocus"] -- conservative default that Plan 04 (visibility controls) can expand.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Server structure and onboarding flow are complete and ready for live use
- Plan 04 (AI profile extraction, visibility controls, account linking) can build on the MemberProfile rawAnswers field for AI tag extraction
- The memberSetupComplete event is emitted for future modules to react to new member completions
- Private space (DM or channel) is available for Plan 04 AI assistant and Phase 2 daily briefs

## Self-Check: PASSED

All 9 created files verified present on disk. Both task commits (31e8895, 938d349) verified in git log. TypeScript compiles with zero errors.

---
*Phase: 01-foundation-and-identity*
*Completed: 2026-03-20*
