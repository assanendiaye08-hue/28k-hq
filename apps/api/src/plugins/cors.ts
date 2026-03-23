import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';

async function corsPlugin(fastify: FastifyInstance) {
  await fastify.register(fastifyCors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (non-browser clients, curl, etc.)
      if (!origin) return cb(null, true);
      // Allow all Tauri origins (tauri://localhost, https://tauri.localhost, etc.)
      if (origin.includes('tauri')) return cb(null, true);
      // Allow localhost dev server
      if (origin.includes('localhost')) return cb(null, true);
      // Reject everything else
      cb(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
  });
}

export default fp(corsPlugin, { name: 'cors' });
