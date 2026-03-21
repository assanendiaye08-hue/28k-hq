// Constants
export {
  ACCOUNT_LINK_CAP,
  LINK_CODE_TTL_MS,
  SETUP_TIMEOUT_MS,
  RECOVERY_KEY_PREFIX,
  RANK_PROGRESSION,
  SERVER_CATEGORIES,
  BRAND_COLORS,
} from './constants.js';

// XP constants
export { XP_AWARDS, STREAK_CONFIG } from './xp-constants.js';

// XP engine
export {
  awardXP,
  getRankForXP,
  getNextRankInfo,
  calculateCheckinXP,
  calculateStreakMultiplier,
  type XPSource,
  type AwardXPResult,
  type RankInfo,
} from './xp-engine.js';

// Timer constants
export { TIMER_DEFAULTS } from './timer-constants.js';
