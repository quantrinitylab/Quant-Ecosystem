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

  // POST /auth/login
  fastify.post('/auth/login', async (request, reply) => {
    const { email, password } = request.body as any;

    if (!email || !password) {
      return reply.code(400).send({ error: 'email and password required' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return reply.code(401).send({ error: 'invalid_credentials' });
    }

    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) {
      return reply.code(401).send({ error: 'invalid_credentials' });
    }

    const tokens = await tokenService.generateTokenPair(
      user.id,
      { email: user.email, username: user.username, role: user.role },
      ['openid', 'profile', 'email'],
      'quantmail' as any,
    );

    return reply.send({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
      },
      tokens,
    });
  });

  // POST /auth/register
  fastify.post('/auth/register', async (request, reply) => {
    const { email, username, displayName, password } = request.body as any;

    if (!email || !username || !password) {
      return reply.code(400).send({ error: 'missing required fields' });
    }

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
    });

    if (existing) {
      return reply.code(409).send({ error: 'user already exists' });
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
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
      },
      tokens,
    });
  });
}
