import { FastifyInstance } from 'fastify';
import prisma from '@quant/auth/lib/prisma';
import { generateId } from '@quant/auth/crypto/secure-random';
import * as argon2 from 'argon2';
import { TokenService } from '@quant/auth/services/token-service';
import { getJwtSecret, getJwtRefreshSecret } from '@quant/auth/lib/secrets';

export async function authRoutes(fastify: FastifyInstance) {
  const tokenService = new TokenService({
    jwtSecret: getJwtSecret(),
    jwtRefreshSecret: getJwtRefreshSecret(),
    accessTokenExpiresIn: 900,
    refreshTokenExpiresIn: 2592000,
    issuer: 'quantmail',
    audience: 'quant-ecosystem',
    bcryptRounds: 12,
    maxLoginAttempts: 5,
    lockoutDuration: 900,
  });

  // Standard response envelope helpers. The frontend api-client (and the rest
  // of the platform) expect `{ success, data }` on success and
  // `{ success: false, error: { code, message, statusCode } }` on failure.
  // Returning raw objects here silently broke the login/register UI (success
  // was read as `undefined`), so every auth response now uses these.
  const fail = (reply: any, statusCode: number, code: string, message: string) =>
    reply.code(statusCode).send({ success: false, error: { code, message, statusCode } });

  // POST /auth/login
  fastify.post(
    '/auth/login',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
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

      return reply.send({
        success: true,
        data: {
          userId: user.id,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
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

  // POST /auth/register
  fastify.post('/auth/register', async (request, reply) => {
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

    return reply.send({
      success: true,
      data: {
        userId: user.id,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
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
}
