import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { LiveService, LIVE_TYPES } from '../services/live.service';

// ============================================================================
// QuantMax live-streaming routes (mounted at /live).
//
//   GET  /live            -> active streams
//   POST /live/start      { title, type?, thumbnailUrl?, maxParticipants?, tags? }
//   POST /live/:id/join   -> join (distinct-viewer count)
//   POST /live/:id/leave  -> leave (distinct-viewer count)
//   POST /live/:id/end    -> host ends the stream
//
// All authenticated. Media is delivered client/CDN-side; this owns the record.
// ============================================================================

const startSchema = z.object({
  title: z.string().min(1).max(200),
  type: z.enum(LIVE_TYPES).optional(),
  thumbnailUrl: z.string().url().optional(),
  maxParticipants: z.number().int().min(0).optional(),
  tags: z.array(z.string()).optional(),
});

function requireUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

function buildService(fastify: FastifyInstance): LiveService {
  const prisma = (fastify as unknown as { prisma: unknown }).prisma;
  return new LiveService(prisma as never);
}

export default async function liveRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request, reply) => {
    requireUserId(request);
    const streams = await buildService(fastify).listLive();
    return reply.send({ success: true, data: streams });
  });

  fastify.post('/start', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = startSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const stream = await buildService(fastify).startLive(userId, parsed.data);
    return reply.status(201).send({ success: true, data: stream });
  });

  fastify.post<{ Params: { id: string } }>('/:id/join', async (request, reply) => {
    const userId = requireUserId(request);
    const result = await buildService(fastify).join(request.params.id, userId);
    return reply.send({ success: true, data: result });
  });

  fastify.post<{ Params: { id: string } }>('/:id/leave', async (request, reply) => {
    const userId = requireUserId(request);
    const result = await buildService(fastify).leave(request.params.id, userId);
    return reply.send({ success: true, data: result });
  });

  fastify.post<{ Params: { id: string } }>('/:id/end', async (request, reply) => {
    const userId = requireUserId(request);
    const result = await buildService(fastify).end(request.params.id, userId);
    return reply.send({ success: true, data: result });
  });
}
