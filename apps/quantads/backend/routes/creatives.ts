import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { AdCreativeService } from '../services/ad-creative.service';

const creativeTypeSchema = z.enum(['IMAGE', 'VIDEO', 'CAROUSEL', 'COLLECTION']);

const createCreativeSchema = z.object({
  name: z.string().min(1).max(200),
  type: creativeTypeSchema.optional(),
  headline: z.string().max(500).optional(),
  description: z.string().max(2000).optional(),
  mediaUrl: z.string().url().max(2000).optional(),
  callToAction: z.string().max(100).optional(),
  landingUrl: z.string().url().max(2000).optional(),
});

const updateCreativeSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    type: creativeTypeSchema.optional(),
    headline: z.string().max(500).optional(),
    description: z.string().max(2000).optional(),
    mediaUrl: z.string().url().max(2000).optional(),
    callToAction: z.string().max(100).optional(),
    landingUrl: z.string().url().max(2000).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

function requireUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

export default async function creativesRoutes(fastify: FastifyInstance) {
  const prisma = (fastify as unknown as { prisma: unknown }).prisma;
  const service = new AdCreativeService(prisma as never);

  // Create a creative
  fastify.post('/', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = createCreativeSchema.safeParse(request.body);
    if (!parsed.success) {
      throw parsed.error;
    }

    const creative = await service.createCreative(userId, parsed.data);
    return reply.status(201).send({ success: true, data: creative });
  });

  // List creatives for the authenticated advertiser (newest-first)
  fastify.get('/', async (request, reply) => {
    const userId = requireUserId(request);
    const creatives = await service.listCreatives(userId);
    return reply.send({ success: true, data: creatives });
  });

  // Get a single creative (ownership enforced)
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = requireUserId(request);
    const creative = await service.getCreative(userId, request.params.id);
    return reply.send({ success: true, data: creative });
  });

  // Update a creative (ownership enforced)
  fastify.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = updateCreativeSchema.safeParse(request.body);
    if (!parsed.success) {
      throw parsed.error;
    }

    const updated = await service.updateCreative(userId, request.params.id, parsed.data);
    return reply.send({ success: true, data: updated });
  });

  // Delete a creative (ownership enforced)
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = requireUserId(request);
    const result = await service.deleteCreative(userId, request.params.id);
    return reply.send({ success: true, data: result });
  });
}
