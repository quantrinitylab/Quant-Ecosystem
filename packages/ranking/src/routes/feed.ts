// ============================================================================
// Feed Routes - Fastify plugin for feed ranking endpoints
// ============================================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AlgorithmType } from '../types.js';
import type { FeedService } from '../feed-service.js';
import type { UserPreferenceService } from '../user-preference.service.js';

const feedQuerySchema = z.object({
  feedId: z.string().min(1),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

const switchAlgorithmSchema = z.object({
  feedId: z.string().min(1),
  algorithm: z.nativeEnum(AlgorithmType),
  customPluginId: z.string().optional(),
});

export interface FeedRouteDeps {
  feedService: FeedService;
  preferenceService: UserPreferenceService;
}

export default function feedRoutes(deps: FeedRouteDeps) {
  return async function (fastify: FastifyInstance) {
    fastify.get('/feed', async (request: FastifyRequest, reply: FastifyReply) => {
      const queryResult = feedQuerySchema.safeParse(request.query);
      if (!queryResult.success) {
        return reply.status(400).send({ success: false, error: queryResult.error.format() });
      }

      const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
      if (!userId) {
        return reply.status(401).send({ success: false, error: 'Authentication required' });
      }

      const { feedId, page, pageSize } = queryResult.data;
      const response = deps.feedService.getFeed({ userId, feedId, page, pageSize });

      return reply.send({ success: true, data: response });
    });

    fastify.put('/feed/algorithm', async (request: FastifyRequest, reply: FastifyReply) => {
      const parseResult = switchAlgorithmSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({ success: false, error: parseResult.error.format() });
      }

      const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
      if (!userId) {
        return reply.status(401).send({ success: false, error: 'Authentication required' });
      }

      const { feedId, algorithm, customPluginId } = parseResult.data;
      deps.preferenceService.setPreference(userId, feedId, algorithm, customPluginId);

      return reply.send({
        success: true,
        data: { userId, feedId, algorithm, customPluginId },
      });
    });
  };
}
