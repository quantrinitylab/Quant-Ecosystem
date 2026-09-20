import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { FeedService } from '../services/feed.service';
import { PostService } from '../services/post.service';

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(50).optional(),
});

/**
 * Batched feed impressions. The client reports what scrolled into view, so this takes a list
 * rather than one id per request. Capped to bound a single write.
 */
const engagementSchema = z.object({
  postIds: z.array(z.string().min(1)).min(1).max(100),
  event: z.enum(['view', 'impression']).optional(),
});

export default async function feedRoutes(fastify: FastifyInstance) {
  const prisma = (fastify as any).prisma;
  const feedService = new FeedService(prisma);

  fastify.get('/', async (request, reply) => {
    const parseResult = paginationSchema.safeParse(request.query);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { page = 1, pageSize = 20 } = parseResult.data;
    const posts = await feedService.getFeed(userId, page, pageSize);

    return reply.send(posts);
  });

  fastify.get('/trending', async (request, reply) => {
    const parseResult = paginationSchema.safeParse(request.query);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const { pageSize = 20 } = parseResult.data;
    const posts = await feedService.getTrendingPosts(pageSize);

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
    const posts = await feedService.getPostsByHashtag(tag, page, pageSize);

    return reply.send(posts);
  });

  // Impression telemetry for the feed. Unknown/deleted ids are skipped rather than failing
  // the batch — telemetry must never break a scroll.
  fastify.post('/engagement', async (request, reply) => {
    const parseResult = engagementSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const postService = new PostService(prisma as never);
    const result = await postService.recordEngagement(
      parseResult.data.postIds,
      parseResult.data.event,
    );

    return reply.send({ success: true, data: result });
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
    const posts = await feedService.getFeed(userId, page, pageSize, 'verified');

    return reply.send(posts);
  });
}
