import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError, enableIdempotency } from '@quant/server-core';
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

const statusSchema = z.object({
  status: z.enum(['ACTIVE', 'PAUSED']),
});

const listQuerySchema = z.object({
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

export default async function campaignsRoutes(fastify: FastifyInstance) {
  // K4: Idempotency-Key support on campaign create/update (spend commitment).
  enableIdempotency(fastify);

  const prisma = (fastify as unknown as { prisma: unknown }).prisma;
  const service = new CampaignService(prisma as never);

  // Create a campaign
  fastify.post('/', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = createCampaignSchema.safeParse(request.body);
    if (!parsed.success) {
      throw parsed.error;
    }

    const campaign = await service.createCampaign({
      advertiserId: userId,
      name: parsed.data.name,
      objective: parsed.data.objective,
      budget: parsed.data.budget,
      schedule: parsed.data.schedule,
      targeting: parsed.data.targeting,
    });

    return reply.status(201).send({ success: true, data: campaign });
  });

  // List campaigns for the authenticated advertiser (paginated)
  fastify.get('/', async (request, reply) => {
    const userId = requireUserId(request);
    const query = listQuerySchema.safeParse(request.query);
    if (!query.success) {
      throw query.error;
    }

    const result = await service.listCampaigns(userId, {
      page: query.data.page,
      pageSize: query.data.pageSize,
    });

    return reply.send({ success: true, ...result });
  });

  // Advertiser dashboard summary (aggregate across all campaigns)
  fastify.get('/dashboard', async (request, reply) => {
    const userId = requireUserId(request);
    const { data: campaigns } = await service.listCampaigns(userId, { page: 1, pageSize: 1000 });

    const summary = campaigns.reduce(
      (acc, c) => {
        acc.totalSpend += c.totalSpend;
        acc.totalImpressions += c.totalImpressions;
        acc.totalClicks += c.totalClicks;
        acc.totalConversions += c.totalConversions;
        if (c.status === 'ACTIVE') acc.activeCampaigns += 1;
        return acc;
      },
      {
        totalCampaigns: campaigns.length,
        activeCampaigns: 0,
        totalSpend: 0,
        totalImpressions: 0,
        totalClicks: 0,
        totalConversions: 0,
      },
    );

    const ctr = summary.totalImpressions > 0 ? summary.totalClicks / summary.totalImpressions : 0;

    return reply.send({
      success: true,
      data: {
        ...summary,
        ctr,
        recentCampaigns: campaigns.slice(0, 5),
      },
    });
  });

  // Get a single campaign (ownership enforced)
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = requireUserId(request);
    const campaign = await service.getCampaign(request.params.id);
    if (campaign.advertiserId !== userId) {
      throw createAppError('Campaign not found', 404, 'CAMPAIGN_NOT_FOUND');
    }
    return reply.send({ success: true, data: campaign });
  });

  // Update a campaign (ownership enforced)
  fastify.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = updateCampaignSchema.safeParse(request.body);
    if (!parsed.success) {
      throw parsed.error;
    }

    const existing = await service.getCampaign(request.params.id);
    if (existing.advertiserId !== userId) {
      throw createAppError('Campaign not found', 404, 'CAMPAIGN_NOT_FOUND');
    }

    const updated = await service.updateCampaign(request.params.id, parsed.data);
    return reply.send({ success: true, data: updated });
  });

  // Change campaign status (activate / pause / resume)
  fastify.put<{ Params: { id: string } }>('/:id/status', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = statusSchema.safeParse(request.body);
    if (!parsed.success) {
      throw parsed.error;
    }

    const existing = await service.getCampaign(request.params.id);
    if (existing.advertiserId !== userId) {
      throw createAppError('Campaign not found', 404, 'CAMPAIGN_NOT_FOUND');
    }

    let updated;
    if (parsed.data.status === 'PAUSED') {
      updated = await service.pauseCampaign(request.params.id);
    } else if (existing.status === 'PAUSED') {
      updated = await service.resumeCampaign(request.params.id);
    } else {
      updated = await service.activateCampaign(request.params.id);
    }

    return reply.send({ success: true, data: updated });
  });

  // Campaign stats
  fastify.get<{ Params: { id: string } }>('/:id/stats', async (request, reply) => {
    const userId = requireUserId(request);
    const existing = await service.getCampaign(request.params.id);
    if (existing.advertiserId !== userId) {
      throw createAppError('Campaign not found', 404, 'CAMPAIGN_NOT_FOUND');
    }
    const stats = await service.getCampaignStats(request.params.id);
    return reply.send({ success: true, data: stats });
  });

  // Delete (soft) a campaign (ownership enforced)
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = requireUserId(request);
    const existing = await service.getCampaign(request.params.id);
    if (existing.advertiserId !== userId) {
      throw createAppError('Campaign not found', 404, 'CAMPAIGN_NOT_FOUND');
    }
    await service.deleteCampaign(request.params.id);
    return reply.send({ success: true });
  });
}
