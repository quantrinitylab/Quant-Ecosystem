import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PrivacyAdServingService } from '../services/privacy-ad-serving.service';

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
  const service = new PrivacyAdServingService();

  // Returns ~50 candidates for on-device ranking - NO user profile data
  fastify.post('/candidates', async (request, reply) => {
    const parseResult = candidatesSchema.safeParse(request.body);
    if (!parseResult.success) throw parseResult.error;
    const candidates = service.getCandidates(parseResult.data);
    return reply.send({ success: true, data: candidates });
  });

  // Receives ONLY aggregate feedback (clicked/dismissed) - never raw user features
  fastify.post('/feedback', async (request, reply) => {
    const parseResult = feedbackSchema.safeParse(request.body);
    if (!parseResult.success) throw parseResult.error;
    service.recordFeedback(parseResult.data);
    return reply.send({ success: true });
  });

  // Returns "why this ad" disclosure for a specific ad
  fastify.get('/disclosure/:adId', async (request, reply) => {
    const { adId } = request.params as { adId: string };
    const disclosure = service.getDisclosure(adId);
    return reply.send({ success: true, data: disclosure });
  });
}
