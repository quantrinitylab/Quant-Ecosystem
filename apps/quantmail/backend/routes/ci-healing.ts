import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  AICIFixService,
  CIFixInputSchema,
  AutoPrInputSchema,
} from '../services/ai-ci-fix.service.js';
import type { AIEngine } from '@quant/ai';

export interface CiHealingRouteOptions {
  aiFixService?: AICIFixService;
}

export default async function ciHealingRoutes(
  fastify: FastifyInstance,
  options?: CiHealingRouteOptions,
): Promise<void> {
  const getAiFixService = (): AICIFixService => {
    if (options?.aiFixService) return options.aiFixService;
    const ai = (fastify as any).ai as AIEngine;
    if (!ai) {
      throw new Error('AIEngine is not registered in Fastify instance');
    }
    return new AICIFixService(ai);
  };

  const requireUser = (request: FastifyRequest, reply: FastifyReply): string | null => {
    const user = (request as any).user;
    if (!user || !user.id) {
      reply.status(401).send({ error: 'Unauthorized', message: 'Authentication required' });
      return null;
    }
    return user.id;
  };

  // POST /api/ci/healing/suggest
  const handleSuggest = async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = requireUser(request, reply);
    if (!userId) return;

    const parsed = CIFixInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parsed.error.issues,
      });
    }

    const service = getAiFixService();
    const result = await service.suggestFix(parsed.data, userId);
    return reply.status(200).send({ success: true, data: result });
  };

  // POST /api/ci/healing/auto-fix
  const handleAutoFix = async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = requireUser(request, reply);
    if (!userId) return;

    const parsed = AutoPrInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parsed.error.issues,
      });
    }

    const service = getAiFixService();
    const result = await service.autoGenerateFixBranchAndPr(parsed.data, userId);
    return reply.status(200).send({ success: true, data: result });
  };

  // GET /api/ci/healing/status/:buildId
  const handleStatus = async (
    request: FastifyRequest<{ Params: { buildId: string } }>,
    reply: FastifyReply,
  ) => {
    const userId = requireUser(request, reply);
    if (!userId) return;

    const { buildId } = request.params;
    return reply.status(200).send({
      success: true,
      data: {
        buildId,
        available: true,
        recommendedAction: 'auto-fix',
      },
    });
  };

  // Mount with both prefixes
  fastify.post('/api/ci/healing/suggest', handleSuggest);
  fastify.post('/ci/healing/suggest', handleSuggest);

  fastify.post('/api/ci/healing/auto-fix', handleAutoFix);
  fastify.post('/ci/healing/auto-fix', handleAutoFix);

  fastify.get('/api/ci/healing/status/:buildId', handleStatus);
  fastify.get('/ci/healing/status/:buildId', handleStatus);
}
