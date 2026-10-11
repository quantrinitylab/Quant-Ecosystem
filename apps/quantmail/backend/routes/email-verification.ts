/**
 * Real email verification.
 *
 * What this replaces: registration hardcoded `emailVerified: true`, and the
 * frontend carried a `verifyEmail()` client method pointing at a route that
 * never existed — verification was a claim, not a flow.
 *
 * - POST /auth/verify-email/request (Bearer) — (re)sends the verification
 *   mail to the signed-in user's address. Rate-limited: this is a mail-sending
 *   endpoint and an unbounded version is a mail bomb.
 * - GET  /auth/verify-email?token=… (public) — spends the link and flips
 *   `emailVerified`. Single-use under concurrency, 24h TTL, digest-only
 *   storage — the same rules as the password-reset links.
 *
 * The mail goes through the real pipeline (SES). When SES is not configured
 * the request endpoint says so honestly instead of claiming a mail went out.
 */

import { FastifyInstance } from 'fastify';
import { TokenService } from '@quant/auth/services/token-service';
import { getJwtSecret, getJwtRefreshSecret } from '@quant/auth/lib/secrets';
import prisma from '@quant/auth/lib/prisma';
import { fail } from '../lib/auth-session';
import {
  generateVerifyToken,
  hashVerifyToken,
  isVerifyTokenExpired,
  looksLikeVerifyToken,
  sendVerificationEmail,
  verifyTokenExpiry,
  verifyUrl,
} from '../lib/email-verification';

/** Shared mint+dispatch so register and resend use exactly one code path. */
export async function issueVerificationEmail(userId: string): Promise<{
  sent: boolean;
  reason?: string;
}> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { sent: false, reason: 'no-user' };
  if (user.emailVerified) return { sent: false, reason: 'already-verified' };

  // One live link per account.
  await prisma.emailVerificationToken.deleteMany({
    where: { userId: user.id, usedAt: null },
  });

  const token = generateVerifyToken();
  await prisma.emailVerificationToken.create({
    data: {
      userId: user.id,
      tokenHash: hashVerifyToken(token),
      expiresAt: verifyTokenExpiry(),
    },
  });

  const sent = await sendVerificationEmail({
    to: user.email,
    url: verifyUrl(token),
    name: user.displayName ?? user.username ?? null,
  });
  return sent ? { sent: true } : { sent: false, reason: 'mail-unavailable' };
}

export async function emailVerificationRoutes(fastify: FastifyInstance) {
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

  // ─── (Re)send the verification mail ────────────────────────────────────
  fastify.post(
    '/auth/verify-email/request',
    {
      preHandler: requireAuth,
      config: { rateLimit: { max: 3, timeWindow: '15 minutes' } },
    },
    async (request: any, reply) => {
      const userId = request.user?.id || request.user?.sub;
      if (!userId) return fail(reply, 401, 'UNAUTHORIZED', 'Not authenticated.');

      const result = await issueVerificationEmail(userId);
      if (result.reason === 'already-verified') {
        return reply.send({ success: true, data: { message: 'Your address is already verified.' } });
      }
      if (!result.sent) {
        return fail(
          reply,
          503,
          'MAIL_UNAVAILABLE',
          'Verification mail could not be sent right now. Please try again later.',
        );
      }
      return reply.send({
        success: true,
        data: { message: 'Verification mail sent. Check your inbox.' },
      });
    },
  );

  // ─── Spend the link ────────────────────────────────────────────────────
  fastify.get('/auth/verify-email', async (request: any, reply) => {
    const { token } = (request.query ?? {}) as { token?: unknown };

    if (!looksLikeVerifyToken(token)) {
      return fail(
        reply,
        400,
        'INVALID_TOKEN',
        'That verification link is not valid. Request a new one from Settings.',
      );
    }

    const row = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash: hashVerifyToken(token) },
    });
    if (!row || row.usedAt || isVerifyTokenExpired(row.expiresAt)) {
      return fail(
        reply,
        400,
        'LINK_EXPIRED',
        'That verification link has expired or was already used. Request a new one from Settings.',
      );
    }

    // Single use, decided by the database.
    const spent = await prisma.emailVerificationToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if ((spent?.count ?? 0) === 0) {
      return fail(
        reply,
        400,
        'LINK_EXPIRED',
        'That verification link has already been used. Request a new one from Settings.',
      );
    }

    await prisma.user.update({
      where: { id: row.userId },
      data: { emailVerified: true },
    });

    await prisma.emailVerificationToken.deleteMany({
      where: { userId: row.userId, usedAt: null },
    });

    return reply.send({
      success: true,
      data: { message: 'Your email address is verified.' },
    });
  });
}
