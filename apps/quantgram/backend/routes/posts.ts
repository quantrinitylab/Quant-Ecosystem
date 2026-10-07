import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { PostService } from '../services/post.service';
import { ExploreService } from '../services/explore.service';

const createPostSchema = z.object({
  caption: z.string().max(2200).optional(),
  mediaUrls: z.array(z.string()).optional(),
  hashtags: z.array(z.string()).optional(),
  type: z.enum(['IMAGE', 'VIDEO', 'CAROUSEL']).optional(),
  visibility: z.enum(['PUBLIC', 'FOLLOWERS_ONLY', 'PRIVATE']).optional(),
});

const commentSchema = z.object({
  text: z.string().min(1).max(2200),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

function getUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

function getService(fastify: FastifyInstance): PostService {
  const prisma = (fastify as unknown as { prisma: unknown }).prisma;
  return new PostService(prisma as never);
}

export default async function postsRoutes(fastify: FastifyInstance) {
  fastify.post('/', async (request, reply) => {
    const parsed = createPostSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const userId = getUserId(request);

    const post = await getService(fastify).createPost({ ...parsed.data, userId });
    return reply.status(201).send({ success: true, data: { post } });
  });

  fastify.get('/feed', async (request, reply) => {
    const userId = (request as { auth?: { userId?: string } }).auth?.userId;
    const query = paginationSchema.safeParse(request.query);
    if (!query.success) throw query.error;

    if (!userId) {
      // Unauthenticated guest: return explore discovery posts
      const exploreService = new ExploreService(
        (fastify as unknown as { prisma: unknown }).prisma as never,
      );
      const discoveryPosts = await exploreService.getDiscovery('');
      return reply.send({
        success: true,
        data: {
          posts: discoveryPosts,
          page: 1,
          pageSize: discoveryPosts.length,
          total: discoveryPosts.length,
          hasMore: false,
        },
      });
    }

    const result = await getService(fastify).getFeed(userId, query.data);
    return reply.send({ success: true, data: result });
  });

  fastify.get('/saved', async (request, reply) => {
    const userId = getUserId(request);
    const query = paginationSchema.safeParse(request.query);
    if (!query.success) throw query.error;

    const result = await getService(fastify).getSavedPosts(userId, query.data);
    return reply.send({ success: true, data: result });
  });

  fastify.get<{ Params: { userId: string } }>('/user/:userId', async (request, reply) => {
    const viewerId = (request as { auth?: { userId?: string } }).auth?.userId ?? '';
    const query = paginationSchema.safeParse(request.query);
    if (!query.success) throw query.error;

    const result = await getService(fastify).getUserPosts(
      request.params.userId,
      viewerId,
      query.data,
    );
    return reply.send({ success: true, data: result });
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const viewerId = (request as { auth?: { userId?: string } }).auth?.userId ?? '';
    const post = await getService(fastify).getPost(request.params.id, viewerId);
    return reply.send({ success: true, data: { post } });
  });

  fastify.get<{ Params: { id: string } }>('/:id/comments', async (request, reply) => {
    const comments = await getService(fastify).getComments(request.params.id);
    return reply.send({ success: true, data: { comments } });
  });

  fastify.post<{ Params: { id: string } }>('/:id/like', async (request, reply) => {
    const userId = getUserId(request);
    const result = await getService(fastify).toggleLike(request.params.id, userId);
    return reply.send({ success: true, data: result });
  });

  fastify.post<{ Params: { id: string } }>('/:id/save', async (request, reply) => {
    const userId = getUserId(request);
    const result = await getService(fastify).toggleSave(request.params.id, userId);
    return reply.send({ success: true, data: result });
  });

  fastify.post<{ Params: { id: string } }>('/:id/comment', async (request, reply) => {
    const userId = getUserId(request);
    const parsed = commentSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;

    const comment = await getService(fastify).addComment(
      request.params.id,
      userId,
      parsed.data.text,
    );
    return reply.status(201).send({ success: true, data: { comment } });
  });
}
