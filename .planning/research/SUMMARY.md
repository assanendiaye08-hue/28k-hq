# Project Research Summary

**Project:** Discord Hustler v3.0
**Domain:** Gamified productivity coaching system for former gamers (10-25 young men, 20s-30s)
**Researched:** 2026-03-22
**Confidence:** HIGH

---

## Executive Summary

Discord Hustler v3.0 is a behavior change system, not a productivity tracker. The distinction matters enormously for every design decision. Four independent research streams converge on one principle: **sustainable behavior change for this audience requires identity-level transformation, not metric-level incentives.** Former gamers already possess the neural hardware for deep focus and sustained effort — they built it through 8-12 hour gaming sessions. The challenge is not building new capacity; it is redirecting existing capacity toward productive work. A system that merely wraps productive tasks in game mechanics fails within weeks because it competes on the wrong terrain. It can never be as fun as an actual game. Instead, the system must help members cross a psychological bridge from "gamer who should be working" to "builder who games for fun" — and that bridge is built through identity reinforcement, social belonging, and evidence accumulation, not XP scores.

The recommended approach is a minimalist daily loop: one proactive push from Jarvis each morning (plan your day), passive deep work tracking through the desktop timer (execute), and one proactive push each evening (close the loop with a reflection that doubles as a check-in). Everything else — leaderboards, streaks, XP, lock-in sessions — is social scaffolding that supports this loop. The gamification layer should be front-loaded, heaviest in weeks 1-3 when habits are forming, and gradually give way to identity-based feedback as members move through the internalization continuum. The AI coach (Jarvis) is the single highest-leverage component: its competitive advantage over human coaches is perfect data recall and zero judgment; its responsibility is to ask questions 70% of the time and reflect behavior back with identity framing, not dispense advice or motivational quotes.

The primary risks are (1) the overjustification trap — over-gamifying to the point where members work for XP rather than their goals, then quit when XP novelty fades; (2) the "what the hell" effect — binary streaks that cause complete abandonment after one missed day; and (3) feature fragmentation — 26 bot modules and 4 desktop pages creating cognitive overhead that kills engagement. The mitigation for all three is the same: fewer features, tighter daily loop, graceful failure design. The current system's strongest existing assets — the morning brief, the Pomodoro timer, and the voice lock-in sessions — map directly to the highest-evidence behavior change mechanisms and should anchor v3.0.

---

## Key Findings

### The Core Principles (synthesized across all four research files)

These principles appear consistently across behavioral science, coaching effectiveness, habit architecture, and ecosystem design research. Every system behavior in v3.0 should trace back to at least one of these:

1. **Design for the worst day, not the best.** When someone is tired, unmotivated, and distracted, the system must still work. One-tap check-in. Auto-generated morning brief. One-click timer start. If it requires energy to use, it fails.

2. **Progress visibility over goal tracking.** "You completed 12 deep work sessions this month" beats "You're 40% behind your goal." Amabile's research (12,000+ diary entries) shows minor progress on meaningful work is the single strongest predictor of a good day.

3. **Identity reinforcement over reward dispensing.** "Builders show up even on hard days" is more powerful than "+50 XP." Every coaching interaction should reflect WHO they are becoming, not only WHAT they did.

4. **Forgiving systems over rigid chains.** Binary streaks cause complete abandonment after one miss (abstinence violation effect). Grace periods, consistency rates, and "current run + lifetime total" framing prevent the spiral.

5. **Social connection over individual tracking.** Lock-in sessions, shared wins, group rituals. The group identity is the strongest behavior change lever available. Tracker features support it but cannot replace it.

6. **Gamification as scaffolding, not destination.** XP and leaderboards bootstrap engagement during weeks 1-3 while habits form. By month 3, the dominant motivation should be identity and community, not XP scores.

7. **Process accountability over outcome accountability.** "Did you do your deep work block?" not "Did you make money today?" Process is controllable; outcomes are not.

8. **Jarvis asks, never tells.** 70% questions, 30% observations. Zero advice unless asked. Every AI coaching interaction should reference the member's specific data — never generic motivation.

---

### What the System Should DO

Derived from the intersection of behavioral science and ecosystem design:

