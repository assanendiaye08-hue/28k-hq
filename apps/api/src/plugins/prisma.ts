import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { db, type ExtendedPrismaClient } from '@28k/db';

declare module 'fastify' {
  interface FastifyInstance {
    db: ExtendedPrismaClient;
  }
}

async function prismaPlugin(fastify: FastifyInstance) {
  fastify.decorate('db', db);

  fastify.addHook('onClose', async () => {
    await db.$disconnect();
  });
}

export default fp(prismaPlugin, { name: 'prisma' });
