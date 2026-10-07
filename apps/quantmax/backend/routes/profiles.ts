import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';

const profileSchema = z.object({
  bio: z.string().max(500).optional(),
  interests: z.array(z.string()).optional(),
  age: z.number().min(18).max(100).optional(),
  location: z.string().optional(),
});

export default async function profilesRoutes(fastify: FastifyInstance) {
  const prisma = (fastify as any).prisma;

  fastify.get('/me', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const profile = await prisma.datingProfile.findUnique({
      where: { userId },
    });

    return reply.send(profile);
  });

  fastify.post('/me', async (request, reply) => {
    const parseResult = profileSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const profile = await prisma.datingProfile.upsert({
      where: { userId },
      update: parseResult.data,
      create: {
        userId,
        ...parseResult.data,
      },
    });

    return reply.send(profile);
  });
}
