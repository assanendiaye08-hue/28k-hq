---
phase: 14-monorepo-restructure
plan: 02
subsystem: infra
tags: [monorepo, workspace, pnpm, turborepo, prisma, migration]

# Dependency graph
requires:
  - phase: 14-monorepo-restructure-01
    provides: pnpm workspace skeleton, @28k/db package, Turborepo orchestration, tsconfig.base.json
provides:
  - "@28k/shared package with constants, XP engine, timer constants"
  - "Bot at apps/bot/ with all imports using @28k/db and @28k/shared"
  - "apps/api scaffold ready for Phase 15"
  - "apps/desktop scaffold ready for Phase 16"
  - "Updated deploy/post-receive using pnpm + Turborepo"
  - "Updated ecosystem.config.cjs pointing to apps/bot/dist/"
affects: [15-api-auth, 16-desktop-shell, 17-desktop-timer, 18-timer-sync, 19-launch]

# Tech tracking
tech-stack:
  added: []
  patterns: [workspace-imports, shared-package-barrel-export, dead-code-removal]

key-files:
  created:
    - packages/shared/package.json
    - packages/shared/tsconfig.json
    - packages/shared/src/index.ts
    - packages/shared/src/constants.ts
    - packages/shared/src/xp-engine.ts
    - packages/shared/src/xp-constants.ts
    - packages/shared/src/timer-constants.ts
    - apps/bot/package.json
    - apps/bot/tsconfig.json
    - apps/api/package.json
    - apps/api/src/index.ts
    - apps/desktop/package.json
  modified:
    - apps/bot/src/** (78 files: db imports, 21 files: constants imports, 12 files: XP engine imports)
    - packages/db/src/index.ts (added crypto exports to barrel)
    - deploy/post-receive
    - ecosystem.config.cjs
    - .gitignore
    - pnpm-lock.yaml

key-decisions:
  - "Deleted redundant bot copies of xp/engine.ts, xp/constants.ts, timer/constants.ts, shared/constants.ts after extraction to @28k/shared"
  - "Added crypto functions (deriveMemberKey, encrypt, decrypt, etc.) to @28k/db barrel export for onboarding module"
  - "Removed bot's local shared/constants.ts entirely rather than keeping as re-export shim -- all 21 consumers updated to import directly from @28k/shared"

patterns-established:
  - "All bot db access via @28k/db: `import { db } from '@28k/db'`"
  - "All shared constants/XP logic via @28k/shared: `import { BRAND_COLORS, awardXP } from '@28k/shared'`"
  - "Crypto functions available from @28k/db: `import { deriveMemberKey } from '@28k/db'`"
  - "Dead code removal: when extracting to shared package, delete redundant copies from consuming app"

requirements-completed: [INFRA-01, INFRA-02, INFRA-04]

# Metrics
duration: 8min
completed: 2026-03-21
---

# Phase 14 Plan 02: Bot Migration + Shared Package + App Scaffolds Summary

**Complete monorepo with @28k/shared package, bot at apps/bot/ using workspace imports, apps/api and apps/desktop scaffolds, and updated pnpm deployment pipeline**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-21T10:51:48Z
- **Completed:** 2026-03-21T11:00:18Z
- **Tasks:** 2
- **Files modified:** 148

## Accomplishments
- Extracted packages/shared with constants, XP engine (awardXP, getRankForXP), XP constants, and timer constants
- Moved 134 bot source files from src/ to apps/bot/src/ preserving git history
- Updated 78 db/client imports, 21 constants imports, 12 XP engine imports, 8 XP constants imports, and timer constant imports to use workspace packages
- Deleted 6 redundant files (xp/engine.ts, xp/constants.ts, timer/constants.ts, shared/constants.ts, shared/crypto.ts, db/ directory)
- Scaffolded apps/api and apps/desktop for Phase 15 and Phase 16
- Updated deployment scripts for pnpm + Turborepo pipeline
- Full Turborepo build pipeline verified: db:generate -> bot build succeeds with zero errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract packages/shared and move bot to apps/bot** - `14bbd13` (feat)
2. **Task 2: Scaffold apps/api and apps/desktop, update deployment, clean up** - `76c5e25` (chore)

## Files Created/Modified
- `packages/shared/package.json` - @28k/shared workspace package
- `packages/shared/src/index.ts` - Barrel export for all shared symbols
- `packages/shared/src/constants.ts` - RANK_PROGRESSION, BRAND_COLORS, SERVER_CATEGORIES, etc.
- `packages/shared/src/xp-engine.ts` - awardXP, getRankForXP, calculateCheckinXP, calculateStreakMultiplier
- `packages/shared/src/xp-constants.ts` - XP_AWARDS, STREAK_CONFIG
- `packages/shared/src/timer-constants.ts` - TIMER_DEFAULTS
- `apps/bot/package.json` - Bot package with @28k/db and @28k/shared workspace deps
- `apps/bot/tsconfig.json` - Extends tsconfig.base.json
- `apps/bot/src/**` - 128 bot source files with updated imports
- `apps/api/package.json` - API scaffold (Phase 15)
- `apps/api/src/index.ts` - Placeholder
- `apps/desktop/package.json` - Desktop scaffold (Phase 16)
- `packages/db/src/index.ts` - Added crypto function exports to barrel
- `deploy/post-receive` - pnpm + Turborepo build pipeline
- `ecosystem.config.cjs` - 28k-bot name, apps/bot/dist/index.js path
- `.gitignore` - Per-app dist, removed old entries

## Decisions Made
- Deleted redundant copies of extracted files (xp/engine.ts, xp/constants.ts, timer/constants.ts, shared/constants.ts) from the bot rather than keeping re-export shims -- cleaner, avoids dual-source-of-truth
- Added crypto functions (deriveMemberKey, generateRecoveryKey, generateEncryptionSalt, encrypt, decrypt) to @28k/db barrel export -- onboarding module needs them and they logically belong with the db package
- Removed bot's local shared/constants.ts entirely -- all 21 consumers updated to import directly from @28k/shared rather than through a local proxy

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added crypto exports to @28k/db barrel**
- **Found during:** Task 1 (import path updates)
- **Issue:** `onboarding/commands.ts` imports `deriveMemberKey`, `generateRecoveryKey`, `generateEncryptionSalt` from `shared/crypto.js`. The crypto module lives in `packages/db/src/crypto.ts` but was not exported from the @28k/db barrel (index.ts)
- **Fix:** Added all 5 crypto function exports to `packages/db/src/index.ts`, updated onboarding import to `from '@28k/db'`
- **Files modified:** packages/db/src/index.ts, apps/bot/src/modules/onboarding/commands.ts
- **Verification:** tsc --noEmit passes with zero errors
- **Committed in:** 14bbd13 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Missing barrel export was necessary for bot compilation. No scope creep.

## Issues Encountered
None -- TypeScript compilation passed on first attempt after all import updates.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Complete monorepo structure ready for all v2.0 phases
- apps/api scaffold ready for Phase 15 (API + Auth)
- apps/desktop scaffold ready for Phase 16 (Desktop Shell)
- packages/shared and packages/db fully functional as internal packages
- Turborepo build pipeline verified end-to-end
- Deployment scripts updated for pnpm + Turborepo
- Bot compiles and builds from apps/bot/ with zero errors

## Self-Check: PASSED

All 11 created files verified as present on disk. Both task commits (14bbd13, 76c5e25) verified in git log.

---
*Phase: 14-monorepo-restructure*
*Completed: 2026-03-21*
