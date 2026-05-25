import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { AnalyticsService } from '../services/analytics.service';

const dateRangeSchema = z.object({
  start: z.string().optional(),
  end: z.string().optional(),
});

export default async function analyticsRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { campaignId: string } }>(
    '/campaigns/:campaignId/metrics',
    async (request, reply) => {
      const queryResult = dateRangeSchema.safeParse(request.query);
      if (!queryResult.success) {
        throw queryResult.error;
      }

      const prisma = (fastify as unknown as { prisma: unknown }).prisma;
      const service = new AnalyticsService(prisma as never);
      const metrics = await service.getCampaignMetrics(request.params.campaignId);

      return reply.send({ success: true, data: metrics });
    },
  );

  fastify.get('/daily-report', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { date } = request.query as { date?: string };
    const reportDate = date ?? new Date().toISOString().split('T')[0]!;

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new AnalyticsService(prisma as never);
    const report = await service.getDailyReport(userId, reportDate);

    return reply.send({ success: true, data: report });
  });

  fastify.get<{ Params: { campaignId: string } }>(
    '/campaigns/:campaignId/roi',
    async (request, reply) => {
      const prisma = (fastify as unknown as { prisma: unknown }).prisma;
      const service = new AnalyticsService(prisma as never);
      const roi = await service.getROI(request.params.campaignId);

      return reply.send({ success: true, data: roi });
    },
  );
}
