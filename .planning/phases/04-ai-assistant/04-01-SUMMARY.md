---
phase: 04-ai-assistant
plan: 01
subsystem: ai
tags: [openrouter, deepseek, qwen, conversation, memory, encryption, prisma]

# Dependency graph
requires:
  - phase: 01-foundation-and-identity
    provides: "Module system, Prisma schema, encryption extension, Discord client"
  - phase: 02-daily-engagement-loop
    provides: "XP engine, check-ins, goals, scheduler, OpenRouter SDK pattern"
provides:
  - "ConversationMessage and ConversationSummary Prisma models"
  - "Conversation memory service with rolling summarization"
  - "Ace AI personality with layered system prompts"
  - "DM chat handler with per-member lock and daily cap"
  - "/ask and /wipe-history slash commands"
  - "AI assistant module auto-discovered by module loader"
affects: [04-ai-assistant]

# Tech tracking
tech-stack:
  added: []
  patterns: ["per-member promise chain lock for sequential processing", "rolling conversation summarization with token budget", "AI model fallback chain (DeepSeek -> Qwen)"]

key-files:
  created:
    - src/modules/ai-assistant/memory.ts
    - src/modules/ai-assistant/personality.ts
    - src/modules/ai-assistant/chat.ts
    - src/modules/ai-assistant/commands.ts
    - src/modules/ai-assistant/index.ts
  modified:
    - prisma/schema.prisma
    - src/db/encryption.ts
    - src/deploy-commands.ts

key-decisions:
  - "Per-member promise chain lock for sequential message processing (no mutex library needed)"
  - "100K token context budget (~70% of DeepSeek 164K window) with 20K system prompt reserve"
  - "DeepSeek V3.2 primary, Qwen 3.5 Plus fallback for reliability"
  - "50 messages/day cap per member to control API costs"
  - "Conversation messages encrypted at rest via existing encryption extension"

patterns-established:
  - "Promise chain lock: Map<string, Promise<void>> with .then() chaining for per-key serialization"
  - "AI model fallback: try primary, catch -> try fallback, catch -> friendly error"
  - "Token budget management: estimate tokens, trim oldest first, compress if still over budget"

requirements-completed: [AI-01]

# Metrics
duration: 4min
completed: 2026-03-20
---

# Phase 4 Plan 1: AI Assistant Core Summary

**Conversational AI assistant "Ace" with DM chat, /ask command, rolling memory summarization, and Jarvis-like personality using DeepSeek V3.2 via OpenRouter**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-20T14:34:23Z
- **Completed:** 2026-03-20T14:38:48Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- ConversationMessage and ConversationSummary models with encrypted content fields
- Full conversation memory service: storage, retrieval, context assembly, rolling summarization, export, and wipe
- Ace personality with layered system prompts pulling member profile, goals, streak, recent activity
- DM chat handler with per-member processing lock, daily 50-message cap, DeepSeek/Qwen fallback
- /ask (ephemeral from any channel) and /wipe-history (export JSON + delete) slash commands
- Module auto-discovered by existing module loader convention

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema extensions and conversation memory service** - `3c1e037` (feat)
2. **Task 2: Personality, chat handler, commands, and module registration** - `3fbb721` (feat)

## Files Created/Modified
- `prisma/schema.prisma` - ConversationMessage, ConversationSummary models; MemberSchedule accountability fields
- `src/db/encryption.ts` - Added ConversationMessage.content and ConversationSummary.summary to ENCRYPTED_FIELDS
- `src/modules/ai-assistant/memory.ts` - Conversation storage, retrieval, summarization, token budget management
- `src/modules/ai-assistant/personality.ts` - System prompt builder with Ace character and member context layers
- `src/modules/ai-assistant/chat.ts` - Core chat handler with per-member lock, daily cap, model fallback
- `src/modules/ai-assistant/commands.ts` - /ask and /wipe-history slash command definitions and handlers
- `src/modules/ai-assistant/index.ts` - Module registration with DM listener and command wiring
- `src/deploy-commands.ts` - Added /ask and /wipe-history (15 total commands)

## Decisions Made
- Per-member promise chain lock instead of mutex library -- simpler, zero dependencies, same sequential guarantee
- 100K token context budget with 20K system prompt reserve and 4K output reserve -- conservative to avoid truncation
- Daily 50-message cap checked in member's timezone using TZDate -- resets at midnight local time
- Message splitting at 2000 chars (Discord limit) preferring newline boundaries for readability
- Conversation messages encrypted at rest using existing encryption extension -- no new crypto patterns needed

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Database not running locally so `prisma db push` could not execute -- schema validates cleanly and Prisma client generates successfully

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- AI assistant core is complete and auto-discovered by module loader
- Ready for Plan 02 (nudge engine, proactive check-ins, contextual suggestions)
- MemberSchedule.accountabilityLevel, nudgeTime, lastNudgeAt fields ready for nudge system

---
*Phase: 04-ai-assistant*
*Completed: 2026-03-20*
