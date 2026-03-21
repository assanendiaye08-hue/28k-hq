import type { FastifyRequest, FastifyReply } from 'fastify';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; did: string };
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    memberId: string;
    discordId: string;
  }
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const payload = await request.jwtVerify<{ sub: string; did: string }>();
    request.memberId = payload.sub;
    request.discordId = payload.did;
  } catch {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
}
