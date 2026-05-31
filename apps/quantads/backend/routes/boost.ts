import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { CoinWallet, SelfBoostEngine, BoostPackRegistry } from '@quant/quant-economy';

const activateBoostSchema = z.object({
  userId: z.string().min(1),
  postId: z.string().min(1),
  packId: z.string().min(1),
});

export default async function boostRoutes(fastify: FastifyInstance) {
  const wallet = new CoinWallet();
  const packRegistry = new BoostPackRegistry();
  const boostEngine = new SelfBoostEngine(wallet, packRegistry);

  fastify.get('/packs', async (_request, reply) => {
    const packs = packRegistry.getAllPacks();
    return reply.send({ success: true, data: packs });
  });

  fastify.post('/activate', async (request, reply) => {
    const parseResult = activateBoostSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const { userId, postId, packId } = parseResult.data;

    try {
      const result = boostEngine.boostPost(userId, postId, packId);
      if (!result.success) {
        throw createAppError(result.message ?? 'Boost failed', 400, 'BOOST_FAILED');
      }
      return reply.status(201).send({ success: true, data: result.boost });
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'statusCode' in e) throw e;
      const message = e instanceof Error ? e.message : 'Boost activation failed';
      throw createAppError(message, 400, 'BOOST_FAILED');
    }
  });

  fastify.get<{ Params: { boostId: string } }>('/analytics/:boostId', async (request, reply) => {
    try {
      const analytics = boostEngine.getBoostAnalytics(request.params.boostId);
      if (!analytics) {
        throw createAppError('Boost not found', 404, 'BOOST_NOT_FOUND');
      }
      return reply.send({ success: true, data: analytics });
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'statusCode' in e) throw e;
      const message = e instanceof Error ? e.message : 'Failed to get analytics';
      throw createAppError(message, 400, 'ANALYTICS_FETCH_FAILED');
    }
  });

  fastify.get<{ Params: { userId: string } }>('/active/:userId', async (request, reply) => {
    try {
      const boost = boostEngine.getBoost(request.params.userId);
      const boosts = boost ? [boost] : [];
      return reply.send({ success: true, data: boosts });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to get active boosts';
      throw createAppError(message, 400, 'ACTIVE_BOOSTS_FETCH_FAILED');
    }
  });
}