**Daily behaviors the system must drive:**
- Deliver one Jarvis morning brief (PUSH, passive, 10 seconds to read) containing today's priority, streak status, and one implementation intention prompt
- Accept one evening reflection (PUSH, active, 60 seconds) that replaces the /checkin command — Jarvis asks "What did you get done today?" and extracts the check-in from the response
- Passively track deep work via desktop timer (PULL, zero friction, one-click start)
- Award XP immediately on timer completion, reflection response, and goal updates — reward must arrive within seconds of behavior, not at month-end

**Weekly behaviors the system must drive:**
- Deliver one Sunday planning session (5 minutes, conversational, reviews prior week data)
- Surface a Jarvis weekly recap with specific metrics: "You coded 14 hours — up from 9 last week. Your consistency rate is 86%."
- Update leaderboard pods (groups of 5-7, not a single ranked list of 25)

**Per-season behaviors the system must drive:**
- Reset leaderboard at season start (every 60-90 days)
- Archive season stats as identity artifacts — "Season 1 you logged 180 focus hours and completed 12 goals"
- At week 3 of each season, Jarvis proactively names the novelty trough and frames it as a boss fight to push through

**Streak/failure design mandatories:**
- Never show "0" after a broken streak — show "current run" + "best run" + "consistency rate"
- Two-day rule: streak breaks only after 2 consecutive missed days, not 1 (37% longer habit retention)
- Streak freezes earned through consistency (1 per 14 active days, cap 3) — resource management, not a purchased power-up
- Jarvis sends ONE acknowledgment after a broken streak, celebrates the run that ended, sets the next low milestone ("let's get a 7-day run going")

**Jarvis coaching mandatories:**
- Reference only the member's actual data — never fabricate patterns, never use generic quotes
- Keep messages short: morning briefs are 3-4 lines, reflection prompts are 1 question, weekly recaps are bullet points
- Never escalate contact when someone goes quiet — one check-in after 3 days of silence, one "door is open" message after 2 weeks, then silence
- When a member returns after absence: "Good to see you. What do you want to focus on?" — no guilt, no baggage
- Never fake emotions: "I noticed your streak broke" is honest; "I'm worried about you" is not

---

### What the System Should NOT DO

Directly supported by research findings across all four files:

**Remove these features entirely:**
- **Bot timer module** — desktop handles this better; dual timers create confusion and split the habit cue
- **Auto-feed** (RSS/YouTube/Reddit fetching) — encourages consumption, not production; costs AI tokens; directly opposes "build don't consume" ethos; remove ~400 LOC
- **Inspiration system** (3 people you admire for Jarvis to reference) — no evidence of behavior change impact; remove ~150 LOC, one less DB table
- **Private per-member channels** — DMs provide true privacy; server channel management is maintenance burden; remove ~200 LOC
- **Badges/achievements** — weak evidence across all research; the system correctly does not have them; do not add them in v3.0

**Simplify these features:**
- **Check-in** — merge into the evening reflection; Jarvis asks "What did you do today?" and the response IS the check-in; eliminate one separate interaction point
- **Reflection intensity levels** — reduce from 4 levels (off/light/medium/heavy) to 2: daily or weekly-only; the middle options add complexity without evidence
- **Season ceremony** — simplify to: reset leaderboard, post final standings embed, start new season; remove champion role cron, hall-of-fame channel, cleanup jobs
- **Resources channels** — remove AI auto-tagging (costs tokens, creates ghost threads); just award XP for sharing

**Never build these:**
- Activity/window tracking — surveillance kills intrinsic motivation
- AI-generated task lists — removes agency; Jarvis asks what they want to work on, it does not prescribe
- Desktop notifications from Jarvis — desktop is the PULL channel; Discord is the PUSH channel; mixing them creates notification fatigue
- Chat/messaging in the desktop app — duplicates Discord; creates feature fragmentation
- Analytics/charts in the desktop app — encourages navel-gazing over working; the dashboard with priorities + streak + rank is enough
- Single global ranked leaderboard (1-25) — motivates top 5, demoralizes the other 20; use rotating pods of 5-7

---

### The Ideal Daily and Weekly Flow

