import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import {
  EffectsService,
  EffectNotFoundError,
  EFFECT_CATEGORIES,
} from '../services/effects.service';

// ============================================================================
// QuantEdit effects routes (mounted at /effects).
//
//   GET /effects                 -> catalog (+ ?category, ?search, ?premium)
//   GET /effects/categories      -> category list with counts
//   GET /effects/:id             -> a single effect
// ============================================================================

const service = new EffectsService();

const listSchema = z.object({
  category: z.enum(EFFECT_CATEGORIES as [string, ...string[]]).optional(),
  search: z.string().max(100).optional(),
  premium: z.enum(['only', 'free']).optional(),
});

export default async function effectsRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request, reply) => {
    const parsed = listSchema.safeParse(request.query);
    if (!parsed.success) throw parsed.error;
    const { category, search, premium } = parsed.data;
    const effects = service.listEffects({
      category: category as never,
      search,
      premiumOnly: premium === 'only',
      freeOnly: premium === 'free',
    });
    return reply.send({ success: true, data: { effects } });
  });

  fastify.get('/categories', async (_request, reply) => {
    return reply.send({ success: true, data: { categories: service.getCategories() } });
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      return reply.send({ success: true, data: { effect: service.getEffect(request.params.id) } });
    } catch (err) {
      if (err instanceof EffectNotFoundError) throw createAppError(err.message, 404, 'NOT_FOUND');
      throw err;
    }
  });
}
