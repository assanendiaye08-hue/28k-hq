# Phase 14: Monorepo Restructure - Research

**Researched:** 2026-03-21
**Domain:** npm-to-pnpm migration, Turborepo monorepo setup, Prisma 7 workspace extraction
**Confidence:** HIGH

## Summary

Phase 14 transforms a single-app Node.js project (flat `package.json` + `src/` + `prisma/`) into a Turborepo + pnpm monorepo with `apps/bot`, `packages/db`, and `packages/shared`. No new features are added -- this is a structural migration that moves files, updates imports, and validates the bot runs identically. The primary technical risks are: (1) Prisma 7 + pnpm TS2742 issues (partially fixed in 7.1.0, may need `@prisma/client-runtime-utils` as explicit dep or `.npmrc` hoisting), (2) the encryption module importing `config` from `core/config.ts` (creates a coupling that must be broken during extraction), and (3) the VPS deployment script (`deploy/post-receive`) using `npm ci` which must switch to `pnpm install --frozen-lockfile`.

The existing codebase has 78 files importing `db/client.ts`, 21 files importing `shared/constants.ts`, and 12 files importing `xp/engine.ts`. All imports use relative paths (`../../db/client.js`). After migration, bot code uses relative imports within `apps/bot/src/` and workspace imports (`@28k/db`, `@28k/shared`) for extracted packages. The migration must be done incrementally: skeleton first, then `packages/db`, then `packages/shared`, then move bot to `apps/bot`, test at each step.

