/**
 * AI Admin Module
 *
 * Provides administrator-only commands for AI cost visibility
 * and model management.
 *
 * Commands:
 * - /cost today      -- Today's token usage and cost breakdown
 * - /cost month      -- Month-to-date usage with projections
 * - /cost set-budget -- Override a member's daily token limit
 * - /admin set-model -- Hot-swap primary or fallback AI model
 */

import type { Module, ModuleContext } from '../../shared/types.js';
import {
  buildCostCommand,
  handleCost,
  buildAdminSetModelCommand,
  handleAdmin,
} from './commands.js';

const aiAdminModule: Module = {
  name: 'ai-admin',

  register(ctx: ModuleContext): void {
    // Register slash commands
    ctx.commands.register('cost', buildCostCommand(), handleCost);
    ctx.commands.register('admin', buildAdminSetModelCommand(), handleAdmin);

    ctx.logger.info('[ai-admin] Module registered');
  },
};

export default aiAdminModule;
