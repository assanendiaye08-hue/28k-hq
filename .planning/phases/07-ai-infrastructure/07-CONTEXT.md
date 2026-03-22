# Phase 7: AI Infrastructure - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Centralize all OpenRouter API calls into a single shared client with per-request token tracking, per-member daily token budgets with silent degradation, admin cost visibility (/cost command), tiered memory system (hot/warm/cold), and configurable model routing with hot-swappable model selection. This is infrastructure — no user-facing features, only plumbing that all subsequent phases depend on.

</domain>

<decisions>
## Implementation Decisions

### Budget & Degradation
- Default daily budget: 500K tokens per member (~$0.10/day) — generous, only catches abuse
- Daily budget only, no monthly — simple enough for 10-25 member scale
- Silent degradation when budget hit — AI responses become template-based (still useful, just not AI-generated). Member doesn't see an error or message about limits. Resets at midnight member's timezone
- Admin can override per-member budgets via /cost set-budget @user — raise for power users, lower for suspicious accounts

### Cost Visibility (Admin)
- /cost command shows:
  - Today's total tokens + per-member breakdown (top users, estimated cost)
  - Month-to-date running total, daily average, projected monthly cost
  - Per-feature breakdown (chat vs briefs vs content filtering vs nudges)
- No automatic spike alerts (skip #bot-log alerts for now)

### Tiered Memory
- **Protected data (never compressed):**
  - Member's inspirations (who they admire and why)
  - All active goals at any level
  - Claude determines what else should be protected (personal details, reflection breakthroughs, etc.)
- **Compression aggressiveness:** Conservative — keep more detail in weekly summaries, higher-level monthly summaries. With Grok's 2M window, we have headroom
- **Transparency:** Never mention compressed memory to the member — seamless experience. Jarvis uses whatever context is available naturally

### Model Routing
- **Grok 4.1 Fast as primary for everything** — chat, briefs, nudges, content filtering, structured output
- **DeepSeek V3.2 as fallback** — only used when Grok fails or is unavailable
- **Hot-swappable:** /admin set-model command changes the active model immediately for new requests, no restart needed
- Model config stored in BotConfig (DB), not .env — enables runtime switching

### Claude's Discretion
- What additional data should be protected from compression (personal details, reflection insights, etc.)
- Exact token tracking implementation (per-request middleware vs response parsing)
- How tiered memory assembles prompts — exact hot/warm/cold boundaries and summarization triggers
- /cost command embed design and layout

</decisions>

<specifics>
## Specific Ideas

- With Grok's 2M context window + conservative compression, most members' full history may fit without summarization for months. The tiered system is insurance, not the default path
- Budget system needs to account for all AI calls — not just chat, but briefs, nudges, content filtering, reflection questions, goal decomposition (future phases)
- The centralized client is the single point where token tracking, model routing, and budget enforcement all happen — one place to control everything

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 07-ai-infrastructure*
*Context gathered: 2026-03-20*
