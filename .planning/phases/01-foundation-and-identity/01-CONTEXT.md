# Phase 1: Foundation and Identity - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Deploy the Discord bot on the member's VPS with auto-deploy. Set up the Discord server structure (channels, categories, roles, permissions). Implement fluid member profiles with AI-powered setup. Build multi-account identity linking with code verification. Create per-member private spaces (DM or private channel, member's choice). Implement per-member data encryption at rest with recovery keys.

</domain>

<decisions>
## Implementation Decisions

### Onboarding Flow
- New member lands in #welcome (only visible channel) — everything else is locked
- #welcome contains: short hustler manifesto (not cringe) + quick overview of how the server works + CTA to run `/setup`
- `/setup` triggers a smooth interactive flow or modal form (Claude's discretion on which works better)
- After setup completes, all server channels unlock — feels like "unlocking" the server
- Channels are gated via Discord roles — bot assigns a "Member" role on setup completion

### Profile Design
- Bot asks natural guided questions during setup to map the member comprehensively (interests, current situation, goals, what they want to learn)
- AI (via OpenRouter) processes answers behind the scenes — extracts structured tags and categories from natural language responses
- Both raw answers (for AI context in conversations) and structured tags (for leaderboards/feeds/matching) are stored
- Members update their profile two ways: `/profile` command for structured edits, or naturally through AI conversation in their private space ("I'm pivoting to content creation")
- Partial profile visibility — members control which parts are public vs private. Other members can view public parts via `/profile @user`

### Account Linking
- Code-based verification: run `/link` on account A → get a time-limited code → run `/verify [code]` on account B within 5 minutes
- Seamless identity — all linked accounts treated exactly the same. Same name on leaderboards, same XP, no primary/secondary distinction
- Cap at 3-5 linked accounts per member (Claude decides exact number)
- Self-service unlinking via `/unlink` — member can remove any linked account themselves

### Server Layout
- Minimal/clean with hub elements — few channels by default, relevant ones surface based on member's interests
- Voice channels: 1-2 permanent always-on rooms (for spontaneous co-working) + on-demand channels created for scheduled sessions
- Role system: hustler-themed rank names (Grinder → Hustler → Boss → Mogul, etc.) + AI-managed interest tags
- Interest tags are dynamically created/normalized by the AI — "video editing" and "editing" merge into one. Roles with 0 members are auto-cleaned up

### Per-Member Encryption
- Private data encrypted at rest with per-member keys
- Member receives a personal recovery key via DM during setup
- Raw database access reveals only encrypted blobs
- Bot process can decrypt at runtime (necessary for features) but direct DB access cannot

### Claude's Discretion
- Exact setup flow implementation (modal form vs sequential prompts — pick what works best in Discord)
- Exact profile setup questions (as long as they map the member comprehensively)
- Specific channel names and category organization
- Rank name progression and XP thresholds
- Account link cap (3 or 5)
- Recovery key format and delivery UX
- Encryption implementation details

</decisions>

<specifics>
## Specific Ideas

- Welcome manifesto should be short and not "corporate motivational poster" energy — match the real talk hustler vibe of the group
- Profiles should feel like talking to a person during setup, not filling out a form
- The AI should normalize interest tags intelligently — prevent clutter from synonyms
- Server should feel focused, not overwhelming — if a member only sees 8-10 channels, that's fine

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation-and-identity*
*Context gathered: 2026-03-20*
