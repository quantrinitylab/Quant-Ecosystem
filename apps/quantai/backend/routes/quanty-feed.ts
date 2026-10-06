// ============================================================================
// QuantAI — Fastify Routes: Quanty Feed (Q8)
//
// Personalized feed: instructions, paginated posts, like/dislike reactions,
// discuss (chat context), and manual generation trigger.
// Mounted at /quanty/feed (see backend/app.ts).
// ============================================================================

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import {
  QuantyFeedService,
  FeedValidationError,
  FEED_REACTION_LIKE,
  FEED_REACTION_DISLIKE,
  type FeedPrisma,
  type FeedReactionKind,
} from '../services/quanty-feed.service';
import { FeedGeneratorService } from '../services/feed-generator.service';

const instructionsSchema = z.object({
  prompt: z.string().min(1).max(2000),
});

const feedQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const reactSchema = z.object({
  kind: z.enum([FEED_REACTION_LIKE, FEED_REACTION_DISLIKE]),
});

function getUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

function getPrisma(fastify: FastifyInstance): FeedPrisma {
  const prisma = (fastify as unknown as { prisma?: FeedPrisma }).prisma;
  if (!prisma) {
    throw createAppError('Database unavailable', 503, 'DB_UNAVAILABLE');
  }
  return prisma;
}

function toAppError(err: unknown): never {
  if (err instanceof FeedValidationError) {
    throw createAppError(err.message, 400, err.code);
  }
  throw err;
}

export default async function quantyFeedRoutes(fastify: FastifyInstance) {
  const service = () => new QuantyFeedService(getPrisma(fastify));

  // GET /quanty/feed/instructions — current feed instruction prompt (or null).
  fastify.get('/instructions', async (request, reply) => {
    const userId = getUserId(request);
    const record = await service().getInstructions(userId);
    return reply.send({ success: true, data: record });
  });

  // PUT /quanty/feed/instructions — save/replace the prompt.
  fastify.put('/instructions', async (request, reply) => {
    const userId = getUserId(request);
    const parsed = instructionsSchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError('Invalid instructions payload', 400, 'INVALID_INPUT');
    }
    try {
      const record = await service().saveInstructions(userId, parsed.data.prompt);
      return reply.send({ success: true, data: record });
    } catch (err) {
      toAppError(err);
    }
  });

  // GET /quanty/feed?page=&limit= — paginated posts, newest first.
  fastify.get('/', async (request, reply) => {
    const userId = getUserId(request);
    const parsed = feedQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw createAppError('Invalid pagination params', 400, 'INVALID_INPUT');
    }
    const page = await service().getFeed(userId, parsed.data.page ?? 1, parsed.data.limit ?? 20);
    return reply.send({ success: true, data: page });
  });

  // POST /quanty/feed/:id/react — like/dislike toggle (same kind twice removes).
  fastify.post('/:id/react', async (request, reply) => {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };
    const parsed = reactSchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError('Invalid reaction payload', 400, 'INVALID_INPUT');
    }
    try {
      const result = await service().react(userId, id, parsed.data.kind as FeedReactionKind);
      return reply.send({ success: true, data: result });
    } catch (err) {
      toAppError(err);
    }
  });

  // POST /quanty/feed/:id/discuss — chat context for discussing a post.
  // The frontend opens the chat with openingPrompt as the starting context.
  fastify.post('/:id/discuss', async (request, reply) => {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };
    try {
      const context = await service().getDiscussContext(userId, id);
      return reply.send({ success: true, data: context });
    } catch (err) {
      toAppError(err);
    }
  });

  // POST /quanty/feed/generate — manually trigger brief generation from
  // the user's instructions. All generated posts are provenance
  // 'agent_brief' (labeled "Quanty brief" in the UI). Scheduled runs call
  // FeedGeneratorService directly on the same schedule registry.
  fastify.post('/generate', async (request, reply) => {
    const userId = getUserId(request);
    const aiEngine = (fastify as unknown as { aiEngine?: { infer: (r: unknown) => Promise<{ content: string }> } })
      .aiEngine;
    if (!aiEngine) {
      throw createAppError('AI engine unavailable', 503, 'AI_UNAVAILABLE');
    }
    const generator = new FeedGeneratorService(getPrisma(fastify), (r) =>
      aiEngine.infer(r as never),
    );
    const result = await generator.generateForUser(userId, 3);
    return reply.send({ success: true, data: result });
  });
}
