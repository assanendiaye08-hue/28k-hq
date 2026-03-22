# Architecture Patterns: Peak Performance System

**Domain:** Productivity coaching system (Discord bot + desktop app + API)
**Researched:** 2026-03-22

## Recommended Architecture: The Research-Informed View

The existing architecture (Discord for social/coaching, Desktop for focus/timer, API as shared backend) maps cleanly onto the research findings. This is not a coincidence -- it naturally separates "interruption-prone" (social, notifications) from "interruption-free" (focus, timer) surfaces.

### Component Boundaries and Their Research Rationale

| Component | Responsibility | Research Basis |
|-----------|---------------|----------------|
| **Desktop App (Timer)** | Focus protection, session tracking, dashboard | Deep work research: the focus surface must be distraction-free. A dedicated app is better than a browser tab or Discord embed. |
| **Desktop App (Dashboard)** | Glanceable daily priorities, streak, rank | Self-monitoring research: progress visibility promotes goal attainment. Must be glanceable (<10 sec), not elaborate. |
| **Discord Bot (Jarvis)** | Coaching conversations, morning briefs, evening reviews, goal setting | Accountability research: social presence and structured prompts increase follow-through. DMs = private coaching space. |
| **Discord Server** | Leaderboards, voice co-working, wins/lessons, social proof | Social facilitation: presence of others enhances motivation. Leaderboards and shared wins create healthy competition. |
| **API (Fastify)** | Data persistence, session sync, XP calculation | Shared truth layer. Desktop and Discord both read/write the same data. |
| **Database (Prisma)** | Member data, sessions, goals, streaks | Single source of truth across all surfaces. |

### Data Flow: Focus Session Lifecycle

```
1. User starts timer on Desktop App
   --> Desktop sends POST /timer to API (creates session)
   --> API auto-completes any stale ACTIVE session
   --> Desktop runs timer locally (no server dependency)

2. During session: ZERO interruptions
   --> Desktop app: no notifications, no prompts
   --> Discord bot: holds all nudges, check-ins, reminders
   --> This is the "Focus Fortress" -- nothing breaks in

3. Timer completes (or user stops)
   --> Desktop shows transition ritual: "What did you accomplish? What's next?"
   --> Desktop sends PATCH /timer to API (closes session, logs duration)
   --> API calculates XP, updates streaks
   --> Discord bot: release held notifications (if any)
   --> Jarvis can now send a brief acknowledgment or nudge

4. Break period
   --> Desktop shows break timer (Pomodoro) or suggested break duration (Flowmodoro)
   --> This is the appropriate window for: check-in prompts, goal nudges, brief reviews
   --> User decides when to start next focus block
```

### Data Flow: Daily Coaching Cycle

```
Morning (user's configured time):
  1. Jarvis sends morning brief via DM
     --> Surfaces today's priority goals (from goal hierarchy)
     --> Shows yesterday's deep work hours
     --> Asks "What's your #1 priority today?" (implementation intention)
     --> Asks "When will you do your first deep work block?" (temporal anchoring)

Between focus blocks:
  2. System processes held notifications
     --> Accountability nudges (if configured)
     --> Reminder deliveries
     --> Goal progress updates
  3. No unsolicited coaching -- Jarvis responds when spoken to

Evening (user's configured time):
  4. Jarvis prompts evening review via DM
     --> "What did you accomplish today?"
     --> "What's unfinished? When will you finish it?" (Zeigarnik closure)
     --> "Rate your energy/focus today" (self-monitoring)
     --> Brief Jarvis reflection (AI feedback)
     --> Closes open loops --> protects sleep quality
```

## Patterns to Follow

### Pattern 1: Notification Batching
**What:** Queue all system-generated notifications during focus sessions. Deliver them in a batch during the break period.
**When:** Any time a user has an active timer session.
**Why:** Interruption cost research (23 min recovery). Even "helpful" notifications are destructive during focus.
**Example:**
```typescript
// Before sending any notification, check for active session
async function sendNudge(memberId: string, message: string) {
  const activeSession = await getActiveTimerSession(memberId);
  if (activeSession) {
    // Queue for delivery after session ends
    await queueNotification(memberId, message, activeSession.id);
    return;
  }
  // No active session, send immediately
  await deliverNotification(memberId, message);
}
```

