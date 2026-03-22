# Phase 5: Content, Sessions, and Trust - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Resource sharing channels where members post and discuss content, member-initiated lock-in sessions (instant or scheduled, private or public), and full data transparency/privacy controls (/mydata export, /deletedata hard delete, owner-blind encrypted privacy). Does NOT include auto-content feeds (Phase 6) or server structure lane cleanup (Phase 6).

</domain>

<decisions>
## Implementation Decisions

### Resource Sharing Channels
- **Hybrid approach**: 3-4 broad channels (#tech-resources, #business-resources, #growth-resources) as the containers, but bot auto-tags posts by specific interest using AI for searchability
- Anyone can post — community-driven contributions
- Bot auto-creates a discussion thread on each resource post to keep the channel clean
- Bot reaction + auto-thread behavior — Claude decides whether to add small XP for sharing

### Lock-in Sessions
- **Both instant and scheduled**: /lockin for right now, /schedule-session for planned ones
- Natural text trigger via DM with Ace (e.g. "start a lockin and invite @john") alongside slash commands
- **Private vs Public sessions**:
  - **Private**: only invitees can join and get DM'd. Creator can move others in or invite mid-session to grant access
  - **Public**: invitees get DMs + bot posts in #sessions and pings @LockInSessions role
- Multiple sessions can run simultaneously in different voice channels
- Member specifies what they're working on at session start (or bot infers from active goals)
- Session end: summary posted with who attended, total time, what was worked on. XP aware of voice tracker to avoid double-counting
- No server-wide pings for individual actions — respect focus time

### Data Transparency & Privacy
- **/mydata**: Full export as JSON file DM'd to member — ALL their data (profile, check-ins, goals, XP history, conversations, voice sessions)
- **/deletedata**: Hard delete with confirmation prompt. On confirm: all data wiped, removed from leaderboards, roles stripped. Permanent, no recovery
- **Owner-blind privacy**: Absolute — encrypted at rest with per-member keys (extends Phase 1 encryption infra). DM conversations, private notes, raw check-in text all encrypted. DB access shows only gibberish
- Individual commands (/mydata, /deletedata) rather than unified /privacy command

### Trust Communication
- Brief privacy mention during onboarding + recovery key delivery (already partially done in Phase 1)
- Ongoing trust signals: Claude's discretion on the right balance (subtle footer on private messages, periodic reminder, or none)

### Claude's Discretion
- Whether to award small XP for resource sharing (and how much)
- Resource auto-tagging implementation (AI extraction from link content or member-specified)
- Trust signal approach (footer, periodic reminder, or none)
- Session voice channel naming convention
- How bot infers "what you're working on" from active goals when member doesn't specify

</decisions>

<specifics>
## Specific Ideas

- Members have diverse profiles (FAANG engineers, small biz owners, students, ecom, affiliate) — NOT three fixed lanes. Resource channels must reflect this diversity
- "I don't want the server to be annoying/ping people while they're focused" — respect work time, minimize noise
- Session creator should be able to dynamically invite people mid-session by moving them into the voice channel or granting permission
- Private sessions = true privacy (only invitees see/join), not just "unlisted"

</specifics>

<deferred>
## Deferred Ideas

- **Server structure lane cleanup**: Remove three-lane (freelancing/ecom/content) references from constants, channels, embeds. Replace with interest-based approach. **MUST DO in Phase 6** — clearly marked as needed
- Auto-content feeds from RSS/APIs — Phase 6 (CONT-02)
- Per-notification-type account routing — Phase 6 (FNDN-06)

</deferred>

---

*Phase: 05-content-sessions-and-trust*
*Context gathered: 2026-03-20*