```
MORNING (Discord DM — PUSH, passive)
Jarvis morning brief:
  - "Day 14 streak. Yesterday: 2h15m on your store."
  - "Today's priority: Ship the landing page."
  - "What's the ONE thing you'll get done today?"
Member reads in 10 seconds. No response required.
        |
        v
WORK DAY (Desktop App — PULL)
Member opens app when ready to work.
Dashboard shows today's priority, streak, rank.
One click starts Pomodoro or Flowmodoro timer.
Timer ends: XP syncs immediately, streak counter updates.
Member can check voice channels to see who else is grinding.
        |
        v
EVENING (Discord DM — PUSH, active)
Jarvis: "You put in 2h15m today. What did you get done?"
Member responds in free text (60 seconds).
Jarvis extracts categories, marks check-in, awards XP, updates streak.
Jarvis may ask one follow-up if the answer is detailed.
        |
        v
WEEKLY (Sunday — Discord DM — PUSH, active)
Jarvis: "Last week: 14 hours, 87% consistency, 3 goals progressed. What's the focus this week?"
Member sets/adjusts weekly goals in 5 minutes.
        |
        v
MONTHLY (1st — Discord DM — PUSH, passive)
Jarvis generates AI narrative of the month.
Member can share to #wins.
```

**Total weekly interaction cost:** ~15 touchpoints (7 passive morning briefs, 7 active 60-second reflections, 1 Sunday planning session). This is within the research-backed 3-5 meaningful touchpoints per day threshold.

---

### Existing Features: Keep, Change, Remove

| Feature | Verdict | Action |
|---------|---------|--------|
| Morning Brief | KEEP + ENHANCE | Add "What's your ONE thing today?" implementation intention prompt |
| Desktop Timer (Pomodoro/Flowmodoro) | KEEP AS-IS | Already well-built; local-first is correct; XP sync closes the reward loop |
| Daily Reflection | KEEP + SIMPLIFY | 1 question, 1 response; remove intensity levels; merge /checkin into it |
| Weekly Planning (Sunday) | KEEP AS-IS | Conversational flow is exactly right |
| Goals (hierarchy) | KEEP | Desktop for CRUD, bot for decomposition and nudging |
| Nudge System | KEEP + RETUNE | Fire on missed reflection (not missed /checkin); keep configurable intensity |
| Dashboard | KEEP | Priorities + streak + rank on launch; no charts or analytics |
| Leaderboard | KEEP + RESTRUCTURE | Change from single ranked list to rotating pods of 5-7 |
| Lock-in Sessions | KEEP | Voice co-working is genuinely high-leverage for former gamers |
| Voice Tracking | KEEP | Zero-friction XP; passive measurement |
| Wins/Lessons Channels | KEEP | Low maintenance, high social value |
| XP / Rank System | KEEP | Connective tissue; every behavior -> XP -> rank |
| Season System | KEEP + SIMPLIFY | Remove ceremony complexity; keep the reset and archive |
| Monthly Recap | KEEP | Good closure mechanism |
| Bot Timer | REMOVE | Desktop handles this; dual timers create UX confusion |
| Auto-Feed | REMOVE | Consumption vs production; costs tokens; remove entirely |
| Inspiration System | REMOVE | No evidence of behavior change; one less module |
| Private Channels | REMOVE | DMs are the private space; server channels add maintenance |
| Resources AI Tagging | REMOVE | Cost vs value; just reward sharing |
| Check-in (/checkin command) | MERGE | Absorb into evening reflection |

---

### Critical Pitfalls to Avoid in v3.0

**Pitfall 1: The Overjustification Trap**
Building XP and leaderboards as the primary motivation engine. Extrinsic rewards destroy intrinsic motivation over time (d confirmed in multiple meta-analyses). The fix: XP is loudest in weeks 1-3, then gradually fades as Jarvis shifts coaching from "you earned 50 XP" to identity-based feedback like "you've shipped 3 things this season." Season 1 is gamification-heavy. Season 4 should be meaning-heavy.

**Pitfall 2: Binary Streak Catastrophe**
A single missed day breaks a 90-day streak; the member enters the "what the hell" abandonment spiral (47% more likely to binge-quit after a streak break per Health Psychology research). The fix: two-day rule, streak freezes, consistency rate as the primary metric, "current run + best run + lifetime total" framing. Never show a plain "0."

**Pitfall 3: Notification Fatigue / The Nagging Bot**
More than 2 push notifications per day causes disengagement (average person receives 125 notifications/day; 23 minutes to regain focus after an interruption). Escalating contact when someone goes quiet is the definition of nagging. The fix: max 2 daily pushes (morning brief + evening reflection), never follow up on a follow-up, one check-in after 3 days of silence, then back off.

**Pitfall 4: Feature Fragmentation**
26 bot modules operating side-by-side without a coherent daily flow. Members face decision overhead about which feature to use when. The fix: define one canonical daily loop (morning brief → work → evening reflection) and make every other feature a supplement to that loop, not a parallel system.

