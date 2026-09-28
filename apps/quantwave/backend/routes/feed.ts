import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { FeedService } from '../services/feed.service';

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(50).optional(),
});

function getService(fastify: FastifyInstance): FeedService {
  const prisma = (fastify as any).prisma;
  return new FeedService(prisma);
}

export default async function feedRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request, reply) => {
    const parseResult = paginationSchema.safeParse(request.query);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth?: { userId?: string } }).auth?.userId ?? '';
    const { page = 1, pageSize = 20 } = parseResult.data;
    const posts = await getService(fastify).getFeed(userId, page, pageSize);

    return reply.send(posts);
  });

  fastify.get('/trending', async (request, reply) => {
    const parseResult = paginationSchema.safeParse(request.query);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const { pageSize = 20 } = parseResult.data;
    const posts = await getService(fastify).getTrendingPosts(pageSize);

    return reply.send(posts);
  });

  // Hashtag feed — browse public posts that use a specific hashtag.
  fastify.get('/hashtag/:tag', async (request, reply) => {
    const parseResult = paginationSchema.safeParse(request.query);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { tag } = request.params as { tag: string };
    const { page = 1, pageSize = 20 } = parseResult.data;
    const posts = await getService(fastify).getPostsByHashtag(tag, page, pageSize);

    return reply.send(posts);
  });

  // QuantSync Verified feed — everyone can VIEW (read-public); only verified
  // accounts can post here (enforced server-side in PostService.createPost).
  fastify.get('/verified', async (request, reply) => {
    const parseResult = paginationSchema.safeParse(request.query);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { page = 1, pageSize = 20 } = parseResult.data;
    const posts = await getService(fastify).getFeed(userId, page, pageSize, 'verified');

    return reply.send(posts);
  });
}
