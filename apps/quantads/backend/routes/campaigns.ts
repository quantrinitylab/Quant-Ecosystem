import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';

const createCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  budget: z.number().min(1),
  targetAudience: z.record(z.unknown()),
  startDate: z.string(),
  endDate: z.string(),
});

export default async function campaignsRoutes(fastify: FastifyInstance) {
  const prisma = (fastify as any).prisma;

  fastify.post('/', async (request, reply) => {
    const parseResult = createCampaignSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const campaign = await prisma.campaign.create({
      data: {
        ...parseResult.data,
        createdBy: userId,
        status: 'draft',
      },
    });

    return reply.send(campaign);
  });

  fastify.get('/', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const campaigns = await prisma.campaign.findMany({
      where: { createdBy: userId },
    });

    return reply.send(campaigns);
  });
}
