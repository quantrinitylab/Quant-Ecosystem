import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { ChannelService } from '../services/channel.service';

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});

const publishSchema = z.object({
  content: z.string().min(1).max(20000),
});

function userId(request: unknown): string {
  const id = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!id) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  return id;
}

/**
 * QuantChat broadcast-channel routes (mounted at /channels). Telegram-style
 * one-to-many: only OWNER/ADMIN may publish; everyone else subscribes read-only.
 */
export default async function channelsRoutes(fastify: FastifyInstance) {
  function service(): ChannelService {
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    return new ChannelService(prisma as never);
  }

  // GET /channels — the caller's channels (owned + subscribed) with role/canPost.
  fastify.get('/', async (request, reply) => {
    const data = await service().listChannels(userId(request));
    return reply.send({ success: true, data });
  });

  // GET /channels/:id/messages — the channel feed (subscribers only).
  fastify.get<{ Params: { id: string }; Querystring: { limit?: string } }>(
    '/:id/messages',
    async (request, reply) => {
      const limit = request.query.limit ? Number(request.query.limit) : undefined;
      const data = await service().getMessages(
        request.params.id,
        userId(request),
        limit && Number.isFinite(limit) ? limit : undefined,
      );
      return reply.send({ success: true, data });
    },
  );

  // POST /channels — create a channel (caller becomes OWNER).
  fastify.post('/', async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const data = await service().createChannel(userId(request), parsed.data);
    return reply.status(201).send({ success: true, data });
  });

  // POST /channels/:id/subscribe
  fastify.post<{ Params: { id: string } }>('/:id/subscribe', async (request, reply) => {
    const data = await service().subscribe(request.params.id, userId(request));
    return reply.send({ success: true, data });
  });

  // POST /channels/:id/unsubscribe
  fastify.post<{ Params: { id: string } }>('/:id/unsubscribe', async (request, reply) => {
    const data = await service().unsubscribe(request.params.id, userId(request));
    return reply.send({ success: true, data });
  });

  // POST /channels/:id/publish — OWNER/ADMIN only.
  fastify.post<{ Params: { id: string } }>('/:id/publish', async (request, reply) => {
    const parsed = publishSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const message = await service().publish(
      request.params.id,
      userId(request),
      parsed.data.content,
    );
    return reply.status(201).send({ success: true, data: message });
  });

  // GET /channels/:id/subscribers/count
  fastify.get<{ Params: { id: string } }>('/:id/subscribers/count', async (request, reply) => {
    userId(request);
    const count = await service().subscriberCount(request.params.id);
    return reply.send({ success: true, data: { count } });
  });
}
