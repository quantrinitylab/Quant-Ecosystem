import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { CampaignService } from '../services/campaign.service';

const createCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  objective: z
    .enum(['AWARENESS', 'TRAFFIC', 'ENGAGEMENT', 'LEADS', 'CONVERSIONS', 'APP_INSTALLS'])
    .optional(),
  budget: z.record(z.unknown()).optional(),
  schedule: z.record(z.unknown()).optional(),
  targeting: z.record(z.unknown()).optional(),
});

const updateCampaignSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  objective: z
    .enum(['AWARENESS', 'TRAFFIC', 'ENGAGEMENT', 'LEADS', 'CONVERSIONS', 'APP_INSTALLS'])
    .optional(),
  budget: z.record(z.unknown()).optional(),
  schedule: z.record(z.unknown()).optional(),
  targeting: z.record(z.unknown()).optional(),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export default async function campaignsRoutes(fastify: FastifyInstance) {
  fastify.post('/', async (request, reply) => {
    const parseResult = createCampaignSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new CampaignService(prisma as never);
    const campaign = await service.createCampaign({ ...parseResult.data, advertiserId: userId });

    return reply.status(201).send({ success: true, data: campaign });
  });

  fastify.get('/', async (request, reply) => {
    const queryResult = paginationSchema.safeParse(request.query);
    if (!queryResult.success) {
      throw queryResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new CampaignService(prisma as never);
    const result = await service.listCampaigns(userId, queryResult.data);

    return reply.send({ success: true, data: result });
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new CampaignService(prisma as never);
    const campaign = await service.getCampaign(request.params.id);

    return reply.send({ success: true, data: campaign });
  });

  fastify.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const parseResult = updateCampaignSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new CampaignService(prisma as never);
    const campaign = await service.updateCampaign(request.params.id, parseResult.data);

    return reply.send({ success: true, data: campaign });
  });

  fastify.post<{ Params: { id: string } }>('/:id/activate', async (request, reply) => {
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new CampaignService(prisma as never);
    const campaign = await service.activateCampaign(request.params.id);

    return reply.send({ success: true, data: campaign });
  });

  fastify.post<{ Params: { id: string } }>('/:id/pause', async (request, reply) => {
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new CampaignService(prisma as never);
    const campaign = await service.pauseCampaign(request.params.id);

    return reply.send({ success: true, data: campaign });
  });

  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new CampaignService(prisma as never);
    const campaign = await service.deleteCampaign(request.params.id);

    return reply.send({ success: true, data: campaign });
  });

  fastify.get<{ Params: { id: string } }>('/:id/stats', async (request, reply) => {
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new CampaignService(prisma as never);
    const stats = await service.getCampaignStats(request.params.id);

    return reply.send({ success: true, data: stats });
  });
}
