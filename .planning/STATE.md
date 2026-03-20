# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-20)

**Core value:** When a member opens Discord, the environment pulls them into productive action -- not gaming. The server must make hustling feel like the game.
**Current focus:** Phase 3: Competition and Social Proof

## Current Position

Phase: 3 of 6 (Competition and Social Proof)
Plan: 3 of 3 in current phase (PHASE COMPLETE)
Status: Phase Complete
Last activity: 2026-03-20 -- Completed 03-03-PLAN.md (Seasonal system with auto-bootstrap, hall-of-fame, and /season command)

Progress: [███████░░░] 67%

## Performance Metrics

**Velocity:**
- Total plans completed: 10
- Average duration: 5 min
- Total execution time: 0.88 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation-and-identity | 4 | 23 min | 6 min |
| 02-daily-engagement-loop | 3 | 17 min | 6 min |
| 03-competition-and-social-proof | 3 | 13 min | 4 min |

**Recent Trend:**
- Last 5 plans: 02-02 (6 min), 02-03 (6 min), 03-01 (4 min), 03-02 (4 min), 03-03 (5 min)
- Trend: stable/improving

*Updated after each plan completion*
| Phase 01 P01 | 5min | 2 tasks | 17 files |
| Phase 01 P02 | 6min | 2 tasks | 9 files |
| Phase 01 P03 | 5min | 2 tasks | 9 files |
| Phase 01 P04 | 7min | 2 tasks | 8 files |
| Phase 02 P01 | 5min | 2 tasks | 9 files |
| Phase 02 P02 | 6min | 2 tasks | 8 files |
| Phase 02 P03 | 6min | 2 tasks | 6 files |
| Phase 03 P01 | 4min | 2 tasks | 12 files |
| Phase 03 P02 | 4min | 2 tasks | 7 files |
| Phase 03 P03 | 5min | 2 tasks | 7 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Hosting on own VPS, not Railway -- deploy via git push with auto-restart
- [Roadmap]: AI via OpenRouter (not direct Anthropic/OpenAI SDK) -- flexible model selection
- [Roadmap]: Member profiles are fluid/customizable interests, not rigid lane assignment
- [Roadmap]: Multi-account identity system -- members link multiple Discord accounts to one profile
- [Roadmap]: Private space is member's choice: DM or private server channel
- [Roadmap]: Seasonal system is Valorant-style with archived past seasons
- [Roadmap]: Phases 3 and 4 can run in parallel after Phase 2
- [01-01]: ICommandRegistry/IEventBus interfaces in shared/types.ts to avoid circular imports
- [01-01]: DB placeholder uses getDb/setDb pattern for Plan 02 to wire up real PrismaClient
- [01-01]: Module loader resolves .js extensions (NodeNext ESM module resolution)
- [01-01]: Used zod 4 for config validation -- API compatible with planned patterns
- [01-02]: Prisma 7 requires prisma.config.ts for datasource URL (no longer in schema.prisma)
- [01-02]: MemberProfile currentFocus and workStyle are nullable (may not exist during initial setup)
- [01-02]: Encryption extension uses async $allOperations with inferred types for Prisma 7 compatibility
- [01-02]: Recovery key format: DHKEY-<base64url> with human-readable prefix
- [01-03]: Used plan-specified channel layout (WELCOME, THE GRIND, RESOURCES, VOICE, PRIVATE SPACES) over constants.ts SERVER_CATEGORIES
- [01-03]: DM conversation with awaitMessages instead of modals -- feels like talking to a person, not filling a form
- [01-03]: Space preference parsing: "2", "channel", "server" -> CHANNEL; everything else -> DM
- [01-03]: Recovery key hash (SHA-256) stored in Member record; actual key sent once via DM only
- [01-04]: OpenRouter SDK uses camelCase API (responseFormat, jsonSchema) not snake_case from research doc
- [01-04]: Lazy tag extraction on first /profile view + async extraction on memberSetupComplete event
- [01-04]: Interest tags as neutral grey Discord roles (0x95a5a6) -- distinct from rank roles
- [01-04]: Account linking uses Prisma interactive $transaction for atomic code verification
- [01-04]: Visibility select menu allows zero selections (all fields private) via setMinValues(0)
- [02-01]: Prisma 7 generates XPTransaction accessor as xPTransaction (capital P after x) -- use tx.xPTransaction
- [02-01]: RankInfo type widened from readonly const tuple to plain interface for cross-module compatibility
- [02-01]: XP_AWARDS re-exported from shared/constants.ts for onboarding module convenience
- [02-02]: Installed @date-fns/tz for timezone-aware streak tracking using TZDate
- [02-02]: Deploy script imports command builders from modules rather than duplicating definitions
- [02-02]: Goal autocomplete filters by command: /progress shows only MEASURABLE, /completegoal shows all active
- [02-03]: Used node-cron schedule() over createTask() for better TypeScript type support via @types/node-cron
- [02-03]: IANA timezone validation uses Intl.DateTimeFormat try/catch -- no manual timezone list needed
- [02-03]: Brief tone descriptions map to natural language for richer AI system prompts
- [02-03]: Sunday planning reminder time parsing supports both HH:mm and am/pm formats with deduplication
- [02-03]: Interest tag cleanup runs at 4:00 AM UTC (low-traffic time)
- [03-01]: Voice sessions use in-memory Map for active tracking with DB persistence on end
- [03-01]: Self-mute and self-deafen continue tracking (deep focus); only server-deafen pauses
- [03-01]: Lessons award 35 XP vs wins 30 XP to encourage vulnerability in sharing failures
- [03-01]: Session reconstruction on bot ready uses startedAt=now (no credit for bot downtime)
- [03-02]: Message editing for silent leaderboard updates -- edits generate no Discord notifications
- [03-02]: Streaks are lifetime-only (not seasonal) representing continuous consistency
- [03-02]: Event-driven refresh uses 2-minute debounce to prevent spam
- [03-02]: Module auto-discovered by existing module loader (no manual wiring needed)
- [03-03]: No data destruction during season transitions -- seasonal rankings are date-range queries
- [03-03]: Snapshot-based archival captures every member at season end for permanent display
- [03-03]: Champion role stored in BotConfig with 7-day expiry for daily cleanup
- [03-03]: Season module auto-discovered alphabetically after leaderboard by loader convention

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-03-20
Stopped at: Completed 03-03-PLAN.md (Seasonal system with auto-bootstrap, hall-of-fame, /season command -- Phase 3 complete)
Resume file: None
