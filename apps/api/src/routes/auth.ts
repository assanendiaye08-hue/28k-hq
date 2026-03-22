import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { config } from '../config.js';
import { exchangeCode, getDiscordUser } from '../lib/discord-oauth.js';
import { authenticate } from '../middleware/authenticate.js';

const REFRESH_TOKEN_EXPIRY_DAYS = 30;

const discordBodySchema = z.object({
  code: z.string().min(1),
  codeVerifier: z.string().min(1),
  redirectUri: z.string().min(1),
});

const refreshBodySchema = z.object({
  refreshToken: z.string().min(1),
});

const logoutBodySchema = z.object({
  refreshToken: z.string().optional(),
});

export default async function authRoutes(fastify: FastifyInstance) {
  /**
   * POST /auth/discord
   * Exchange a Discord OAuth2 authorization code for JWT access + refresh tokens.
   */
  fastify.post('/discord', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    handler: async (request, reply) => {
      const parsed = discordBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid request body', details: parsed.error.format() });
      }

      const { code, codeVerifier, redirectUri } = parsed.data;

      // Exchange code with Discord
      let tokenResponse;
      try {
        tokenResponse = await exchangeCode(
          code,
          codeVerifier,
          redirectUri,
          config.DISCORD_CLIENT_ID,
          config.DISCORD_CLIENT_SECRET,
        );
      } catch (err) {
        fastify.log.error(err, 'Discord code exchange failed');
        return reply.status(502).send({ error: 'Failed to exchange code with Discord' });
      }

      // Get Discord user identity
      let discordUser;
      try {
        discordUser = await getDiscordUser(tokenResponse.access_token);
      } catch (err) {
        fastify.log.error(err, 'Discord user fetch failed');
        return reply.status(502).send({ error: 'Failed to fetch Discord user' });
      }

      // Look up linked account, or auto-create for first-time desktop login
      let account = await fastify.db.discordAccount.findUnique({
        where: { discordId: discordUser.id },
        include: { member: true },
      });

      if (!account) {
        // Auto-register: create Member + DiscordAccount
        const { randomBytes, createHash } = await import('node:crypto');
        const recoveryKey = randomBytes(32).toString('hex');
        const member = await fastify.db.member.create({
          data: {
            displayName: discordUser.global_name || discordUser.username,
            encryptionSalt: randomBytes(16).toString('hex'),
            recoveryKeyHash: createHash('sha256').update(recoveryKey).digest('hex'),
            accounts: {
              create: {
                discordId: discordUser.id,
              },
            },
          },
        });
        account = await fastify.db.discordAccount.findUnique({
          where: { discordId: discordUser.id },
          include: { member: true },
        });
        if (!account) {
          return reply.status(500).send({ error: 'Failed to create account' });
        }
        fastify.log.info({ discordId: discordUser.id, memberId: member.id }, 'Auto-registered new member from desktop login');
      }

      // Sign JWT access token
      const accessToken = fastify.jwt.sign(
        { sub: account.memberId, did: discordUser.id },
        { expiresIn: '15m' },
      );

      // Generate refresh token
      const refreshTokenValue = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

      await fastify.db.refreshToken.create({
        data: {
          memberId: account.memberId,
          token: refreshTokenValue,
          expiresAt,
        },
      });

      return reply.send({
        accessToken,
        refreshToken: refreshTokenValue,
        member: {
          id: account.memberId,
          displayName: account.member.displayName,
          discordId: discordUser.id,
          avatar: discordUser.avatar,
        },
      });
    },
  });

  /**
   * POST /auth/refresh
   * Rotate refresh token and issue new access + refresh token pair.
   */
  fastify.post('/refresh', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    handler: async (request, reply) => {
      const parsed = refreshBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid request body', details: parsed.error.format() });
      }

      const { refreshToken } = parsed.data;

      // Look up refresh token
      const found = await fastify.db.refreshToken.findUnique({
        where: { token: refreshToken },
      });

      if (!found || found.expiresAt < new Date()) {
        // Delete expired token if it exists
        if (found) {
          await fastify.db.refreshToken.delete({ where: { id: found.id } });
        }
        return reply.status(401).send({ error: 'Invalid or expired refresh token' });
      }

      // Look up member and Discord account
      const member = await fastify.db.member.findUnique({
        where: { id: found.memberId },
      });
      const discordAccount = await fastify.db.discordAccount.findFirst({
        where: { memberId: found.memberId },
      });

      if (!discordAccount || !member) {
        return reply.status(401).send({ error: 'Member not found' });
      }

      // Sign new JWT access token
      const accessToken = fastify.jwt.sign(
        { sub: found.memberId, did: discordAccount.discordId },
        { expiresIn: '15m' },
      );

      return reply.send({
        accessToken,
        refreshToken: refreshToken,
        member: {
          id: member.id,
          displayName: member.displayName,
          discordId: discordAccount.discordId,
          avatar: null,
        },
      });
    },
  });

  /**
   * POST /auth/logout
   * Invalidate refresh token(s). If refreshToken provided, delete that one;
   * otherwise delete all refresh tokens for the authenticated member.
   */
  fastify.post('/logout', {
    handler: async (request, reply) => {
      const parsed = logoutBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid request body', details: parsed.error.format() });
      }

      const { refreshToken } = parsed.data;

      if (refreshToken) {
        await fastify.db.refreshToken.deleteMany({
          where: { token: refreshToken },
        });
      } else {
        await fastify.db.refreshToken.deleteMany({
          where: { memberId: request.memberId },
        });
      }

      return reply.send({ success: true });
    },
  });
}
