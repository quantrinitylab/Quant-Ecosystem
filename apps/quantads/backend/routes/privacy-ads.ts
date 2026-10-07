import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PrivacyAdServingService } from '../services/privacy-ad-serving.service';
import { PrivacyEnforcerService } from '@quant/privacy-ads';

const candidatesSchema = z.object({
  placement: z.string(),
  pageContent: z.string().optional(),
  targetingMode: z.enum(['contextual', 'behavioral']).default('contextual'),
});

const feedbackSchema = z.object({
  adId: z.string(),
  action: z.enum(['clicked', 'dismissed']),
});

export default async function privacyAdsRoutes(fastify: FastifyInstance) {
  const privacyEnforcer = new PrivacyEnforcerService();

  // Returns ~50 candidates for on-device ranking - NO user profile data.
  // Served from real active campaign inventory; empty when none exists.
  fastify.post('/candidates', async (request, reply) => {
    // Validate inbound request headers for tracking cookies
    const validation = privacyEnforcer.validateRequest(request.headers as Record<string, string>);
    if (!validation.valid) {
      return reply.status(403).send({
        success: false,
        error: 'Privacy violation in request',
        violations: validation.violations,
      });
    }

    const parseResult = candidatesSchema.safeParse(request.body);
    if (!parseResult.success) throw parseResult.error;
    const prisma = (fastify as unknown as { prisma: unknown })
      .prisma as import('../types').PrismaClient | undefined;
    const service = new PrivacyAdServingService(prisma);
    const candidates = await service.getCandidates(parseResult.data);
    return reply.send({ success: true, data: candidates });
  });

  // Receives ONLY aggregate feedback (clicked/dismissed) - never raw user features
  fastify.post('/feedback', async (request, reply) => {
    // Validate inbound request headers for tracking cookies
    const validation = privacyEnforcer.validateRequest(request.headers as Record<string, string>);
    if (!validation.valid) {
      return reply.status(403).send({
        success: false,
        error: 'Privacy violation in request',
        violations: validation.violations,
      });
    }

    const parseResult = feedbackSchema.safeParse(request.body);
    if (!parseResult.success) throw parseResult.error;
    new PrivacyAdServingService().recordFeedback(parseResult.data);
    return reply.send({ success: true });
  });

  // Returns "why this ad" disclosure for a specific ad
  fastify.get('/disclosure/:adId', async (request, reply) => {
    const { adId } = request.params as { adId: string };
    const prisma = (fastify as unknown as { prisma: unknown })
      .prisma as import('../types').PrismaClient | undefined;
    const disclosure = await new PrivacyAdServingService(prisma).getDisclosure(adId);
    return reply.send({ success: true, data: disclosure });
  });
}