**Pitfall 5: Advice-Giving AI**
Jarvis defaults to solving problems and dispensing wisdom rather than asking questions. This triggers psychological reactance — being told what to do makes people LESS likely to do it. The fix: 70% questions, 30% observations, 0% unsolicited advice. Jarvis should ask "What do you think would help?" not "You should try waking up earlier."

**Pitfall 6: Goodhart's Law (Gaming the Gamification)**
These are gamers. They will find the minimum-effort path to maximum XP within days of launch. The fix: outcome-weighted XP (completing goals retroactively multiplies time-tracking XP with a 1.5x bonus), peer validation on wins (community reactions determine bonus — no reactions = no bonus), diminishing XP returns after 6 focus blocks per day, and opaque XP formulas (members know roughly how it works but cannot optimize against an exact number).

---

## Implications for Roadmap

Based on the combined research, v3.0 should be structured around the principle of **coherence before features**. The current system has too many features that operate as isolated modules. The first priority is to establish the daily loop as the spine of the system, then layer social features on top, then refine gamification mechanics. New features come last.

### Phase 1: Daily Loop Foundation
**Rationale:** The morning brief → work → evening reflection loop is the highest-evidence behavior change mechanism available (implementation intentions d=0.65, immediate reward requirement per Fogg). Until this loop runs cleanly as one continuous experience, all other features are decorative. This phase also removes the features that create noise and maintenance burden.
**Delivers:** Morning brief with implementation intention prompt; evening reflection that absorbs /checkin; direct data flow from desktop timer into Jarvis coaching context; removal of bot timer, auto-feed, inspiration, and private channels
**Avoids:** Feature fragmentation pitfall; notification fatigue pitfall
**Research flag:** Standard patterns — this is well-documented UX/behavior design; no additional research needed

### Phase 2: Streak and Failure System Redesign
**Rationale:** Binary streaks are the single most likely cause of member abandonment (63% abandonment after first miss without recovery mechanisms per streak psychology research). This must be addressed before v3.0 reaches real users; fixing it after launch is harder than fixing it before.
**Delivers:** Two-day rule implementation; streak freezes earned through consistency; "current run + best run + consistency rate" display replacing a plain streak counter; recovery protocol in Jarvis (acknowledge run, set low next milestone, no guilt)
**Avoids:** Binary streak catastrophe pitfall; "what the hell" abandonment spiral
**Research flag:** Standard patterns — streak design is well-documented; Duolingo and Beeminder have published their approaches

### Phase 3: Jarvis Coaching Quality
**Rationale:** The AI coach is the highest-leverage component in the entire system. Its advantage over every static habit app is that it can vary, personalize, and ask questions based on the member's actual data. Generic Jarvis responses that ignore member history are indistinguishable from a template and will be muted. This phase invests in prompt engineering, context window strategy, and anti-repetition mechanics before the system scales.
**Delivers:** Member-specific data context passed to every Jarvis interaction (recent timer sessions, current streak, goal status, last few responses); question bank organized by situation (goal review, missed commitment, celebration, reflection) with rotation to prevent repetition; escalation state machine (first miss = silence, second = light acknowledgment, week+ = one warm check-in, 2 weeks = door-open message); tone calibration (light touch / balanced / direct) as member preference; identity-framing language that mirrors behavior back as evidence of who they are becoming
**Avoids:** Advice-giving AI pitfall; notification fatigue pitfall; uncanny valley AI pitfall
**Research flag:** Needs research-phase during planning — prompt engineering for coaching at this specificity requires testing patterns and reviewing emerging AI coaching design literature

### Phase 4: Gamification Redesign
**Rationale:** The current XP system works but has exploitable structures that gamers will find. The leaderboard as a single ranked list of 25 people demotivates the bottom 20. This phase makes the gamification ungameable and multi-dimensional. It should come after the daily loop and Jarvis coaching are solid, because gamification is scaffolding — if the foundation (the loop, the coach) is weak, better gamification just papers over the problem.
**Delivers:** Outcome-weighted XP with completion multiplier (1.5x retroactive on time XP when goal is completed); diminishing returns on focus blocks beyond 6 per day; rotating leaderboard pods of 5-7 (weekly rotation); multi-metric leaderboards (consistency rate, goals completed, current run, most improved); variable XP bonuses on check-ins based on Jarvis quality assessment; simplified two-level reflection intensity (daily vs weekly-only)
**Avoids:** Overjustification trap; Goodhart's Law gaming; single-dominant-player leaderboard demoralization
**Research flag:** Standard patterns for most of this; the Jarvis quality assessment on check-ins is novel and may need iteration

