# Phase 4: AI Assistant - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Each member gets a personal AI assistant via DMs — conversational chat, context-aware morning briefs, and accountability nudges. Powered by OpenRouter (DeepSeek v3.2 preferred, Qwen 3.5 Plus as fallback if context limits are a problem). The AI is a Jarvis-like personal operator, not a mentor or sage.

</domain>

<decisions>
## Implementation Decisions

### AI Personality and Tone
- **Character type**: Jarvis-like assistant with accountability — sharp, efficient, has your back, calls you out when needed
- **Baseline tone**: Hustler bro energy — direct, uses slang, keeps it real. But not a mentor/sage — more like a personal operator
- **Push level**: Supportive challenge — doesn't just accept "I'll do it tomorrow", but frames it as "what's blocking you?" rather than aggressive callouts
- **Name**: Mentor-esque name with assistant vibes (not Yoda-wise, more Jarvis/FRIDAY operational). Claude decides the specific name
- **Social proof in conversations**: Claude's discretion — can reference other members' activity anonymously or by name depending on what feels natural

### Morning Brief
- **Timing**: Member-chosen time with timezone support (`/setbrief 7:30 Europe/Paris`)
- **Length**: Claude's discretion — adaptive based on how much news there is
- **Content**: Claude's discretion — mix of personal stats, server highlights, and motivational elements as appropriate
- **Empty state (no goals set)**: Claude's discretion — mini onboarding flow or nudge to set goals, whichever fits better

### Nudge Behavior
- **Accountability level**: Member-configurable — they choose how much accountability they want from the bot (e.g., light/medium/heavy or similar scale)
- **Triggers**: Context-dependent based on accountability level — missed check-ins, broken streaks, goal deadlines
- **Frequency**: Scales with accountability level. Claude decides the specific caps per level
- **Extended silence handling**: After prolonged inactivity, have a genuine check-in — ask if they want to opt out or if they're still serious about their stated goals. Not nagging, a real conversation
- **Channel**: DM only. Nudges are private, no public shaming

### Conversation Memory
- **History depth**: Full conversation history (or as close as possible). Use summarization + retrieval to fit within model context limits
- **Model preference**: DeepSeek v3.2 via OpenRouter. If context/capability limitations make full history unworkable, fall back to Qwen 3.5 Plus
- **Proactive references**: Yes — the AI should follow up on things the member mentioned in past conversations. This is core to the Jarvis experience
- **Data access**: Everything available — profile, goals, stats, server activity, check-in history, goal completion patterns, conversation summaries
- **Data control**: `/wipe-history` command that lets members export first, then clear all conversation data. Profile and goals remain

### Claude's Discretion
- Specific AI character name (Jarvis/FRIDAY-inspired, operational not wise)
- Morning brief format and density
- Nudge frequency caps per accountability level
- How conversation summaries are generated and stored
- Empty state onboarding flow details
- Whether social proof references use names or stay anonymous

</decisions>

<specifics>
## Specific Ideas

- "Jarvis-like assistant with accountability" — the AI is an operator, not a teacher. It helps you get things done, tracks your progress, and holds you to your word
- The hustler bro tone should feel like talking to a sharp friend who's already made it and is helping you get there
- Members with multiple Discord accounts: nudges go to preferred account only, never double-send
- Accountability is opt-in intensity — some members want hard pushback, others want gentle reminders. Let them choose

</specifics>

<deferred>
## Deferred Ideas

- Advanced AI coaching with pattern recognition across weeks of data (ADVAI-01 — future milestone)
- Per-feature opt-out for tracking (ADVAI-02 — future milestone)

</deferred>

---

*Phase: 04-ai-assistant*
*Context gathered: 2026-03-20*
