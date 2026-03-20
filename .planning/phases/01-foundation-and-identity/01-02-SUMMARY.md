---
phase: 01-foundation-and-identity
plan: 02
subsystem: database
tags: [prisma, postgresql, aes-256-gcm, hkdf, encryption, pm2, deployment, slash-commands]

# Dependency graph
requires:
  - phase: 01-foundation-and-identity/01
    provides: "Bot core, config, shared types, DB placeholder"
provides:
  - "Prisma schema with all 6 Phase 1 models (Member, DiscordAccount, MemberProfile, PrivateSpace, LinkCode, InterestTag)"
  - "Per-member AES-256-GCM encryption with HKDF key derivation"
  - "Prisma client extension for transparent field encryption on rawAnswers"
  - "PrismaClient singleton with encryption extension (db export)"
  - "Slash command registration script for 5 Phase 1 commands"
  - "PM2 ecosystem config and VPS auto-deploy via git push"
affects: [01-03, 01-04, all-future-plans]

# Tech tracking
tech-stack:
  added: []
  patterns: [prisma-client-extension, aes-256-gcm-encryption, hkdf-key-derivation, prisma7-config-file, git-hook-deploy]

key-files:
  created:
    - prisma/schema.prisma
    - prisma.config.ts
    - src/shared/crypto.ts
    - src/db/encryption.ts
    - src/deploy-commands.ts
    - ecosystem.config.cjs
    - deploy/post-receive
  modified:
    - src/db/client.ts
    - src/index.ts

key-decisions:
  - "Prisma 7 requires prisma.config.ts for datasource URL -- url property removed from schema.prisma datasource block"
  - "currentFocus and workStyle are optional (nullable) in MemberProfile since they may not be set during initial profile creation"
  - "Recovery key format: DHKEY-<base64url> -- human-readable prefix for identification"
  - "Encryption extension uses async $allOperations pattern (not type-cast) for clean Prisma 7 compatibility"

patterns-established:
  - "Encryption pattern: withEncryption(prisma) wraps PrismaClient with transparent encrypt/decrypt on ENCRYPTED_FIELDS map"
  - "Crypto pattern: deriveMemberKey(masterKey, memberId) via HKDF for per-member keys; encrypt/decrypt with AES-256-GCM"
  - "Deploy pattern: npm run deploy-commands for guild-scoped (dev) or --global (prod) slash command registration"
  - "VPS deploy pattern: git push deploy main triggers post-receive hook (checkout, npm ci, build, migrate, pm2 restart)"

requirements-completed: [FNDN-01, TRUST-04]

# Metrics
duration: 6min
completed: 2026-03-20
---

# Phase 1 Plan 2: Database Schema, Encryption, and Deployment Summary

**Prisma 7 schema with 6 models, AES-256-GCM per-member encryption via custom client extension, and git-push-to-deploy pipeline with PM2**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-20T09:58:40Z
- **Completed:** 2026-03-20T10:05:05Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Complete Prisma 7 schema with all Phase 1 data models and proper relations, indexes, and enums
- AES-256-GCM encryption utilities with HKDF per-member key derivation, verified with round-trip tests including recovery key decryption
- Transparent Prisma client extension that auto-encrypts rawAnswers on write and decrypts on read
- Slash command deployment script for all 5 Phase 1 commands (/setup, /profile, /link, /verify, /unlink)
- PM2 ecosystem config and post-receive git hook for complete VPS auto-deploy pipeline

## Task Commits

Each task was committed atomically:

1. **Task 1: Prisma schema, encryption extension, and crypto utilities** - `cbc9ca0` (feat)
2. **Task 2: Deployment pipeline and command registration script** - `dd3adc7` (feat)

## Files Created/Modified
- `prisma/schema.prisma` - All 6 Phase 1 models: Member, DiscordAccount, MemberProfile, PrivateSpace, LinkCode, InterestTag
- `prisma.config.ts` - Prisma 7 datasource configuration (required by Prisma 7 -- url moved out of schema)
- `src/shared/crypto.ts` - AES-256-GCM encrypt/decrypt, HKDF deriveMemberKey, generateRecoveryKey, generateEncryptionSalt
- `src/db/encryption.ts` - Prisma client extension with transparent field encryption for ENCRYPTED_FIELDS map
- `src/db/client.ts` - PrismaClient singleton with encryption extension applied, replaces placeholder from Plan 01
- `src/index.ts` - Updated to use new `db` export instead of old getDb/setDb pattern
- `src/deploy-commands.ts` - Standalone script registering 5 Phase 1 slash commands (guild or global)
- `ecosystem.config.cjs` - PM2 config: discord-hustler app, production env, max_restarts, log format
- `deploy/post-receive` - Git hook: checkout, npm ci, build, prisma migrate deploy, pm2 restart

## Decisions Made
- Prisma 7 requires datasource URL in prisma.config.ts instead of schema.prisma -- created config file to comply with Prisma 7 requirements (auto-fixed as blocking issue)
- Made currentFocus and workStyle optional (nullable) in MemberProfile since they are extracted by AI and may not be available immediately during setup
- Encryption extension uses async $allOperations with inferred types rather than explicit type cast for clean Prisma 7 API compatibility
- Recovery key includes DHKEY- prefix for human identification per the constants defined in Plan 01

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Prisma 7 datasource URL configuration change**
- **Found during:** Task 1 (Prisma schema creation)
- **Issue:** Prisma 7 no longer supports `url = env("DATABASE_URL")` in the schema datasource block. `npx prisma generate` failed with error P1012.
- **Fix:** Created `prisma.config.ts` at project root using `defineConfig` from `@prisma/config`, moved datasource URL configuration there. Removed url from schema datasource block.
- **Files modified:** prisma/schema.prisma, prisma.config.ts (new)
- **Verification:** `npx prisma generate` succeeds after the fix
- **Committed in:** cbc9ca0 (Task 1 commit)

**2. [Rule 3 - Blocking] Prisma 7 $extends type API change**
- **Found during:** Task 1 (Encryption extension)
- **Issue:** `Prisma.ExtensionArgs` type no longer exists in Prisma 7 (renamed to `Prisma.Extension`). TypeScript compilation failed.
- **Fix:** Removed explicit type cast on $extends argument, used async $allOperations with inferred parameter types instead. Cleaner and more forward-compatible.
- **Files modified:** src/db/encryption.ts
- **Verification:** `npx tsc --noEmit` passes with zero errors
- **Committed in:** cbc9ca0 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking -- both Prisma 7 API changes)
**Impact on plan:** Both fixes were necessary to work with Prisma 7's updated APIs. No scope creep. The plan referenced Prisma 7 patterns but some specific APIs had changed.

## Issues Encountered
None beyond the auto-fixed Prisma 7 API changes documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Database schema is complete and Prisma client generates successfully
- Encryption layer is tested and ready for use in onboarding/profile modules
- Plans 03 and 04 can now create modules that use `db` for member data operations
- Slash commands are defined and ready to deploy once bot token is configured
- VPS deployment pipeline is ready to use once the server is set up

## Self-Check: PASSED

All 7 created files and 2 modified files verified present on disk. Both task commits (cbc9ca0, dd3adc7) verified in git log. TypeScript compiles with zero errors. Prisma generates successfully. Crypto round-trip test passes. All 5 slash commands present. Ecosystem config is valid CJS. Post-receive hook is executable.

---
*Phase: 01-foundation-and-identity*
*Completed: 2026-03-20*
