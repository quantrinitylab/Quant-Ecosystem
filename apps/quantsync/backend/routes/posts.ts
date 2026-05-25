import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { PostService } from '../services/post.service';

const createPostSchema = z.object({
  content: z.string().min(1).max(50000),
  type: z
    .enum(['TEXT', 'IMAGE', 'VIDEO', 'POLL', 'LINK', 'REPOST', 'THREAD', 'ARTICLE'])
    .optional(),
  mediaUrls: z.array(z.unknown()).optional(),
  hashtags: z.array(z.string()).optional(),
  mentions: z.array(z.string()).optional(),
  replyToId: z.string().optional(),
  communityId: z.string().optional(),
  visibility: z.enum(['PUBLIC', 'FOLLOWERS_ONLY', 'PRIVATE', 'COMMUNITY_ONLY']).optional(),
});

const updatePostSchema = z.object({
  content: z.string().min(1).max(50000).optional(),
  mediaUrls: z.array(z.unknown()).optional(),
  hashtags: z.array(z.string()).optional(),
  mentions: z.array(z.string()).optional(),
  visibility: z.enum(['PUBLIC', 'FOLLOWERS_ONLY', 'PRIVATE', 'COMMUNITY_ONLY']).optional(),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export default async function postsRoutes(fastify: FastifyInstance) {
  fastify.post('/', async (request, reply) => {
    const parseResult = createPostSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new PostService(prisma as never);
    const post = await service.createPost({ ...parseResult.data, userId });

    return reply.status(201).send({ success: true, data: post });
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new PostService(prisma as never);
    const post = await service.getPost(request.params.id);

    return reply.send({ success: true, data: post });
  });

  fastify.get('/user/:userId', async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const queryResult = paginationSchema.safeParse(request.query);
    if (!queryResult.success) {
      throw queryResult.error;
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new PostService(prisma as never);
    const result = await service.listByUser(userId, queryResult.data);

    return reply.send({ success: true, data: result });
  });

  fastify.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const parseResult = updatePostSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new PostService(prisma as never);
    const post = await service.updatePost(request.params.id, userId, parseResult.data);

    return reply.send({ success: true, data: post });
  });

  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new PostService(prisma as never);
    const post = await service.deletePost(request.params.id, userId);

    return reply.send({ success: true, data: post });
  });

  fastify.post<{ Params: { id: string } }>('/:id/like', async (request, reply) => {
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new PostService(prisma as never);
    const post = await service.likePost(request.params.id);

    return reply.send({ success: true, data: post });
  });

  fastify.post<{ Params: { id: string } }>('/:id/repost', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new PostService(prisma as never);
    const post = await service.repost(request.params.id, userId);

    return reply.status(201).send({ success: true, data: post });
  });
}
