import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AdServingService } from '../services/ad-serving.service';
import { ClickFraudService } from '../services/click-fraud.service';

const serveAdSchema = z.object({
  userId: z.string(),
  placement: z.string(),
  demographics: z.record(z.unknown()).optional(),
});

const recordEventSchema = z.object({
  adId: z.string(),
  userId: z.string(),
});

const clickEventSchema = z.object({
  adId: z.string(),
  userId: z.string(),
  deviceFp: z.string().optional(),
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
    const parseResult = clickEventSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const fraud = new ClickFraudService(prisma as never);

    // Assess + durably record the click. Only billable (non-fraud) clicks
    // increment the campaign's chargeable click counter.
    const verdict = await fraud.assessAndRecord({
      adId: parseResult.data.adId,
      userId: parseResult.data.userId,
      ip: request.ip,
      ...(parseResult.data.deviceFp ? { deviceFp: parseResult.data.deviceFp } : {}),
    });

    if (verdict.billable) {
      const service = new AdServingService(prisma as never);
      await service.recordClick(parseResult.data.adId, parseResult.data.userId);
    }

    return reply.send({
      success: true,
      data: { billable: verdict.billable, fraudFlag: verdict.fraudFlag },
    });
  });
}
