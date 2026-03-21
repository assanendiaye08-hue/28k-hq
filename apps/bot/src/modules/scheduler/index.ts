/**
 * Scheduler module -- orchestrates per-member cron tasks.
 *
 * Responsibilities:
 * 1. Register /settings command
 * 2. Create SchedulerManager and rebuild tasks on bot ready
 * 3. Listen for scheduleUpdated event to rebuild individual member tasks
 * 4. Schedule global hourly goal expiry check
 * 5. Schedule global daily interest tag cleanup
 * 6. Schedule global evening nudge sweep (21:00 UTC fallback)
 * 7. Schedule monthly reflection sweep (28th at 18:00 UTC)
 * 8. Schedule monthly recap sweep (1st at 10:00 UTC)
 *
 * All scheduled tasks rebuild on bot restart from database state.
 */

import cron from 'node-cron';
import type { Client } from 'discord.js';
import type { Module, ModuleContext } from '../../shared/types.js';
import type { ExtendedPrismaClient } from '@28k/db';
import { SchedulerManager } from './manager.js';
import type { MemberSchedule } from './manager.js';
import { registerSchedulerCommands } from './commands.js';
import { sendBrief, sendCheckinReminder } from './briefs.js';
import { runPlanningSession } from './planning.js';
import { checkExpiredGoals } from '../goals/expiry.js';
import { cleanupUnusedTags } from '../server-setup/interest-tags.js';
import { sendNudge } from '../ai-assistant/nudge.js';
import { runReflectionFlow } from '../reflection/flow.js';
import { sendRecap } from '../recap/generator.js';
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
 * Chains weekly reflection BEFORE the planning session if member
 * has reflectionIntensity !== 'off'.
 */
function makePlanningFn(client: Client, db: ExtendedPrismaClient, ctx: ModuleContext) {
  return (memberId: string) => async () => {
    // Run weekly reflection first (if enabled)
    const schedule = await db.memberSchedule.findUnique({ where: { memberId } });
    if (schedule && schedule.reflectionIntensity !== 'off') {
      await runReflectionFlow(client, db, memberId, 'WEEKLY');
    }
    // Then run planning session
    await runPlanningSession(client, db, memberId, ctx.events);
  };
}

/**
 * Create nudge callback factory.
 */
function makeNudgeFn(client: Client, db: ExtendedPrismaClient) {
  return (memberId: string) => () => sendNudge(client, db, memberId);
}

/**
 * Create daily reflection callback factory.
 * Checks member's reflectionIntensity and day-of-week to determine
 * whether to fire a daily reflection:
 * - off: no reflections
 * - light: weekly only (handled by planning chain, not daily cron)
 * - medium: Mon(1), Wed(3), Fri(5) only
 * - heavy: every day
 */
function makeReflectionFn(client: Client, db: ExtendedPrismaClient) {
  return (memberId: string) => async () => {
    const schedule = await db.memberSchedule.findUnique({ where: { memberId } });
    if (!schedule) return;

    const intensity = schedule.reflectionIntensity;
    if (intensity === 'off' || intensity === 'light') return; // light = weekly only, handled by planning

    if (intensity === 'medium') {
      // 3 days: Mon(1), Wed(3), Fri(5)
      const dayOfWeek = new Date().getDay(); // 0=Sun
      if (![1, 3, 5].includes(dayOfWeek)) return;
    }
    // heavy = every day

    await runReflectionFlow(client, db, memberId, 'DAILY');
  };
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
    const nudgeFn = makeNudgeFn(client, db);
    const reflectionFn = makeReflectionFn(client, db);

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
          accountabilityLevel: s.accountabilityLevel,
          nudgeTime: s.nudgeTime,
          reflectionIntensity: s.reflectionIntensity,
        }));

        manager.rebuildAll(scheduleData, briefFn, reminderFn, planningFn, nudgeFn, reflectionFn);
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
          accountabilityLevel: schedule.accountabilityLevel,
          nudgeTime: schedule.nudgeTime,
          reflectionIntensity: schedule.reflectionIntensity,
        };

        manager.updateMemberSchedule(
          memberId,
          scheduleData,
          briefFn,
          reminderFn,
          planningFn,
          nudgeFn,
          reflectionFn,
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

    // 7. Schedule global evening nudge sweep at 21:00 UTC
    // This is a fallback sweep -- individual cron tasks handle per-member
    // scheduling, but this sweep catches edge cases (members without individual
    // nudge tasks, timezone drift, etc.)
    cron.schedule('0 21 * * *', async () => {
      try {
        const schedules = await db.memberSchedule.findMany({
          where: { nudgeTime: { not: null } },
        });

        let nudgesSent = 0;
        for (const schedule of schedules) {
          try {
            await sendNudge(client, db, schedule.memberId);
            nudgesSent++;
          } catch (error) {
            logger.error(`Evening sweep nudge failed for ${schedule.memberId}: ${String(error)}`);
          }
        }

        logger.info(`Evening nudge sweep completed: ${nudgesSent}/${schedules.length} processed`);
      } catch (error) {
        logger.error(`Evening nudge sweep failed: ${String(error)}`);
      }
    }, {
      name: 'evening-nudge-sweep',
    });

    logger.info('Scheduled evening nudge sweep (21:00 UTC)');

    // 8. Schedule monthly reflection sweep on the 28th at 18:00 UTC
    // Runs for all members with reflectionIntensity in ['medium', 'heavy']
    cron.schedule('0 18 28 * *', async () => {
      try {
        const schedules = await db.memberSchedule.findMany({
          where: { reflectionIntensity: { in: ['medium', 'heavy'] } },
        });

        for (const schedule of schedules) {
          try {
            await runReflectionFlow(client, db, schedule.memberId, 'MONTHLY');
          } catch (error) {
            logger.error(`Monthly reflection failed for ${schedule.memberId}: ${String(error)}`);
          }
        }

        logger.info(`Monthly reflection sweep completed: ${schedules.length} members`);
      } catch (error) {
        logger.error(`Monthly reflection sweep failed: ${String(error)}`);
      }
    }, { name: 'monthly-reflection-sweep' });

    logger.info('Scheduled monthly reflection sweep (28th at 18:00 UTC)');

    // 9. Schedule monthly recap sweep on the 1st at 10:00 UTC
    cron.schedule('0 10 1 * *', async () => {
      try {
        const members = await db.member.findMany({
          where: { schedule: { isNot: null } },
          select: { id: true },
        });

        for (const member of members) {
          try {
            await sendRecap(client, db, member.id);
          } catch (error) {
            logger.error(`Monthly recap failed for ${member.id}: ${String(error)}`);
          }
        }

        logger.info(`Monthly recap sweep completed: ${members.length} members`);
      } catch (error) {
        logger.error(`Monthly recap sweep failed: ${String(error)}`);
      }
    }, { name: 'monthly-recap-sweep' });

    logger.info('Scheduled monthly recap sweep (1st at 10:00 UTC)');
    logger.info('Scheduler module registered');
  },
};

export default schedulerModule;
