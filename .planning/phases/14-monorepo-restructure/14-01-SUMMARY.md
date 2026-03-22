---
phase: 14-monorepo-restructure
plan: 01
subsystem: infra
tags: [pnpm, turborepo, monorepo, prisma, workspace]

# Dependency graph
requires:
  - phase: 13-monthly-progress-recap
    provides: completed v1.1 codebase to restructure
provides:
  - pnpm workspace with apps/* and packages/* workspaces
  - Turborepo build orchestration with db:generate ordering
  - "@28k/db package with Prisma client, encryption extension, and type exports"
  - Shared tsconfig.base.json for all packages
affects: [14-02-PLAN, 15-api-auth, 16-desktop-shell]

# Tech tracking
tech-stack:
  added: [pnpm@10.32.1, turbo@2.8.20]
  patterns: [internal-packages, workspace-protocol, custom-prisma-output]

key-files:
  created:
    - pnpm-workspace.yaml
    - turbo.json
    - tsconfig.base.json
    - .npmrc
    - packages/db/package.json
    - packages/db/tsconfig.json
    - packages/db/prisma.config.ts
    - packages/db/prisma/schema.prisma
    - packages/db/src/index.ts
    - packages/db/src/client.ts
    - packages/db/src/encryption.ts
    - packages/db/src/crypto.ts
  modified:
    - package.json
    - .gitignore
    - pnpm-lock.yaml

key-decisions:
  - "Used Turborepo internal packages pattern (raw .ts exports, no build step for packages)"
  - "Decoupled encryption from bot config -- reads process.env.MASTER_ENCRYPTION_KEY directly"
  - "Prisma generates into packages/db/generated/prisma/client/ (custom output, not node_modules)"
  - "No TS2742 workarounds needed -- Prisma 7.5.0 works cleanly with pnpm strict mode"

patterns-established:
  - "Internal packages: exports field points to raw .ts source, consumers transpile"
  - "Workspace protocol: dependencies use workspace:* for local packages"
  - "Prisma custom output: generator output = '../generated/prisma/client'"
  - "Config decoupling: shared packages read process.env directly, never import app config"

requirements-completed: [INFRA-01, INFRA-03]

# Metrics
duration: 6min
completed: 2026-03-21
---

# Phase 14 Plan 01: Monorepo Skeleton + packages/db Extraction Summary

**Turborepo + pnpm monorepo skeleton with @28k/db workspace package exporting Prisma client, encryption extension, and all generated types**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-21T10:42:10Z
- **Completed:** 2026-03-21T10:48:14Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments
- Converted from npm to pnpm with lockfile migration (pnpm import preserves exact versions)
- Created Turborepo monorepo skeleton with workspace-aware build orchestration
- Extracted packages/db with Prisma schema, client singleton, and transparent encryption extension
- Decoupled encryption module from bot config -- reads MASTER_ENCRYPTION_KEY from process.env
- Zero TS2742 errors -- Prisma 7.5.0 + pnpm strict mode works without workarounds

## Task Commits

Each task was committed atomically:

1. **Task 1: Create monorepo skeleton and convert to pnpm** - `1ba2429` (chore)
2. **Task 2: Extract packages/db with Prisma schema, client, and encryption** - `4827db5` (feat)

**Plan metadata:** `aa1cb00` (docs: complete plan)

## Files Created/Modified
- `pnpm-workspace.yaml` - Workspace definition (apps/*, packages/*)
- `turbo.json` - Build orchestration with db:generate dependency ordering
- `tsconfig.base.json` - Shared TypeScript compiler options
- `.npmrc` - pnpm config (auto-install-peers)
- `package.json` - Stripped to workspace root (turbo + typescript only)
- `packages/db/package.json` - @28k/db with Prisma deps
- `packages/db/tsconfig.json` - Extends root tsconfig.base.json
- `packages/db/prisma.config.ts` - Prisma 7 config (moved from root)
- `packages/db/prisma/schema.prisma` - Schema with custom output directive (moved from root)
- `packages/db/src/index.ts` - Barrel export (db, disconnectDb, ExtendedPrismaClient, Prisma types)
- `packages/db/src/client.ts` - PrismaClient singleton with encryption extension
- `packages/db/src/encryption.ts` - Decoupled encryption (process.env, not config import)
- `packages/db/src/crypto.ts` - AES-256-GCM + HKDF key derivation (unchanged from original)
- `.gitignore` - Added packages/db/generated/, .turbo/
- `pnpm-lock.yaml` - Generated from package-lock.json via pnpm import

## Decisions Made
- Used Turborepo internal packages pattern (raw .ts exports via exports field, no build step for packages) -- simplest setup, recommended by Turborepo docs
- Decoupled encryption from bot config by reading process.env.MASTER_ENCRYPTION_KEY directly with runtime validation (length 64, hex chars) -- enables sharing across bot and API
- Prisma generates into packages/db/generated/prisma/client/ via custom output -- keeps generated code co-located, consumers import from @28k/db only
- No TS2742 workarounds needed -- Prisma 7.5.0 + pnpm strict mode passes tsc --noEmit with zero errors

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed generated Prisma client import paths**
- **Found during:** Task 2 (TypeScript verification)
- **Issue:** Plan specified import path `../../generated/prisma/client/index.js` but from `packages/db/src/`, the correct relative path is `../generated/prisma/client/index.js`
- **Fix:** Changed all three files (client.ts, encryption.ts, index.ts) to use `../generated/` instead of `../../generated/`
- **Files modified:** packages/db/src/client.ts, packages/db/src/encryption.ts, packages/db/src/index.ts
- **Verification:** tsc --noEmit passes with zero errors
- **Committed in:** 4827db5 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Path calculation error in plan -- straightforward fix. No scope creep.

## Issues Encountered
- corepack not installed with Node.js 25 by default -- installed via `npm install -g corepack` before activating pnpm

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Monorepo skeleton is ready for Plan 02 (move bot to apps/bot, extract packages/shared)
- packages/db is fully functional: Prisma generates, TypeScript compiles, encryption decoupled
- Old root prisma/ directory and prisma.config.ts removed
- src/db/ files kept in place (will be removed in Plan 02 when bot moves to apps/bot)

## Self-Check: PASSED

All 12 created files verified as present on disk. Both task commits (1ba2429, 4827db5) verified in git log.

---
*Phase: 14-monorepo-restructure*
*Completed: 2026-03-21*
