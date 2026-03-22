/**
 * Brainstorming session manager for the AI assistant.
 *
 * Runs structured brainstorming sessions with three phases:
 * 1. DIVERGE -- generate ideas freely, no filtering
 * 2. CLUSTER -- group ideas into themes using LLM
 * 3. EVALUATE -- rank clusters by impact and feasibility using LLM
 *
 * Sessions are in-memory, keyed by memberId, with a 30-minute TTL.
 * Phase transitions are triggered by user keywords.
 */

import type { ExtendedPrismaClient } from '@28k/db';
import { callAI } from '../../shared/ai-client.js';

// ─── Types ──────────────────────────────────────────────────────────────────────

export type BrainstormPhase = 'diverge' | 'cluster' | 'evaluate';

export interface BrainstormSession {
  topic: string;
  phase: BrainstormPhase;
  ideas: string[];
  clusters: string[][];
  startedAt: number;
}

// ─── Phase Transition Patterns ──────────────────────────────────────────────────

const CLUSTER_TRIGGERS = /\b(ok|next|what do we have|cluster|group|organize)\b/i;
const EVALUATE_TRIGGERS = /\b(evaluate|which|best|pick|rank|compare|score)\b/i;
const END_TRIGGERS = /\b(done|thanks|got it|wrap|finished)\b/i;

// ─── BrainstormManager ──────────────────────────────────────────────────────────

export class BrainstormManager {
  private sessions = new Map<string, BrainstormSession>();
  private SESSION_TTL = 30 * 60 * 1000; // 30 minutes

  /**
   * Check if a member has an active brainstorm session.
   * Auto-cleans expired sessions.
   */
  hasActiveSession(memberId: string): boolean {
    const session = this.sessions.get(memberId);
    if (!session) return false;

    // Auto-expire stale sessions
    if (Date.now() - session.startedAt > this.SESSION_TTL) {
      this.sessions.delete(memberId);
      return false;
    }

    return true;
  }

  /**
   * Start a new brainstorm session in the diverge phase.
   * Returns an opening message to send to the user.
   */
  startSession(memberId: string, topic: string): string {
    this.sessions.set(memberId, {
      topic,
      phase: 'diverge',
      ideas: [],
      clusters: [],
      startedAt: Date.now(),
    });

    return `Brainstorm: ${topic}\n\nPhase 1: DIVERGE -- throw out every idea, no filtering.\n\nGo. What comes to mind?`;
  }

  /**
   * Handle a message within an active brainstorm session.
   * Routes to the appropriate phase handler and manages transitions.
   */
  async handleMessage(
    db: ExtendedPrismaClient,
    memberId: string,
    message: string,
  ): Promise<string> {
    const session = this.sessions.get(memberId);
    if (!session) return 'No active brainstorm session.';

    // Auto-expire stale sessions
    if (Date.now() - session.startedAt > this.SESSION_TTL) {
      this.sessions.delete(memberId);
      return 'Brainstorm session expired (30 min limit). Start a new one if you want to continue.';
    }

    switch (session.phase) {
      case 'diverge':
        return this.handleDiverge(db, memberId, session, message);
      case 'cluster':
        return this.handleCluster(db, memberId, session, message);
      case 'evaluate':
        return this.handleEvaluate(db, memberId, session, message);
    }
  }

  /**
   * End a brainstorm session and clean up.
   */
  endSession(memberId: string): void {
    this.sessions.delete(memberId);
  }

  // ─── Phase Handlers ─────────────────────────────────────────────────────────

