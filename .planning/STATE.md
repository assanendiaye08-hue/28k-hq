# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-20)

**Core value:** When a member opens Discord, the environment pulls them into productive action -- not gaming. The server must make hustling feel like the game.
**Current focus:** Phase 2: Daily Engagement Loop

## Current Position

Phase: 2 of 6 (Daily Engagement Loop)
Plan: 1 of 3 in current phase
Status: In Progress
Last activity: 2026-03-20 -- Completed 02-01-PLAN.md (Schema extensions, XP engine, rank sync, delivery utility)

Progress: [███░░░░░░░] 29%

## Performance Metrics

**Velocity:**
- Total plans completed: 5
- Average duration: 6 min
- Total execution time: 0.47 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation-and-identity | 4 | 23 min | 6 min |
| 02-daily-engagement-loop | 1 | 5 min | 5 min |

**Recent Trend:**
- Last 5 plans: 01-02 (6 min), 01-03 (5 min), 01-04 (7 min), 02-01 (5 min)
- Trend: stable

*Updated after each plan completion*
| Phase 01 P01 | 5min | 2 tasks | 17 files |
| Phase 01 P02 | 6min | 2 tasks | 9 files |
| Phase 01 P03 | 5min | 2 tasks | 9 files |
| Phase 01 P04 | 7min | 2 tasks | 8 files |
| Phase 02 P01 | 5min | 2 tasks | 9 files |

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

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-03-20
Stopped at: Completed 02-01-PLAN.md (XP engine, schema extensions, rank sync, delivery utility)
Resume file: None
