/**
 * Season Manager
 *
 * Lifecycle management for the Valorant-style seasonal system.
 *
 * Key design principle: NO data is destroyed during season transitions.
 * Seasonal rankings are date-range queries over the same underlying data.
 * Season 1 data is always available via snapshots.
 *
 * Functions:
 * - getActiveSeason: Query the current active season
 * - getSeasonByNumber: Query a specific season with snapshots
 * - bootstrapSeason: Auto-create Season 1 on first bot startup
 * - endSeason: Full season transition (snapshot, close, champion, hall-of-fame, new season)
 * - checkSeasonExpiry: Daily cron check for season end and champion role cleanup
 * - getSeasonSummary: Structured data for /season command
 */

import type { Client, Guild } from 'discord.js';
import type { Logger } from 'winston';
import type { ExtendedPrismaClient } from '@28k/db';
import type { IEventBus } from '../../shared/types.js';
import type { LeaderboardEntry } from '../leaderboard/calculator.js';
import {
  getXPLeaderboard,
  getVoiceLeaderboard,
  getStreakLeaderboard,
} from '../leaderboard/calculator.js';
import {
  SEASON_DURATION_DAYS,
  CHAMPION_ROLE_DURATION_DAYS,
  CHAMPION_ROLE_COLOR,
  CHAMPION_ROLE_PREFIX,
} from './constants.js';
import { postSeasonSummary } from './hall-of-fame.js';

/** Structured season summary for the /season command. */
export interface SeasonSummary {
  season: {
    id: string;
    number: number;
    startedAt: Date;
    endedAt: Date | null;
    active: boolean;
  };
  xpRankings: LeaderboardEntry[];
  voiceRankings: LeaderboardEntry[];
  streakRankings: LeaderboardEntry[];
}

/**
 * Get the currently active season.
 * Returns null if no season is active (first startup before bootstrap).
 */
export async function getActiveSeason(
  db: ExtendedPrismaClient,
): Promise<{
  id: string;
  number: number;
  startedAt: Date;
  endedAt: Date | null;
  active: boolean;
} | null> {
  return db.season.findFirst({
    where: { active: true },
  });
}

/**
 * Get a season by its number, including snapshots.
 */
export async function getSeasonByNumber(
  db: ExtendedPrismaClient,
  number: number,
): Promise<{
  id: string;
  number: number;
  startedAt: Date;
  endedAt: Date | null;
  active: boolean;
  snapshots: Array<{
    id: string;
    seasonId: string;
    memberId: string;
    dimension: string;
    position: number;
    value: number;
  }>;
} | null> {
  return db.season.findUnique({
    where: { number },
    include: { snapshots: true },
  });
}

/**
 * Bootstrap Season 1 on first bot startup.
 * Called when no active season exists. Creates Season 1 starting now.
 */
export async function bootstrapSeason(
  db: ExtendedPrismaClient,
  logger: Logger,
): Promise<{ id: string; number: number; startedAt: Date; active: boolean }> {
  const season = await db.season.create({
    data: {
      number: 1,
      startedAt: new Date(),
      active: true,
    },
  });

  logger.info('Season 1 started (auto-bootstrap)');
  return season;
}

/**
 * End the current season and start the next one.
 *
 * Steps:
 * 1. Snapshot all three leaderboard dimensions
 * 2. Close the active season
 * 3. Create champion role for #1 XP player
 * 4. Post hall-of-fame summary
 * 5. Start new season
 * 6. Emit events
 */
