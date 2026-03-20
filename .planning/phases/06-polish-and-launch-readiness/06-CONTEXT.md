# Phase 6: Polish and Launch Readiness - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Auto-content feeds from external sources (RSS, YouTube, Reddit + AI-discovered sources), per-notification-type account routing for multi-account members, server structure lane cleanup (remove three-lane assumption), and end-to-end hardening for unattended daily use. This is the final phase before v1.0 launch.

</domain>

<decisions>
## Implementation Decisions

### Auto-Content Feeds
- **Full pipeline**: Curated sources (RSS, YouTube, Reddit) + AI discovers additional sources + AI filters everything for quality/relevance + member voting trains filter over time
- Sources: RSS feeds, YouTube channels, Reddit subreddits, plus any additional sources AI discovers
- AI filtering via DeepSeek V3.2 — classifies each piece as actionable/valuable vs skip (~$0.01-0.03/day)
- Key concern: must pull ACTIONABLE, value-add content — not garbage. Quality over quantity
- Frequency: 2-4 posts per day, spread across the day
- Channel placement: Claude's discretion (existing resource channels or dedicated #auto-feed)
- Member reactions train the filter over time (upvote/downvote learning loop)

### Notification Routing
- Per notification type granularity: member picks which linked account gets briefs, nudges, session invites, level-ups (4-5 categories)
- Default: primary account (first linked) gets everything — zero config needed for single-account members
- Configuration UX: Claude's discretion (slash command, /settings integration, or other)

### Server Lane Cleanup
- Replace three-lane references (freelancing/ecom/content) with interest-based approach from member profiles
- Server structure adapts to what members actually list as interests — no fixed lanes
- Channel migration strategy: Claude's discretion (repurpose with renames or recreate)
- Must update: constants.ts, channel names, embeds, any hardcoded lane references

### Hardening & Edge Cases
- **Member leave/rejoin**: Offer fresh start option — on rejoin, ask if they want to restore old profile or start fresh
- **Bot restarts**: Silent recovery for members + admin log in a #bot-log channel visible only to owner. On ready: rebuild schedules, restore voice sessions, check expired goals/seasons
- **7-day stress test criteria**: Bot runs for 7 days without manual intervention. Schedules fire, seasons tick, content posts, no crashes. Primary success metric

### Claude's Discretion
- Auto-feed channel placement (existing resource channels vs dedicated channel)
- Notification routing UX (command design)
- Channel migration strategy for lane cleanup
- Specific hardening priorities beyond the 7-day unattended goal
- Which external sources AI should discover beyond curated list

</decisions>

<specifics>
## Specific Ideas

- "My concern is that it pulls garbage instead of actionable/value-add" — quality filtering is the #1 priority for auto-feeds
- AI should actively DISCOVER new relevant sources, not just filter curated ones
- The group is diverse (FAANG engineers, small biz owners, students, ecom, affiliate) — content must serve all these profiles
- Admin log channel (#bot-log) should be invisible to regular members

</specifics>

<deferred>
## Deferred Ideas

None — this is the final phase of v1.0. All ideas for v1.1 (content curator, timers, surveys, idol system) will be captured during /gsd:new-milestone.

</deferred>

---

*Phase: 06-polish-and-launch-readiness*
*Context gathered: 2026-03-20*