### Pattern 2: Implementation Intention Prompts
**What:** When setting goals or planning tasks, always prompt for when/where/how -- not just what.
**When:** Goal creation, morning brief, weekly planning.
**Why:** Implementation intentions increase follow-through from 14% to 41% (Gollwitzer research).
**Example:**
```
Jarvis: "You want to finish the landing page. When will you work on it?"
User: "Tomorrow morning"
Jarvis: "Got it. I'll include it in tomorrow's morning brief as your #1 priority.
         What's the first concrete step?"
User: "Write the hero section copy"
Jarvis: "Perfect. Tomorrow morning: write hero section copy for landing page."
```

### Pattern 3: Configurable Intensity with Sensible Defaults
**What:** Every coaching feature has an intensity setting. Defaults are moderate.
**When:** All proactive coaching (morning briefs, nudges, reviews).
**Why:** 15-20% of people burn out at intensities others sustain for years. Individual variation is massive.
**Example:**
```
Coaching intensity levels:
  - Minimal: Morning brief only, no nudges, optional evening review
  - Moderate (default): Morning brief + evening review + 1-2 gentle nudges
  - Aggressive: Morning brief + evening review + accountability nudges + missed-session follow-ups
```

### Pattern 4: Automatic Session Logging
**What:** All tracking data is captured automatically from user actions (timer start/stop, goal completion, check-in submission).
**When:** Always. Never require separate manual logging.
**Why:** Self-tracking research shows diminishing returns from manual data collection. Tracking overhead competes with actual work.

## Anti-Patterns to Avoid

### Anti-Pattern 1: The Helpful Interruption
**What:** Sending "motivational" messages or progress updates during a focus session.
**Why bad:** Each interruption costs 23 minutes of focus recovery. A "You've been focused for 45 minutes, keep it up!" message is actively harmful.
**Instead:** Save all encouragement for between sessions. During focus, the system is silent.

### Anti-Pattern 2: The Dashboard Rabbit Hole
**What:** Building elaborate analytics with charts, trends, comparisons, and deep-dive data.
**Why bad:** Users spend 20+ minutes analyzing productivity data instead of being productive. Quantified-self research shows diminishing returns from excessive tracking.
**Instead:** Glanceable dashboard (<10 seconds to scan). Simple metrics: deep work hours this week, streak count, top 3 priorities, goal completion %. Monthly recap for deeper reflection.

### Anti-Pattern 3: One-Size-Fits-All Scheduling
**What:** Sending morning briefs at 7am for everyone. Setting the same daily targets. Using the same nudge frequency.
**Why bad:** Chronotype research shows late types perform worse when forced into early schedules. Individual variation in sustainable intensity is 3-5x.
**Instead:** Let users configure their "day start" time. Adapt nudge frequency over time based on response patterns.

### Anti-Pattern 4: Guilt-Driven Accountability
**What:** "You missed your check-in yesterday!" or "Your streak is broken!" with negative framing.
**Why bad:** Guilt and anxiety impair cognitive performance. Harsh penalties cause system abandonment. Rest days are part of sustainable performance.
**Instead:** Neutral observations: "Yesterday was a rest day. Ready to get back to it?" Grace periods on streaks. Celebrate comeback, don't punish absence.

## Scalability Considerations

This system is designed for 10-25 users, so traditional scalability concerns (load balancing, sharding, caching) are irrelevant. The relevant "scalability" is in a different dimension:

| Concern | At 10 users | At 25 users | At 6+ months of use |
|---------|-------------|-------------|---------------------|
| Coaching personalization | Manual intensity settings work fine | Same -- still manageable | Accumulated data enables pattern detection: peak hours, burnout signals, preferred session lengths |
| Notification management | Simple queue per user | Same architecture | Queue may need TTL to prevent stale notification buildup |
| Data volume (sessions, goals) | Negligible | Negligible | Monthly/seasonal archival keeps active dataset small |
| AI context window | Sufficient with tiered memory | Same | Cold storage becomes important; Grok's 2M context helps but selective retrieval matters more |
| Gamification freshness | Everything is new and exciting | Social dynamics are established | Seasonal resets and new challenges prevent stale mechanics -- this is the biggest long-term risk |

## Sources

- Interruption cost research: Gloria Mark, UC Irvine
- Attention residue: Sophie Leroy (2009), Organizational Behavior and Human Decision Processes
- Implementation intentions: Peter Gollwitzer (1999), American Psychologist
- Self-monitoring meta-analysis: Harkin et al. (2016), Psychological Bulletin
- Chronotype synchrony: Systematic review, Chronobiology International (2025)