export async function endSeason(
  db: ExtendedPrismaClient,
  client: Client,
  events: IEventBus,
  logger: Logger,
): Promise<void> {
  // Get active season
  const activeSeason = await getActiveSeason(db);
  if (!activeSeason) {
    logger.warn('[season] endSeason called but no active season found');
    return;
  }

  const now = new Date();
  const seasonNumber = activeSeason.number;

  // Step 1: Snapshot all three leaderboard dimensions
  const seasonOptions = {
    seasonStart: activeSeason.startedAt,
    seasonEnd: now,
    limit: 1000, // Capture all members, not just top N
  };

  const [xpEntries, voiceEntries, streakEntries] = await Promise.all([
    getXPLeaderboard(db, seasonOptions),
    getVoiceLeaderboard(db, seasonOptions),
    getStreakLeaderboard(db, 1000),
  ]);

  // Create snapshots for each dimension
  const snapshotData: Array<{
    seasonId: string;
    memberId: string;
    dimension: string;
    position: number;
    value: number;
  }> = [];

  for (const entry of xpEntries) {
    snapshotData.push({
      seasonId: activeSeason.id,
      memberId: entry.memberId,
      dimension: 'xp',
      position: entry.position,
      value: entry.value,
    });
  }

  for (const entry of voiceEntries) {
    snapshotData.push({
      seasonId: activeSeason.id,
      memberId: entry.memberId,
      dimension: 'voice',
      position: entry.position,
      value: entry.value,
    });
  }

  for (const entry of streakEntries) {
    snapshotData.push({
      seasonId: activeSeason.id,
      memberId: entry.memberId,
      dimension: 'streaks',
      position: entry.position,
      value: entry.value,
    });
  }

  if (snapshotData.length > 0) {
    await db.seasonSnapshot.createMany({ data: snapshotData });
  }

  // Step 2: Close the active season
  await db.season.update({
    where: { id: activeSeason.id },
    data: { endedAt: now, active: false },
  });

  // Step 3: Champion role for #1 XP player
  const guild = client.guilds.cache.first();
  let championName = 'Unknown';

  if (guild && xpEntries.length > 0) {
    const champion = xpEntries[0];
    championName = champion.displayName;

    try {
      await assignChampionRole(db, guild, champion, seasonNumber);
    } catch (error) {
      logger.error('[season] Failed to assign champion role:', error);
    }
  }

  // Step 4: Post hall-of-fame summary
  try {
    // Fetch the updated season with snapshots for the summary
    const seasonWithSnapshots = await db.season.findUnique({
      where: { id: activeSeason.id },
      include: { snapshots: true },
    });

    if (seasonWithSnapshots) {
      await postSeasonSummary(client, db, seasonWithSnapshots, seasonWithSnapshots.snapshots);
    }
  } catch (error) {
    logger.error('[season] Failed to post hall-of-fame summary:', error);
  }

  // Step 5: Start new season
  const newSeason = await db.season.create({
    data: {
      number: seasonNumber + 1,
      startedAt: now,
      active: true,
    },
  });

  // Step 6: Emit events
  events.emit('seasonEnded', seasonNumber);
  events.emit('seasonStarted', newSeason.number);

  logger.info(
    `Season ${seasonNumber} ended. Season ${newSeason.number} started. Champion: ${championName}`,
  );
}

/**
 * Assign the temporary champion role to the season's #1 XP player.
 *
 * Creates a hoisted gold "Season N Champion" role and assigns it to
 * the champion's Discord account(s). Stores role ID and expiry in BotConfig.
 */
async function assignChampionRole(
  db: ExtendedPrismaClient,
  guild: Guild,
  champion: LeaderboardEntry,
  seasonNumber: number,
): Promise<void> {
  // Create the champion role
  const roleName = `${CHAMPION_ROLE_PREFIX} ${seasonNumber} Champion`;
  const role = await guild.roles.create({
    name: roleName,
    color: CHAMPION_ROLE_COLOR,
    hoist: true,
    reason: `Season ${seasonNumber} champion: ${champion.displayName}`,
  });

  // Find the champion's Discord accounts and assign the role
  const accounts = await db.discordAccount.findMany({
    where: { memberId: champion.memberId },
    select: { discordId: true },
  });

  for (const account of accounts) {
    try {
      const guildMember = await guild.members.fetch(account.discordId);
      await guildMember.roles.add(role);
    } catch {
      // Member may not be in the guild -- skip silently
    }
  }

  // Store role ID and expiry in BotConfig for cleanup
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + CHAMPION_ROLE_DURATION_DAYS);

  await db.botConfig.upsert({
    where: { key: `season_${seasonNumber}_champion_role_id` },
    update: { value: role.id },
    create: { key: `season_${seasonNumber}_champion_role_id`, value: role.id },
  });

  await db.botConfig.upsert({
    where: { key: `season_${seasonNumber}_champion_role_expires` },
    update: { value: expiresAt.toISOString() },
    create: {
      key: `season_${seasonNumber}_champion_role_expires`,
      value: expiresAt.toISOString(),
    },
  });
}

/**
 * Daily cron check for season expiry and champion role cleanup.
 *
 * 1. If no active season, bootstrap one.
 * 2. If active season has run >= SEASON_DURATION_DAYS, end it.
 * 3. Clean up expired champion roles.
 */
