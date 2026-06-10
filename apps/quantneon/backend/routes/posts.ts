import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';

const createPostSchema = z.object({
  content: z.string().max(2000).optional(),
  mediaUrl: z.string().url().optional(),
  visibility: z.enum(['PUBLIC', 'FOLLOWERS', 'CLOSE_FRIENDS']).optional(),
});

export default async function postsRoutes(fastify: FastifyInstance) {
  const prisma = (fastify as any).prisma;

  fastify.post('/', async (request, reply) => {
    const parseResult = createPostSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const post = await prisma.neonPost.create({
      data: {
        ...parseResult.data,
        userId,
      },
    });

    return reply.send(post);
  });

  fastify.get('/', async (request, reply) => {
    const posts = await prisma.neonPost.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return reply.send(posts);
  });
}
