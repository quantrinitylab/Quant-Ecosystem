import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AdServingService } from '../services/ad-serving.service';

const serveAdSchema = z.object({
  userId: z.string(),
  placement: z.string(),
  demographics: z.record(z.unknown()).optional(),
});

const recordEventSchema = z.object({
  adId: z.string(),
  userId: z.string(),
});

export default async function servingRoutes(fastify: FastifyInstance) {
  fastify.post('/serve', async (request, reply) => {
    const parseResult = serveAdSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new AdServingService(prisma as never);
    const ad = await service.serveAd(parseResult.data);

    return reply.send({ success: true, data: ad });
  });

  fastify.post('/impression', async (request, reply) => {
    const parseResult = recordEventSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new AdServingService(prisma as never);
    await service.recordImpression(parseResult.data.adId, parseResult.data.userId);

    return reply.send({ success: true });
  });

  fastify.post('/click', async (request, reply) => {
    const parseResult = recordEventSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new AdServingService(prisma as never);
    await service.recordClick(parseResult.data.adId, parseResult.data.userId);

    return reply.send({ success: true });
  });
}