  private async handleDiverge(
    db: ExtendedPrismaClient,
    memberId: string,
    session: BrainstormSession,
    message: string,
  ): Promise<string> {
    // Check for transition to cluster phase
    if (CLUSTER_TRIGGERS.test(message.trim()) && session.ideas.length > 0) {
      session.phase = 'cluster';
      return this.transitionToCluster(db, memberId, session);
    }

    // Accumulate ideas from user message
    // Split by newlines or commas for multi-idea messages
    const newIdeas = message
      .split(/[,\n]/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    session.ideas.push(...newIdeas);

    // Use LLM to encourage more ideas
    const result = await callAI(db, {
      memberId,
      feature: 'chat',
      messages: [
        {
          role: 'system',
          content: `The user is brainstorming about '${session.topic}'. They are in the DIVERGE phase -- help them generate more ideas. Be generative, not critical. Build on their ideas. Keep your response under 3 sentences. Current ideas so far: ${session.ideas.join(', ')}`,
        },
        { role: 'user', content: message },
      ],
    });

    const response = result.content ?? 'Keep going. What else?';
    return `${response}\n\n(${session.ideas.length} ideas so far. Say "next" to cluster them.)`;
  }

  private async transitionToCluster(
    db: ExtendedPrismaClient,
    memberId: string,
    session: BrainstormSession,
  ): Promise<string> {
    const result = await callAI(db, {
      memberId,
      feature: 'chat',
      messages: [
        {
          role: 'system',
          content: `Group these ideas into 2-4 clusters by theme. Label each cluster. Ideas: ${session.ideas.join(', ')}`,
        },
        {
          role: 'user',
          content: `Cluster these ${session.ideas.length} ideas about "${session.topic}".`,
        },
      ],
    });

    const clusterResponse = result.content ?? 'Could not cluster ideas. Try evaluating directly.';
    return `Phase 2: CLUSTER\n\n${clusterResponse}\n\n(Say "evaluate" to rank these clusters, or add more ideas.)`;
  }

  private async handleCluster(
    db: ExtendedPrismaClient,
    memberId: string,
    session: BrainstormSession,
    message: string,
  ): Promise<string> {
    // Check for transition to evaluate phase
    if (EVALUATE_TRIGGERS.test(message.trim())) {
      session.phase = 'evaluate';
      return this.transitionToEvaluate(db, memberId, session);
    }

    // Check for end
    if (END_TRIGGERS.test(message.trim())) {
      this.endSession(memberId);
      return 'Brainstorm wrapped. Good session.';
    }

    // User might be adding more ideas or asking to re-cluster
    const newIdeas = message
      .split(/[,\n]/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    if (newIdeas.length > 0) {
      session.ideas.push(...newIdeas);
      return this.transitionToCluster(db, memberId, session);
    }

    return 'Say "evaluate" to rank the clusters, or add more ideas.';
  }

  private async transitionToEvaluate(
    db: ExtendedPrismaClient,
    memberId: string,
    session: BrainstormSession,
  ): Promise<string> {
    const result = await callAI(db, {
      memberId,
      feature: 'chat',
      messages: [
        {
          role: 'system',
          content: `Evaluate these clusters for the topic '${session.topic}'. Rank by potential impact and feasibility. Be direct about tradeoffs.`,
        },
        {
          role: 'user',
          content: `Evaluate and rank the ideas about "${session.topic}": ${session.ideas.join(', ')}`,
        },
      ],
    });

    const evalResponse = result.content ?? 'Could not evaluate. Review the clusters above and pick what resonates.';
    return `Phase 3: EVALUATE\n\n${evalResponse}\n\n(Say "done" when you're ready to wrap up.)`;
  }

  private async handleEvaluate(
    db: ExtendedPrismaClient,
    memberId: string,
    session: BrainstormSession,
    message: string,
  ): Promise<string> {
    // Check for end
    if (END_TRIGGERS.test(message.trim())) {
      this.endSession(memberId);
      return 'Brainstorm wrapped. Good session.';
    }

    // User asking follow-up questions in evaluate phase
    const result = await callAI(db, {
      memberId,
      feature: 'chat',
      messages: [
        {
          role: 'system',
          content: `The user is in the EVALUATE phase of a brainstorm about '${session.topic}'. They've generated these ideas: ${session.ideas.join(', ')}. Answer their follow-up question directly. Be concise.`,
        },
        { role: 'user', content: message },
      ],
    });

    return `${result.content ?? 'What else do you want to dig into?'}\n\n(Say "done" to wrap up.)`;
  }
}
