/**
 * Notification Router Module
 *
 * Registers the /notifications command for per-type account routing.
 * The core routing function (deliverNotification) is imported directly
 * by caller modules -- this index handles command registration only.
 */

import type { Module, ModuleContext } from '../../shared/types.js';
import { buildNotificationsCommand, registerNotificationsCommands } from './commands.js';

const notificationRouterModule: Module = {
  name: 'notification-router',

  register(ctx: ModuleContext): void {
    // Register /notifications command
    registerNotificationsCommands(ctx);

    ctx.logger.info('[notification-router] Module registered');
  },
};

export default notificationRouterModule;
