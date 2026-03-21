/**
 * Quote Route
 *
 * GET / - Returns a daily rotating operator quote.
 * No authentication required.
 */

import type { FastifyInstance } from 'fastify';
import { getDailyQuote } from '../lib/quotes.js';

export default async function quoteRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (_request, reply) => {
    return reply.status(200).send(getDailyQuote());
  });
}
