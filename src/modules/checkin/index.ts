/**
 * Check-in Module
 *
 * Provides the /checkin slash command for daily activity logging.
 * Features: AI category extraction, flexible streak tracking, diminishing XP.
 *
 * The command handler does everything inline -- no event listeners needed
 * in this module. Events are emitted for other modules to react to
 * (checkinComplete -> XP module, etc.)
 */

import type { Module, ModuleContext } from '../../shared/types.js';
import { registerCheckinCommands } from './commands.js';

const checkinModule: Module = {
  name: 'checkin',

  register(ctx: ModuleContext): void {
    registerCheckinCommands(ctx);
    ctx.logger.info('[checkin] Module registered');
  },
};

export default checkinModule;
