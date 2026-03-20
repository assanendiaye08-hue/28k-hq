/**
 * Notification Router Constants
 *
 * Defines the notification types that can be routed to specific
 * linked accounts. Members with multiple Discord accounts can
 * choose which account receives each notification type.
 */

/** All notification types supported by the router. */
export type NotificationType =
  | 'brief'
  | 'nudge'
  | 'session_alert'
  | 'level_up'
  | 'general';

/** Human-readable labels for each notification type. */
export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  brief: 'Morning Briefs',
  nudge: 'Accountability Nudges',
  session_alert: 'Session Invites',
  level_up: 'Level-Up Alerts',
  general: 'General',
};

/** The 4 routable types (excludes 'general' which always goes to default). */
export const ROUTABLE_TYPES: NotificationType[] = [
  'brief',
  'nudge',
  'session_alert',
  'level_up',
];
