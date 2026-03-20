# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-20)

**Core value:** When a member opens Discord, the environment pulls them into productive action -- not gaming. The server must make hustling feel like the game.
**Current focus:** Phase 6: Polish and Launch Readiness

## Current Position

Phase: 6 of 6 (Polish and Launch Readiness)
Plan: 3 of 3 in current phase
Status: Complete
Last activity: 2026-03-20 -- Completed 06-03-PLAN.md (Hardening module for unattended operation)

Progress: [██████████████████████] 100%

## Performance Metrics

**Velocity:**
- Total plans completed: 18
- Average duration: 5 min
- Total execution time: 1.40 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation-and-identity | 4 | 23 min | 6 min |
| 02-daily-engagement-loop | 3 | 17 min | 6 min |
| 03-competition-and-social-proof | 3 | 13 min | 4 min |
| 04-ai-assistant | 2 | 9 min | 5 min |
| 05-content-sessions-and-trust | 3 | 11 min | 4 min |
| 06-polish-and-launch-readiness | 3 | 12 min | 4 min |

**Recent Trend:**
- Last 5 plans: 05-03 (3 min), 06-01 (5 min), 06-02 (3 min), 06-03 (4 min)
- Trend: stable

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
| Phase 04 P01 | 4min | 2 tasks | 8 files |
| Phase 04 P02 | 5min | 2 tasks | 8 files |
| Phase 05 P01 | 3min | 2 tasks | 9 files |
| Phase 05 P02 | 5min | 2 tasks | 12 files |
| Phase 05 P03 | 3min | 2 tasks | 7 files |
| Phase 06 P01 | 5min | 2 tasks | 16 files |
| Phase 06 P02 | 3min | 2 tasks | 7 files |
| Phase 06 P03 | 4min | 2 tasks | 5 files |

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
- [04-01]: Per-member promise chain lock for sequential message processing (no mutex library needed)
- [04-01]: 100K token context budget (~70% of DeepSeek 164K window) with 20K system prompt reserve
- [04-01]: DeepSeek V3.2 primary, Qwen 3.5 Plus fallback for AI chat reliability
- [04-01]: Daily 50-message cap per member checked in member's timezone
- [04-01]: Conversation messages encrypted at rest via existing encryption extension
- [04-02]: NUDGE_MARKER prefix on stored nudge messages enables per-day counting without extra DB field
- [04-02]: Evening nudge sweep at 21:00 UTC is fallback; per-member cron tasks are primary scheduling
- [04-02]: Default nudge time 21:00 set on first /accountability usage
- [04-02]: generateBrief extended with db param for conversation history and community pulse loading
- [Phase 05-01]: RESOURCE_SHARE XP type added to both Prisma enum and engine TypeScript type union
- [Phase 05-01]: Fire-and-forget AI tagging updates thread name asynchronously after creation
- [Phase 05-01]: Single cooldown map per member across all 3 resource channels (not per-channel)
- [Phase 05-02]: SESSION_HOST XP type added to both Prisma enum and engine TypeScript type union
- [Phase 05-02]: Voice channels created under Lock In category for automatic voice-tracker XP tracking
- [Phase 05-02]: Session module only awards host bonus (10 XP) -- voice tracker handles all time-based XP
- [Phase 05-02]: Natural language time parsing in commands.ts instead of date-fns dependency
- [Phase 05-02]: setTimeout for upcoming scheduled sessions instead of node-cron (session-scoped)
- [Phase 05-03]: creatorMemberId extraction added alongside memberId checks in encryption extension for LockInSession support
- [Phase 05-03]: Private space channel fallback for /mydata when DMs are closed -- recreates AttachmentBuilder for second delivery attempt
- [Phase 05-03]: Role stripping after DB deletion uses fetched accounts list from before cascade delete
- [Phase 06-01]: NotificationType string union (not Prisma enum) for lightweight type safety
- [Phase 06-01]: General notifications skip preference lookup for efficiency
- [Phase 06-01]: auto-feed channel added alongside resource channels (not replacing) per research
- [Phase 06-02]: Sequential AI classification (not parallel) to respect OpenRouter rate limits
- [Phase 06-02]: Link-based deduplication (FeedPost.link) for cross-restart safety
- [Phase 06-02]: Per-source approval rates in AI prompts for feedback-driven learning
- [Phase 06-02]: 4 daily cron cycles each posting top 1 item for 2-4 items/day spread
- [Phase 06-03]: GuildMemberRemove handler accepts GuildMember | PartialGuildMember for type safety
- [Phase 06-03]: Recovery uses updateMany for bulk goal resolution instead of per-record updates
- [Phase 06-03]: Rejoin timeout defaults to restore (non-destructive) rather than requiring explicit choice
- [Phase 06-03]: Both onboarding and hardening guildMemberAdd handlers fire independently -- dual DMs acceptable

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-03-20
Stopped at: Completed 06-03-PLAN.md (Hardening module for unattended operation) -- ALL PHASES COMPLETE
Resume file: None
