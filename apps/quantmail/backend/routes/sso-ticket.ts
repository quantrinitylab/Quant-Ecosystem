/**
 * SSO ticket endpoints — the safe replacement for `?token=` URL handoffs.
 *
 * POST /oauth/sso-ticket/mint   (Bearer)  → { ticket, expiresIn }
 * POST /oauth/sso-ticket/verify (public)  → { success, data: user profile }
 *
 * The mint endpoint is called by QuantMail's own frontend (the /sso account
 * chooser) with the user's access token. The verify endpoint is called
 * back-channel by the relying app's SERVER with the ticket it received in the
 * URL; it answers with the profile the app needs to mint its own session.
 *
 * Verify needs no client secret: the ticket is 60-second, single-use, and
 * audience-bound, so presenting it proves the presenter just received the
 * redirect. It grants no QuantMail API access — only the profile, once.
 */

import { FastifyInstance } from 'fastify';
import { TokenService } from '@quant/auth/services/token-service';
import { getJwtSecret, getJwtRefreshSecret } from '@quant/auth/lib/secrets';
import prisma from '@quant/auth/lib/prisma';
import {
  consumeSsoTicket,
  looksLikeSsoTicket,
  mintSsoTicket,
  SSO_TICKET_TTL_SECONDS,
} from '../lib/sso-ticket';
import { fail } from '../lib/auth-session';

/** Origins a ticket may be minted for. Tickets to anywhere else would be an
 *  open redirect with a credential attached, so the allowlist is explicit. */
const ticketAudienceAllowlist = (): Set<string> =>
  new Set(
    (process.env['SSO_TICKET_AUDIENCES'] ??
      [
        'https://quantmail.in',
        'https://quantai.quantrinity.in',
        'https://quantchat.quantrinity.in',
        'https://quantgram.quantrinity.in',
        'https://quantube.quantrinity.in',
        'https://quantwave.quantrinity.in',
        'https://quantcooks.quantrinity.in',
        'https://quantads.quantrinity.in',
        'https://quantmax.quantrinity.in',
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:3002',
        'http://localhost:3003',
        'http://localhost:3004',
      ].join(','))
      .split(',')
      .map((o) => o.trim().replace(/\/$/, ''))
      .filter(Boolean),
  );

export async function ssoTicketRoutes(fastify: FastifyInstance) {
  const tokenService = new TokenService({
    jwtSecret: getJwtSecret(),
    jwtRefreshSecret: getJwtRefreshSecret(),
    accessTokenExpiresIn: 900,
    refreshTokenExpiresIn: 2592000,
    issuer: process.env['JWT_ISSUER'] ?? 'quantmail',
    audience: process.env['JWT_AUDIENCE'] ?? 'quant-ecosystem',
    bcryptRounds: 12,
    maxLoginAttempts: 5,
    lockoutDuration: 900,
  });

  const requireAuth = async (request: any, reply: any) => {
    const header = request.headers?.authorization as string | undefined;
    if (!header || !header.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const payload = await tokenService.validateAccessToken(header.slice(7));
    if (!payload) {
      return reply.code(401).send({ error: 'invalid_token' });
    }
    (request as any).user = payload;
  };

  // ─── Mint ──────────────────────────────────────────────────────────────
  fastify.post(
    '/oauth/sso-ticket/mint',
    {
      preHandler: requireAuth,
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (request: any, reply) => {
      const { audience, clientId } = (request.body ?? {}) as {
        audience?: unknown;
        clientId?: unknown;
      };
      const userId = request.user?.id || request.user?.sub;
      if (!userId) return fail(reply, 401, 'UNAUTHORIZED', 'Not authenticated.');

      if (typeof audience !== 'string' || !ticketAudienceAllowlist().has(audience.replace(/\/$/, ''))) {
        return fail(
          reply,
          400,
          'INVALID_AUDIENCE',
          'That destination is not an allowed Quant app.',
        );
      }

      const { ticket } = await mintSsoTicket({
        userId,
        clientId: typeof clientId === 'string' ? clientId : 'sso-chooser',
        audience: audience.replace(/\/$/, ''),
      });

      return reply.send({
        success: true,
        data: { ticket, expiresIn: SSO_TICKET_TTL_SECONDS },
      });
    },
  );

  // ─── Verify (back-channel, called by the relying app's server) ──────────
  fastify.post(
    '/oauth/sso-ticket/verify',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request: any, reply) => {
      const { ticket, audience } = (request.body ?? {}) as {
        ticket?: unknown;
        audience?: unknown;
      };

      if (!looksLikeSsoTicket(ticket) || typeof audience !== 'string' || !audience) {
        return fail(reply, 400, 'INVALID_TICKET', 'That sign-in ticket is not valid.');
      }

      const verified = await consumeSsoTicket(ticket, audience.replace(/\/$/, ''));
      if (!verified) {
        return fail(
          reply,
          400,
          'INVALID_TICKET',
          'That sign-in ticket is not valid or has expired. Please try signing in again.',
        );
      }

      const user = await prisma.user.findUnique({ where: { id: verified.userId } });
      if (!user) {
        return fail(reply, 400, 'INVALID_TICKET', 'That sign-in ticket is not valid.');
      }

      // Profile only, never credentials. The app mints its own session.
      return reply.send({
        success: true,
        data: {
          id: user.id,
          email: user.email,
          username: user.username,
          displayName: user.displayName,
          emailVerified: Boolean(user.emailVerified),
        },
      });
    },
  );
}
