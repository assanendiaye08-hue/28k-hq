---
phase: quick-4
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
autonomous: false
requirements: ["QUICK-4"]
must_haves:
  truths:
    - "tsc build produces dist/modules/*/index.js files preserving directory structure"
    - "Bot starts on VPS with all 25 modules loaded and slash commands registered"
    - "Database connectivity works via PrismaPg adapter on VPS"
  artifacts:
    - path: "package.json"
      provides: "build script using tsc instead of tsup"
      contains: '"build": "tsc"'
    - path: "dist/modules/"
      provides: "Individual module directories with index.js files"
  key_links:
    - from: "src/core/module-loader.ts"
      to: "dist/modules/*/index.js"
      via: "readdir + dynamic import"
      pattern: "import\\(modulePath\\)"
    - from: "src/db/client.ts"
      to: "@prisma/adapter-pg"
      via: "PrismaPg adapter constructor"
      pattern: "new PrismaPg"
---

<objective>
Fix the broken build (tsup bundles into single file, but module-loader needs dist/modules/*/index.js), push to GitHub, deploy on VPS via git pull, and verify full bot functionality.

Purpose: The bot cannot start on the VPS because tsup eliminates the module directory structure. Switching to tsc preserves it. The Prisma adapter change (already in client.ts) is also needed for Prisma 7.
Output: Running bot on VPS with all 25 modules loaded, commands registered, cron jobs scheduled.
</objective>

<execution_context>
@/Users/ceoassane/.claude/get-shit-done/workflows/execute-plan.md
@/Users/ceoassane/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@package.json
@tsconfig.json
@src/core/module-loader.ts
@src/db/client.ts
@prisma/schema.prisma
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix build script, verify locally, push to GitHub</name>
  <files>package.json</files>
  <action>
1. In package.json, change the build script from `"build": "tsup src/index.ts --format esm --dts"` to `"build": "tsc"`.
   - This is the ONLY change needed in package.json. The Prisma adapter deps (@prisma/adapter-pg, pg) are already present.
   - prisma/schema.prisma already has the `runtime = "nodejs"` line removed (confirmed by reading it above -- no runtime line present in generator block).
   - src/db/client.ts already uses PrismaPg adapter (confirmed by reading it above).

2. Verify the build works locally:
   ```
   rm -rf dist && npm run build
   ```
   Confirm that `dist/modules/` directory exists with subdirectories, each containing `index.js`.

3. Quick sanity check:
   ```
   ls dist/modules/ | wc -l
   ```
   Should show ~25 module directories (the exact number of modules in src/modules/).

4. Commit all changes and push:
   ```
   git add package.json prisma/schema.prisma src/db/client.ts package-lock.json
   git commit -m "fix: switch build to tsc and add Prisma 7 PrismaPg adapter"
   git push origin main
   ```
   Note: prisma/schema.prisma and src/db/client.ts may already be committed -- git add will be a no-op for unchanged files. The key change is package.json build script.
  </action>
  <verify>
    <automated>cd /Volumes/Vault/Discord\ Hustler && rm -rf dist && npm run build && test -d dist/modules && ls dist/modules/ | wc -l</automated>
    <manual>Output should show ~25 module directories. No tsc errors.</manual>
  </verify>
  <done>tsc build succeeds, dist/modules/ contains all module subdirectories with index.js files, changes pushed to GitHub.</done>
</task>

<task type="auto">
  <name>Task 2: Deploy on VPS via git pull and start bot</name>
  <files></files>
  <action>
SSH to VPS: `ssh -i ~/.ssh/hetzner root@168.119.235.79`

All commands run on VPS at `/opt/discord-hustler`:

1. Stop the bot:
   ```
   systemctl stop 28k-hq
   ```

2. Check if /opt/discord-hustler is a git repo:
   ```
   cd /opt/discord-hustler && git status
   ```
   - If it IS a git repo: `git pull origin main` (or `git fetch origin && git reset --hard origin/main` if there are local conflicts)
   - If it is NOT a git repo:
     ```
     cd /opt/discord-hustler
     git init
     git remote add origin https://github.com/assanendiaye08-hue/28k-hq.git
     git fetch origin
     git reset --hard origin/main
     ```

3. Install dependencies:
   ```
   npm install
   ```

4. Regenerate Prisma client (load env vars for DATABASE_URL):
   ```
   export $(cat .env | xargs) && npx prisma generate
   ```

5. Sync database schema:
   ```
   export $(cat .env | xargs) && npx prisma db push
   ```

6. Clean build:
   ```
   rm -rf dist && npm run build
   ```

7. Verify dist structure on VPS:
   ```
   ls dist/modules/ | wc -l
   ```
   Must show ~25 directories.

8. Start the bot:
   ```
   systemctl start 28k-hq
   ```

9. Wait 5 seconds, then check logs:
   ```
   sleep 5 && journalctl -u 28k-hq --no-pager -n 80
   ```

10. MUST verify in logs:
    - All 25 modules loaded (look for "Module loading complete: 25 module(s) loaded" or similar)
    - Slash commands registered (look for "commands registered" or "REST" log)
    - No error-level log entries
    - Database connected (no Prisma connection errors)
    - Cron jobs scheduled (look for "Scheduled" or "cron" entries)

If any errors appear, diagnose and fix. Common issues:
- Missing env vars: check .env file has DATABASE_URL, DISCORD_TOKEN, etc.
- Prisma generate failed: may need `npx prisma generate --no-engine` for Prisma 7
- Permission issues: check file ownership
  </action>
  <verify>
    <automated>ssh -i ~/.ssh/hetzner root@168.119.235.79 "journalctl -u 28k-hq --no-pager -n 50 | grep -c 'Loaded module'" </automated>
    <manual>Should show 25 (all modules loaded). No errors in journalctl output.</manual>
  </verify>
  <done>Bot is running on VPS, all 25 modules loaded, slash commands registered, no errors in logs, database connected via PrismaPg adapter.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Integration test -- verify bot in Discord</name>
  <what-built>
Full deployment pipeline: build fix (tsc), Prisma 7 adapter, git-based deploy to VPS. Bot should be running with all features.
  </what-built>
  <how-to-verify>
Before this checkpoint, the executor will:
1. Run `ssh -i ~/.ssh/hetzner root@168.119.235.79 "cd /opt/discord-hustler && export \$(cat .env | xargs) && node -e \"const{db}=require('./dist/db/client.js');db.\$queryRaw\\\`SELECT 1\\\`.then(r=>console.log('DB OK',r)).catch(e=>console.error('DB FAIL',e))\""` to verify DB connectivity (or equivalent ESM import).
2. Run deploy-commands on VPS: `ssh -i ~/.ssh/hetzner root@168.119.235.79 "cd /opt/discord-hustler && export \$(cat .env | xargs) && npx tsx src/deploy-commands.ts"` to re-register all slash commands.
3. Verify no error logs: `ssh -i ~/.ssh/hetzner root@168.119.235.79 "journalctl -u 28k-hq --no-pager -n 100 | grep -i error"`

Then YOU (the user) should test in Discord:

**Core commands to test:**
1. `/profile` -- shows your member profile
2. `/checkin` -- daily check-in works
3. `/goals list` -- lists your goals
4. `/leaderboard` -- shows XP leaderboard
5. `/timer start` -- starts a productivity timer
6. `/remind` -- sets a reminder
7. `/recap` -- triggers monthly recap
8. DM the bot a question -- AI assistant responds

**What to look for:**
- Commands respond without errors
- Embeds render correctly
- Bot shows online status in server
- No "interaction failed" messages
  </how-to-verify>
  <resume-signal>Type "approved" if bot works, or describe any issues you encounter.</resume-signal>
</task>

</tasks>

<verification>
- tsc build preserves dist/modules/ directory structure (locally and on VPS)
- Bot process running on VPS (`systemctl status 28k-hq` shows active)
- All 25 modules loaded in journalctl logs
- Slash commands registered with Discord
- No error-level log entries after startup
- Database queries succeed via PrismaPg adapter
</verification>

<success_criteria>
- package.json build script changed from tsup to tsc
- Changes pushed to GitHub and pulled on VPS
- Bot running on VPS with all 25 modules loaded
- All slash commands registered and responding in Discord
- Database connected and queries working
- No errors in systemd journal logs
</success_criteria>

<output>
After completion, create `.planning/quick/4-fix-build-deploy-via-git-chain-and-full-/4-SUMMARY.md`
</output>
