import type { IEventBus } from '../shared/types.js';

/**
 * Predefined event types for cross-module communication.
 * This is for internal module-to-module communication, NOT Discord events.
 */
export type BotEventMap = {
  // Phase 1: Foundation and Identity
  memberSetupComplete: [memberId: string, discordId: string];
  accountLinked: [memberId: string, newDiscordId: string];
  profileUpdated: [memberId: string];

  // Phase 2: Daily Engagement Loop
  checkinComplete: [memberId: string, checkinId: string, dayIndex: number];
  goalCompleted: [memberId: string, goalId: string, goalType: string];
  goalProgressUpdated: [memberId: string, goalId: string, newValue: number];
  xpAwarded: [memberId: string, amount: number, newTotal: number, source: string];
  levelUp: [memberId: string, newRank: string, oldRank: string, newTotal: number];
  scheduleUpdated: [memberId: string];

  // Autocomplete interactions
  autocomplete: [interaction: unknown];

  // Phase 3: Competition and Social Proof
  voiceSessionStarted: [memberId: string, channelId: string];
  voiceSessionEnded: [memberId: string, durationMinutes: number, channelId: string];
  winPosted: [memberId: string, messageId: string];
  lessonPosted: [memberId: string, messageId: string];
  seasonEnded: [seasonNumber: number];
  seasonStarted: [seasonNumber: number];

  // Phase 5: Lock-In Sessions
  sessionStarted: [sessionId: string, creatorMemberId: string];
  sessionEnded: [sessionId: string, durationMinutes: number];

  // Phase 9: Productivity Timer
  timerStarted: [memberId: string, mode: string];
  timerCompleted: [memberId: string, totalWorkedMinutes: number];
  timerCancelled: [memberId: string];
  buttonInteraction: [interaction: unknown];
};

export type BotEvent = keyof BotEventMap;

type EventHandler = (...args: unknown[]) => void;

/**
 * Simple typed event bus for cross-module communication.
 *
 * Modules can emit events (e.g., "memberSetupComplete") and other modules
 * can listen for them. This decouples modules from each other -- the onboarding
 * module doesn't need to import the profile module to notify it.
 */
export class EventBus implements IEventBus {
  private handlers = new Map<string, Set<EventHandler>>();

  /**
   * Register a handler for an event.
   */
  on(event: string, handler: (...args: unknown[]) => void): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
  }

  /**
   * Remove a handler for an event.
   */
  off(event: string, handler: (...args: unknown[]) => void): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.handlers.delete(event);
      }
    }
  }

  /**
   * Emit an event, calling all registered handlers.
   * Handlers are called synchronously in registration order.
   * Errors in handlers are caught and logged to prevent cascade failures.
   */
  emit(event: string, ...args: unknown[]): void {
    const handlers = this.handlers.get(event);
    if (!handlers) return;

    for (const handler of handlers) {
      try {
        handler(...args);
      } catch (error) {
        console.error(`Error in event handler for "${event}":`, error);
      }
    }
  }
}