### Phase 5: Season System and Identity Architecture
**Rationale:** Seasons are the primary mechanism for surviving the novelty trough (weeks 3-8 when initial excitement fades). Each season reset is a mini-onboarding moment that re-engages drifted members. The seasonal archive is also how the system builds identity artifacts over time — "Season 1 you logged 180 hours" viewed from Season 4 is evidence of becoming. This phase simplifies the season ceremony while strengthening its identity reinforcement value.
**Delivers:** Simplified season lifecycle (reset leaderboard, post final standings embed, start new season — no ceremony cron jobs); seasonal archive as identity record (Jarvis references it in coaching: "Last season you completed 12 goals..."); at week 3 of each new season, Jarvis proactively names the trough and frames it as a boss fight; progressive challenge unlocks within a season (week 2: group challenges, week 4: advanced analytics, week 6: mentorship)
**Avoids:** Novelty trough abandonment; overjustification trap (season archives shift focus from XP to accomplishments)
**Research flag:** Standard patterns — Valorant/competitive game season design is well-documented

### Phase 6: Social Layer Enhancements
**Rationale:** Social connection is the strongest single behavior change lever for this audience. The lock-in sessions, wins channel, and voice tracking already exist and work. This phase deepens the social layer without adding complexity — the goal is making the "lobby effect" (seeing friends online triggers you to join) more visible.
**Delivers:** Dashboard showing who is currently in a focus session or voice channel (same as "friends online" in any game); Jarvis morning brief includes "X members already checked in today" social signal; periodic community events (48-hour build sprints, accountability weeks); Jarvis highlights specific member wins in morning briefs to create aspiration
**Avoids:** Relatedness need going unmet (SDT); the system feeling like solo tracking rather than a crew
**Research flag:** Standard patterns — social proof and body doubling are well-documented; implementation is straightforward

---

### Phase Ordering Rationale

The ordering flows from highest to lowest evidence weight and highest to lowest foundational dependency:

- Phase 1 (daily loop) must come first because every other phase depends on members having a consistent daily touchpoint rhythm. A better leaderboard means nothing if members are not showing up daily.
- Phase 2 (streak redesign) must come before public launch because the current binary streak system will trigger abandonment events at scale. It is cheap to fix before launch and expensive to fix after.
- Phase 3 (Jarvis quality) is third because once the daily loop runs, Jarvis is what members interact with most. Generic Jarvis responses degrade retention faster than any other single factor.
- Phase 4 (gamification) comes after the coaching is solid because gamification is scaffolding — the AI coach must be able to guide members from extrinsic to intrinsic motivation, and it cannot do that if the coaching itself is generic.
- Phase 5 (seasons) and Phase 6 (social) come last because they enhance an already-functioning system. Building a seasonal ceremony before the daily loop works is premature optimization.

### Research Flags

Phases needing `/gsd:research-phase` during planning:
- **Phase 3 (Jarvis Coaching Quality):** Prompt engineering for coaching AI at this level of specificity — context window strategy, question bank curation, anti-repetition system — is a niche domain with rapidly evolving best practices. Research before planning this phase.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Daily Loop):** Implementation intentions, BJ Fogg behavior model, and push/pull notification architecture are well-documented. No additional research needed.
- **Phase 2 (Streak Redesign):** Duolingo, Beeminder, and habit tracker UX research covers this thoroughly.
- **Phase 4 (Gamification):** SDT, overjustification effect, and leaderboard design patterns are extensively documented.
- **Phase 5 (Seasons):** Competitive game season architecture is well-understood and directly applicable.
- **Phase 6 (Social Layer):** Body doubling, social proof, and lobby effect are well-documented behavioral patterns.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Core behavioral principles | HIGH | Grounded in peer-reviewed research: SDT (Deci & Ryan), Amabile's Progress Principle, Fogg Behavior Model, Gollwitzer's implementation intentions meta-analysis (d=0.65). Multiple independent sources converge. |
| Coaching design (Jarvis) | HIGH | 200+ RCTs on Motivational Interviewing, AI coaching PMC studies, 10-session optimal cadence from executive coaching research. The 70/30 question/observation ratio is well-supported. |
| Gamification design | HIGH | Overjustification effect has strong meta-analytic support. Streak psychology (two-day rule, freeze mechanics) backed by Smashing Magazine 2026 UX research and Duolingo published data. XP tuning values are LOW confidence and need iteration. |
| Ecosystem / feature removal | HIGH | Feature removal recommendations (bot timer, auto-feed, inspiration, private channels) are backed by maintenance cost analysis of the actual codebase + behavior change evidence that those features do not move the needle. |
| Specific XP values and thresholds | LOW | The XP weights (15-25 for check-in, 20 per focus block, etc.) are starting points derived from game design patterns, not A/B tested for this specific group. These need tuning with real user data. |
| Optimal season length | MEDIUM | 60-90 days is directional, based on habit formation research (66-day average) and game industry patterns, not empirically tested for this specific community. |
| Jarvis prompt engineering | MEDIUM | General coaching principles are HIGH confidence; the specific prompt structures that will work for this community's voice and context need iteration. |

