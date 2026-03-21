/**
 * Reflection module -- self-evaluation and reflection system.
 *
 * Reflections are Jarvis-initiated (scheduler fires them), not
 * member-initiated. Members reply to Jarvis's DM question and
 * the awaitMessages collector in flow.ts handles their responses.
 *
 * No slash commands -- reflections are DM-driven by the scheduler.
 * The module is auto-discovered by the module loader.
 */

import type { Module, ModuleContext } from '../../shared/types.js';

const reflectionModule: Module = {
  name: 'reflection',

  register(ctx: ModuleContext): void {
    // No slash commands for reflections (DM-driven by scheduler).
    // The reflection DM flow is triggered by the scheduler module via
    // runReflectionFlow, not through user-initiated commands.

    ctx.logger.info('[reflection] Module registered');
  },
};

export default reflectionModule;
