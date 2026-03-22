import { config } from '../core/config.js';

export function isOwner(userId: string): boolean {
  return userId === config.OWNER_DISCORD_ID;
}