**Overall confidence:** HIGH for design principles and feature decisions. MEDIUM for specific tuning parameters (XP values, season length, notification timing). LOW for anything requiring real-user feedback loops.

### Gaps to Address

- **Timer task labeling:** The desktop timer currently starts a session with a duration but no task name. Connecting timer sessions to specific goals is essential for Jarvis to provide specific coaching ("you worked 2h15m on your store today"). Solution: add optional task label on timer start, with goal suggestions from the active goal list.
- **Extended absence protocol:** The nudge system handles 1-3 day misses. What happens after 2+ weeks of silence? Research says the bot should not spam. The right answer is probably a single human (founder) DM, not another Jarvis message. This needs a decision.
- **Check-in fallback:** Merging /checkin into the evening reflection assumes members will respond to Jarvis DMs. Some members may prefer the explicit command. Consider keeping /checkin as an alternate path that counts as the daily reflection response (same outcome, different input method).
- **Jarvis coaching tone vs. community voice:** The coaching principles (observe, question, avoid advice) are clear. The specific language that lands with this audience (Discord gaming community slang vs. corporate productivity language) needs calibration. The system prompt for Jarvis should be co-authored with the community's actual voice, not just derived from coaching research.

---

## Sources

### Primary (HIGH confidence — peer-reviewed)
- Deci & Ryan — Self-Determination Theory (autonomy, competence, relatedness framework; 40+ years of research)
- Gollwitzer (1999) — Implementation Intentions meta-analysis (94 studies, 8,000+ participants, d=0.65)
- Teresa Amabile & Steven Kramer — The Progress Principle (12,000+ diary entries, HBS)
- Miller & Rollnick — Motivational Interviewing (200+ RCTs, OARS technique, righting reflex)
- Phillippa Lally (UCL 2009) — 66-day habit formation, missing one day has no material effect
- Baumeister / Hagger 36-lab replication — Willpower debate; practical design implication holds regardless
- PMC — Accountability research (65% with commitment, 95% with appointment, 2x with partner)
- PMC — AI vs human coaching goal attainment RCT (327 participants, 10 months)
- PMC — Streak psychology and abandonment (63% abandonment after first miss without recovery)

### Secondary (MEDIUM confidence — practitioner + corroborated)
- James Clear — Atomic Habits (identity-based change, habit stacking, four laws)
- BJ Fogg — Tiny Habits / Behavior Model (B=MAP, anchor-behavior-celebration)
- Michael Bungay Stanier — The Coaching Habit (say less, ask more; seven questions)
- Duolingo — Streak freeze reduced churn 21% (published product data)
- Smashing Magazine 2026 — Streak system UX psychology
- Proactive AI coaching data (Pinnacle) — 75% usage vs 51% for reactive, 94% monthly retention
- Yu-kai Chou — Octalysis Framework (leaderboard design for small groups)
- SCIRP 2024 — Uncanny valley in AI coaching (behavioral authenticity, not appearance)

### Tertiary (LOW confidence — single source or requires validation)
- Specific XP values and rank thresholds — starting points from game design patterns; need real-user tuning
- Season length (60-90 days) — directional from habit formation research; not empirically tested for this community
- "Week 3 trough" timing — directional from app retention research; actual timing will vary per member

---

*Research completed: 2026-03-22*
*Ready for roadmap: yes*
