// ============================================================================
// QuantWave Orange Proximity Radar & Swipe Fastify Routes
// ============================================================================

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { ProximityRadarService } from '../services/proximity-radar.service';

const nearbyQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().positive().optional(),
  maxResults: z.coerce.number().int().positive().optional(),
  interests: z.string().optional(),
});

const swipeBodySchema = z.object({
  targetUserId: z.string().min(1),
  action: z.enum(['like', 'pass', 'superlike']),
});

// Identity comes ONLY from the verified auth context installed by the global
// auth hook (Authorization: Bearer <verified JWT>). There is deliberately no
// fallback to a client-supplied identity header: accepting one lets any caller
// impersonate any user on /radar/swipe and /radar/nearby. Fail closed.
function requireUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

export default async function radarRoutes(fastify: FastifyInstance) {
  fastify.get('/nearby', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = nearbyQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw parsed.error;
    }

    const { lat, lon, radiusKm, maxResults, interests } = parsed.data;
    const interestFilter = interests
      ? interests
          .split(',')
          .map((i) => i.trim())
          .filter(Boolean)
      : undefined;

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new ProximityRadarService(prisma as any);

    const users = await service.findNearbyUsers(
      userId,
      { lat, lon },
      { radiusKm, maxResults, interestFilter },
    );
    return reply.send({ success: true, data: { users } });
  });

  fastify.post('/swipe', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = swipeBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw parsed.error;
    }

    const { targetUserId, action } = parsed.data;

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new ProximityRadarService(prisma as any);

    const result = await service.recordSwipe(userId, targetUserId, action);
    return reply.send({ success: true, data: result });
  });
}
