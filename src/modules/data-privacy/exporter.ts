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
  // Fetch the member with ALL relations included
  const member = await db.member.findUniqueOrThrow({
    where: { id: memberId },
    include: {
      accounts: { select: { discordId: true, linkedAt: true } },
      profile: true,
      checkIns: { orderBy: { createdAt: 'asc' } },
      goals: { orderBy: { createdAt: 'asc' } },
      xpTransactions: { orderBy: { createdAt: 'asc' } },
      voiceSessions: { orderBy: { startedAt: 'asc' } },
      conversationMessages: { orderBy: { createdAt: 'asc' } },
      conversationSummary: true,
      schedule: true,
      seasonSnapshots: true,
      privateSpace: true,
    },
  });

  // Fetch session participation separately (no direct Member relation)
  const sessionParticipation = await db.sessionParticipant.findMany({
    where: { memberId },
    include: { session: true },
  });

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

    profile: member.profile
      ? {
          interests: member.profile.interests,
          currentFocus: member.profile.currentFocus,
          goals: member.profile.goals,
          learningAreas: member.profile.learningAreas,
          workStyle: member.profile.workStyle,
          publicFields: member.profile.publicFields,
          rawAnswers: member.profile.rawAnswers,
        }
      : null,

    checkIns: member.checkIns.map((c) => ({
      id: c.id,
      content: c.content,
      effortRating: c.effortRating,
      categories: c.categories,
      xpAwarded: c.xpAwarded,
      dayIndex: c.dayIndex,
      createdAt: c.createdAt,
    })),

    goals: member.goals.map((g) => ({
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

    conversations: member.conversationMessages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    })),

    conversationSummary: member.conversationSummary
      ? {
          summary: member.conversationSummary.summary,
          messageCount: member.conversationSummary.messageCount,
          updatedAt: member.conversationSummary.updatedAt,
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

    sessionParticipation: sessionParticipation.map((sp) => ({
      sessionId: sp.sessionId,
      role: sp.role,
      joinedAt: sp.joinedAt,
      leftAt: sp.leftAt,
      session: {
        title: sp.session.title,
        visibility: sp.session.visibility,
        status: sp.session.status,
        startedAt: sp.session.startedAt,
        endedAt: sp.session.endedAt,
      },
    })),
  };

  return Buffer.from(JSON.stringify(exportData, null, 2), 'utf-8');
}