export async function checkSeasonExpiry(
  db: ExtendedPrismaClient,
  client: Client,
  events: IEventBus,
  logger: Logger,
): Promise<void> {
  // Check for active season
  const activeSeason = await getActiveSeason(db);
  if (!activeSeason) {
    await bootstrapSeason(db, logger);
    return;
  }

  // Check if season has expired
  const now = new Date();
  const elapsed = now.getTime() - activeSeason.startedAt.getTime();
  const daysElapsed = Math.floor(elapsed / (1000 * 60 * 60 * 24));

  if (daysElapsed >= SEASON_DURATION_DAYS) {
    logger.info(
      `[season] Season ${activeSeason.number} expired after ${daysElapsed} days. Triggering transition.`,
    );
    await endSeason(db, client, events, logger);
  }

  // Clean up expired champion roles
  await cleanupExpiredChampionRoles(db, client, logger);
}

/**
 * Remove expired champion roles.
 *
 * Scans BotConfig for champion_role_expires entries that are past due,
 * deletes the Discord role, and removes the BotConfig entries.
 */
async function cleanupExpiredChampionRoles(
  db: ExtendedPrismaClient,
  client: Client,
  logger: Logger,
): Promise<void> {
  const guild = client.guilds.cache.first();
  if (!guild) return;

  // Find all champion role expiry entries
  const expiryEntries = await db.botConfig.findMany({
    where: {
      key: { contains: 'champion_role_expires' },
    },
  });

  const now = new Date();

  for (const entry of expiryEntries) {
    const expiresAt = new Date(entry.value);
    if (expiresAt > now) continue; // Not expired yet

    // Extract season number from key: season_{N}_champion_role_expires
    const match = entry.key.match(/season_(\d+)_champion_role_expires/);
    if (!match) continue;

    const seasonNumber = match[1];
    const roleIdKey = `season_${seasonNumber}_champion_role_id`;

    // Get the role ID
    const roleIdEntry = await db.botConfig.findUnique({
      where: { key: roleIdKey },
    });

    if (roleIdEntry) {
      try {
        const role = await guild.roles.fetch(roleIdEntry.value);
        if (role) {
          await role.delete(`Season ${seasonNumber} champion role expired`);
          logger.info(`Removed Season ${seasonNumber} Champion role (expired)`);
        }
      } catch {
        // Role may already be deleted -- that's fine
      }

      // Remove the BotConfig entries
      await db.botConfig.delete({ where: { key: roleIdKey } });
    }

    await db.botConfig.delete({ where: { key: entry.key } });
  }
}

/**
 * Get structured season summary for the /season command.
 *
 * Groups snapshots by dimension and returns rankings for display.
 */
export async function getSeasonSummary(
  db: ExtendedPrismaClient,
  seasonNumber: number,
): Promise<SeasonSummary | null> {
  const season = await getSeasonByNumber(db, seasonNumber);
  if (!season) return null;

  // Group snapshots by dimension, sorted by position
  const xpRankings: LeaderboardEntry[] = [];
  const voiceRankings: LeaderboardEntry[] = [];
  const streakRankings: LeaderboardEntry[] = [];

  // Fetch display names for all members in snapshots
  const memberIds = [...new Set(season.snapshots.map((s) => s.memberId))];
  const members = await db.member.findMany({
    where: { id: { in: memberIds } },
    select: { id: true, displayName: true },
  });
  const nameMap = new Map(members.map((m) => [m.id, m.displayName]));

  for (const snapshot of season.snapshots) {
    const entry: LeaderboardEntry = {
      position: snapshot.position,
      memberId: snapshot.memberId,
      displayName: nameMap.get(snapshot.memberId) ?? 'Unknown',
      value: snapshot.value,
    };

    switch (snapshot.dimension) {
      case 'xp':
        xpRankings.push(entry);
        break;
      case 'voice':
        voiceRankings.push(entry);
        break;
      case 'streaks':
        streakRankings.push(entry);
        break;
    }
  }

  // Sort by position
  xpRankings.sort((a, b) => a.position - b.position);
  voiceRankings.sort((a, b) => a.position - b.position);
  streakRankings.sort((a, b) => a.position - b.position);

  return {
    season: {
      id: season.id,
      number: season.number,
      startedAt: season.startedAt,
      endedAt: season.endedAt,
      active: season.active,
    },
    xpRankings,
    voiceRankings,
    streakRankings,
  };
}
