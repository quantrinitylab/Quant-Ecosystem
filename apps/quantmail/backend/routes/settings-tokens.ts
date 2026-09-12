import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { generatePersonalAccessToken } from '@quant/auth';
import { createAppError } from '@quant/server-core';

const scopeSchema = z.enum(['repo:read', 'repo:write', 'repo:admin']);
const createTokenSchema = z.object({
  name: z.string().trim().min(1).max(100),
  scopes: z
    .array(scopeSchema)
    .min(1)
    .max(3)
    .transform((values) => [...new Set(values)]),
  expiresAt: z.coerce.date(),
});

function requireSessionUser(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  return userId;
}

function getPrisma(fastify: FastifyInstance): PrismaClient {
  const prisma = (fastify as unknown as { prisma?: PrismaClient }).prisma;
  if (!prisma) throw new Error('PrismaClient must be registered before token routes');
  return prisma;
}

export default async function settingsTokenRoutes(fastify: FastifyInstance): Promise<void> {
  const prisma = getPrisma(fastify);

  fastify.post('/settings/tokens', async (request, reply) => {
    const userId = requireSessionUser(request);
    const input = createTokenSchema.parse(request.body);
    const now = new Date();
    if (input.expiresAt.getTime() <= now.getTime()) {
      throw createAppError('Token expiry must be in the future', 400, 'INVALID_TOKEN_EXPIRY');
    }
    if (input.expiresAt.getTime() > now.getTime() + 366 * 24 * 60 * 60 * 1000) {
      throw createAppError('Token expiry cannot exceed one year', 400, 'INVALID_TOKEN_EXPIRY');
    }

    const generated = generatePersonalAccessToken();
    const record = await prisma.personalAccessToken.create({
      data: {
        tokenId: generated.tokenId,
        tokenHash: generated.tokenHash,
        userId,
        name: input.name,
        scopes: input.scopes,
        expiresAt: input.expiresAt,
      },
    });

    return reply.status(201).send({
      success: true,
      data: {
        id: record.id,
        token: generated.token,
        tokenId: record.tokenId,
        name: record.name,
        scopes: record.scopes,
        expiresAt: record.expiresAt,
        createdAt: record.createdAt,
      },
    });
  });

  fastify.get('/settings/tokens', async (request, reply) => {
    const userId = requireSessionUser(request);
    const tokens = await prisma.personalAccessToken.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        tokenId: true,
        name: true,
        scopes: true,
        expiresAt: true,
        lastUsedAt: true,
        revokedAt: true,
        createdAt: true,
      },
    });
    const sanitized = tokens.map((t) => ({
      id: t.id,
      tokenId: t.tokenId,
      name: t.name,
      scopes: t.scopes,
      expiresAt: t.expiresAt,
      lastUsedAt: t.lastUsedAt,
      revokedAt: t.revokedAt,
      createdAt: t.createdAt,
    }));
    return reply.send({ success: true, data: sanitized });
  });

  fastify.delete<{ Params: { id: string } }>('/settings/tokens/:id', async (request, reply) => {
    const userId = requireSessionUser(request);
    const token = await prisma.personalAccessToken.findFirst({
      where: { id: request.params.id, userId },
    });
    if (!token) throw createAppError('Token not found', 404, 'TOKEN_NOT_FOUND');

    if (!token.revokedAt) {
      await prisma.personalAccessToken.update({
        where: { id: token.id },
        data: { revokedAt: new Date() },
      });
    }
    return reply.send({ success: true, data: { revoked: true } });
  });
}