**Primary recommendation:** Use Turborepo's "internal packages" pattern (no TypeScript project references). Packages export raw `.ts` source via `exports` field; consuming apps handle transpilation. This avoids a separate build step for packages and keeps the setup minimal.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INFRA-01 | Codebase restructured into Turborepo + pnpm monorepo with apps/bot, apps/desktop, apps/api, packages/db, packages/shared | Complete migration guide below: skeleton setup, file mapping, turbo.json, pnpm-workspace.yaml, package.json configs |
| INFRA-02 | Existing Discord bot builds and runs identically after monorepo migration (zero functional regression) | Incremental migration strategy with test-at-each-step; VPS deployment script update; bot import path mapping |
| INFRA-03 | Prisma schema and client extracted into packages/db and shared by bot and API | Prisma 7 pnpm workspace guide; custom output directory; encryption extension extraction; config decoupling |
| INFRA-04 | Shared business logic (XP engine, rank progression, timer constants, brand colors) extracted into packages/shared | Dependency analysis of 21+ files importing constants, 12 importing XP engine; barrel export pattern |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pnpm | 10.x (10.32.1 stable) | Package manager + workspace protocol | Strict symlink node_modules prevents phantom deps. Native `workspace:*` protocol. Standard for Turborepo monorepos. |
| Turborepo | 2.x (2.8.20 stable) | Build orchestration + task ordering | `dependsOn` ensures `db:generate` runs before `build`. Single `turbo.json` config. Minimal learning curve. |
| TypeScript | 5.9.x (existing) | Type checking | Already in use. No version change needed. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @prisma/client-runtime-utils | ^7.5.0 | Explicit dep for pnpm TS resolution | Install in packages/db if TS2742 errors appear after migration. The core fix landed in Prisma 7.1.0 (PR #28735) but edge cases remain reported. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Turborepo internal packages | TypeScript project references | Project refs add `references` array in every tsconfig, a separate caching layer, and require continuous updates when packages change. Turborepo docs explicitly recommend against them. |
| pnpm strict mode | `shamefully-hoist=true` in .npmrc | Full hoisting defeats pnpm's phantom-dependency protection. Use targeted `public-hoist-pattern[]=@prisma/*` only if needed. |
| Moving everything in one commit | Incremental extraction | One giant commit is harder to debug if something breaks. Incremental moves with test-after-each-step is safer. |

**Installation:**
```bash
# Install pnpm globally (if not already)
corepack enable && corepack prepare pnpm@latest --activate

# Generate pnpm-lock.yaml from existing npm lockfile
cd /Volumes/Vault/Discord\ Hustler
pnpm import

# Install Turborepo as root devDependency
pnpm add -Dw turbo
```

## Architecture Patterns

### Target Monorepo Structure

```
28k-hq/
  turbo.json                    # Build orchestration
  pnpm-workspace.yaml           # Workspace definition
  package.json                  # Root: devDeps only (turbo, typescript)
  .npmrc                        # pnpm config (if hoisting needed)
  .env                          # Shared env vars (root level)
  .gitignore
  prisma.config.ts              # REMOVED (moved to packages/db/)

  apps/
    bot/
      src/
        index.ts                # Entry point (moved from src/index.ts)
        core/                   # config.ts, client.ts, commands.ts, events.ts, module-loader.ts
        modules/                # All 25 modules (internal imports unchanged)
        shared/                 # BOT-ONLY shared: delivery.ts, embeds.ts, ai-*.ts, types.ts
        db/                     # EMPTY after extraction (directory removed)
      deploy-commands.ts        # Moved from src/deploy-commands.ts
      package.json              # Bot-specific deps (discord.js, node-cron, etc.)
      tsconfig.json
    api/                        # SCAFFOLD ONLY in Phase 14
      package.json              # Minimal: { "name": "@28k/api", "private": true }
      src/
        index.ts                # Placeholder
    desktop/                    # SCAFFOLD ONLY in Phase 14
      package.json              # Minimal: { "name": "@28k/desktop", "private": true }

  packages/
    db/
      prisma/
        schema.prisma           # THE schema (moved from prisma/)
        migrations/             # Migrations dir
      src/
        client.ts               # PrismaClient singleton + encryption extension
        encryption.ts           # Transparent field encryption ($extends hook)
        crypto.ts               # AES-256-GCM, HKDF key derivation (moved from src/shared/)
        index.ts                # Barrel: re-export db, disconnectDb, ExtendedPrismaClient, Prisma types
      prisma.config.ts          # Prisma 7 config (paths updated)
      package.json              # @prisma/client, @prisma/adapter-pg, pg
      tsconfig.json
    shared/
      src/
        constants.ts            # RANK_PROGRESSION, BRAND_COLORS (without XP_AWARDS re-export)
        xp-engine.ts            # getRankForXP, getNextRankInfo, awardXP, calculateCheckinXP, calculateStreakMultiplier
        xp-constants.ts         # XP_AWARDS, STREAK_CONFIG
        timer-constants.ts      # TIMER_DEFAULTS
        index.ts                # Barrel export
      package.json              # @28k/shared, depends on @28k/db (types only)
      tsconfig.json

  deploy/
    post-receive                # UPDATED: npm -> pnpm, paths -> apps/bot/
  ecosystem.config.cjs          # UPDATED: script path -> apps/bot/dist/index.js
```

### Pattern 1: Internal Packages (Turborepo Recommended)

**What:** Packages export raw TypeScript source; consuming apps transpile them.
**When to use:** Private monorepo packages that will never be published to npm.
**Why:** Avoids separate build step for packages. Changes in packages are immediately picked up by consuming apps' dev servers. No declaration file generation needed.

```json
// packages/db/package.json
{
  "name": "@28k/db",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:deploy": "prisma migrate deploy"
  },
  "dependencies": {
    "@prisma/client": "^7.5.0",
    "@prisma/adapter-pg": "^7.5.0",
    "pg": "^8.20.0"
  },
  "devDependencies": {
    "prisma": "^7.5.0"
  }
}
```

```json
// packages/shared/package.json
{
  "name": "@28k/shared",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@28k/db": "workspace:*"
  }
}
```

### Pattern 2: Decoupled Encryption Module

**What:** The encryption extension currently imports `config` from `core/config.ts` to get `MASTER_ENCRYPTION_KEY`. In `packages/db`, there is no `core/config.ts`. The encryption module must read `process.env.MASTER_ENCRYPTION_KEY` directly.
**When to use:** When extracting modules that have app-specific config imports.

```typescript
// packages/db/src/encryption.ts (CHANGED)
// BEFORE: import { config } from '../core/config.js';
// AFTER: read directly from process.env

function getMasterKey(): Buffer {
  const key = process.env.MASTER_ENCRYPTION_KEY;
  if (!key || key.length !== 64 || !/^[0-9a-fA-F]+$/.test(key)) {
    throw new Error('MASTER_ENCRYPTION_KEY must be a 64-character hex string');
  }
  return Buffer.from(key, 'hex');
}
```

### Pattern 3: Prisma 7 Generator with Custom Output

**What:** Use `prisma-client-js` generator with custom `output` to generate into `packages/db/generated/prisma/client/`.
**Why:** Keeps generated code co-located with the db package. Consumers import from `@28k/db`, never from `@prisma/client` directly.

```prisma
// packages/db/prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
  output   = "../generated/prisma/client"
  runtime  = "nodejs"
}
```

```typescript
// packages/db/src/index.ts
export { db, disconnectDb, type ExtendedPrismaClient } from './client.js';
export * from '../generated/prisma/client/index.js';
```

### Anti-Patterns to Avoid

- **Moving everything at once:** Move one package at a time (db first, then shared, then bot). Test after each move.
- **Keeping `src/db/` and `packages/db/` both existing:** Delete `src/db/` after extraction. Two copies will cause confusion.
- **Importing `@prisma/client` directly in apps:** Always import from `@28k/db`. This centralizes the client and ensures encryption is applied.
- **Using `shamefully-hoist=true`:** Defeats pnpm's strict mode. Use targeted `public-hoist-pattern[]=@prisma/*` only if TS2742 issues appear.
- **Running `prisma generate` from root:** Always use `pnpm --filter @28k/db db:generate` or let Turborepo handle it via `dependsOn`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Lockfile migration | Manual `pnpm install` from scratch | `pnpm import` | Preserves exact resolved versions from `package-lock.json`. Avoids dependency resolution surprises. |
| Build ordering | Custom shell scripts to run builds in sequence | Turborepo `dependsOn` in turbo.json | Turborepo handles DAG-based task ordering, parallelization, and caching automatically. |
| Workspace linking | Manual symlinks or `npm link` | pnpm `workspace:*` protocol | pnpm automatically links workspace packages. `workspace:*` always resolves to the local version. |
| TypeScript config sharing | Copy-paste tsconfig across packages | Shared `tsconfig.base.json` at root with `extends` | One source of truth for compiler options. Per-package tsconfig only overrides `rootDir`/`outDir`. |

**Key insight:** The monorepo tooling (pnpm + Turborepo) handles workspace linking, build ordering, and caching. The migration is primarily a file-moving + import-updating exercise, not a tooling-building one.

## Common Pitfalls

### Pitfall 1: Encryption Module Config Coupling

**What goes wrong:** `src/db/encryption.ts` imports `{ config } from '../core/config.js'` to get `MASTER_ENCRYPTION_KEY`. When moved to `packages/db/`, there is no `core/config.ts`. The import fails.
**Why it happens:** The encryption module was designed for a single-app architecture where all config is centralized.
**How to avoid:** Replace `config.MASTER_ENCRYPTION_KEY` with `process.env.MASTER_ENCRYPTION_KEY` directly. Add runtime validation (throw if missing/invalid). Both bot and API set this env var.
**Warning signs:** `Module not found: ../core/config.js` error after moving encryption.ts to packages/db/.

### Pitfall 2: Constants Re-Export Chain Breaks

**What goes wrong:** `src/shared/constants.ts` re-exports `XP_AWARDS` from `../modules/xp/constants.js`. After migration, `packages/shared/` has no `modules/` directory. The re-export chain breaks.
**Why it happens:** The current `constants.ts` was a convenience re-export point. In the monorepo, `XP_AWARDS` lives directly in `packages/shared/src/xp-constants.ts`.
**How to avoid:** Move `XP_AWARDS` and `STREAK_CONFIG` directly into `packages/shared/src/xp-constants.ts`. Remove the re-export from `constants.ts`. Update the 9 files that import from `xp/constants` to import from `@28k/shared` instead.
**Warning signs:** `Module not found: ../modules/xp/constants.js` in packages/shared/.

### Pitfall 3: Prisma Config Path Resolution

**What goes wrong:** `prisma.config.ts` uses `import.meta.dirname` to resolve paths. Currently at repo root, it points `schema` to `prisma/schema.prisma`. After moving to `packages/db/`, the relative path must change to just `prisma/schema.prisma` (relative to `packages/db/`), but `import.meta.dirname` will be `packages/db/` -- which is correct. The risk is running `prisma` commands from the wrong directory.
**Why it happens:** Turborepo runs scripts in the package's directory by default (correct behavior). But developers may run `prisma generate` from root out of habit.
**How to avoid:** Only run Prisma commands via `pnpm --filter @28k/db db:generate` or `turbo db:generate`. Never `cd` to root and run `prisma generate`.
**Warning signs:** `Cannot find schema.prisma` or `datasource property is required` errors.

### Pitfall 4: VPS Deployment Script Uses npm

**What goes wrong:** `deploy/post-receive` runs `npm ci --production=false` and `npx prisma migrate deploy`. After switching to pnpm, `npm ci` won't work with `pnpm-lock.yaml`. `npx prisma migrate deploy` may resolve the wrong prisma binary.
**Why it happens:** The deploy script was written for npm. pnpm uses different commands.
**How to avoid:** Update `post-receive` to use `pnpm install --frozen-lockfile`, `pnpm turbo build --filter @28k/bot`, and `pnpm --filter @28k/db db:deploy`. Also update the `pm2 start` command to point to `apps/bot/dist/index.js`.
**Warning signs:** Deploy fails on VPS after first push.

### Pitfall 5: Prisma 7 TS2742 in pnpm Monorepo

**What goes wrong:** TypeScript emits TS2742 errors for `DbNull`, `JsonNull`, `AnyNull` because the inferred types reference `@prisma/client-runtime-utils` which pnpm's strict resolution can't find.
**Why it happens:** Prisma 7 restructured its generated client to depend on `@prisma/client-runtime-utils`. pnpm doesn't hoist transitive deps.
**How to avoid:** The core fix landed in Prisma 7.1.0 (PR #28735), and the project is on 7.5.0, so the main issue should be resolved. If TS2742 errors still appear: (1) add `@prisma/client-runtime-utils` as explicit dep in `packages/db`, (2) if that fails, add `public-hoist-pattern[]=@prisma/*` to `.npmrc`.
**Warning signs:** `TS2742: The inferred type of 'X' cannot be named without a reference to @prisma/client-runtime-utils`.

### Pitfall 6: Bot-Only Shared Files Left Behind

**What goes wrong:** `src/shared/` contains 8 files. Only `constants.ts` and `crypto.ts` need extraction to packages. The remaining 6 files (`delivery.ts`, `embeds.ts`, `ai-client.ts`, `ai-types.ts`, `ai-templates.ts`, `types.ts`) are bot-specific (they import discord.js). If these are accidentally moved to `packages/shared/`, they pull discord.js as a dependency of the shared package.
**Why it happens:** The directory is named `shared/` which implies "shared across apps", but most files are bot-specific.
**How to avoid:** `types.ts`, `delivery.ts`, `embeds.ts`, `ai-client.ts`, `ai-types.ts`, `ai-templates.ts` stay in `apps/bot/src/shared/`. Only `constants.ts` content (minus the XP_AWARDS re-export) and `crypto.ts` are extracted.
**Warning signs:** `packages/shared/package.json` has `discord.js` as a dependency.

## Code Examples

### Root package.json

```json
{
  "name": "28k-hq",
  "private": true,
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "dev:bot": "turbo dev --filter @28k/bot",
    "build:bot": "turbo build --filter @28k/bot",
    "db:generate": "turbo db:generate",
    "db:migrate": "pnpm --filter @28k/db db:migrate",
    "deploy-commands": "pnpm --filter @28k/bot deploy-commands"
  },
  "devDependencies": {
    "turbo": "^2.8.0",
    "typescript": "^5.9.3"
  },
  "packageManager": "pnpm@10.32.1"
}
```

### pnpm-workspace.yaml

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

### turbo.json

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalEnv": ["DATABASE_URL", "MASTER_ENCRYPTION_KEY"],
  "tasks": {
    "build": {
      "dependsOn": ["^build", "^db:generate"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "dependsOn": ["^db:generate"],
      "cache": false,
      "persistent": true
    },
    "db:generate": {
      "cache": false
    },
    "db:migrate": {
      "cache": false
    },
    "db:deploy": {
      "cache": false
    }
  }
}
```

### tsconfig.base.json (root)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

### apps/bot/tsconfig.json

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### apps/bot/package.json

```json
{
  "name": "@28k/bot",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "deploy-commands": "tsx src/deploy-commands.ts"
  },
  "dependencies": {
    "@28k/db": "workspace:*",
    "@28k/shared": "workspace:*",
    "@date-fns/tz": "^1.4.1",
    "@openrouter/sdk": "^0.9.11",
    "chrono-node": "^2.9.0",
    "date-fns": "^4.1.0",
    "discord.js": "^14.25.1",
    "dotenv": "^17.3.1",
    "node-cron": "^4.2.1",
    "rss-parser": "^3.13.0",
    "winston": "^3.19.0",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "@types/node": "^25.5.0",
    "@types/node-cron": "^3.0.11",
    "tsx": "^4.21.0",
    "typescript": "^5.9.3"
  }
}
```

### packages/db/prisma.config.ts

```typescript
import path from 'node:path';
import { defineConfig } from '@prisma/config';

export default defineConfig({
  schema: path.join(import.meta.dirname, 'prisma', 'schema.prisma'),
  datasource: {
    url: process.env.DATABASE_URL ?? 'postgresql://user:password@localhost:5432/discord_hustler',
  },
  migrations: {
    path: path.join(import.meta.dirname, 'prisma', 'migrations'),
  },
});
```

### packages/db/src/client.ts (updated)

```typescript
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { withEncryption } from './encryption.js';

const connectionString = process.env.DATABASE_URL ?? 'postgresql://user:password@localhost:5432/discord_hustler';
const adapter = new PrismaPg({ connectionString });

const basePrisma = new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === 'development'
    ? ['query', 'warn', 'error']
    : ['warn', 'error'],
});

