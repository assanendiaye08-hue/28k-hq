import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import { config } from '../config.js';

async function authPlugin(fastify: FastifyInstance) {
  await fastify.register(fastifyJwt, {
    secret: config.JWT_SECRET,
  });

  await fastify.register(fastifyCookie);
}

export default fp(authPlugin, { name: 'auth' });
