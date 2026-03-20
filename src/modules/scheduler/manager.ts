/**
 * Per-member scheduler lifecycle manager.
 *
 * Maintains a Map of memberId -> Map<taskType, ScheduledTask>.
 * Task types: 'brief', 'reminder-HH:mm', 'planning', 'nudge'.
 *
 * On bot restart, rebuildAll reads all MemberSchedule records from the
 * database and recreates cron tasks for each member. No data is lost.
 *
 * All task callbacks are wrapped in try/catch -- a scheduled task must
 * never crash the process.
 */

import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) =>
      `${timestamp as string} [scheduler] ${level}: ${message as string}`),
  ),
  transports: [new winston.transports.Console()],
});

/** Schedule data for a single member, matching the MemberSchedule Prisma model. */
export interface MemberSchedule {
  memberId: string;
  timezone: string;
  briefTime: string | null;
  briefTone: string;
  reminderTimes: string[];
  sundayPlanning: boolean;
  accountabilityLevel: string;
  nudgeTime: string | null;
}

/**
 * SchedulerManager -- manages per-member cron tasks.
 *
 * Outer key: memberId
 * Inner key: task type ('brief', 'reminder-HH:mm', 'planning', 'nudge')
 */
export class SchedulerManager {
  private tasks = new Map<string, Map<string, ScheduledTask>>();

  /**
   * Schedule a morning brief cron task for a member.
   * Replaces any existing brief task for this member.
   *
   * @param memberId - The member ID
   * @param cronExpr - Cron expression (e.g., "30 8 * * *" for 8:30 AM daily)
   * @param timezone - IANA timezone string
   * @param fn - Async function to call when the task fires
   */
  scheduleBrief(
    memberId: string,
    cronExpr: string,
    timezone: string,
    fn: () => Promise<void>,
  ): void {
    this.setTask(memberId, 'brief', cronExpr, timezone, fn);
    logger.info(`Scheduled brief for ${memberId}: "${cronExpr}" (${timezone})`);
  }

  /**
   * Schedule a check-in reminder task for a member.
   * Converts HH:mm time string to a cron expression.
   *
   * @param memberId - The member ID
   * @param time - Time string in HH:mm format (e.g., "15:00")
   * @param timezone - IANA timezone string
   * @param fn - Async function to call when the task fires
   */
  scheduleReminder(
    memberId: string,
    time: string,
    timezone: string,
    fn: () => Promise<void>,
  ): void {
    const [hours, minutes] = time.split(':');
    const cronExpr = `${minutes} ${hours} * * *`;
    this.setTask(memberId, `reminder-${time}`, cronExpr, timezone, fn);
    logger.info(`Scheduled reminder for ${memberId}: ${time} (${timezone})`);
  }

  /**
   * Schedule the Sunday planning session for a member.
   * Runs at 10:00 AM every Sunday in the member's timezone.
   *
   * @param memberId - The member ID
   * @param timezone - IANA timezone string
   * @param fn - Async function to call when the task fires
   */
  schedulePlanning(
    memberId: string,
    timezone: string,
    fn: () => Promise<void>,
  ): void {
    const cronExpr = '0 10 * * 0'; // 10:00 AM every Sunday
    this.setTask(memberId, 'planning', cronExpr, timezone, fn);
    logger.info(`Scheduled Sunday planning for ${memberId} (${timezone})`);
  }

  /**
   * Schedule an evening nudge cron task for a member.
   * Replaces any existing nudge task for this member.
   *
   * @param memberId - The member ID
   * @param cronExpr - Cron expression for nudge time
   * @param timezone - IANA timezone string
   * @param fn - Async function to call when the task fires
   */
  scheduleNudge(
    memberId: string,
    cronExpr: string,
    timezone: string,
    fn: () => Promise<void>,
  ): void {
    this.setTask(memberId, 'nudge', cronExpr, timezone, fn);
    logger.info(`Scheduled nudge for ${memberId}: "${cronExpr}" (${timezone})`);
  }

  /**
   * Stop and remove all scheduled tasks for a member.
   */
  unscheduleAll(memberId: string): void {
    const memberTasks = this.tasks.get(memberId);
    if (!memberTasks) return;

    for (const [taskType, task] of memberTasks) {
      task.stop();
      logger.debug(`Stopped task "${taskType}" for ${memberId}`);
    }

    this.tasks.delete(memberId);
    logger.info(`Unscheduled all tasks for ${memberId}`);
  }