export const db = withEncryption(basePrisma);
export type ExtendedPrismaClient = typeof db;

export async function disconnectDb(): Promise<void> {
  await basePrisma.$disconnect();
}
```

### packages/db/src/encryption.ts (updated -- config decoupled)

```typescript
import { PrismaClient } from '@prisma/client';
import { encrypt, decrypt, deriveMemberKey } from './crypto.js';

// CHANGED: Read directly from process.env instead of importing config
function getMasterKey(): Buffer {
  const key = process.env.MASTER_ENCRYPTION_KEY;
  if (!key || key.length !== 64 || !/^[0-9a-fA-F]+$/.test(key)) {
    throw new Error(
      'MASTER_ENCRYPTION_KEY env var must be a 64-character hex string (32 bytes)'
    );
  }
  return Buffer.from(key, 'hex');
}

// ... rest of encryption.ts unchanged
```

### Updated deploy/post-receive

```bash
#!/bin/bash
TARGET="/var/www/discord-hustler"
GIT_DIR="/var/repo/discord-hustler.git"
BRANCH="main"

while read oldrev newrev ref
do
  if [ "$ref" = "refs/heads/$BRANCH" ]; then
    echo "========================================"
    echo "  Deploying $BRANCH to production..."
    echo "========================================"

    echo "[1/5] Checking out latest code..."
    git --work-tree="$TARGET" --git-dir="$GIT_DIR" checkout -f "$BRANCH"
    cd "$TARGET" || exit 1

    echo "[2/5] Installing dependencies..."
    pnpm install --frozen-lockfile

    echo "[3/5] Generating Prisma client + building bot..."
    pnpm turbo build --filter @28k/bot

    echo "[4/5] Running database migrations..."
    pnpm --filter @28k/db db:deploy

    echo "[5/5] Restarting bot..."
    pm2 restart 28k-bot 2>/dev/null || pm2 start ecosystem.config.cjs

    echo "========================================"
    echo "  Deploy complete!"
    echo "========================================"
  fi
