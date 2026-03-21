/**
 * Maximum number of Discord accounts a single member can link.
 * Set to 5 -- generous enough that no one hits it legitimately,
 * trivial to lower later but awkward to raise.
 */
export const ACCOUNT_LINK_CAP = 5;

/**
 * Time-to-live for account link verification codes (5 minutes).
 */
export const LINK_CODE_TTL_MS = 5 * 60 * 1000;

/**
 * Timeout per question during the profile setup flow (5 minutes).
 */
export const SETUP_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Prefix for recovery keys given to members during setup.
 * Format: DHKEY-<base64url encoded per-member key>
 */
export const RECOVERY_KEY_PREFIX = 'DHKEY-';

/**
 * Hustler-themed rank progression.
 * XP thresholds are designed to feel achievable early,
 * then increasingly prestigious at higher levels.
 */
export const RANK_PROGRESSION = [
  { name: 'Rookie', xpThreshold: 0, color: 0x9e9e9e },       // Gray -- starting out
  { name: 'Grinder', xpThreshold: 100, color: 0x4caf50 },    // Green -- getting active
  { name: 'Hustler', xpThreshold: 500, color: 0x2196f3 },    // Blue -- consistent effort
  { name: 'Boss', xpThreshold: 2000, color: 0x9c27b0 },      // Purple -- serious player
  { name: 'Mogul', xpThreshold: 5000, color: 0xff9800 },     // Orange -- top tier
  { name: 'Legend', xpThreshold: 15000, color: 0xffd700 },   // Gold -- peak hustler
] as const;

/**
 * Server category and channel configuration.
 * Channels are created lazily as members onboard,
 * not all at once on day one.
 */
export const SERVER_CATEGORIES = {
  welcome: {
    name: 'Welcome',
    channels: [
      { name: 'welcome', description: 'Start here -- run /setup to unlock the server' },
      { name: 'announcements', description: 'Server updates and important news' },
    ],
  },
  general: {
    name: 'The Hub',
    channels: [
      { name: 'general', description: 'Main chat' },
      { name: 'wins', description: 'Share your wins -- big or small' },
      { name: 'lessons', description: 'Share what you learned (especially from Ls)' },
      { name: 'questions', description: 'Ask the group anything' },
      { name: 'leaderboard', description: 'Live leaderboards -- updated every 15 minutes' },
      { name: 'hall-of-fame', description: 'Permanent season standings -- the legends live here' },
    ],
  },
  voice: {
    name: 'Lock In',
    channels: [
      { name: 'Co-Work 1', description: 'Always-on co-working room', type: 'voice' as const },
      { name: 'Co-Work 2', description: 'Always-on co-working room', type: 'voice' as const },
    ],
  },
} as const;

/**
 * Brand colors used consistently across all embeds.
 */
export const BRAND_COLORS = {
  primary: 0xf59e0b,    // Amber/gold -- the hustler brand color
  success: 0x22c55e,    // Green -- positive outcomes
  error: 0xef4444,      // Red -- errors and warnings
  info: 0x3b82f6,       // Blue -- informational
  profile: 0xf59e0b,    // Amber/gold -- profile embeds match brand
} as const;
