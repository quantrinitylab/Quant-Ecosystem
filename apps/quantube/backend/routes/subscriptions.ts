import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { ChannelService } from '../services/channel.service';

// ============================================================================
// QuantTube subscriptions routes (mounted at /subscriptions).
//
//   GET /subscriptions       -> the channels the caller is subscribed to
//   GET /subscriptions/feed  -> recent public videos from those channels
//
// Both are authenticated (the global auth hook rejects anonymous callers) and
// strictly user-scoped: a caller only ever sees their own subscriptions.
// ============================================================================

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

function requireUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

export default async function subscriptionsRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = paginationSchema.safeParse(request.query);
    if (!parsed.success) {
      throw parsed.error;
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new ChannelService(prisma as never);
    const result = await service.getSubscriptions(userId, parsed.data);

    return reply.send({ success: true, data: result });
  });

  fastify.get('/feed', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = paginationSchema.safeParse(request.query);
    if (!parsed.success) {
      throw parsed.error;
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new ChannelService(prisma as never);
    const result = await service.getSubscriptionFeed(userId, parsed.data);

    return reply.send({ success: true, data: result });
  });
}
