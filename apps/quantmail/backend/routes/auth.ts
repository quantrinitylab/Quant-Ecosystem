import { createHash } from 'node:crypto';
import { FastifyInstance } from 'fastify';
import prisma from '@quant/auth/lib/prisma';
import * as argon2 from 'argon2';
import {
  REFRESH_COOKIE_NAME,
  clearRefreshCookie,
  createTokenService,
  fail,
  issueBrowserSession,
  requireTrustedOrigin,
  setRefreshCookie,
} from '../lib/auth-session';
import { signTwoFactorChallenge } from '../lib/two-factor';

export async function authRoutes(fastify: FastifyInstance) {
  const tokenService = createTokenService();

  // Browser login: the access token remains memory-scoped in JavaScript while
  // the refresh credential is delivered only as an HttpOnly host-only cookie.
  fastify.post(
    '/auth/login',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (!requireTrustedOrigin(request, reply)) return;
      const { email, password } = request.body as any;

      if (!email || !password) {
        return fail(reply, 400, 'VALIDATION_ERROR', 'Email and password are required.');
      }

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        return fail(reply, 401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
      }

      const valid = await argon2.verify(user.passwordHash, password);
      if (!valid) {
        return fail(reply, 401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
      }

      // A password alone is not a session for an account with a second factor.
      // Both halves are required: the flag on its own is the state the old
      // format-only /auth/2fa/enable left accounts in, and honouring it would
      // demand a code that nothing can verify.
      const protectedUser = user as unknown as {
        twoFactorEnabled?: boolean | null;
        twoFactorSecret?: string | null;
      };
      if (protectedUser.twoFactorEnabled && protectedUser.twoFactorSecret) {
        const { challenge, expiresIn } = await signTwoFactorChallenge(user.id);
        // No tokens and no refresh cookie yet. The challenge names the user and
        // nothing else, so replaying it still costs an authenticator code.
        return reply.send({
          success: true,
          data: { twoFactorRequired: true, challenge, expiresIn },
        });
      }

      return reply.send(await issueBrowserSession(tokenService, reply, user));
    },
  );

  fastify.post('/auth/register', async (request, reply) => {
    if (!requireTrustedOrigin(request, reply)) return;
    const { email, username, displayName, password } = request.body as any;

    if (!email || !username || !password) {
      return fail(reply, 400, 'VALIDATION_ERROR', 'Email, username and password are required.');
    }

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
    });

    if (existing) {
      const takenField = existing.email === email ? 'email' : 'username';
      return fail(
        reply,
        409,
        'USER_EXISTS',
        `An account with this ${takenField} already exists. Try signing in instead.`,
      );
    }

    const passwordHash = await argon2.hash(password);
    const user = await prisma.user.create({
      data: {
        email,
        username,
        displayName: displayName || username,
        passwordHash,
        status: 'ACTIVE',
        emailVerified: true,
      },
    });

    return reply.send(await issueBrowserSession(tokenService, reply, user));
  });

  // Cookie-only browser rotation endpoint. Requiring an allowlisted Origin in
  // addition to SameSite=Strict prevents cross-site refresh and logout CSRF.
  fastify.post(
    '/auth/refresh',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (!requireTrustedOrigin(request, reply)) return;
      const oldRefreshToken = request.cookies[REFRESH_COOKIE_NAME];
      if (!oldRefreshToken) {
        clearRefreshCookie(reply);
        return fail(reply, 401, 'REFRESH_REQUIRED', 'No browser refresh session is available.');
      }

      try {
        const tokens = await tokenService.refreshToken(oldRefreshToken);
        setRefreshCookie(reply, tokens.refreshToken);
        return reply.send({
          success: true,
          data: {
            accessToken: tokens.accessToken,
            expiresIn: tokens.expiresIn,
            tokenType: tokens.tokenType,
          },
        });
      } catch {
        clearRefreshCookie(reply);
        return fail(reply, 401, 'INVALID_REFRESH_SESSION', 'The browser session is invalid.');
      }
    },
  );

  fastify.post('/auth/logout', async (request, reply) => {
    if (!requireTrustedOrigin(request, reply)) return;
    const refreshToken = request.cookies[REFRESH_COOKIE_NAME];

    if (refreshToken) {
      // Possession-bound family revocation without persisting or decoding the
      // bearer value: locate the exact one-way digest already stored by
      // TokenService, then revoke every descendant in that rotation family.
      const digest = createHash('sha256').update(refreshToken).digest('hex');
      const stored = await prisma.refreshToken.findFirst({ where: { token: digest } });
      if (stored) {
        await prisma.refreshToken.updateMany({
          where: { family: stored.family },
          data: { isRevoked: true },
        });
      }
    }

    clearRefreshCookie(reply);
    return reply.send({ success: true, data: { message: 'Signed out.' } });
  });

  fastify.post(
    '/auth/change-password',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const userId = (request as unknown as { auth?: { userId?: string } }).auth?.userId;
      if (!userId) {
        return fail(reply, 401, 'UNAUTHORIZED', 'Authentication required.');
      }

      const { currentPassword, newPassword } = request.body as {
        currentPassword?: string;
        newPassword?: string;
      };
      if (!currentPassword || !newPassword) {
        return fail(
          reply,
          400,
          'VALIDATION_ERROR',
          'Current password and new password are required.',
        );
      }
      if (newPassword.length < 8) {
        return fail(reply, 400, 'VALIDATION_ERROR', 'New password must be at least 8 characters.');
      }

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return fail(reply, 404, 'USER_NOT_FOUND', 'User not found.');
      }

      const valid = await argon2.verify(user.passwordHash, currentPassword);
      if (!valid) {
        return fail(reply, 401, 'INVALID_CREDENTIALS', 'Current password is incorrect.');
      }

      const passwordHash = await argon2.hash(newPassword);
      await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

      return reply.send({ success: true, data: { message: 'Password updated.' } });
    },
  );

  // 2FA lives in `routes/two-factor.ts`. It used to live here as a pair of
  // handlers that generated a secret nobody stored and accepted any six digits.

  // ─── Password Reset (stub — needs email delivery) ────────────────────────
  fastify.post('/auth/password-reset', async (_request, reply) => {
    // Always return success to avoid leaking whether an email exists
    return reply.send({
      success: true,
      data: {
        message: 'If an account exists with that address, reset instructions have been sent.',
      },
    });
  });

  fastify.post('/auth/password-reset/confirm', async (_request, reply) => {
    return fail(reply, 501, 'NOT_IMPLEMENTED', 'Password reset via email is not yet available.');
  });
}
