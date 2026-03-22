import { config } from './config.js';
import Fastify from 'fastify';

// Plugins
import corsPlugin from './plugins/cors.js';
import rateLimitPlugin from './plugins/rate-limit.js';
import prismaPlugin from './plugins/prisma.js';
import authPlugin from './plugins/auth.js';

// Routes
import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';
import timerRoutes from './routes/timer.js';
import goalsRoutes from './routes/goals.js';
import dashboardRoutes from './routes/dashboard.js';
import quoteRoutes from './routes/quote.js';
import focusRoutes from './routes/focus.js';
import activityRoutes from './routes/activity.js';

const app = Fastify({
  logger: config.NODE_ENV === 'development'
    ? { level: config.LOG_LEVEL, transport: { target: 'pino-pretty' } }
    : { level: config.LOG_LEVEL },
});

// Register plugins in order
await app.register(corsPlugin);
await app.register(rateLimitPlugin);
await app.register(prismaPlugin);
await app.register(authPlugin);

// Register routes
await app.register(healthRoutes, { prefix: '/health' });
await app.register(authRoutes, { prefix: '/auth' });
await app.register(timerRoutes, { prefix: '/timer' });
await app.register(goalsRoutes, { prefix: '/goals' });
await app.register(dashboardRoutes, { prefix: '/dashboard' });
await app.register(quoteRoutes, { prefix: '/quote' });
await app.register(focusRoutes, { prefix: '/focus' });
await app.register(activityRoutes, { prefix: '/activity' });

// Start server
const start = async () => {
  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' });
    app.log.info(`Server listening on port ${config.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = async (signal: string) => {
  app.log.info(`Received ${signal}, shutting down gracefully...`);
  await app.close();
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start();
