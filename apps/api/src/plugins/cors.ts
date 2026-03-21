import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';

async function corsPlugin(fastify: FastifyInstance) {
  await fastify.register(fastifyCors, {
    origin: [
      'http://localhost:1420',
      'tauri://localhost',
      'https://tauri.localhost',
      'http://tauri.localhost',
    ],
    credentials: true,
  });
}

export default fp(corsPlugin, { name: 'cors' });