  /**
   * Rebuild all scheduled tasks from database state.
   * Called on bot startup to restore all member schedules.
   *
   * @param schedules - All MemberSchedule records from the database
   * @param briefFn - Factory function for brief task callbacks
   * @param reminderFn - Factory function for reminder task callbacks
   * @param planningFn - Factory function for planning session callbacks
   * @param nudgeFn - Factory function for nudge task callbacks
   */
  rebuildAll(
    schedules: MemberSchedule[],
    briefFn: (memberId: string) => () => Promise<void>,
    reminderFn: (memberId: string) => () => Promise<void>,
    planningFn: (memberId: string) => () => Promise<void>,
    nudgeFn?: (memberId: string) => () => Promise<void>,
  ): void {
    // Stop all existing tasks first
    for (const memberId of this.tasks.keys()) {
      this.unscheduleAll(memberId);
    }

    let briefCount = 0;
    let reminderCount = 0;
    let planningCount = 0;
    let nudgeCount = 0;

    for (const schedule of schedules) {
      const { memberId, timezone } = schedule;

      // Schedule brief if briefTime is set
      if (schedule.briefTime) {
        const [hours, minutes] = schedule.briefTime.split(':');
        const cronExpr = `${minutes} ${hours} * * *`;
        this.scheduleBrief(memberId, cronExpr, timezone, briefFn(memberId));
        briefCount++;
      }

      // Schedule reminders
      for (const time of schedule.reminderTimes) {
        this.scheduleReminder(memberId, time, timezone, reminderFn(memberId));
        reminderCount++;
      }

      // Schedule Sunday planning if enabled
      if (schedule.sundayPlanning) {
        this.schedulePlanning(memberId, timezone, planningFn(memberId));
        planningCount++;
      }

      // Schedule nudge if nudgeTime is set and nudgeFn provided
      if (schedule.nudgeTime && nudgeFn) {
        const [hours, minutes] = schedule.nudgeTime.split(':');
        const cronExpr = `${minutes} ${hours} * * *`;
        this.scheduleNudge(memberId, cronExpr, timezone, nudgeFn(memberId));
        nudgeCount++;
      }
    }

    logger.info(
      `Rebuilt all tasks: ${schedules.length} members, ` +
      `${briefCount} briefs, ${reminderCount} reminders, ${planningCount} planning sessions, ${nudgeCount} nudges`,
    );
  }

  /**
   * Update a single member's schedule.
   * Stops all existing tasks for the member and recreates from new schedule.
   *
   * @param memberId - The member ID
   * @param schedule - Updated MemberSchedule data
   * @param briefFn - Factory for brief callback
   * @param reminderFn - Factory for reminder callback
   * @param planningFn - Factory for planning callback
   * @param nudgeFn - Factory for nudge callback
   */
  updateMemberSchedule(
    memberId: string,
    schedule: MemberSchedule,
    briefFn: (memberId: string) => () => Promise<void>,
    reminderFn: (memberId: string) => () => Promise<void>,
    planningFn: (memberId: string) => () => Promise<void>,
    nudgeFn?: (memberId: string) => () => Promise<void>,
  ): void {
    // Stop existing tasks
    this.unscheduleAll(memberId);

    const { timezone } = schedule;

    // Recreate from new schedule
    if (schedule.briefTime) {
      const [hours, minutes] = schedule.briefTime.split(':');
      const cronExpr = `${minutes} ${hours} * * *`;
      this.scheduleBrief(memberId, cronExpr, timezone, briefFn(memberId));
    }

    for (const time of schedule.reminderTimes) {
      this.scheduleReminder(memberId, time, timezone, reminderFn(memberId));
    }

    if (schedule.sundayPlanning) {
      this.schedulePlanning(memberId, timezone, planningFn(memberId));
    }

    // Schedule nudge if nudgeTime is set and nudgeFn provided
    if (schedule.nudgeTime && nudgeFn) {
      const [hours, minutes] = schedule.nudgeTime.split(':');
      const cronExpr = `${minutes} ${hours} * * *`;
      this.scheduleNudge(memberId, cronExpr, timezone, nudgeFn(memberId));
    }

    logger.info(`Updated schedule for ${memberId}`);
  }

  /**
   * Internal: create or replace a task for a member.
   */
  private setTask(
    memberId: string,
    taskType: string,
    cronExpr: string,
    timezone: string,
    fn: () => Promise<void>,
  ): void {
    // Ensure member map exists
    if (!this.tasks.has(memberId)) {
      this.tasks.set(memberId, new Map());
    }
    const memberTasks = this.tasks.get(memberId)!;

    // Stop existing task of this type if any
    const existing = memberTasks.get(taskType);
    if (existing) {
      existing.stop();
      logger.debug(`Replaced task "${taskType}" for ${memberId}`);
    }

    // Create new task with timezone support (node-cron 4.x)
    // Using schedule() which calls createTask().start() internally
    const task = cron.schedule(cronExpr, async () => {
      try {
        await fn();
      } catch (error) {
        logger.error(
          `Scheduled task "${taskType}" failed for ${memberId}: ${String(error)}`,
        );
      }
    }, {
      timezone,
      name: `${taskType}-${memberId}`,
    });

    memberTasks.set(taskType, task);
  }
}
