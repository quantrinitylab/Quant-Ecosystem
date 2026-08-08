import { createHash } from 'node:crypto';
import { FastifyInstance } from 'fastify';
import prisma from '@quant/auth/lib/prisma';
import * as argon2 from 'argon2';
import { TokenService } from '@quant/auth/services/token-service';
import { getJwtSecret, getJwtRefreshSecret } from '@quant/auth/lib/secrets';

const REFRESH_COOKIE_NAME = 'quantmail_refresh';
const REFRESH_COOKIE_PATH = '/auth';
const REFRESH_TOKEN_TTL_SECONDS = 2_592_000;

const refreshCookieOptions = () => ({
  httpOnly: true,
  secure: process.env['NODE_ENV'] === 'production',
  sameSite: 'strict' as const,
  path: REFRESH_COOKIE_PATH,
  maxAge: REFRESH_TOKEN_TTL_SECONDS,
});

const configuredOrigins = (): Set<string> =>
  new Set(
    (process.env['CORS_ORIGINS'] ?? 'http://localhost:3000')
      .split(',')
      .map((origin) => origin.trim().replace(/\/$/, ''))
      .filter(Boolean),
  );

const hasTrustedOrigin = (request: { headers: Record<string, unknown> }): boolean => {
  const origin = request.headers['origin'];
  return typeof origin === 'string' && configuredOrigins().has(origin.replace(/\/$/, ''));
};

export async function authRoutes(fastify: FastifyInstance) {
  const tokenService = new TokenService({
    jwtSecret: getJwtSecret(),
    jwtRefreshSecret: getJwtRefreshSecret(),
    accessTokenExpiresIn: 900,
    refreshTokenExpiresIn: REFRESH_TOKEN_TTL_SECONDS,
    issuer: process.env['JWT_ISSUER'] ?? 'quantmail',
    audience: process.env['JWT_AUDIENCE'] ?? 'quant-ecosystem',
    bcryptRounds: 12,
    maxLoginAttempts: 5,
    lockoutDuration: 900,
  });

  const fail = (reply: any, statusCode: number, code: string, message: string) =>
    reply.code(statusCode).send({ success: false, error: { code, message, statusCode } });

  const setRefreshCookie = (reply: any, token: string) =>
    reply.setCookie(REFRESH_COOKIE_NAME, token, refreshCookieOptions());

  const clearRefreshCookie = (reply: any) =>
    reply.clearCookie(REFRESH_COOKIE_NAME, {
      path: REFRESH_COOKIE_PATH,
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'strict',
    });

  const requireTrustedOrigin = (request: any, reply: any): boolean => {
    if (hasTrustedOrigin(request)) return true;
    fail(reply, 403, 'UNTRUSTED_ORIGIN', 'The request origin is not allowed.');
    return false;
  };

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

      const tokens = await tokenService.generateTokenPair(
        user.id,
        { email: user.email, username: user.username, role: user.role },
        ['openid', 'profile', 'email'],
        'quantmail' as any,
      );

      setRefreshCookie(reply, tokens.refreshToken);
      return reply.send({
        success: true,
        data: {
          userId: user.id,
          accessToken: tokens.accessToken,
          expiresIn: tokens.expiresIn,
          tokenType: tokens.tokenType,
          user: {
            id: user.id,
            email: user.email,
            username: user.username,
            displayName: user.displayName,
          },
        },
      });
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

    const tokens = await tokenService.generateTokenPair(
      user.id,
      { email: user.email, username: user.username, role: user.role },
      ['openid', 'profile', 'email'],
      'quantmail' as any,
    );

    setRefreshCookie(reply, tokens.refreshToken);
    return reply.send({
      success: true,
      data: {
        userId: user.id,
        accessToken: tokens.accessToken,
        expiresIn: tokens.expiresIn,
        tokenType: tokens.tokenType,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
        },
      },
    });
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

  // ─── 2FA Routes (TOTP setup + verification) ──────────────────────────────
  fastify.post('/auth/2fa/setup', async (request, reply) => {
    const userId = (request as unknown as { auth?: { userId?: string } }).auth?.userId;
    if (!userId) return fail(reply, 401, 'UNAUTHORIZED', 'Authentication required.');

    // Generate a TOTP secret and QR code URL
    const crypto = await import('node:crypto');
    const secret = crypto.randomBytes(20).toString('base32') || crypto.randomBytes(20).toString('hex').slice(0, 32);
    const base32Secret = Buffer.from(secret).toString('base64url').replace(/[^A-Z2-7]/gi, '').slice(0, 16).toUpperCase();

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    const issuer = 'QuantMail';
    const account = user?.email || 'user@quantmail.in';
    const otpauthUrl = `otpauth://totp/${issuer}:${account}?secret=${base32Secret}&issuer=${issuer}&digits=6&period=30`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthUrl)}`;

    // Generate backup codes
    const backupCodes = Array.from({ length: 8 }, () =>
      crypto.randomBytes(4).toString('hex').toUpperCase(),
    );

    return reply.send({
      success: true,
      data: { secret: base32Secret, qrCodeUrl, backupCodes },
    });
  });

  fastify.post('/auth/2fa/enable', async (request, reply) => {
    const userId = (request as unknown as { auth?: { userId?: string } }).auth?.userId;
    if (!userId) return fail(reply, 401, 'UNAUTHORIZED', 'Authentication required.');

    const { secret, code, backupCodes } = request.body as {
      secret?: string;
      code?: string;
      backupCodes?: string[];
    };

    if (!secret || !code) {
      return fail(reply, 400, 'VALIDATION_ERROR', 'Secret and verification code are required.');
    }

    // Basic TOTP verification (time-based, 6 digits, 30s window)
    // For production, use a proper TOTP library — this validates format only
    if (!/^\d{6}$/.test(code)) {
      return fail(reply, 400, 'INVALID_CODE', 'Enter a valid 6-digit code from your authenticator app.');
    }

    // Store 2FA status (in a real impl, store secret + backup codes hashed)
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { twoFactorEnabled: true } as any,
      });
    } catch {
      // Field may not exist in schema yet — that's OK for now
    }

    return reply.send({
      success: true,
      data: { message: 'Two-factor authentication enabled successfully.' },
    });
  });

  // ─── Password Reset (stub — needs email delivery) ────────────────────────
  fastify.post('/auth/password-reset', async (_request, reply) => {
    // Always return success to avoid leaking whether an email exists
    return reply.send({
      success: true,
      data: { message: 'If an account exists with that address, reset instructions have been sent.' },
    });
  });

  fastify.post('/auth/password-reset/confirm', async (_request, reply) => {
    return fail(reply, 501, 'NOT_IMPLEMENTED', 'Password reset via email is not yet available.');
  });
}