done
```

### Updated ecosystem.config.cjs

```javascript
module.exports = {
  apps: [
    {
      name: '28k-bot',
      script: './apps/bot/dist/index.js',
      env: { NODE_ENV: 'production' },
      max_restarts: 10,
      restart_delay: 5000,
      watch: false,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
```

## Complete File Migration Map

### Files moving to packages/db/

| Current Path | New Path | Changes Needed |
|-------------|----------|----------------|
| `prisma/schema.prisma` | `packages/db/prisma/schema.prisma` | Add `output = "../generated/prisma/client"` to generator. Ensure `runtime = "nodejs"`. |
| `prisma.config.ts` (root) | `packages/db/prisma.config.ts` | Path references stay the same (relative to file location). |
| `src/db/client.ts` | `packages/db/src/client.ts` | Remove `config` import. Use `process.env.DATABASE_URL` directly. |
| `src/db/encryption.ts` | `packages/db/src/encryption.ts` | Replace `config.MASTER_ENCRYPTION_KEY` with `process.env.MASTER_ENCRYPTION_KEY`. Replace `import { encrypt, decrypt, deriveMemberKey } from '../shared/crypto.js'` with `./crypto.js`. |
| `src/shared/crypto.ts` | `packages/db/src/crypto.ts` | No changes -- pure Node.js crypto, no app-specific imports. |

### Files moving to packages/shared/

| Current Path | New Path | Changes Needed |
|-------------|----------|----------------|
| `src/shared/constants.ts` (partial) | `packages/shared/src/constants.ts` | Remove `export { XP_AWARDS } from '../modules/xp/constants.js'` re-export. Keep RANK_PROGRESSION, BRAND_COLORS, ACCOUNT_LINK_CAP, etc. |
| `src/modules/xp/constants.ts` | `packages/shared/src/xp-constants.ts` | No changes to content. |
| `src/modules/xp/engine.ts` | `packages/shared/src/xp-engine.ts` | Update imports: `from '../../db/client.js'` -> `from '@28k/db'`, `from '../../shared/constants.js'` -> `from './constants.js'`, `from './constants.js'` -> `from './xp-constants.js'` |
| `src/modules/timer/constants.ts` | `packages/shared/src/timer-constants.ts` | No changes to content. |

### Files staying in apps/bot/ (NOT extracted)

| File | Why It Stays |
|------|-------------|
| `src/shared/types.ts` | Imports discord.js types (Client, ChatInputCommandInteraction, SlashCommandBuilder) |
| `src/shared/delivery.ts` | Imports discord.js (Client, TextChannel, EmbedBuilder) and db/client.ts |
| `src/shared/embeds.ts` | Imports discord.js EmbedBuilder |
| `src/shared/ai-client.ts` | Imports @openrouter/sdk, db/client.ts |
| `src/shared/ai-types.ts` | AI-specific types |
| `src/shared/ai-templates.ts` | AI template utilities |
| `src/core/*` | Bot-specific configuration, client, commands, events, module-loader |
| `src/modules/*` | All 25 modules (internal to bot) |
| `src/deploy-commands.ts` | Bot-specific Discord command registration |

### Import Path Updates in apps/bot/

After extraction, bot files that imported from db/ or referenced extracted constants/XP code need updated imports:

| Old Import | New Import | Affected Files |
|-----------|-----------|----------------|
| `from '../../db/client.js'` (and variants) | `from '@28k/db'` | 78 files |
| `from '../../shared/constants.js'` | `from '@28k/shared'` (for RANK_PROGRESSION, BRAND_COLORS) | 21 files |
| `from '../../shared/crypto.js'` | `from '@28k/db'` (crypto is in db package) | 0 files (only encryption.ts uses it, already moved) |
| `from './constants.js'` (in xp module) | `from '@28k/shared'` | 9 files importing XP_AWARDS |
| `from './engine.js'` (in xp module) | `from '@28k/shared'` | 12 files importing XP engine functions |
| `from '../timer/constants.js'` | `from '@28k/shared'` | 1 file (ai-assistant/index.ts) |

**Important:** The `from '../../shared/constants.js'` import for `BRAND_COLORS` and `RANK_PROGRESSION` changes to `from '@28k/shared'`, but the `from './constants.js'` import within `src/shared/embeds.ts` stays as a relative import (embeds.ts stays in apps/bot/src/shared/ and still imports from the local constants file that now only contains bot-specific re-exports or the shared import is changed).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| npm flat node_modules | pnpm strict symlinks | pnpm 7+ (2022) | Prevents phantom dependencies. `pnpm import` converts lockfile. |
| Lerna for monorepo | Turborepo for build orchestration | 2022-2023 | Lerna is for publishing. Turborepo is for builds. Different tools for different jobs. |
| TypeScript project references | Internal packages (raw .ts exports) | Turborepo blog post 2024 | Simpler config, no separate build step for packages. |
| Prisma generates to node_modules | Custom output directory | Prisma 5+ | `output` field in generator block. Essential for monorepo packages. |
| Prisma TS2742 with pnpm | Fixed in Prisma 7.1.0 | PR #28735, Nov 2025 | DbNull/JsonNull/AnyNull types now properly exported. Project on 7.5.0 should be fine. |

**Deprecated/outdated:**
- `shamefully-hoist=true`: Rarely needed now. Prefer `public-hoist-pattern[]` for targeted hoisting.
- npm workspace support: npm supports workspaces but hoists everything flat, defeating isolation.

## Open Questions

1. **Will Prisma 7.5.0 + pnpm work without TS2742 workarounds?**
   - What we know: Core fix landed in 7.1.0 (PR #28735). Project is on 7.5.0. Some edge cases still reported on GitHub issue #28581 (still open).
   - What's unclear: Whether the custom `output` directory combined with the encryption `$extends` triggers any remaining TS2742 edge cases.
   - Recommendation: Try the clean setup first. If TS2742 appears, add `@prisma/client-runtime-utils` as explicit dep. If that fails, add `public-hoist-pattern[]=@prisma/*` to `.npmrc`. Test with `tsc --noEmit` immediately after setup.

2. **Does `pnpm import` handle the existing lockfile cleanly?**
   - What we know: `pnpm import` reads `package-lock.json` and generates `pnpm-lock.yaml`. Works for single-package repos.
   - What's unclear: Behavior when the repo is being restructured into workspaces simultaneously.
   - Recommendation: Run `pnpm import` BEFORE restructuring. Get `pnpm-lock.yaml` first from the flat structure, then restructure into workspaces and run `pnpm install` to update it.

3. **VPS pnpm availability**
   - What we know: The VPS uses npm currently. pnpm may not be installed.
   - What's unclear: Whether `corepack` is available on the VPS Node.js installation.
   - Recommendation: Add `corepack enable && corepack prepare pnpm@10 --activate` to the deploy script, or install pnpm globally on the VPS before the first deploy. Also ensure the `packageManager` field in root `package.json` triggers corepack.

## Sources

### Primary (HIGH confidence)
- [Prisma pnpm workspaces guide](https://www.prisma.io/docs/guides/use-prisma-in-pnpm-workspaces) -- Official setup for Prisma in pnpm workspace monorepo
- [Prisma Turborepo guide](https://www.prisma.io/docs/guides/turborepo) -- turbo.json task configuration for Prisma
- [Turborepo TypeScript guide](https://turborepo.dev/docs/guides/tools/typescript) -- Internal packages pattern, tsconfig recommendations
- [Turborepo blog: You might not need TypeScript project references](https://turborepo.dev/blog/you-might-not-need-typescript-project-references) -- Rationale for internal packages over project references
- [pnpm import CLI docs](https://pnpm.io/cli/import) -- Convert npm/yarn lockfiles to pnpm format

### Secondary (MEDIUM confidence)
- [Prisma PR #28735](https://github.com/prisma/prisma/pull/28735) -- Fix for pnpm monorepo TS2742 issues, merged into 7.1.0
- [Prisma issue #28581](https://github.com/prisma/prisma/issues/28581) -- TS2742 tracking issue, fix confirmed in 7.1.0 but issue still open (edge cases)
- [Nhost monorepo migration post-mortem](https://nhost.io/blog/how-we-configured-pnpm-and-turborepo-for-our-monorepo) -- Real-world migration experience

### Tertiary (LOW confidence)
- Community reports on GitHub about Prisma 7.5 + pnpm edge cases -- not verified against project's specific setup

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - pnpm + Turborepo are well-documented, versions verified
- Architecture: HIGH - full codebase review completed, every file mapped
- Pitfalls: HIGH - Prisma TS2742 fix verified (7.1.0), config coupling identified from code review
- File migration: HIGH - all 78 db/client imports counted, all 21 constants imports counted

**Research date:** 2026-03-21
**Valid until:** 2026-04-21 (stable stack, unlikely to change)
