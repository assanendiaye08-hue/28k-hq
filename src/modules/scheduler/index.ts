/**
 * Scheduler module -- orchestrates per-member cron tasks.
 *
 * Responsibilities:
 * 1. Register /settings command
 * 2. Create SchedulerManager and rebuild tasks on bot ready
 * 3. Listen for scheduleUpdated event to rebuild individual member tasks
 * 4. Schedule global hourly goal expiry check
 * 5. Schedule global daily interest tag cleanup
 *
 * All scheduled tasks rebuild on bot restart from database state.
 */

import cron from 'node-cron';
import type { Client } from 'discord.js';
import type { Module, ModuleContext } from '../../shared/types.js';
import type { ExtendedPrismaClient } from '../../db/client.js';
import { SchedulerManager } from './manager.js';
import type { MemberSchedule } from './manager.js';
import { registerSchedulerCommands } from './commands.js';
import { sendBrief, sendCheckinReminder } from './briefs.js';
import { runPlanningSession } from './planning.js';
import { checkExpiredGoals } from '../goals/expiry.js';
import { cleanupUnusedTags } from '../server-setup/interest-tags.js';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) =>
      `${timestamp as string} [scheduler-module] ${level}: ${message as string}`),
  ),
  transports: [new winston.transports.Console()],
});

/**
 * Create brief callback factory.
 * Returns a function that, given a memberId, returns a callback for the cron task.
 */
function makeBriefFn(client: Client, db: ExtendedPrismaClient) {
  return (memberId: string) => () => sendBrief(client, db, memberId);
}

/**
 * Create reminder callback factory.
 */
function makeReminderFn(client: Client, db: ExtendedPrismaClient) {
  return (memberId: string) => () => sendCheckinReminder(client, db, memberId);
}

/**
 * Create planning session callback factory.
 */
function makePlanningFn(client: Client, db: ExtendedPrismaClient, ctx: ModuleContext) {
  return (memberId: string) => () => runPlanningSession(client, db, memberId, ctx.events);
}

const schedulerModule: Module = {
  name: 'scheduler',

  async register(ctx: ModuleContext): Promise<void> {
    const db = ctx.db as ExtendedPrismaClient;
    const { client, events } = ctx;

    // 1. Register /settings command
    registerSchedulerCommands(ctx);

    // 2. Create SchedulerManager
    const manager = new SchedulerManager();

    const briefFn = makeBriefFn(client, db);
    const reminderFn = makeReminderFn(client, db);
    const planningFn = makePlanningFn(client, db, ctx);

    // 3. Rebuild all tasks on Discord ready event
    client.once('ready', async () => {
      try {
        // Fetch all MemberSchedule records from DB
        const schedules = await db.memberSchedule.findMany();

        // Map to the MemberSchedule interface used by SchedulerManager
        const scheduleData: MemberSchedule[] = schedules.map((s) => ({
          memberId: s.memberId,
          timezone: s.timezone,
          briefTime: s.briefTime,
          briefTone: s.briefTone,
          reminderTimes: s.reminderTimes,
          sundayPlanning: s.sundayPlanning,
        }));

        manager.rebuildAll(scheduleData, briefFn, reminderFn, planningFn);
        logger.info(`Rebuilt ${scheduleData.length} member schedules on ready`);
      } catch (error) {
        logger.error(`Failed to rebuild schedules on ready: ${String(error)}`);
      }
    });

    // 4. Listen for scheduleUpdated event -- rebuild single member's tasks
    events.on('scheduleUpdated', async (...args: unknown[]) => {
      const memberId = args[0] as string;
      try {
        const schedule = await db.memberSchedule.findUnique({
          where: { memberId },
        });

        if (!schedule) {
          manager.unscheduleAll(memberId);
          logger.info(`Schedule removed for ${memberId}, tasks unscheduled`);
          return;
        }

        const scheduleData: MemberSchedule = {
          memberId: schedule.memberId,
          timezone: schedule.timezone,
          briefTime: schedule.briefTime,
          briefTone: schedule.briefTone,
          reminderTimes: schedule.reminderTimes,
          sundayPlanning: schedule.sundayPlanning,
        };

        manager.updateMemberSchedule(
          memberId,
          scheduleData,
          briefFn,
          reminderFn,
          planningFn,
        );
        logger.info(`Rebuilt schedule for ${memberId} after update`);
      } catch (error) {
        logger.error(`Failed to rebuild schedule for ${memberId}: ${String(error)}`);
      }
    });

    // 5. Schedule global recurring task: goal expiry check every hour
    cron.schedule('0 * * * *', async () => {
      try {
        await checkExpiredGoals(db, client);
        logger.debug('Goal expiry check completed');
      } catch (error) {
        logger.error(`Goal expiry check failed: ${String(error)}`);
      }
    }, {
      name: 'goal-expiry-check',
    });

    logger.info('Scheduled hourly goal expiry check');

    // 6. Schedule global recurring task: interest tag cleanup every 24 hours
    // Runs at 4:00 AM UTC daily (low-traffic time)
    cron.schedule('0 4 * * *', async () => {
      try {
        // Need a guild to clean up roles -- use the configured guild
        const guild = client.guilds.cache.first();
        if (guild) {
          await cleanupUnusedTags(guild, db);
          logger.debug('Interest tag cleanup completed');
        } else {
          logger.warn('No guild available for interest tag cleanup');
        }
      } catch (error) {
        logger.error(`Interest tag cleanup failed: ${String(error)}`);
      }
    }, {
      name: 'interest-tag-cleanup',
    });

    logger.info('Scheduled daily interest tag cleanup (4:00 AM UTC)');
    logger.info('Scheduler module registered');
  },
};

export default schedulerModule;
