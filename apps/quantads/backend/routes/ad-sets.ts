import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { AdSetService, AD_SET_STATUSES } from '../services/ad-set.service';

const createAdSetSchema = z.object({
  name: z.string().min(1).max(200),
  budget: z.record(z.unknown()).optional(),
  targeting: z.record(z.unknown()).optional(),
  placement: z.array(z.unknown()).optional(),
});

const updateAdSetSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  budget: z.record(z.unknown()).optional(),
  targeting: z.record(z.unknown()).optional(),
  placement: z.array(z.unknown()).optional(),
});

const statusSchema = z.object({
  status: z.enum(AD_SET_STATUSES),
});

function requireUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

/**
 * Ad Set management routes. Registered with an empty prefix so the absolute
 * paths declared here are used verbatim:
 *   POST   /campaigns/:campaignId/ad-sets
 *   GET    /campaigns/:campaignId/ad-sets
 *   PATCH  /ad-sets/:id
 *   POST   /ad-sets/:id/status
 * Ownership is enforced by the service via the parent campaign's advertiserId.
 */
export default async function adSetsRoutes(fastify: FastifyInstance) {
  const prisma = (fastify as unknown as { prisma: unknown }).prisma;
  const service = new AdSetService(prisma as never);

  // Create an ad set under a campaign
  fastify.post<{ Params: { campaignId: string } }>(
    '/campaigns/:campaignId/ad-sets',
    async (request, reply) => {
      const userId = requireUserId(request);
      const parsed = createAdSetSchema.safeParse(request.body);
      if (!parsed.success) {
        throw parsed.error;
      }

      const adSet = await service.createAdSet(userId, request.params.campaignId, parsed.data);
      return reply.status(201).send({ success: true, data: adSet });
    },
  );

  // List ad sets for a campaign
  fastify.get<{ Params: { campaignId: string } }>(
    '/campaigns/:campaignId/ad-sets',
    async (request, reply) => {
      const userId = requireUserId(request);
      const adSets = await service.listAdSets(userId, request.params.campaignId);
      return reply.send({ success: true, data: adSets });
    },
  );

  // Update an ad set
  fastify.patch<{ Params: { id: string } }>('/ad-sets/:id', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = updateAdSetSchema.safeParse(request.body);
    if (!parsed.success) {
      throw parsed.error;
    }

    const updated = await service.updateAdSet(userId, request.params.id, parsed.data);
    return reply.send({ success: true, data: updated });
  });

  // Change ad set status (e.g. activate / pause)
  fastify.post<{ Params: { id: string } }>('/ad-sets/:id/status', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = statusSchema.safeParse(request.body);
    if (!parsed.success) {
      throw parsed.error;
    }

    const updated = await service.setStatus(userId, request.params.id, parsed.data.status);
    return reply.send({ success: true, data: updated });
  });
}
