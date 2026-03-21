/**
 * Data Exporter -- builds a complete JSON export of all member data.
 *
 * Queries every table related to the member and structures it into
 * a human-readable JSON object. Encrypted fields (rawAnswers, content,
 * description, summary, title) are automatically decrypted by the
 * encryption extension on read -- the export shows plaintext because
 * only the member themselves receives it.
 */

import type { ExtendedPrismaClient } from '../../db/client.js';
import { EXPORT_VERSION } from './constants.js';

/**
 * Export all stored data for a member as a JSON buffer.
 *
 * @param db - Extended Prisma client with encryption
 * @param memberId - The member's internal CUID
 * @returns A UTF-8 Buffer containing pretty-printed JSON of all member data
 */
export async function exportMemberData(
  db: ExtendedPrismaClient,
  memberId: string,
): Promise<Buffer> {
  // Fetch the member with non-encrypted relations included.
  // Encrypted models are queried separately so the encryption extension
  // fires on each direct model query and decrypts fields transparently.
  const member = await db.member.findUniqueOrThrow({
    where: { id: memberId },
    include: {
      accounts: { select: { discordId: true, linkedAt: true } },
      xpTransactions: { orderBy: { createdAt: 'asc' } },
      voiceSessions: { orderBy: { startedAt: 'asc' } },
      schedule: true,
      seasonSnapshots: true,
      privateSpace: true,
      notificationPreference: true,
      timerSessions: { orderBy: { startedAt: 'asc' } },
      reminders: { orderBy: { createdAt: 'asc' } },
      inspirations: { orderBy: { createdAt: 'asc' } },
    },
  });

  // Separate queries for encrypted models -- extension decrypts on direct model queries
  const profile = await db.memberProfile.findUnique({ where: { memberId } });
  const checkIns = await db.checkIn.findMany({ where: { memberId }, orderBy: { createdAt: 'asc' } });
  const goals = await db.goal.findMany({ where: { memberId }, orderBy: { createdAt: 'asc' } });
  const conversationMessages = await db.conversationMessage.findMany({ where: { memberId }, orderBy: { createdAt: 'asc' } });
  const conversationSummary = await db.conversationSummary.findUnique({ where: { memberId } });
  const reflections = await db.reflection.findMany({ where: { memberId }, orderBy: { createdAt: 'asc' } });

  // Fetch session participation separately (no direct Member relation)
  const sessionParticipation = await db.sessionParticipant.findMany({
    where: { memberId },
    include: { session: true },
  });

  // Direct query for LockInSession titles so the encryption extension fires
  // (included/nested relations from sessionParticipant don't trigger decryption)
  const sessionIds = [...new Set(sessionParticipation.map((sp) => sp.sessionId))];
  const sessions = sessionIds.length > 0
    ? await db.lockInSession.findMany({ where: { id: { in: sessionIds } } })
    : [];
  const sessionTitleMap = new Map(sessions.map((s) => [s.id, s.title]));

  // Build the structured export object
  const exportData = {
    exportVersion: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),

    member: {
      id: member.id,
      displayName: member.displayName,
      totalXp: member.totalXp,
      currentStreak: member.currentStreak,
      longestStreak: member.longestStreak,
      lastCheckInAt: member.lastCheckInAt,
      createdAt: member.createdAt,
      updatedAt: member.updatedAt,
    },

    accounts: member.accounts.map((a) => ({
      discordId: a.discordId,
      linkedAt: a.linkedAt,
    })),

    profile: profile
      ? {
          interests: profile.interests,
          currentFocus: profile.currentFocus,
          goals: profile.goals,
          learningAreas: profile.learningAreas,
          workStyle: profile.workStyle,
          publicFields: profile.publicFields,
          rawAnswers: profile.rawAnswers,
        }
      : null,

    checkIns: checkIns.map((c) => ({
      id: c.id,
      content: c.content,
      effortRating: c.effortRating,
      categories: c.categories,
      xpAwarded: c.xpAwarded,
      dayIndex: c.dayIndex,
      createdAt: c.createdAt,
    })),

    goals: goals.map((g) => ({
      id: g.id,
      title: g.title,
      description: g.description,
      type: g.type,
      targetValue: g.targetValue,
      currentValue: g.currentValue,
      unit: g.unit,
      status: g.status,
      deadline: g.deadline,
      xpAwarded: g.xpAwarded,
      createdAt: g.createdAt,
      completedAt: g.completedAt,
      extendedAt: g.extendedAt,
      parentId: g.parentId,
      timeframe: g.timeframe,
      depth: g.depth,
    })),

    xpHistory: member.xpTransactions.map((t) => ({
      id: t.id,
      amount: t.amount,
      source: t.source,
      description: t.description,
      createdAt: t.createdAt,
    })),

    voiceSessions: member.voiceSessions.map((v) => ({
      id: v.id,
      channelId: v.channelId,
      startedAt: v.startedAt,
      endedAt: v.endedAt,
      durationMinutes: v.durationMinutes,
    })),

    conversations: conversationMessages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    })),

    conversationSummary: conversationSummary
      ? {
          summary: conversationSummary.summary,
          messageCount: conversationSummary.messageCount,
          updatedAt: conversationSummary.updatedAt,
        }
      : null,

    schedule: member.schedule
      ? {
          timezone: member.schedule.timezone,
          briefTime: member.schedule.briefTime,
          briefTone: member.schedule.briefTone,
          reminderTimes: member.schedule.reminderTimes,
          sundayPlanning: member.schedule.sundayPlanning,
          accountabilityLevel: member.schedule.accountabilityLevel,
          nudgeTime: member.schedule.nudgeTime,
        }
      : null,

    seasonSnapshots: member.seasonSnapshots.map((s) => ({
      seasonId: s.seasonId,
      dimension: s.dimension,
      position: s.position,
      value: s.value,
    })),

    privateSpace: member.privateSpace
      ? {
          type: member.privateSpace.type,
          channelId: member.privateSpace.channelId,
        }
      : null,

    notificationPreference: member.notificationPreference
      ? {
          briefAccountId: member.notificationPreference.briefAccountId,
          nudgeAccountId: member.notificationPreference.nudgeAccountId,
          sessionAlertAccountId: member.notificationPreference.sessionAlertAccountId,
          levelUpAccountId: member.notificationPreference.levelUpAccountId,
          reminderAccountId: member.notificationPreference.reminderAccountId,
        }
      : null,

    timerSessions: member.timerSessions.map((t) => ({
      id: t.id,
      mode: t.mode,
      status: t.status,
      focus: t.focus,
      workDuration: t.workDuration,
      breakDuration: t.breakDuration,
      totalWorkedMs: t.totalWorkedMs,
      pomodoroCount: t.pomodoroCount,
      xpAwarded: t.xpAwarded,
      startedAt: t.startedAt,
      endedAt: t.endedAt,
    })),

    reminders: member.reminders.map((r) => ({
      id: r.id,
      content: r.content,
      fireAt: r.fireAt,
      urgency: r.urgency,
      cronExpression: r.cronExpression,
      status: r.status,
      createdAt: r.createdAt,
    })),

    reflections: reflections.map((r) => ({
      id: r.id,
      type: r.type,
      question: r.question,
      response: r.response,
      insights: r.insights,
      createdAt: r.createdAt,
    })),

    inspirations: member.inspirations.map((i) => ({
      name: i.name,
      context: i.context,
      createdAt: i.createdAt,
    })),

    sessionParticipation: sessionParticipation.map((sp) => ({
      sessionId: sp.sessionId,
      role: sp.role,
      joinedAt: sp.joinedAt,
      leftAt: sp.leftAt,
      session: {
        title: sessionTitleMap.get(sp.sessionId) ?? sp.session.title,
        visibility: sp.session.visibility,
        status: sp.session.status,
        startedAt: sp.session.startedAt,
        endedAt: sp.session.endedAt,
      },
    })),
  };

  return Buffer.from(JSON.stringify(exportData, null, 2), 'utf-8');
}
