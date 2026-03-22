/**
 * Announce-Update Module
 *
 * Owner-only command to post desktop app update announcements to the server.
 */

import type { Module, ModuleContext } from '../../shared/types.js';
import {
  buildAnnounceUpdateCommand,
  handleAnnounceUpdateCommand,
} from './commands.js';

const announceUpdateModule: Module = {
  name: 'announce-update',

  register(ctx: ModuleContext): void {
    ctx.commands.register('announce-update', buildAnnounceUpdateCommand(), handleAnnounceUpdateCommand);
    ctx.logger.info('[announce-update] Module registered');
  },
};

export default announceUpdateModule;
