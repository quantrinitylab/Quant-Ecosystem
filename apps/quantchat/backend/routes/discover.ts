// ============================================================================
// QuantChat - Discover Routes (QC-F-077)
// ============================================================================
//
//   GET  /discover                                "For You" feed (channel posts + reels)
//   GET  /discover/trending                       Reels ranked by real engagement
//   GET  /discover/publishers                     Broadcast channels as publishers
//   POST /discover/publishers/:id/subscribe       Real channel subscription
//
// These routes are the backend the shipped /discover page always called;
// until now none of them existed (every call 404'd and Subscribe faked a
// local +1). All data comes from DiscoverService over real rows — channels,
// memberships, messages, reels — and every route requires an authenticated
// caller (401 fail-closed, same shape as the channels routes).
// ============================================================================

import type { FastifyInstance } from 'fastify';
import { createAppError } from '@quant/server-core';
import { DiscoverService, DISCOVER_CATEGORIES } from '../services/discover.service';

function userId(request: unknown): string {
  const id = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!id) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  return id;
}

export default async function discoverRoutes(fastify: FastifyInstance) {
  function service(): DiscoverService {
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    return new DiscoverService(prisma as never);
  }

  // GET /discover — merged feed; ?category= filters to sources whose
  // metadata really carries that category (never a relabelled guess).
  fastify.get<{ Querystring: { category?: string } }>('/', async (request, reply) => {
    const callerId = userId(request);
    const raw = request.query.category?.trim();
    let category: string | undefined;
    if (raw) {
      if (!(DISCOVER_CATEGORIES as readonly string[]).includes(raw)) {
        throw createAppError('Unknown discover category', 400, 'INVALID_CATEGORY');
      }
      category = raw;
    }
    const data = await service().getFeed(callerId, category);
    return reply.send({ success: true, data });
  });

  // GET /discover/trending — engagement-ranked reels (real counters only).
  fastify.get('/trending', async (request, reply) => {
    const data = await service().getTrending(userId(request));
    return reply.send({ success: true, data });
  });

  // GET /discover/publishers — broadcast channels with real counts.
  fastify.get('/publishers', async (request, reply) => {
    const data = await service().listPublishers(userId(request));
    return reply.send({ success: true, data });
  });

  // POST /discover/publishers/:id/subscribe — idempotent real subscription;
  // the response carries the real subscriber count for the client to render.
  fastify.post<{ Params: { id: string } }>(
    '/publishers/:id/subscribe',
    async (request, reply) => {
      const data = await service().subscribe(userId(request), request.params.id);
      return reply.send({ success: true, data });
    },
  );
}
