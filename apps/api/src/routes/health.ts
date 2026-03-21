import type { FastifyInstance } from 'fastify';

export default async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (_request, reply) => {
    try {
      await fastify.db.$queryRaw`SELECT 1`;
      return reply.send({
        status: 'ok',
        db: 'connected',
        timestamp: new Date().toISOString(),
      });
    } catch {
      return reply.status(503).send({
        status: 'degraded',
        db: 'disconnected',
        timestamp: new Date().toISOString(),
      });
    }
  });
}
