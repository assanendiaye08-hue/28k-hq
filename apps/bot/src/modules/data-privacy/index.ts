/**
 * Data Privacy Module
 *
 * Gives members full transparency and control over their stored data.
 * Commands: /mydata (export all data), /deletedata (permanent deletion)
 */

import type { Module, ModuleContext } from '../../shared/types.js';
import {
  buildMydataCommand,
  buildDeletedataCommand,
  handleMydata,
  handleDeletedata,
} from './commands.js';

const dataPrivacyModule: Module = {
  name: 'data-privacy',

  register(ctx: ModuleContext): void {
    // Register slash commands
    ctx.commands.register('mydata', buildMydataCommand(), handleMydata);
    ctx.commands.register('deletedata', buildDeletedataCommand(), handleDeletedata);

    ctx.logger.info('[data-privacy] Module registered');
  },
};

export default dataPrivacyModule;
