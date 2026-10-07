import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ModelRegistry } from '@quant/user-owned-ai';
import { createAppError } from '@quant/server-core';

// Layer 2 type augmentation: expose the decorated user-owned-ai ModelRegistry on
// the Fastify instance. Constructed in buildApp() (per-app lane), decorated after
// agentRuntime (dependsOn). ModelRegistry is the engine's app-level singleton
// (the bring-your-own-model catalog); the per-user BYOMEngine is constructed
// per-request from the caller's identity where needed, not decorated globally.
declare module 'fastify' {
  interface FastifyInstance {
    userOwnedAi: ModelRegistry;
  }
}

const listQuerySchema = z.object({
  provider: z.string().min(1).optional(),
  local: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

const modelParamsSchema = z.object({
  id: z.string().min(1),
});

const compareSchema = z.object({
  modelIds: z.array(z.string().min(1)).min(2).max(20),
});

/**
 * user-owned-ai seam routes (per-app lane), registered under the `/agents/owned`
 * prefix in quantai's buildApp(). The model catalog is read-only and protected by
 * the global auth hook (no extra scope needed for browsing the catalog).
 */
export default async function userOwnedAiRoutes(fastify: FastifyInstance) {
  // GET /agents/owned/models — list available models (optional provider/local filter)
  fastify.get('/models', async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw parsed.error;
    }

    const models = fastify.userOwnedAi.listModels({
      provider: parsed.data.provider,
      local: parsed.data.local,
    });
    return reply.send({ success: true, data: { models } });
  });

  // GET /agents/owned/models/:id — fetch a single model entry
  fastify.get('/models/:id', async (request, reply) => {
    const parsed = modelParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      throw parsed.error;
    }

    const model = fastify.userOwnedAi.getModel(parsed.data.id);
    if (!model) {
      throw createAppError('Model not found', 404, 'NOT_FOUND');
    }

    return reply.send({ success: true, data: model });
  });

  // POST /agents/owned/models/compare — compare a set of models side by side
  fastify.post('/models/compare', async (request, reply) => {
    const parsed = compareSchema.safeParse(request.body);
    if (!parsed.success) {
      throw parsed.error;
    }

    const models = fastify.userOwnedAi.compareModels(parsed.data.modelIds);
    return reply.send({ success: true, data: { models } });
  });
}
