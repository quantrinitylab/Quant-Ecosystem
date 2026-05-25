import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { StoryService } from '../services/story.service';

const createStorySchema = z.object({
  type: z.enum(['IMAGE', 'VIDEO', 'TEXT']),
  mediaUrl: z.string().url().optional(),
  thumbnailUrl: z.string().url().optional(),
  duration: z.number().positive().optional(),
});

export default async function storiesRoutes(fastify: FastifyInstance) {
  fastify.post('/', async (request, reply) => {
    const parseResult = createStorySchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new StoryService(prisma as never);
    const story = await service.createStory({ ...parseResult.data, userId });

    return reply.status(201).send({ success: true, data: story });
  });

  fastify.get('/user/:userId', async (request, reply) => {
    const { userId } = request.params as { userId: string };

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new StoryService(prisma as never);
    const stories = await service.getActiveStories(userId);

    return reply.send({ success: true, data: stories });
  });

  fastify.post<{ Params: { id: string } }>('/:id/view', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new StoryService(prisma as never);
    const story = await service.viewStory(request.params.id, userId);

    return reply.send({ success: true, data: story });
  });

  fastify.post('/expire', async (_request, reply) => {
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new StoryService(prisma as never);
    const count = await service.expireStories();

    return reply.send({ success: true, data: { expiredCount: count } });
  });
}
